import React, { useEffect, useMemo, useState } from 'react';
import { useSuperAdmin } from '@/modules/admin/context/SuperAdminContext';
import { superAdminServerApi } from '@/modules/admin/services/superAdminServerApi';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ShieldAlert,
  LogOut,
  RefreshCw,
  Save,
  Trash2,
  KeyRound,
  Plus,
  Wrench,
  Users,
  Building2,
  IndianRupee,
  History,
  Settings,
} from 'lucide-react';

const EMPLOYEE_ROLES = ['ADMIN', 'HR', 'DATA_ENTRY', 'SUPPORT', 'SALES', 'FINANCE'];
const NOTICE_VARIANTS = ['info', 'warning', 'critical'];

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
};

const money = (value) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-IN');
};

const normalizeRole = (value) => String(value || '').trim().toUpperCase();

const roleToDepartment = (role) => {
  switch (normalizeRole(role)) {
    case 'ADMIN':
      return 'Administration';
    case 'HR':
      return 'Human Resources';
    case 'FINANCE':
      return 'Finance';
    case 'SUPPORT':
      return 'Support';
    case 'SALES':
      return 'Sales';
    case 'DATA_ENTRY':
    case 'DATAENTRY':
      return 'Operations';
    default:
      return '';
  }
};

const getDepartmentLabel = (emp) =>
  emp?.department ||
  emp?.dept ||
  roleToDepartment(emp?.role) ||
  '—';

