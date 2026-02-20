import { Suspense, lazy } from 'react';
import { Outlet } from 'react-router-dom';
import Header from '@/shared/components/Header';
import { Toaster } from '@/components/ui/toaster';

const Footer = lazy(() => import('@/shared/components/Footer'));
const QuotePopup = lazy(() => import('@/shared/components/QuotePopup'));

const PublicLayout = () => {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />

      <main className="flex-grow pt-16">
        <Outlet />
      </main>

      <Suspense fallback={null}>
        <Footer />
      </Suspense>

      <Suspense fallback={null}>
        <QuotePopup />
      </Suspense>
      <Toaster />
    </div>
  );
};

export default PublicLayout;
