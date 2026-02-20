import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Home,
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  FileText, 
  Settings, 
  HelpCircle, 
  Image, 
  ShieldCheck,
  MapPin,
  FolderKanban,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Logo from '@/shared/components/Logo';

const navigation = [
  // ✅ Home (public website)
  { name: 'Home', href: '/', icon: Home },
  { name: 'Dashboard', href: '/vendor/dashboard', icon: LayoutDashboard },
  { name: 'Products', href: '/vendor/products', icon: Package },
  { name: 'Buy Leads', href: '/vendor/leads', icon: ShoppingCart },
  { name: 'Proposals', href: '/vendor/proposals', icon: FileText },
  { name: 'Plan Business Preferences', href: '/vendor/coverage', icon: MapPin },
  { name: 'Collections', href: '/vendor/collections', icon: FolderKanban },
  { name: 'Photos & Docs', href: '/vendor/photos-docs', icon: Image },
  { name: 'KYC Verification', href: '/vendor/kyc', icon: ShieldCheck },
  { name: 'Support', href: '/vendor/support', icon: HelpCircle },
  { name: 'Settings', href: '/vendor/settings', icon: Settings },
];

const VendorSidebar = ({ isOpen, onClose }) => {
  const location = useLocation();

  return (
    <>
      {/* Mobile backdrop */}
      <div 
        className={cn(
          "fixed inset-0 z-40 bg-gray-900/80 backdrop-blur-sm transition-opacity lg:hidden",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-auto lg:flex lg:w-64 lg:flex-col",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-16 shrink-0 items-center justify-between px-6 border-b">
          <Logo className="h-8 w-auto" />
          <button 
            onClick={onClose}
            className="lg:hidden -mr-2 p-2 text-gray-500 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-4">
          <nav className="flex-1 space-y-1 mt-6">
            {navigation.map((item) => {
              // Home is a special case because every path starts with '/'
              const isActive = item.href === '/' 
                ? location.pathname === '/'
                : location.pathname.startsWith(item.href);

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold transition-colors",
                    isActive
                      ? "bg-blue-50 text-[#003D82]"
                      : "text-gray-700 hover:text-[#003D82] hover:bg-gray-50"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-5 w-5 shrink-0",
                      isActive ? "text-[#003D82]" : "text-gray-400 group-hover:text-[#003D82]"
                    )}
                    aria-hidden="true"
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </>
  );
};

export default VendorSidebar;
