
import { toast } from '@/components/ui/use-toast';

/**
 * Gets the value of a cookie by name.
 * @param {string} name 
 * @returns {string|null}
 */
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

/**
 * Universal API Client with Security features:
 * 1. credentials: 'include' (for httpOnly cookies)
 * 2. Auto CSRF injection for write methods from XSRF-TOKEN cookie
 * 3. Unified error handling for 403 Access Denied
 */
export const apiClient = {
  get: (url, options) => request('GET', url, undefined, options),
  post: (url, body, options) => request('POST', url, body, options),
  put: (url, body, options) => request('PUT', url, body, options),
  patch: (url, body, options) => request('PATCH', url, body, options),
  delete: (url, options) => request('DELETE', url, undefined, options),
};

async function request(method, url, body, options = {}) {
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // SECURITY: Add CSRF token for state-changing methods
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = getCookie('XSRF-TOKEN');
    // In a real scenario, we strictly require this. For the demo, we log warning if missing.
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    } else {
      console.warn("Security Warning: XSRF-TOKEN cookie not found for write operation.");
    }
  }

  const config = {
    method,
    headers,
    credentials: 'include', // SECURITY: Essential for httpOnly cookies & identity
    ...options,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  try {
    // Note: In this frontend-only demo environment, fetch will likely fail on relative /api/ paths 
    // because there is no backend. We are simulating the *structure* of the client.
    // To make the demo functional without a backend, we intercept the calls below.
    
    // --- SIMULATION INTERCEPTOR START ---
    // This block mimics the backend response for the demo. 
    // In production, this entire block is removed and we just await fetch(url, config).
    await new Promise(r => setTimeout(r, 600)); // Simulate network latency
    
    if (url.includes('/auth/login')) return { user: { id: 1, role: 'VENDOR' } }; // Mock login
    if (url.includes('/auth/me')) return { id: 1, role: 'VENDOR' }; // Mock me
    // --- SIMULATION INTERCEPTOR END ---

    const response = await fetch(url, config);

    // Handle 401 Unauthorized (Session expired)
    if (response.status === 401) {
      window.location.href = '/auth/login?expired=true';
      throw new Error("Session expired. Please login again.");
    }

    // Handle 403 Forbidden (Access Denied / Host mismatch)
    if (response.status === 403) {
      // We throw a specific error object that UI components can catch to show the full-page error
      const error = new Error("Access Denied");
      error.code = 403;
      error.isAccessDenied = true; 
      throw error;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `API Error: ${response.statusText}`);
    }

    if (response.status === 204) return null;

    return await response.json();
  } catch (error) {
    console.error('API Request Failed:', error);
    if (error.isAccessDenied) {
        // You might dispatch a global event or let the caller handle it to show the 403 page
        window.dispatchEvent(new CustomEvent('api:access-denied'));
    }
    throw error;
  }
}
