import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { vendorApi } from '@/modules/vendor/services/vendorApi';
import { quotationApi } from '@/modules/vendor/services/quotationApi';
import { useAuth } from '@/modules/vendor/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { Loader2, ArrowLeft, Paperclip, X } from 'lucide-react';

const MAX_PDF_BYTES = 2 * 1024 * 1024; // 2MB (keep Netlify/SMTP payload safe)

const formatBytes = (bytes = 0) => {
  try {
    const b = Number(bytes) || 0;
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  } catch {
    return '';
  }
};

const SendQuotation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [products, setProducts] = useState([]);
  const [buyers, setBuyers] = useState([]);

  const prefill = useMemo(() => location?.state?.prefill || null, [location]);

  // ✅ Optional PDF attachment (base64)
  const [pdfAttachment, setPdfAttachment] = useState(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      navigate('/vendor/login');
    }
  }, [user, navigate]);

  const [formData, setFormData] = useState(() => ({
    product_id: prefill?.product_id || '',
    buyer_id: prefill?.buyer_id || '',
    buyer_email: prefill?.buyer_email || '',
    quotation_title: prefill?.quotation_title || prefill?.product_name || '',
    quotation_amount: prefill?.quotation_amount || '',
    quantity: prefill?.quantity || '',
    unit: prefill?.unit || 'pieces',
    validity_days: prefill?.validity_days ?? 30,
    terms_conditions: prefill?.terms_conditions || '',
    delivery_days: prefill?.delivery_days || '',
    status: 'SENT'
  }));

  useEffect(() => {
    loadProductsAndBuyers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ If opened from Lead Detail: try to auto-select a matching product
  useEffect(() => {
    if (!prefill) return;
    if (formData.product_id) return;
    if (!products || products.length === 0) return;

    const wanted = String(prefill.product_name || prefill.quotation_title || '')
      .toLowerCase()
      .trim();
    if (!wanted) return;

    const exact = products.find((p) => String(p?.name || '').toLowerCase() === wanted);
    const partial =
      exact ||
      products.find((p) => String(p?.name || '').toLowerCase().includes(wanted)) ||
      products.find((p) => wanted.includes(String(p?.name || '').toLowerCase()));

    if (partial?.id) {
      setFormData((prev) => ({
        ...prev,
        product_id: partial.id,
        quotation_title: prev.quotation_title || partial.name || '',
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, prefill]);

  const loadProductsAndBuyers = async () => {
    setLoading(true);
    try {
      // Load vendor's products
      const productsData = await vendorApi.products.list();
      setProducts(Array.isArray(productsData) ? productsData : []);

      // Load all leads (both purchased and direct)
      try {
        const result = await vendorApi.leads.getMyLeads();
        const leadsData = Array.isArray(result) ? result : (result?.data || []);

        const allLeads = leadsData.map((lead, index) => {
          const email = lead.buyer_email || lead.email;
          return {
            id: lead.id,
            email: email || `lead-${index}-${lead.id}`,
            buyer_name: lead.buyer_name || lead.buyerName || lead.title || 'Unknown Buyer',
            company_name: lead.company_name || lead.companyName || '',
            phone: lead.buyer_phone || lead.phone || '',
            source: lead.source || 'Lead',
            title: lead.title,
            description: lead.description,
            location: lead.location,
            hasEmail: !!email
          };
        });

        console.log('📊 Loaded leads:', allLeads);
        setBuyers(allLeads);
      } catch (e) {
        console.warn('Could not load leads:', e);
        setBuyers([]);
      }
    } catch (error) {
      toast({ title: 'Error loading data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const onPickPdf = (file) => {
    if (!file) return;

    const isPdf =
      file.type === 'application/pdf' ||
      String(file.name || '').toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      toast({
        title: 'Only PDF allowed',
        description: 'Please select a PDF file.',
        variant: 'destructive'
      });
      return;
    }

    if (file.size > MAX_PDF_BYTES) {
      toast({
        title: 'PDF too large',
        description: `Max allowed size is ${formatBytes(MAX_PDF_BYTES)}. Your file is ${formatBytes(file.size)}.`,
        variant: 'destructive'
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : '';
      if (!base64) {
        toast({ title: 'PDF read failed', description: 'Could not read the PDF file.', variant: 'destructive' });
        return;
      }
      setPdfAttachment({
        name: file.name || 'quotation.pdf',
        base64,
        size: file.size,
        mime: 'application/pdf'
      });
      toast({ title: 'PDF attached', description: file.name });
    };
    reader.onerror = () => {
      toast({ title: 'PDF read failed', description: 'Could not read the PDF file.', variant: 'destructive' });
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.buyer_email || !formData.quotation_title || !formData.quotation_amount) {
      toast({
        title: 'Please fill required fields',
        description: 'Buyer Email, Title, and Amount are required',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);
    try {
      await quotationApi.sendQuotation({
        quotation_title: formData.quotation_title,
        quotation_amount: formData.quotation_amount,
        quantity: formData.quantity || null,
        unit: formData.unit,
        validity_days: formData.validity_days,
        delivery_days: formData.delivery_days || null,
        terms_conditions: formData.terms_conditions || '',
        buyer_id: formData.buyer_id || null,
        buyer_email: formData.buyer_email.toLowerCase().trim(),

        // ✅ Optional attachment (PDF)
        attachment: pdfAttachment ? {
          name: pdfAttachment.name,
          base64: pdfAttachment.base64,
          mime: pdfAttachment.mime || 'application/pdf'
        } : null
      });

      toast({
        title: '✅ Quotation Sent!',
        description: `Quotation sent to ${formData.buyer_email} with email notification`
      });

      setFormData({
        product_id: '',
        buyer_id: '',
        buyer_email: '',
        quotation_title: '',
        quotation_amount: '',
        quantity: '',
        unit: 'pieces',
        validity_days: 30,
        terms_conditions: '',
        delivery_days: '',
        status: 'SENT'
      });
      setPdfAttachment(null);

      setTimeout(() => navigate('/vendor/proposals?tab=sent'), 1000);
    } catch (error) {
      toast({
        title: 'Error sending quotation',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate('/vendor/proposals')} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Proposals
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Send Quotation</CardTitle>
        </CardHeader>
        <CardContent>
          {prefill ? (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              Prefilled from Lead{prefill.lead_ref ? ` #${prefill.lead_ref}` : ''}. You can edit any field before sending.
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Buyer Selection */}
            <div className="space-y-2">
              <Label htmlFor="buyer">Select from Previous Leads (Optional)</Label>
              <Select
                value={formData.buyer_id}
                onValueChange={(val) => {
                  if (val) {
                    const buyer = buyers.find(b => b.id === val);
                    setFormData(prev => ({
                      ...prev,
                      buyer_id: val,
                      buyer_email: buyer?.email || ''
                    }));
                  }
                }}
              >
                <SelectTrigger id="buyer">
                  <SelectValue placeholder="Choose from previous leads" />
                </SelectTrigger>
                <SelectContent>
                  {buyers.length > 0 ? (
                    buyers.map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{b.buyer_name || b.title || 'Unknown'}</span>
                          {b.hasEmail && <span className="text-xs text-slate-500">- {b.email}</span>}
                          {!b.hasEmail && <span className="text-xs text-orange-500 font-medium">📧 (Email required)</span>}
                          {b.source === 'Direct' && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Direct</span>}
                          {b.source === 'Purchased' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Purchased</span>}
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem disabled value="no-buyers">No leads found</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                Select from purchased and direct leads. Direct leads without email will need you to enter email below.
              </p>
            </div>

            {/* Buyer Email */}
            <div className="space-y-2">
              <Label htmlFor="buyer-email">Buyer Email *</Label>
              <Input
                id="buyer-email"
                type="email"
                value={formData.buyer_email}
                onChange={(e) => setFormData(prev => ({ ...prev, buyer_email: e.target.value }))}
                placeholder="buyer@example.com"
                required
              />
            </div>

            {/* Product Selection */}
            <div className="space-y-2">
              <Label htmlFor="product">Product/Service *</Label>
              <Select
                value={formData.product_id}
                onValueChange={(val) => {
                  const product = products.find(p => p.id === val);
                  setFormData(prev => ({
                    ...prev,
                    product_id: val,
                    quotation_title: product?.name || ''
                  }));
                }}
              >
                <SelectTrigger id="product">
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} (₹{p.price}/{p.price_unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quotation Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Quotation Title *</Label>
              <Input
                id="title"
                value={formData.quotation_title}
                onChange={(e) => setFormData(prev => ({ ...prev, quotation_title: e.target.value }))}
                placeholder="e.g., Land Surveying Services Quote"
                required
              />
            </div>

            {/* Amount and Quantity */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (₹) *</Label>
                <Input
                  id="amount"
                  type="number"
                  value={formData.quotation_amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, quotation_amount: e.target.value }))}
                  placeholder="0"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Select value={formData.unit} onValueChange={(val) => setFormData(prev => ({ ...prev, unit: val }))}>
                  <SelectTrigger id="unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pieces">Pieces</SelectItem>
                    <SelectItem value="kg">Kg</SelectItem>
                    <SelectItem value="m">Meter</SelectItem>
                    <SelectItem value="sqft">Sq Ft</SelectItem>
                    <SelectItem value="hour">Hour</SelectItem>
                    <SelectItem value="day">Day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Validity and Delivery */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="validity">Validity (Days)</Label>
                <Input
                  id="validity"
                  type="number"
                  value={formData.validity_days}
                  onChange={(e) => setFormData(prev => ({ ...prev, validity_days: e.target.value }))}
                  placeholder="30"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delivery">Delivery (Days)</Label>
                <Input
                  id="delivery"
                  type="number"
                  value={formData.delivery_days}
                  onChange={(e) => setFormData(prev => ({ ...prev, delivery_days: e.target.value }))}
                  placeholder="7"
                />
              </div>
            </div>

            {/* Terms & Conditions */}
            <div className="space-y-2">
              <Label htmlFor="terms">Terms & Conditions</Label>
              <textarea
                id="terms"
                className="w-full min-h-[120px] p-3 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.terms_conditions}
                onChange={(e) => setFormData(prev => ({ ...prev, terms_conditions: e.target.value }))}
                placeholder="Payment terms, delivery terms, warranty, etc."
              />
            </div>

            {/* ✅ PDF Attachment */}
            <div className="space-y-2">
              <Label>Attach PDF (Optional)</Label>

              {!pdfAttachment ? (
                <div className="flex items-center gap-3">
                  <Input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => onPickPdf(e.target.files?.[0])}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-md border bg-slate-50 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip className="h-4 w-4 text-slate-600" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{pdfAttachment.name}</div>
                      <div className="text-xs text-slate-500">{formatBytes(pdfAttachment.size)}</div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setPdfAttachment(null)}
                    title="Remove PDF"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <p className="text-xs text-slate-500">
                PDF will be attached in the email (max {formatBytes(MAX_PDF_BYTES)}).
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-4 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => navigate('/vendor/proposals')}>
                Cancel
              </Button>
              <Button type="submit" className="bg-[#003D82]" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Quotation'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default SendQuotation;
