import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Package, Users, FileText, Settings, LogOut,
  Menu, X, Search, ShieldCheck, HelpCircle, ChevronRight, Boxes,
  BarChart, User as UserIcon, Check, Ban, MapPin, FolderKanban, MessageSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/modules/vendor/context/AuthContext';
import { vendorApi } from '@/modules/vendor/services/vendorApi';
import { useSubdomain } from '@/contexts/SubdomainContext';
import NotificationBell from '@/shared/components/NotificationBell';
import { useGlobalInputSanitizer } from '@/shared/hooks/useGlobalInputSanitizer';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const getInitials = (name = '') => {
  const parts = String(name).trim().split(' ').filter(Boolean);
  if (!parts.length) return 'V';
  const first = parts[0]?.[0] || 'V';
  const second = parts.length > 1 ? parts[1]?.[0] : (parts[0]?.[1] || '');
  return (first + second).toUpperCase();
};

const readBool = (obj, keys, fallback) => {
  for (const k of keys) {
    if (typeof obj?.[k] === 'boolean') return obj[k];
  }
  return fallback;
};

const readVendorActive = (obj, fallback = true) => {
  const boolValue = readBool(obj, ['is_active', 'isActive'], undefined);
  if (typeof boolValue === 'boolean') return boolValue;

  const status = String(
    obj?.account_status || obj?.accountStatus || obj?.status || ''
  ).trim().toUpperCase();

  if (status === 'SUSPENDED' || status === 'TERMINATED' || status === 'INACTIVE') {
    return false;
  }
  if (status === 'ACTIVE') {
    return true;
  }
  return fallback;
};

