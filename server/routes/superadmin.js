import express from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { notifyUser } from '../lib/notify.js';
import { writeAuditLog } from '../lib/audit.js';
import {
  getPublicUserByEmail,
  hashPassword,
  normalizeEmail,
  setPublicUserPassword,
  upsertPublicUser,
} from '../lib/auth.js';
import {
  loginSuperAdmin,
  requireSuperAdmin,
  changeSuperAdminPassword,
} from '../lib/superadminAuth.js';

const router = express.Router();

const EMPLOYEE_ALLOWED_ROLES = [
  'ADMIN',
  'HR',
  'DATA_ENTRY',
  'SUPPORT',
  'SALES',
  'FINANCE',
];

const normalizeRole = (role) => String(role || '').trim().toUpperCase();

const nowIso = () => new Date().toISOString();

async function findPublicUserByEmail(email) {
  const target = normalizeEmail(email);
  if (!target) return null;

  const { data, error } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', target)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data || null;
}

async function findAuthUserByEmail(email) {
  const target = normalizeEmail(email);
  if (!target) return null;
  const publicUser = await findPublicUserByEmail(target);
  return publicUser?.id ? { id: publicUser.id, email: publicUser.email } : null;
}

async function ensureEmployeeAuthUser(employee, password) {
  const existingId = employee?.user_id || null;
  if (existingId) {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('id', existingId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (data?.id) {
      return { userId: existingId, created: false };
    }
  }

  const email = normalizeEmail(employee?.email);
  if (!email) {
    const err = new Error('Employee user not found');
    err.statusCode = 404;
    throw err;
  }

  const role = normalizeRole(employee?.role || 'DATA_ENTRY');
  const fullName = String(employee?.full_name || '').trim();
  const phone = String(employee?.phone || '').trim() || null;

  let publicUser = null;
  try {
    publicUser = await findAuthUserByEmail(email);
  } catch (error) {
    console.warn('[SuperAdmin] Failed to find user by email:', error?.message || error);
  }

  let created = false;
  if (!publicUser) {
    if (!password) {
      const err = new Error('Password required to create employee user');
      err.statusCode = 400;
      throw err;
    }

    const password_hash = await hashPassword(password);
    const inserted = await upsertPublicUser({
      email,
      full_name: fullName,
      role,
      phone,
      password_hash,
      allowPasswordUpdate: true,
    });

    publicUser = { id: inserted.id, email: inserted.email };
    created = true;
  }

  const userId = publicUser.id;

  await supabase
    .from('employees')
    .update({ user_id: userId })
    .eq('id', employee.id);

  return { userId, created };
}

function clampLimit(limit, fallback = 200, max = 1000) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

async function ensureSystemConfigRow(superadminId) {
  const key = 'maintenance_mode';
  const { data, error } = await supabase
    .from('system_config')
    .select('*')
    .eq('config_key', key)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data) return data;

  const payload = {
    config_key: key,
    maintenance_mode: false,
    maintenance_message: '',
    allow_vendor_registration: true,
    commission_rate: 5,
    max_upload_size_mb: 10,
    public_notice_enabled: false,
    public_notice_message: '',
    public_notice_variant: 'info',
    updated_at: nowIso(),
    updated_by: superadminId || null,
  };

  const { data: inserted, error: insertError } = await supabase
    .from('system_config')
    .upsert(payload, { onConflict: 'config_key' })
    .select('*')
    .maybeSingle();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return inserted || payload;
}

