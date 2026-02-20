import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useBuyerAuth } from "@/modules/buyer/context/AuthContext";

export default function AccountSuspended() {
  const { logout } = useBuyerAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();               // ✅ signOut
    navigate("/buyer/login", { replace: true }); // ✅ force redirect
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-xl w-full bg-white border rounded-xl p-6 space-y-4">
        <h1 className="text-2xl font-bold text-red-600">Account Suspended</h1>

        <p className="text-gray-600">
          Your buyer account has been suspended by Admin. You can still access Support Tickets.
          Please contact support to re-activate your account.
        </p>

        <div className="flex gap-3 flex-wrap">
          <Button asChild>
            <Link to="/buyer/tickets">Open Support Tickets</Link>
          </Button>

          {/* ✅ THIS logout will work */}
          <Button variant="outline" onClick={handleLogout}>
            Logout
          </Button>
        </div>

        <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded">
          Support Email:{" "}
          <span className="font-mono text-blue-600">support@indiantrademart.com</span>
        </div>

        <div className="text-xs text-gray-400">
          Current page: {location.pathname}
        </div>
      </div>
    </div>
  );
}