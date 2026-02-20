import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, FileText, Loader2, Calendar, ArrowRightLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { buyerApi } from '@/modules/buyer/services/buyerApi';
import { toast } from '@/components/ui/use-toast';

const normalizeUpper = (v) => String(v || '').toUpperCase().trim();

const getBadge = (kind) => {
  // kind: REQUEST | ENQUIRY | QUOTATION
  if (kind === 'REQUEST') return 'bg-indigo-100 text-indigo-700';
  if (kind === 'ENQUIRY') return 'bg-emerald-100 text-emerald-700';
  if (kind === 'QUOTATION') return 'bg-amber-100 text-amber-800';
  return 'bg-gray-100 text-gray-700';
};

const getStatusColor = (status) => {
  const s = normalizeUpper(status);

  if (s === 'RECEIVED') return 'bg-green-100 text-green-700';
  if (s === 'SENT' || s === 'SUBMITTED') return 'bg-blue-100 text-blue-700';
  if (s === 'AVAILABLE') return 'bg-blue-100 text-blue-700';
  if (s === 'IN_PROGRESS') return 'bg-amber-100 text-amber-700';
  if (s === 'COMPLETED' || s === 'CLOSED') return 'bg-green-100 text-green-700';
  if (s === 'CANCELLED' || s === 'REJECTED') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-700';
};

const formatDate = (iso) => {
  try {
    return iso ? new Date(iso).toLocaleDateString() : '—';
  } catch {
    return '—';
  }
};

const safeINR = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toLocaleString('en-IN');
};

/**
 * ✅ Decide proposal direction/type:
 * - Buyer Request: has required_by_date OR created from buyer createProposal flow
 * - Vendor Quotation (received): has buyer_email but no required_by_date
 */
const classifyProposal = (p) => {
  const hasRequiredBy = p?.required_by_date !== null && p?.required_by_date !== undefined;
  const hasBuyerEmail = !!p?.buyer_email;

  if (hasRequiredBy) return { kind: 'REQUEST', displayStatus: normalizeUpper(p?.status || 'SENT') };
  if (hasBuyerEmail) return { kind: 'QUOTATION', displayStatus: 'RECEIVED' }; // ✅ override for buyer UI
  return { kind: 'REQUEST', displayStatus: normalizeUpper(p?.status || 'SENT') };
};

