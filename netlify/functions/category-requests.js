import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'itm_access';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
    'Access-Control-Allow-Methods': 'POST,PATCH,OPTIONS',
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
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};

const parseTail = (eventPath = '') => {
  const parts = String(eventPath || '').split('/').filter(Boolean);
  const idx = parts.lastIndexOf('category-requests');
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

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeRole = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'DATAENTRY') return 'DATA_ENTRY';
  return raw;
};
const normalizeStatus = (value) => String(value || '').trim().toUpperCase();
const nowIso = () => new Date().toISOString();

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
      '[CategoryRequests] JWT_SECRET missing. Falling back to another secret. Configure a dedicated JWT_SECRET.'
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

const resolveAuthenticatedUser = async (event, supabase) => {
  const bearer = parseBearerToken(event?.headers || {});
  if (bearer) {
    const { data: authData, error } = await supabase.auth.getUser(bearer);
    if (error || !authData?.user) return null;
    return {
      id: authData.user.id,
      email: normalizeEmail(authData.user?.email || ''),
      role: normalizeRole(
        authData.user?.app_metadata?.role ||
          authData.user?.user_metadata?.role ||
          authData.user?.role ||
          ''
      ),
      type: 'USER',
    };
  }

  const cookieToken = getCookie(event, AUTH_COOKIE_NAME);
  if (!cookieToken) return null;
  const decoded = verifyAuthToken(cookieToken);
  if (!decoded?.sub) return null;
  return {
    id: decoded.sub,
    email: normalizeEmail(decoded?.email || ''),
    role: normalizeRole(decoded?.role || ''),
    type: decoded?.type || 'USER',
  };
};

