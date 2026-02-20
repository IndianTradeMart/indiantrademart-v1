import React, { lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ProtectedRoute from '@/shared/components/ProtectedRoute';
import PortalLayout from '@/shared/layouts/PortalLayout';
import EmployeeLayout from '@/modules/employee/layouts/EmployeeLayout';
import { useSubdomain } from '@/contexts/SubdomainContext';

// Admin Pages
const AdminDashboard = lazy(() => import('@/modules/admin/pages/Dashboard'));
const AdminVendors = lazy(() => import('@/modules/admin/pages/Vendors'));
const AdminVendorProducts = lazy(() => import('@/modules/admin/pages/VendorProducts'));
const Staff = lazy(() => import('@/modules/admin/pages/Staff'));
const AuditLogs = lazy(() => import('@/modules/admin/pages/AuditLogs'));
const AdminSettings = lazy(() => import('@/modules/admin/pages/Settings'));
const KYCApproval = lazy(() => import('@/modules/admin/pages/KYCApproval'));
const AdminFinance = lazy(() => import('@/modules/admin/pages/Finance'));
const FinanceDashboard = lazy(() => import('@/modules/finance/pages/Dashboard'));
const SuperAdminLogin = lazy(() => import('@/modules/admin/pages/superadmin/SuperAdminLogin'));
const SuperAdminDashboard = lazy(() => import('@/modules/admin/pages/superadmin/SuperAdminDashboard'));
const SuperAdminProtectedRoute = lazy(() => import('@/modules/admin/routes/SuperAdminProtectedRoute'));

// Reuse Employee Support pages for Admin
const SupportTickets = lazy(() => import('@/modules/employee/pages/support/Tickets'));

// HR Pages
const HrDashboard = lazy(() => import('@/modules/hr/pages/Dashboard'));
const HrStaff = lazy(() => import('@/modules/hr/pages/Staff'));

// Employee Pages
const EmployeeLogin = lazy(() => import('@/modules/employee/pages/auth/Login'));
const DataEntryDashboard = lazy(() => import('@/modules/employee/pages/dataentry/Dashboard'));
const DataEntryLocations = lazy(() => import('@/modules/employee/pages/dataentry/LocationsFixed'));
const DataEntryVendors = lazy(() => import('@/modules/employee/pages/dataentry/Vendors'));
const DataEntryVendorProducts = lazy(() => import('@/modules/employee/pages/dataentry/VendorProducts'));
const DataEntryAddProduct = lazy(() => import('@/modules/employee/pages/dataentry/AddProduct'));
const DataEntryCategories = lazy(() => import('@/modules/employee/pages/dataentry/CategoriesFixed'));
const DataEntryCsvUpload = lazy(() => import('@/modules/employee/pages/dataentry/CsvUpload'));
const DataEntryBulkImport = lazy(() => import('@/modules/employee/pages/dataentry/BulkImport'));
const DataEntryVendorOnboarding = lazy(() => import('@/modules/employee/pages/dataentry/VendorOnboarding'));
const DataEntryRecords = lazy(() => import('@/modules/employee/pages/dataentry/DataEntryRecords'));
const KycApprovals = lazy(() => import('@/modules/employee/pages/support/KycApprovals'));
const SupportDashboard = lazy(() => import('@/modules/employee/pages/support/Dashboard'));
const SalesDashboard = lazy(() => import('@/modules/employee/pages/sales/Dashboard'));
const SalesLeads = lazy(() => import('@/modules/employee/pages/sales/Leads'));
const PricingRules = lazy(() => import('@/modules/employee/pages/sales/PricingRules'));

const PortalLogin = lazy(() => import('@/shared/pages/PortalLogin'));
import { ShieldCheck, Users } from 'lucide-react';
const Buyers = lazy(() => import('@/modules/admin/pages/Buyers'));
const Unauthorized = lazy(() => import('@/shared/pages/Unauthorized'));

const LoginRouter = () => {
  const location = useLocation();
  const { appType } = useSubdomain();
  const p = location.pathname || '';
  const search = location.search || '';
  const params = new URLSearchParams(search);
  const portalParam = String(params.get('portal') || '').toLowerCase();

  // ✅ MAIN MODE (localhost) prefixes
  if (p.startsWith('/employee')) {
    return <EmployeeLogin />;
  }

  if (p.startsWith('/hr')) {
    return (
      <PortalLogin
        portalName="HR Portal"
        colorScheme="emerald"
        defaultEmail="harsh@hr.com"
        icon={Users}
      />
    );
  }
  if (p.startsWith('/finance-portal')) {
    return (
      <PortalLogin
        portalName="Finance Portal"
        colorScheme="amber"
        defaultEmail="finance@itm.com"
        icon={ShieldCheck}
      />
    );
  }

  if (p.startsWith('/admin')) {
    if (portalParam === 'finance') {
      return (
        <PortalLogin
          portalName="Finance Portal"
          colorScheme="amber"
          defaultEmail="finance@itm.com"
          icon={ShieldCheck}
        />
      );
    }
    if (portalParam === 'hr') {
      return (
        <PortalLogin
          portalName="HR Portal"
          colorScheme="emerald"
          defaultEmail="harsh@hr.com"
          icon={Users}
        />
      );
    }
    return (
      <PortalLogin
        portalName="Admin Portal"
        colorScheme="blue"
        defaultEmail="aditi@admin.com"
        icon={ShieldCheck}
      />
    );
  }

  // ✅ SUBDOMAIN MODE (admin.company.com / man.company.com)
  if (appType === 'admin' || appType === 'management') {
    if (portalParam === 'finance') {
      return (
        <PortalLogin
          portalName="Finance Portal"
          colorScheme="amber"
          defaultEmail="finance@itm.com"
          icon={ShieldCheck}
        />
      );
    }
    if (portalParam === 'hr') {
      return (
        <PortalLogin
          portalName="HR Portal"
          colorScheme="emerald"
          defaultEmail="harsh@hr.com"
          icon={Users}
        />
      );
    }
    return (
      <PortalLogin
        portalName="Admin Portal"
        colorScheme="blue"
        defaultEmail="aditi@admin.com"
        icon={ShieldCheck}
      />
    );
  }

  // fallback
  return <EmployeeLogin />;
};

export const AdminRoutes = () => {
  const location = useLocation();
  const { appType } = useSubdomain();
  const path = location.pathname || '';
  const isFinanceScope = path.includes('/finance-portal');
  const isHrScope = path.startsWith('/hr');
  const isEmployeeScope = path.startsWith('/employee');
  const isAdminScope = appType === 'admin' || appType === 'management' || path.startsWith('/admin') || (!isFinanceScope && !isHrScope && !isEmployeeScope);

  return (
    <Routes>
      {/* ✅ Correct login route for /admin/login, /employee/login, /hr/login */}
      <Route path="login" element={<LoginRouter />} />

      {/* Superadmin */}
      {isAdminScope ? (
        <>
          <Route path="superadmin/login" element={<SuperAdminLogin />} />
          <Route element={<SuperAdminProtectedRoute />}>
            <Route path="superadmin/dashboard" element={<SuperAdminDashboard />} />
          </Route>
        </>
      ) : null}

      <Route path="unauthorized" element={<Unauthorized />} />

      {/* Finance Portal */}
      {isFinanceScope ? (
        <Route path="finance-portal" element={<ProtectedRoute allowedRoles={['FINANCE', 'ADMIN']} />}>
          <Route element={<PortalLayout role="FINANCE" />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<FinanceDashboard />} />
          </Route>
        </Route>
      ) : null}

      {/* Admin */}
      {isAdminScope ? (
        <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'FINANCE']} />}>
          <Route element={<PortalLayout role="ADMIN" />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />

            {/* Vendors (business management) */}
            <Route path="vendors" element={<AdminVendors />} />
            <Route path="vendors/:vendorId/products" element={<AdminVendorProducts />} />

            <Route path="tickets" element={<SupportTickets />} />

               {/* ✅ BUYERS (ADDED & FIXED) */}
            <Route path="buyers" element={<Buyers />} />


            {/* KYC Approvals (verification) */}
            <Route path="kyc" element={<KYCApproval />} />
            <Route path="finance" element={<AdminFinance />} />

            <Route path="staff" element={<Staff />} />
            <Route path="audit-logs" element={<AuditLogs />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>
        </Route>
      ) : null}

      {/* HR */}
      {isHrScope ? (
        <Route element={<ProtectedRoute allowedRoles={['HR']} />}>
          <Route element={<PortalLayout role="HR" />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<HrDashboard />} />
            <Route path="staff" element={<HrStaff />} />
          </Route>
        </Route>
      ) : null}

      {/* Employees - Data Entry */}
      {isEmployeeScope ? (
        <Route path="dataentry" element={<EmployeeLayout allowedRole="DATA_ENTRY" />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DataEntryDashboard />} />
          <Route path="categories" element={<DataEntryCategories />} />
          <Route path="categories/upload" element={<DataEntryCsvUpload />} />
          <Route path="locations" element={<DataEntryLocations />} />
          <Route path="bulk-import" element={<DataEntryBulkImport />} />
          <Route path="vendor-onboarding" element={<DataEntryVendorOnboarding />} />
          <Route path="records" element={<DataEntryRecords />} />
          <Route path="vendors" element={<DataEntryVendors />} />
          <Route path="vendors/:vendorId" element={<DataEntryVendorProducts />} />
          <Route path="vendors/:vendorId/products" element={<DataEntryVendorProducts />} />
          <Route path="vendors/:vendorId/products/add" element={<DataEntryAddProduct />} />
          <Route path="vendors/:vendorId/products/:productId/edit" element={<DataEntryAddProduct />} />
          <Route path="kyc-review" element={<KycApprovals />} />
          <Route path="kyc" element={<KycApprovals />} />
        </Route>
      ) : null}

      {/* Employees - Support */}
      {isEmployeeScope ? (
        <Route path="support" element={<EmployeeLayout allowedRole="SUPPORT" />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<SupportDashboard />} />
          <Route path="tickets" element={<SupportTickets />} />
          <Route path="tickets/vendor" element={<SupportTickets />} />
          <Route path="tickets/buyer" element={<SupportTickets />} />
        </Route>
      ) : null}

      {/* Employees - Sales */}
      {isEmployeeScope ? (
        <Route path="sales" element={<EmployeeLayout allowedRole="SALES" />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<SalesDashboard />} />
          <Route path="leads" element={<SalesLeads />} />
          <Route path="pricing-rules" element={<PricingRules />} />
        </Route>
      ) : null}

      <Route path="*" element={<Navigate to="login" replace />} />
    </Routes>
  );
};
