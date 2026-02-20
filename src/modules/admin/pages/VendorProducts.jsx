import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";

import CategoryTypeahead from "@/shared/components/CategoryTypeahead";
import { vendorApi } from "@/modules/vendor/services/vendorApi";

import { Loader2, ArrowLeft, Image as ImageIcon, Eye, Pencil, Trash2, X } from "lucide-react";
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
  throw new Error(`API returned non-JSON (${res.status}). Got: ${text.slice(0, 80)}...`);
}

const money = (v) => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return `₹${n}`;
};

// ✅ Combine images from product_images table + products.images jsonb
const getProductImageUrls = (p) => {
  const urls = [];

  // product_images (array of rows)
  if (Array.isArray(p?.product_images)) {
    p.product_images.forEach((img) => {
      if (img?.image_url) urls.push(img.image_url);
    });
  }

  // products.images (jsonb) -> can be array of strings or objects
  const imgs = p?.images;
  if (Array.isArray(imgs)) {
    imgs.forEach((it) => {
      if (typeof it === "string" && it.trim()) urls.push(it.trim());
      else if (it && typeof it === "object") {
        if (typeof it.url === "string" && it.url.trim()) urls.push(it.url.trim());
        else if (typeof it.image_url === "string" && it.image_url.trim()) urls.push(it.image_url.trim());
        else if (typeof it.path === "string" && it.path.trim()) urls.push(it.path.trim());
      }
    });
  }

  // Remove duplicates
  return Array.from(new Set(urls));
};

const priceWithUnit = (p) => {
  const unit = p?.price_unit || p?.qty_unit || "";
  const base = money(p?.price);
  return unit ? `${base} / ${unit}` : base;
};

const safeJsonParse = (value) => {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalizeTargetLocations = (raw) => {
  if (!raw) return { pan_india: false, states: [], cities: [] };
  let obj = raw;
  if (typeof raw === "string") {
    const parsed = safeJsonParse(raw);
    if (parsed && typeof parsed === "object") obj = parsed;
  }
  if (!obj || typeof obj !== "object") return { pan_india: false, states: [], cities: [] };
  const normList = (list) =>
    (Array.isArray(list) ? list : [])
      .map((it) => {
        if (it && typeof it === "object") return it;
        if (it !== undefined && it !== null) return { id: it, name: String(it) };
        return null;
      })
      .filter(Boolean);
  return {
    pan_india: !!obj.pan_india,
    states: normList(obj.states),
    cities: normList(obj.cities),
  };
};

const normalizeList = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = safeJsonParse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }
  return [];
};

const formatKeywordList = (list) =>
  (list || [])
    .map((k) => k?.name || k?.label || k?.title || k?.path || k)
    .filter(Boolean);

const formatCategory = (p) => {
  if (p?.category_path) return p.category_path;
  if (p?.category_other) return p.category_other;
  const ids = [p?.head_category_id, p?.sub_category_id, p?.micro_category_id].filter(Boolean);
  if (ids.length) return `IDs: ${ids.join(" / ")}`;
  return "—";
};

