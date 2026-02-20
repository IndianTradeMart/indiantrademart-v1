import { createClient } from '@supabase/supabase-js';
import { apiUrl } from '@/lib/apiBase';

// NOTE:
// - Supabase client is used ONLY for database queries (no auth).
// - Auth is handled by backend JWT + httpOnly cookies.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    '[Supabase] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Check your .env.local and restart the dev server.'
  );
}

const baseClient = createClient(supabaseUrl || '', supabaseAnonKey || '');

let cachedUser = null;
let refreshPromise = null;
let lastRefreshAt = 0;
let refreshCooldownUntil = 0;
const listeners = new Set();
const AUTH_SYNC_STORAGE_KEY = 'itm_auth_sync_v1';
let authSyncBound = false;

const SESSION_TTL_MS = 30 * 1000;
const REFRESH_COOLDOWN_MS = 15 * 1000;
const BUYER_NOT_REGISTERED_MESSAGE = 'This email is not registered as buyer';

const normalizeRole = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  if (raw === 'DATAENTRY') return 'DATA_ENTRY';
  if (raw === 'FINACE') return 'FINANCE';
  return raw;
};

const getRoleMismatchMessage = (requestedRole) => {
  const normalized = normalizeRole(requestedRole);
  if (normalized === 'BUYER') return BUYER_NOT_REGISTERED_MESSAGE;
  if (normalized === 'VENDOR') return 'This email is not registered as vendor';
  if (!normalized) return 'Access denied';
  return `This email is not registered as ${normalized.toLowerCase()}`;
};

const getCsrfToken = () => {
  if (typeof document === 'undefined') return '';
  const token = document.cookie
    .split('; ')
    .find((row) => row.startsWith('itm_csrf='))
    ?.split('=')[1];
  return token ? decodeURIComponent(token) : '';
};

const emit = (event, session) => {
  listeners.forEach((cb) => {
    try {
      cb(event, session);
    } catch (e) {
      // ignore listener errors
    }
  });
};

const resetCachedAuth = () => {
  cachedUser = null;
  lastRefreshAt = 0;
  refreshCooldownUntil = 0;
};

const broadcastAuthSync = (event) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      AUTH_SYNC_STORAGE_KEY,
      JSON.stringify({ event, ts: Date.now() })
    );
  } catch {
    // ignore storage sync errors
  }
};

const fetchJson = async (path, options = {}) => {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...options.headers,
  };

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf && !headers['X-CSRF-Token']) {
      headers['X-CSRF-Token'] = csrf;
    }
  }

  const requestUrl = apiUrl(path);
  let res;
  try {
    res = await fetch(requestUrl, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (networkError) {
    const isDev = Boolean(import.meta?.env?.DEV);
    const error = new Error(
      isDev
        ? 'Unable to reach API server. Start both apps with `npm run dev:all`.'
        : 'Unable to reach API server. Please try again.'
    );
    error.cause = networkError;
    throw error;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data?.error || data?.message || 'Request failed');
    error.status = res.status;
    error.payload = data;
    throw error;
  }

  return data;
};

const sanitizeAuthUser = (user) => {
  if (!user || typeof user !== 'object') return null;
  const next = { ...user };
  // Backend JWT must never be exposed as Supabase session token.
  // Otherwise Supabase DB queries receive invalid bearer auth and fail.
  delete next.access_token;
  return next;
};

const buildSession = (user) => (user ? { user, access_token: null } : null);

