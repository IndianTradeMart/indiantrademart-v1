import React, { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { Plus, Search, Trash2, Loader2, KeyRound } from "lucide-react";
import { Label } from "@/components/ui/label";
import { fetchWithCsrf } from "@/lib/fetchWithCsrf";

// ✅ Local vs Netlify API base (same pattern as Vendors.jsx)
const isLocalHost = () => {
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
};

const getAdminBase = () => {
  const override = import.meta.env.VITE_ADMIN_API_BASE;
  if (override && String(override).trim()) return String(override).trim();
  return isLocalHost() ? "/api/admin" : "/.netlify/functions/admin";
};

async function safeReadJson(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await res.json();
  const text = await res.text();
  throw new Error(`API returned non-JSON (${res.status}). Got: ${text.slice(0, 120)}...`);
}

const buildApiError = (data, fallback) => {
  if (!data) return fallback;
  const err = data?.error || fallback;
  const details = data?.details ? String(data.details) : "";
  const variant = data?.variant ? ` (variant=${data.variant})` : "";
  return details ? `${err}: ${details}${variant}` : `${err}${variant}`;
};

const isActiveStatus = (status) => {
  const s = String(status || "").trim().toUpperCase();
  return s === "ACTIVE" || s === "ACTIVATED" || s === "ENABLED";
};

const normalizeRole = (value) => String(value || "").trim().toUpperCase();

const roleToDepartment = (role) => {
  switch (normalizeRole(role)) {
    case "ADMIN":
      return "Administration";
    case "HR":
      return "Human Resources";
    case "FINANCE":
      return "Finance";
    case "SUPPORT":
      return "Support";
    case "SALES":
      return "Sales";
    case "DATA_ENTRY":
    case "DATAENTRY":
      return "Operations";
    default:
      return "";
  }
};

const getDepartmentLabel = (employee) =>
  employee?.department || employee?.dept || roleToDepartment(employee?.role) || "-";

const Staff = () => {
  const ADMIN_API_BASE = getAdminBase();

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwEmployee, setPwEmployee] = useState(null);
  const [pwForm, setPwForm] = useState({ password: "", confirm: "" });

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "DATA_ENTRY",
    department: "Operations",
    password: "",
  });

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const res = await fetchWithCsrf(`${ADMIN_API_BASE}/staff`);
      const data = await safeReadJson(res);
      if (!data?.success) throw new Error(buildApiError(data, "Failed to fetch staff"));
      setEmployees(data.employees || []);
    } catch (error) {
      toast({
        title: "Failed to load staff",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredEmployees = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    if (!t) return employees;
    return (employees || []).filter((e) =>
      [e.full_name, e.name, e.email, e.role, e.department, getDepartmentLabel(e)]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(t))
    );
  }, [employees, searchTerm]);

  const handleCreate = async () => {
    if (!formData.email || !formData.password || !formData.full_name) {
      toast({ title: "Please fill required fields", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetchWithCsrf(`${ADMIN_API_BASE}/staff`, {
        method: "POST",
        body: JSON.stringify({
          full_name: formData.full_name,
          email: formData.email,
          phone: formData.phone,
          role: formData.role,
          department: formData.department,
          password: formData.password,
        }),
      });

      const data = await safeReadJson(res);
      if (!data?.success) throw new Error(buildApiError(data, "Failed to create employee"));

      toast({
        title: "Employee created successfully",
        description: data?.variant ? `Saved using schema: ${data.variant}` : undefined,
      });

      setIsDialogOpen(false);
      setFormData({
        full_name: "",
        email: "",
        phone: "",
        role: "DATA_ENTRY",
        department: "Operations",
        password: "",
      });
      await loadEmployees();
    } catch (error) {
      toast({
        title: "Error creating employee",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this employee? This cannot be undone.")) return;
    try {
      const res = await fetchWithCsrf(`${ADMIN_API_BASE}/staff/${id}`, { method: "DELETE" });
      const data = await safeReadJson(res);
      if (!data?.success) throw new Error(buildApiError(data, "Delete failed"));
      setEmployees((prev) => (prev || []).filter((e) => e.id !== id));
      toast({ title: "Employee removed" });
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    }
  };

  const openChangePassword = (employee) => {
    setPwEmployee(employee);
    setPwForm({ password: "", confirm: "" });
    setPwDialogOpen(true);
  };

  const handleChangePassword = async () => {
    if (!pwEmployee?.id) return;
    if (!pwForm.password || pwForm.password.length < 6) {
      toast({
        title: "Invalid password",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }
    if (pwForm.password !== pwForm.confirm) {
      toast({
        title: "Passwords do not match",
        description: "Please confirm the same password",
        variant: "destructive",
      });
      return;
    }

    setPwSaving(true);
    try {
      const res = await fetchWithCsrf(`${ADMIN_API_BASE}/staff/${pwEmployee.id}/password`, {
        method: "PUT",
        body: JSON.stringify({ password: pwForm.password }),
      });

      const data = await safeReadJson(res);
      if (!data?.success) throw new Error(buildApiError(data, "Failed to update password"));

      toast({
        title: "Password updated",
        description: `${pwEmployee.full_name || pwEmployee.name || "Employee"} can login with the new password now.`,
      });
      setPwDialogOpen(false);
    } catch (error) {
      toast({
        title: "Password update failed",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff Management</h1>
          <p className="text-muted-foreground">Manage employees and their access roles.</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#003D82]">
              <Plus className="mr-2 h-4 w-4" /> Add Employee
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Employee</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+91..."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john@company.com"
                />
              </div>

              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="********"
                />
                <p className="text-xs text-muted-foreground">Min 6 characters</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DATA_ENTRY">Data Entry</SelectItem>
                      <SelectItem value="FINANCE">Finance</SelectItem>
                      <SelectItem value="SALES">Sales</SelectItem>
                      <SelectItem value="SUPPORT">Support</SelectItem>
                      <SelectItem value="HR">HR</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Department</Label>
                  <Select value={formData.department} onValueChange={(v) => setFormData({ ...formData, department: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Operations">Operations</SelectItem>
                      <SelectItem value="Finance">Finance</SelectItem>
                      <SelectItem value="Sales">Sales</SelectItem>
                      <SelectItem value="Customer Success">Customer Success</SelectItem>
                      <SelectItem value="IT">IT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create Account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center space-x-2 bg-white p-4 rounded-lg border">
        <Search className="h-5 w-5 text-gray-400" />
        <Input
          placeholder="Search by name, email or role..."
          className="border-0 focus-visible:ring-0"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="border rounded-lg bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name / Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filteredEmployees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24 text-gray-500">
                  No employees found
                </TableCell>
              </TableRow>
            ) : (
              filteredEmployees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{employee.full_name || employee.name}</span>
                      <span className="text-xs text-muted-foreground">{employee.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      {employee.role}
                    </Badge>
                  </TableCell>
                  <TableCell>{getDepartmentLabel(employee)}</TableCell>
                  <TableCell>
                    <Badge variant={isActiveStatus(employee.status) ? "success" : "secondary"}>
                      {employee.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {employee.created_at
                      ? new Date(employee.created_at).toLocaleDateString()
                      : employee.joined || "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-blue-700 hover:text-blue-800 hover:bg-blue-50"
                        title="Change Password"
                        onClick={() => openChangePassword(employee)}
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Delete Employee"
                        onClick={() => handleDelete(employee.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Change Password Dialog */}
      <Dialog open={pwDialogOpen} onOpenChange={setPwDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="text-sm text-muted-foreground">
              Employee: <span className="font-semibold text-slate-900">{pwEmployee?.full_name || pwEmployee?.name || "-"}</span>
              {pwEmployee?.email ? <span className="ml-2">({pwEmployee.email})</span> : null}
            </div>

            <div className="space-y-2">
              <Label>New Password</Label>
              <Input
                type="password"
                value={pwForm.password}
                onChange={(e) => setPwForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="********"
              />
              <p className="text-xs text-muted-foreground">Min 6 characters</p>
            </div>

            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <Input
                type="password"
                value={pwForm.confirm}
                onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))}
                placeholder="********"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPwDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleChangePassword} disabled={pwSaving}>
              {pwSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Update Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Staff;
