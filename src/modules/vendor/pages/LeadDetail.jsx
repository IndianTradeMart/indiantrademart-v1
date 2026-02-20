import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { leadApi } from '@/modules/lead/services/leadApi';
import { leadsMarketplaceApi } from '@/modules/vendor/services/leadsMarketplaceApi';
import { leadPaymentApi } from '@/modules/vendor/services/leadPaymentApi';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  MapPin,
  Calendar,
  Phone,
  Mail,
  User,
  ArrowLeft,
  Lock,
  ShoppingCart,
  FileText,
  Package,
  IndianRupee,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const safeDate = (v) => {
  try {
    const d = v ? new Date(v) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  } catch {
    return null;
  }
};

const formatDateTime = (d) => {
  if (!d) return '-';
  try {
    return d.toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d.toLocaleDateString();
  }
};

const formatINR = (v) => {
  const n = Number(String(v || '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toLocaleString('en-IN');
};


// Combine images from product_images table + products.images jsonb
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
      if (typeof it === 'string' && it.trim()) urls.push(it.trim());
      else if (it && typeof it === 'object') {
        if (typeof it.url === 'string' && it.url.trim()) urls.push(it.url.trim());
        else if (typeof it.image_url === 'string' && it.image_url.trim()) urls.push(it.image_url.trim());
        else if (typeof it.path === 'string' && it.path.trim()) urls.push(it.path.trim());
      }
    });
  }

  return Array.from(new Set(urls));
};

// quantity is text in DB ("100 units" / "100" / "100 kg")
const parseQtyUnit = (lead) => {
  const raw =
    lead?.quantity ||
    lead?.qty ||
    lead?.min_order_qty ||
    lead?.minOrderQty ||
    '';

  const rawStr = String(raw || '').trim();
  const explicitUnit =
    lead?.unit ||
    lead?.qty_unit ||
    lead?.qtyUnit ||
    lead?.price_unit ||
    lead?.priceUnit ||
    '';

  if (!rawStr && !explicitUnit) return { qty: null, unit: null };

  // If rawStr like "100 units" or "100 kg"
  const parts = rawStr.split(' ').filter(Boolean);
  const first = parts[0];
  const maybeNum = Number(String(first).replace(/[^\d.]/g, ''));

  if (Number.isFinite(maybeNum) && parts.length > 1) {
    return { qty: String(maybeNum), unit: parts.slice(1).join(' ') };
  }

  // If rawStr is only number and unit separate
  if (Number.isFinite(maybeNum)) {
    return { qty: String(maybeNum), unit: explicitUnit ? String(explicitUnit) : null };
  }

  // If rawStr is not numeric (ex: "Not specified")
  return { qty: rawStr || null, unit: explicitUnit ? String(explicitUnit) : null };
};

const getDescription = (lead) => {
  return (
    lead?.message ||
    lead?.description ||
    lead?.details ||
    lead?.requirement_details ||
    ''
  );
};

const getBuyer = (lead) => {
  const name =
    lead?.buyer_name ||
    lead?.buyerName ||
    lead?.client_name ||
    lead?.clientName ||
    lead?.name ||
    null;

  const phone =
    lead?.buyer_phone ||
    lead?.buyerPhone ||
    lead?.phone ||
    null;

  const email =
    lead?.buyer_email ||
    lead?.buyerEmail ||
    lead?.email ||
    null;

  return { name, phone, email };
};

const LeadDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [isPurchased, setIsPurchased] = useState(false);
  const [contactStats, setContactStats] = useState({ total: 0, calls: 0, emails: 0, whatsapp: 0 });

  const loadLead = async () => {
    setLoading(true);
    try {
      // Get current vendor ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Not authenticated', variant: 'destructive' });
        navigate('/vendor/leads');
        return;
      }

      const { data: vendor, error: vendorErr } = await supabase
        .from('vendors')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      let vendorId = vendor?.id || null;

      if (!vendorId) {
        const { data: vendorRows, error: vendorRowsErr } = await supabase
          .from('vendors')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);
        if (vendorRowsErr) throw vendorRowsErr;
        vendorId = vendorRows?.[0]?.id || null;
      }

      if (!vendorId) {
        if (vendorErr) {
          console.warn('Vendor lookup warning:', vendorErr?.message || vendorErr);
        }
        toast({ title: 'Vendor profile not found', variant: 'destructive' });
        navigate('/vendor/leads');
        return;
      }

      // Load the lead from database
      const leadData = await leadApi.get(id);
      if (!leadData) {
        toast({ title: 'Lead not found', variant: 'destructive' });
        navigate('/vendor/leads');
        return;
      }

      // Determine source based on vendor_id and purchase status
      let isPurchasedFlag = false;
      let source = 'Marketplace';
      let purchaseDate = null;

      // If current vendor is the creator, it's Direct
      if (leadData.vendor_id === vendorId) {
        source = 'Direct';
        purchaseDate = leadData.created_at;
      } else {
        // Check if vendor purchased this lead
        const purchased = await leadApi.purchases.list(vendorId);
        const purchasedLead = purchased.find(p => p.lead_id === id);
        if (purchasedLead) {
          source = 'Purchased';
          isPurchasedFlag = true;
          purchaseDate = purchasedLead.purchase_date;
        }
      }

      // Optional: fetch product cover image (for direct/purchased lead view)
      let __productCover = null;
      try {
        const pid = leadData?.product_id || leadData?.productId || leadData?.product?.id || null;
        if (pid) {
          const { data: p } = await supabase
            .from('products')
            .select('id, images, product_images(image_url)')
            .eq('id', pid)
            .single();
          const urls = p ? getProductImageUrls(p) : [];
          __productCover = urls && urls.length ? urls[0] : null;
        }
      } catch {
        // ignore cover fetch errors
      }

      setLead({
        ...leadData,
        __source: source,
        __purchaseDate: purchaseDate,
        __productCover,
      });
      setIsPurchased(isPurchasedFlag);

      // contact stats
      try {
        const contacts = await leadsMarketplaceApi.getContactHistory(id);
        const calls = contacts.filter((c) => c.contact_type === 'CALL').length;
        const emails = contacts.filter((c) => c.contact_type === 'EMAIL').length;
        const whatsapp = contacts.filter((c) => c.contact_type === 'WHATSAPP').length;
        setContactStats({ total: contacts.length, calls, emails, whatsapp });
      } catch (e) {
        console.error('contact history load failed', e);
      }
    } catch (err) {
      console.error(err);
      toast({
        title: 'Failed to load lead detail',
        description: err?.message || 'Something went wrong',
        variant: 'destructive',
      });
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const meta = useMemo(() => {
    const createdAt = safeDate(lead?.created_at || lead?.createdAt);
    const postedOn = formatDateTime(createdAt);

    const title =
      lead?.title ||
      lead?.product_name ||
      lead?.productName ||
      'Untitled Lead';

    const product =
      lead?.product_name ||
      lead?.productName ||
      lead?.product_interest ||
      lead?.productInterest ||
      null;

    const category =
      lead?.category ||
      lead?.category_name ||
      lead?.categoryName ||
      null;

    const location =
      lead?.location ||
      [lead?.city, lead?.state].filter(Boolean).join(', ') ||
      'India';

    const qtyUnit = parseQtyUnit(lead);
    const budgetPretty = formatINR(lead?.budget) || (lead?.budget ? String(lead.budget) : null);

    const desc = getDescription(lead);
    const buyer = getBuyer(lead);

    return { postedOn, title, product, category, location, qtyUnit, budgetPretty, desc, buyer };
  }, [lead]);

  const handlePurchase = async () => {
    if (!lead?.id) return;
    setPurchasing(true);
    try {
      await leadPaymentApi.purchaseLead(lead);
      toast({ title: 'Lead Purchased Successfully!', description: 'Contact details are now visible.' });
      setIsPurchased(true);
      await loadLead();
    } catch (error) {
      toast({
        title: 'Purchase Failed',
        description: error?.message || 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setPurchasing(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading details...</div>;
  if (!lead) return null;

  const leadPriceValue = Number(lead?.price);
  const price = Number.isFinite(leadPriceValue) && leadPriceValue > 0 ? leadPriceValue : 50;
  const isDirect = String(lead?.__source || '').toLowerCase() === 'direct';
  const purchasedAt = isPurchased ? safeDate(lead?.__purchaseDate) : null;
  const purchasedAtLabel = purchasedAt ? formatDateTime(purchasedAt) : null;

  const logContactSafe = async (type) => {
    try {
      await leadsMarketplaceApi.logContact(lead.id, type);
      try {
        const contacts = await leadsMarketplaceApi.getContactHistory(lead.id);
        const calls = contacts.filter((c) => c.contact_type === 'CALL').length;
        const emails = contacts.filter((c) => c.contact_type === 'EMAIL').length;
        const whatsapp = contacts.filter((c) => c.contact_type === 'WHATSAPP').length;
        setContactStats({ total: contacts.length, calls, emails, whatsapp });
      } catch (e) {
        console.error('contact history refresh failed', e);
      }
      return true;
    } catch (err) {
      console.error(err);
      toast({
        title: 'Contact limit',
        description: err?.message || 'Unable to log contact. Please try later.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const handleSendEmail = async () => {
    const ok = await logContactSafe('EMAIL');
    if (!ok) return;
    // Open vendor quotation/proposal page with prefilled fields
    const prefill = {
      // This is the selected "buyer" item on SendQuotation page (it is actually lead id)
      buyer_id: lead?.id || '',
      buyer_email: meta?.buyer?.email || '',

      lead_ref: String(lead?.id || '').slice(0, 8),

      // Prefill product/title + budget
      product_name: meta?.product || meta?.title || '',
      quotation_title: meta?.product || meta?.title || '',
      quotation_amount: lead?.budget ? String(lead.budget) : '',

      // Optional: quantity/unit if available
      quantity: meta?.qtyUnit?.qty || '',
      unit: (meta?.qtyUnit?.unit || '').toLowerCase() || 'pieces',

      // Helpful context for vendor (vendor can edit)
      terms_conditions: meta?.desc
        ? `Requirement: ${meta.desc}\n\nLocation: ${meta.location || 'India'}\nLead Ref: #${String(lead?.id || '').slice(0, 8)}`
        : '',
    };

    if (!prefill.buyer_email) {
      toast({
        title: 'Buyer email missing',
        description: 'Email field blank hai. Quotation page par buyer email fill karke send kar dijiye.',
        variant: 'destructive',
      });
    }

    navigate('/vendor/proposals/send', { state: { prefill } });
  };

  const handleCallNow = async () => {
    const ok = await logContactSafe('CALL');
    if (!ok) return;
    if (meta?.buyer?.phone) {
      window.location.href = `tel:${meta.buyer.phone}`;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button
        variant="ghost"
        onClick={() => navigate('/vendor/leads')}
        className="pl-0 hover:pl-2 transition-all"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Leads
      </Button>

      {/* Header Card */}
      <Card className="border bg-white">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2 mb-2">
                {meta.category ? <Badge variant="outline">{meta.category}</Badge> : <Badge variant="outline">General</Badge>}
                {meta.product ? <Badge variant="secondary">{meta.product}</Badge> : null}
                <Badge variant={isPurchased ? 'success' : lead?.__source === 'Direct' ? 'secondary' : 'outline'}>
                  {lead?.__source || (isPurchased ? 'Purchased' : 'Fresh Lead')}
                </Badge>
              </div>

              <div className="flex items-center gap-3">
                {lead?.__productCover ? (
                  <div className="h-16 w-16 shrink-0 rounded-md overflow-hidden border bg-white">
                    <img
                      src={lead.__productCover}
                      alt="product"
                      className="h-full w-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                ) : null}

                <CardTitle className="text-2xl text-[#003D82] truncate">
                  {meta.title}
                </CardTitle>
              </div>

              <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> {meta.location}
                </span>
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Posted: {meta.postedOn}
                </span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs text-gray-500">Lead ID</div>
              <div className="font-mono font-semibold text-gray-900">#{String(lead.id || '').slice(0, 8)}</div>

              {!isPurchased && !isDirect && (
                <div className="mt-3">
                  <div className="text-xs text-gray-500">Price</div>
                  <div className="text-2xl font-bold text-gray-900">₹{price.toLocaleString('en-IN')}</div>

                  <Button
                    className="mt-2 bg-[#00A699] hover:bg-[#00857A]"
                    onClick={handlePurchase}
                    disabled={purchasing}
                  >
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    {purchasing ? 'Processing...' : 'Buy & Unlock'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Summary Row */}
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border bg-gray-50 p-4">
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <Package className="h-4 w-4" /> Quantity
              </div>
              <div className="mt-1 font-semibold text-gray-900">
                {meta.qtyUnit.qty ? (
                  <>
                    {meta.qtyUnit.qty}{meta.qtyUnit.unit ? ` ${meta.qtyUnit.unit}` : ''}
                  </>
                ) : (
                  'Not specified'
                )}
              </div>
            </div>

            <div className="rounded-lg border bg-gray-50 p-4">
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <IndianRupee className="h-4 w-4" /> Budget
              </div>
              <div className="mt-1 font-semibold text-gray-900">
                {meta.budgetPretty ? `₹${meta.budgetPretty}` : (lead?.budget ? String(lead.budget) : 'Negotiable')}
              </div>
            </div>

            <div className="rounded-lg border bg-gray-50 p-4">
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <FileText className="h-4 w-4" /> Lead Type
              </div>
              <div className="mt-1 font-semibold text-gray-900">
                {lead?.status ? String(lead.status).toUpperCase() : 'AVAILABLE'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requirement Details */}
      <Card className="border bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Requirement Details</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-700 leading-relaxed whitespace-pre-line">
            {meta.desc?.trim()
              ? meta.desc.trim()
              : 'No description provided by buyer.'}
          </p>
        </CardContent>
      </Card>

      {/* Buyer Information */}
      <Card className="border bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Buyer Information</CardTitle>
        </CardHeader>
        <CardContent>
          {isPurchased || lead?.__source === 'Direct' ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-green-700" />
                <div>
                  <div className="text-xs text-green-700">Buyer Name</div>
                  <div className="font-semibold text-green-900">
                    {meta.buyer.name || 'Buyer'}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex items-center gap-3 flex-1">
                  <Phone className="h-5 w-5 text-green-700" />
                  <div>
                    <div className="text-xs text-green-700">Phone</div>
                    <div className="font-semibold text-green-900">
                      {meta.buyer.phone || 'N/A'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-1">
                  <Mail className="h-5 w-5 text-green-700" />
                  <div>
                    <div className="text-xs text-green-700">Email</div>
                    <div className="font-semibold text-green-900">
                      {meta.buyer.email || 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {isPurchased && purchasedAtLabel ? (
                <div className="rounded-md border border-green-200 bg-white px-3 py-2 text-xs font-medium text-green-800">
                  Purchased on {purchasedAtLabel}
                </div>
              ) : null}

              <div className="pt-3 border-t border-green-200 flex flex-wrap gap-2">
                {meta.buyer.phone ? (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={handleCallNow}
                  >
                    Call Now
                  </Button>
                ) : null}

                <Button
                  size="sm"
                  variant="outline"
                  className="border-green-600 text-green-700 hover:bg-green-100"
                  onClick={handleSendEmail}
                >
                  Send Email
                </Button>

                {contactStats.total > 0 && (
                  <div className="text-xs text-green-700 font-semibold ml-auto flex items-center gap-1">
                    Contacted: {contactStats.total}
                    <span className="text-[11px] text-green-600">
                      (Calls {contactStats.calls} | Emails {contactStats.emails} | WhatsApp {contactStats.whatsapp})
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                <Lock className="h-6 w-6 text-gray-500" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Contact details are locked</p>
                <p className="text-sm text-gray-500">Purchase this lead to view buyer phone number and email.</p>
              </div>
              <div className="flex items-center justify-center gap-4">
                <div className="text-left">
                  <p className="text-xs text-gray-500">Price</p>
                  <p className="text-2xl font-bold text-[#003D82]">₹{price.toLocaleString('en-IN')}</p>
                </div>
                <Button
                  size="lg"
                  className="bg-[#00A699] hover:bg-[#00857A]"
                  onClick={handlePurchase}
                  disabled={purchasing}
                >
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  {purchasing ? 'Processing...' : 'Unlock Contact Details'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LeadDetail;