const makeTaskId = () => {
  if (typeof randomUUID === 'function') return randomUUID();
  return `catreq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const isActiveEmployee = (emp) => {
  const st = normalizeStatus(emp?.status || 'ACTIVE');
  return !st || st === 'ACTIVE';
};

const pickRandom = (arr) => {
  if (!arr?.length) return null;
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx] || null;
};

const findFirstByIdentity = async (supabase, { table, select, userId, email }) => {
  if (userId) {
    const { data, error } = await supabase.from(table).select(select).eq('user_id', userId).limit(1);
    if (!error && Array.isArray(data) && data[0]) return data[0];
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .ilike('email', normalizedEmail)
    .limit(1);

  if (!error && Array.isArray(data) && data[0]) return data[0];
  return null;
};

const resolveVendorByAuthUser = async (supabase, authUser) => {
  return findFirstByIdentity(supabase, {
    table: 'vendors',
    select: 'id, company_name, user_id, email',
    userId: authUser?.id,
    email: authUser?.email,
  });
};

const resolveEmployeeByAuthUser = async (supabase, authUser) => {
  const employee = await findFirstByIdentity(supabase, {
    table: 'employees',
    select: '*',
    userId: authUser?.id,
    email: authUser?.email,
  });
  if (!employee) return null;

  if (!employee.user_id && authUser?.id) {
    await supabase.from('employees').update({ user_id: authUser.id }).eq('id', employee.id);
    employee.user_id = authUser.id;
  }
  return employee;
};

const notifyUsers = async (supabase, userIds = [], payload = {}) => {
  const ids = Array.from(new Set((userIds || []).filter(Boolean)));
  if (!ids.length) return [];
  const rows = ids.map((id) => ({
    user_id: id,
    type: payload.type || 'INFO',
    title: payload.title || 'Notification',
    message: payload.message || '',
    link: payload.link || null,
    is_read: false,
    created_at: nowIso(),
  }));

  const { data } = await supabase.from('notifications').insert(rows).select();
  return data || [];
};

const notifyUser = async (supabase, payload = {}) =>
  notifyUsers(supabase, payload.user_id ? [payload.user_id] : [], payload);

const notifyRole = async (supabase, role, payload = {}) => {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return [];

  const { data: employees, error } = await supabase
    .from('employees')
    .select('user_id, status')
    .eq('role', normalizedRole);

  if (error || !employees?.length) return [];

  const activeIds = employees
    .filter((e) => !e.status || normalizeStatus(e.status) === 'ACTIVE')
    .map((e) => e.user_id)
    .filter(Boolean);

  return notifyUsers(supabase, activeIds, payload);
};

const resolveEmployeeUserId = async (supabase, emp) => {
  if (!emp || emp.user_id || !emp.email) return emp;
  try {
    const email = normalizeEmail(emp.email);
    if (!email) return emp;
    const { data: publicUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (!publicUser?.id) return emp;
    await supabase.from('employees').update({ user_id: publicUser.id }).eq('id', emp.id);
    return { ...emp, user_id: publicUser.id };
  } catch {
    return emp;
  }
};

const TASK_TYPE = 'CATEGORY_REQUEST';
const VALID_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'UNASSIGNED'];
const EMPLOYEE_ALLOWED_ROLES = new Set(['DATA_ENTRY', 'ADMIN', 'SUPERADMIN']);

export const handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });

    const supabase = getSupabase();
    const tail = parseTail(event.path);
    const body = readBody(event);
    const authUser = await resolveAuthenticatedUser(event, supabase);
    if (!authUser?.id) return json(401, { success: false, error: 'Unauthorized' });

    // POST /api/category-requests
    if (event.httpMethod === 'POST' && tail.length === 0) {
      const vendor = await resolveVendorByAuthUser(supabase, authUser);
      if (!vendor?.id) return json(403, { success: false, error: 'Vendor profile not found' });

      const groupName = String(body?.group_name || '').trim();
      const note = String(body?.note || '').trim();
      if (!groupName) return json(400, { success: false, error: 'Group name is required' });

      const { data: employees, error: eErr } = await supabase
        .from('employees')
        .select('id, user_id, full_name, email, status, role')
        .in('role', ['DATA_ENTRY', 'DATAENTRY']);

      if (eErr) return json(500, { success: false, error: eErr.message });

      const resolvedEmployees = await Promise.all((employees || []).map((emp) => resolveEmployeeUserId(supabase, emp)));
      const activeEmployees = resolvedEmployees.filter((e) => e?.user_id).filter(isActiveEmployee);

      const assignee = pickRandom(activeEmployees);
      const assigneeName = assignee?.full_name || assignee?.email || null;
      const taskStatus = assignee ? 'ASSIGNED' : 'UNASSIGNED';

      const ticketPayload = {
        subject: `Category request: ${groupName}`,
        description: note || 'Vendor requested a custom category/group that does not exist yet.',
        category: 'Category Request',
        priority: 'Medium',
        status: 'OPEN',
        vendor_id: vendor.id,
        created_at: nowIso(),
        attachments: {
          task_type: TASK_TYPE,
          task_status: taskStatus,
          group_name: groupName,
          note: note || null,
          vendor_id: vendor.id,
          vendor_name: vendor.company_name || null,
          created_by_user_id: authUser.id,
          assigned_to_user_id: assignee?.user_id || null,
          assigned_to_name: assigneeName,
        },
      };

      const { data: ticket } = await supabase
        .from('support_tickets')
        .insert([ticketPayload])
        .select()
        .maybeSingle();

      const taskId = ticket?.id || makeTaskId();
      const ticketLink = `/employee/dataentry/categories?category_request=${taskId}`;
      const baseMessage = [
        `Category request: ${groupName}`,
        `Vendor: ${vendor.company_name || 'Vendor'}`,
        note ? `Note: ${note}` : null,
        `Status: ${taskStatus}`,
        `Ticket: ${taskId}`,
      ]
        .filter(Boolean)
        .join(' | ');

      if (assignee?.user_id) {
        await notifyUser(supabase, {
          user_id: assignee.user_id,
          type: TASK_TYPE,
          title: 'Category request assigned',
          message: baseMessage,
          link: ticketLink,
        });
      } else {
        await notifyRole(supabase, 'DATA_ENTRY', {
          type: TASK_TYPE,
          title: 'Category request (unassigned)',
          message: baseMessage,
          link: ticketLink,
        });
        await notifyRole(supabase, 'DATAENTRY', {
          type: TASK_TYPE,
          title: 'Category request (unassigned)',
          message: baseMessage,
          link: ticketLink,
        });
      }

      const adminTitle = assigneeName
        ? `Category request assigned to ${assigneeName}`
        : 'Category request (unassigned)';

      await notifyRole(supabase, 'ADMIN', {
        type: TASK_TYPE,
        title: adminTitle,
        message: `${baseMessage}${assigneeName ? ` | Assigned: ${assigneeName}` : ''}`,
        link: `/admin/dashboard?category_request=${taskId}`,
      });
      await notifyRole(supabase, 'SUPERADMIN', {
        type: TASK_TYPE,
        title: adminTitle,
        message: `${baseMessage}${assigneeName ? ` | Assigned: ${assigneeName}` : ''}`,
        link: `/admin/dashboard?category_request=${taskId}`,
      });

      return json(200, {
        success: true,
        task_id: taskId,
        assigned_to: assignee?.user_id || null,
        assigned_name: assigneeName,
        ticket_id: ticket?.id || null,
        status: taskStatus,
      });
    }

    // PATCH /api/category-requests/:taskId/status
    if (event.httpMethod === 'PATCH' && tail.length === 2 && tail[1] === 'status') {
      const taskId = String(tail[0] || '').trim();
      if (!taskId) return json(400, { success: false, error: 'Missing task id' });

      const employee = await resolveEmployeeByAuthUser(supabase, authUser);
      if (!employee) return json(403, { success: false, error: 'Employee profile not found' });

      const role = normalizeRole(employee.role);
      const status = normalizeStatus(employee.status || 'ACTIVE');
      if (status !== 'ACTIVE') {
        return json(403, { success: false, error: 'Employee account is not active' });
      }
      if (!EMPLOYEE_ALLOWED_ROLES.has(role)) {
        return json(403, { success: false, error: 'Insufficient role permissions' });
      }

      const nextStatus = normalizeStatus(body?.status);
      if (!VALID_STATUSES.includes(nextStatus)) {
        return json(400, {
          success: false,
          error: `Invalid status. Use: ${VALID_STATUSES.join(', ')}`,
        });
      }

      const { data: ticket, error: tErr } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('id', taskId)
        .maybeSingle();

      if (tErr) return json(500, { success: false, error: tErr.message });
      if (!ticket) return json(404, { success: false, error: 'Task not found' });

      const actorRole = role;
      const actorId = authUser.id;

      let canUpdate = true;
      let shouldClaim = false;
      if (actorRole === 'DATA_ENTRY') {
        const metaRaw = ticket?.attachments;
        const meta = metaRaw && typeof metaRaw === 'object' ? metaRaw : {};
        const assignedTo = meta?.assigned_to_user_id || null;
        const isAssigned = assignedTo && assignedTo === actorId;
        const isUnassigned = !assignedTo;

        if (!isAssigned && isUnassigned) {
          shouldClaim = true;
        } else if (!isAssigned) {
          canUpdate = false;
        }

        if (!canUpdate) {
          return json(403, { success: false, error: 'Not assigned to this task' });
        }
      }

      const statusAt = nowIso();
      const metaRaw = ticket?.attachments;
      const meta = metaRaw && typeof metaRaw === 'object' ? metaRaw : {};
      const updatedMeta = {
        ...meta,
        task_status: nextStatus,
        task_status_at: statusAt,
        task_status_by: actorId,
        task_status_by_role: actorRole || null,
        ...(shouldClaim
          ? {
              assigned_to_user_id: actorId,
              assigned_to_name: employee?.full_name || employee?.email || meta.assigned_to_name || null,
            }
          : {}),
      };

      const statusMap = {
        ASSIGNED: 'OPEN',
        IN_PROGRESS: 'IN_PROGRESS',
        DONE: 'CLOSED',
        CANCELLED: 'CLOSED',
        UNASSIGNED: 'OPEN',
      };
      const ticketStatus = statusMap[nextStatus] || 'OPEN';

      const { data: updatedTicket, error: updErr } = await supabase
        .from('support_tickets')
        .update({
          status: ticketStatus,
          attachments: updatedMeta,
        })
        .eq('id', taskId)
        .select()
        .maybeSingle();

      if (updErr) return json(500, { success: false, error: updErr.message });

      const groupName = updatedMeta?.group_name || ticket?.subject || 'Category request';
      const vendorName = updatedMeta?.vendor_name || 'Vendor';
      const assigneeName = updatedMeta?.assigned_to_name || null;
      const statusMessage = [
        `Category request update: ${groupName}`,
        `Vendor: ${vendorName}`,
        `Status: ${nextStatus}`,
        assigneeName ? `Assigned: ${assigneeName}` : null,
        `Ticket: ${taskId}`,
      ]
        .filter(Boolean)
        .join(' | ');

      await notifyRole(supabase, 'ADMIN', {
        type: TASK_TYPE,
        title: `Category request ${nextStatus}`,
        message: statusMessage,
        link: `/admin/dashboard?category_request=${taskId}`,
      });
      await notifyRole(supabase, 'SUPERADMIN', {
        type: TASK_TYPE,
        title: `Category request ${nextStatus}`,
        message: statusMessage,
        link: `/admin/dashboard?category_request=${taskId}`,
      });

      if (updatedMeta?.assigned_to_user_id) {
        await notifyUser(supabase, {
          user_id: updatedMeta.assigned_to_user_id,
          type: TASK_TYPE,
          title: `Category request ${nextStatus}`,
          message: statusMessage,
          link: `/employee/dataentry/categories?category_request=${taskId}`,
        });
      }

      return json(200, {
        success: true,
        task_id: taskId,
        status: nextStatus,
        ticket: updatedTicket || null,
      });
    }

    if (!['POST', 'PATCH'].includes(event.httpMethod)) {
      return json(405, { success: false, error: 'Method not allowed' });
    }

    return json(404, { success: false, error: 'Not found' });
  } catch (error) {
    return json(500, {
      success: false,
      error: error?.message || 'Failed to handle category request',
    });
  }
};
