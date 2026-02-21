import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';

const ENABLE_SUPABASE_AUTH_MIGRATION =
  String(process.env.ENABLE_SUPABASE_AUTH_MIGRATION || 'true').toLowerCase() !== 'false';

const ENABLE_SUPABASE_AUTH_SIGNUP =
  String(process.env.ENABLE_SUPABASE_AUTH_SIGNUP || 'true').toLowerCase() !== 'false';

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'itm_access';
const CSRF_COOKIE_NAME = process.env.AUTH_CSRF_COOKIE || 'itm_csrf';
const AUTH_COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN || '';
const AUTH_TOKEN_TTL = process.env.AUTH_TOKEN_TTL || '7d';
const AUTH_COOKIE_MAX_AGE_DAYS = Number(process.env.AUTH_COOKIE_MAX_AGE_DAYS || 7);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // eslint-disable-next-line no-console
  console.error('[Auth] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const supabaseAnon = SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL || '', SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null;

const isValidEmail = (email) => !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const normalizeRole = (role) => {
  const raw = String(role || '').trim().toUpperCase();
  if (!raw) return '';
  if (raw === 'DATAENTRY') return 'DATA_ENTRY';
  if (raw === 'FINACE') return 'FINANCE';
  return raw;
};
const BUYER_NOT_REGISTERED_MESSAGE = 'This email is not registered as buyer';

const BUYER_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const BUYER_AVATAR_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const BUYER_AVATAR_EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const pickFirstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null);
const optionalText = (value) => {
  const text = String(value || '').trim();
  return text || null;
};
const optionalId = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
};
const parseDataUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.startsWith('data:')) {
    const match = raw.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) return null;
    return {
      mime: String(match[1] || '').trim().toLowerCase(),
      base64: String(match[2] || '').trim(),
    };
  }
  return { mime: null, base64: raw };
};
const sanitizeFilename = (name) =>
  String(name || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^_+/, '')
    .slice(0, 120) || 'avatar';
const parseBuyerProfileInput = (body = {}) => ({
  company_name: optionalText(pickFirstDefined(body.company_name, body.companyName)),
  state_id: optionalId(pickFirstDefined(body.state_id, body.stateId)),
  city_id: optionalId(pickFirstDefined(body.city_id, body.cityId)),
  state: optionalText(pickFirstDefined(body.state, body.state_name, body.stateName)),
  city: optionalText(pickFirstDefined(body.city, body.city_name, body.cityName)),
});

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
  const cookies = parseCookies(event?.headers?.cookie || event?.headers?.Cookie || '');
  return cookies[name];
};

const parseBearerToken = (headers = {}) => {
  const header = headers.Authorization || headers.authorization;
  if (!header || typeof header !== 'string') return null;
  if (!header.startsWith('Bearer ')) return null;
  return header.replace('Bearer ', '').trim();
};

const createCsrfToken = () => randomBytes(24).toString('hex');

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
      '[Auth] JWT_SECRET missing. Falling back to another secret. Configure a dedicated JWT_SECRET.'
    );
    warnedMissingJwtSecret = true;
  }

  return secret;
};

const signAuthToken = (payload) => jwt.sign(payload, getJwtSecret(), { expiresIn: AUTH_TOKEN_TTL });

const verifyAuthToken = (token) => {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
};

const isBcryptHash = (value) => typeof value === 'string' && value.startsWith('$2');

const hashPassword = async (password) => {
  if (!password) return '';
  return bcrypt.hash(String(password), 10);
};

const verifyPassword = async (password, storedHash) => {
  if (!password || !storedHash) return false;
  if (isBcryptHash(storedHash)) {
    return bcrypt.compare(String(password), storedHash);
  }
  return String(password) === String(storedHash);
};

const serializeCookie = (name, value, options = {}) => {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value || '')}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.expires instanceof Date) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
};

const cookieOptions = ({ httpOnly }) => {
  const isProd = process.env.NODE_ENV === 'production';
  const opts = {
    httpOnly,
    secure: isProd,
    sameSite: 'Lax',
    path: '/',
  };
  if (AUTH_COOKIE_DOMAIN) opts.domain = AUTH_COOKIE_DOMAIN;
  return opts;
};

const setAuthCookies = (token, csrfToken) => {
  const maxAgeSec = Math.max(1, AUTH_COOKIE_MAX_AGE_DAYS) * 24 * 60 * 60;
  return [
    serializeCookie(AUTH_COOKIE_NAME, token, {
      ...cookieOptions({ httpOnly: true }),
      maxAge: maxAgeSec,
    }),
    serializeCookie(CSRF_COOKIE_NAME, csrfToken, {
      ...cookieOptions({ httpOnly: false }),
      maxAge: maxAgeSec,
    }),
  ];
};

const clearAuthCookies = () => {
  const base = { ...cookieOptions({ httpOnly: true }), maxAge: 0, expires: new Date(0) };
  const baseCsrf = { ...cookieOptions({ httpOnly: false }), maxAge: 0, expires: new Date(0) };
  return [
    serializeCookie(AUTH_COOKIE_NAME, '', base),
    serializeCookie(CSRF_COOKIE_NAME, '', baseCsrf),
  ];
};

