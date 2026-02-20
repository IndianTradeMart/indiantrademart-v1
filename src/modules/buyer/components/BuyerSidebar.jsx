import React, { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard,
  MessageSquare,
  User,
  Ticket,
  FileText,
  Star,
  Lightbulb,
  MessageCircle,
  LogOut,
  Ban,
} from "lucide-react";

import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useBuyerAuth } from "@/modules/buyer/context/AuthContext";
import { cn } from "@/lib/utils";
import { useNavigate, useLocation, Link } from "react-router-dom";
import Logo from "@/shared/components/Logo";
import { SheetClose } from "@/components/ui/sheet";

const BuyerSidebar = ({ isMobile = false }) => {
  const { user } = useAuth();
  const { buyer, logout, isBuyerSuspended, buyerLoading } = useBuyerAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileImage, setProfileImage] = useState(null);

  useEffect(() => {
    const avatar = buyer?.avatar_url || user?.user_metadata?.avatar_url || null;
    setProfileImage(avatar);
  }, [buyer?.avatar_url, user?.user_metadata?.avatar_url]);

  // ✅ Full Menu (active buyers)
  const fullMenuItems = useMemo(
    () => [
      { icon: LayoutDashboard, label: "Dashboard", path: "/buyer/dashboard" },
      { icon: MessageSquare, label: "Messages", path: "/buyer/messages" },
      {
        icon: User,
        label: "My Profile",
        subLabel: "Complete your profile",
        path: "/buyer/profile",
      },
      { icon: Ticket, label: "Support Tickets", path: "/buyer/tickets" },
      { icon: FileText, label: "My Proposals", path: "/buyer/proposals" },
      { icon: Star, label: "Favorites", path: "/buyer/favorites" },
      { icon: Lightbulb, label: "Any Suggestion", path: "/buyer/suggestions" },
    ],
    []
  );

  // ✅ Menu based on suspended status
  const menuItems = useMemo(() => {
    if (buyerLoading) return [];

    if (isBuyerSuspended) {
      return [
        { icon: Ban, label: "Account Suspended", path: "/buyer/account-suspended" },
        { icon: Ticket, label: "Support Tickets", path: "/buyer/tickets" },
      ];
    }

    return fullMenuItems;
  }, [buyerLoading, isBuyerSuspended, fullMenuItems]);

  const handleLogout = async () => {
    await logout();
    navigate("/buyer/login");
  };

  const Wrapper = isMobile ? SheetClose : React.Fragment;
  const wrapperProps = isMobile ? { asChild: true } : {};

  const getInitials = () => {
    const name = user?.full_name || "Buyer";
    return name.charAt(0).toUpperCase();
  };

  return (
    <div className="w-full bg-white h-full flex flex-col font-sans z-20">
      <div className="h-16 flex items-center px-6 border-b bg-white">
        <Logo className="h-8" showTagline={false} />
      </div>

      {/* ✅ Suspended banner */}
      {!buyerLoading && isBuyerSuspended && (
        <div className="px-6 pt-4">
          <div className="border border-red-200 bg-red-50 text-red-700 rounded-lg p-3 text-xs">
            Your account is suspended. Only Support Tickets are available.
          </div>
        </div>
      )}

      <div className="p-6 pb-2">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-full bg-[#003D82] text-white flex items-center justify-center text-lg font-bold overflow-hidden shrink-0 border border-blue-100 shadow-sm">
            {profileImage ? (
              <img
                src={profileImage}
                alt="Profile"
                className="h-full w-full object-cover"
              />
            ) : (
              getInitials()
            )}
          </div>

          <div className="overflow-hidden min-w-0">
            <h3 className="font-semibold text-gray-900 text-sm truncate">
              {user?.full_name || "Buyer Account"}
            </h3>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
        {menuItems.map((item, index) => {
          const isActive = location.pathname === item.path;

          return (
            <Wrapper key={index} {...wrapperProps}>
              <Link
                to={item.path}
                className={cn(
                  "flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 group relative",
                  isActive
                    ? "bg-blue-50 text-[#003D82]"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-[#003D82] rounded-r-full" />
                )}
                <item.icon
                  className={cn(
                    "h-5 w-5 mr-3 transition-colors shrink-0",
                    isActive
                      ? "text-[#003D82]"
                      : "text-gray-400 group-hover:text-gray-600"
                  )}
                />
                <div className="flex-1 truncate">
                  <span className="leading-none block truncate">{item.label}</span>
                  {item.subLabel && !isBuyerSuspended && (
                    <span className="text-[10px] text-orange-500 font-normal block mt-0.5 truncate">
                      {item.subLabel}
                    </span>
                  )}
                </div>
              </Link>
            </Wrapper>
          );
        })}
      </nav>

      <div className="p-4 border-t space-y-4 bg-gray-50/50">
        <div className="bg-blue-50/80 rounded-xl p-4 border border-blue-100">
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle className="h-4 w-4 text-green-600" />
            <span className="font-semibold text-sm text-gray-900">Need Help?</span>
          </div>
          <p className="text-xs text-gray-600">
            Use the new AI assistant (bottom-right) for quick help.
          </p>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg font-medium"
        >
          <LogOut className="h-4 w-4 mr-2" /> Sign Out
        </button>
      </div>
    </div>
  );
};

export default BuyerSidebar;
