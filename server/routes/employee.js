import express from 'express';
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabaseClient.js';
import { normalizeRole } from '../lib/auth.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

const SALES_ROLES = new Set(['SALES', 'ADMIN', 'SUPERADMIN']);
const CATEGORY_IMAGE_BUCKET = 'avatars';
const CATEGORY_IMAGE_LEVELS = new Set(['head', 'sub', 'micro']);
const CATEGORY_IMAGE_MIN_BYTES = 100 * 1024; // 100KB
const CATEGORY_IMAGE_MAX_BYTES = 800 * 1024; // 800KB

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const safeNum = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0);

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const pctChange = (current, prev) => {
  const c = safeNum(current);
  const p = safeNum(prev);
  if (p <= 0) return null;
  return Math.round(((c - p) / p) * 100);
};

const fmtINR = (amount) => {
  const n = safeNum(amount);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `Rs ${Math.round(n).toLocaleString('en-IN')}`;
  }
};

const parseDataUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.startsWith('data:')) {
    const match = raw.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) return null;
    return { mime: match[1], base64: match[2] };
  }
  return { mime: null, base64: raw };
};

const sanitizeSlug = (value = '') =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'category';

const sanitizeFilename = (value = '') =>
  String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^_+/, '')
    .slice(0, 120) || 'image';

const hasSalesAccess = (authRole, employeeRole) => {
  const a = normalizeRole(authRole || '');
  const e = normalizeRole(employeeRole || '');
  return SALES_ROLES.has(a) || SALES_ROLES.has(e);
};

async function resolveEmployeeProfile(authUser) {
  const userId = String(authUser?.id || '').trim();
  const email = String(authUser?.email || '').trim().toLowerCase();

  let employee = null;
  const { data: byId } = await supabase
    .from('employees')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (byId) employee = byId;

  if (!employee && email) {
    const { data: byEmail } = await supabase
      .from('employees')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    if (byEmail) employee = byEmail;
  }

  if (employee?.id && userId && employee.user_id !== userId) {
    await supabase
      .from('employees')
      .update({ user_id: userId })
      .eq('id', employee.id);
    employee.user_id = userId;
  }

  return employee || null;
}

async function sumRevenueByPeriod({ startIso, endIso, endInclusive = true }) {
  let byPurchaseDate = supabase
    .from('lead_purchases')
    .select('amount, purchase_date');

  byPurchaseDate = byPurchaseDate.gte('purchase_date', startIso);
  byPurchaseDate = endInclusive
    ? byPurchaseDate.lte('purchase_date', endIso)
    : byPurchaseDate.lt('purchase_date', endIso);

  let { data, error } = await byPurchaseDate;

  // Legacy schema fallback: purchase_date column may not exist.
  const errText = String(error?.message || '').toLowerCase();
  if (error && (error?.code === '42703' || errText.includes('purchase_date'))) {
    let byCreatedAt = supabase
      .from('lead_purchases')
      .select('amount, created_at')
      .gte('created_at', startIso);
    byCreatedAt = endInclusive
      ? byCreatedAt.lte('created_at', endIso)
      : byCreatedAt.lt('created_at', endIso);

    ({ data, error } = await byCreatedAt);
  }

  if (error) throw new Error(error.message || 'Failed to load revenue');

  return safeNum((data || []).reduce((sum, row) => sum + safeNum(row?.amount), 0));
}

