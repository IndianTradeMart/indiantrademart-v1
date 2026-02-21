import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'itm_access';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  },
  body: JSON.stringify(body),
});

const getSupabase = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
};

const parseBearerToken = (headers = {}) => {
  const header = headers.Authorization || headers.authorization;
  if (!header || typeof header !== 'string') return null;
  if (!header.startsWith('Bearer ')) return null;
  return header.replace('Bearer ', '').trim();
};

const parseCookies = (cookieHeader = '') => {
  const out = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return out;
  cookieHeader.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const key = decodeURIComponent(part.slice(0, idx).trim());
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    if (key) out[key] = value;
  });
  return out;
};

const getCookie = (event, name) => {
  const header = event?.headers?.cookie || event?.headers?.Cookie || '';
  const cookies = parseCookies(header);
  return cookies[name];
};

let warnedMissingJwtSecret = false;
const getJwtSecret = () => {
  const secret =
    process.env.JWT_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error('Missing JWT_SECRET (or fallback secret) in environment');
  }

  if (!process.env.JWT_SECRET && !warnedMissingJwtSecret) {
    // eslint-disable-next-line no-console
    console.warn(
      '[Employee] JWT_SECRET missing. Falling back to another secret. Configure a dedicated JWT_SECRET.'
    );
    warnedMissingJwtSecret = true;
  }

  return secret;
};

const verifyAuthToken = (token) => {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
};

const normalizeRole = (role) => String(role || '').trim().toUpperCase();
const SALES_ROLES = new Set(['SALES', 'ADMIN', 'SUPERADMIN']);
const CATEGORY_IMAGE_BUCKET = 'avatars';
const CATEGORY_IMAGE_LEVELS = new Set(['head', 'sub', 'micro']);
const CATEGORY_TABLE_BY_LEVEL = {
  head: 'head_categories',
  sub: 'sub_categories',
  micro: 'micro_categories',
};
const CATEGORY_IMAGE_MIN_BYTES = 100 * 1024; // 100KB
const CATEGORY_IMAGE_MAX_BYTES = 800 * 1024; // 800KB
const PRODUCT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const PRODUCT_IMAGE_MIN_BYTES = 100 * 1024; // 100KB
const PRODUCT_IMAGE_MAX_BYTES = 800 * 1024; // 800KB
const DEFAULT_PRODUCT_UPLOAD_BUCKETS_BY_TYPE = {
  image: ['product-images', 'product-media', 'objects', 'avatars'],
  video: ['product-media', 'product-images', 'objects', 'avatars'],
  pdf: ['product-media', 'objects', 'avatars'],
};
const sanitizeBucketName = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
const parseBucketList = (value = '') =>
  Array.from(
    new Set(
      String(value || '')
        .split(',')
        .map((item) => sanitizeBucketName(item))
        .filter(Boolean)
    )
  );
const PRODUCT_SHARED_UPLOAD_BUCKETS = parseBucketList(
  process.env.PRODUCT_UPLOAD_BUCKETS || process.env.PRODUCT_MEDIA_BUCKETS || ''
);
const resolveProductUploadBuckets = (type = '') => {
  const normalizedType = String(type || '').trim().toLowerCase();
  const defaults = DEFAULT_PRODUCT_UPLOAD_BUCKETS_BY_TYPE[normalizedType] || [];
  const envSpecific = parseBucketList(process.env[`PRODUCT_${normalizedType.toUpperCase()}_BUCKETS`] || '');
  return Array.from(new Set([...envSpecific, ...PRODUCT_SHARED_UPLOAD_BUCKETS, ...defaults]));
};

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
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

const parseTail = (eventPath = '') => {
  const parts = String(eventPath || '').split('/').filter(Boolean);
  const idx = parts.lastIndexOf('employee');
  return idx >= 0 ? parts.slice(idx + 1) : parts;
};

const readBody = (event) => {
  if (!event?.body) return {};
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
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

const isBucketMissingError = (error) => {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('bucket not found') || (msg.includes('bucket') && msg.includes('not found'));
};
const isBucketAlreadyExistsError = (error) => {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('already exists') || (msg.includes('duplicate') && msg.includes('bucket'));
};
const ensurePublicBucket = async (supabase, bucketName) => {
  const bucket = sanitizeBucketName(bucketName);
  if (!bucket) return new Error('Invalid bucket name');
  const { error } = await supabase.storage.createBucket(bucket, { public: true });
  if (error && !isBucketAlreadyExistsError(error)) return error;
  return null;
};

const normalizeProductUploadType = (value = '') => {
  const t = String(value || '').trim().toLowerCase();
  if (t === 'image' || t === 'video' || t === 'pdf') return t;
  return null;
};

const inferProductUploadTypeFromMime = (mime = '') => {
  const m = String(mime || '').trim().toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m === 'application/pdf') return 'pdf';
  return null;
};