const refreshSession = async (force = false) => {
  const now = Date.now();
  if (!force) {
    if (refreshCooldownUntil && now < refreshCooldownUntil) {
      return buildSession(cachedUser);
    }
    if (cachedUser && now - lastRefreshAt < SESSION_TTL_MS) {
      return buildSession(cachedUser);
    }
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const hadUser = !!cachedUser;
    try {
      const data = await fetchJson('/api/auth/me');
      cachedUser = sanitizeAuthUser(data?.user || null);
      lastRefreshAt = Date.now();
      return buildSession(cachedUser);
    } catch (error) {
      if (error?.status === 429) {
        refreshCooldownUntil = Date.now() + REFRESH_COOLDOWN_MS;
      }
      if (!hadUser) {
        cachedUser = null;
      }
      return buildSession(cachedUser);
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

const ensureAuthSyncListener = () => {
  if (authSyncBound || typeof window === 'undefined') return;
  authSyncBound = true;

  window.addEventListener('storage', (event) => {
    if (event?.key !== AUTH_SYNC_STORAGE_KEY || !event.newValue) return;

    let payload = null;
    try {
      payload = JSON.parse(event.newValue);
    } catch {
      payload = null;
    }

    const syncedEvent = String(payload?.event || '').toUpperCase();
    if (!syncedEvent) return;

    if (syncedEvent === 'SIGNED_OUT') {
      resetCachedAuth();
      emit('SIGNED_OUT', null);
      return;
    }

    refreshCooldownUntil = 0;
    lastRefreshAt = 0;
    refreshSession(true)
      .then((session) => emit('TOKEN_REFRESHED', session))
      .catch(() => {});
  });
};

ensureAuthSyncListener();

const authShim = {
  getSession: async () => {
    const session = await refreshSession();
    return { data: { session }, error: null };
  },
  getUser: async () => {
    if (!cachedUser) {
      await refreshSession();
    }
    return { data: { user: cachedUser }, error: null };
  },
  signInWithPassword: async ({ email, password, options = {}, role, role_hint, roleHint } = {}) => {
    try {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const roleFromOptions = options?.data?.role || options?.role;
      const roleValue = role || role_hint || roleHint || roleFromOptions || null;
      const requestedRole = normalizeRole(roleValue);
      const data = await fetchJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          ...(roleValue ? { role: roleValue } : {}),
        }),
      });
      const returnedUser = sanitizeAuthUser(data?.user || null);
      const returnedRole = normalizeRole(
        returnedUser?.role || returnedUser?.app_metadata?.role || returnedUser?.user_metadata?.role
      );

      if (requestedRole && requestedRole !== returnedRole) {
        try {
          await fetchJson('/api/auth/logout', { method: 'POST' });
        } catch {
          // ignore logout cleanup failures
        }
        resetCachedAuth();
        const error = new Error(getRoleMismatchMessage(requestedRole));
        error.status = 403;
        return { data: { user: null, session: null }, error };
      }

      cachedUser = returnedUser;
      lastRefreshAt = Date.now();
      refreshCooldownUntil = 0;
      const session = buildSession(cachedUser);
      emit('SIGNED_IN', session);
      broadcastAuthSync('SIGNED_IN');
      return { data: { user: cachedUser, session }, error: null };
    } catch (error) {
      return { data: { user: null, session: null }, error };
    }
  },
  signUp: async ({ email, password, options = {} }) => {
    try {
      const meta = options?.data || {};
      const payload = {
        email,
        password,
        ...meta,
        full_name: meta?.full_name || meta?.fullName,
        role: meta?.role,
        phone: meta?.phone || meta?.mobile_number || meta?.mobileNumber,
      };
      const data = await fetchJson('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      cachedUser = sanitizeAuthUser(data?.user || null);
      lastRefreshAt = Date.now();
      refreshCooldownUntil = 0;
      const session = buildSession(cachedUser);
      emit('SIGNED_IN', session);
      broadcastAuthSync('SIGNED_IN');
      return { data: { user: cachedUser, session }, error: null };
    } catch (error) {
      return { data: { user: null, session: null }, error };
    }
  },
  signOut: async () => {
    try {
      await fetchJson('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    } finally {
      resetCachedAuth();
      emit('SIGNED_OUT', null);
      broadcastAuthSync('SIGNED_OUT');
    }
    return { error: null };
  },
  updateUser: async ({ password, data } = {}) => {
    try {
      if (password) {
        await fetchJson('/api/auth/password', {
          method: 'PATCH',
          body: JSON.stringify({ new_password: password }),
        });
      }
      if (!cachedUser) {
        await refreshSession();
      }
      return { data: { user: cachedUser }, error: null };
    } catch (error) {
      return { data: { user: cachedUser }, error };
    }
  },
  setSession: async () => {
    const session = await refreshSession();
    emit('TOKEN_REFRESHED', session);
    return { data: { session }, error: null };
  },
  onAuthStateChange: (callback) => {
    listeners.add(callback);
    return {
      data: {
        subscription: {
          unsubscribe: () => listeners.delete(callback),
        },
      },
    };
  },
};

const customSupabaseClient = baseClient;
customSupabaseClient.auth = authShim;

export default customSupabaseClient;

export {
  customSupabaseClient,
  customSupabaseClient as supabase,
};
