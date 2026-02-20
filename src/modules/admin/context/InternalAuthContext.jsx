import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';
import { toast } from '@/components/ui/use-toast';

const InternalAuthContext = createContext(null);

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

const pickFirst = (...vals) => {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return undefined;
};

const canonicalizeRole = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return undefined;
  if (raw === 'DATAENTRY') return 'DATA_ENTRY';
  if (raw === 'FINACE') return 'FINANCE';
  return raw;
};

const normalizeRoleValue = (value, fallback) => {
  const raw = pickFirst(value, fallback);
  return canonicalizeRole(raw);
};

const isInternalRole = (role) => INTERNAL_ROLES.has(String(role || '').trim().toUpperCase());

const resolveEmployeeFromApi = async () => {
  try {
    const res = await fetchWithCsrf(apiUrl('/api/employee/me'));
    if (!res.ok) return null;
    const data = await res.json();
    return data?.employee || null;
  } catch {
    return null;
  }
};

const normalizeInternalUser = (raw, email, expectedRole) => {
  const row = Array.isArray(raw) ? raw[0] : raw;

  const role = normalizeRoleValue(
    pickFirst(
      row?.role,
      row?.user_role,
      row?.userRole,
      row?.role_name,
      row?.roleName,
      row?.employee_role,
      row?.employeeRole,
      row?.type
    ),
    expectedRole
  );

  const name = pickFirst(
    row?.name,
    row?.full_name,
    row?.fullName,
    row?.employee_name,
    row?.employeeName,
    row?.employee_full_name,
    row?.display_name,
    row?.displayName
  );

  const status = pickFirst(
    row?.status,
    row?.account_status,
    row?.accountStatus
  );

  const id = pickFirst(
    row?.id,
    row?.user_id,
    row?.userId,
    row?.employee_id,
    row?.employeeId
  );

  return {
    ...row,
    id,
    email: pickFirst(row?.email, email),
    name: name || (email ? email.split('@')[0] : 'User'),
    role: role || normalizeRoleValue(expectedRole, 'ADMIN'),
    status: String(status || 'ACTIVE').toUpperCase(),
  };
};

export const InternalAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchInternalUserFromSession = async (authUser) => {
    try {
      if (!authUser?.id) return null;
      const hintedRole = normalizeRoleValue(
        pickFirst(authUser?.role, authUser?.user_metadata?.role, authUser?.app_metadata?.role),
        undefined
      );

      // 1) Employees table by user_id (primary)
      const { data: empById } = await supabase
        .from('employees')
        .select('*')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (empById && isInternalRole(empById.role)) {
        return normalizeInternalUser(empById, authUser.email, empById.role);
      }

      // 2) Employees table by email (fallback when user_id not wired yet)
      if (authUser.email) {
        const { data: empByEmail } = await supabase
          .from('employees')
          .select('*')
          .eq('email', authUser.email)
          .maybeSingle();

        if (empByEmail && isInternalRole(empByEmail.role)) {
          return normalizeInternalUser(empByEmail, authUser.email, empByEmail.role);
        }
      }

      // Role is explicitly non-internal (BUYER/VENDOR/USER) => skip employee fallback endpoint.
      if (hintedRole && !isInternalRole(hintedRole)) {
        return null;
      }

      // 4) Fallback to server-side resolver (bypasses RLS, syncs user_id)
      const resolved = await resolveEmployeeFromApi();
      if (resolved && isInternalRole(resolved.role)) {
        return normalizeInternalUser(resolved, authUser.email, resolved.role);
      }

      return null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const boot = async () => {
      try {
        let resolvedUser = null;
        // Sync from active session (authoritative)
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          resolvedUser = await fetchInternalUserFromSession(session.user);
        }

        setUser(resolvedUser);
        setIsAuthenticated(!!resolvedUser);
      } finally {
        setIsLoading(false);
      }
    };
    boot();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setIsAuthenticated(false);
          return;
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          const internalUser = session?.user
            ? await fetchInternalUserFromSession(session.user)
            : null;

          setUser(internalUser);
          setIsAuthenticated(!!internalUser);
        }
      } catch {
        // keep current state on transient auth errors
      }
    });

    return () => {
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  /**
   * 🔐 FIXED LOGIN
   */
  const login = async (email, password, expectedRole) => {
    try {
      setIsLoading(true);

      // 🚨 IMPORTANT: kill any cached session
      await supabase.auth.signOut();

      // ✅ 1. STRICT PASSWORD VALIDATION
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (authError || !authData?.user) {
        throw new Error('Invalid credentials');
      }

      // ✅ 2. RPC (ROLE / ACCESS CHECK) - treat as advisory if missing
      let rpcData = null;
      let rpcError = null;
      try {
        const { data, error } = await supabase.rpc('login_admin', {
          p_email: email,
          p_password: password,
        });
        if (error || !data) {
          rpcError = error || new Error('login_admin RPC unavailable');
        } else {
          rpcData = data;
        }
      } catch (err) {
        rpcError = err;
      }

      // Prefer employees profile as source-of-truth for internal portal access
      let normalized = null;

      // ✅ Resolve via server (ensures employee.user_id sync)
      const resolved = await resolveEmployeeFromApi();
      if (resolved && isInternalRole(resolved.role)) {
        normalized = normalizeInternalUser(resolved, email, resolved.role);
      }

      const { data: empById } = await supabase
        .from('employees')
        .select('*')
        .eq('user_id', authData.user.id)
        .maybeSingle();

      if (empById) {
        normalized = normalizeInternalUser(empById, email, empById.role);
      } else {
        const { data: empByEmail } = await supabase
          .from('employees')
          .select('*')
          .eq('email', email)
          .maybeSingle();

        if (empByEmail) {
          normalized = normalizeInternalUser(empByEmail, email, empByEmail.role);
        }
      }

      if (!normalized && rpcData) {
        normalized = normalizeInternalUser(rpcData, email, expectedRole);
      }

      if (!normalized && rpcError) {
        // If RPC is missing or returns nothing, fall back to employee-based auth only.
        console.warn('[InternalAuth] login_admin RPC failed, using employee fallback:', rpcError);
      }

      if (!normalized) {
        // rollback auth session
        await supabase.auth.signOut();
        throw new Error('Unauthorized');
      }

      if (!isInternalRole(normalized.role)) {
        await supabase.auth.signOut();
        throw new Error('Unauthorized');
      }

      setUser(normalized);
      setIsAuthenticated(true);

      toast({
        title: 'Login Successful',
        description: `Welcome back, ${normalized.name || 'User'}`,
        className: 'bg-green-50 text-green-900 border-green-200',
      });

      return normalized;
    } catch (error) {
      await supabase.auth.signOut();
      setUser(null);
      setIsAuthenticated(false);

      toast({
        title: 'Login Failed',
        description: 'Invalid email or password',
        variant: 'destructive',
      });

      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
    toast({ title: 'Logged Out', description: 'You have been logged out successfully.' });
  };

  return (
    <InternalAuthContext.Provider
      value={{ user, isAuthenticated, isLoading, login, logout }}
    >
      {children}
    </InternalAuthContext.Provider>
  );
};

export const useInternalAuth = () => useContext(InternalAuthContext);
