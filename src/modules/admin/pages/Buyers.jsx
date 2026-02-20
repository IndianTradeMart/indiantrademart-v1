import React, { useEffect, useMemo, useState } from "react";

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
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

import { Eye, Edit, Loader2, Search, Ban, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/customSupabaseClient";
import { fetchWithCsrf } from "@/lib/fetchWithCsrf";

/* ================= VALIDATION HELPERS ================= */
const nameRegex = /^[A-Za-z\s]+$/;
const phoneRegex = /^[6-9]\d{9}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const gstRegex = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
const pincodeRegex = /^\d{6}$/;

/* ================= ADMIN API BASE ================= */
const isLocalHost = () => {
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
};

const normalizeBaseUrl = (base) => String(base || "").trim().replace(/\/+$/, "");

const isLocalAddress = (host) =>
  host === "localhost" || host === "127.0.0.1";

const getConfiguredApiBase = () => {
  const raw = normalizeBaseUrl(import.meta.env.VITE_API_URL);
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    if (!isLocalHost() && isLocalAddress(parsed.hostname)) return "";
  } catch {
    return "";
  }

  return raw;
};

const resolveAdminBaseFromApiBase = (apiBase) => {
  const base = normalizeBaseUrl(apiBase);
  if (!base) return "";

  if (/(^|\/)\.netlify\/functions\/admin$/i.test(base)) return base;
  if (/\/api\/admin$/i.test(base)) return base;
  if (/(^|\/)\.netlify\/functions$/i.test(base)) return `${base}/admin`;
  if (/\/api$/i.test(base)) return `${base}/admin`;

  return `${base}/api/admin`;
};

const getAdminBase = () => {
  const override = import.meta.env.VITE_ADMIN_API_BASE;
  if (override && String(override).trim()) return normalizeBaseUrl(override);
  const apiBase = getConfiguredApiBase();
  if (apiBase) return resolveAdminBaseFromApiBase(apiBase);
  return normalizeBaseUrl(isLocalHost() ? "/api/admin" : "/.netlify/functions/admin");
};

/* ================= STATUS HELPERS ================= */
const isBuyerActive = (b) => {
  if (typeof b?.is_active === "boolean") return b.is_active;
  if (typeof b?.status === "string") return b.status.toUpperCase() === "ACTIVE";
  if (b?.terminated_at) return false;
  return true;
};

const getStatusLabel = (b) => (isBuyerActive(b) ? "ACTIVE" : "TERMINATED");
const getStatusBadgeVariant = () => "outline";
const getBuyerIdentifier = (b) => b?.id || b?.user_id || b?.email || null;

/* ================= RESPONSE NORMALIZER ================= */
function normalizeBuyersPayload(json) {
  // Accept many shapes:
  // { buyers: [...] } OR { data: [...] } OR { data: { buyers:[...] } } OR { success:true, buyers:[...] }
  const raw =
    json?.buyers ??
    json?.data?.buyers ??
    json?.data ??
    json?.result ??
    json;

  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.buyers)) return raw.buyers;

  return null;
}

const normalizeIdentityEmail = (value) => String(value || "").trim().toLowerCase();

async function filterRowsToBuyerRole(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const { data: buyerUsers, error } = await supabase
    .from("users")
    .select("id, email")
    .eq("role", "BUYER");

  if (error) {
    throw new Error(error.message || "Failed to validate buyer role records");
  }

  const buyerUserIds = new Set(
    (buyerUsers || []).map((u) => String(u?.id || "").trim()).filter(Boolean)
  );
  const buyerEmails = new Set(
    (buyerUsers || []).map((u) => normalizeIdentityEmail(u?.email)).filter(Boolean)
  );

  return rows.filter((row) => {
    const rowUserId = String(row?.user_id || "").trim();
    const rowEmail = normalizeIdentityEmail(row?.email);
    if (rowUserId && buyerUserIds.has(rowUserId)) return true;
    if (rowEmail && buyerEmails.has(rowEmail)) return true;
    return false;
  });
}

async function safeReadJson(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await res.json();
  const text = await res.text();
  if (!String(text || "").trim()) return {};
  throw new Error(
    `API returned non-JSON (${res.status}). Got: ${text.slice(0, 80)}...`
  );
}