const buildProductUploadPath = ({ type, originalName, contentType }) => {
  const safeName = sanitizeFilename(originalName || '');
  const extFromMime = MIME_EXT[contentType] || '';
  const hasExt = safeName.includes('.');
  const base = hasExt ? safeName.replace(/\.[^/.]+$/, '') : safeName;
  const ext = hasExt ? safeName.split('.').pop() : extFromMime || 'bin';
  const finalName = `${base || type || 'upload'}.${ext}`;
  return `product-media/${type}s/${Date.now()}-${randomUUID()}-${finalName}`;
};

const hasSalesAccess = (authRole, employeeRole) => {
  const a = normalizeRole(authRole || '');
  const e = normalizeRole(employeeRole || '');
  return SALES_ROLES.has(a) || SALES_ROLES.has(e);
};

const resolveAuthenticatedUser = async (event, supabase) => {
  const bearer = parseBearerToken(event?.headers || {});
  if (bearer) {
    const { data: authData, error: authError } = await supabase.auth.getUser(bearer);
    if (authError || !authData?.user) return null;
    return {
      id: authData.user.id,
      email: String(authData.user?.email || '').trim().toLowerCase(),
      role: normalizeRole(
        authData.user?.app_metadata?.role ||
          authData.user?.user_metadata?.role ||
          authData.user?.role ||
          ''
      ),
    };
  }

  const cookieToken = getCookie(event, AUTH_COOKIE_NAME);
  if (!cookieToken) return null;
  const decoded = verifyAuthToken(cookieToken);
  if (!decoded?.sub) return null;
  return {
    id: decoded.sub,
    email: String(decoded?.email || '').trim().toLowerCase(),
    role: normalizeRole(decoded?.role || ''),
  };
};

const resolveEmployeeProfile = async (supabase, authUser) => {
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
    await supabase.from('employees').update({ user_id: userId }).eq('id', employee.id);
    employee.user_id = userId;
  }

  return employee || null;
};

const sumRevenueByPeriod = async (supabase, { startIso, endIso, endInclusive = true }) => {
  let byPurchaseDate = supabase.from('lead_purchases').select('amount, purchase_date');

  byPurchaseDate = byPurchaseDate.gte('purchase_date', startIso);
  byPurchaseDate = endInclusive
    ? byPurchaseDate.lte('purchase_date', endIso)
    : byPurchaseDate.lt('purchase_date', endIso);

  let { data, error } = await byPurchaseDate;

  const errText = String(error?.message || '').toLowerCase();
  if (error && (error?.code === '42703' || errText.includes('purchase_date'))) {
    let byCreatedAt = supabase.from('lead_purchases').select('amount, created_at').gte('created_at', startIso);
    byCreatedAt = endInclusive
      ? byCreatedAt.lte('created_at', endIso)
      : byCreatedAt.lt('created_at', endIso);

    ({ data, error } = await byCreatedAt);
  }

  if (error) throw new Error(error.message || 'Failed to load revenue');

  return safeNum((data || []).reduce((sum, row) => sum + safeNum(row?.amount), 0));
};

