
import React from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const Categories = () => {
  const navigate = useNavigate();
  return (
    <div className="p-6 text-center bg-white rounded-lg border border-neutral-200">
        <h2 className="text-xl font-bold mb-2 text-neutral-800">Category Management Disabled</h2>
        <p className="text-neutral-500 mb-4">This module has been removed.</p>
        <Button onClick={() => navigate('/admin/dashboard')}>Go to Dashboard</Button>
    </div>
  );
};

export default Categories;
