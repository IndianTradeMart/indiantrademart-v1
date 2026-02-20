import { superAdminFetch } from '@/lib/superAdminApiClient';

async function readJson(res) {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return res.json();
  }
  const text = await res.text();
  throw new Error(`Superadmin API returned non-JSON (${res.status}): ${text.slice(0, 160)}`);
}

async function request(path, options) {
  const res = await superAdminFetch(path, options);
  const data = await readJson(res);
  if (!data?.success) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const superAdminServerApi = {
  auth: {
    login: (email, password) =>
      request('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    me: () => request('/me'),
    changePassword: (current_password, new_password) =>
      request('/password', {
        method: 'PUT',
        body: JSON.stringify({ current_password, new_password }),
      }),
  },

  employees: {
    list: () => request('/employees'),
    create: (payload) =>
      request('/employees', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    delete: (employeeId) =>
      request(`/employees/${employeeId}`, {
        method: 'DELETE',
      }),
    resetPassword: (employeeId, password) =>
      request(`/employees/${employeeId}/password`, {
        method: 'PUT',
        body: JSON.stringify({ password }),
      }),
  },

  vendors: {
    list: (limit = 500) => request(`/vendors?limit=${encodeURIComponent(limit)}`),
    delete: (vendorId) =>
      request(`/vendors/${vendorId}`, {
        method: 'DELETE',
      }),
  },

  finance: {
    summary: () => request('/finance/summary'),
    payments: (params = {}) => {
      const qs = new URLSearchParams();
      Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v) !== '') qs.set(k, v);
      });
      const query = qs.toString();
      return request(`/finance/payments${query ? `?${query}` : ''}`);
    },
  },

  system: {
    getConfig: () => request('/system-config'),
    updateConfig: (payload) =>
      request('/system-config', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
  },

  pages: {
    list: () => request('/page-status'),
    create: (payload) =>
      request('/page-status', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    update: (pageId, payload) =>
      request(`/page-status/${pageId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    delete: (pageId) =>
      request(`/page-status/${pageId}`, {
        method: 'DELETE',
      }),
  },

  audit: {
    list: (params = {}) => {
      const qs = new URLSearchParams();
      Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v) !== '') qs.set(k, v);
      });
      const query = qs.toString();
      return request(`/audit-logs${query ? `?${query}` : ''}`);
    },
  },
};