async function deleteVendorCascade(vendorId) {
  const { data: vendor, error: vendorError } = await supabase
    .from('vendors')
    .select('id, user_id, company_name, email, vendor_id')
    .eq('id', vendorId)
    .maybeSingle();

  if (vendorError) throw new Error(vendorError.message);
  if (!vendor) {
    const err = new Error('Vendor not found');
    err.statusCode = 404;
    throw err;
  }

  const vendorUserId = vendor.user_id || null;

  // Products and product images
  const { data: products } = await supabase
    .from('products')
    .select('id')
    .eq('vendor_id', vendorId);
  const productIds = (products || []).map((p) => p.id).filter(Boolean);
  if (productIds.length > 0) {
    await supabase.from('product_images').delete().in('product_id', productIds);
  }
  await supabase.from('products').delete().eq('vendor_id', vendorId);

  // Ticket messages -> support tickets
  const { data: tickets } = await supabase
    .from('support_tickets')
    .select('id')
    .eq('vendor_id', vendorId);
  const ticketIds = (tickets || []).map((t) => t.id).filter(Boolean);
  if (ticketIds.length > 0) {
    await supabase.from('ticket_messages').delete().in('ticket_id', ticketIds);
  }
  await supabase.from('support_tickets').delete().eq('vendor_id', vendorId);

  // Leads referencing vendor must be detached to avoid FK errors.
  await supabase
    .from('leads')
    .update({ vendor_id: null, status: 'AVAILABLE' })
    .eq('vendor_id', vendorId);

  // Direct vendor_id references
  const tablesToDeleteByVendor = [
    'favorites',
    'lead_contacts',
    'lead_purchases',
    'vendor_additional_leads',
    'vendor_bank_details',
    'vendor_contact_persons',
    'vendor_coupon_usages',
    'vendor_documents',
    'vendor_lead_quota',
    'vendor_messages',
    'vendor_otp_codes',
    'vendor_payments',
    'vendor_plan_slots',
    'vendor_plan_subscriptions',
    'vendor_plan_coupons',
    'vendor_preferences',
    'proposals',
  ];

  for (const table of tablesToDeleteByVendor) {
    // eslint-disable-next-line no-await-in-loop
    await supabase.from(table).delete().eq('vendor_id', vendorId);
  }

  // Finally delete vendor row.
  const { error: deleteVendorError } = await supabase.from('vendors').delete().eq('id', vendorId);
  if (deleteVendorError) {
    throw new Error(deleteVendorError.message);
  }

  // Best-effort delete of the auth user tied to this vendor.
  if (vendorUserId) {
    try {
      await supabase.from('users').delete().eq('id', vendorUserId);
    } catch (error) {
      console.warn('[SuperAdmin] Failed to delete vendor public user:', error?.message || error);
    }
  }

  return vendor;
}

// -----------------------
// Auth
// -----------------------
router.post('/login', loginSuperAdmin);

router.get('/me', requireSuperAdmin, async (req, res) => {
  return res.json({
    success: true,
    superadmin: {
      id: req.superadmin.id,
      email: req.superadmin.email,
      role: normalizeRole(req.superadmin.role || 'SUPERADMIN'),
      last_login: req.superadmin.last_login || null,
      is_active: req.superadmin.is_active !== false,
    },
  });
});

router.put('/password', requireSuperAdmin, changeSuperAdminPassword);

// All routes below require superadmin.
router.use(requireSuperAdmin);

