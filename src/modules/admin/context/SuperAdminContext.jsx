import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';
import {
  clearSuperAdminSession,
  getSuperAdminToken,
  setSuperAdminToken,
} from '@/lib/superAdminApiClient';
import { superAdminServerApi } from '@/modules/admin/services/superAdminServerApi';

const SuperAdminContext = createContext(null);

export const SuperAdminProvider = ({ children }) => {
  const [superAdmin, setSuperAdmin] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const normalizeRole = (role) => {
    if (!role) return undefined;
    const r = String(role).trim().toUpperCase();
    // accept common variants
    const compact = r.replace(/[^A-Z]/g, '');
    if (compact === 'SUPERADMIN' || compact === 'SUPERUSER' || compact === 'GODMODE') return 'SUPERADMIN';
    return r;
  };

  const normalizeRow = (raw, email) => {
    const row = Array.isArray(raw) ? raw[0] : raw;
    if (!row || (typeof row === 'object' && Object.keys(row).length === 0)) return null;
    // If the RPC is specifically for superadmin login, treat missing role as SUPERADMIN.
    const role = normalizeRole(row.role || row.user_role || row.userRole || row.type) || 'SUPERADMIN';
    return {
      ...row,
      email: row.email || email,
      role,
    };
  };

  useEffect(() => {
    const token = getSuperAdminToken();

    if (!token) {
      setIsLoading(false);
      return;
    }

    // Validate token in background so stale sessions get cleaned up.
    (async () => {
      try {
        const { superadmin } = await superAdminServerApi.auth.me();
        if (superadmin) {
          setSuperAdmin(superadmin);
        }
      } catch (error) {
        console.warn('[SuperAdminAuth] Session validation failed:', error?.message || error);
        clearSuperAdminSession();
        setSuperAdmin(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (email, password) => {
    try {
      setIsLoading(true);
      const safeEmail = String(email || '').trim();
      console.log(`[SuperAdminAuth] Attempting login for: ${safeEmail}`);

      const data = await superAdminServerApi.auth.login(safeEmail, password);
      const normalized = normalizeRow(data?.superadmin, safeEmail);
      if (normalized) {
        setSuperAdmin(normalized);
        setSuperAdminToken(data.token);
        toast({
          title: "Access Granted",
          description: "Welcome to the Super Admin Console.",
          className: "bg-red-900 text-white border-red-800"
        });
        return true;
      } else {
        console.warn("[SuperAdminAuth] Login failed: Invalid credentials or user not found.");
        throw new Error("Invalid credentials");
      }
    } catch (error) {
      console.error("[SuperAdminAuth] Login Exception:", error);

      toast({
        title: "Access Denied",
        description: error?.message || "Invalid credentials. Check console for details.",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setSuperAdmin(null);
    clearSuperAdminSession();
    toast({ title: "Session Ended", description: "Secure logout successful." });
  };

  const changePassword = async (currentPassword, newPassword) => {
    if (!superAdmin) return false;
    try {
      await superAdminServerApi.auth.changePassword(currentPassword, newPassword);
      toast({ title: "Success", description: "Password updated successfully." });
      return true;
    } catch (error) {
      console.error("Password update failed:", error);
      toast({
        title: "Error",
        description: error?.message || "Could not update password.",
        variant: "destructive",
      });
      return false;
    }
  };

  return (
    <SuperAdminContext.Provider value={{ superAdmin, isLoading, login, logout, changePassword }}>
      {children}
    </SuperAdminContext.Provider>
  );
};

export const useSuperAdmin = () => useContext(SuperAdminContext);
