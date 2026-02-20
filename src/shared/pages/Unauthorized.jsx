import React from 'react';
import { Link } from 'react-router-dom';

const Unauthorized = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-gray-900">Access Denied</h1>
        <p className="mt-2 text-sm text-gray-500">
          You do not have permission to access this page. Please login with the correct role.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            to="/admin/login"
            className="px-4 py-2 rounded-md bg-[#003D82] text-white text-sm font-medium"
          >
            Go to Login
          </Link>
          <Link
            to="/"
            className="px-4 py-2 rounded-md border text-sm font-medium text-gray-700"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Unauthorized;
