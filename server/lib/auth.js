import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';
import { supabase } from './supabaseClient.js';

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'itm_access';
const CSRF_COOKIE_NAME = process.env.AUTH_CSRF_COOKIE || 'itm_csrf';
const AUTH_COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN || undefined;
const AUTH_TOKEN_TTL = process.env.AUTH_TOKEN_TTL || '7d';
const AUTH_COOKIE_MAX_AGE_DAYS = Number(process.env.AUTH_COOKIE_MAX_AGE_DAYS || 7);

let warnedMissingJwtSecret = false;

function getJwtSecret() {
  const secret =
    process.env.JWT_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error('Missing JWT_SECRET (or fallback secret) in environment');
  }

  if (!process.env.JWT_SECRET && !warnedMissingJwtSecret) {
    console.warn(
      '[Auth] JWT_SECRET missing. Falling back to another secret. Configure a dedicated JWT_SECRET.'
    );
    warnedMissingJwtSecret = true;
  }

  return secret;
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function normalizeRole(role) {
  const raw = String(role || '').trim().toUpperCase();
  if (!raw) return '';
  if (raw === 'DATAENTRY') return 'DATA_ENTRY';
  if (raw === 'FINACE') return 'FINANCE';
  return raw;
}

export function parseCookies(cookieHeader = '') {
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
}

export function getCookie(req, name) {
  const cookies = parseCookies(req?.headers?.cookie || '');
  return cookies[name];
}

export function createCsrfToken() {
  return randomBytes(24).toString('hex');
}

function buildCookieOptions({ httpOnly }) {
  const isProd = process.env.NODE_ENV === 'production';
  const options = {
    httpOnly,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
  };
  if (AUTH_COOKIE_DOMAIN) {
    options.domain = AUTH_COOKIE_DOMAIN;
  }
  return options;
}

export function setAuthCookies(res, token, csrfToken) {
  const maxAgeMs = Math.max(1, AUTH_COOKIE_MAX_AGE_DAYS) * 24 * 60 * 60 * 1000;

  res.cookie(AUTH_COOKIE_NAME, token, {
    ...buildCookieOptions({ httpOnly: true }),
    maxAge: maxAgeMs,
  });

  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    ...buildCookieOptions({ httpOnly: false }),
    maxAge: maxAgeMs,
  });
}

export function clearAuthCookies(res) {
  res.clearCookie(AUTH_COOKIE_NAME, buildCookieOptions({ httpOnly: true }));
  res.clearCookie(CSRF_COOKIE_NAME, buildCookieOptions({ httpOnly: false }));
}

export function signAuthToken(payload) {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, { expiresIn: AUTH_TOKEN_TTL });
}

export function verifyAuthToken(token) {
  try {
    const secret = getJwtSecret();
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}

export function isBcryptHash(value) {
  return typeof value === 'string' && value.startsWith('$2');
}

export async function hashPassword(password) {
  if (!password) return '';
  return bcrypt.hash(String(password), 10);
}

export async function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false;
  if (isBcryptHash(storedHash)) {
    return bcrypt.compare(String(password), storedHash);
  }
  return String(password) === String(storedHash);
}

export async function getPublicUserByEmail(email) {
  const target = normalizeEmail(email);
  if (!target) return null;

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', target)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data || null;
}

export async function getPublicUserById(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data || null;
}

export async function upsertPublicUser({
  id,
  email,
  full_name,
  role,
  phone,
  password_hash,
  allowPasswordUpdate = false,
}) {
  const nowIso = new Date().toISOString();
  const targetEmail = normalizeEmail(email);
  if (!targetEmail) throw new Error('Email is required');

  const existing = await getPublicUserByEmail(targetEmail);

  if (existing) {
    const updates = {
      updated_at: nowIso,
    };

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
}

export async function setPublicUserPassword(userId, password) {
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
}

export async function resolveRoleForUser({ userId, email, fallbackRole }) {
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
}

export async function syncProfileUserId(userId, email) {
  if (!userId || !email) return;
  const targetEmail = normalizeEmail(email);

  // Employees
  await supabase
    .from('employees')
    .update({ user_id: userId })
    .eq('email', targetEmail)
    .is('user_id', null);

  // Vendors
  await supabase
    .from('vendors')
    .update({ user_id: userId })
    .eq('email', targetEmail)
    .is('user_id', null);

  // Buyers
  await supabase
    .from('buyers')
    .update({ user_id: userId })
    .eq('email', targetEmail)
    .is('user_id', null);
}

export function buildAuthUserPayload(user) {
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
}

export function getAuthCookieNames() {
  return { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME };
}
