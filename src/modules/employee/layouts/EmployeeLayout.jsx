
import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useEmployeeAuth } from '@/modules/employee/context/EmployeeAuthContext';
import { 
  LayoutDashboard, 
  Database, 
  UserPlus, 
  Users, 
  ShieldCheck, 
  TrendingUp, 
  Tag, 
  LogOut, 
  Menu, 
  Upload,
  FileSpreadsheet,
  FileText,
  Building2,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import NotificationBell from '@/shared/components/NotificationBell';
import { useGlobalInputSanitizer } from '@/shared/hooks/useGlobalInputSanitizer';

const SidebarLink = ({ to, icon: Icon, children, onNavigate }) => (
  <NavLink
    to={to}
    onClick={onNavigate}
    className={({ isActive }) =>
      `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
        isActive 
          ? 'bg-[#8B6F47] text-white' 
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-[#8B6F47]'
      }`
    }
  >
    <Icon className="h-5 w-5" />
    <span className="font-medium">{children}</span>
  </NavLink>
);

const EmployeeLayout = ({ allowedRole }) => {
  useGlobalInputSanitizer();

  const { user, logout, isLoading } = useEmployeeAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  if (isLoading) return <div className="h-screen flex items-center justify-center bg-slate-50 text-slate-500">Loading workspace...</div>;
  
  if (!user) {
    return <Navigate to="/employee/login" replace />;
  }
  
  if (allowedRole && user.role !== allowedRole) {
    const roleRoutes = {
      'DATA_ENTRY': '/employee/dataentry/dashboard',
      'SUPPORT': '/employee/support/dashboard',
      'SALES': '/employee/sales/dashboard'
    };
    const target = roleRoutes[user.role] || '/employee/login';
    if (location.pathname !== target && !location.pathname.startsWith(roleRoutes[user.role])) {
       return <Navigate to={target} replace />;
    }
  }

  const handleLogout = () => {
    logout();
    navigate('/employee/login');
  };

  const getPageTitle = () => {
    const pathParts = location.pathname.split('/');
    const page = pathParts[pathParts.length - 1];
    return page.charAt(0).toUpperCase() + page.slice(1).replace('-', ' ');
  };

  return (
    <div className="h-screen bg-neutral-50 overflow-hidden">
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-neutral-200 transform transition-transform duration-200 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } h-screen flex flex-col`}
      >
        <div className="h-20 flex items-center justify-center border-b border-neutral-100 bg-[#003D82]">
           <img
            src="https://horizons-cdn.hostinger.com/f872dc8f-3c19-4e7d-8677-e9f5922486ba/fdb3954cae9a5b8889e2ea4e9a3885ae.png"
            alt="ITM Employee"
            className="h-8 w-auto brightness-0 invert"
          />
        </div>

        <nav className="flex-1 min-h-0 p-4 space-y-1 overflow-y-auto">
          {user.role === 'DATA_ENTRY' && (
            <>
              <div className="px-4 py-2 text-xs font-semibold text-neutral-400 uppercase tracking-wider">Data Operations</div>
              <SidebarLink to="/employee/dataentry/dashboard" icon={LayoutDashboard} onNavigate={() => setIsSidebarOpen(false)}>Dashboard</SidebarLink>
              <SidebarLink to="/employee/dataentry/vendor-onboarding" icon={UserPlus} onNavigate={() => setIsSidebarOpen(false)}>Vendor Onboarding</SidebarLink>
              <SidebarLink to="/employee/dataentry/vendors" icon={Users} onNavigate={() => setIsSidebarOpen(false)}>Vendors</SidebarLink>
              <SidebarLink to="/employee/dataentry/records" icon={FileText} onNavigate={() => setIsSidebarOpen(false)}>Data Entry Records</SidebarLink>
              
              <div className="px-4 py-2 mt-4 text-xs font-semibold text-neutral-400 uppercase tracking-wider">Management</div>
              <SidebarLink to="/employee/dataentry/categories" icon={Database} onNavigate={() => setIsSidebarOpen(false)}>Categories</SidebarLink>
              <SidebarLink to="/employee/dataentry/locations" icon={FileSpreadsheet} onNavigate={() => setIsSidebarOpen(false)}>Locations</SidebarLink>
              <SidebarLink to="/employee/dataentry/bulk-import" icon={Upload} onNavigate={() => setIsSidebarOpen(false)}>Bulk Import (Loc)</SidebarLink>
              
              {/* Added KYC Review Link */}
              <div className="px-4 py-2 mt-4 text-xs font-semibold text-neutral-400 uppercase tracking-wider">Review</div>
              <SidebarLink to="/employee/dataentry/kyc-review" icon={ShieldCheck} onNavigate={() => setIsSidebarOpen(false)}>KYC Review</SidebarLink>
            </>
          )}

          {user.role === 'SUPPORT' && (
            <>
              <SidebarLink to="/employee/support/dashboard" icon={LayoutDashboard} onNavigate={() => setIsSidebarOpen(false)}>Dashboard</SidebarLink>
              <SidebarLink to="/employee/support/tickets/vendor" icon={Building2} onNavigate={() => setIsSidebarOpen(false)}>Help for Vendor</SidebarLink>
              <SidebarLink to="/employee/support/tickets/buyer" icon={User} onNavigate={() => setIsSidebarOpen(false)}>Help for Buyer</SidebarLink>
            </>
          )}

          {user.role === 'SALES' && (
            <>
              <SidebarLink to="/employee/sales/dashboard" icon={TrendingUp} onNavigate={() => setIsSidebarOpen(false)}>Dashboard</SidebarLink>
              <SidebarLink to="/employee/sales/leads" icon={Users} onNavigate={() => setIsSidebarOpen(false)}>Lead Management</SidebarLink>
              <SidebarLink to="/employee/sales/pricing-rules" icon={Tag} onNavigate={() => setIsSidebarOpen(false)}>Pricing Rules</SidebarLink>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-neutral-100 bg-neutral-50">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-8 h-8 rounded-full bg-[#8B6F47] flex items-center justify-center text-white font-bold">
              {user?.avatar || user?.name?.charAt(0) || 'E'}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-neutral-900 truncate">{user?.name}</p>
              <p className="text-xs text-neutral-500 truncate">{user?.role?.replace('_', ' ')}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      <div className="h-screen lg:ml-64 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-neutral-200 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30 flex-shrink-0">
          <div className="flex items-center gap-4">
            <button 
              className="lg:hidden p-2 -ml-2 text-neutral-600"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="text-xl font-semibold text-neutral-800">
              {getPageTitle()}
            </h1>
          </div>
          <NotificationBell userId={user?.user_id || user?.id || null} />
        </header>

        <main className="flex-1 min-h-0 p-4 lg:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default EmployeeLayout;
