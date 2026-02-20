// src/contexts/SubdomainContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';

const SubdomainContext = createContext();

// ✅ Only these should trigger subdomain-mode
const KNOWN_SUBDOMAINS = new Set(['vendor', 'buyer', 'man', 'dir', 'admin', 'career']);

export const SubdomainProvider = ({ children }) => {
  const [subdomain, setSubdomain] = useState(null);
  const [appType, setAppType] = useState('main'); // main, vendor, buyer, admin, directory, career
  const [basePath, setBasePath] = useState('');

  useEffect(() => {
    const hostname = window.location.hostname;

    // ✅ Localhost (Development)
    if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
      setSubdomain(null);
      setAppType('main');
      setBasePath('');
      return;
    }

    // ✅ Netlify default domain (e.g. xyz.netlify.app) => treat as MAIN
    // So /vendor/register etc works on Netlify
    if (hostname.endsWith('.netlify.app')) {
      setSubdomain(null);
      setAppType('main');
      setBasePath('');
      return;
    }

    const parts = hostname.split('.');
    let currentSub = '';

    // Assuming: subdomain.domain.com (ignore www)
    if (parts.length >= 3 && parts[0] !== 'www') {
      currentSub = parts[0];
    }

    // ✅ If subdomain is not one of our known subdomains, treat as MAIN
    // This prevents random domains from forcing "directory" and causing blank pages
    if (!KNOWN_SUBDOMAINS.has(currentSub)) {
      setSubdomain(null);
      setAppType('main');
      setBasePath('');
      return;
    }

    setSubdomain(currentSub);

    // Map subdomain to App Type
    switch (currentSub) {
      case 'vendor':
        setAppType('vendor');
        break;
      case 'buyer':
        setAppType('buyer');
        break;
      case 'man':
        setAppType('management');
        break;
      case 'dir':
        setAppType('directory');
        break;
      case 'admin':
        setAppType('admin');
        break;
      case 'career':
        setAppType('career');
        break;
      default:
        setAppType('main');
        break;
    }

    setBasePath('');
  }, []);

  // ✅ Helper to generate correct links based on environment
  // If we are in 'main' mode, we prepend the app prefix (e.g. /vendor)
  // If we are in 'subdomain' mode, we use the path as is (e.g. /dashboard)
  const resolvePath = (path, module) => {
    if (appType === 'main') {
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      if (cleanPath.startsWith(`/${module}`)) return cleanPath;
      return `/${module}${cleanPath}`;
    }
    return path.startsWith('/') ? path : `/${path}`;
  };

  return (
    <SubdomainContext.Provider value={{ subdomain, appType, resolvePath, basePath }}>
      {children}
    </SubdomainContext.Provider>
  );
};

export const useSubdomain = () => {
  const context = useContext(SubdomainContext);
  if (!context) throw new Error('useSubdomain must be used within a SubdomainProvider');
  return context;
};
