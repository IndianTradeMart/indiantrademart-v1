/**
 * Subdomain Middleware for Multi-Tenant Application
 * 
 * Supported Subdomains:
 * - vendor.company.com    -> Vendor Portal
 * - buyer.company.com     -> Buyer Portal
 * - admin.company.com     -> Admin Portal
 * - man.company.com       -> Management Portal
 * - dir.company.com       -> Directory/Main Portal
 * - company.com           -> Directory (default)
 * - localhost:port        -> Main Portal with /module prefixes
 */

export const SubdomainConfig = {
  VENDOR: {
    subdomain: 'vendor',
    appType: 'vendor',
    displayName: 'Vendor Portal',
    description: 'Sell your products and manage your business'
  },
  BUYER: {
    subdomain: 'buyer',
    appType: 'buyer',
    displayName: 'Buyer Portal',
    description: 'Find products and manage purchases'
  },
  ADMIN: {
    subdomain: 'admin',
    appType: 'admin',
    displayName: 'Admin Portal',
    description: 'Manage platform and users'
  },
  MANAGEMENT: {
    subdomain: 'man',
    appType: 'management',
    displayName: 'Management Portal',
    description: 'Manage employees and operations'
  },
  DIRECTORY: {
    subdomain: 'dir',
    appType: 'directory',
    displayName: 'Directory/Marketplace',
    description: 'Browse and search products'
  }
};

/**
 * Detects subdomain from hostname
 * @returns {Object} { subdomain, appType, isSingleTenant }
 */
export const detectSubdomain = () => {
  const hostname = window.location.hostname;
  
  // Development environment
  if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    return {
      subdomain: null,
      appType: 'main',
      isSingleTenant: false,
      isDevelopment: true,
      hostname
    };
  }

  // Production environment
  const parts = hostname.split('.');
  let subdomain = '';

  if (parts.length >= 3 && parts[0] !== 'www') {
    subdomain = parts[0];
  }

  // Map subdomain to appType
  const config = Object.values(SubdomainConfig).find(
    c => c.subdomain === subdomain
  );

  return {
    subdomain,
    appType: config?.appType || 'directory',
    isSingleTenant: !!subdomain,
    isDevelopment: false,
    displayName: config?.displayName || 'IndianTradeMart',
    hostname,
    fullConfig: config
  };
};

/**
 * Get the correct URL for cross-subdomain navigation
 * @param {string} targetAppType - Target app type (vendor, buyer, etc.)
 * @param {string} path - Path within the target app
 * @returns {string} Full URL for navigation
 */
export const getSubdomainUrl = (targetAppType, path = '/') => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  const port = window.location.port ? `:${window.location.port}` : '';
  
  // Development mode
  if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    return `${protocol}//${hostname}${port}/${targetAppType}${path}`;
  }

  // Production mode - construct subdomain URL
  const parts = hostname.split('.');
  let domain = hostname;

  // Remove existing subdomain if present
  if (parts.length >= 3 && parts[0] !== 'www') {
    domain = parts.slice(1).join('.');
  }

  // Find target subdomain
  const config = Object.values(SubdomainConfig).find(
    c => c.appType === targetAppType
  );

  if (!config) {
    return `${protocol}//${domain}${port}${path}`;
  }

  const targetSubdomain = config.subdomain;
  const targetDomain = targetSubdomain
    ? `${targetSubdomain}.${domain}`
    : domain;

  return `${protocol}//${targetDomain}${port}${path}`;
};

/**
 * Check if user should have access to current subdomain
 * @param {Object} user - User object
 * @param {string} appType - Current app type
 * @returns {boolean}
 */
export const hasAccessToSubdomain = (user, appType) => {
  if (!user) return false;

  switch (appType) {
    case 'vendor':
      return user.role === 'VENDOR' || user.role === 'admin';
    case 'buyer':
      return user.role === 'BUYER' || user.role === 'admin';
    case 'admin':
    case 'management':
      return ['admin', 'ADMIN', 'SUPERADMIN'].includes(user.role);
    case 'directory':
      return true; // Public access
    default:
      return false;
  }
};

/**
 * Get breadcrumb navigation for current subdomain
 * @param {string} appType - Current app type
 * @returns {Array} Breadcrumb items
 */
export const getSubdomainBreadcrumbs = (appType) => {
  const baseUrl = getSubdomainUrl('directory', '/');

  const breadcrumbs = [
    {
      label: 'IndianTradeMart',
      url: baseUrl,
      icon: 'home'
    }
  ];

  if (appType === 'main') {
    return breadcrumbs;
  }

  const config = Object.values(SubdomainConfig).find(c => c.appType === appType);
  if (config) {
    breadcrumbs.push({
      label: config.displayName,
      url: getSubdomainUrl(appType, '/'),
      icon: appType
    });
  }

  return breadcrumbs;
};

/**
 * Middleware hook for protecting routes based on subdomain access
 * @param {Object} user - User object
 * @param {string} appType - Current app type
 * @param {Function} navigate - Router navigate function
 * @returns {boolean} Whether user is allowed to access
 */
export const subdomainAccessMiddleware = (user, appType, navigate) => {
  const hasAccess = hasAccessToSubdomain(user, appType);

  if (!hasAccess) {
    // Redirect to directory if not authorized
    const directoryUrl = getSubdomainUrl('directory', '/');
    window.location.href = directoryUrl;
    return false;
  }

  return true;
};

/**
 * Get navigation links based on current subdomain
 * @param {string} appType - Current app type
 * @returns {Array} Navigation links
 */
export const getSubdomainNavigation = (appType) => {
  const links = [];

  switch (appType) {
    case 'vendor':
      links.push(
        { label: 'Dashboard', path: '/dashboard', icon: 'grid' },
        { label: 'Products', path: '/products', icon: 'box' },
        { label: 'Leads', path: '/leads', icon: 'target' },
        { label: 'Profile', path: '/profile', icon: 'user' },
        { label: 'Support', path: '/support', icon: 'help' }
      );
      break;

    case 'buyer':
      links.push(
        { label: 'Home', path: '/home', icon: 'home' },
        { label: 'Search', path: '/search', icon: 'search' },
        { label: 'Proposals', path: '/proposals', icon: 'file' },
        { label: 'Messages', path: '/messages', icon: 'mail' },
        { label: 'Profile', path: '/profile', icon: 'user' }
      );
      break;

    case 'admin':
      links.push(
        { label: 'Dashboard', path: '/dashboard', icon: 'grid' },
        { label: 'Users', path: '/users', icon: 'users' },
        { label: 'Vendors', path: '/vendors', icon: 'store' },
        { label: 'KYC', path: '/kyc', icon: 'shield' },
        { label: 'Settings', path: '/settings', icon: 'settings' }
      );
      break;

    case 'management':
      links.push(
        { label: 'Dashboard', path: '/dashboard', icon: 'grid' },
        { label: 'Employees', path: '/staff', icon: 'users' },
        { label: 'Analytics', path: '/analytics', icon: 'chart' },
        { label: 'Settings', path: '/settings', icon: 'settings' }
      );
      break;

    case 'directory':
    default:
      links.push(
        { label: 'Home', path: '/', icon: 'home' },
        { label: 'Browse', path: '/categories', icon: 'grid' },
        { label: 'Search', path: '/search', icon: 'search' },
        { label: 'Vendors', path: '/vendors', icon: 'store' }
      );
      break;
  }

  return links;
};
