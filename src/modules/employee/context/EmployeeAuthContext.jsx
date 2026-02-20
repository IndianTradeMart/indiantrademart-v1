import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { employeeApi } from '@/modules/employee/services/employeeApi';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';

const EmployeeAuthContext = createContext(null);

export const EmployeeAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user;

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      try {
        // 1) try restore from supabase session (source of truth)
        const current = await employeeApi.auth.getCurrentUser();
        if (isMounted) setUser(current);

        // No local storage caching for auth data
      } catch (e) {
        console.error('[EmployeeAuth] bootstrap failed:', e);
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    bootstrap();

    // Keep UI synced if token refresh / logout happens in another tab
    const { data: sub } = supabase.auth.onAuthStateChange(async (event) => {
      try {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          return;
        }
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          const current = await employeeApi.auth.getCurrentUser();
          setUser(current);
        }
      } catch (e) {
        console.error('[EmployeeAuth] onAuthStateChange failed:', e);
      }
    });

    return () => {
      isMounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const login = async (email, password) => {
    try {
      const res = await employeeApi.auth.login(email, password);
      if (res?.user) {
        setUser(res.user);

        toast({
          title: 'Welcome back!',
          description: `Logged in as ${String(res.user.role || 'EMPLOYEE').replace('_', ' ')}`,
          className: 'bg-green-50 border-green-200'
        });
        return res.user;
      }
      return null;
    } catch (error) {
      console.error('Login Error:', error);
      toast({
        title: 'Login Failed',
        description: error.message || 'Invalid credentials. Please try again.',
        variant: 'destructive'
      });
      return null;
    }
  };

  const logout = async () => {
    try {
      await employeeApi.auth.logout();
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      setUser(null);
      toast({ title: 'Logged Out', description: 'You have been successfully logged out.' });
    }
  };

  const value = useMemo(
    () => ({ user, isAuthenticated, isLoading, login, logout }),
    [user, isAuthenticated, isLoading]
  );

  return <EmployeeAuthContext.Provider value={value}>{children}</EmployeeAuthContext.Provider>;
};

export const useEmployeeAuth = () => useContext(EmployeeAuthContext);