const buildAuthUserPayload = (user) => {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: normalizeRole(user.role || 'USER'),
    full_name: user.full_name || user.email?.split('@')[0],
    user_metadata: {
      full_name: user.full_name || user.email?.split('@')[0],
      role: normalizeRole(user.role || 'USER'),
    },
    app_metadata: {
      role: normalizeRole(user.role || 'USER'),
    },
  };
};

const getOrigin = (event) =>
  event?.headers?.origin ||
  event?.headers?.Origin ||
  '*';

const baseHeaders = (event) => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': getOrigin(event),
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
  'Vary': 'Origin',
});

const json = (event, statusCode, body, cookies = []) => {
  const response = {
    statusCode,
    headers: baseHeaders(event),
    body: JSON.stringify(body),
  };
  if (cookies.length > 0) {
    response.multiValueHeaders = { 'Set-Cookie': cookies };
  }
  return response;
};

const ok = (event, body, cookies) => json(event, 200, body, cookies);
const bad = (event, msg, details, statusCode = 400) =>
  json(event, statusCode, { success: false, error: msg, details });
const unauthorized = (event, msg) => bad(event, msg || 'Unauthorized', null, 401);
const forbidden = (event, msg) => bad(event, msg || 'Forbidden', null, 403);
const fail = (event, msg, details) => json(event, 500, { success: false, error: msg, details });

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

const parseTail = (eventPath) => {
  const parts = String(eventPath || '').split('/').filter(Boolean);
  const fnIndex = parts.indexOf('auth');
  if (fnIndex >= 0) return parts.slice(fnIndex + 1);
  return parts;
};

const ensureUserRole = async (user) => {
  if (!user?.id) return user;
  const resolvedRole = await resolveRoleForUser({
    userId: user.id,
    email: user.email,
    fallbackRole: user.role,
  });

  if (resolvedRole && normalizeRole(user.role) !== normalizeRole(resolvedRole)) {
    return upsertPublicUser({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: resolvedRole,
      phone: user.phone,
      password_hash: user.password_hash,
      allowPasswordUpdate: false,
    });
  }

  return user;
};

const resolveRoleForUser = async ({ userId, email, fallbackRole }) => {
  const fallback = normalizeRole(fallbackRole);
  if (fallback) return fallback;

  const targetEmail = normalizeEmail(email);

  if (userId || targetEmail) {
    const { data: emp } = await supabase
      .from('employees')
      .select('role')
      .or(
        [
          userId ? `user_id.eq.${userId}` : null,
          targetEmail ? `email.eq.${targetEmail}` : null,
        ]
          .filter(Boolean)
          .join(',')
      )
      .maybeSingle();

    if (emp?.role) return normalizeRole(emp.role);
  }

  if (userId || targetEmail) {
    const { data: vendor } = await supabase
      .from('vendors')
      .select('id')
      .or(
        [
          userId ? `user_id.eq.${userId}` : null,
          targetEmail ? `email.eq.${targetEmail}` : null,
        ]
          .filter(Boolean)
          .join(',')
      )
      .maybeSingle();

    if (vendor?.id) return 'VENDOR';
  }

  if (userId || targetEmail) {
    const { data: buyer } = await supabase
      .from('buyers')
      .select('id')
      .or(
        [
          userId ? `user_id.eq.${userId}` : null,
          targetEmail ? `email.eq.${targetEmail}` : null,
        ]
          .filter(Boolean)
          .join(',')
      )
      .maybeSingle();

    if (buyer?.id) return 'BUYER';
  }

  return 'USER';
};

const getPublicUserByEmail = async (email) => {
  const target = normalizeEmail(email);
  if (!target) return null;

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', target)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
};

const getPublicUserById = async (userId) => {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
};

