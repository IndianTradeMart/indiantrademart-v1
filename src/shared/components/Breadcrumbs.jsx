
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

const Breadcrumbs = () => {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter((x) => x);

  return (
    <nav className="flex items-center text-sm text-gray-500 mb-4" aria-label="Breadcrumb">
      <Link to="/" className="hover:text-gray-900 flex items-center">
        <Home className="w-4 h-4 mr-1" />
        Home
      </Link>
      {pathnames.map((value, index) => {
        const to = `/${pathnames.slice(0, index + 1).join('/')}`;
        const isLast = index === pathnames.length - 1;

        return (
          <div key={to} className="flex items-center">
            <ChevronRight className="w-4 h-4 mx-2 text-gray-400" />
            {isLast ? (
              <span className="font-medium text-gray-900 capitalize">
                {value.replace(/-/g, ' ')}
              </span>
            ) : (
              <Link to={to} className="hover:text-gray-900 capitalize">
                {value.replace(/-/g, ' ')}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
};

export default Breadcrumbs;