// -----------------------
// Employees
// -----------------------
router.get('/employees', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    await writeAuditLog({
      req,
      actor: req.actor,
      action: 'EMPLOYEES_VIEWED',
      entityType: 'employees',
      details: { count: data?.length || 0 },
    });

    return res.json({ success: true, employees: data || [] });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/employees', async (req, res) => {
  try {
    const fullName = String(req.body?.full_name || '').trim();
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '').trim();
    const role = normalizeRole(req.body?.role || 'DATA_ENTRY');
    const phone = String(req.body?.phone || '').trim() || null;
    const department = String(req.body?.department || '').trim() || 'Operations';
    const status = normalizeRole(req.body?.status || 'ACTIVE') || 'ACTIVE';

    if (!fullName || !email || !password) {
      return res
        .status(400)
        .json({ success: false, error: 'full_name, email and password are required' });
    }

    if (!EMPLOYEE_ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `Invalid role. Allowed roles: ${EMPLOYEE_ALLOWED_ROLES.join(', ')}`,
      });
    }

    const password_hash = await hashPassword(password);
    const publicUser = await upsertPublicUser({
      email,
      full_name: fullName,
      role,
      phone,
      password_hash,
      allowPasswordUpdate: true,
    });

    const userId = publicUser.id;

    const empPayload = {
      user_id: userId,
      full_name: fullName,
      email,
      phone,
      role,
      department,
      status,
      created_at: nowIso(),
    };

    const { data: employee, error: empError } = await supabase
      .from('employees')
      .insert([empPayload])
      .select('*')
      .maybeSingle();

    if (empError) {
        try {
          await supabase.from('users').delete().eq('id', userId);
        } catch (error) {
          console.warn('[SuperAdmin] Failed to rollback public user:', error?.message || error);
        }
      return res.status(500).json({ success: false, error: empError.message });
    }

    await writeAuditLog({
      req,
      actor: req.actor,
      action: 'EMPLOYEE_CREATED',
      entityType: 'employees',
      entityId: employee?.id || null,
      details: { email, role, department, user_id: userId },
    });

    if (userId) {
      await notifyUser({
        user_id: userId,
        type: 'WELCOME',
        title: 'Welcome to the Team',
        message: 'Your staff account has been created. Please log in to continue.',
        link: '/employee/login',
      });
    }

    return res.json({ success: true, employee: employee || empPayload });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/employees/:employeeId', async (req, res) => {
  try {
    const employeeId = req.params.employeeId;
    if (!employeeId) {
      return res.status(400).json({ success: false, error: 'employeeId is required' });
    }

    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, user_id, email, full_name, role')
      .eq('id', employeeId)
      .maybeSingle();

    if (empError) {
      return res.status(500).json({ success: false, error: empError.message });
    }

    if (!employee) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    await supabase.from('employees').delete().eq('id', employeeId);

      if (employee.user_id) {
        await supabase.from('users').delete().eq('id', employee.user_id);
      }

    await writeAuditLog({
      req,
      actor: req.actor,
      action: 'EMPLOYEE_DELETED',
      entityType: 'employees',
      entityId: employeeId,
      details: {
        user_id: employee.user_id,
        email: employee.email,
        full_name: employee.full_name,
        role: employee.role,
      },
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/employees/:employeeId/password', async (req, res) => {
  try {
    const employeeId = req.params.employeeId;
    const password = String(req.body?.password || '').trim();

    if (!employeeId) {
      return res.status(400).json({ success: false, error: 'employeeId is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, user_id, email, full_name, role, department, phone')
      .eq('id', employeeId)
      .maybeSingle();

    if (empError) {
      return res.status(500).json({ success: false, error: empError.message });
    }

    if (!employee) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    // Ensure we have a valid public user id even if employees.user_id is missing/invalid.
    let resolvedUserId = employee.user_id || null;
    let createdAuthUser = false;
    try {
      const ensured = await ensureEmployeeAuthUser(employee, password);
      resolvedUserId = ensured.userId;
      createdAuthUser = ensured.created;
    } catch (error) {
      const statusCode = error?.statusCode || 500;
      return res.status(statusCode).json({ success: false, error: error.message });
    }

    if (!resolvedUserId) {
      return res.status(404).json({ success: false, error: 'Employee user not found' });
    }

    await setPublicUserPassword(resolvedUserId, password);

    await writeAuditLog({
      req,
      actor: req.actor,
      action: 'EMPLOYEE_PASSWORD_RESET',
      entityType: 'employees',
      entityId: employeeId,
      details: {
        user_id: resolvedUserId,
        email: employee.email,
        role: employee.role,
        created_auth_user: createdAuthUser,
      },
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// -----------------------
// Vendors
// -----------------------
router.get('/vendors', async (req, res) => {
  try {
    const limit = clampLimit(req.query?.limit, 500, 2000);
    const { data, error } = await supabase
      .from('vendors')
      .select(
        'id, vendor_id, company_name, owner_name, email, phone, kyc_status, created_at, is_active, is_verified, city, state'
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    await writeAuditLog({
      req,
      actor: req.actor,
      action: 'VENDORS_VIEWED',
      entityType: 'vendors',
      details: { count: data?.length || 0 },
    });

    return res.json({ success: true, vendors: data || [] });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/vendors/:vendorId', async (req, res) => {
  try {
    const vendorId = req.params.vendorId;
    if (!vendorId) {
      return res.status(400).json({ success: false, error: 'vendorId is required' });
    }

    let vendor;
    try {
      vendor = await deleteVendorCascade(vendorId);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({ success: false, error: error.message });
    }

    await writeAuditLog({
      req,
      actor: req.actor,
      action: 'VENDOR_DELETED',
      entityType: 'vendors',
      entityId: vendorId,
      details: {
        vendor_id: vendor.vendor_id,
        company_name: vendor.company_name,
        email: vendor.email,
        user_id: vendor.user_id,
      },
    });

    return res.json({ success: true, vendor });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// -----------------------
// Finance
// -----------------------
router.get('/finance/summary', async (req, res) => {
  try {
    const { data: payments, error } = await supabase
      .from('vendor_payments')
      .select('amount, net_amount, payment_date');
    if (error) return res.status(500).json({ success: false, error: error.message });

    const now = new Date();
    const thirtyAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let totalGross = 0;
    let totalNet = 0;
    let last30 = 0;
    (payments || []).forEach((p) => {
      const gross = Number(p.amount || 0);
      const net = Number(p.net_amount ?? p.amount ?? 0);
      totalGross += gross;
      totalNet += net;
      if (p.payment_date && new Date(p.payment_date) >= thirtyAgo) last30 += net;
    });

    await writeAuditLog({
      req,
      actor: req.actor,
      action: 'FINANCE_SUMMARY_VIEWED',
      entityType: 'vendor_payments',
      details: { totalGross, totalNet, last30 },
    });

    return res.json({
      success: true,
      data: {
        totalGross,
        totalNet,
        last30,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/finance/payments', async (req, res) => {
  try {
    const { vendor_id, plan_id, from, to, limit = 200 } = req.query;
    let query = supabase
      .from('vendor_payments')
      .select(
        '*, vendor:vendors(id, vendor_id, company_name, email), plan:vendor_plans(id, name, price)'
      )
      .order('payment_date', { ascending: false })
      .limit(clampLimit(limit, 200, 2000));

    if (vendor_id) query = query.eq('vendor_id', vendor_id);
    if (plan_id) query = query.eq('plan_id', plan_id);
    if (from) query = query.gte('payment_date', from);
    if (to) query = query.lte('payment_date', to);

    const { data, error } = await query;
    if (error) return res.status(500).json({ success: false, error: error.message });

    await writeAuditLog({
      req,
      actor: req.actor,
      action: 'FINANCE_PAYMENTS_VIEWED',
      entityType: 'vendor_payments',
      details: {
        filters: { vendor_id: vendor_id || null, plan_id: plan_id || null, from: from || null, to: to || null },
        count: data?.length || 0,
      },
    });

    return res.json({ success: true, data: data || [] });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// -----------------------
// System config + messages
// -----------------------
router.get('/system-config', async (req, res) => {
  try {
    const row = await ensureSystemConfigRow(req.superadmin?.id);
    return res.json({ success: true, config: row });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/system-config', async (req, res) => {
  try {
    const existing = await ensureSystemConfigRow(req.superadmin?.id);

    const payload = {
      config_key: 'maintenance_mode',
      maintenance_mode: req.body?.maintenance_mode === true,
      maintenance_message: String(req.body?.maintenance_message || ''),
      allow_vendor_registration:
        typeof req.body?.allow_vendor_registration === 'boolean'
          ? req.body.allow_vendor_registration
          : existing.allow_vendor_registration ?? true,
      commission_rate:
        req.body?.commission_rate != null ? Number(req.body.commission_rate) || 0 : existing.commission_rate,
      max_upload_size_mb:
        req.body?.max_upload_size_mb != null
          ? Number(req.body.max_upload_size_mb) || 0
          : existing.max_upload_size_mb,
      public_notice_enabled: req.body?.public_notice_enabled === true,
      public_notice_message: String(req.body?.public_notice_message || ''),
      public_notice_variant: String(req.body?.public_notice_variant || existing.public_notice_variant || 'info'),
      updated_at: nowIso(),
      updated_by: req.superadmin?.id || null,
    };

    const { data, error } = await supabase
      .from('system_config')
      .upsert(payload, { onConflict: 'config_key' })
      .select('*')
      .maybeSingle();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    await writeAuditLog({
      req,
      actor: req.actor,
      action: 'SYSTEM_CONFIG_UPDATED',
      entityType: 'system_config',
      entityId: existing?.id || null,
      details: {
        maintenance_mode: payload.maintenance_mode,
        maintenance_message: payload.maintenance_message,
        public_notice_enabled: payload.public_notice_enabled,
        public_notice_variant: payload.public_notice_variant,
      },
    });

    return res.json({ success: true, config: data || payload });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// -----------------------
// Page status controls
// -----------------------
router.get('/page-status', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('page_status')
      .select('*')
      .order('page_name', { ascending: true });

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({ success: true, pages: data || [] });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/page-status', async (req, res) => {
  try {
    const page_name = String(req.body?.page_name || '').trim();
    const page_route = String(req.body?.page_route || '').trim();
    const error_message = String(req.body?.error_message || '').trim();

    if (!page_name || !page_route) {
      return res.status(400).json({ success: false, error: 'page_name and page_route are required' });
    }

    const payload = {
      page_name,
      page_route,
      error_message,
      is_blanked: false,
      updated_at: nowIso(),
    };

    const { data, error } = await supabase
      .from('page_status')
      .insert([payload])
      .select('*')
      .maybeSingle();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    await writeAuditLog({
      req,
      actor: req.actor,
      action: 'PAGE_STATUS_CREATED',
      entityType: 'page_status',
      entityId: data?.id || null,
      details: { page_name, page_route },
    });

    return res.json({ success: true, page: data || payload });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/page-status/:pageId', async (req, res) => {
  try {
    const pageId = req.params.pageId;
    if (!pageId) {
      return res.status(400).json({ success: false, error: 'pageId is required' });
    }

    const updates = {
      updated_at: nowIso(),
    };

    if (typeof req.body?.is_blanked === 'boolean') updates.is_blanked = req.body.is_blanked;
    if (req.body?.error_message != null) updates.error_message = String(req.body.error_message || '');
    if (req.body?.page_title != null) updates.page_title = String(req.body.page_title || '');
    if (req.body?.page_description != null) updates.page_description = String(req.body.page_description || '');

    const { data, error } = await supabase
      .from('page_status')
      .update(updates)
      .eq('id', pageId)
      .select('*')
      .maybeSingle();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    await writeAuditLog({
      req,
      actor: req.actor,
      action: 'PAGE_STATUS_UPDATED',
      entityType: 'page_status',
      entityId: pageId,
      details: updates,
    });

    return res.json({ success: true, page: data || null });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/page-status/:pageId', async (req, res) => {
  try {
    const pageId = req.params.pageId;
    if (!pageId) {
      return res.status(400).json({ success: false, error: 'pageId is required' });
    }

    const { data: existing } = await supabase
      .from('page_status')
      .select('id, page_name, page_route')
      .eq('id', pageId)
      .maybeSingle();

    const { error } = await supabase.from('page_status').delete().eq('id', pageId);
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    await writeAuditLog({
      req,
      actor: req.actor,
      action: 'PAGE_STATUS_DELETED',
      entityType: 'page_status',
      entityId: pageId,
      details: existing || {},
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// -----------------------
// Audit logs
// -----------------------
router.get('/audit-logs', async (req, res) => {
  try {
    const limit = clampLimit(req.query?.limit, 300, 2000);
    const hoursBack = Number(req.query?.hoursBack ?? req.query?.hours_back ?? 168);
    const actorTypeFilter = String(req.query?.actor_type || '').trim().toUpperCase();
    const entityTypeFilter = String(req.query?.entity_type || '').trim();
    const actionContains = String(req.query?.action_contains || '').trim().toUpperCase();

    const cutoff = Number.isFinite(hoursBack) && hoursBack > 0 ? new Date(Date.now() - hoursBack * 60 * 60 * 1000) : null;

    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (cutoff) {
      query = query.gte('created_at', cutoff.toISOString());
    }
    if (entityTypeFilter) {
      query = query.eq('entity_type', entityTypeFilter);
    }
    if (actionContains) {
      query = query.ilike('action', `%${actionContains}%`);
    }

    const { data, error } = await query;
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    let logs = data || [];

    if (actorTypeFilter) {
      logs = logs.filter((log) => String(log?.details?.actor_type || '').toUpperCase() === actorTypeFilter);
    }

    return res.json({
      success: true,
      logs: logs.map((log) => ({
        ...log,
        actor: {
          id: log?.details?.actor_id || log.user_id || null,
          type: log?.details?.actor_type || null,
          role: log?.details?.actor_role || null,
          email: log?.details?.actor_email || null,
        },
      })),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
