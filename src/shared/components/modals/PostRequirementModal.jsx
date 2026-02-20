import React, { useState, useEffect, useRef } from 'react';
import { Loader2, X, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { StateDropdown, CityDropdown } from '@/shared/components/LocationSelectors';

const safe = (value) => (value == null ? '' : String(value).trim());

const PostRequirementModal = ({ isOpen, onClose }) => {
  // Debug log
  console.log('PostRequirementModal isOpen:', isOpen);
  const [formData, setFormData] = useState({
    buyerName: '',
    title: '',
    category_text: '',
    category_path: '',
    category_slug: '',
    micro_category_id: '',
    sub_category_id: '',
    head_category_id: '',
    description: '',
    quantity: '',
    budget: '',
    state_id: '',
    state_name: '',
    city_id: '',
    city_name: '',
    companyName: '',
    email: '',
    phone: ''
  });

  const [loading, setLoading] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState('');
  const [catLoading, setCatLoading] = useState(false);
  const [catSuggestions, setCatSuggestions] = useState([]);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const catBoxRef = useRef(null);

  useEffect(() => {
    const onDocClick = (event) => {
      if (!catBoxRef.current) return;
      if (!catBoxRef.current.contains(event.target)) {
        setShowCategoryDropdown(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    const q = safe(categoryQuery);
    if (q.length < 2) {
      setCatSuggestions([]);
      setShowCategoryDropdown(false);
      setCatLoading(false);
      return;
    }

    setCatLoading(true);
    const timer = setTimeout(async () => {
      try {
        const [microRes, subRes] = await Promise.all([
          supabase
            .from('micro_categories')
            .select(`
              id, name, slug,
              sub:sub_categories (
                id, name,
                head:head_categories ( id, name )
              )
            `)
            .ilike('name', `%${q}%`)
            .limit(8),
          supabase
            .from('sub_categories')
            .select(`
              id, name, slug,
              head:head_categories ( id, name )
            `)
            .ilike('name', `%${q}%`)
            .limit(8)
        ]);

        if (microRes.error) throw microRes.error;
        if (subRes.error) throw subRes.error;

        const microList = (microRes.data || []).map((m) => {
          const head = m?.sub?.head;
          const sub = m?.sub;
          return {
            type: 'micro',
            micro_id: m.id,
            micro_name: m.name,
            micro_slug: m.slug,
            sub_id: sub?.id,
            head_id: head?.id,
            path: `${head?.name || '-'} > ${sub?.name || '-'} > ${m?.name || '-'}`,
          };
        });

        const subList = (subRes.data || []).map((s) => ({
          type: 'sub',
          sub_id: s.id,
          sub_name: s.name,
          sub_slug: s.slug,
          head_id: s?.head?.id,
          path: `${s?.head?.name || '-'} > ${s?.name || '-'}`,
        }));

        setCatSuggestions([...microList, ...subList]);
        setShowCategoryDropdown(true);
      } catch (error) {
        console.error('Error loading categories:', error);
        setCatSuggestions([]);
      } finally {
        setCatLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [categoryQuery]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCategoryInput = (value) => {
    setCategoryQuery(value);
    setFormData(prev => ({
      ...prev,
      category_text: value,
      category_path: '',
      category_slug: '',
      micro_category_id: '',
      sub_category_id: '',
      head_category_id: ''
    }));
  };

  const selectCategory = (item) => {
    setFormData(prev => ({
      ...prev,
      category_text: item.type === 'sub' ? item.sub_name : item.micro_name,
      category_path: item.path,
      category_slug: item.type === 'sub' ? (item.sub_slug || '') : (item.micro_slug || ''),
      micro_category_id: item.type === 'sub' ? '' : (item.micro_id || ''),
      sub_category_id: item.sub_id || '',
      head_category_id: item.head_id || ''
    }));
    setCategoryQuery(item.type === 'sub' ? item.sub_name : item.micro_name);
    setShowCategoryDropdown(false);
  };

  const clearCategory = () => {
    setFormData(prev => ({
      ...prev,
      category_text: '',
      category_path: '',
      category_slug: '',
      micro_category_id: '',
      sub_category_id: '',
      head_category_id: ''
    }));
    setCategoryQuery('');
    setCatSuggestions([]);
    setShowCategoryDropdown(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const categoryValue = safe(formData.category_path || formData.category_text);
    const derivedLocation = [safe(formData.city_name), safe(formData.state_name)].filter(Boolean).join(', ');

    if (!safe(formData.title)) {
      toast({
        title: "Missing Information",
        description: "Please enter a requirement title",
        variant: "destructive"
      });
      return;
    }
    if (!categoryValue) {
      toast({
        title: "Missing Information",
        description: "Please enter or select a category",
        variant: "destructive"
      });
      return;
    }
    if (!safe(formData.description)) {
      toast({
        title: "Missing Information",
        description: "Please provide a description",
        variant: "destructive"
      });
      return;
    }
    if (!safe(formData.quantity)) {
      toast({
        title: "Missing Information",
        description: "Please enter quantity",
        variant: "destructive"
      });
      return;
    }
    if (!safe(formData.state_id) || !safe(formData.city_id)) {
      toast({
        title: "Missing Information",
        description: "Please select state and city",
        variant: "destructive"
      });
      return;
    }
    if (!safe(formData.buyerName)) {
      toast({
        title: "Missing Information",
        description: "Please enter your name",
        variant: "destructive"
      });
      return;
    }
    if (!safe(formData.companyName)) {
      toast({
        title: "Missing Information",
        description: "Please enter company name",
        variant: "destructive"
      });
      return;
    }
    if (!safe(formData.email)) {
      toast({
        title: "Missing Information",
        description: "Please enter email",
        variant: "destructive"
      });
      return;
    }
    if (!safe(formData.phone)) {
      toast({
        title: "Missing Information",
        description: "Please enter phone number",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    
    try {
      const payload = {
        title: safe(formData.title),
        product_name: safe(formData.title) || categoryValue,
        category: categoryValue,
        description: safe(formData.description),
        quantity: safe(formData.quantity),
        budget: parseFloat(formData.budget) || 0,
        location: derivedLocation || null,
        company_name: safe(formData.companyName),
        buyer_name: safe(formData.buyerName),
        buyer_email: safe(formData.email),
        buyer_phone: safe(formData.phone),
        product_interest: safe(formData.category_text) || categoryValue || safe(formData.title),
        message: safe(formData.description),
        category_slug: safe(formData.category_slug) || null,
        micro_category_id: safe(formData.micro_category_id) || null,
        sub_category_id: safe(formData.sub_category_id) || null,
        head_category_id: safe(formData.head_category_id) || null,
        state_id: safe(formData.state_id) || null,
        city_id: safe(formData.city_id) || null,
        source: 'marketplace',
        status: 'AVAILABLE',
        created_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('leads')
        .insert([payload]);

      if (error) throw error;
      
      toast({
        title: "Requirement Posted!",
        description: "Suppliers will contact you soon.",
        className: "bg-green-600 text-white border-green-700"
      });
      
      setFormData({
        buyerName: '',
        title: '',
        category_text: '',
        category_path: '',
        category_slug: '',
        micro_category_id: '',
        sub_category_id: '',
        head_category_id: '',
        description: '',
        quantity: '',
        budget: '',
        state_id: '',
        state_name: '',
        city_id: '',
        city_name: '',
        companyName: '',
        email: '',
        phone: ''
      });
      setCategoryQuery('');
      setCatSuggestions([]);
      setShowCategoryDropdown(false);
      
      onClose();
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Failed to post requirement. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-2xl font-bold">Post Your Requirement</h2>
            <p className="text-blue-100 text-sm mt-1">Connect with verified suppliers</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-blue-500 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            
            {/* Title */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                What do you need? *
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="e.g., Industrial Motors, Textiles, etc."
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Category with Search */}
            <div ref={catBoxRef} className="relative">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Category *
              </label>

              {formData.category_path ? (
                <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2">
                  <div className="text-sm text-gray-800">{formData.category_path}</div>
                  <button
                    type="button"
                    onClick={clearCategory}
                    className="p-1 rounded hover:bg-gray-200 transition-colors"
                    aria-label="Clear category"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <input
                      type="text"
                      value={categoryQuery}
                      onChange={(e) => handleCategoryInput(e.target.value)}
                      onFocus={() => {
                        if (catSuggestions.length) setShowCategoryDropdown(true);
                      }}
                      placeholder="Search or type category name..."
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {catLoading && (
                      <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-3 text-gray-500" />
                    )}
                  </div>

                  {showCategoryDropdown && catSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-20 max-h-56 overflow-y-auto">
                      {catSuggestions.map((cat) => (
                        <button
                          key={cat.type === 'sub' ? `sub-${cat.sub_id}` : `micro-${cat.micro_id}`}
                          type="button"
                          onClick={() => selectCategory(cat)}
                          className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-gray-200 last:border-b-0 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium text-gray-800">
                              {cat.type === 'sub' ? cat.sub_name : cat.micro_name}
                            </div>
                            <span className="text-[10px] uppercase tracking-wide text-gray-500">
                              {cat.type === 'sub' ? 'Sub' : 'Micro'}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">{cat.path}</div>
                        </button>
                      ))}
                    </div>
                  )}

                  {showCategoryDropdown && !catLoading && categoryQuery.trim().length >= 2 && catSuggestions.length === 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-20 p-3 text-sm text-gray-600">
                      No match found. You can submit with the typed category.
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Description *
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Describe your requirement in detail..."
                rows="4"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Quantity & Budget */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Quantity *
                </label>
                <input
                  type="text"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                  placeholder="e.g., 100 units"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Budget (Optional)
                </label>
                <input
                  type="text"
                  name="budget"
                  value={formData.budget}
                  onChange={handleChange}
                  placeholder="e.g., 50,000"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Location */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  State *
                </label>
                <StateDropdown
                  value={formData.state_id}
                  onChange={(id, item) => setFormData(prev => ({
                    ...prev,
                    state_id: id || '',
                    state_name: item?.name || '',
                    city_id: '',
                    city_name: ''
                  }))}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  City *
                </label>
                <CityDropdown
                  stateId={formData.state_id}
                  value={formData.city_id}
                  onChange={(id, item) => setFormData(prev => ({
                    ...prev,
                    city_id: id || '',
                    city_name: item?.name || ''
                  }))}
                />
              </div>
            </div>

            {/* Contact Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Full Name *
                </label>
                <input
                  type="text"
                  name="buyerName"
                  value={formData.buyerName}
                  onChange={handleChange}
                  placeholder="Your name"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Company Name *
                </label>
                <input
                  type="text"
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleChange}
                  placeholder="Your company name"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Your email address"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+91 XXXXX XXXXX"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-4 border-t">
              <Button
                type="button"
                onClick={onClose}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                {loading ? 'Posting...' : 'Post Requirement'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PostRequirementModal;