const Proposals = () => {
  const navigate = useNavigate();
  const { buyerId } = useAuth();
  const [items, setItems] = useState([]); // enquiries + requests + received quotations
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    loadItems();
    return () => {
      activeRef.current = false;
    };
  }, [buyerId]);

  const loadItems = async () => {
    if (activeRef.current) setLoading(true);
    try {
      const [proposalsRes, leadsRes] = await Promise.allSettled([
        buyerApi.getProposals(buyerId),
        buyerApi.getSentLeads?.(buyerId) || Promise.resolve([]),
      ]);
      if (!activeRef.current) return;

      const proposals = proposalsRes.status === 'fulfilled' ? (proposalsRes.value || []) : [];
      const leads = leadsRes.status === 'fulfilled' ? (leadsRes.value || []) : [];

      if (proposalsRes.status === 'rejected') {
        console.error('Failed to load proposals:', proposalsRes.reason);
      }
      if (leadsRes.status === 'rejected') {
        console.error('Failed to load sent leads:', leadsRes.reason);
      }

      // ✅ Normalize buyer proposals & received quotations (both are in proposals table)
      const normalizedProposals = (proposals || []).map((p) => {
        const cls = classifyProposal(p);

        const title = p.title || p.product_name || 'Proposal';
        const vendorName = p.vendors?.company_name || (p.vendor_id ? 'Vendor' : 'Marketplace');

        // Qty: sometimes stored like "10 kg" (server fix)
        const qtyText = p.quantity ? String(p.quantity) : null;

        const budgetPretty = safeINR(p.budget);

        return {
          ...p,
          __rowId: `proposal-${p.id}`,
          __type: cls.kind, // REQUEST | QUOTATION
          __title: title,
          __vendorName: vendorName,
          __createdAt: p.created_at,
          __status: cls.displayStatus, // ✅ buyer-side corrected status for quotation
          __qtyText: qtyText,
          __budgetText: budgetPretty ? `₹${budgetPretty}` : (p.budget ? `₹${p.budget}` : null),
          __sourceNote:
            cls.kind === 'QUOTATION'
              ? 'Vendor ne aapki enquiry ke reply me quotation bheja.'
              : 'Aapne vendor ko requirement/proposal bheja.',
        };
      });

      // ✅ Normalize sent enquiries/leads
      const normalizedLeads = (leads || []).map((l) => {
        const title = l.title || l.product_name || l.product_interest || 'Enquiry';
        const vendorName = l.vendors?.company_name || (l.vendor_id ? 'Vendor' : 'Marketplace');
        const qtyText = l.quantity ? String(l.quantity) : null;
        const budgetPretty = safeINR(l.budget);

        return {
          ...l,
          __rowId: `lead-${l.id}`,
          __type: 'ENQUIRY',
          __title: title,
          __vendorName: vendorName,
          __createdAt: l.created_at,
          __status: normalizeUpper(l.status || 'SENT'),
          __qtyText: qtyText,
          __budgetText: budgetPretty ? `₹${budgetPretty}` : (l.budget ? `₹${l.budget}` : null),
          __sourceNote: 'Aapne vendor ko enquiry/lead bheji.',
        };
      });

      // ✅ OPTIONAL: Map quotation → nearest matching enquiry (same vendor + title/product)
      const enquiriesOnly = normalizedLeads.filter((x) => x.__type === 'ENQUIRY');
      const attachReplyInfo = normalizedProposals.map((p) => {
        if (p.__type !== 'QUOTATION') return p;

        const pKey = String(p.product_name || p.__title || '').toLowerCase().trim();
        const pVendor = p.vendor_id || null;
        const pTime = new Date(p.__createdAt || 0).getTime();

        let best = null;
        for (const e of enquiriesOnly) {
          const eKey = String(e.product_name || e.__title || '').toLowerCase().trim();
          const eVendor = e.vendor_id || null;
          const eTime = new Date(e.__createdAt || 0).getTime();

          // must be same vendor and enquiry must be before quotation
          if (pVendor && eVendor && pVendor !== eVendor) continue;
          if (eTime > pTime) continue;

          // try title match
          const matches = pKey && eKey && (pKey === eKey || pKey.includes(eKey) || eKey.includes(pKey));
          if (!matches) continue;

          // choose closest enquiry before quotation
          if (!best || eTime > best.__time) best = { __time: eTime, __rowId: e.__rowId, __title: e.__title };
        }

        if (!best) return p;
        return { ...p, __replyTo: best };
      });

      const merged = [...attachReplyInfo, ...normalizedLeads].sort((a, b) => {
        const da = new Date(a.__createdAt || 0).getTime();
        const db = new Date(b.__createdAt || 0).getTime();
        return db - da;
      });

      setItems(merged || []);
      if (proposalsRes.status === 'rejected' && leadsRes.status === 'rejected') {
        toast({ title: 'Error', description: 'Failed to load your enquiries/proposals', variant: 'destructive' });
      }
    } catch (error) {
      console.error(error);
      if (activeRef.current) {
        toast({ title: 'Error', description: 'Failed to load your enquiries/proposals', variant: 'destructive' });
      }
    } finally {
      if (activeRef.current) setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = String(searchTerm || '').toLowerCase().trim();
    if (!q) return items;

    return items.filter((x) => {
      const title = x.__title || '';
      const vendorName = x.__vendorName || '';
      const product = x.product_name || x.product_interest || '';
      return (
        String(title).toLowerCase().includes(q) ||
        String(product).toLowerCase().includes(q) ||
        String(vendorName).toLowerCase().includes(q)
      );
    });
  }, [items, searchTerm]);

  const handleResendProposal = (item) => {
    const targetVendorId = String(item?.vendor_id || '').trim();
    if (!targetVendorId) {
      toast({
        title: 'Vendor Missing',
        description: 'This quotation does not have a valid vendor.',
        variant: 'destructive',
      });
      return;
    }

    const productName = item?.product_name || item?.title || item?.__title || '';
    const category = item?.product_name || item?.title || item?.__title || '';
    const vendorName = item?.vendors?.company_name || item?.__vendorName || '';
    const query = new URLSearchParams({
      vendorId: targetVendorId,
      vendorName,
      productName,
      category,
      lockVendor: '1',
      lockCategory: '1',
    });
    navigate(`/buyer/proposals/new?${query.toString()}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#003D82]">My Enquiries & Proposals</h2>
          <p className="text-gray-600">
            ✅ Enquiry/Lead sent (aapne) + ✅ Request/Proposal sent (aapne) + ✅ Quotation received (vendor se)
          </p>
        </div>

        <div className="flex items-center gap-2 max-w-sm">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search by title / product / vendor..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Link to="/buyer/proposals/new">
            <Button className="bg-[#003D82] hover:bg-[#002a5c]">
              <Plus className="h-4 w-4 mr-1" />
              New
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto text-gray-300" />
            <h3 className="mt-4 text-lg font-semibold text-gray-700">No items found</h3>
            <p className="text-gray-500 mt-2">Abhi koi enquiry/proposal/quotation nahi dikha ya search match nahi hua.</p>
            <div className="mt-6">
              <Link to="/buyer/proposals/new">
                <Button variant="outline">Create Proposal</Button>
              </Link>
            </div>
          </div>
        ) : (
          filteredItems.map((item) => {
            const kind = item.__type; // ENQUIRY | REQUEST | QUOTATION
            const kindLabel =
              kind === 'ENQUIRY' ? 'Enquiry Sent' :
              kind === 'REQUEST' ? 'Request Sent' :
              kind === 'QUOTATION' ? 'Quotation Received' :
              'Item';

            const typeBadge = getBadge(kind);

            const actionRight =
              kind === 'QUOTATION'
                ? (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="h-9 min-w-[210px] px-3 rounded-md border bg-gray-50 text-sm text-gray-700 flex items-center">
                      Vendor locked: {item?.vendors?.company_name || item?.__vendorName || 'Selected vendor'}
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleResendProposal(item)}
                      disabled={!String(item?.vendor_id || '').trim()}
                    >
                      Send Proposal Again
                    </Button>

                    <Link to={`/buyer/proposals/${item.id}`}>
                      <Button variant="outline" size="sm">
                        View Quotation
                      </Button>
                    </Link>
                  </div>
                )
                : (
                  <Button variant="outline" size="sm" disabled>
                    View Quotes
                  </Button>
                );

            return (
              <Card key={item.__rowId} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-lg text-[#003D82]">{item.__title}</h3>

                        <Badge className={`${typeBadge} border-0`}>
                          {kindLabel}
                        </Badge>

                        {kind === 'REQUEST' ? (
                          <Badge className="bg-blue-100 text-blue-700 border-0">
                            Buyer New Proposal
                          </Badge>
                        ) : null}

                        <Badge className={`${getStatusColor(item.__status)} border-0`}>
                          {String(item.__status || '').replaceAll('_', ' ')}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>{formatDate(item.__createdAt)}</span>
                        </div>

                        <div className="flex items-center gap-1">
                          <span className="font-medium text-gray-700">Vendor:</span>
                          <span>{item.__vendorName}</span>
                        </div>

                        {(item?.vendors?.email || item?.vendors?.phone) ? (
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-gray-700">Contact:</span>
                            <span>
                              {[item?.vendors?.email, item?.vendors?.phone].filter(Boolean).join(' | ')}
                            </span>
                          </div>
                        ) : null}

                        {item.__qtyText ? (
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-gray-700">Qty:</span>
                            <span>{item.__qtyText}</span>
                          </div>
                        ) : null}

                        {item.__budgetText ? (
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-gray-700">Budget:</span>
                            <span>{item.__budgetText}</span>
                          </div>
                        ) : null}
                      </div>

                      {/* ✅ Show relation: “This quotation is reply to your enquiry” */}
                      {kind === 'QUOTATION' && item.__replyTo ? (
                        <div className="text-xs text-gray-600 flex items-center gap-2">
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                          <span>
                            Reply to your enquiry: <span className="font-medium">{item.__replyTo.__title}</span>
                          </span>
                        </div>
                      ) : null}

                      {/* small note */}
                      {item.__sourceNote ? (
                        <p className="text-xs text-gray-500">{item.__sourceNote}</p>
                      ) : null}

                      {item.description ? (
                        <p className="text-sm text-gray-600 line-clamp-2">{item.description}</p>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-3">
                      {actionRight}
                      <Button variant="ghost" size="sm" className="text-gray-500" disabled>
                        Details
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Proposals;
