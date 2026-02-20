import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { buyerApi } from '@/modules/buyer/services/buyerApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Calendar, IndianRupee, Package, Mail, Phone, Building2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const normalizeUpper = (v) => String(v || '').toUpperCase().trim();

const formatDate = (iso) => {
  try {
    return iso ? new Date(iso).toLocaleString() : '—';
  } catch {
    return '—';
  }
};

const safeINR = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toLocaleString('en-IN');
};

// ✅ Vendor quotation vs Buyer request detect
const classify = (p) => {
  const hasRequiredBy = p?.required_by_date !== null && p?.required_by_date !== undefined;
  const hasBuyerEmail = !!p?.buyer_email;

  if (hasRequiredBy) {
    return { kind: 'REQUEST', kindLabel: 'Request Sent', status: normalizeUpper(p?.status || 'SENT') };
  }

  if (hasBuyerEmail) {
    // vendor ne buyer ko quotation bheja
    return { kind: 'QUOTATION', kindLabel: 'Quotation Received', status: 'RECEIVED' };
  }

  return { kind: 'REQUEST', kindLabel: 'Request Sent', status: normalizeUpper(p?.status || 'SENT') };
};

const badgeForKind = (kind) => {
  if (kind === 'QUOTATION') return 'bg-amber-100 text-amber-800';
  if (kind === 'REQUEST') return 'bg-indigo-100 text-indigo-700';
  return 'bg-gray-100 text-gray-700';
};

const badgeForStatus = (status) => {
  const s = normalizeUpper(status);
  if (s === 'RECEIVED') return 'bg-green-100 text-green-700';
  if (s === 'SENT' || s === 'AVAILABLE') return 'bg-blue-100 text-blue-700';
  if (s === 'IN_PROGRESS') return 'bg-amber-100 text-amber-700';
  if (s === 'COMPLETED') return 'bg-green-100 text-green-700';
  if (s === 'CANCELLED' || s === 'REJECTED') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-700';
};

const ProposalDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [proposal, setProposal] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const detail = await buyerApi.getProposalDetail(id);
        setProposal(detail);
        setMessages(detail?.messages || []);
      } catch (e) {
        console.error(e);
        toast({
          title: 'Not found',
          description: 'Ye quotation/proposal detail nahi mila. (Wrong ID or deleted)',
          variant: 'destructive',
        });
        navigate('/buyer/proposals');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, navigate]);

  const view = useMemo(() => {
    if (!proposal) return null;

    const cls = classify(proposal);

    const title = proposal?.title || proposal?.product_name || 'Proposal';
    const budgetPretty = safeINR(proposal?.budget);
    const qtyText = proposal?.quantity ? String(proposal.quantity) : null;

    const vendor = proposal?.vendors || {};
    const vendorName = vendor?.company_name || 'Vendor';
    const vendorEmail = vendor?.email || null;
    const vendorPhone = vendor?.phone || null;

    return {
      cls,
      title,
      budgetText: budgetPretty ? `₹${budgetPretty}` : (proposal?.budget ? `₹${proposal.budget}` : '—'),
      qtyText: qtyText || '—',
      createdAt: formatDate(proposal?.created_at),
      requiredBy: proposal?.required_by_date ? formatDate(proposal.required_by_date) : null,
      desc: proposal?.description || '—',
      vendorName,
      vendorEmail,
      vendorPhone,
    };
  }, [proposal]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-14">
        <Loader2 className="h-7 w-7 animate-spin text-[#003D82]" />
      </div>
    );
  }

  if (!proposal || !view) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate('/buyer/proposals')}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-2xl text-[#003D82]">{view.title}</CardTitle>

              <Badge className={`${badgeForKind(view.cls.kind)} border-0`}>
                {view.cls.kindLabel}
              </Badge>

              <Badge className={`${badgeForStatus(view.cls.status)} border-0`}>
                {view.cls.status}
              </Badge>
            </div>

            <div className="text-sm text-gray-600 flex flex-wrap gap-4">
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Created: {view.createdAt}
              </span>

              {view.requiredBy ? (
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Required By: {view.requiredBy}
                </span>
              ) : null}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border bg-gray-50 p-4">
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <Package className="h-4 w-4" /> Quantity
              </div>
              <div className="mt-1 font-semibold text-gray-900">{view.qtyText}</div>
            </div>

            <div className="rounded-lg border bg-gray-50 p-4">
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <IndianRupee className="h-4 w-4" /> Amount / Budget
              </div>
              <div className="mt-1 font-semibold text-gray-900">{view.budgetText}</div>
            </div>
          </div>

          <div className="rounded-lg border bg-white p-4">
            <div className="text-xs text-gray-500 mb-1">Description / Terms</div>
            <div className="text-gray-800 whitespace-pre-line">{view.desc}</div>
          </div>

          <div className="rounded-lg border bg-green-50 p-4">
            <div className="flex items-center gap-2 text-green-900 font-semibold">
              <Building2 className="h-5 w-5" />
              {view.vendorName}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {view.vendorPhone ? (
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => (window.location.href = `tel:${view.vendorPhone}`)}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Call
                </Button>
              ) : null}

              {view.vendorEmail ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-green-600 text-green-700 hover:bg-green-100"
                  onClick={() => (window.location.href = `mailto:${view.vendorEmail}`)}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Email
                </Button>
              ) : null}
            </div>
          </div>

          {messages?.length ? (
            <div className="rounded-lg border bg-white p-4">
              <div className="font-semibold text-gray-900 mb-2">Messages</div>
              <div className="space-y-2">
                {messages.map((m) => (
                  <div key={m.id} className="text-sm border rounded-md p-3 bg-gray-50">
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span>{formatDate(m.created_at)}</span>
                      {m?.is_edited ? <span>edited</span> : null}
                    </div>
                    <div className="text-gray-800 mt-1 whitespace-pre-line">{m.message}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProposalDetail;
