import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { directoryApi } from '@/modules/directory/api/directoryApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  MapPin,
  CheckCircle,
  Phone,
  Mail,
  FileText,
  PlayCircle,
  MessageCircle,
  Facebook,
  Linkedin,
  Twitter,
  Link as LinkIcon,
  Check,
} from 'lucide-react';
import { shareUtils } from '@/shared/utils/shareUtils';
import { phoneUtils } from '@/shared/utils/phoneUtils';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';

const ProductDetail = () => {
  const { productSlug } = useParams();
  const navigate = useNavigate();
  const { user, userRole, vendorId: currentVendorId } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [isDraft, setIsDraft] = useState(false);
  const [copied, setCopied] = useState(false);

  // Enquiry modal
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [sendingEnquiry, setSendingEnquiry] = useState(false);
  const [enquiry, setEnquiry] = useState({
    quantity: '',
    unit: 'pieces',
    budget: '',
    requirement: '',
  });

  const unitOptions = useMemo(
    () => [
      { value: 'pieces', label: 'Pieces' },
      { value: 'kg', label: 'Kg' },
      { value: 'gram', label: 'Gram' },
      { value: 'ton', label: 'Ton' },
      { value: 'liter', label: 'Liter' },
      { value: 'meter', label: 'Meter' },
      { value: 'feet', label: 'Feet' },
      { value: 'sqft', label: 'Sq Ft' },
      { value: 'sqm', label: 'Sq M' },
      { value: 'hours', label: 'Hours' },
      { value: 'days', label: 'Days' },
      { value: 'service', label: 'Service' },
      { value: 'lot', label: 'Lot' },
    ],
    []
  );

  // ✅ Helpers to partially mask contact info (SEO/Privacy friendly)
  const maskEmail = (email) => {
    const e = String(email || '').trim();
    if (!e.includes('@')) return e;

    const [local, domain] = e.split('@');
    const safeLocal = local || '';
    const safeDomain = domain || '';

    const maskPart = (part) => {
      const p = String(part || '');
      if (p.length <= 2) return p[0] ? `${p[0]}*` : '*';
      return `${p[0]}${'*'.repeat(Math.min(6, p.length - 2))}${p[p.length - 1]}`;
    };

    const domainParts = safeDomain.split('.');
    const d0 = domainParts[0] || '';
    const rest = domainParts.slice(1).join('.') || '';
    return `${maskPart(safeLocal)}@${maskPart(d0)}${rest ? `.${rest}` : ''}`;
  };

  const parseBudgetNumber = (rawValue) => {
    const raw = String(rawValue || '').trim().toLowerCase();
    if (!raw) return null;

    const compact = raw.replace(/[^0-9a-z.]/g, '');
    let multiplier = 1;
    let numericPart = compact;

    if (compact.endsWith('crore')) {
      multiplier = 10000000;
      numericPart = compact.slice(0, -5);
    } else if (compact.endsWith('cr')) {
      multiplier = 10000000;
      numericPart = compact.slice(0, -2);
    } else if (compact.endsWith('lakh')) {
      multiplier = 100000;
      numericPart = compact.slice(0, -4);
    } else if (compact.endsWith('lac')) {
      multiplier = 100000;
      numericPart = compact.slice(0, -3);
    } else if (compact.endsWith('lk')) {
      multiplier = 100000;
      numericPart = compact.slice(0, -2);
    } else if (compact.endsWith('k')) {
      multiplier = 1000;
      numericPart = compact.slice(0, -1);
    }

    const numeric = Number(numericPart);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return numeric * multiplier;
  };

  const handleCopyLink = async () => {
    const url = shareUtils.getCurrentUrl();
    const success = await shareUtils.copyToClipboard(url);
    if (success) {
      setCopied(true);
      toast({ title: 'Link copied to clipboard!', description: 'Share the link with anyone' });
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast({ title: 'Failed to copy', description: 'Please try again', variant: 'destructive' });
    }
  };

  const openEnquiryModal = () => {
    // Check if user is logged in
    if (!user) {
      toast({
        title: 'Please Login',
        description: 'You need to login as a buyer to send enquiry',
        variant: 'destructive',
      });
      navigate('/buyer/login');
      return;
    }

    // Check if user is a buyer
    const role = String(userRole || user?.role || '').toUpperCase();
    if (role !== 'BUYER') {
      toast({
        title: 'Buyer Account Required',
        description: 'Only buyers can send enquiries',
        variant: 'destructive',
      });
      return;
    }

    // Reset form every time modal opens
    setEnquiry({ quantity: '', unit: 'pieces', budget: '', requirement: '' });
    setEnquiryOpen(true);
  };

  const handleSubmitEnquiry = async () => {
    if (!data?.vendors?.id) {
      toast({ title: 'Vendor not found', description: 'Please try again later', variant: 'destructive' });
      return;
    }

    const requirement = String(enquiry.requirement || '').trim();
    if (requirement.length < 10) {
      toast({
        title: 'Add requirement details',
        description: 'Please write at least 10 characters in requirement/description.',
        variant: 'destructive',
      });
      return;
    }

    const qtyRaw = String(enquiry.quantity || '').trim();
    const budgetRaw = String(enquiry.budget || '').trim();

    const safeQty = qtyRaw ? qtyRaw.replace(/[\n\r\t]/g, ' ').slice(0, 50) : null;
    const safeBudget = parseBudgetNumber(budgetRaw);
    const qtyWithUnit = safeQty ? `${safeQty} ${enquiry.unit || 'pieces'}`.trim() : null;

    const buyerEmail = user?.email || '';
    const buyerName =
      user?.user_metadata?.company_name ||
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      (buyerEmail ? buyerEmail.split('@')[0] : 'Buyer');
    const buyerPhone =
      user?.user_metadata?.phone ||
      user?.user_metadata?.mobile ||
      '';
    const buyerCompany = user?.user_metadata?.company_name || '';

    setSendingEnquiry(true);
    try {
      const payload = {
        title: data.name,
        product_name: data.name,
        product_interest: data.name,
        buyer_name: buyerName,
        buyer_email: buyerEmail,
        buyer_phone: buyerPhone,
        company_name: buyerCompany,
        description: requirement,
        message: requirement,
        quantity: qtyWithUnit,
        budget: safeBudget,
        category: data.micro_categories?.name || 'General',
        category_slug: data.micro_categories?.slug || '',
        location: data.vendors?.city ? `${data.vendors.city}, ${data.vendors.state || ''}`.trim() : null,
      };

      const response = await fetchWithCsrf(apiUrl(`/api/vendors/${data.vendors.id}/leads`), {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const responseJson = await response.json().catch(() => null);
      if (!response.ok || !responseJson?.success) {
        throw new Error(responseJson?.error || 'Failed to send enquiry');
      }

      toast({ title: 'Enquiry Sent', description: 'Your enquiry has been submitted to the vendor' });
      setEnquiryOpen(false);
      navigate(`/directory/vendor/${data.vendors.id}`);
    } catch (error) {
      console.error('Error creating lead:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to send enquiry',
        variant: 'destructive',
      });
    } finally {
      setSendingEnquiry(false);
    }
  };

  const handleCompanyClick = () => {
    if (data?.vendors?.id) {
      navigate(`/directory/vendor/${data.vendors.id}`);
    }
  };

  const hydrateProduct = async (product) => {
    if (!product) return null;
    if (product.micro_category_id) {
      const { data: catData } = await supabase
        .from('micro_categories')
        .select(
          `
          id, name, slug,
          sub_categories (
            id, name, slug,
            head_categories (id, name, slug)
          )
        `
        )
        .eq('id', product.micro_category_id)
        .single();
      if (catData) {
        product.micro_categories = catData;

        let metaRes = await supabase
          .from('micro_category_meta')
          .select('meta_tags, description')
          .eq('micro_categories', product.micro_category_id)
          .maybeSingle();
        if (metaRes.error && (metaRes.error.code === '42703' || /column .* does not exist/i.test(metaRes.error.message || ''))) {
          metaRes = await supabase
            .from('micro_category_meta')
            .select('meta_tags, description')
            .eq('micro_category_id', product.micro_category_id)
            .maybeSingle();
        }
        if (metaRes.data) {
          product.meta_tags = metaRes.data.meta_tags;
          product.meta_description = metaRes.data.description;
        }
      }
    }
    return product;
  };

  useEffect(() => {
    const load = async () => {
      try {
        let product = null;

        try {
          product = await directoryApi.getProductDetailBySlug(productSlug);
        } catch (slugError) {
          console.warn('Slug lookup failed:', slugError);
        }

        // If not found (often due to vendor inactive), allow vendor owner to view
        if (!product && userRole === 'VENDOR' && currentVendorId) {
          const { data: raw } = await supabase
            .from('products')
            .select('*, vendors(*)')
            .eq('slug', productSlug)
            .maybeSingle();

          if (raw && raw.vendor_id === currentVendorId) {
            product = await hydrateProduct(raw);
          }
        }

        // Fallback: try loading by ID (in case slug is actually an ID)
        if (!product) {
          const { data: rawById } = await supabase
            .from('products')
            .select('*, vendors(*)')
            .eq('id', productSlug)
            .maybeSingle();
          product = await hydrateProduct(rawById);
        }

        if (product) {
          setData(product);
          if (product?.status === 'DRAFT') {
            setIsDraft(true);
          }
        } else {
          console.error('Product not found by slug or ID');
        }
      } catch (e) {
        console.error('Product load failed:', e);
      } finally {
        setLoading(false);
      }
    };
    if (productSlug) load();
  }, [productSlug, userRole, currentVendorId]);

  if (loading)
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin w-8 h-8 text-blue-600" />
      </div>
    );
  if (!data) return <div className="p-10 text-center">Product not found</div>;

  const { vendors: vendor, micro_categories: cat } = data;
  const images = data.images || [];
  const categoryPathParts = (() => {
    if (cat?.sub_categories || cat?.name) {
      const headName = cat?.sub_categories?.head_categories?.name || '';
      const subName = cat?.sub_categories?.name || '';
      const microName = cat?.name || '';
      return [headName, subName, microName].filter(Boolean);
    }
    const rawPath = data.category_path || data.category_other || data.category || '';
    return rawPath
      .split('>')
      .map((part) => part.trim())
      .filter(Boolean);
  })();
  const categoryLabel =
    categoryPathParts.length > 0 ? categoryPathParts.join(' › ') : 'Uncategorized';

  // Build SEO meta tags
  let seoMetaTags = null;
  try {
    let extraCategories = [];
    if (data.extra_micro_categories) {
      if (typeof data.extra_micro_categories === 'string') {
        extraCategories = JSON.parse(data.extra_micro_categories);
      } else if (Array.isArray(data.extra_micro_categories)) {
        extraCategories = data.extra_micro_categories;
      }
    }

    const extraCatNames = extraCategories?.map((c) => c?.name).filter(Boolean).join(', ') || '';
    const extraMetaTags = extraCategories?.map((c) => c?.meta_tags).filter(Boolean) || [];
    const extraDescriptions = extraCategories?.map((c) => c?.description).filter(Boolean) || [];
    const categoryPath =
      [cat?.sub_categories?.head_categories?.name, cat?.sub_categories?.name, cat?.name]
        .filter(Boolean)
        .join(' - ') ||
      (data.category_path || data.category_other || data.category || '');

    // Priority: primary micro category meta_tags > custom meta_tags > generated title
    const seoTitle =
      data.primary_meta_tags ||
      `${data.name} | ${categoryPath}${extraCatNames ? ' | ' + extraCatNames : ''} | IndianTradeMart`;

    // Priority: primary micro category description > extra category descriptions > product description
    let seoDescription = data.primary_meta_description;
    if (!seoDescription && extraDescriptions.length > 0) {
      seoDescription = extraDescriptions[0]?.replace(/<[^>]*>/g, '').substring(0, 160);
    }
    if (!seoDescription) {
      seoDescription = data.description?.replace(/<[^>]*>/g, '').substring(0, 160) || data.name;
    }

    // Build comprehensive keywords: primary meta + extra meta tags + category names
    const allKeywords = [
      data.primary_meta_tags,
      data.name,
      cat?.name,
      cat?.sub_categories?.name,
      vendor?.company_name,
      ...extraCatNames.split(',').map((n) => n.trim()),
      ...extraMetaTags,
    ]
      .filter(Boolean)
      .join(', ');

    seoMetaTags = (
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDescription} />
        <meta name="keywords" content={allKeywords} />
        <meta property="og:title" content={seoTitle} />
        <meta property="og:description" content={seoDescription} />
        {images[0] && <meta property="og:image" content={images[0]} />}
        <meta property="og:url" content={shareUtils.getCurrentUrl()} />
      </Helmet>
    );
  } catch (error) {
    console.warn('Error building SEO tags:', error);
    seoMetaTags = (
      <Helmet>
        <title>{`${data.name} | IndianTradeMart`}</title>
        <meta
          name="description"
          content={data.description?.replace(/<[^>]*>/g, '').substring(0, 160) || data.name}
        />
        <meta property="og:url" content={shareUtils.getCurrentUrl()} />
      </Helmet>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {seoMetaTags}

      {/* Enquiry Modal */}
      <Dialog open={enquiryOpen} onOpenChange={(v) => !sendingEnquiry && setEnquiryOpen(v)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Send Enquiry</DialogTitle>
            <DialogDescription>
              Fill your requirement details. This helps the supplier respond faster.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="qty">Quantity</Label>
              <Input
                id="qty"
                placeholder="e.g. 10"
                value={enquiry.quantity}
                onChange={(e) => setEnquiry((p) => ({ ...p, quantity: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Unit</Label>
              <Select
                value={enquiry.unit}
                onValueChange={(v) => setEnquiry((p) => ({ ...p, unit: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {unitOptions.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="budget">Budget</Label>
              <Input
                id="budget"
                placeholder="e.g. ₹50,000 or 50k"
                value={enquiry.budget}
                onChange={(e) => setEnquiry((p) => ({ ...p, budget: e.target.value }))}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="req">Requirement / Description</Label>
              <Textarea
                id="req"
                rows={5}
                placeholder="Write your requirement in detail... (quality, size, delivery location, timeline, etc.)"
                value={enquiry.requirement}
                onChange={(e) => setEnquiry((p) => ({ ...p, requirement: e.target.value }))}
              />
              <div className="text-xs text-slate-500">
                Product: <span className="font-medium">{data?.name}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEnquiryOpen(false)}
              disabled={sendingEnquiry}
            >
              Cancel
            </Button>
            <Button
              className="bg-[#003D82] hover:bg-blue-800"
              onClick={handleSubmitEnquiry}
              disabled={sendingEnquiry}
            >
              {sendingEnquiry ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Sending...
                </span>
              ) : (
                'Send'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isDraft && (
        <div className="bg-yellow-50 border-b border-yellow-200 py-3 px-4 mb-0 shadow-sm">
          <div className="container mx-auto text-sm text-yellow-800 flex items-center gap-2">
            <span className="font-semibold">⚠️ Draft Product:</span> This product is in draft status and not visible
            to other buyers.
          </div>
        </div>
      )}

      <div className="bg-white border-b py-3 px-4 mb-4 shadow-sm">
        <div className="container mx-auto text-sm text-gray-500 flex flex-wrap gap-1">
          <Link to="/directory">Directory</Link> {' › '}
          {cat ? (
            <>
              {cat.sub_categories?.head_categories?.name && (
                <>
                  <span>{cat.sub_categories?.head_categories?.name}</span> {' › '}
                </>
              )}
              {cat.sub_categories?.name && (
                <>
                  <span>{cat.sub_categories?.name}</span> {' › '}
                </>
              )}
              <Link
                to={`/directory/${cat.sub_categories?.head_categories?.slug}/${cat.sub_categories?.slug}/${cat.slug}`}
                className="text-blue-600 font-medium"
              >
                {cat.name}
              </Link>
            </>
          ) : (
            <span>{categoryLabel}</span>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-max">
        {/* Left: Gallery */}
        <div className="md:col-span-1 space-y-4">
          <div className="aspect-square bg-white rounded-lg border overflow-hidden flex items-center justify-center p-2 shadow-sm">
            {images[activeImage] ? (
              <img src={images[activeImage]} alt={data.name} className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="text-gray-300">No Image</div>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {images.map((img, i) => (
              <div
                key={i}
                onClick={() => setActiveImage(i)}
                className={`w-16 h-16 border rounded cursor-pointer shrink-0 overflow-hidden ${
                  activeImage === i ? 'ring-2 ring-blue-500' : 'opacity-70 hover:opacity-100'
                }`}
              >
                <img src={img} className="w-full h-full object-cover" alt="" />
              </div>
            ))}
          </div>
        </div>

        {/* Center: Info */}
        <div className="md:col-span-1 space-y-4">
          <div>
            <div className="flex justify-between items-start gap-4 mb-2">
              <h1 className="text-3xl font-bold text-slate-900">{data.name}</h1>
              {/* Share Buttons */}
              <div className="flex gap-1 flex-wrap justify-end">
                <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-green-50" asChild>
                  <a
                    href={shareUtils.getWhatsAppUrl(data.name, shareUtils.getCurrentUrl())}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Share on WhatsApp"
                  >
                    <MessageCircle className="w-4 h-4 text-green-600" />
                  </a>
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-blue-50" asChild>
                  <a
                    href={shareUtils.getFacebookUrl(shareUtils.getCurrentUrl())}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Share on Facebook"
                  >
                    <Facebook className="w-4 h-4 text-blue-600" />
                  </a>
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-blue-100" asChild>
                  <a
                    href={shareUtils.getLinkedInUrl(shareUtils.getCurrentUrl(), data.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Share on LinkedIn"
                  >
                    <Linkedin className="w-4 h-4 text-blue-700" />
                  </a>
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-sky-50" asChild>
                  <a
                    href={shareUtils.getTwitterUrl(data.name, shareUtils.getCurrentUrl())}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Share on Twitter"
                  >
                    <Twitter className="w-4 h-4 text-sky-500" />
                  </a>
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 hover:bg-gray-100"
                  onClick={handleCopyLink}
                  title="Copy link"
                >
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <LinkIcon className="w-4 h-4 text-gray-600" />}
                </Button>
              </div>
            </div>

            <div className="text-2xl font-bold text-[#003D82]">
              ₹{data.price}{' '}
              <span className="text-base font-normal text-slate-500">/ {data.price_unit}</span>
            </div>
            {data.min_order_qty && (
              <div className="text-sm text-gray-500 mt-1">
                Min Order: {data.min_order_qty} {data.qty_unit}
              </div>
            )}
          </div>

          <div
            className="prose prose-sm max-w-none text-slate-600 bg-white p-4 rounded border break-words whitespace-pre-wrap overflow-hidden"
            dangerouslySetInnerHTML={{ __html: data.description || 'No description available.' }}
          />

          {/* Specs */}
          {data.specifications && data.specifications.length > 0 && (
            <div className="bg-white rounded border p-4 shadow-sm">
              <h3 className="font-bold mb-3 text-sm uppercase text-gray-500 border-b pb-2">Product Specifications</h3>
              <div className="space-y-2 text-sm">
                {data.specifications.map((s, i) => (
                  <div key={i} className="flex justify-between pb-1 gap-2">
                    <span className="text-slate-500 break-words">{s.key}</span>
                    <span className="font-medium text-slate-900 break-words text-right">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            {data.pdf_url && (
              <a
                href={data.pdf_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-sm text-blue-600 border border-blue-200 px-3 py-2 rounded hover:bg-blue-50 bg-white shadow-sm"
              >
                <FileText className="w-4 h-4" /> Product Brochure
              </a>
            )}
            {data.video_url && (
              <a
                href={data.video_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-sm text-red-600 border border-red-200 px-3 py-2 rounded hover:bg-red-50 bg-white shadow-sm"
              >
                <PlayCircle className="w-4 h-4" /> Watch Video
              </a>
            )}
          </div>
        </div>

        {/* Right: Vendor Card */}
        <div className="md:col-span-1">
          <div className="bg-white rounded-xl shadow-lg border border-blue-100 p-6 sticky top-20 h-fit">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-16 h-16 rounded border bg-slate-50 flex items-center justify-center overflow-hidden">
                {vendor.profile_image ? (
                  <img src={vendor.profile_image} className="w-full h-full object-cover" alt={vendor.company_name} />
                ) : (
                  <span className="text-xl font-bold text-slate-300">{vendor.company_name?.[0]}</span>
                )}
              </div>
              <div>
                <h3
                  onClick={handleCompanyClick}
                  className="font-bold text-lg text-slate-900 leading-tight cursor-pointer hover:text-blue-600 transition-colors"
                >
                  {vendor.company_name}
                </h3>
                <div className="flex items-center gap-1 text-sm text-slate-500 mt-1">
                  <MapPin className="w-3 h-3" /> {vendor.city}, {vendor.state}
                </div>
                {vendor.verification_badge && (
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none mt-2 h-5 px-2">
                    <CheckCircle className="w-3 h-3 mr-1" /> Verified Supplier
                  </Badge>
                )}
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                  <Phone className="w-4 h-4" />
                </div>
                <span className="font-medium text-slate-900">{phoneUtils.maskPhone(vendor.phone)}</span>
              </div>

              {vendor.email && (
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                    <Mail className="w-4 h-4" />
                  </div>
                  <span className="font-medium text-slate-900">{maskEmail(vendor.email)}</span>
                </div>
              )}
            </div>

            <Button onClick={openEnquiryModal} className="w-full bg-[#003D82] h-12 text-lg mb-3 hover:bg-blue-800">
              Send Enquiry
            </Button>
            {/* ✅ Removed "View Phone Number" button (privacy + prevents scraping) */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;