export const handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });

    const supabase = getSupabase();
    const tail = parseTail(event.path);
    const authUser = await resolveAuthenticatedUser(event, supabase);
    if (!authUser?.id) return json(401, { success: false, error: 'Missing or invalid auth token' });

    // GET /api/employee/me
    if (event.httpMethod === 'GET' && tail[0] === 'me') {
      const employee = await resolveEmployeeProfile(supabase, authUser);
      if (!employee) return json(404, { success: false, error: 'Employee profile not found' });

      return json(200, {
        success: true,
        employee: {
          ...employee,
          user_id: authUser.id || employee.user_id || null,
          role: normalizeRole(employee.role || 'UNKNOWN'),
        },
      });
    }

    // POST /api/employee/category-image-upload
    if (event.httpMethod === 'POST' && tail[0] === 'category-image-upload') {
      const employee = await resolveEmployeeProfile(supabase, authUser);
      if (!employee) return json(404, { success: false, error: 'Employee profile not found' });

      const body = readBody(event);
      const level = String(body?.level || '').trim().toLowerCase();
      if (!CATEGORY_IMAGE_LEVELS.has(level)) {
        return json(400, { success: false, error: 'Invalid category level' });
      }

      const slug = sanitizeSlug(body?.slug || 'category');
      const dataUrl = String(body?.data_url || body?.dataUrl || '').trim();
      const originalName = sanitizeFilename(body?.file_name || body?.fileName || '');
      const explicitType = String(body?.content_type || body?.contentType || '').trim();

      if (!dataUrl) {
        return json(400, { success: false, error: 'data_url is required' });
      }

      const parsed = parseDataUrl(dataUrl);
      if (!parsed?.base64) {
        return json(400, { success: false, error: 'Invalid base64 payload' });
      }

      const contentType = explicitType || parsed.mime || 'application/octet-stream';
      if (!contentType.startsWith('image/')) {
        return json(400, { success: false, error: 'Only image uploads are allowed' });
      }

      const buffer = Buffer.from(parsed.base64, 'base64');
      if (!buffer?.length) {
        return json(400, { success: false, error: 'Empty upload payload' });
      }
      if (buffer.length < CATEGORY_IMAGE_MIN_BYTES) {
        return json(400, {
          success: false,
          error: `Image must be at least ${Math.round(CATEGORY_IMAGE_MIN_BYTES / 1024)}KB`,
        });
      }
      if (buffer.length > CATEGORY_IMAGE_MAX_BYTES) {
        return json(413, {
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
        return json(500, { success: false, error: uploadError.message || 'Upload failed' });
      }

      const { data } = supabase.storage.from(CATEGORY_IMAGE_BUCKET).getPublicUrl(objectPath);
      return json(200, {
        success: true,
        bucket: CATEGORY_IMAGE_BUCKET,
        path: objectPath,
        publicUrl: data?.publicUrl || null,
      });
    }

    // POST /api/employee/product-media-upload
    if (event.httpMethod === 'POST' && tail[0] === 'product-media-upload') {
      const employee = await resolveEmployeeProfile(supabase, authUser);
      if (!employee) return json(404, { success: false, error: 'Employee profile not found' });

      const body = readBody(event);
      const requestedType = normalizeProductUploadType(body?.type || '');
      const dataUrl = String(body?.data_url || body?.dataUrl || '').trim();
      const originalName = sanitizeFilename(body?.file_name || body?.fileName || '');
      const explicitType = String(body?.content_type || body?.contentType || '').trim();

      if (!dataUrl) {
        return json(400, { success: false, error: 'data_url is required' });
      }

      const parsed = parseDataUrl(dataUrl);
      if (!parsed?.base64) {
        return json(400, { success: false, error: 'Invalid base64 payload' });
      }

      const contentType = explicitType || parsed.mime || 'application/octet-stream';
      const inferredType = inferProductUploadTypeFromMime(contentType);
      const finalType = requestedType || inferredType;

      const buckets = resolveProductUploadBuckets(finalType);
      if (!finalType || !buckets.length) {
        return json(400, { success: false, error: 'Unsupported upload type' });
      }
      if (!inferredType || inferredType !== finalType) {
        return json(400, { success: false, error: 'File type does not match upload type' });
      }

      const buffer = Buffer.from(parsed.base64, 'base64');
      if (!buffer?.length) {
        return json(400, { success: false, error: 'Empty upload payload' });
      }
      if (buffer.length > PRODUCT_UPLOAD_MAX_BYTES) {
        return json(413, { success: false, error: 'File too large (max 10MB)' });
      }
      if (finalType === 'image') {
        if (buffer.length < PRODUCT_IMAGE_MIN_BYTES) {
          return json(400, { success: false, error: 'Image too small (minimum 100KB)' });
        }
        if (buffer.length > PRODUCT_IMAGE_MAX_BYTES) {
          return json(413, { success: false, error: 'Image too large (maximum 800KB)' });
        }
      }

      const objectPath = buildProductUploadPath({
        type: finalType,
        originalName,
        contentType,
      });

      let uploadedBucket = null;
      let lastUploadError = null;
      const uploadOptions = {
        contentType,
        upsert: true,
      };

      for (const bucket of buckets) {
        let { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(objectPath, buffer, uploadOptions);
        const bucketMissingOnInitialTry = !!uploadError && isBucketMissingError(uploadError);

        if (bucketMissingOnInitialTry) {
          const bucketCreateError = await ensurePublicBucket(supabase, bucket);
          if (!bucketCreateError) {
            const retryUpload = await supabase.storage.from(bucket).upload(objectPath, buffer, uploadOptions);
            uploadError = retryUpload.error || null;
          } else {
            uploadError = bucketCreateError;
          }
        }

        if (!uploadError) {
          uploadedBucket = bucket;
          break;
        }

        lastUploadError = uploadError;
        if (!bucketMissingOnInitialTry && !isBucketMissingError(uploadError)) {
          break;
        }
      }

      if (!uploadedBucket) {
        const errorMessage = isBucketMissingError(lastUploadError)
          ? `Upload storage bucket not found. Checked: ${buckets.join(', ')}`
          : lastUploadError?.message || 'Upload failed';
        return json(500, { success: false, error: errorMessage });
      }

      const { data } = supabase.storage.from(uploadedBucket).getPublicUrl(objectPath);
      return json(200, {
        success: true,
        bucket: uploadedBucket,
        path: objectPath,
        publicUrl: data?.publicUrl || null,
      });
    }

    // POST /api/employee/category-update
    if (event.httpMethod === 'POST' && tail[0] === 'category-update') {
      const employee = await resolveEmployeeProfile(supabase, authUser);
      if (!employee) return json(404, { success: false, error: 'Employee profile not found' });

      const body = readBody(event);
      const level = String(body?.level || '').trim().toLowerCase();
      const table = CATEGORY_TABLE_BY_LEVEL[level];
      if (!table) {
        return json(400, { success: false, error: 'Invalid category level' });
      }

      const id = String(body?.id || '').trim();
      if (!id) {
        return json(400, { success: false, error: 'Category id is required' });
      }

      const incomingPayload = body?.payload;
      if (!incomingPayload || typeof incomingPayload !== 'object') {
        return json(400, { success: false, error: 'payload object is required' });
      }

      const allowedKeysByLevel = {
        head: ['name', 'slug', 'description', 'image_url', 'image', 'is_active'],
        sub: ['name', 'slug', 'description', 'image_url', 'image', 'is_active'],
        micro: ['name', 'slug', 'image_url', 'image', 'images', 'image_urls', 'is_active'],
      };
      const allowed = new Set(allowedKeysByLevel[level] || []);
      const payload = {};
      Object.keys(incomingPayload).forEach((key) => {
        if (allowed.has(key)) payload[key] = incomingPayload[key];
      });

      if (!Object.keys(payload).length) {
        return json(400, { success: false, error: 'No allowed fields provided in payload' });
      }

      const { data, error } = await supabase
        .from(table)
        .update(payload)
        .eq('id', id)
        .select('id')
        .maybeSingle();

      if (error) {
        return json(500, { success: false, error: error.message || 'Failed to update category' });
      }
      if (!data?.id) {
        return json(404, { success: false, error: 'Category not found or not updated' });
      }

      return json(200, { success: true, id: data.id });
    }

    // All /sales/* routes require employee + role access.
    if (tail[0] === 'sales') {
      const employee = await resolveEmployeeProfile(supabase, authUser);
      if (!employee) return json(404, { success: false, error: 'Employee profile not found' });
      if (!hasSalesAccess(authUser.role, employee.role)) {
        return json(403, { success: false, error: 'Sales access required' });
      }

      // GET /api/employee/sales/stats
      if (event.httpMethod === 'GET' && tail[1] === 'stats') {
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

        const revenue7d = await sumRevenueByPeriod(supabase, {
          startIso: start7.toISOString(),
          endIso,
          endInclusive: true,
        });

        const revenuePrev7d = await sumRevenueByPeriod(supabase, {
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

        return json(200, {
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
      }

      // GET /api/employee/sales/leads
      if (event.httpMethod === 'GET' && tail[1] === 'leads' && tail.length === 2) {
        const { data, error } = await supabase
          .from('leads')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          return json(500, { success: false, error: error.message || 'Failed to fetch leads' });
        }

        return json(200, { success: true, leads: data || [] });
      }

      // PATCH /api/employee/sales/leads/:leadId/status
      if (
        event.httpMethod === 'PATCH' &&
        tail[1] === 'leads' &&
        tail[3] === 'status' &&
        tail[2]
      ) {
        const leadId = String(tail[2] || '').trim();
        const body = readBody(event);
        const nextStatus = String(body?.status || '').trim().toUpperCase();
        if (!leadId || !nextStatus) {
          return json(400, { success: false, error: 'leadId and status are required' });
        }

        const { data, error } = await supabase
          .from('leads')
          .update({ status: nextStatus, updated_at: new Date().toISOString() })
          .eq('id', leadId)
          .select('*')
          .maybeSingle();

        if (error) {
          return json(500, { success: false, error: error.message || 'Failed to update lead status' });
        }

        return json(200, { success: true, lead: data || null });
      }

      // GET /api/employee/sales/pricing-rules
      if (event.httpMethod === 'GET' && tail[1] === 'pricing-rules') {
        const { data, error } = await supabase
          .from('vendor_plans')
          .select('*')
          .order('created_at', { ascending: false });

        const errText = String(error?.message || '').toLowerCase();
        if (error && !(error?.code === '42P01' || errText.includes('vendor_plans'))) {
          return json(500, { success: false, error: error.message || 'Failed to load pricing rules' });
        }

        return json(200, { success: true, rules: data || [] });
      }
    }

    if (!['GET', 'POST', 'PATCH'].includes(event.httpMethod)) {
      return json(405, { success: false, error: 'Method not allowed' });
    }

    return json(404, { success: false, error: 'Not found' });
  } catch (error) {
    return json(500, { success: false, error: error.message || 'Employee function failed' });
  }
};
