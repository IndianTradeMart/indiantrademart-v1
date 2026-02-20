import React, { useEffect, useMemo, useState } from 'react';
import { useEmployeeAuth } from '@/modules/employee/context/EmployeeAuthContext';
import { dataEntryApi } from '@/modules/employee/services/dataEntryApi';
import { notificationService } from '@/modules/employee/services/notificationService';
import { supabase } from '@/lib/customSupabaseClient';
import { apiUrl } from '@/lib/apiBase';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { Loader2, FileText, AlertCircle, Check, X, Eye } from 'lucide-react';

const normalizeStatus = (status) => String(status || 'PENDING').trim().toUpperCase();
const formatDate = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString();
};
const prettyLabel = (value = '') => {
  const text = String(value || '').replaceAll('_', ' ').trim();
  return text ? text.toUpperCase() : 'DOCUMENT';
};
const looksLikePdf = (value = '') => String(value || '').toLowerCase().includes('.pdf');

const getStatusClasses = (status) => {
  const s = normalizeStatus(status);
  if (s === 'APPROVED' || s === 'VERIFIED') return 'border-green-200 bg-green-50 text-green-700';
  if (s === 'REJECTED') return 'border-red-200 bg-red-50 text-red-700';
  if (s === 'SUBMITTED') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

const statusLabel = (status) => {
  const s = normalizeStatus(status);
  return s === 'VERIFIED' ? 'APPROVED' : s;
};
const DOC_READY_STATUSES = ['PENDING', 'SUBMITTED', 'APPROVED', 'VERIFIED'];
const TRACKED_KYC_STATUSES = [...DOC_READY_STATUSES, 'REJECTED'];

const normalizeDocuments = (documents = []) =>
  (documents || []).map((doc) => ({
    ...doc,
    document_type: doc.document_type || doc.type || 'document',
    document_url: doc.url || doc.document_url || doc.file_path || doc.original || '',
    doc_status: doc.status || doc.verification_status || 'PENDING',
    created_at: doc.created_at || doc.uploaded_at || doc.updated_at || null,
  }));

const KycApprovals = () => {
  const { user } = useEmployeeAuth();

  const [vendorsWithDocs, setVendorsWithDocs] = useState([]);
  const [vendorsWithoutDocs, setVendorsWithoutDocs] = useState([]);
  const [rejectedVendors, setRejectedVendors] = useState([]);
  const [vendorDocCounts, setVendorDocCounts] = useState({});
  const [loading, setLoading] = useState(true);

  const [selectedVendor, setSelectedVendor] = useState(null);
  const [docs, setDocs] = useState([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [imgErrors, setImgErrors] = useState({});

  const [busyActionKey, setBusyActionKey] = useState('');

  useEffect(() => {
    if (!user) return;
    loadVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const getBusyKey = (action, vendorId) => `${action}:${vendorId}`;

  const loadVendors = async () => {
    setLoading(true);
    try {
      const { data: vendors, error: vendorsError } = await supabase
        .from('vendors')
        .select('id, vendor_id, company_name, owner_name, kyc_status, created_at, updated_at, rejection_reason, email, phone, address, registered_address')
        .order('created_at', { ascending: false });

      if (vendorsError) throw vendorsError;

      const safeVendors = (vendors || []).filter((vendor) =>
        TRACKED_KYC_STATUSES.includes(normalizeStatus(vendor?.kyc_status))
      );
      const vendorIds = safeVendors.map((vendor) => vendor.id).filter(Boolean);

      let docsRows = [];
      if (vendorIds.length > 0) {
        const { data: vendorDocs, error: docsError } = await supabase
          .from('vendor_documents')
          .select('vendor_id')
          .in('vendor_id', vendorIds);
        if (docsError) throw docsError;
        docsRows = vendorDocs || [];

        // Backward-compatible fallback for environments still using kyc_documents.
        try {
          const { data: legacyDocs, error: legacyDocsError } = await supabase
            .from('kyc_documents')
            .select('vendor_id')
            .in('vendor_id', vendorIds);
          if (!legacyDocsError && Array.isArray(legacyDocs)) {
            docsRows = [...docsRows, ...legacyDocs];
          }
        } catch {
          // ignore optional table failures
        }
      }

      const counts = docsRows.reduce((acc, row) => {
        const key = String(row.vendor_id || '');
        if (!key) return acc;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      const hasDocs = (vendor) => {
        const key = String(vendor?.id || '');
        return counts[key] > 0;
      };
      const isApprovedVendor = (vendor) => {
        const s = normalizeStatus(vendor?.kyc_status);
        return s === 'APPROVED' || s === 'VERIFIED';
      };

      const pendingLike = safeVendors.filter((vendor) => {
        const s = normalizeStatus(vendor.kyc_status);
        return s === 'PENDING' || s === 'SUBMITTED';
      });
      const docReadyVendors = safeVendors.filter((vendor) =>
        DOC_READY_STATUSES.includes(normalizeStatus(vendor.kyc_status))
      );

      setVendorsWithDocs(docReadyVendors.filter((vendor) => hasDocs(vendor) || isApprovedVendor(vendor)));
      setVendorsWithoutDocs(pendingLike.filter((vendor) => !hasDocs(vendor)));
      setRejectedVendors(
        safeVendors.filter((vendor) => normalizeStatus(vendor.kyc_status) === 'REJECTED')
      );
      setVendorDocCounts(counts);
    } catch (error) {
      console.error(error);
      toast({
        title: 'Error',
        description: 'Failed to load KYC review data',
        variant: 'destructive',
      });
      setVendorsWithDocs([]);
      setVendorsWithoutDocs([]);
      setRejectedVendors([]);
      setVendorDocCounts({});
    } finally {
      setLoading(false);
    }
  };

  const handleViewDocs = async (vendor) => {
    setSelectedVendor(vendor);
    setDocs([]);
    setImgErrors({});
    setIsLoadingDocs(true);

    try {
      const response = await fetchWithCsrf(apiUrl(`/api/kyc/vendors/${vendor.id}/documents`));
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.details || payload?.error || 'Failed to load documents');
      }

      if (payload?.vendor) {
        setSelectedVendor((prev) => ({ ...(prev || {}), ...(payload.vendor || {}) }));
      }

      setDocs(normalizeDocuments(payload.documents || []));
    } catch (apiError) {
      try {
        const fallbackDocs = await dataEntryApi.getVendorDocuments(vendor.id);
        setDocs(normalizeDocuments(fallbackDocs || []));
      } catch (fallbackError) {
        console.error('Document load failed:', apiError, fallbackError);
        toast({
          title: 'Error',
          description: 'Failed to load documents',
          variant: 'destructive',
        });
        setDocs([]);
      }
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const createKycTicket = async (vendor, mode) => {
    const status = normalizeStatus(vendor?.kyc_status);
    const docCount = vendorDocCounts[String(vendor?.id)] || 0;

    const configs = {
      admin_approval: {
        category: 'KYC Approval',
        priority: 'MEDIUM',
        subject: `KYC approval needed - ${vendor.company_name}`,
        description:
          `Data Entry requested admin review for KYC approval.\n` +
          `Vendor: ${vendor.company_name} (${vendor.vendor_id || vendor.id})\n` +
          `Status: ${status}\n` +
          `Documents found: ${docCount}\n` +
          `Please review and approve/reject in admin KYC panel.`,
      },
      awaiting_docs: {
        category: 'KYC Follow-up',
        priority: 'MEDIUM',
        subject: `KYC documents pending - ${vendor.company_name}`,
        description:
          `Vendor has not submitted required KYC documents.\n` +
          `Vendor: ${vendor.company_name} (${vendor.vendor_id || vendor.id})\n` +
          `Please contact vendor and request KYC upload.`,
      },
      rejected_followup: {
        category: 'KYC Follow-up',
        priority: 'HIGH',
        subject: `KYC rejected follow-up - ${vendor.company_name}`,
        description:
          `Vendor KYC is rejected and needs follow-up.\n` +
          `Vendor: ${vendor.company_name} (${vendor.vendor_id || vendor.id})\n` +
          `Rejection reason: ${vendor.rejection_reason || 'Not provided'}\n` +
          `Please contact vendor to re-submit correct documents.`,
      },
    };

    const config = configs[mode];
    if (!config) throw new Error('Invalid ticket mode');

    const { data: existingOpen } = await supabase
      .from('support_tickets')
      .select('id, ticket_display_id, status')
      .eq('vendor_id', vendor.id)
      .eq('category', config.category)
      .in('status', ['OPEN', 'IN_PROGRESS'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingOpen?.length) {
      return { duplicate: true, existing: existingOpen[0] };
    }

    const response = await fetchWithCsrf(apiUrl('/api/support/tickets'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: config.subject,
        description: config.description,
        category: config.category,
        priority: config.priority,
        status: 'OPEN',
        vendor_id: vendor.id,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.details || payload?.error || 'Failed to create support ticket');
    }

    return { duplicate: false, ticket: payload?.ticket || null };
  };

  const handleInformAdmin = async (vendor) => {
    const key = getBusyKey('admin', vendor.id);
    setBusyActionKey(key);
    try {
      const result = await createKycTicket(vendor, 'admin_approval');

      try {
        await notificationService.sendNotificationToRole(
          'ADMIN',
          'KYC_APPROVAL_REQUESTED',
          'KYC approval requested',
          `Data Entry requested approval for vendor "${vendor.company_name}" (${vendor.vendor_id || vendor.id}).`,
          '/admin/kyc'
        );
      } catch (notificationError) {
        console.warn('Admin notification failed:', notificationError);
      }

      if (result.duplicate) {
        toast({
          title: 'Already In Queue',
          description: 'An open KYC approval ticket already exists for this vendor.',
        });
      } else {
        toast({
          title: 'Admin Informed',
          description: 'Approval request shared with admin/support queue.',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to inform admin',
        variant: 'destructive',
      });
    } finally {
      setBusyActionKey('');
    }
  };

  const handleInformSupport = async (vendor, source = 'awaiting_docs') => {
    const key = getBusyKey('support', vendor.id);
    setBusyActionKey(key);
    try {
      const mode = source === 'rejected' ? 'rejected_followup' : 'awaiting_docs';
      const result = await createKycTicket(vendor, mode);

      try {
        await notificationService.sendNotificationToRole(
          'SUPPORT',
          'KYC_VENDOR_FOLLOWUP',
          'Vendor KYC follow-up required',
          `Please contact vendor "${vendor.company_name}" (${vendor.vendor_id || vendor.id}) for KYC follow-up.`,
          '/employee/support/dashboard'
        );
      } catch (notificationError) {
        console.warn('Support notification failed:', notificationError);
      }

      if (result.duplicate) {
        toast({
          title: 'Already In Queue',
          description: 'An open support follow-up ticket already exists for this vendor.',
        });
      } else {
        toast({
          title: 'Support Informed',
          description: 'Support team has been notified for vendor contact.',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to inform support',
        variant: 'destructive',
      });
    } finally {
      setBusyActionKey('');
    }
  };

  const selectedVendorDocCount = useMemo(() => {
    if (!selectedVendor) return 0;
    const fromMap = vendorDocCounts[String(selectedVendor.id)] || 0;
    return Math.max(fromMap, docs.length);
  }, [selectedVendor, vendorDocCounts, docs.length]);

  const selectedStatus = normalizeStatus(selectedVendor?.kyc_status);
  const shouldShowInformAdmin =
    (selectedStatus === 'PENDING' || selectedStatus === 'SUBMITTED') && selectedVendorDocCount > 0;
  const shouldShowInformSupport = selectedStatus === 'REJECTED' || selectedVendorDocCount === 0;

  const VendorTable = ({ vendors, title, emptyMessage, variant = 'default', action }) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {variant === 'warning' && <AlertCircle className="w-5 h-5 text-amber-500" />}
          {variant === 'danger' && <X className="w-5 h-5 text-red-500" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor ID</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Docs</TableHead>
                <TableHead>Updated On</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                vendors.map((vendor) => {
                  const rowDocCount = vendorDocCounts[String(vendor.id)] || 0;
                  const supportBusy = busyActionKey === getBusyKey('support', vendor.id);
                  const adminBusy = busyActionKey === getBusyKey('admin', vendor.id);
                  const vendorStatus = normalizeStatus(vendor.kyc_status);
                  const isApprovedVendor = vendorStatus === 'APPROVED' || vendorStatus === 'VERIFIED';
                  return (
                    <TableRow key={vendor.id}>
                      <TableCell className="font-mono text-xs">{vendor.vendor_id}</TableCell>
                      <TableCell>
                        <div className="font-medium">{vendor.company_name}</div>
                        <div className="text-xs text-gray-500">{vendor.owner_name}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusClasses(vendor.kyc_status)}>
                          {statusLabel(vendor.kyc_status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{rowDocCount}</TableCell>
                      <TableCell>{formatDate(vendor.updated_at || vendor.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleViewDocs(vendor)}>
                            <Eye className="w-4 h-4 mr-1" /> Review
                          </Button>
                          {action === 'admin' ? (
                            isApprovedVendor ? (
                              <Button size="sm" variant="secondary" disabled>
                                <Check className="w-4 h-4 mr-1" />
                                Approved
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                className="bg-[#003D82] hover:bg-[#002d62]"
                                disabled={adminBusy}
                                onClick={() => handleInformAdmin(vendor)}
                              >
                                {adminBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                                Inform Admin
                              </Button>
                            )
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={supportBusy}
                              onClick={() => handleInformSupport(vendor, action === 'support-rejected' ? 'rejected' : 'awaiting_docs')}
                            >
                              {supportBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <AlertCircle className="w-4 h-4 mr-1" />}
                              Inform Support
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
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-neutral-800">KYC Status Map</h1>
        <Badge variant="outline">Data Entry Review</Badge>
      </div>

      <VendorTable
        vendors={vendorsWithDocs}
        title="Vendors with Documents"
        emptyMessage="No vendors with submitted documents."
        variant="default"
        action="admin"
      />

      <VendorTable
        vendors={vendorsWithoutDocs}
        title="Vendors Awaiting Documents"
        emptyMessage="No vendors awaiting documents."
        variant="warning"
        action="support-awaiting"
      />

      <VendorTable
        vendors={rejectedVendors}
        title="Rejected KYC Vendors"
        emptyMessage="No rejected KYC vendors."
        variant="danger"
        action="support-rejected"
      />

      <Dialog open={!!selectedVendor} onOpenChange={(open) => !open && setSelectedVendor(null)}>
        <DialogContent className="max-w-4xl max-h-[86vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review KYC: {selectedVendor?.company_name}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-3">
            <div>
              <h4 className="font-semibold mb-2">Vendor Details</h4>
              <div className="space-y-2 text-sm">
                <p><span className="text-gray-500">Vendor ID:</span> {selectedVendor?.vendor_id || '-'}</p>
                <p><span className="text-gray-500">Status:</span> {statusLabel(selectedVendor?.kyc_status)}</p>
                <p><span className="text-gray-500">Owner:</span> {selectedVendor?.owner_name || '-'}</p>
                <p><span className="text-gray-500">Email:</span> {selectedVendor?.email || '-'}</p>
                <p><span className="text-gray-500">Phone:</span> {selectedVendor?.phone || '-'}</p>
                <p><span className="text-gray-500">Address:</span> {selectedVendor?.address || selectedVendor?.registered_address || '-'}</p>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Documents (Privacy Masked)</h4>
              {isLoadingDocs ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="animate-spin" />
                </div>
              ) : docs.length === 0 ? (
                <p className="text-sm text-amber-600 italic">No documents uploaded yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {docs.map((doc, index) => {
                    const docUrl = doc.document_url;
                    const isPdf = looksLikePdf(docUrl);
                    const showImage = !!docUrl && !isPdf && !imgErrors[index];
                    return (
                      <div key={`${doc.document_type}-${index}`} className="rounded border bg-white overflow-hidden">
                        <div className="px-3 py-2 border-b bg-gray-50">
                          <p className="text-xs font-semibold">{prettyLabel(doc.document_type)}</p>
                          <p className="text-[11px] text-gray-500">
                            {formatDate(doc.created_at)} - {statusLabel(doc.doc_status)}
                          </p>
                        </div>

                        <div className="relative h-28 bg-slate-100 flex items-center justify-center overflow-hidden">
                          {showImage ? (
                            <img
                              src={docUrl}
                              alt={doc.document_type}
                              className="w-full h-full object-cover"
                              style={{ filter: 'blur(6px)', opacity: 0.65 }}
                              onError={() => setImgErrors((prev) => ({ ...prev, [index]: true }))}
                            />
                          ) : (
                            <FileText className="w-10 h-10 text-slate-400" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {shouldShowInformSupport ? (
              <Button
                variant="secondary"
                disabled={busyActionKey === getBusyKey('support', selectedVendor?.id)}
                onClick={() =>
                  handleInformSupport(
                    selectedVendor,
                    selectedStatus === 'REJECTED' ? 'rejected' : 'awaiting_docs'
                  )
                }
              >
                {busyActionKey === getBusyKey('support', selectedVendor?.id) ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <AlertCircle className="w-4 h-4 mr-2" />
                )}
                Inform Support
              </Button>
            ) : null}

            {shouldShowInformAdmin ? (
              <Button
                className="bg-[#003D82] hover:bg-[#002d62]"
                disabled={busyActionKey === getBusyKey('admin', selectedVendor?.id)}
                onClick={() => handleInformAdmin(selectedVendor)}
              >
                {busyActionKey === getBusyKey('admin', selectedVendor?.id) ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Inform Admin for Approval
              </Button>
            ) : null}

            <Button variant="outline" onClick={() => setSelectedVendor(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KycApprovals;