const upsertPublicUser = async ({
  id,
  email,
  full_name,
  role,
  phone,
  password_hash,
  allowPasswordUpdate = false,
}) => {
  const nowIso = new Date().toISOString();
  const targetEmail = normalizeEmail(email);
  if (!targetEmail) throw new Error('Email is required');

  const existing = await getPublicUserByEmail(targetEmail);
  if (existing) {
    const updates = { updated_at: nowIso };
    if (full_name && full_name !== existing.full_name) updates.full_name = full_name;
    if (role && normalizeRole(role) !== normalizeRole(existing.role)) updates.role = normalizeRole(role);
    if (phone && phone !== existing.phone) updates.phone = phone;
    if (password_hash && (allowPasswordUpdate || !existing.password_hash)) {
      updates.password_hash = password_hash;
    }

    if (Object.keys(updates).length > 1) {
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', existing.id)
        .select('*')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data || { ...existing, ...updates };
    }
    return existing;
  }

  const newId = id || randomUUID();
  const payload = {
    id: newId,
    email: targetEmail,
    full_name: full_name || targetEmail.split('@')[0],
    role: normalizeRole(role) || 'USER',
    phone: phone || null,
    password_hash: password_hash || null,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const { data, error } = await supabase
    .from('users')
    .insert([payload])
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || payload;
};

const setPublicUserPassword = async (userId, password) => {
  if (!userId) throw new Error('Missing user id');
  const password_hash = await hashPassword(password);
  const { data, error } = await supabase
    .from('users')
    .update({
      password_hash,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
};

const syncProfileUserId = async (userId, email) => {
  if (!userId || !email) return;
  const targetEmail = normalizeEmail(email);

  await supabase.from('employees').update({ user_id: userId }).eq('email', targetEmail).is('user_id', null);
  await supabase.from('vendors').update({ user_id: userId }).eq('email', targetEmail).is('user_id', null);
  await supabase.from('buyers').update({ user_id: userId }).eq('email', targetEmail).is('user_id', null);
};

const assertUserActive = async (user) => {
  if (!user?.id) return { ok: false, error: 'User not found' };
  const role = normalizeRole(user.role || 'USER');

  if (role === 'VENDOR') {
    const { data: vendor } = await supabase
      .from('vendors')
      .select('is_active')
      .or(
        [
          `user_id.eq.${user.id}`,
          user.email ? `email.eq.${user.email}` : null,
        ]
          .filter(Boolean)
          .join(',')
      )
      .maybeSingle();
    if (vendor && vendor.is_active === false) {
      return { ok: false, error: 'Vendor account is inactive' };
    }
  }

  if (role === 'BUYER') {
    const { data: buyer } = await supabase
      .from('buyers')
      .select('is_active')
      .or(
        [
          `user_id.eq.${user.id}`,
          user.email ? `email.eq.${user.email}` : null,
        ]
          .filter(Boolean)
          .join(',')
      )
      .maybeSingle();
    if (buyer && buyer.is_active === false) {
      return { ok: false, error: 'Buyer account is inactive' };
    }
  }

  if (['ADMIN', 'HR', 'DATA_ENTRY', 'SUPPORT', 'SALES', 'FINANCE', 'SUPERADMIN'].includes(role)) {
    const { data: emp } = await supabase
      .from('employees')
      .select('status')
      .or(
        [
          `user_id.eq.${user.id}`,
          user.email ? `email.eq.${user.email}` : null,
        ]
          .filter(Boolean)
          .join(',')
      )
      .maybeSingle();
    const status = String(emp?.status || 'ACTIVE').toUpperCase();
    if (emp && status !== 'ACTIVE') {
      return { ok: false, error: 'Employee account is inactive' };
    }
  }

  return { ok: true };
};

const verifyViaSupabase = async (email, password) => {
  if (!supabaseAnon?.auth?.signInWithPassword) {
    return { user: null, error: 'Supabase anon client not available' };
  }
  const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
  if (error || !data?.user) {
    return { user: null, error: error?.message || 'Invalid credentials' };
  }
  return { user: data.user, error: null };
};

const upsertBuyerProfile = async ({
  userId,
  email,
  full_name,
  phone,
  company_name,
  state_id,
  city_id,
  state,
  city,
} = {}) => {
  const normalizedEmail = normalizeEmail(email);
  if (!userId && !normalizedEmail) return null;

  let existing = null;

  if (userId) {
    const { data } = await supabase
      .from('buyers')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (data) existing = data;
  }

  if (!existing && normalizedEmail) {
    const { data } = await supabase
      .from('buyers')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (data) existing = data;
  }

  const nameValue = optionalText(full_name) || (normalizedEmail ? normalizedEmail.split('@')[0] : 'Buyer');
  const phoneValue = optionalText(phone);
  const companyNameValue = optionalText(company_name);
  const stateIdValue = optionalId(state_id);
  const cityIdValue = optionalId(city_id);
  const stateValue = optionalText(state);
  const cityValue = optionalText(city);

  if (existing) {
    const updates = {};
    const linkingLegacyBuyer = Boolean(userId && !existing.user_id);

    if (userId && existing.user_id !== userId) updates.user_id = userId;
    if (normalizedEmail && normalizeEmail(existing.email) !== normalizedEmail) updates.email = normalizedEmail;
    if (nameValue && existing.full_name !== nameValue) updates.full_name = nameValue;
    if (phoneValue && existing.phone !== phoneValue) updates.phone = phoneValue;
    if (companyNameValue && existing.company_name !== companyNameValue) updates.company_name = companyNameValue;
    if (stateIdValue && String(existing.state_id || '') !== String(stateIdValue)) updates.state_id = stateIdValue;
    if (cityIdValue && String(existing.city_id || '') !== String(cityIdValue)) updates.city_id = cityIdValue;
    if (stateValue && existing.state !== stateValue) updates.state = stateValue;
    if (cityValue && existing.city !== cityValue) updates.city = cityValue;

    if (linkingLegacyBuyer) {
      const normalizedStatus = String(existing.status || '').toUpperCase();
      const hasExplicitSuspensionFlag =
        Boolean(existing.terminated_at) ||
        normalizedStatus === 'SUSPENDED' ||
        normalizedStatus === 'TERMINATED';

      if (existing.is_active === false && !hasExplicitSuspensionFlag) {
        updates.is_active = true;
      }

      if ('status' in existing && !hasExplicitSuspensionFlag) {
        if (!normalizedStatus || normalizedStatus === 'INACTIVE') {
          updates.status = 'ACTIVE';
        }
      }
    }

    if (!Object.keys(updates).length) return existing;

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('buyers')
      .update(updates)
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();

    if (error) throw new Error(error.message || 'Failed to update buyer profile');
    return data || { ...existing, ...updates };
  }

  const nowIso = new Date().toISOString();
  const payload = {
    user_id: userId || null,
    full_name: nameValue,
    email: normalizedEmail || null,
    phone: phoneValue,
    company_name: companyNameValue,
    state_id: stateIdValue,
    city_id: cityIdValue,
    state: stateValue,
    city: cityValue,
    is_active: true,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const { data, error } = await supabase
    .from('buyers')
    .insert([payload])
    .select('*')
    .maybeSingle();

  if (!error) return data || payload;

  if (String(error?.code || '') === '23505') {
    if (userId) {
      const { data: byUserId } = await supabase
        .from('buyers')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (byUserId) return byUserId;
    }

    if (normalizedEmail) {
      const { data: byEmail } = await supabase
        .from('buyers')
        .select('*')
        .eq('email', normalizedEmail)
        .maybeSingle();
      if (byEmail) return byEmail;
    }
  }

  throw new Error(error.message || 'Failed to create buyer profile');
};

const deriveBuyerAccountStatus = (buyer) => {
  if (!buyer) return 'UNKNOWN';
  if (buyer.terminated_at) return 'TERMINATED';
  if (buyer.is_active === false) return 'SUSPENDED';
  if (typeof buyer.status === 'string' && buyer.status.trim()) {
    return buyer.status.trim().toUpperCase();
  }
  return 'ACTIVE';
};

const resolveBuyerProfileForUser = async (user) => {
  if (!user?.id && !user?.email) return null;
  return upsertBuyerProfile({
    userId: user?.id,
    email: user?.email,
    full_name: user?.full_name,
    phone: user?.phone,
  });
};

const findBuyerProfileForUser = async (user) => {
  if (!user?.id && !user?.email) return null;

  const identityFilters = [
    user?.id ? `user_id.eq.${user.id}` : null,
    user?.email ? `email.eq.${normalizeEmail(user.email)}` : null,
  ]
    .filter(Boolean)
    .join(',');

  if (!identityFilters) return null;

  const { data } = await supabase
    .from('buyers')
    .select('*')
    .or(identityFilters)
    .limit(1)
    .maybeSingle();

  return data || null;
};

const resolveBuyerAccessUser = async (user) => {
  if (!user?.id && !user?.email) {
    return { user, buyer: null, upgraded: false };
  }

  let ensuredUser = await ensureUserRole(user);

  if (normalizeRole(ensuredUser?.role) === 'BUYER') {
    const buyer = await resolveBuyerProfileForUser(ensuredUser);
    return { user: ensuredUser, buyer, upgraded: false };
  }

  const buyerByIdentity = await findBuyerProfileForUser(ensuredUser);
  if (!buyerByIdentity) {
    return { user: ensuredUser, buyer: null, upgraded: false };
  }

  ensuredUser = await upsertPublicUser({
    id: ensuredUser.id,
    email: ensuredUser.email,
    full_name: ensuredUser.full_name || buyerByIdentity.full_name,
    role: 'BUYER',
    phone: ensuredUser.phone || buyerByIdentity.phone || null,
    password_hash: ensuredUser.password_hash,
    allowPasswordUpdate: false,
  });

  const buyer = await resolveBuyerProfileForUser(ensuredUser);
  return { user: ensuredUser, buyer: buyer || buyerByIdentity, upgraded: true };
};

const resolveVendorProfileForUser = async (user) => {
  if (!user?.id && !user?.email) return null;
  let vendor = null;

  if (user?.id) {
    const { data } = await supabase
      .from('vendors')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    vendor = data || null;
  }

  if (!vendor && user?.email) {
    const normalizedEmail = normalizeEmail(user.email);
    const { data } = await supabase
      .from('vendors')
      .select('*')
      .ilike('email', normalizedEmail)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    vendor = data || null;
  }

  return vendor;
};

const parseBuyerProfileUpdates = (body = {}) => {
  const updates = {};

  const fullNameRaw = pickFirstDefined(body.full_name, body.fullName);
  if (fullNameRaw !== undefined) {
    const value = optionalText(fullNameRaw);
    if (value) updates.full_name = value;
  }

  const phoneRaw = pickFirstDefined(body.phone, body.mobile_number, body.mobileNumber);
  if (phoneRaw !== undefined) updates.phone = optionalText(phoneRaw);

  const companyRaw = pickFirstDefined(body.company_name, body.companyName);
  if (companyRaw !== undefined) updates.company_name = optionalText(companyRaw);

  const companyTypeRaw = pickFirstDefined(body.company_type, body.companyType);
  if (companyTypeRaw !== undefined) updates.company_type = optionalText(companyTypeRaw);

  const industryRaw = pickFirstDefined(body.industry);
  if (industryRaw !== undefined) updates.industry = optionalText(industryRaw);

  const gstRaw = pickFirstDefined(body.gst_number, body.gstNumber);
  if (gstRaw !== undefined) updates.gst_number = optionalText(gstRaw);

  const panRaw = pickFirstDefined(body.pan_card, body.panCard);
  if (panRaw !== undefined) updates.pan_card = optionalText(panRaw);

  const addressRaw = pickFirstDefined(body.address);
  if (addressRaw !== undefined) updates.address = optionalText(addressRaw);

  const stateIdRaw = pickFirstDefined(body.state_id, body.stateId);
  if (stateIdRaw !== undefined) updates.state_id = optionalId(stateIdRaw);

  const cityIdRaw = pickFirstDefined(body.city_id, body.cityId);
  if (cityIdRaw !== undefined) updates.city_id = optionalId(cityIdRaw);

  const stateRaw = pickFirstDefined(body.state, body.state_name, body.stateName);
  if (stateRaw !== undefined) updates.state = optionalText(stateRaw);

  const cityRaw = pickFirstDefined(body.city, body.city_name, body.cityName);
  if (cityRaw !== undefined) updates.city = optionalText(cityRaw);

  const pincodeRaw = pickFirstDefined(body.pincode, body.pin_code, body.pinCode);
  if (pincodeRaw !== undefined) updates.pincode = optionalText(pincodeRaw);

  const avatarRaw = pickFirstDefined(body.avatar_url, body.avatarUrl);
  if (avatarRaw !== undefined) updates.avatar_url = optionalText(avatarRaw);

  return updates;
};

const resolveAuthenticatedUser = async (event) => {
  const bearer = parseBearerToken(event?.headers || {});
  if (bearer) {
    const { data: authData, error: authError } = await supabase.auth.getUser(bearer);
    if (authError || !authData?.user) return { user: null, mode: 'bearer', invalid: true };

    const authUser = authData.user;
    const authUserId = String(authUser?.id || '').trim();
    const authEmail = normalizeEmail(authUser?.email || '');
    let user = authUserId ? await getPublicUserById(authUserId) : null;
    if (!user && authEmail) user = await getPublicUserByEmail(authEmail);

    if (!user && authEmail) {
      const resolvedRole = await resolveRoleForUser({
        userId: authUserId || null,
        email: authEmail,
        fallbackRole: authUser?.user_metadata?.role,
      });
      user = await upsertPublicUser({
        id: authUserId || undefined,
        email: authEmail,
        full_name: authUser?.user_metadata?.full_name,
        role: resolvedRole,
        phone: authUser?.user_metadata?.phone,
        allowPasswordUpdate: false,
      });
      if (authUserId) {
        await syncProfileUserId(authUserId, authEmail);
      }
    }

    if (!user) return { user: null, mode: 'bearer', invalid: true };
    return { user: await ensureUserRole(user), mode: 'bearer', token: bearer };
  }

  const cookieToken = getCookie(event, AUTH_COOKIE_NAME);
  if (!cookieToken) return { user: null, mode: 'cookie', token: null, invalid: false };

  const decoded = verifyAuthToken(cookieToken);
  if (!decoded?.sub) return { user: null, mode: 'cookie', token: cookieToken, invalid: true };

  let user = await getPublicUserById(decoded.sub);
  if (!user && decoded?.email) user = await getPublicUserByEmail(decoded.email);

  if (!user && decoded?.email) {
    const resolvedRole = await resolveRoleForUser({
      userId: decoded.sub,
      email: decoded.email,
      fallbackRole: decoded.role,
    });
    user = await upsertPublicUser({
      id: decoded.sub,
      email: decoded.email,
      full_name: decoded?.email ? String(decoded.email).split('@')[0] : undefined,
      role: resolvedRole,
      allowPasswordUpdate: false,
    });
    await syncProfileUserId(decoded.sub, decoded.email);
  }

  if (!user) return { user: null, mode: 'cookie', token: cookieToken, invalid: true };
  return { user: await ensureUserRole(user), mode: 'cookie', token: cookieToken, invalid: false };
};

const issueSession = (user) => {
  const token = signAuthToken({
    sub: user.id,
    email: user.email,
    role: normalizeRole(user.role || 'USER'),
    type: 'USER',
  });
  const csrfToken = createCsrfToken();
  return { token, csrfToken };
};

const isSafeMethod = (method) => {
  const m = String(method || '').toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS';
};

const ensureCsrfValid = (event) => {
  const cookieToken = getCookie(event, CSRF_COOKIE_NAME);
  const header =
    event.headers?.['x-csrf-token'] ||
    event.headers?.['x-xsrf-token'] ||
    event.headers?.['csrf-token'];
  return !!cookieToken && !!header && String(cookieToken) === String(header);
};

export const handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return ok(event, { ok: true });

    const tail = parseTail(event.path);

    if (event.httpMethod === 'POST' && tail[0] === 'login') {
      const body = readBody(event);
      const email = normalizeEmail(body?.email);
      const password = String(body?.password || '');
      const roleHint = normalizeRole(body?.role || body?.role_hint || body?.roleHint || '');

      if (!email || !password) return bad(event, 'Email and password are required');
      if (!isValidEmail(email)) return bad(event, 'Invalid email format');

      // Strict buyer portal isolation:
      // buyer login requires an existing buyer identity by email
      // and must not use vendor-only identities.
      if (roleHint === 'BUYER') {
        const { data: buyerByEmail, error: buyerLookupError } = await supabase
          .from('buyers')
          .select('id')
          .ilike('email', email)
          .limit(1)
          .maybeSingle();

        if (buyerLookupError) {
          // eslint-disable-next-line no-console
          console.error('[Auth] Buyer lookup failed during login:', buyerLookupError?.message || buyerLookupError);
          return fail(event, 'Login failed');
        }

        if (!buyerByEmail?.id) {
          return forbidden(event, BUYER_NOT_REGISTERED_MESSAGE);
        }

        const { data: vendorByEmail } = await supabase
          .from('vendors')
          .select('id')
          .ilike('email', email)
          .limit(1)
          .maybeSingle();

        if (vendorByEmail?.id) {
          return forbidden(event, BUYER_NOT_REGISTERED_MESSAGE);
        }
      }

      let user = await getPublicUserByEmail(email);

      if (user?.password_hash) {
        const okPassword = await verifyPassword(password, user.password_hash);
        if (!okPassword) return unauthorized(event, 'Invalid credentials');

        if (!isBcryptHash(user.password_hash)) {
          const upgraded = await hashPassword(password);
          user = await upsertPublicUser({
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            role: user.role,
            phone: user.phone,
            password_hash: upgraded,
            allowPasswordUpdate: true,
          });
        }
      } else if (ENABLE_SUPABASE_AUTH_MIGRATION) {
        const { user: authUser, error } = await verifyViaSupabase(email, password);
        if (!authUser) {
          return unauthorized(event, error || 'Invalid credentials');
        }

        const resolvedRole = await resolveRoleForUser({
          userId: authUser.id,
          email,
          fallbackRole: authUser?.user_metadata?.role,
        });

        const password_hash = await hashPassword(password);
        user = await upsertPublicUser({
          id: authUser.id,
          email,
          full_name: authUser?.user_metadata?.full_name,
          role: resolvedRole,
          phone: authUser?.user_metadata?.phone,
          password_hash,
          allowPasswordUpdate: true,
        });

        await syncProfileUserId(authUser.id, email);
      } else {
        return unauthorized(event, 'Invalid credentials');
      }

      user = await ensureUserRole(user);
      const currentRole = normalizeRole(user?.role || 'USER');
      let buyerProfile = null;

      // Vendor portal fallback: if caller hinted VENDOR and vendor identity exists,
      // align public user role to VENDOR for this session.
      if (roleHint === 'VENDOR') {
        const vendor = await resolveVendorProfileForUser(user);
        if (!vendor) {
          return forbidden(event, 'Vendor profile not found');
        }

        user = await upsertPublicUser({
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: 'VENDOR',
          phone: user.phone || vendor.phone || null,
          password_hash: user.password_hash,
          allowPasswordUpdate: false,
        });

        if (vendor.id && (!vendor.user_id || vendor.user_id !== user.id)) {
          const { error: linkError } = await supabase
            .from('vendors')
            .update({ user_id: user.id })
            .eq('id', vendor.id);

          if (linkError) {
            // eslint-disable-next-line no-console
            console.warn('[Auth] Vendor relink failed during login:', linkError?.message || linkError);
          }
        }
      }

      // Buyer portal strict session:
      // vendor accounts must not authenticate in buyer portal.
      // only existing buyer identities are allowed to login as BUYER.
      if (roleHint === 'BUYER') {
        const vendorForUser = await resolveVendorProfileForUser(user);
        if (currentRole === 'VENDOR' || vendorForUser?.id) {
          return forbidden(event, BUYER_NOT_REGISTERED_MESSAGE);
        }

        const existingBuyer = await findBuyerProfileForUser(user);
        if (!existingBuyer && currentRole !== 'BUYER') {
          return forbidden(event, BUYER_NOT_REGISTERED_MESSAGE);
        }

        buyerProfile = await upsertBuyerProfile({
          userId: user.id,
          email: user.email,
          full_name: user.full_name,
          phone: user.phone,
        });

        user = await upsertPublicUser({
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: 'BUYER',
          phone: user.phone || buyerProfile?.phone || null,
          password_hash: user.password_hash,
          allowPasswordUpdate: false,
        });
      }

      if (!buyerProfile && normalizeRole(user?.role) === 'BUYER') {
        try {
          buyerProfile = await resolveBuyerProfileForUser(user);
        } catch (profileError) {
          // eslint-disable-next-line no-console
          console.error('[Auth] Buyer profile resolve failed:', profileError?.message || profileError);
        }
      }

      const activeCheck = await assertUserActive(user);
      if (!activeCheck.ok) {
        return forbidden(event, activeCheck.error || 'Account inactive');
      }

      const payload = buildAuthUserPayload(user);
      if (buyerProfile) {
        payload.buyer_id = buyerProfile.id || null;
        payload.is_active =
          typeof buyerProfile.is_active === 'boolean' ? buyerProfile.is_active : true;
        payload.account_status = deriveBuyerAccountStatus(buyerProfile);
        payload.suspension_reason = buyerProfile.terminated_reason || null;
      }
      const { token, csrfToken } = issueSession(user);
      const cookies = setAuthCookies(token, csrfToken);

      return ok(event, { success: true, user: payload, buyer: buyerProfile || null }, cookies);
    }

    if (event.httpMethod === 'POST' && tail[0] === 'register') {
      const body = readBody(event);
      const email = normalizeEmail(body?.email);
      const password = String(body?.password || '');
      const full_name = String(body?.full_name || '').trim() || undefined;
      const role = normalizeRole(body?.role || 'USER');
      const phone = String(body?.phone || '').trim() || undefined;
      const noSession = body?.no_session === true;
      const buyerProfileInput = parseBuyerProfileInput(body);

      if (!email || !password) return bad(event, 'Email and password are required');
      if (!isValidEmail(email)) return bad(event, 'Invalid email format');
      if (password.length < 6) {
        return bad(event, 'Password must be at least 6 characters long');
      }

      const existing = await getPublicUserByEmail(email);
      if (existing?.id) {
        return bad(event, 'A user with this email address has already been registered', null, 409);
      }

      let userId = null;
      if (ENABLE_SUPABASE_AUTH_SIGNUP && supabase?.auth?.admin?.createUser) {
        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name, role, phone },
          app_metadata: { role },
        });
        if (error || !data?.user) {
          const msg = String(error?.message || '').toLowerCase();
          if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
            return bad(event, 'A user with this email address has already been registered', null, 409);
          }
          return bad(event, error?.message || 'Auth signup failed');
        }
        userId = data.user.id;
      }

      const password_hash = await hashPassword(password);
      let user = await upsertPublicUser({
        id: userId || undefined,
        email,
        full_name,
        role,
        phone,
        password_hash,
        allowPasswordUpdate: true,
      });

      await syncProfileUserId(user.id, email);
      user = await ensureUserRole(user);

      let buyerProfile = null;
      if (normalizeRole(user?.role) === 'BUYER') {
        buyerProfile = await upsertBuyerProfile({
          userId: user.id,
          email,
          full_name: full_name || user.full_name,
          phone,
          ...buyerProfileInput,
        });
      }

      const payload = buildAuthUserPayload(user);
      if (buyerProfile) {
        payload.buyer_id = buyerProfile.id || null;
        payload.is_active =
          typeof buyerProfile.is_active === 'boolean' ? buyerProfile.is_active : true;
        payload.account_status = deriveBuyerAccountStatus(buyerProfile);
        payload.suspension_reason = buyerProfile.terminated_reason || null;
      }

      if (noSession) {
        return ok(event, {
          success: true,
          user: payload,
          buyer: buyerProfile || null,
          session_skipped: true,
        });
      }

      const { token, csrfToken } = issueSession(user);
      const cookies = setAuthCookies(token, csrfToken);

      return ok(event, { success: true, user: payload, buyer: buyerProfile || null }, cookies);
    }

    if (event.httpMethod === 'GET' && tail[0] === 'me') {
      const auth = await resolveAuthenticatedUser(event);
      if (!auth?.user) {
        if (auth?.mode === 'cookie' && auth?.token && auth?.invalid) {
          const cookies = clearAuthCookies();
          return ok(event, { user: null, buyer: null }, cookies);
        }
        return ok(event, { user: null, buyer: null });
      }

      const user = auth.user;
      let buyerProfile = null;
      if (normalizeRole(user?.role) === 'BUYER') {
        try {
          buyerProfile = await resolveBuyerProfileForUser(user);
        } catch (profileError) {
          // eslint-disable-next-line no-console
          console.error('[Auth] Buyer profile resolve failed:', profileError?.message || profileError);
        }
      }

      const payload = buildAuthUserPayload(user);
      if (buyerProfile) {
        payload.buyer_id = buyerProfile.id || null;
        payload.is_active =
          typeof buyerProfile.is_active === 'boolean' ? buyerProfile.is_active : true;
        payload.account_status = deriveBuyerAccountStatus(buyerProfile);
        payload.suspension_reason = buyerProfile.terminated_reason || null;
      }

      if (auth.mode === 'cookie') {
        const csrfExisting = getCookie(event, CSRF_COOKIE_NAME);
        if (!csrfExisting) {
          const csrfToken = createCsrfToken();
          const cookies = setAuthCookies(auth.token, csrfToken);
          return ok(event, { user: payload, buyer: buyerProfile || null }, cookies);
        }
      }

      return ok(event, { user: payload, buyer: buyerProfile || null });
    }

    if (event.httpMethod === 'GET' && tail[0] === 'buyer' && tail[1] === 'profile') {
      const auth = await resolveAuthenticatedUser(event);
      if (!auth?.user) return unauthorized(event, 'Unauthorized');

      const access = await resolveBuyerAccessUser(auth.user);
      const user = access?.user || auth.user;
      const buyer = access?.buyer || null;
      if (!buyer) return forbidden(event, 'Forbidden');

      const payload = buildAuthUserPayload(user);
      payload.buyer_id = buyer.id || null;
      payload.is_active = typeof buyer.is_active === 'boolean' ? buyer.is_active : true;
      payload.account_status = deriveBuyerAccountStatus(buyer);
      payload.suspension_reason = buyer.terminated_reason || null;

      if (auth.mode === 'cookie' && access?.upgraded) {
        const { token, csrfToken } = issueSession(user);
        const cookies = setAuthCookies(token, csrfToken);
        return ok(
          event,
          {
            success: true,
            buyer,
            account_status: deriveBuyerAccountStatus(buyer),
            user: payload,
          },
          cookies
        );
      }

      return ok(event, {
        success: true,
        buyer,
        account_status: deriveBuyerAccountStatus(buyer),
        user: payload,
      });
    }

    if (event.httpMethod === 'PATCH' && tail[0] === 'buyer' && tail[1] === 'profile') {
      const hasBearer = Boolean(parseBearerToken(event.headers || {}));
      if (!hasBearer && !ensureCsrfValid(event)) {
        return forbidden(event, 'CSRF token mismatch');
      }

      const auth = await resolveAuthenticatedUser(event);
      if (!auth?.user) return unauthorized(event, 'Unauthorized');

      let access = await resolveBuyerAccessUser(auth.user);
      let user = access?.user || auth.user;
      const buyer = access?.buyer || null;
      if (!buyer) return forbidden(event, 'Forbidden');
      if (!buyer.id) return bad(event, 'Buyer profile not found', null, 404);

      const requestedUpdates = parseBuyerProfileUpdates(readBody(event));
      const updates = {};

      for (const [key, value] of Object.entries(requestedUpdates)) {
        if (key in buyer) updates[key] = value;
      }

      if (!Object.keys(updates).length) {
        return ok(event, { success: true, buyer });
      }

      updates.updated_at = new Date().toISOString();

      const { data: updatedBuyer, error } = await supabase
        .from('buyers')
        .update(updates)
        .eq('id', buyer.id)
        .select('*')
        .maybeSingle();

      if (error) {
        return fail(event, error.message || 'Failed to update buyer profile');
      }

      if (updates.full_name || updates.phone) {
        user = await upsertPublicUser({
          id: user.id,
          email: user.email,
          full_name: updates.full_name || user.full_name,
          role: user.role,
          phone: updates.phone || user.phone,
          password_hash: user.password_hash,
          allowPasswordUpdate: false,
        });
      }

      const responsePayload = {
        success: true,
        buyer: updatedBuyer || { ...buyer, ...updates },
        user: buildAuthUserPayload(user),
      };

      if (auth.mode === 'cookie') {
        const { token, csrfToken } = issueSession(user);
        const cookies = setAuthCookies(token, csrfToken);
        return ok(event, responsePayload, cookies);
      }

      return ok(event, responsePayload);
    }

    if (
      event.httpMethod === 'POST' &&
      tail[0] === 'buyer' &&
      tail[1] === 'profile' &&
      tail[2] === 'avatar'
    ) {
      const hasBearer = Boolean(parseBearerToken(event.headers || {}));
      if (!hasBearer && !ensureCsrfValid(event)) {
        return forbidden(event, 'CSRF token mismatch');
      }

      const auth = await resolveAuthenticatedUser(event);
      if (!auth?.user) return unauthorized(event, 'Unauthorized');

      const access = await resolveBuyerAccessUser(auth.user);
      const buyer = access?.buyer || null;
      if (!buyer?.id) return forbidden(event, 'Buyer profile not found');

      const body = readBody(event);
      const parsed = parseDataUrl(body?.data_url || body?.dataUrl || '');
      if (!parsed?.base64) return bad(event, 'Empty upload payload');

      const requestedType = String(body?.content_type || body?.contentType || '')
        .trim()
        .toLowerCase();
      const mime = parsed.mime || requestedType;
      if (!BUYER_AVATAR_ALLOWED_MIME.has(mime)) {
        return bad(event, 'Unsupported image type. Use JPG/PNG/WebP/GIF.');
      }

      let buffer;
      try {
        buffer = Buffer.from(parsed.base64, 'base64');
      } catch {
        return bad(event, 'Invalid base64 payload');
      }

      if (!buffer || buffer.length === 0) return bad(event, 'Empty upload payload');
      if (buffer.length > BUYER_AVATAR_MAX_BYTES) return bad(event, 'Image too large (max 5MB)');

      const rawName = sanitizeFilename(body?.file_name || body?.fileName || 'avatar');
      const ext = rawName.includes('.')
        ? String(rawName.split('.').pop() || '').toLowerCase()
        : (BUYER_AVATAR_EXT_BY_MIME[mime] || 'jpg');
      const baseName = rawName.includes('.') ? rawName.replace(/\.[^/.]+$/, '') : rawName;
      const fileName = `${baseName || 'avatar'}.${ext}`;
      const objectPath = `buyer-avatars/${buyer.id}/${Date.now()}-${randomUUID()}-${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(objectPath, buffer, {
          contentType: mime,
          upsert: false,
          cacheControl: '3600',
        });

      if (uploadError) {
        return fail(event, uploadError.message || 'Upload failed');
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(objectPath);
      const publicUrl = data?.publicUrl || null;
      if (!publicUrl) return fail(event, 'Failed to build public url');

      const { error: updateError } = await supabase
        .from('buyers')
        .update({
          avatar_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', buyer.id);

      if (updateError) {
        return fail(event, updateError.message || 'Failed to save avatar');
      }

      return ok(event, { success: true, publicUrl });
    }

    if (event.httpMethod === 'POST' && tail[0] === 'logout') {
      const cookies = clearAuthCookies();
      return ok(event, { success: true }, cookies);
    }

    if (event.httpMethod === 'PATCH' && tail[0] === 'password') {
      const hasBearer = Boolean(parseBearerToken(event.headers || {}));
      if (!isSafeMethod(event.httpMethod) && !hasBearer && !ensureCsrfValid(event)) {
        return forbidden(event, 'CSRF token mismatch');
      }

      const auth = await resolveAuthenticatedUser(event);
      if (!auth?.user) return unauthorized(event, 'Unauthorized');

      const body = readBody(event);
      const currentPassword = String(body?.current_password || '');
      const newPassword = String(body?.new_password || body?.password || '');

      if (!newPassword || newPassword.length < 6) {
        return bad(event, 'Password must be at least 6 characters long');
      }

      const user = await getPublicUserById(auth.user.id);
      if (!user) return bad(event, 'User not found', null, 404);

      if (user.password_hash && currentPassword) {
        const okPassword = await verifyPassword(currentPassword, user.password_hash);
        if (!okPassword) return unauthorized(event, 'Invalid current password');
      }

      await setPublicUserPassword(user.id, newPassword);
      return ok(event, { success: true });
    }

    return bad(event, 'Not found', null, 404);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Auth] Function failed:', error?.message || error);
    return fail(event, 'Auth failed', error?.message || String(error));
  }
};