export default function Buyers() {
  const { toast } = useToast();
  const ADMIN_API_BASE = getAdminBase();

  const [allBuyers, setAllBuyers] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [selectedBuyer, setSelectedBuyer] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [terminateReason, setTerminateReason] = useState("");

  const isTerminateReasonValid = useMemo(
    () => terminateReason.trim().length > 0,
    [terminateReason]
  );

  /* ================= LOAD BUYERS (SERVER-FIRST) ================= */
  const load = async () => {
    setLoading(true);
    try {
      // Try server endpoints first (bypass Supabase RLS)
      const tryUrls = [
        `${ADMIN_API_BASE}/buyers?limit=500`,
        `${ADMIN_API_BASE}/buyers/list?limit=500`,
      ];

      let list = null;
      let loadedFromServer = false;

      for (const url of tryUrls) {
        try {
          const res = await fetchWithCsrf(url);
          if (!res.ok) continue;

          const json = await res.json();
          const normalized = normalizeBuyersPayload(json);
          if (Array.isArray(normalized)) {
            list = normalized;
            loadedFromServer = true;
            break;
          }
        } catch {
          // continue
        }
      }

      // Fallback to Supabase (may be empty if RLS blocks)
      if (!Array.isArray(list)) {
        const { data, error } = await supabase
          .from("buyers")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;
        list = data || [];
      }

      // Role safety for fallback path:
      // in case server route is unavailable, ensure only BUYER role identities are rendered.
      if (!loadedFromServer) {
        list = await filterRowsToBuyerRole(list);
      }

      setAllBuyers(list);
    } catch (e) {
      toast({
        title: "Error",
        description: e.message || "Failed to load buyers",
        variant: "destructive",
      });
      setAllBuyers([]);
    } finally {
      setLoading(false);
    }
  };

  // initial load
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // client-side filter (no refetch on every keypress)
  useEffect(() => {
    const t = searchTerm.trim().toLowerCase();
    if (!t) {
      setBuyers(allBuyers);
      return;
    }
    const filtered = (allBuyers || []).filter(
      (b) =>
        b.full_name?.toLowerCase().includes(t) ||
        b.email?.toLowerCase().includes(t) ||
        b.phone?.toLowerCase().includes(t) ||
        b.company_name?.toLowerCase().includes(t)
    );
    setBuyers(filtered);
  }, [searchTerm, allBuyers]);

  const total = useMemo(() => allBuyers.length, [allBuyers]);

  /* ================= VIEW / EDIT ================= */
  const openView = (b) => {
    setSelectedBuyer({ ...b });
    setShowViewModal(true);
  };

  const openEdit = (b) => {
    setSelectedBuyer({ ...b });
    setShowEditModal(true);
  };

  /* ================= TERMINATE / ACTIVATE ================= */
  const openTerminate = (b) => {
    setSelectedBuyer({ ...b });
    setTerminateReason("");
    setShowTerminateModal(true);
  };

  const updateBuyerStatus = async (buyerId, nextActive, reasonText = "") => {
    if (!buyerId) {
      throw new Error("Buyer identifier missing");
    }
    setProcessing(true);
    try {
      const action = nextActive ? "activate" : "terminate";
      const res = await fetchWithCsrf(`${ADMIN_API_BASE}/buyers/${buyerId}/${action}`, {
        method: "POST",
        ...(nextActive ? {} : { body: JSON.stringify({ reason: reasonText }) }),
      });
      const data = await safeReadJson(res);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `${nextActive ? "Activate" : "Terminate"} failed`);
      }

      toast({
        title: "Success",
        description: nextActive
          ? "Buyer activated successfully"
          : "Buyer terminated successfully",
      });

      setShowTerminateModal(false);
      setTerminateReason("");
      await load();
    } catch (e) {
      toast({
        title: "Error",
        description: e.message || "Status update failed",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const terminateBuyer = async () => {
    const buyerId = getBuyerIdentifier(selectedBuyer);
    if (!buyerId) return;

    const reason = terminateReason.trim();
    if (!reason) {
      toast({
        title: "Reason required",
        description: "Please type a reason to terminate this buyer.",
        variant: "destructive",
      });
      return;
    }

    await updateBuyerStatus(buyerId, false, reason);
  };

  const activateBuyer = async (b) => {
    const buyerId = getBuyerIdentifier(b);
    if (!buyerId) {
      toast({
        title: "Error",
        description: "Buyer identifier missing",
        variant: "destructive",
      });
      return;
    }
    await updateBuyerStatus(buyerId, true, "");
  };

  /* ================= SAVE BUYER ================= */
  const saveBuyer = async () => {
    const b = selectedBuyer;
    const buyerId = getBuyerIdentifier(b);
    if (!buyerId) {
      return toast({
        title: "Error",
        description: "Buyer identifier missing",
        variant: "destructive",
      });
    }

    if (!b.full_name || !nameRegex.test(b.full_name)) {
      return toast({
        title: "Invalid Name",
        description: "Name should contain only letters",
        variant: "destructive",
      });
    }

    if (!emailRegex.test(b.email)) {
      return toast({
        title: "Invalid Email",
        description: "Enter valid email address",
        variant: "destructive",
      });
    }

    if (b.phone && !phoneRegex.test(b.phone)) {
      return toast({
        title: "Invalid Phone",
        description: "Enter valid 10-digit Indian mobile number",
        variant: "destructive",
      });
    }

    if (b.pan_card && !panRegex.test(b.pan_card)) {
      return toast({
        title: "Invalid PAN",
        description: "PAN format: ABCDE1234F",
        variant: "destructive",
      });
    }

    if (b.gst_number && !gstRegex.test(b.gst_number)) {
      return toast({
        title: "Invalid GST",
        description: "GST format is invalid",
        variant: "destructive",
      });
    }

    if (b.pincode && !pincodeRegex.test(b.pincode)) {
      return toast({
        title: "Invalid Pincode",
        description: "Pincode must be 6 digits",
        variant: "destructive",
      });
    }

    setProcessing(true);
    try {
      const payload = {
        full_name: b.full_name?.trim() || "",
        phone: b.phone || null,
        company_name: b.company_name || null,
        address: b.address || null,
        city: b.city || null,
        state: b.state || null,
        pincode: b.pincode || null,
        pan_card: b.pan_card || null,
        gst_number: b.gst_number || null,
      };

      const endpoints = [
        { method: "PUT", url: `${ADMIN_API_BASE}/buyers/${buyerId}` },
        { method: "PATCH", url: `${ADMIN_API_BASE}/buyers/${buyerId}` },
        { method: "POST", url: `${ADMIN_API_BASE}/buyers/${buyerId}/update` },
      ];

      let saved = false;
      let lastApiError = null;

      for (const endpoint of endpoints) {
        try {
          const res = await fetchWithCsrf(endpoint.url, {
            method: endpoint.method,
            body: JSON.stringify(payload),
          });
          const data = await safeReadJson(res);
          if (!res.ok || !data?.success) {
            throw new Error(
              data?.error || `${endpoint.method} ${endpoint.url} failed with ${res.status}`
            );
          }
          saved = true;
          break;
        } catch (err) {
          lastApiError = err;
        }
      }

      // Fallback for environments where admin backend route is unavailable.
      if (!saved) {
        let query = supabase
          .from("buyers")
          .update({
            ...payload,
            updated_at: new Date().toISOString(),
          })
          .select("id");

        if (b?.id) {
          query = query.eq("id", b.id);
        } else if (b?.user_id) {
          query = query.eq("user_id", b.user_id);
        } else if (b?.email) {
          query = query.ilike("email", String(b.email));
        } else {
          throw lastApiError || new Error("Buyer identifier missing for fallback update");
        }

        const { data: fallbackRows, error: fallbackErr } = await query;
        if (fallbackErr) throw fallbackErr;
        if (!Array.isArray(fallbackRows) || fallbackRows.length === 0) {
          throw lastApiError || new Error("Update failed");
        }
      }

      toast({ title: "Success", description: "Buyer updated successfully" });
      setShowEditModal(false);
      await load();
    } catch (e) {
      toast({
        title: "Error",
        description: e.message || "Update failed",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Buyer Management</h1>
          <p className="text-gray-500">Registered buyers and profile details</p>
        </div>
        <Badge variant="outline">{total} Total Buyers</Badge>
      </div>

      {/* Search */}
      <div className="p-4 bg-white border rounded">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
          <Input
            className="pl-9"
            placeholder="Search by name, email, phone or company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Buyer</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="animate-spin mx-auto h-6 w-6" />
                  </TableCell>
                </TableRow>
              ) : buyers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                    No buyers found
                  </TableCell>
                </TableRow>
              ) : (
                buyers.map((b) => {
                  const active = isBuyerActive(b);
                  return (
                    <TableRow key={getBuyerIdentifier(b) || `${b.email}-${b.full_name}`}>
                      <TableCell className="font-medium">{b.full_name}</TableCell>
                      <TableCell>{b.email}</TableCell>
                      <TableCell>{b.company_name || "Individual"}</TableCell>
                      <TableCell>
                        {[b.city, b.state].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell>
                        {b.created_at ? new Date(b.created_at).toLocaleDateString() : "—"}
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant={getStatusBadgeVariant(b)}
                          className={
                            active
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-red-200 bg-red-50 text-red-700"
                          }
                        >
                          {getStatusLabel(b)}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right space-x-2">
                        <Button size="sm" variant="outline" onClick={() => openView(b)}>
                          <Eye className="w-4 h-4" />
                        </Button>

                        <Button size="sm" variant="outline" onClick={() => openEdit(b)}>
                          <Edit className="w-4 h-4" />
                        </Button>

                        {active ? (
                          <Button
                            size="sm"
                            className="bg-red-600 hover:bg-red-700 text-white"
                            onClick={() => openTerminate(b)}
                            disabled={processing}
                            title="Terminate Buyer"
                          >
                            <Ban className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => activateBuyer(b)}
                            disabled={processing}
                            title="Activate Buyer"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* VIEW MODAL */}
      <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Buyer Details</DialogTitle>
          </DialogHeader>

          {selectedBuyer && (
            <div className="space-y-2 text-sm">
              <div><b>Name:</b> {selectedBuyer.full_name}</div>
              <div><b>Email:</b> {selectedBuyer.email}</div>
              <div><b>Phone:</b> {selectedBuyer.phone || "—"}</div>
              <div><b>Company:</b> {selectedBuyer.company_name || "Individual"}</div>
              <div><b>Status:</b> {getStatusLabel(selectedBuyer)}</div>
              <div><b>PAN:</b> {selectedBuyer.pan_card || "—"}</div>
              <div><b>GST:</b> {selectedBuyer.gst_number || "—"}</div>
              <div><b>Address:</b> {selectedBuyer.address || "—"}</div>
              {"terminated_reason" in (selectedBuyer || {}) && (
                <div>
                  <b>Termination Reason:</b> {selectedBuyer.terminated_reason || "—"}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowViewModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT MODAL */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="w-[92vw] max-w-md p-4 sm:p-5">
          <DialogHeader>
            <DialogTitle>Edit Buyer</DialogTitle>
          </DialogHeader>

          {selectedBuyer && (
            <div className="space-y-2 max-h-[62vh] overflow-y-auto pr-1">
              <Input
                className="h-9"
                value={selectedBuyer.full_name}
                onChange={(e) =>
                  setSelectedBuyer({
                    ...selectedBuyer,
                    full_name: e.target.value.replace(/[^A-Za-z\s]/g, ""),
                  })
                }
                placeholder="Full Name"
              />
              <Input
                className="h-9"
                value={selectedBuyer.phone || ""}
                onChange={(e) =>
                  setSelectedBuyer({
                    ...selectedBuyer,
                    phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                  })
                }
                placeholder="Phone"
              />
              <Input
                className="h-9"
                value={selectedBuyer.company_name || ""}
                onChange={(e) =>
                  setSelectedBuyer({ ...selectedBuyer, company_name: e.target.value })
                }
                placeholder="Company"
              />
              <Input
                className="h-9"
                value={selectedBuyer.pan_card || ""}
                onChange={(e) =>
                  setSelectedBuyer({
                    ...selectedBuyer,
                    pan_card: e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 10),
                  })
                }
                placeholder="PAN (ABCDE1234F)"
              />
              <Input
                className="h-9"
                value={selectedBuyer.gst_number || ""}
                onChange={(e) =>
                  setSelectedBuyer({
                    ...selectedBuyer,
                    gst_number: e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 15),
                  })
                }
                placeholder="GST Number"
              />
              <Textarea
                className="min-h-[72px]"
                value={selectedBuyer.address || ""}
                onChange={(e) =>
                  setSelectedBuyer({ ...selectedBuyer, address: e.target.value })
                }
                placeholder="Address"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  className="h-9"
                  value={selectedBuyer.city || ""}
                  onChange={(e) =>
                    setSelectedBuyer({ ...selectedBuyer, city: e.target.value })
                  }
                  placeholder="City"
                />
                <Input
                  className="h-9"
                  value={selectedBuyer.state || ""}
                  onChange={(e) =>
                    setSelectedBuyer({ ...selectedBuyer, state: e.target.value })
                  }
                  placeholder="State"
                />
              </div>
              <Input
                className="h-9"
                value={selectedBuyer.pincode || ""}
                onChange={(e) =>
                  setSelectedBuyer({
                    ...selectedBuyer,
                    pincode: e.target.value.replace(/\D/g, "").slice(0, 6),
                  })
                }
                placeholder="Pincode"
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button onClick={saveBuyer} disabled={processing}>
              {processing && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TERMINATE MODAL */}
      <Dialog
        open={showTerminateModal}
        onOpenChange={(open) => {
          setShowTerminateModal(open);
          if (!open) setTerminateReason("");
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Terminate Buyer Account</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Are you sure you want to terminate this buyer account?
            </p>

            <Textarea
              value={terminateReason}
              onChange={(e) => setTerminateReason(e.target.value)}
              placeholder="Reason (required)"
            />
            <p className="text-xs text-gray-500">
              Please type a reason to enable <b>Terminate</b>.
            </p>

            {selectedBuyer && (
              <div className="text-sm">
                <b>Buyer:</b> {selectedBuyer.full_name} ({selectedBuyer.email})
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTerminateModal(false)}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={terminateBuyer}
              disabled={processing || !isTerminateReasonValid}
            >
              {processing && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              Terminate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