const SidebarItem = ({ icon: Icon, label, path, active, collapsed, resolvePath, onNavigate }) => {
  const resolved = resolvePath(path, 'vendor');

  return (
    <Link to={resolved} onClick={onNavigate}>
      <div
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group mb-1 ${
          active
            ? 'bg-[#003D82] text-white shadow-sm'
            : 'text-neutral-600 hover:bg-neutral-100 hover:text-[#003D82]'
        }`}
      >
        <Icon className={`h-4 w-4 ${active ? 'text-white' : 'text-neutral-500 group-hover:text-[#003D82]'}`} />
        {!collapsed && <span className="font-medium text-sm">{label}</span>}
        {active && !collapsed && <motion.div layoutId="activeIndicator" className="ml-auto w-1 h-1 rounded-full bg-white" />}
      </div>
    </Link>
  );
};

const PortalLayout = () => {
  useGlobalInputSanitizer();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { resolvePath } = useSubdomain();

  // ✅ Local "me" for header display
  const [me, setMe] = useState(user || null);

  // ✅ Vendor status (stable)
  const [statusLoading, setStatusLoading] = useState(true);
  const [vendorActive, setVendorActive] = useState(true);
  const [vendorVerified, setVendorVerified] = useState(true);

  const supportPath = resolvePath('support', 'vendor');
  const pathName = location.pathname || '';

  const isSupportRoute = useMemo(() => {
    return pathName === supportPath || pathName.startsWith(`${supportPath}/`);
  }, [pathName, supportPath]);

  const isSuspended = useMemo(() => {
    if (statusLoading) return false; // wait until status is known
    return vendorActive === false;
  }, [statusLoading, vendorActive]);

  // ✅ IMPORTANT: Blur should stay for all routes except support (support is allowed)
  const showOverlay = useMemo(() => {
    return isSuspended && !isSupportRoute;
  }, [isSuspended, isSupportRoute]);

  const displayOwnerName = useMemo(() => {
    return (
      me?.ownerName ||
      me?.owner_name ||
      me?.name ||
      (me?.email ? me.email.split('@')[0] : '') ||
      'Vendor'
    );
  }, [me]);

  const displayProfileImage = useMemo(() => {
    return me?.profileImage || me?.profile_image || '';
  }, [me]);

  const handleLogout = async () => {
    await logout();
    const loginPath = resolvePath('login', 'vendor');
    navigate(loginPath);
  };

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: 'dashboard' },
    { icon: ShieldCheck, label: 'KYC & Profile', path: 'kyc' },
    { icon: Package, label: 'Products', path: 'products' },
    { icon: Users, label: 'Leads', path: 'leads' },
    { icon: FileText, label: 'Proposals', path: 'proposals' },
    { icon: MessageSquare, label: 'Messages', path: 'messages' },
    { icon: BarChart, label: 'Analytics', path: 'analytics' },
    { icon: Boxes, label: 'Subscriptions', path: 'subscriptions' },
    { icon: MapPin, label: 'Plan Business Preferences', path: 'coverage' },
    { icon: FolderKanban, label: 'Collections', path: 'collections' },
    { icon: HelpCircle, label: 'Support', path: 'support' },
    { icon: Settings, label: 'Settings', path: 'settings' },
  ];

  // ✅ When suspended: only allow Support in menu
  const effectiveNavItems = useMemo(() => {
    if (!isSuspended) return navItems;
    return navItems.filter((x) => x.path === 'support');
  }, [isSuspended]);

  // ✅ FETCH vendor status reliably
  const loadVendorStatus = useCallback(async () => {
    setStatusLoading(true);
    const fallbackVerified = true;

    try {
      const fresh = await vendorApi.auth.me();
      const base = fresh || user || null;
      setMe(base);

      const activeVal = readVendorActive(base, true);
      const verifiedVal = readBool(base, ['is_verified', 'isVerified'], fallbackVerified);

      setVendorActive(activeVal);
      setVendorVerified(verifiedVal);
    } catch (e) {
      const base = user || null;
      setMe(base);

      const activeVal = readVendorActive(base, true);
      const verifiedVal = readBool(base, ['is_verified', 'isVerified'], fallbackVerified);

      setVendorActive(activeVal);
      setVendorVerified(verifiedVal);
    } finally {
      setStatusLoading(false);
    }
  }, [user]);

  // ✅ load once + on route change (so status never becomes stale)
  useEffect(() => {
    loadVendorStatus();
  }, [loadVendorStatus]);

  useEffect(() => {
    if (user) loadVendorStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ✅ This is the KEY fix: blur actual UI (not backdrop-filter)
  const blurWrapperClass = showOverlay
    ? 'filter blur-[6px] pointer-events-none select-none'
    : '';

  return (
    <div className="min-h-screen bg-gray-50 flex overflow-hidden relative">
      {/* ===== BLUR WRAPPER START ===== */}
      <div className={`min-h-screen bg-gray-50 flex overflow-hidden w-full ${blurWrapperClass}`}>
        {/* Sidebar - Desktop */}
        <motion.aside
          initial={false}
          animate={{ width: collapsed ? 70 : 250 }}
          className="hidden md:flex flex-col bg-white border-r border-neutral-200 h-screen sticky top-0 z-30 shadow-sm flex-shrink-0"
        >
          <div className="h-16 flex items-center justify-between px-4 border-b border-neutral-100">
            {!collapsed && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[#003D82] rounded flex items-center justify-center text-white font-bold text-lg">V</div>
                <span className="font-bold text-lg text-[#003D82] tracking-tight">VendorPortal</span>
              </div>
            )}
            {collapsed && (
              <div className="w-8 h-8 bg-[#003D82] rounded flex items-center justify-center text-white font-bold text-lg mx-auto">V</div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed(!collapsed)}
              className="h-8 w-8 text-neutral-400 hover:text-[#003D82]"
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <div className="bg-neutral-100 p-1 rounded hover:bg-neutral-200">
                  <ChevronRight className="h-3 w-3 rotate-180" />
                </div>
              )}
            </Button>
          </div>

          <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
            {effectiveNavItems.map((item) => {
              const resolved = resolvePath(item.path, 'vendor');
              const isActive = location.pathname === resolved || location.pathname.startsWith(`${resolved}/`);

              return (
                <SidebarItem
                  key={item.path}
                  {...item}
                  active={isActive}
                  collapsed={collapsed}
                  resolvePath={resolvePath}
                />
              );
            })}
          </div>

          <div className="p-3 border-t border-neutral-100 bg-gray-50/50">
            <Button
              variant="ghost"
              className={`w-full ${collapsed ? 'justify-center px-0' : 'justify-start'} text-red-600 hover:text-red-700 hover:bg-red-50 hover:shadow-sm`}
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              {!collapsed && <span className="text-sm font-medium">Logout</span>}
            </Button>
          </div>
        </motion.aside>

        {/* Main Content Wrapper */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          {/* Topbar */}
          <header className="h-16 bg-white border-b border-neutral-200 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20 flex-shrink-0 shadow-sm">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                aria-expanded={mobileMenuOpen}
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              >
                <Menu className="h-5 w-5" />
              </Button>

              <div className="hidden sm:flex relative items-center">
                <Search className="absolute left-3 h-4 w-4 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search anything..."
                  className="pl-9 pr-4 py-2 bg-neutral-100/50 border border-transparent focus:bg-white focus:border-neutral-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#003D82]/20 w-64 transition-all"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-5">
              <NotificationBell userId={user?.user_id || user?.id || null} />

              <div className="h-6 w-px bg-neutral-200 hidden sm:block"></div>

              {/* Profile dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-3 pl-2 rounded-full hover:bg-neutral-50">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-bold text-neutral-900 leading-none mb-1">
                        {displayOwnerName}
                      </p>
                      <p className="text-xs text-neutral-500 leading-none">
                        {me?.companyName || me?.company_name || 'Vendor Account'}
                      </p>
                    </div>

                    <div className="h-9 w-9 rounded-full overflow-hidden bg-neutral-100 border flex items-center justify-center shadow-sm cursor-pointer">
                      {displayProfileImage ? (
                        <img src={displayProfileImage} alt="Profile" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-sm font-bold text-neutral-700">{getInitials(displayOwnerName)}</span>
                      )}
                    </div>
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  <DropdownMenuItem onClick={() => navigate(resolvePath('profile', 'vendor'))}>
                    <UserIcon className="mr-2 h-4 w-4" /> Profile
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={async () => {
                    await loadVendorStatus();
                  }}>
                    <Check className="mr-2 h-4 w-4" /> Refresh
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={() => navigate(resolvePath('settings', 'vendor'))}>
                    <Settings className="mr-2 h-4 w-4" /> Settings
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                    <LogOut className="mr-2 h-4 w-4" /> Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto bg-gray-50/50 p-4 sm:p-6 scroll-smooth">
            <div className="max-w-[1600px] mx-auto min-h-full">
              <Outlet />
            </div>
          </main>
        </div>

        {/* Mobile Menu Overlay */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-40 md:hidden"
                onClick={() => setMobileMenuOpen(false)}
              />
              <motion.div
                initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="fixed top-0 left-0 bottom-0 w-72 bg-white z-50 md:hidden flex flex-col shadow-2xl"
              >
                <div className="h-16 flex items-center justify-between px-4 border-b border-neutral-100 bg-[#003D82]">
                  <span className="font-bold text-lg text-white">Vendor Menu</span>
                  <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(false)} className="text-white hover:bg-white/10">
                    <X className="h-5 w-5" />
                  </Button>
                </div>

                <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                  {effectiveNavItems.map((item) => {
                    const resolved = resolvePath(item.path, 'vendor');
                    return (
                      <SidebarItem
                        key={item.path}
                        {...item}
                        active={location.pathname === resolved || location.pathname.startsWith(`${resolved}/`)}
                        collapsed={false}
                        resolvePath={resolvePath}
                        onNavigate={() => setMobileMenuOpen(false)}
                      />
                    );
                  })}
                </div>

                <div className="p-4 bg-gray-50 border-t border-neutral-200">
                  <Button variant="destructive" className="w-full justify-start shadow-sm" onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" /> Logout
                  </Button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
      {/* ===== BLUR WRAPPER END ===== */}

      {/* ✅ Suspended Overlay (will NOT disappear now) */}
      {showOverlay && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="relative bg-white rounded-2xl shadow-2xl border w-full max-w-md p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Ban className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-red-600 mb-2">Account Suspended</h2>
            <p className="text-gray-600 mb-6">
              Your account is suspended/terminated. Please contact support to resolve this.
            </p>

            <div className="flex items-center justify-center gap-3">
              <Button
                onClick={() => navigate(resolvePath('support', 'vendor'))}
                className="bg-[#003D82]"
              >
                Contact Support
              </Button>

              <Button variant="outline" onClick={handleLogout}>
                Logout
              </Button>
            </div>

            <p className="text-xs text-gray-400 mt-4">
              Tip: Support page open karke ticket raise karo, team aapko help karegi.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortalLayout;
