let superAdminToken = null;

export function getSuperAdminToken() {
  return superAdminToken;
}

export function setSuperAdminToken(token) {
  superAdminToken = token || null;
}

export function clearSuperAdminSession() {
  superAdminToken = null;
}

export function getSuperAdminBase() {
  const override = import.meta.env.VITE_SUPERADMIN_API_BASE;
  if (override && String(override).trim()) return String(override).trim();
  return '/api/superadmin';
}

export async function superAdminFetch(path, options = {}) {
  const token = getSuperAdminToken();
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const base = getSuperAdminBase();
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;

  return fetch(url, {
    ...options,
    headers,
  });
}

export const SUPERADMIN_KEYS = {
  token: 'itm_superadmin_token',
  session: 'itm_superadmin_session',
};