export default function SuperAdminDashboard() {
  const { superAdmin, logout, changePassword } = useSuperAdmin();

  // System + pages
  const [systemConfig, setSystemConfig] = useState({
    maintenance_mode: false,
    maintenance_message: '',
    public_notice_enabled: false,
    public_notice_message: '',
    public_notice_variant: 'info',
  });
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemSaving, setSystemSaving] = useState(false);

  const [pages, setPages] = useState([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pageBusyId, setPageBusyId] = useState(null);
  const [newPage, setNewPage] = useState({ page_name: '', page_route: '', error_message: '' });
  const [newPageSaving, setNewPageSaving] = useState(false);

  // Employees
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [employeeSaving, setEmployeeSaving] = useState(false);
  const [employeeDeletingId, setEmployeeDeletingId] = useState(null);
  const [employeeForm, setEmployeeForm] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    role: 'DATA_ENTRY',
    department: 'Operations',
    status: 'ACTIVE',
  });

  // Vendors
  const [vendors, setVendors] = useState([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorDeletingId, setVendorDeletingId] = useState(null);

  // Finance
  const [financeSummary, setFinanceSummary] = useState({ totalGross: 0, totalNet: 0, last30: 0 });
  const [financePayments, setFinancePayments] = useState([]);
  const [financeLoading, setFinanceLoading] = useState(false);

  // Audit
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilters, setAuditFilters] = useState({
    hoursBack: 168,
    limit: 300,
    actor_type: 'ALL',
    action_contains: '',
  });

  // Settings
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);

  const handleError = (error, fallback) => {
    toast({
      title: 'Error',
      description: error?.message || fallback || 'Something went wrong',
      variant: 'destructive',
    });
  };

  const fetchSystemConfig = async () => {
    setSystemLoading(true);
    try {
      const { config } = await superAdminServerApi.system.getConfig();
      if (config) {
        setSystemConfig((prev) => ({
          ...prev,
          ...config,
          maintenance_mode: config.maintenance_mode === true,
          maintenance_message: config.maintenance_message || '',
          public_notice_enabled: config.public_notice_enabled === true,
          public_notice_message: config.public_notice_message || '',
          public_notice_variant: config.public_notice_variant || prev.public_notice_variant,
        }));
      }
    } catch (error) {
      handleError(error, 'Failed to load system config');
    } finally {
      setSystemLoading(false);
    }
  };

  const fetchPages = async () => {
    setPagesLoading(true);
    try {
      const { pages: pageList } = await superAdminServerApi.pages.list();
      setPages(pageList || []);
    } catch (error) {
      handleError(error, 'Failed to load page controls');
    } finally {
      setPagesLoading(false);
    }
  };

  const fetchEmployees = async () => {
    setEmployeesLoading(true);
    try {
      const { employees: list } = await superAdminServerApi.employees.list();
      setEmployees(list || []);
    } catch (error) {
      handleError(error, 'Failed to load employees');
    } finally {
      setEmployeesLoading(false);
    }
  };

  const fetchVendors = async () => {
    setVendorsLoading(true);
    try {
      const { vendors: list } = await superAdminServerApi.vendors.list(800);
      setVendors(list || []);
    } catch (error) {
      handleError(error, 'Failed to load vendors');
    } finally {
      setVendorsLoading(false);
    }
  };

  const fetchFinance = async () => {
    setFinanceLoading(true);
    try {
      const [{ data: summary }, { data: payments }] = await Promise.all([
        superAdminServerApi.finance.summary(),
        superAdminServerApi.finance.payments({ limit: 400 }),
      ]);
      setFinanceSummary(summary || { totalGross: 0, totalNet: 0, last30: 0 });
      setFinancePayments(payments || []);
    } catch (error) {
      handleError(error, 'Failed to load finance data');
    } finally {
      setFinanceLoading(false);
    }
  };

  const fetchAuditLogs = async (overrides = {}) => {
    setAuditLoading(true);
    try {
      const merged = { ...auditFilters, ...overrides };
      const params = {
        hoursBack: merged.hoursBack,
        limit: merged.limit,
        action_contains: merged.action_contains || undefined,
        actor_type: merged.actor_type === 'ALL' ? undefined : merged.actor_type,
      };
      const { logs } = await superAdminServerApi.audit.list(params);
      setAuditLogs(logs || []);
    } catch (error) {
      handleError(error, 'Failed to load audit logs');
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([
      fetchSystemConfig(),
      fetchPages(),
      fetchEmployees(),
      fetchVendors(),
      fetchFinance(),
      fetchAuditLogs(),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredEmployees = useMemo(() => {
    const term = employeeSearch.trim().toLowerCase();
    if (!term) return employees;
    return (employees || []).filter((emp) =>
      [emp.full_name, emp.email, emp.role, emp.department]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    );
  }, [employees, employeeSearch]);

  const filteredVendors = useMemo(() => {
    const term = vendorSearch.trim().toLowerCase();
    if (!term) return vendors;
    return (vendors || []).filter((v) =>
      [v.company_name, v.owner_name, v.email, v.vendor_id, v.city, v.state]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(term))
    );
  }, [vendors, vendorSearch]);

  const saveSystemConfig = async () => {
    setSystemSaving(true);
    try {
      await superAdminServerApi.system.updateConfig({
        maintenance_mode: systemConfig.maintenance_mode === true,
        maintenance_message: systemConfig.maintenance_message || '',
        public_notice_enabled: systemConfig.public_notice_enabled === true,
        public_notice_message: systemConfig.public_notice_message || '',
        public_notice_variant: systemConfig.public_notice_variant || 'info',
      });
      toast({ title: 'Saved', description: 'System configuration updated.' });
      await fetchAuditLogs();
    } catch (error) {
      handleError(error, 'Failed to save system config');
    } finally {
      setSystemSaving(false);
    }
  };

  const updatePageStatus = async (pageId, updates) => {
    setPageBusyId(pageId);
    try {
      const { page } = await superAdminServerApi.pages.update(pageId, updates);
      setPages((prev) => (prev || []).map((p) => (p.id === pageId ? { ...p, ...page } : p)));
      await fetchAuditLogs();
    } catch (error) {
      handleError(error, 'Failed to update page');
      await fetchPages();
    } finally {
      setPageBusyId(null);
    }
  };

  const handlePageMessageChange = (pageId, value) => {
    setPages((prev) =>
      (prev || []).map((p) => (p.id === pageId ? { ...p, error_message: value } : p))
    );
  };

  const createPageStatus = async () => {
    const page_name = newPage.page_name.trim();
    const page_route = newPage.page_route.trim();
    if (!page_name || !page_route) {
      toast({
        title: 'Required',
        description: 'Page name and route are required.',
        variant: 'destructive',
      });
      return;
    }

    setNewPageSaving(true);
    try {
      await superAdminServerApi.pages.create({
        page_name,
        page_route,
        error_message: newPage.error_message || '',
      });
      toast({ title: 'Page added', description: `${page_name} is now controllable.` });
      setNewPage({ page_name: '', page_route: '', error_message: '' });
      await fetchPages();
      await fetchAuditLogs();
    } catch (error) {
      handleError(error, 'Failed to create page control');
    } finally {
      setNewPageSaving(false);
    }
  };

  const deletePageStatus = async (page) => {
    if (!page?.id) return;
    if (!window.confirm(`Delete page control for ${page.page_name}?`)) return;
    setPageBusyId(page.id);
    try {
      await superAdminServerApi.pages.delete(page.id);
      toast({ title: 'Deleted', description: `${page.page_name} removed.` });
      await fetchPages();
      await fetchAuditLogs();
    } catch (error) {
      handleError(error, 'Failed to delete page control');
    } finally {
      setPageBusyId(null);
    }
  };

  const resetEmployeeForm = () => {
    setEmployeeForm({
      full_name: '',
      email: '',
      password: '',
      phone: '',
      role: 'DATA_ENTRY',
      department: 'Operations',
      status: 'ACTIVE',
    });
  };

  const submitEmployee = async (e) => {
    e.preventDefault();
    if (!employeeForm.full_name || !employeeForm.email || !employeeForm.password) {
      toast({
        title: 'Required',
        description: 'Name, email, and password are required.',
        variant: 'destructive',
      });
      return;
    }

    setEmployeeSaving(true);
    try {
      await superAdminServerApi.employees.create(employeeForm);
      toast({ title: 'Employee created', description: employeeForm.email });
      setEmployeeModalOpen(false);
      resetEmployeeForm();
      await fetchEmployees();
      await fetchAuditLogs();
    } catch (error) {
      handleError(error, 'Failed to create employee');
    } finally {
      setEmployeeSaving(false);
    }
  };

  const deleteEmployee = async (emp) => {
    if (!emp?.id) return;
    if (!window.confirm(`Delete employee ${emp.full_name || emp.email}?`)) return;
    setEmployeeDeletingId(emp.id);
    try {
      await superAdminServerApi.employees.delete(emp.id);
      toast({ title: 'Deleted', description: emp.email || 'Employee removed.' });
      await fetchEmployees();
      await fetchAuditLogs();
    } catch (error) {
      handleError(error, 'Failed to delete employee');
    } finally {
      setEmployeeDeletingId(null);
    }
  };

  const resetEmployeePassword = async (emp) => {
    if (!emp?.id) return;
    const nextPassword = window.prompt(
      `Enter a new password for ${emp.email} (min 6 characters):`
    );
    if (!nextPassword) return;
    if (nextPassword.length < 6) {
      toast({
        title: 'Invalid password',
        description: 'Password must be at least 6 characters.',
        variant: 'destructive',
      });
      return;
    }

    setEmployeeDeletingId(emp.id);
    try {
      await superAdminServerApi.employees.resetPassword(emp.id, nextPassword);
      toast({
        title: 'Password reset',
        description: `${emp.email} can use the new password now.`,
      });
      await fetchAuditLogs();
    } catch (error) {
      handleError(error, 'Failed to reset password');
    } finally {
      setEmployeeDeletingId(null);
    }
  };

  const deleteVendor = async (vendor) => {
    if (!vendor?.id) return;
    const confirmText = window.prompt(
      `Type DELETE to permanently delete vendor ${
        vendor.company_name || vendor.email
      }. This is destructive.`
    );
    if (confirmText !== 'DELETE') return;

    setVendorDeletingId(vendor.id);
    try {
      await superAdminServerApi.vendors.delete(vendor.id);
      toast({
        title: 'Vendor deleted',
        description: vendor.company_name || vendor.email || vendor.id,
      });
      await fetchVendors();
      await fetchFinance();
      await fetchAuditLogs();
    } catch (error) {
      handleError(error, 'Failed to delete vendor');
    } finally {
      setVendorDeletingId(null);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!passwordForm.current || !passwordForm.new) {
      toast({
        title: 'Required',
        description: 'Current and new password are required.',
        variant: 'destructive',
      });
      return;
    }
    if (passwordForm.new.length < 8) {
      toast({
        title: 'Weak password',
        description: 'New password must be at least 8 characters.',
        variant: 'destructive',
      });
      return;
    }
    if (passwordForm.new !== passwordForm.confirm) {
      toast({
        title: 'Mismatch',
        description: 'New password and confirm password must match.',
        variant: 'destructive',
      });
      return;
    }

    setPasswordSaving(true);
    try {
      const ok = await changePassword(passwordForm.current, passwordForm.new);
      if (ok) {
        setPasswordForm({ current: '', new: '', confirm: '' });
        await fetchAuditLogs();
      }
    } finally {
      setPasswordSaving(false);
    }
  };

  if (!superAdmin) return null;

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-200">
      <header className="bg-black border-b border-neutral-800 px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-8 w-8 text-red-600" />
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">GOD MODE</h1>
            <p className="text-xs text-neutral-500 font-mono">Super Admin Console</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right hidden md:block">
            <p className="text-sm font-medium text-white">
              {superAdmin?.name || superAdmin?.full_name || 'Super Admin'}
            </p>
            <p className="text-xs text-neutral-500">{superAdmin?.email}</p>
          </div>
          <Button
            variant="outline"
            className="border-red-900 text-red-500 hover:bg-red-950 hover:text-red-400"
            onClick={logout}
          >
            <LogOut className="h-4 w-4 mr-2" /> Disconnect
          </Button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        <Tabs defaultValue="system" className="space-y-6">
          <TabsList className="bg-neutral-800 border border-neutral-700 p-1 flex flex-wrap">
            <TabsTrigger value="system" className="data-[state=active]:bg-neutral-700">
              <Wrench className="h-4 w-4 mr-2" /> System
            </TabsTrigger>
            <TabsTrigger value="employees" className="data-[state=active]:bg-neutral-700">
              <Users className="h-4 w-4 mr-2" /> Employees
            </TabsTrigger>
            <TabsTrigger value="vendors" className="data-[state=active]:bg-neutral-700">
              <Building2 className="h-4 w-4 mr-2" /> Vendors
            </TabsTrigger>
            <TabsTrigger value="finance" className="data-[state=active]:bg-neutral-700">
              <IndianRupee className="h-4 w-4 mr-2" /> Finance
            </TabsTrigger>
            <TabsTrigger value="audit" className="data-[state=active]:bg-neutral-700">
              <History className="h-4 w-4 mr-2" /> Audit Logs
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-neutral-700">
              <Settings className="h-4 w-4 mr-2" /> Security
            </TabsTrigger>
          </TabsList>

          <TabsContent value="system" className="space-y-4">
            <Card className="bg-neutral-900 border-neutral-800">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-white">Maintenance Mode</CardTitle>
                  <CardDescription className="text-neutral-400">
                    Enable full maintenance and set the message users see.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={fetchSystemConfig}
                  className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                >
                  <RefreshCw className={`h-4 w-4 ${systemLoading ? 'animate-spin' : ''}`} />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-neutral-300">Maintenance Mode</Label>
                  <Switch
                    checked={systemConfig.maintenance_mode === true}
                    onCheckedChange={(checked) =>
                      setSystemConfig((prev) => ({ ...prev, maintenance_mode: checked }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-neutral-300">Maintenance Message</Label>
                  <Textarea
                    value={systemConfig.maintenance_message || ''}
                    onChange={(e) =>
                      setSystemConfig((prev) => ({
                        ...prev,
                        maintenance_message: e.target.value,
                      }))
                    }
                    className="bg-neutral-800 border-neutral-700 text-neutral-200 min-h-[96px]"
                    placeholder="Example: We are upgrading servers. Please check back soon."
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={saveSystemConfig} disabled={systemSaving} className="bg-blue-600 hover:bg-blue-700">
                    {systemSaving ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-neutral-900 border-neutral-800">
              <CardHeader>
                <CardTitle className="text-white">Public Notice Banner</CardTitle>
                <CardDescription className="text-neutral-400">
                  Show any custom message across the website without full maintenance.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-neutral-300">Enable Public Notice</Label>
                  <Switch
                    checked={systemConfig.public_notice_enabled === true}
                    onCheckedChange={(checked) =>
                      setSystemConfig((prev) => ({ ...prev, public_notice_enabled: checked }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-neutral-300">Notice Variant</Label>
                  <Select
                    value={systemConfig.public_notice_variant || 'info'}
                    onValueChange={(value) =>
                      setSystemConfig((prev) => ({ ...prev, public_notice_variant: value }))
                    }
                  >
                    <SelectTrigger className="bg-neutral-800 border-neutral-700 text-white">
                      <SelectValue placeholder="Variant" />
                    </SelectTrigger>
                    <SelectContent className="bg-neutral-800 border-neutral-700 text-white">
                      {NOTICE_VARIANTS.map((variant) => (
                        <SelectItem key={variant} value={variant} className="capitalize">
                          {variant}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-neutral-300">Notice Message</Label>
                  <Textarea
                    value={systemConfig.public_notice_message || ''}
                    onChange={(e) =>
                      setSystemConfig((prev) => ({
                        ...prev,
                        public_notice_message: e.target.value,
                      }))
                    }
                    className="bg-neutral-800 border-neutral-700 text-neutral-200 min-h-[96px]"
                    placeholder="Example: Prices will update tonight at 11:00 PM IST."
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={saveSystemConfig} disabled={systemSaving} className="bg-amber-600 hover:bg-amber-700">
                    {systemSaving ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-neutral-900 border-neutral-800">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-white">Page Controls</CardTitle>
                  <CardDescription className="text-neutral-400">
                    Disable individual routes and customize their downtime message.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={fetchPages}
                  className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                >
                  <RefreshCw className={`h-4 w-4 ${pagesLoading ? 'animate-spin' : ''}`} />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {pagesLoading ? (
                  <div className="text-center py-8">
                    <RefreshCw className="animate-spin h-8 w-8 mx-auto text-neutral-600" />
                  </div>
                ) : (
                  <div className="rounded-md border border-neutral-800 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-neutral-800">
                        <TableRow>
                          <TableHead className="text-neutral-300">Page</TableHead>
                          <TableHead className="text-neutral-300">Route</TableHead>
                          <TableHead className="text-neutral-300">Status</TableHead>
                          <TableHead className="text-neutral-300">Message</TableHead>
                          <TableHead className="text-right text-neutral-300">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(pages || []).map((page) => {
                          const busy = pageBusyId === page.id;
                          const isOnline = page.is_blanked !== true;
                          return (
                            <TableRow key={page.id} className="hover:bg-neutral-800/50">
                              <TableCell className="text-white font-medium">
                                {page.page_name}
                              </TableCell>
                              <TableCell className="text-neutral-400 text-xs font-mono">
                                {page.page_route}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={isOnline ? 'default' : 'destructive'}
                                  className={isOnline ? 'bg-green-600' : ''}
                                >
                                  {isOnline ? 'ONLINE' : 'OFFLINE'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={page.error_message || ''}
                                  onChange={(e) =>
                                    handlePageMessageChange(page.id, e.target.value)
                                  }
                                  onBlur={(e) =>
                                    updatePageStatus(page.id, {
                                      error_message: e.target.value,
                                      is_blanked: page.is_blanked === true,
                                    })
                                  }
                                  className="bg-neutral-800 border-neutral-700 text-neutral-200 h-9"
                                  disabled={busy}
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Switch
                                    checked={isOnline}
                                    disabled={busy}
                                    onCheckedChange={(nextOnline) =>
                                      updatePageStatus(page.id, {
                                        is_blanked: !nextOnline,
                                        error_message: page.error_message || '',
                                      })
                                    }
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-red-500 hover:text-red-400 hover:bg-red-900/20"
                                    onClick={() => deletePageStatus(page)}
                                    disabled={busy}
                                  >
                                    {busy ? (
                                      <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-neutral-800">
                  <div className="space-y-1">
                    <Label className="text-neutral-300">Page Name</Label>
                    <Input
                      value={newPage.page_name}
                      onChange={(e) =>
                        setNewPage((prev) => ({ ...prev, page_name: e.target.value }))
                      }
                      className="bg-neutral-800 border-neutral-700 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-neutral-300">Page Route</Label>
                    <Input
                      value={newPage.page_route}
                      onChange={(e) =>
                        setNewPage((prev) => ({ ...prev, page_route: e.target.value }))
                      }
                      className="bg-neutral-800 border-neutral-700 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-neutral-300">Offline Message</Label>
                    <Input
                      value={newPage.error_message}
                      onChange={(e) =>
                        setNewPage((prev) => ({ ...prev, error_message: e.target.value }))
                      }
                      className="bg-neutral-800 border-neutral-700 text-white"
                    />
                  </div>
                  <div className="md:col-span-3 flex justify-end">
                    <Button
                      onClick={createPageStatus}
                      disabled={newPageSaving}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {newPageSaving ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 mr-2" />
                      )}
                      Add Page Control
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="employees" className="space-y-4">
            <Card className="bg-neutral-900 border-neutral-800">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-white">Employee Management</CardTitle>
                  <CardDescription className="text-neutral-400">
                    Create employees and remove any employee account.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={fetchEmployees}
                    className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                  >
                    <RefreshCw className={`h-4 w-4 ${employeesLoading ? 'animate-spin' : ''}`} />
                  </Button>
                  <Button
                    onClick={() => setEmployeeModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4 mr-2" /> Create Employee
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  placeholder="Search employees by name, email, role..."
                  className="bg-neutral-800 border-neutral-700 text-white"
                />

                <div className="rounded-md border border-neutral-800 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-neutral-800">
                      <TableRow>
                        <TableHead className="text-neutral-300">Employee</TableHead>
                        <TableHead className="text-neutral-300">Role</TableHead>
                        <TableHead className="text-neutral-300">Department</TableHead>
                        <TableHead className="text-neutral-300">Status</TableHead>
                        <TableHead className="text-neutral-300">Created</TableHead>
                        <TableHead className="text-right text-neutral-300">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEmployees.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-neutral-500 py-10">
                            {employeesLoading ? 'Loading employees...' : 'No employees found'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredEmployees.map((emp) => {
                          const busy = employeeDeletingId === emp.id;
                          const isActive = String(emp.status || '').toUpperCase() === 'ACTIVE';
                          return (
                            <TableRow key={emp.id} className="hover:bg-neutral-800/50">
                              <TableCell>
                                <div className="font-medium text-white">
                                  {emp.full_name || 'Unnamed'}
                                </div>
                                <div className="text-xs text-neutral-500">{emp.email}</div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className="text-blue-400 border-blue-900 bg-blue-900/20"
                                >
                                  {emp.role}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-neutral-300">
                                {getDepartmentLabel(emp)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={isActive ? 'default' : 'destructive'}
                                  className={isActive ? 'bg-green-600' : ''}
                                >
                                  {isActive ? 'ACTIVE' : String(emp.status || 'INACTIVE').toUpperCase()}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-neutral-400 text-xs">
                                {formatDateTime(emp.created_at)}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-amber-400 hover:text-amber-300 hover:bg-amber-900/20"
                                    onClick={() => resetEmployeePassword(emp)}
                                    disabled={busy}
                                  >
                                    <KeyRound className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-900/20"
                                    onClick={() => deleteEmployee(emp)}
                                    disabled={busy}
                                  >
                                    {busy ? (
                                      <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vendors" className="space-y-4">
            <Card className="bg-neutral-900 border-neutral-800">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-white">Vendor Deletion</CardTitle>
                  <CardDescription className="text-neutral-400">
                    Permanently delete vendor accounts and related data.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={fetchVendors}
                  className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                >
                  <RefreshCw className={`h-4 w-4 ${vendorsLoading ? 'animate-spin' : ''}`} />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  value={vendorSearch}
                  onChange={(e) => setVendorSearch(e.target.value)}
                  placeholder="Search vendors by company, owner, email, vendor ID..."
                  className="bg-neutral-800 border-neutral-700 text-white"
                />

                <div className="rounded-md border border-neutral-800 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-neutral-800">
                      <TableRow>
                        <TableHead className="text-neutral-300">Vendor</TableHead>
                        <TableHead className="text-neutral-300">KYC</TableHead>
                        <TableHead className="text-neutral-300">Active</TableHead>
                        <TableHead className="text-neutral-300">Location</TableHead>
                        <TableHead className="text-neutral-300">Created</TableHead>
                        <TableHead className="text-right text-neutral-300">Delete</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVendors.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-neutral-500 py-10">
                            {vendorsLoading ? 'Loading vendors...' : 'No vendors found'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredVendors.map((vendor) => {
                          const busy = vendorDeletingId === vendor.id;
                          const kyc = String(vendor.kyc_status || 'PENDING').toUpperCase();
                          const active = vendor.is_active !== false;
                          return (
                            <TableRow key={vendor.id} className="hover:bg-neutral-800/50">
                              <TableCell>
                                <div className="font-medium text-white">
                                  {vendor.company_name || 'Unnamed vendor'}
                                </div>
                                <div className="text-xs text-neutral-500">
                                  {vendor.email || vendor.vendor_id || vendor.id}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={
                                    kyc === 'APPROVED'
                                      ? 'text-green-400 border-green-900 bg-green-900/20'
                                      : kyc === 'REJECTED'
                                      ? 'text-red-400 border-red-900 bg-red-900/20'
                                      : 'text-amber-400 border-amber-900 bg-amber-900/20'
                                  }
                                >
                                  {kyc}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={active ? 'default' : 'destructive'}
                                  className={active ? 'bg-green-600' : ''}
                                >
                                  {active ? 'ACTIVE' : 'INACTIVE'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-neutral-300 text-sm">
                                {[vendor.city, vendor.state].filter(Boolean).join(', ') || '—'}
                              </TableCell>
                              <TableCell className="text-neutral-400 text-xs">
                                {formatDateTime(vendor.created_at)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="bg-red-700 hover:bg-red-600"
                                  onClick={() => deleteVendor(vendor)}
                                  disabled={busy}
                                >
                                  {busy ? (
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="finance" className="space-y-4">
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={fetchFinance}
                className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${financeLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { title: 'Total Gross', value: financeSummary.totalGross },
                { title: 'Total Net', value: financeSummary.totalNet },
                { title: 'Last 30 Days', value: financeSummary.last30 },
              ].map((card) => (
                <Card key={card.title} className="bg-neutral-900 border-neutral-800">
                  <CardHeader>
                    <CardTitle className="text-neutral-300 text-sm">{card.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-3xl font-semibold flex items-center gap-2 text-white">
                    <IndianRupee className="h-5 w-5 text-emerald-500" />
                    {money(card.value)}
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="bg-neutral-900 border-neutral-800">
              <CardHeader>
                <CardTitle className="text-white">Recent Payments</CardTitle>
                <CardDescription className="text-neutral-400">
                  Vendor payments and subscriptions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border border-neutral-800 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-neutral-800">
                      <TableRow>
                        <TableHead className="text-neutral-300">Vendor</TableHead>
                        <TableHead className="text-neutral-300">Plan</TableHead>
                        <TableHead className="text-neutral-300">Gross</TableHead>
                        <TableHead className="text-neutral-300">Net</TableHead>
                        <TableHead className="text-neutral-300">Coupon</TableHead>
                        <TableHead className="text-neutral-300">Date</TableHead>
                        <TableHead className="text-neutral-300">Transaction</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {financePayments.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-neutral-500 py-10">
                            {financeLoading ? 'Loading payments...' : 'No payments found'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        financePayments.slice(0, 200).map((p) => (
                          <TableRow key={p.id} className="hover:bg-neutral-800/50">
                            <TableCell>
                              <div className="text-white font-medium">
                                {p.vendor?.company_name || p.vendor_id}
                              </div>
                              <div className="text-xs text-neutral-500">
                                {p.vendor?.email || ''}
                              </div>
                            </TableCell>
                            <TableCell className="text-neutral-300">
                              {p.plan?.name || p.plan_id || '—'}
                            </TableCell>
                            <TableCell className="text-neutral-300">₹{money(p.amount)}</TableCell>
                            <TableCell className="text-neutral-300">
                              ₹{money(p.net_amount ?? p.amount)}
                            </TableCell>
                            <TableCell className="text-neutral-300">{p.coupon_code || '—'}</TableCell>
                            <TableCell className="text-neutral-400 text-xs">
                              {formatDateTime(p.payment_date)}
                            </TableCell>
                            <TableCell className="text-neutral-400 text-xs font-mono">
                              {p.transaction_id || '—'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="space-y-4">
            <Card className="bg-neutral-900 border-neutral-800">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-white">Full Audit Log</CardTitle>
                  <CardDescription className="text-neutral-400">
                    Track which admin, employee, or vendor performed each action.
                  </CardDescription>
                </div>
                <Button
                  onClick={() => fetchAuditLogs()}
                  variant="outline"
                  className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                >
                  <RefreshCw className={`h-4 w-4 ${auditLoading ? 'animate-spin' : ''}`} />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-neutral-300">Hours Back</Label>
                    <Input
                      type="number"
                      value={auditFilters.hoursBack}
                      onChange={(e) =>
                        setAuditFilters((prev) => ({
                          ...prev,
                          hoursBack: Number(e.target.value) || 24,
                        }))
                      }
                      className="bg-neutral-800 border-neutral-700 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-neutral-300">Limit</Label>
                    <Input
                      type="number"
                      value={auditFilters.limit}
                      onChange={(e) =>
                        setAuditFilters((prev) => ({
                          ...prev,
                          limit: Number(e.target.value) || 100,
                        }))
                      }
                      className="bg-neutral-800 border-neutral-700 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-neutral-300">Actor Type</Label>
                    <Select
                      value={auditFilters.actor_type}
                      onValueChange={(value) =>
                        setAuditFilters((prev) => ({ ...prev, actor_type: value }))
                      }
                    >
                      <SelectTrigger className="bg-neutral-800 border-neutral-700 text-white">
                        <SelectValue placeholder="Actor" />
                      </SelectTrigger>
                      <SelectContent className="bg-neutral-800 border-neutral-700 text-white">
                        <SelectItem value="ALL">All</SelectItem>
                        <SelectItem value="SUPERADMIN">Superadmin</SelectItem>
                        <SelectItem value="EMPLOYEE">Employee</SelectItem>
                        <SelectItem value="VENDOR">Vendor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-neutral-300">Action Contains</Label>
                    <Input
                      value={auditFilters.action_contains}
                      onChange={(e) =>
                        setAuditFilters((prev) => ({
                          ...prev,
                          action_contains: e.target.value,
                        }))
                      }
                      className="bg-neutral-800 border-neutral-700 text-white"
                      placeholder="Example: STAFF, PAYMENT, VENDOR"
                    />
                  </div>
                  <div className="md:col-span-4 flex justify-end">
                    <Button
                      onClick={() => fetchAuditLogs(auditFilters)}
                      className="bg-amber-600 hover:bg-amber-700"
                      disabled={auditLoading}
                    >
                      {auditLoading ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <History className="h-4 w-4 mr-2" />
                      )}
                      Apply Filters
                    </Button>
                  </div>
                </div>

                <div className="rounded-md border border-neutral-800 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-neutral-800">
                      <TableRow>
                        <TableHead className="text-neutral-300">When</TableHead>
                        <TableHead className="text-neutral-300">Actor</TableHead>
                        <TableHead className="text-neutral-300">Action</TableHead>
                        <TableHead className="text-neutral-300">Entity</TableHead>
                        <TableHead className="text-neutral-300">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-neutral-500 py-10">
                            {auditLoading ? 'Loading audit logs...' : 'No audit logs found'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        auditLogs.map((log) => (
                          <TableRow key={log.id} className="hover:bg-neutral-800/50 align-top">
                            <TableCell className="text-neutral-400 text-xs whitespace-nowrap">
                              {formatDateTime(log.created_at)}
                            </TableCell>
                            <TableCell>
                              <div className="text-white text-sm">
                                {log.actor?.email || log.actor?.id || 'System'}
                              </div>
                              <div className="text-xs text-neutral-500">
                                {log.actor?.type || '—'}{' '}
                                {log.actor?.role ? `• ${log.actor.role}` : ''}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className="text-amber-400 border-amber-900 bg-amber-900/20 font-mono text-xs"
                              >
                                {log.action}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-neutral-300 text-xs font-mono">
                              {log.entity_type}
                              {log.entity_id ? `#${String(log.entity_id).slice(0, 8)}` : ''}
                            </TableCell>
                            <TableCell className="text-neutral-500 text-xs max-w-[360px]">
                              {log.details ? JSON.stringify(log.details).slice(0, 180) : '—'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <Card className="bg-neutral-900 border-neutral-800 max-w-xl">
              <CardHeader>
                <CardTitle className="text-white">Super Admin Credentials</CardTitle>
                <CardDescription className="text-neutral-400">
                  Update your master password. This requires the current password.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-neutral-300">Current Password</Label>
                    <Input
                      type="password"
                      value={passwordForm.current}
                      onChange={(e) =>
                        setPasswordForm((prev) => ({ ...prev, current: e.target.value }))
                      }
                      className="bg-neutral-800 border-neutral-700 text-white"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-neutral-300">New Password</Label>
                    <Input
                      type="password"
                      value={passwordForm.new}
                      onChange={(e) =>
                        setPasswordForm((prev) => ({ ...prev, new: e.target.value }))
                      }
                      className="bg-neutral-800 border-neutral-700 text-white"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-neutral-300">Confirm New Password</Label>
                    <Input
                      type="password"
                      value={passwordForm.confirm}
                      onChange={(e) =>
                        setPasswordForm((prev) => ({ ...prev, confirm: e.target.value }))
                      }
                      className="bg-neutral-800 border-neutral-700 text-white"
                      required
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      className="bg-red-800 hover:bg-red-700 text-white"
                      disabled={passwordSaving}
                    >
                      {passwordSaving ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Update Password
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={employeeModalOpen} onOpenChange={setEmployeeModalOpen}>
        <DialogContent className="bg-neutral-900 border-neutral-800 text-white">
          <DialogHeader>
            <DialogTitle>Create Employee</DialogTitle>
            <DialogDescription className="text-neutral-400">
              This creates a Supabase auth user and an employees table record.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitEmployee} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-neutral-300">Full Name</Label>
              <Input
                value={employeeForm.full_name}
                onChange={(e) =>
                  setEmployeeForm((prev) => ({ ...prev, full_name: e.target.value }))
                }
                className="bg-neutral-800 border-neutral-700"
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-neutral-300">Email</Label>
                <Input
                  type="email"
                  value={employeeForm.email}
                  onChange={(e) =>
                    setEmployeeForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className="bg-neutral-800 border-neutral-700"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-neutral-300">Phone</Label>
                <Input
                  value={employeeForm.phone}
                  onChange={(e) =>
                    setEmployeeForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  className="bg-neutral-800 border-neutral-700"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-neutral-300">Temporary Password</Label>
              <Input
                type="password"
                value={employeeForm.password}
                onChange={(e) =>
                  setEmployeeForm((prev) => ({ ...prev, password: e.target.value }))
                }
                className="bg-neutral-800 border-neutral-700"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-neutral-300">Role</Label>
                <Select
                  value={employeeForm.role}
                  onValueChange={(value) =>
                    setEmployeeForm((prev) => ({ ...prev, role: value }))
                  }
                >
                  <SelectTrigger className="bg-neutral-800 border-neutral-700 text-white">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent className="bg-neutral-800 border-neutral-700 text-white">
                    {EMPLOYEE_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-neutral-300">Department</Label>
                <Input
                  value={employeeForm.department}
                  onChange={(e) =>
                    setEmployeeForm((prev) => ({ ...prev, department: e.target.value }))
                  }
                  className="bg-neutral-800 border-neutral-700"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="border-neutral-700 text-neutral-300"
                onClick={() => setEmployeeModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={employeeSaving}>
                {employeeSaving ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Create Employee
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
