import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

import {
  Building2,
  Eye,
  Filter,
  Loader2,
  Mail,
  Phone,
  Package,
  Search,
  UserX,
  ShieldCheck,
  Check,
} from "lucide-react";
import { fetchWithCsrf } from "@/lib/fetchWithCsrf";

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
  throw new Error(
    `API returned non-JSON (${res.status}). Got: ${text.slice(0, 80)}...`
  );
}

const norm = (v) => String(v || "").toUpperCase();

const kycBadgeClass = (s) => {
  const v = norm(s || "PENDING");
  const map = {
    APPROVED: "bg-green-100 text-green-800",
    VERIFIED: "bg-green-100 text-green-800",
    SUBMITTED: "bg-yellow-100 text-yellow-800",
    PENDING: "bg-gray-100 text-gray-800",
    REJECTED: "bg-red-100 text-red-800",
  };
  return map[v] || "bg-gray-100 text-gray-800";
};

export default function Vendors() {
  const { toast } = useToast();
  const ADMIN_API_BASE = getAdminBase();

  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterKyc, setFilterKyc] = useState("all");
  const [filterActive, setFilterActive] = useState("all");

  const [selectedVendor, setSelectedVendor] = useState(null);
  const [showVendorModal, setShowVendorModal] = useState(false);

  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [terminationReason, setTerminationReason] = useState("");
  const [processing, setProcessing] = useState(false);

  const isTerminationReasonValid = useMemo(
    () => terminationReason.trim().length > 0,
    [terminationReason]
  );

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchWithCsrf(`${ADMIN_API_BASE}/vendors`);
      const data = await safeReadJson(res);
      if (!data?.success) throw new Error(data?.error || "Failed");

      let list = data.vendors || [];

      if (filterKyc !== "all") {
        const map = {
          pending: "PENDING",
          submitted: "SUBMITTED",
          approved: "APPROVED",
          rejected: "REJECTED",
        };
        const want = map[filterKyc] || filterKyc.toUpperCase();
        list = list.filter((v) => norm(v.kyc_status) === want);
      }

      if (filterActive !== "all") {
        const want = filterActive === "active";
        list = list.filter((v) => (v.is_active !== false) === want);
      }

      const t = searchTerm.trim().toLowerCase();
      if (t) {
        list = list.filter(
          (v) =>
            v.company_name?.toLowerCase().includes(t) ||
            v.owner_name?.toLowerCase().includes(t) ||
            v.vendor_id?.toLowerCase().includes(t) ||
            v.email?.toLowerCase().includes(t)
        );
      }

      setVendors(list);
    } catch (e) {
      console.error(e);
      toast({
        title: "Error",
        description: e.message || "Failed to load vendors",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKyc, filterActive]);

  const total = useMemo(() => vendors.length, [vendors]);

  const onSearch = (e) => {
    e.preventDefault();
    load();
  };

  const openVendor = (v) => {
    setSelectedVendor(v);
    setShowVendorModal(true);
  };

  const openTerminate = (v) => {
    setSelectedVendor(v);
    setTerminationReason("");
    setShowTerminateModal(true);
  };

  const doTerminate = async () => {
    if (!selectedVendor?.id) return;

    const reason = terminationReason.trim();
    if (!reason) {
      toast({
        title: "Reason required",
        description: "Please type a reason to terminate this vendor.",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      const res = await fetchWithCsrf(
        `${ADMIN_API_BASE}/vendors/${selectedVendor.id}/terminate`,
        {
          method: "POST",
          body: JSON.stringify({ reason }),
        }
      );
      const data = await safeReadJson(res);
      if (!data?.success) throw new Error(data?.error || "Terminate failed");
      toast({ title: "Success", description: "Vendor terminated" });
      setShowTerminateModal(false);
      setTerminationReason("");
      await load();
    } catch (e) {
      console.error(e);
      toast({
        title: "Error",
        description: e.message || "Terminate failed",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const doActivate = async (vendorId) => {
    setProcessing(true);
    try {
      const res = await fetchWithCsrf(`${ADMIN_API_BASE}/vendors/${vendorId}/activate`, {
        method: "POST",
      });
      const data = await safeReadJson(res);
      if (!data?.success) throw new Error(data?.error || "Activate failed");
      toast({ title: "Success", description: "Vendor activated" });
      await load();
    } catch (e) {
      console.error(e);
      toast({
        title: "Error",
        description: e.message || "Activate failed",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    // ✅ full-height layout: top fixed + only table scrolls
    <div className="h-full min-h-0 flex flex-col gap-3 w-full max-w-full overflow-hidden">
      {/* TOP (fixed) */}
      <div className="shrink-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h1 className="text-lg font-bold text-neutral-800">Vendor Management</h1>
            <p className="text-gray-500 text-sm">
              Vendor details, package, products and termination
            </p>
          </div>
          <Badge variant="outline" className="text-sm">
            {total} Total Vendors
          </Badge>
        </div>

        <div className="mt-2 flex flex-col md:flex-row gap-2 p-2 bg-white rounded-lg border w-full max-w-full">
          <form onSubmit={onSearch} className="flex-1 relative min-w-0">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              className="pl-9 h-9"
              placeholder="Search by company, owner, vendor id or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </form>

          <Select value={filterKyc} onValueChange={setFilterKyc}>
            <SelectTrigger className="w-full md:w-[180px] h-9">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="KYC Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All KYC</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterActive} onValueChange={setFilterActive}>
            <SelectTrigger className="w-full md:w-[180px] h-9">
              <ShieldCheck className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Vendor Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vendors</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Terminated</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* TABLE AREA (only this scrolls) */}
      <div className="flex-1 min-h-0 w-full max-w-full overflow-hidden">
        <Card className="h-full w-full max-w-full">
          <CardContent className="h-full p-0 w-full max-w-full">
            <div className="h-full overflow-y-auto overflow-x-hidden">
              <Table className="w-full table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[22%] px-2">Company</TableHead>
                    <TableHead className="w-[20%] px-2">Owner / Contact</TableHead>
                    <TableHead className="w-[10%] px-2">KYC</TableHead>
                    <TableHead className="w-[12%] px-2">Package</TableHead>
                    <TableHead className="w-[8%] px-2">Products</TableHead>
                    <TableHead className="w-[10%] px-2">Joined</TableHead>
                    <TableHead className="w-[8%] px-2">Status</TableHead>
                    <TableHead className="w-[10%] px-2 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-7">
                        <Loader2 className="animate-spin mx-auto h-6 w-6 text-gray-400" />
                      </TableCell>
                    </TableRow>
                  ) : vendors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-7 text-gray-500">
                        <Building2 className="h-12 w-12 mx-auto mb-2 opacity-30" />
                        No vendors found
                      </TableCell>
                    </TableRow>
                  ) : (
                    vendors.map((v) => {
                      const active = v.is_active !== false;
                      const planName = v.package?.plan_name || "FREE";
                      const planPrice = Number(v.package?.price || 0);

                      return (
                        <TableRow key={v.id} className="hover:bg-gray-50">
                          <TableCell className="px-2 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                                <Building2 className="h-4 w-4 text-blue-600" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium truncate">{v.company_name || "—"}</p>
                                <p className="text-xs text-gray-500 truncate">{v.vendor_id || "Business"}</p>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="px-2 py-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{v.owner_name || "—"}</div>
                              <div className="text-xs text-gray-500 flex items-center gap-1 min-w-0">
                                <Mail className="h-3 w-3 shrink-0" />
                                <span className="truncate min-w-0">{v.email || "—"}</span>
                              </div>
                              {v.phone ? (
                                <div className="text-xs text-gray-500 flex items-center gap-1 min-w-0">
                                  <Phone className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{v.phone}</span>
                                </div>
                              ) : null}
                            </div>
                          </TableCell>

                          <TableCell className="px-2 py-2">
                            <Badge className={`${kycBadgeClass(v.kyc_status)} text-xs`}>
                              {norm(v.kyc_status || "PENDING")}
                            </Badge>
                          </TableCell>

                          <TableCell className="px-2 py-2">
                            <div className="space-y-0.5">
                              <Badge variant="outline" className="font-medium text-xs">
                                {planName}
                              </Badge>
                              {planPrice ? (
                                <div className="text-[11px] text-gray-500 truncate">₹{planPrice}</div>
                              ) : null}
                            </div>
                          </TableCell>

                          <TableCell className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 text-gray-400 shrink-0" />
                              <span className="text-sm font-medium text-gray-700">
                                {v.product_count || 0}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell className="px-2 py-2 text-sm text-gray-500">
                            {v.created_at ? new Date(v.created_at).toLocaleDateString("en-GB") : "—"}
                          </TableCell>

                          <TableCell className="px-2 py-2">
                            <Badge
                              className={
                                active
                                  ? "bg-emerald-100 text-emerald-800 text-xs"
                                  : "bg-red-100 text-red-800 text-xs"
                              }
                            >
                              {active ? "ACTIVE" : "TERMINATED"}
                            </Badge>
                          </TableCell>

                          <TableCell className="px-2 py-2 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => openVendor(v)}
                                title="View"
                                aria-label="View vendor"
                                className="h-9 w-9"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>

                              <Link to={`/admin/vendors/${v.id}/products`} className="inline-flex">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  title="Products"
                                  aria-label="Vendor products"
                                  className="h-9 w-9"
                                >
                                  <Package className="h-4 w-4" />
                                </Button>
                              </Link>

                              {active ? (
                                <Button
                                  size="icon"
                                  variant="destructive"
                                  onClick={() => openTerminate(v)}
                                  disabled={processing}
                                  title="Terminate"
                                  aria-label="Terminate vendor"
                                  className="h-9 w-9"
                                >
                                  <UserX className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button
                                  size="icon"
                                  className="bg-emerald-600 hover:bg-emerald-700 h-9 w-9"
                                  onClick={() => doActivate(v.id)}
                                  disabled={processing}
                                  title="Activate"
                                  aria-label="Activate vendor"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                              )}
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
      </div>

      {/* Vendor Details Modal */}
      <Dialog open={showVendorModal} onOpenChange={setShowVendorModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vendor Details</DialogTitle>
            <DialogDescription>Package and status details</DialogDescription>
          </DialogHeader>

          {selectedVendor ? (
            <div className="space-y-3 text-sm">
              <div className="font-semibold">{selectedVendor.company_name}</div>
              <div>
                Owner: <span className="font-medium">{selectedVendor.owner_name || "—"}</span>
              </div>
              <div>
                Email: <span className="font-medium">{selectedVendor.email || "—"}</span>
              </div>
              <div>
                Phone: <span className="font-medium">{selectedVendor.phone || "—"}</span>
              </div>
              <div>
                Package:{" "}
                <Badge variant="outline" className="font-medium">
                  {selectedVendor.package?.plan_name || "FREE"}{" "}
                  {Number(selectedVendor.package?.price || 0)
                    ? `• ₹${selectedVendor.package?.price}`
                    : ""}
                </Badge>
              </div>
              <div>
                Status:{" "}
                <Badge
                  className={
                    selectedVendor.is_active !== false
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-red-100 text-red-800"
                  }
                >
                  {selectedVendor.is_active !== false ? "ACTIVE" : "TERMINATED"}
                </Badge>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVendorModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Terminate Modal */}
      <Dialog
        open={showTerminateModal}
        onOpenChange={(open) => {
          setShowTerminateModal(open);
          if (!open) setTerminationReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Terminate Vendor</DialogTitle>
            <DialogDescription>
              Vendor will be deactivated (is_active=false)
            </DialogDescription>
          </DialogHeader>

          <Textarea
            placeholder="Reason (required)"
            value={terminationReason}
            onChange={(e) => setTerminationReason(e.target.value)}
            rows={4}
          />
          <p className="text-xs text-gray-500">
            Please type a reason to enable <b>Terminate</b>.
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTerminateModal(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={doTerminate}
              disabled={processing || !isTerminationReasonValid}
            >
              {processing ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
              Terminate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
