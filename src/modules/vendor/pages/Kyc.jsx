
import React from 'react';
import { Navigate } from 'react-router-dom';

// This component acts as a redirect wrapper to the new combined Profile & KYC page
// CRITICAL FIX: Use absolute path redirect to prevent loops
const Kyc = () => {
  return <Navigate to="/vendor/profile?tab=primary" replace />;
};

export default Kyc;