router.get('/me', requireAuth(), async (req, res) => {
  try {
    const authUser = req.user;
    const employee = await resolveEmployeeProfile(authUser);

    if (!employee) {
      return res.status(404).json({ success: false, error: 'Employee profile not found' });
    }

    return res.json({
      success: true,
      employee: {
        ...employee,
        user_id: authUser.id || employee.user_id || null,
        role: normalizeRole(employee.role || 'UNKNOWN'),
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Failed to resolve employee profile' });
  }
});

router.post('/category-image-upload', requireAuth(), async (req, res) => {
  try {
    const employee = await resolveEmployeeProfile(req.user);
    if (!employee) {
      return res.status(404).json({ success: false, error: 'Employee profile not found' });
    }

    const level = String(req.body?.level || '').trim().toLowerCase();
    if (!CATEGORY_IMAGE_LEVELS.has(level)) {
      return res.status(400).json({ success: false, error: 'Invalid category level' });
    }

    const slug = sanitizeSlug(req.body?.slug || 'category');
    const dataUrl = String(req.body?.data_url || req.body?.dataUrl || '').trim();
    const originalName = sanitizeFilename(req.body?.file_name || req.body?.fileName || '');
    const explicitType = String(req.body?.content_type || req.body?.contentType || '').trim();

    if (!dataUrl) {
      return res.status(400).json({ success: false, error: 'data_url is required' });
    }

    const parsed = parseDataUrl(dataUrl);
    if (!parsed?.base64) {
      return res.status(400).json({ success: false, error: 'Invalid base64 payload' });
    }

    const contentType = explicitType || parsed.mime || 'application/octet-stream';
    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ success: false, error: 'Only image uploads are allowed' });
    }

    const buffer = Buffer.from(parsed.base64, 'base64');
    if (!buffer?.length) {
      return res.status(400).json({ success: false, error: 'Empty upload payload' });
    }
    if (buffer.length < CATEGORY_IMAGE_MIN_BYTES) {
      return res.status(400).json({
        success: false,
        error: `Image must be at least ${Math.round(CATEGORY_IMAGE_MIN_BYTES / 1024)}KB`,
      });
    }
    if (buffer.length > CATEGORY_IMAGE_MAX_BYTES) {
      return res.status(413).json({
        success: false,
        error: `Image must be at most ${Math.round(CATEGORY_IMAGE_MAX_BYTES / 1024)}KB`,
      });
    }

    const extFromMime = MIME_EXT[contentType] || 'png';
    const hasExt = originalName.includes('.');
    const ext = hasExt ? originalName.split('.').pop() : extFromMime;
    const objectPath = `category-images/${level}/${slug}-${Date.now()}-${randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(CATEGORY_IMAGE_BUCKET)
      .upload(objectPath, buffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      return res.status(500).json({ success: false, error: uploadError.message || 'Upload failed' });
    }

    const { data } = supabase.storage.from(CATEGORY_IMAGE_BUCKET).getPublicUrl(objectPath);
    return res.json({
      success: true,
      bucket: CATEGORY_IMAGE_BUCKET,
      path: objectPath,
      publicUrl: data?.publicUrl || null,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Failed to upload category image' });
  }
});

router.get('/sales/stats', requireAuth(), async (req, res) => {
  try {
    const employee = await resolveEmployeeProfile(req.user);
    if (!employee) {
      return res.status(404).json({ success: false, error: 'Employee profile not found' });
    }

    if (!hasSalesAccess(req.user?.role, employee?.role)) {
      return res.status(403).json({ success: false, error: 'Sales access required' });
    }

    const now = new Date();
    const endIso = now.toISOString();

    const start7 = startOfDay(now);
    start7.setDate(start7.getDate() - 6);

    const prevStart7 = startOfDay(start7);
    prevStart7.setDate(prevStart7.getDate() - 7);

    const prevEnd7 = new Date(start7);
    const conversions = ['CONVERTED', 'CLOSED'];

    const [
      totalLeadsRes,
      totalConvertedRes,
      newLeads7Res,
      newLeadsPrev7Res,
      converted7Res,
      convertedPrev7Res,
    ] = await Promise.all([
      supabase.from('leads').select('*', { count: 'exact', head: true }),
      supabase.from('leads').select('*', { count: 'exact', head: true }).in('status', conversions),
      supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', start7.toISOString())
        .lte('created_at', endIso),
      supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', prevStart7.toISOString())
        .lt('created_at', prevEnd7.toISOString()),
      supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .in('status', conversions)
        .gte('created_at', start7.toISOString())
        .lte('created_at', endIso),
      supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .in('status', conversions)
        .gte('created_at', prevStart7.toISOString())
        .lt('created_at', prevEnd7.toISOString()),
    ]);

    const countErrors = [
      totalLeadsRes?.error,
      totalConvertedRes?.error,
      newLeads7Res?.error,
      newLeadsPrev7Res?.error,
      converted7Res?.error,
      convertedPrev7Res?.error,
    ].filter(Boolean);

    if (countErrors.length) {
      throw new Error(countErrors[0]?.message || 'Failed to load sales stats');
    }

    const revenue7d = await sumRevenueByPeriod({
      startIso: start7.toISOString(),
      endIso: endIso,
      endInclusive: true,
    });

    const revenuePrev7d = await sumRevenueByPeriod({
      startIso: prevStart7.toISOString(),
      endIso: prevEnd7.toISOString(),
      endInclusive: false,
    });

    const totalLeads = safeNum(totalLeadsRes?.count);
    const totalConverted = safeNum(totalConvertedRes?.count);
    const newLeads7d = safeNum(newLeads7Res?.count);
    const newLeadsPrev7d = safeNum(newLeadsPrev7Res?.count);
    const converted7d = safeNum(converted7Res?.count);
    const convertedPrev7d = safeNum(convertedPrev7Res?.count);

    const conversionRate = totalLeads ? Math.round((totalConverted / totalLeads) * 100) : 0;

    return res.json({
      success: true,
      stats: {
        totalLeads,
        conversionRate,
        newLeads7d,
        newLeadsPrev7d,
        converted7d,
        convertedPrev7d,
        revenue7d,
        revenuePrev7d,
        newLeadsTrendPct: pctChange(newLeads7d, newLeadsPrev7d),
        convertedTrendPct: pctChange(converted7d, convertedPrev7d),
        revenueTrendPct: pctChange(revenue7d, revenuePrev7d),
        revenue7dFmt: fmtINR(revenue7d),
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Failed to load sales stats' });
  }
});

router.get('/sales/leads', requireAuth(), async (req, res) => {
  try {
    const employee = await resolveEmployeeProfile(req.user);
    if (!employee) {
      return res.status(404).json({ success: false, error: 'Employee profile not found' });
    }
    if (!hasSalesAccess(req.user?.role, employee?.role)) {
      return res.status(403).json({ success: false, error: 'Sales access required' });
    }

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ success: false, error: error.message || 'Failed to fetch leads' });
    }

    return res.json({ success: true, leads: data || [] });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Failed to fetch leads' });
  }
});

router.patch('/sales/leads/:leadId/status', requireAuth(), async (req, res) => {
  try {
    const employee = await resolveEmployeeProfile(req.user);
    if (!employee) {
      return res.status(404).json({ success: false, error: 'Employee profile not found' });
    }
    if (!hasSalesAccess(req.user?.role, employee?.role)) {
      return res.status(403).json({ success: false, error: 'Sales access required' });
    }

    const leadId = String(req.params?.leadId || '').trim();
    const nextStatus = String(req.body?.status || '').trim().toUpperCase();
    if (!leadId || !nextStatus) {
      return res.status(400).json({ success: false, error: 'leadId and status are required' });
    }

    const { data, error } = await supabase
      .from('leads')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', leadId)
      .select('*')
      .maybeSingle();

    if (error) {
      return res.status(500).json({ success: false, error: error.message || 'Failed to update lead status' });
    }

    return res.json({ success: true, lead: data || null });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Failed to update lead status' });
  }
});

router.get('/sales/pricing-rules', requireAuth(), async (req, res) => {
  try {
    const employee = await resolveEmployeeProfile(req.user);
    if (!employee) {
      return res.status(404).json({ success: false, error: 'Employee profile not found' });
    }
    if (!hasSalesAccess(req.user?.role, employee?.role)) {
      return res.status(403).json({ success: false, error: 'Sales access required' });
    }

    const { data, error } = await supabase
      .from('vendor_plans')
      .select('*')
      .order('created_at', { ascending: false });

    const errText = String(error?.message || '').toLowerCase();
    if (error && !(error?.code === '42P01' || errText.includes('vendor_plans'))) {
      return res.status(500).json({ success: false, error: error.message || 'Failed to load pricing rules' });
    }

    return res.json({ success: true, rules: data || [] });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Failed to load pricing rules' });
  }
});

export default router;
