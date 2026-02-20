
import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import Footer from '@/shared/components/Footer';
import { useSubdomain } from '@/contexts/SubdomainContext';

const CareerLayout = () => {
  const { appType } = useSubdomain();
  const basePath = appType === 'career' ? '' : '/career';

  const withBase = (path = '') => {
    if (!basePath) return path || '/';
    if (!path || path === '/') return basePath;
    return `${basePath}${path.startsWith('/') ? path : `/${path}`}`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-white font-sans">
      <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Link to={withBase('/')} className="flex items-center space-x-2">
               <div className="bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold rounded-lg w-8 h-8 flex items-center justify-center">
                 C
               </div>
               <span className="font-bold text-xl text-slate-900 hidden sm:inline-block">
                 ITM <span className="text-rose-500">Careers</span>
               </span>
            </Link>
          </div>
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link to={withBase('/jobs')} className="transition-colors hover:text-rose-500 text-slate-600">Open Roles</Link>
            <Link to={withBase('/culture')} className="transition-colors hover:text-rose-500 text-slate-600">Life at ITM</Link>
            <Link to={withBase('/internships')} className="transition-colors hover:text-rose-500 text-slate-600">Internships</Link>
          </nav>
        </div>
      </header>
      
      <main className="flex-1">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
};

export default CareerLayout;
