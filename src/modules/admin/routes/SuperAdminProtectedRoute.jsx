import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSuperAdmin } from '@/modules/admin/context/SuperAdminContext';
import { ShieldAlert, Loader2 } from 'lucide-react';

const SuperAdminProtectedRoute = () => {
  const { superAdmin, isLoading } = useSuperAdmin();
  const location = useLocation();

  const normalizeRole = (role) => {
    if (!role) return '';
    const r = String(role).trim().toUpperCase();
    return r.replace(/[^A-Z]/g, '');
  };

  const isSuperAdminRole = (role) => {
    const r = normalizeRole(role);
    return r === 'SUPERADMIN' || r === 'SUPERUSER' || r === 'GODMODE';
  };

  // ✅ Use consistent login route (works on localhost + admin subdomain)
  const loginPath = '/admin/superadmin/login';

  console.log('[SuperAdminRoute] Checking access:', { 
    isLoading, 
    hasUser: !!superAdmin, 
    user: superAdmin 
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-white">
        <Loader2 className="h-10 w-10 animate-spin text-red-600 mb-4" />
        <p className="text-neutral-400 font-mono">Verifying clearance...</p>
      </div>
    );
  }

  if (!superAdmin) {
    console.warn('[SuperAdminRoute] Access denied: No active session');
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  if (!isSuperAdminRole(superAdmin.role)) {
    console.warn('[SuperAdminRoute] Access denied: Invalid role', superAdmin.role);
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white p-4">
        <div className="max-w-md text-center">
          <ShieldAlert className="h-16 w-16 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-neutral-400 mb-6">Your account credentials do not have GOD MODE privileges.</p>
          <Navigate to={loginPath} />
        </div>
      </div>
    );
  }

  return <Outlet />;
};

export default SuperAdminProtectedRoute;
