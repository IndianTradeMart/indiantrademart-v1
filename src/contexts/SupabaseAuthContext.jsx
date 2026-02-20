
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';
import { Loader2 } from 'lucide-react';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

const INTERNAL_ROLES = new Set(['ADMIN', 'HR', 'DATA_ENTRY', 'DATAENTRY', 'SUPPORT', 'SALES', 'FINANCE', 'SUPERADMIN']);

const canonicalizeRole = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  if (raw === 'AUTHENTICATED' || raw === 'ANONYMOUS' || raw === 'ANON' || raw === 'USER') return '';
  if (raw === 'DATAENTRY') return 'DATA_ENTRY';
  if (raw === 'FINACE') return 'FINANCE';
  return raw;
};

const fetchProfileByIdentity = async (table, userId, userEmail) => {
  if (userId) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .limit(1);
    if (!error && Array.isArray(data) && data[0]) return data[0];
  }

  const normalizedEmail = String(userEmail || '').trim().toLowerCase();
  if (!normalizedEmail) return null;

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .ilike('email', normalizedEmail)
    .limit(1);

  if (!error && Array.isArray(data) && data[0]) return data[0];
  return null;
};

const fetchBuyerProfileFromApi = async () => {
  try {
    const res = await fetchWithCsrf(apiUrl('/api/auth/buyer/profile'));
    if (!res.ok) return null;
    const json = await res.json().catch(() => ({}));
    return json?.buyer || null;
  } catch {
    return null;
  }
};

const fetchEmployeeProfileFromApi = async () => {
  try {
    const res = await fetchWithCsrf(apiUrl('/api/employee/me'));
    if (!res.ok) return null;
    const json = await res.json().catch(() => ({}));
    return json?.employee || null;
  } catch {
    return null;
  }
};

const fetchVendorProfileFromApi = async () => {
  try {
    const res = await fetchWithCsrf(apiUrl('/api/vendors/me'));
    if (!res.ok) return null;
    const json = await res.json().catch(() => ({}));
    return json?.vendor || null;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // Auth user object
  const [profile, setProfile] = useState(null); // DB profile object (buyer, vendor, employee)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check active session
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await fetchProfile(session.user);
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error("Session check error:", error);
        setLoading(false);
      }
    };

    checkSession();

    // 2. Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          await fetchProfile(session.user);
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (authUser) => {
    try {
      let role = canonicalizeRole(
        authUser?.role ||
        authUser?.app_metadata?.role ||
        authUser?.user_metadata?.role
      );
      let fetchedProfile = null;
      const userId = authUser?.id;
      const userEmail = String(authUser?.email || '').trim().toLowerCase();

      const resolveVendorProfile = async () => {
        let vendor = await fetchVendorProfileFromApi();
        if (!vendor) vendor = await fetchProfileByIdentity('vendors', userId, userEmail);
        return vendor || null;
      };

      const resolveBuyerProfile = async () => {
        let buyer = await fetchBuyerProfileFromApi();
        if (!buyer) buyer = await fetchProfileByIdentity('buyers', userId, userEmail);
        return buyer || null;
      };

      if (role === 'BUYER') {
        fetchedProfile = await resolveBuyerProfile();
      } else if (role === 'VENDOR') {
        fetchedProfile = await resolveVendorProfile();
      } else if (INTERNAL_ROLES.has(role)) {
        fetchedProfile = await fetchEmployeeProfileFromApi();
        if (!fetchedProfile) {
          fetchedProfile = await fetchProfileByIdentity('employees', userId, userEmail);
        }
        if (fetchedProfile?.role) role = canonicalizeRole(fetchedProfile.role);
      } else {
        // Unknown role fallback without cross-portal route-based switching.
        if (!fetchedProfile) {
          const emp = await fetchProfileByIdentity('employees', userId, userEmail);
          if (emp) {
            fetchedProfile = emp;
            role = canonicalizeRole(emp.role || 'ADMIN');
          }
        }

        if (!fetchedProfile) {
          const vendor = await fetchProfileByIdentity('vendors', userId, userEmail);
          if (vendor) {
            fetchedProfile = vendor;
            role = 'VENDOR';
          }
        }

        if (!fetchedProfile) {
          fetchedProfile = await resolveBuyerProfile();
          if (fetchedProfile) {
            role = 'BUYER';
          }
        }
      }

      setUser({
        ...authUser,
        role: role || 'GUEST',
      });
      
      setProfile(fetchedProfile);

    } catch (error) {
      console.error("Profile fetch error:", error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email, password, metadata = {}) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
        options: { data: metadata || {} },
        role: metadata?.role,
      });

      if (error) {
        setLoading(false);
        return { data, error };
      }

      const authUser = data?.user || data?.session?.user || null;
      if (authUser) {
        await fetchProfile(authUser);
      } else {
        setLoading(false);
      }

      return { data, error: null };
    } catch (error) {
      setLoading(false);
      return { data: null, error };
    }
  };

  const signUp = async (email, password, metadata = {}) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { data: metadata },
      });

      if (error) {
        setLoading(false);
        return { data, error };
      }

      const authUser = data?.user || data?.session?.user || null;
      if (authUser) {
        await fetchProfile(authUser);
      } else {
        setLoading(false);
      }

      return { data, error: null };
    } catch (error) {
      setLoading(false);
      return { data: null, error };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      userId: user?.id,
      buyerId: user?.role === 'BUYER' ? (profile?.id || user?.buyer_id || null) : null,
      vendorId: user?.role === 'VENDOR' ? profile?.id : null,
      userRole: user?.role,
      loading,
      signIn,
      signUp,
      logout,
      isAdmin: user?.role === 'ADMIN'
    }}>
      {!loading ? children : (
        <div className="h-screen w-full flex items-center justify-center bg-gray-50">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm text-gray-500 font-medium">Loading Application...</p>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};
