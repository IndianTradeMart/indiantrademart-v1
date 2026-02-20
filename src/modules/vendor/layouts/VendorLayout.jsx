import React, { useEffect, useState, useMemo } from 'react';
import { Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import VendorHeader from '../components/VendorHeader';
import VendorSidebar from '../components/VendorSidebar';
import { useAuth } from '../context/AuthContext';
import { Loader2, AlertTriangle, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';

const VendorLayout = () => {
  const { isAuthenticated, isLoading, user, logout, refreshUser } = useAuth(); // ✅ added refreshUser
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const path = location.pathname || '';

  // Support route detection (only allowed when suspended)
  const isSupportRoute = useMemo(() => {
    return path.startsWith('/vendor/support');
  }, [path]);

  // ✅ Ensure vendor profile flags are loaded (prevents relogin bypass)
  const hasActiveFlag = useMemo(() => {
    if (!user) return false;
    return (typeof user.is_active === 'boolean') || (typeof user.isActive === 'boolean');
  }, [user]);

  const hasVerifiedFlag = useMemo(() => {
    if (!user) return false;
    return (typeof user.is_verified === 'boolean') || (typeof user.isVerified === 'boolean');
  }, [user]);

  // If authenticated but vendor flags missing, try refreshUser once
  useEffect(() => {
    if (isAuthenticated && user && (!hasActiveFlag || !hasVerifiedFlag)) {
      refreshUser?.();
    }
  }, [isAuthenticated, user, hasActiveFlag, hasVerifiedFlag, refreshUser]);

  // Vendor verification status (support both snake_case & camelCase)
  const isVerified = useMemo(() => {
    if (!user) return true;
    if (typeof user.is_verified === 'boolean') return user.is_verified;
    if (typeof user.isVerified === 'boolean') return user.isVerified;
    return false; // ✅ IMPORTANT: don’t allow if missing
  }, [user]);

  // Vendor active/suspended status (support both snake_case & camelCase)
  const isActive = useMemo(() => {
    if (!user) return true;
    if (typeof user.is_active === 'boolean') return user.is_active;
    if (typeof user.isActive === 'boolean') return user.isActive;
    return false; // ✅ IMPORTANT: don’t allow if missing
  }, [user]);

  // If vendor is suspended/terminated => active=false
  const isSuspended = useMemo(() => {
    return isAuthenticated && user && isActive === false;
  }, [isAuthenticated, user, isActive]);

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/vendor/login" state={{ from: location }} replace />;
  }

  // ✅ If authenticated but vendor flags still not present, show loader (no bypass)
  if (isAuthenticated && user && (!hasActiveFlag || !hasVerifiedFlag)) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  /**
   * ✅ SUSPENDED GATE
   * - If suspended: only /vendor/support is accessible
   */
  if (isSuspended) {
    if (isSupportRoute) {
      return (
        <div className="min-h-screen bg-gray-50">
          <div className="w-full border-b bg-white">
            <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Ban className="h-4 w-4 text-red-600" />
                <span className="font-semibold">Account Suspended</span>
                <span className="text-gray-400">•</span>
                <span>Support only access</span>
              </div>

              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await logout?.();
                  } finally {
                    navigate('/vendor/login', { replace: true });
                  }
                }}
              >
                Logout
              </Button>
            </div>
          </div>

          <main className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md text-center w-full">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Ban className="h-8 w-8 text-red-600" />
          </div>

          <h2 className="text-2xl font-bold text-red-600 mb-2">Account Suspended</h2>
          <p className="text-gray-600 mb-6">
            Your account is suspended/terminated. Please contact support to resolve this.
          </p>

          <div className="flex items-center justify-center gap-3">
            <Button onClick={() => navigate('/vendor/support')} className="bg-[#003D82]">
              Contact Support
            </Button>

            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await logout?.();
                } finally {
                  navigate('/vendor/login', { replace: true });
                }
              }}
            >
              Logout
            </Button>
          </div>

          <p className="text-xs text-gray-400 mt-4">
            Tip: Support page open karke ticket raise karo, team aapko help karegi.
          </p>
        </div>
      </div>
    );
  }

  /**
   * ✅ VERIFICATION GATE
   */
  if (user && isVerified === false) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md text-center w-full">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-8 w-8 text-yellow-600" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Not Verified</h2>
          <p className="text-gray-500 mb-6">
            Your vendor account is not verified yet. Please complete verification to access your dashboard.
          </p>

          <Button onClick={() => navigate('/vendor/verify')}>
            Go to Verification
          </Button>
        </div>
      </div>
    );
  }

  // ✅ Normal Vendor Layout (Active + Verified)
  return (
    <div className="min-h-screen bg-gray-50">
      <VendorSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:pl-64 min-h-screen flex flex-col">
        <VendorHeader onMenuClick={() => setSidebarOpen(true)} />

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default VendorLayout;