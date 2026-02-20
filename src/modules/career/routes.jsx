
import React, { lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import CareerLayout from '@/modules/career/layouts/CareerLayout';
const CareerHome = lazy(() => import('@/modules/career/pages/CareerHome'));

export const CareerRoutes = () => {
  return (
    <Routes>
      <Route element={<CareerLayout />}>
        <Route index element={<CareerHome />} />
        <Route path="*" element={<CareerHome />} />
      </Route>
    </Routes>
  );
};
