import React from 'react';
import { Menu, Bell, LogOut, Settings, User as UserIcon, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const getInitials = (name = '') => {
  const parts = String(name).trim().split(' ').filter(Boolean);
  if (!parts.length) return 'V';
  const a = parts[0]?.[0] || 'V';
  const b = parts.length > 1 ? parts[1]?.[0] : (parts[0]?.[1] || '');
  return (a + b).toUpperCase();
};

const VendorHeader = ({ onMenuClick }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const ownerName =
    user?.ownerName ||
    user?.owner_name ||
    user?.name ||
    (user?.email ? user.email.split('@')[0] : 'Vendor');

  const companyName =
    user?.companyName ||
    user?.company_name ||
    'Vendor Account';

  const profileImg =
    user?.profileImage ||
    user?.profile_image ||
    '';

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-x-4 border-b bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
      <button
        type="button"
        className="-m-2.5 p-2.5 text-gray-700 lg:hidden"
        onClick={onMenuClick}
      >
        <span className="sr-only">Open sidebar</span>
        <Menu className="h-6 w-6" aria-hidden="true" />
      </button>

      <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <div className="flex flex-1" />

        <div className="flex items-center gap-x-2 lg:gap-x-3">
          {/* ✅ Home Button (Public Site) */}
          <Button
            type="button"
            variant="outline"
            className="hidden sm:inline-flex"
            onClick={() => navigate('/')}
            title="Go to Home"
          >
            <Home className="mr-2 h-4 w-4" />
            Home
          </Button>

          <button
            type="button"
            className="-m-2.5 p-2.5 text-gray-400 hover:text-gray-500"
          >
            <span className="sr-only">View notifications</span>
            <Bell className="h-6 w-6" aria-hidden="true" />
          </button>

          <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-200" aria-hidden="true" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="-m-1.5 flex items-center gap-3 p-1.5">
                <span className="sr-only">Open user menu</span>

                <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border">
                  {profileImg ? (
                    <img src={profileImg} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-gray-700">{getInitials(ownerName)}</span>
                  )}
                </div>

                <span className="hidden lg:flex lg:flex-col lg:items-start">
                  <span className="text-sm font-bold leading-5 text-gray-900">
                    {ownerName}
                  </span>
                  <span className="text-xs text-gray-500 leading-4">
                    {companyName}
                  </span>
                </span>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => navigate('/vendor/profile')}>
                <UserIcon className="mr-2 h-4 w-4" /> Profile
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => navigate('/vendor/settings')}>
                <Settings className="mr-2 h-4 w-4" /> Settings
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                <LogOut className="mr-2 h-4 w-4" /> Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </div>
    </header>
  );
};

export default VendorHeader;
