import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubdomain } from '@/contexts/SubdomainContext';
import {
  getSubdomainUrl,
  getSubdomainNavigation,
  getSubdomainBreadcrumbs,
  hasAccessToSubdomain,
  SubdomainConfig
} from '@/middleware/subdomainMiddleware';

/**
 * Custom hook for subdomain-aware routing and navigation
 * Handles navigation between different subdomains automatically
 */
export const useSubdomainRouter = () => {
  const { appType, subdomain } = useSubdomain();
  const navigate = useNavigate();

  /**
   * Navigate to a different app/subdomain with optional path
   * @param {string} targetAppType - Target app type (vendor, buyer, admin, etc.)
   * @param {string} path - Path within the target app
   */
  const navigateToSubdomain = useCallback((targetAppType, path = '/') => {
    const url = getSubdomainUrl(targetAppType, path);
    
    // If same subdomain, use React Router
    if (targetAppType === appType) {
      navigate(path);
    } else {
      // Different subdomain, use full URL redirect
      window.location.href = url;
    }
  }, [appType, navigate]);

  /**
   * Get navigation links for current subdomain
   */
  const navLinks = getSubdomainNavigation(appType);

  /**
   * Get breadcrumbs for current subdomain
   */
  const breadcrumbs = getSubdomainBreadcrumbs(appType);

  /**
   * Get URL for target subdomain/app
   */
  const getUrl = useCallback((targetAppType, path = '/') => {
    return getSubdomainUrl(targetAppType, path);
  }, []);

  /**
   * Navigate to vendor portal
   */
  const goToVendor = useCallback((path = '/') => {
    navigateToSubdomain('vendor', path);
  }, [navigateToSubdomain]);

  /**
   * Navigate to buyer portal
   */
  const goBuyer = useCallback((path = '/') => {
    navigateToSubdomain('buyer', path);
  }, [navigateToSubdomain]);

  /**
   * Navigate to admin portal
   */
  const goAdmin = useCallback((path = '/') => {
    navigateToSubdomain('admin', path);
  }, [navigateToSubdomain]);

  /**
   * Navigate to management portal
   */
  const goManagement = useCallback((path = '/') => {
    navigateToSubdomain('management', path);
  }, [navigateToSubdomain]);

  /**
   * Navigate to directory/marketplace
   */
  const goDirectory = useCallback((path = '/') => {
    navigateToSubdomain('directory', path);
  }, [navigateToSubdomain]);

  return {
    appType,
    subdomain,
    navigateToSubdomain,
    navLinks,
    breadcrumbs,
    getUrl,
    goVendor,
    goBuyer,
    goAdmin,
    goManagement,
    goDirectory,
    SubdomainConfig
  };
};

/**
 * Hook to check if current user has access to current subdomain
 */
export const useSubdomainAccess = (user) => {
  const { appType } = useSubdomain();
  
  return hasAccessToSubdomain(user, appType);
};