export default function VendorProducts() {
  const { toast } = useToast();
  const ADMIN_API_BASE = getAdminBase();
  const { vendorId } = useParams();

  const [vendor, setVendor] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [viewProduct, setViewProduct] = useState(null);
  const [openView, setOpenView] = useState(false);

  const [editProduct, setEditProduct] = useState(null);
  const [openEdit, setOpenEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [selectedStateId, setSelectedStateId] = useState("");
  const [extraCatInput, setExtraCatInput] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchWithCsrf(`${ADMIN_API_BASE}/vendors/${vendorId}/products`);
      const data = await safeReadJson(res);
      if (!data?.success) throw new Error(data?.error || "Failed");
      setVendor(data.vendor || null);
      setProducts(data.products || []);
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: e.message || "Failed to load products", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (vendorId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  useEffect(() => {
    const loadStates = async () => {
      try {
        const data = await vendorApi.getStates();
        setStates(data || []);
      } catch (e) {
        console.error(e);
      }
    };
    loadStates();
  }, []);

  useEffect(() => {
    const loadCities = async () => {
      if (!selectedStateId) {
        setCities([]);
        return;
      }
      try {
        const data = await vendorApi.getCities(selectedStateId);
        setCities(data || []);
      } catch (e) {
        console.error(e);
        setCities([]);
      }
    };
    loadCities();
  }, [selectedStateId]);

  const openViewModal = (p) => {
    setViewProduct(p);
    setOpenView(true);
  };

  const openEditModal = (p) => {
    const tl = normalizeTargetLocations(p?.target_locations);
    const extraKeywords = normalizeList(p?.extra_micro_categories);
    const specs = normalizeList(p?.specifications);
    setEditProduct({
      id: p.id,
      name: p.name || "",
      description: p.description || "",
      price: p.price ?? "",
      price_unit: p.price_unit || "",
      qty_unit: p.qty_unit || "",
      status: p.status || "DRAFT",
      moq: p.moq ?? "",
      min_order_qty: p.min_order_qty ?? p.moq ?? "",
      stock: p.stock ?? "",
      is_service: !!p.is_service,
      category_path: p.category_path || "",
      category_other: p.category_other || "",
      micro_category_id: p.micro_category_id || null,
      sub_category_id: p.sub_category_id || null,
      head_category_id: p.head_category_id || null,
      extra_micro_categories: extraKeywords,
      target_locations: tl,
      specifications: specs,
      video_url: p.video_url || "",
      pdf_url: p.pdf_url || "",
    });
    const lastState = tl?.states?.slice(-1)?.[0];
    setSelectedStateId(lastState?.id ? String(lastState.id) : "");
    setExtraCatInput(null);
    setOpenEdit(true);
  };

  const saveEdit = async () => {
    if (!editProduct?.id) return;
    setSaving(true);
    try {
      const safeTargets = normalizeTargetLocations(editProduct.target_locations);
      const safeSpecs = normalizeList(editProduct.specifications);
      const safeKeywords = normalizeList(editProduct.extra_micro_categories);
      const minOrderQty = editProduct.min_order_qty ?? editProduct.moq;
      const res = await fetchWithCsrf(`${ADMIN_API_BASE}/products/${editProduct.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editProduct.name,
          description: editProduct.description,
          price: editProduct.price === "" ? null : Number(editProduct.price || 0),
          price_unit: editProduct.price_unit || null,
          qty_unit: editProduct.qty_unit || null,
          status: editProduct.status,
          moq: minOrderQty === "" ? null : Number(minOrderQty || 0),
          min_order_qty: minOrderQty === "" ? null : Number(minOrderQty || 0),
          stock: editProduct.stock === "" ? null : Number(editProduct.stock || 0),
          is_service: !!editProduct.is_service,
          category_path: editProduct.category_path || null,
          category_other: editProduct.category_other || null,
          micro_category_id: editProduct.micro_category_id || null,
          sub_category_id: editProduct.sub_category_id || null,
          head_category_id: editProduct.head_category_id || null,
          extra_micro_categories: safeKeywords,
          target_locations: safeTargets,
          specifications: safeSpecs,
          video_url: editProduct.video_url || null,
          pdf_url: editProduct.pdf_url || null,
        }),
      });
      const data = await safeReadJson(res);
      if (!data?.success) throw new Error(data?.error || "Update failed");

      toast({ title: "Success", description: "Product updated" });
      setOpenEdit(false);
      await load();
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: e.message || "Update failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (p) => {
    const ok = window.confirm(`Delete product: ${p.name}?`);
    if (!ok) return;

    setSaving(true);
    try {
      const res = await fetchWithCsrf(`${ADMIN_API_BASE}/products/${p.id}`, { method: "DELETE" });
      const data = await safeReadJson(res);
      if (!data?.success) throw new Error(data?.error || "Delete failed");
      toast({ title: "Success", description: "Product deleted" });
      await load();
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: e.message || "Delete failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateTargetLocations = (updater) => {
    setEditProduct((s) => {
      if (!s) return s;
      const current = normalizeTargetLocations(s.target_locations);
      const next = updater(current);
      return { ...s, target_locations: next };
    });
  };

  const addLocation = (type, item) => {
    if (!item?.id) return;
    updateTargetLocations((tl) => {
      const list = tl[type] || [];
      const exists = list.some((x) => String(x.id) === String(item.id));
      if (exists) return tl;
      return {
        ...tl,
        pan_india: false,
        [type]: [...list, { id: item.id, name: item.name }],
      };
    });
  };

  const removeLocation = (type, rid) => {
    updateTargetLocations((tl) => ({
      ...tl,
      [type]: (tl[type] || []).filter((x) => String(x.id) !== String(rid)),
    }));
  };

  const addKeyword = (item) => {
    if (!item) return;
    setEditProduct((s) => {
      if (!s) return s;
      const list = normalizeList(s.extra_micro_categories);
      const id = item?.id ? String(item.id) : null;
      const exists = list.some((k) => {
        const kId = k?.id ? String(k.id) : null;
        if (id && kId && id === kId) return true;
        const kName = (k?.name || k?.label || k?.title || k).toString().toLowerCase();
        const iName = (item?.name || item?.label || item?.title || item).toString().toLowerCase();
        return kName === iName;
      });
      if (exists) return s;
      if (list.length >= 2) return s;
      return { ...s, extra_micro_categories: [...list, item] };
    });
    setExtraCatInput(null);
  };

  const removeKeyword = (idx) => {
    setEditProduct((s) => {
      if (!s) return s;
      const list = normalizeList(s.extra_micro_categories);
      const next = [...list];
      next.splice(idx, 1);
      return { ...s, extra_micro_categories: next };
    });
  };

  const viewTargets = viewProduct ? normalizeTargetLocations(viewProduct.target_locations) : null;
  const viewKeywords = viewProduct ? formatKeywordList(normalizeList(viewProduct.extra_micro_categories)) : [];
  const viewStates = viewTargets?.states?.map((s) => s?.name || s?.id).filter(Boolean) || [];
  const viewCities = viewTargets?.cities?.map((c) => c?.name || c?.id).filter(Boolean) || [];
  const viewSpecs = viewProduct ? normalizeList(viewProduct.specifications) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/admin/vendors">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-neutral-800">
            {vendor?.company_name ? `${vendor.company_name} Products` : "Vendor Products"}
          </h1>
          <p className="text-sm text-gray-500">Admin can view/update/delete products</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline">{products.length} Products</Badge>
          {vendor?.is_active === false ? <Badge variant="destructive">TERMINATED</Badge> : <Badge variant="outline">ACTIVE</Badge>}
        </div>
      </div>

      {vendor ? (
        <Card>
          <CardContent className="p-4 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="font-medium">{vendor.company_name}</div>
                <div className="text-gray-500">{vendor.vendor_id}</div>
              </div>
              <div className="space-y-1">
                <div className="text-gray-700">Owner: <span className="font-medium">{vendor.owner_name || "—"}</span></div>
                <div className="text-gray-700">Email: <span className="font-medium break-all">{vendor.email || "—"}</span></div>
                <div className="text-gray-700">Phone: <span className="font-medium">{vendor.phone || "—"}</span></div>
                <div className="text-gray-700">KYC: <span className="font-medium">{String(vendor.kyc_status || "PENDING").toUpperCase()}</span></div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Image</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  <Loader2 className="animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                  No products found for this vendor.
                </TableCell>
              </TableRow>
            ) : (
              products.map((p) => {
                const urls = getProductImageUrls(p);
                const firstImage = urls[0] || null;

                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center overflow-hidden">
                        {firstImage ? (
                          <img src={firstImage} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{priceWithUnit(p)}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "ACTIVE" ? "default" : "secondary"}>{p.status || "DRAFT"}</Badge>
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openViewModal(p)}>
                          <Eye className="w-4 h-4 mr-1" /> View
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openEditModal(p)} disabled={saving}>
                          <Pencil className="w-4 h-4 mr-1" /> Edit
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => deleteProduct(p)} disabled={saving}>
                          <Trash2 className="w-4 h-4" />
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

      {/* View Modal */}
      <Dialog open={openView} onOpenChange={setOpenView}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Product Details</DialogTitle>
            <DialogDescription>{viewProduct?.name || ""}</DialogDescription>
          </DialogHeader>

          {viewProduct ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Title:</span>{" "}
                  <span className="font-medium">{viewProduct.name || "—"}</span>
                </div>
                <div>
                  <span className="text-gray-500">Rate / Unit:</span>{" "}
                  <span className="font-medium">{priceWithUnit(viewProduct)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Category:</span>{" "}
                  <span className="font-medium">{formatCategory(viewProduct)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Status:</span>{" "}
                  <span className="font-medium">{viewProduct.status || "DRAFT"}</span>
                </div>
                <div>
                  <span className="text-gray-500">Min Order Qty:</span>{" "}
                  <span className="font-medium">
                    {viewProduct.min_order_qty ?? viewProduct.moq ?? "—"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Stock:</span>{" "}
                  <span className="font-medium">{viewProduct.stock ?? "—"}</span>
                </div>

                <div className="md:col-span-2 break-words">
                  <span className="text-gray-500">Description:</span>{" "}
                  <span className="font-medium">{viewProduct.description || "—"}</span>
                </div>

                <div className="md:col-span-2">
                  <span className="text-gray-500">Additional Keywords:</span>{" "}
                  {viewKeywords.length ? (
                    <span className="flex flex-wrap gap-2 mt-1">
                      {viewKeywords.map((k, i) => (
                        <Badge key={`${k}-${i}`} variant="secondary" className="text-xs">
                          {k}
                        </Badge>
                      ))}
                    </span>
                  ) : (
                    <span className="font-medium">—</span>
                  )}
                </div>

                <div className="md:col-span-2">
                  <span className="text-gray-500">Target Locations:</span>{" "}
                  {viewTargets?.pan_india ? (
                    <span className="font-medium">Pan India</span>
                  ) : (
                    <span className="font-medium">
                      {viewStates.length || viewCities.length
                        ? `${viewStates.length} States, ${viewCities.length} Cities`
                        : "—"}
                    </span>
                  )}
                  {!viewTargets?.pan_india && (viewStates.length || viewCities.length) ? (
                    <div className="text-xs text-gray-500 mt-1">
                      {viewStates.length ? `States: ${viewStates.slice(0, 6).join(", ")}${viewStates.length > 6 ? " +" + (viewStates.length - 6) : ""}` : null}
                      {viewCities.length ? ` • Cities: ${viewCities.slice(0, 6).join(", ")}${viewCities.length > 6 ? " +" + (viewCities.length - 6) : ""}` : null}
                    </div>
                  ) : null}
                </div>

                <div className="md:col-span-2">
                  <span className="text-gray-500">Video URL:</span>{" "}
                  {viewProduct.video_url ? (
                    <a className="text-blue-600 underline break-all" href={viewProduct.video_url} target="_blank" rel="noreferrer">
                      {viewProduct.video_url}
                    </a>
                  ) : (
                    <span className="font-medium">—</span>
                  )}
                </div>

                <div className="md:col-span-2">
                  <span className="text-gray-500">PDF URL:</span>{" "}
                  {viewProduct.pdf_url ? (
                    <a className="text-blue-600 underline break-all" href={viewProduct.pdf_url} target="_blank" rel="noreferrer">
                      {viewProduct.pdf_url}
                    </a>
                  ) : (
                    <span className="font-medium">—</span>
                  )}
                </div>

                <div className="md:col-span-2">
                  <span className="text-gray-500">Specifications:</span>{" "}
                  {viewSpecs.length ? (
                    <div className="mt-2 space-y-1 text-sm">
                      {viewSpecs.map((s, i) => (
                        <div key={`${s?.key || "spec"}-${i}`} className="flex justify-between gap-3">
                          <span className="text-gray-500">{s?.key || "—"}</span>
                          <span className="font-medium">{s?.value || "—"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="font-medium">—</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {getProductImageUrls(viewProduct).slice(0, 12).map((url, i) => (
                  <div key={`${url}-${i}`} className="aspect-square bg-gray-100 rounded overflow-hidden">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
                {getProductImageUrls(viewProduct).length === 0 ? (
                  <div className="col-span-2 md:col-span-3 text-sm text-gray-500">No images uploaded.</div>
                ) : null}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenView(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>Admin can update product fields</DialogDescription>
          </DialogHeader>

          {editProduct ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600">Name</label>
                <Input value={editProduct.name} onChange={(e) => setEditProduct((s) => ({ ...s, name: e.target.value }))} />
              </div>

              <div>
                <label className="text-sm text-gray-600">Description</label>
                <Textarea
                  rows={4}
                  value={editProduct.description}
                  onChange={(e) => setEditProduct((s) => ({ ...s, description: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                {editProduct.category_path ? (
                  <div className="flex items-center justify-between gap-2 p-2 border rounded bg-slate-50 text-sm">
                    <span className="text-slate-700">{editProduct.category_path}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      onClick={() =>
                        setEditProduct((s) => ({
                          ...s,
                          category_path: "",
                          category_other: "",
                          micro_category_id: null,
                          sub_category_id: null,
                          head_category_id: null,
                        }))
                      }
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <CategoryTypeahead
                      onSelect={(item) => {
                        if (!item) return;
                        setEditProduct((s) => ({
                          ...s,
                          category_path: item.path || "",
                          micro_category_id: item.id || null,
                          sub_category_id: item.sub_id || null,
                          head_category_id: item.head_id || null,
                          category_other: "",
                        }));
                      }}
                    />
                    <Input
                      placeholder="Custom category (if not found)"
                      value={editProduct.category_other || ""}
                      onChange={(e) => setEditProduct((s) => ({ ...s, category_other: e.target.value }))}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Additional Keywords (max 2)</Label>
                <div className="flex gap-2">
                  <CategoryTypeahead
                    onSelect={setExtraCatInput}
                    placeholder="Search keyword..."
                    disabled={normalizeList(editProduct.extra_micro_categories).length >= 2}
                  />
                  <Button type="button" onClick={() => addKeyword(extraCatInput)} disabled={!extraCatInput}>
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {normalizeList(editProduct.extra_micro_categories).map((c, i) => (
                    <div key={`${c?.id || c?.name || i}`} className="bg-slate-100 px-3 py-1 rounded-full text-xs flex items-center gap-2">
                      {c?.name || c?.label || c?.title || c?.path || c}
                      <X className="w-3 h-3 cursor-pointer" onClick={() => removeKeyword(i)} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm text-gray-600">Price</label>
                  <Input
                    type="number"
                    value={editProduct.price}
                    onChange={(e) => setEditProduct((s) => ({ ...s, price: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-600">Price Unit</label>
                  <Input
                    placeholder="e.g. piece, unit, kg"
                    value={editProduct.price_unit}
                    onChange={(e) => setEditProduct((s) => ({ ...s, price_unit: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-600">Min Order Qty</label>
                  <Input
                    type="number"
                    value={editProduct.min_order_qty}
                    onChange={(e) => setEditProduct((s) => ({ ...s, min_order_qty: e.target.value, moq: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-600">Stock</label>
                  <Input
                    type="number"
                    value={editProduct.stock}
                    onChange={(e) => setEditProduct((s) => ({ ...s, stock: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    checked={!!editProduct.is_service}
                    onCheckedChange={(v) => setEditProduct((s) => ({ ...s, is_service: !!v }))}
                  />
                  <span className="text-sm text-gray-600">Service Product</span>
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600">Status</label>
                <Select value={editProduct.status} onValueChange={(v) => setEditProduct((s) => ({ ...s, status: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                    <SelectItem value="DRAFT">DRAFT</SelectItem>
                    <SelectItem value="ARCHIVED">ARCHIVED</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Target Locations</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!editProduct.target_locations?.pan_india}
                    onCheckedChange={(checked) =>
                      updateTargetLocations((tl) => ({ ...tl, pan_india: !!checked }))
                    }
                  />
                  <span className="text-sm text-gray-600">Pan India</span>
                </div>

                {!editProduct.target_locations?.pan_india ? (
                  <div className="space-y-3 border rounded-md p-3">
                    <div>
                      <Label className="text-xs">Add State</Label>
                      <Select
                        value={selectedStateId}
                        onValueChange={(v) => {
                          const st = states.find((x) => String(x.id) === String(v));
                          if (!st) return;
                          addLocation("states", st);
                          setSelectedStateId(String(st.id));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select state" />
                        </SelectTrigger>
                        <SelectContent>
                          {states.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(editProduct.target_locations?.states || []).map((s) => (
                          <div key={s.id} className="bg-slate-100 px-2 py-1 rounded-full text-xs flex items-center gap-2">
                            {s.name || s.id}
                            <X className="w-3 h-3 cursor-pointer" onClick={() => removeLocation("states", s.id)} />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs">Add City (by selected state)</Label>
                      <Select
                        value=""
                        onValueChange={(v) => {
                          const city = cities.find((c) => String(c.id) === String(v));
                          if (!city) return;
                          addLocation("cities", city);
                        }}
                        disabled={!selectedStateId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={selectedStateId ? "Select city" : "Select state first"} />
                        </SelectTrigger>
                        <SelectContent>
                          {cities.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(editProduct.target_locations?.cities || []).map((c) => (
                          <div key={c.id} className="bg-slate-100 px-2 py-1 rounded-full text-xs flex items-center gap-2">
                            {c.name || c.id}
                            <X className="w-3 h-3 cursor-pointer" onClick={() => removeLocation("cities", c.id)} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-600">Video URL</label>
                  <Input
                    placeholder="https://..."
                    value={editProduct.video_url}
                    onChange={(e) => setEditProduct((s) => ({ ...s, video_url: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">PDF URL</label>
                  <Input
                    placeholder="https://..."
                    value={editProduct.pdf_url}
                    onChange={(e) => setEditProduct((s) => ({ ...s, pdf_url: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenEdit(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
