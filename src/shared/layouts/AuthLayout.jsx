
import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const AuthLayout = () => {
  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link to="/">
          <img
            src="/itm-logo.png"
            alt="IndianTradeMart"
            className="h-12 w-auto mx-auto mb-4"
          />
        </Link>
        <motion.h2 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 text-center text-3xl font-extrabold text-[#003D82]"
        >
          Vendor Portal
        </motion.h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-neutral-200"
        >
          <Outlet />
        </motion.div>
      </div>
    </div>
  );
};

export default AuthLayout;
