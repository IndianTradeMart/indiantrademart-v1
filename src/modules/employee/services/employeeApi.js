import { supabase } from '@/lib/customSupabaseClient';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';

const INTERNAL_ROLES = new Set([
  'ADMIN',
  'HR',
  'FINANCE',
  'DATA_ENTRY',
  'DATAENTRY',
  'SUPPORT',
  'SALES',
  'SUPERADMIN',
]);

const canonicalizeRole = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return undefined;
  if (raw === 'DATAENTRY') return 'DATA_ENTRY';
  if (raw === 'FINACE') return 'FINANCE';
  return raw;
};

const isInternalRole = (role) => INTERNAL_ROLES.has(String(role || '').trim().toUpperCase());

const buildEmployeeUser = (authUser, empRow) => {
  const name = empRow?.full_name || empRow?.name || authUser?.user_metadata?.full_name || authUser?.email || 'Employee';
  const firstLetter = String(name || 'E').trim().charAt(0).toUpperCase() || 'E';
  return {
    // keep both for safety
    id: authUser?.id,
    user_id: authUser?.id,
    name,
    email: empRow?.email || authUser?.email,
    phone: empRow?.phone || null,
    role: canonicalizeRole(empRow?.role) || 'UNKNOWN',
    department: empRow?.department || null,
    status: empRow?.status || null,
    avatar: firstLetter
  };
};

const fetchEmployeeRow = async (authUserId) => {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('user_id', authUserId)
    .maybeSingle();

  if (error) {
    // If RLS blocks, return null and let caller decide
    console.error('[employeeApi] employees fetch error:', error);
    return null;
  }
  return data || null;
};

const resolveEmployeeViaApi = async () => {
  try {
    const res = await fetchWithCsrf(apiUrl('/api/employee/me'));
    if (!res.ok) return null;
    const data = await res.json();
    return data?.employee || null;
  } catch {
    return null;
  }
};

export const employeeApi = {
  auth: {
    /**
     * Auth via backend JWT + cookies.
     */
    login: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw new Error(error.message);
      if (!data?.user) throw new Error('Login failed: user not returned');

      const empRow = (await resolveEmployeeViaApi()) || (await fetchEmployeeRow(data.user.id));
      if (!empRow) {
        // If you want to allow auth-only login, you can remove this throw.
        throw new Error('No employee profile found. Please ask admin to create your employee account.');
      }

      return { user: buildEmployeeUser(data.user, empRow) };
    },

    logout: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(error.message);
      return true;
    },

    /**
     * Restore session and return employee profile (if available).
     */
    getCurrentUser: async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error('[employeeApi] getSession error:', sessionError);
        return null;
      }

      const authUser = sessionData?.session?.user;
      if (!authUser?.id) return null;

      const hintedRole = canonicalizeRole(
        authUser?.role ||
        authUser?.user_metadata?.role ||
        authUser?.app_metadata?.role
      );

      if (hintedRole && !isInternalRole(hintedRole)) {
        return null;
      }

      const empRow = (await resolveEmployeeViaApi()) || (await fetchEmployeeRow(authUser.id));
      if (!empRow) return null;

      return buildEmployeeUser(authUser, empRow);
    }
  },

  // Placeholder for other employee functions
  profile: {
    get: () => Promise.resolve({}),
    update: (data) => Promise.resolve(data)
  }
};
