import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StateDropdown, CityDropdown } from '@/shared/components/LocationSelectors';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { Loader2, X } from 'lucide-react';

const safe = (v) => (v == null ? '' : String(v).trim());

const PostRequirementModal = ({ isOpen, onOpenChange }) => {
  const [loading, setLoading] = useState(false);

  // ✅ Category suggestion
  const [categoryQuery, setCategoryQuery] = useState('');
  const [catLoading, setCatLoading] = useState(false);
  const [catSuggestions, setCatSuggestions] = useState([]);
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const catBoxRef = useRef(null);

  const [formData, setFormData] = useState({
    buyer_name: '',
    buyer_email: '',
    buyer_phone: '',
    company_name: '',

    // ✅ lead fields
    requirement_description: '',
    budget: '',
    timeline: '',
    quantity: '',

    // ✅ location selectors (optional)
    state_id: '',
    city_id: '',

    // ✅ category resolved
    category_path: '',   // "Head > Sub > Micro"
    category_text: '',   // typed category fallback
    category_slug: '',   // micro slug
    micro_category_id: '',
    sub_category_id: '',
    head_category_id: '',
  });

  // ✅ close dropdown on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      if (!catBoxRef.current) return;
      if (!catBoxRef.current.contains(e.target)) setShowCatDropdown(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // ✅ debounced category suggestions (micro -> sub -> head)
  useEffect(() => {
    const q = safe(categoryQuery);
    if (q.length < 2) {
      setCatSuggestions([]);
      setShowCatDropdown(false);
      setCatLoading(false);
      return;
    }

    setCatLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('micro_categories')
          .select(`
            id, name, slug,
            sub:sub_categories (
              id, name,
              head:head_categories ( id, name )
            )
          `)
          .ilike('name', `%${q}%`)
          .limit(10);

        if (error) throw error;

        const list = (data || []).map((m) => {
          const head = m?.sub?.head;
          const sub = m?.sub;
          return {
            micro_id: m.id,
            micro_name: m.name,
            micro_slug: m.slug,
            sub_id: sub?.id,
            head_id: head?.id,
            path: `${head?.name || '—'} > ${sub?.name || '—'} > ${m?.name || '—'}`,
          };
        });

        setCatSuggestions(list);
        setShowCatDropdown(true);
      } catch (e) {
        console.error('Category suggest error:', e);
        setCatSuggestions([]);
      } finally {
        setCatLoading(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [categoryQuery]);

  const selectCategory = (it) => {
    setFormData((p) => ({
      ...p,
      category_path: it.path,
      category_text: it.micro_name,
      category_slug: it.micro_slug || '',
      micro_category_id: it.micro_id || '',
      sub_category_id: it.sub_id || '',
      head_category_id: it.head_id || '',
    }));
    setCategoryQuery(it.micro_name);
    setShowCatDropdown(false);
  };

  const clearCategory = () => {
    setFormData((p) => ({
      ...p,
      category_path: '',
      category_text: '',
      category_slug: '',
      micro_category_id: '',
      sub_category_id: '',
      head_category_id: '',
    }));
    setCategoryQuery('');
    setCatSuggestions([]);
    setShowCatDropdown(false);
  };

  const resolveLocationText = async () => {
    const stateId = safe(formData.state_id);
    const cityId = safe(formData.city_id);

    let stateName = '';
    let cityName = '';

    if (stateId) {
      const { data } = await supabase.from('states').select('name').eq('id', stateId).maybeSingle();
      stateName = data?.name || '';
    }
    if (cityId) {
      const { data } = await supabase.from('cities').select('name').eq('id', cityId).maybeSingle();
      cityName = data?.name || '';
    }

    if (cityName && stateName) return `${cityName}, ${stateName}`;
    if (stateName) return stateName;
    if (cityName) return cityName;
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    // basic validation
    const cat = safe(formData.category_path || formData.category_text);
    if (!cat) {
      toast({ title: 'Category is required', variant: 'destructive' });
      return;
    }
    if (!safe(formData.buyer_name) || !safe(formData.buyer_phone) || !safe(formData.buyer_email)) {
      toast({ title: 'Name, Phone, Email required', variant: 'destructive' });
      return;
    }
    if (!safe(formData.requirement_description)) {
      toast({ title: 'Requirement description required', variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      const locationText = await resolveLocationText();

      // ✅ EXACT mapping to your leads table columns
      const payload = {
        buyer_name: safe(formData.buyer_name),
        buyer_phone: safe(formData.buyer_phone),
        buyer_email: safe(formData.buyer_email),
        company_name: safe(formData.company_name),

        title: `Requirement: ${cat}`,               // ✅ required
        product_name: safe(formData.category_text) || cat,
        category: cat,
        category_slug: safe(formData.category_slug) || null,
        micro_category_id: safe(formData.micro_category_id) || null,
        sub_category_id: safe(formData.sub_category_id) || null,
        head_category_id: safe(formData.head_category_id) || null,
        quantity: safe(formData.quantity) || null,
        budget: safe(formData.budget) || null,
        location: safe(locationText) || null,
        state_id: safe(formData.state_id) || null,
        city_id: safe(formData.city_id) || null,

        product_interest: safe(formData.category_text) || cat,

        // ✅ IMPORTANT: leads me description nahi, message hai
        message: [
          safe(formData.requirement_description),
          safe(formData.timeline) ? `Timeline: ${safe(formData.timeline)}` : '',
        ].filter(Boolean).join('\n'),

        status: 'AVAILABLE',
        price: 0,
      };

      const { error } = await supabase.from('leads').insert([payload]);
      if (error) throw error;

      toast({ title: 'Requirement Submitted!', description: 'We will contact you shortly.' });
      onOpenChange?.(false);

      // reset
      setFormData({
        buyer_name: '',
        buyer_email: '',
        buyer_phone: '',
        company_name: '',
        requirement_description: '',
        budget: '',
        timeline: '',
        quantity: '',
        state_id: '',
        city_id: '',
        category_path: '',
        category_text: '',
        category_slug: '',
        micro_category_id: '',
        sub_category_id: '',
        head_category_id: '',
      });
      setCategoryQuery('');
      setCatSuggestions([]);
      setShowCatDropdown(false);

    } catch (err) {
      console.error('Lead submit error:', err);
      toast({
        title: 'Error',
        description: err?.message || 'Failed to submit requirement.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tell Us What You Need</DialogTitle>
          <DialogDescription>Submit your requirement and get quotes from verified vendors.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Full Name *</Label>
              <Input
                value={formData.buyer_name}
                onChange={(e) => setFormData((p) => ({ ...p, buyer_name: e.target.value }))}
                placeholder="Your Name"
                required
              />
            </div>
            <div>
              <Label>Phone *</Label>
              <Input
                value={formData.buyer_phone}
                onChange={(e) => setFormData((p) => ({ ...p, buyer_phone: e.target.value }))}
                placeholder="Mobile No."
                required
              />
            </div>
          </div>

          <div>
            <Label>Email *</Label>
            <Input
              type="email"
              value={formData.buyer_email}
              onChange={(e) => setFormData((p) => ({ ...p, buyer_email: e.target.value }))}
              placeholder="you@company.com"
              required
            />
          </div>

          <div>
            <Label>Company (Optional)</Label>
            <Input
              value={formData.company_name}
              onChange={(e) => setFormData((p) => ({ ...p, company_name: e.target.value }))}
              placeholder="Company Name"
            />
          </div>

          {/* ✅ Category with Suggestions */}
          <div ref={catBoxRef} className="relative">
            <Label>Category *</Label>

            {formData.category_path ? (
              <div className="mt-1 flex items-center justify-between gap-2 rounded-md border bg-slate-50 px-3 py-2">
                <div className="text-sm text-slate-700">{formData.category_path}</div>
                <button type="button" className="p-1 rounded hover:bg-slate-200" onClick={clearCategory}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="mt-1 relative">
                  <Input
                    value={categoryQuery}
                    onChange={(e) => {
                      setCategoryQuery(e.target.value);
                      setFormData((p) => ({ ...p, category_text: e.target.value }));
                    }}
                    onFocus={() => {
                      if (catSuggestions.length) setShowCatDropdown(true);
                    }}
                    placeholder="Type category (e.g. LED Light, Steel Pipe...)"
                    required
                  />
                  {catLoading && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-2.5 text-slate-500" />}
                </div>

                {showCatDropdown && catSuggestions.length > 0 && (
                  <div className="absolute z-50 mt-2 w-full rounded-md border bg-white shadow-lg max-h-64 overflow-auto">
                    {catSuggestions.map((it) => (
                      <button
                        type="button"
                        key={it.micro_id}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50"
                        onClick={() => selectCategory(it)}
                      >
                        <div className="text-sm font-medium text-slate-900">{it.micro_name}</div>
                        <div className="text-xs text-slate-500">{it.path}</div>
                      </button>
                    ))}
                  </div>
                )}

                {showCatDropdown && !catLoading && categoryQuery.trim().length >= 2 && catSuggestions.length === 0 && (
                  <div className="absolute z-50 mt-2 w-full rounded-md border bg-white shadow-lg p-3 text-sm text-slate-600">
                    No match found. You can still submit with typed category.
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <Label>Requirement Description *</Label>
            <Textarea
              value={formData.requirement_description}
              onChange={(e) => setFormData((p) => ({ ...p, requirement_description: e.target.value }))}
              placeholder="Product name, specifications, quantity..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Quantity (Optional)</Label>
              <Input
                value={formData.quantity}
                onChange={(e) => setFormData((p) => ({ ...p, quantity: e.target.value }))}
                placeholder="e.g. 10 pcs / 2 ton"
              />
            </div>
            <div>
              <Label>Budget (Optional)</Label>
              <Input
                value={formData.budget}
                onChange={(e) => setFormData((p) => ({ ...p, budget: e.target.value }))}
                placeholder="₹ 10k - 50k"
              />
            </div>
          </div>

          <div>
            <Label>Timeline (Optional)</Label>
            <Input
              value={formData.timeline}
              onChange={(e) => setFormData((p) => ({ ...p, timeline: e.target.value }))}
              placeholder="Immediate / 7 days / 1 month"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>State</Label>
              <StateDropdown
                value={formData.state_id}
                onChange={(id) => setFormData((p) => ({ ...p, state_id: id, city_id: '' }))}
              />
            </div>
            <div className="space-y-1">
              <Label>City</Label>
              <CityDropdown
                stateId={formData.state_id}
                value={formData.city_id}
                onChange={(id) => setFormData((p) => ({ ...p, city_id: id }))}
              />
            </div>
          </div>

          <Button type="submit" className="w-full bg-[#003D82]" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Submit Requirement
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PostRequirementModal;
