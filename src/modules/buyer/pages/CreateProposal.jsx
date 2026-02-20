
import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buyerApi } from '@/modules/buyer/services/buyerApi';
import { toast } from '@/components/ui/use-toast';
import { Loader2, ArrowLeft, Send } from 'lucide-react';

const CreateProposal = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isLockedFlag = (value) => ['1', 'true', 'yes'].includes(String(value || '').toLowerCase().trim());
  const vendorId = String(searchParams.get('vendorId') || searchParams.get('vendor_id') || '').trim() || null;
  const vendorName = String(searchParams.get('vendorName') || searchParams.get('vendor_name') || '').trim();
  const productName = String(searchParams.get('productName') || searchParams.get('product_name') || '').trim();
  const lockVendor = isLockedFlag(searchParams.get('lockVendor'));
  const lockCategory = isLockedFlag(searchParams.get('lockCategory'));
  const prefilledCategory = String(searchParams.get('category') || searchParams.get('product_category') || productName || '').trim();
  const lockedCategoryValue = prefilledCategory || productName || '';
  const categoryOptions = useMemo(() => {
    const defaults = ['Automotive', 'Electronics', 'Textiles', 'Construction', 'Industrial'];
    const normalizedDefaults = defaults.map((value) => value.toLowerCase().trim());
    const incoming = String(lockedCategoryValue || '').trim();
    if (incoming && !normalizedDefaults.includes(incoming.toLowerCase())) {
      return [incoming, ...defaults];
    }
    return defaults;
  }, [lockedCategoryValue]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    category: lockedCategoryValue,
    quantity: '',
    budget: '',
    location: '',
    description: ''
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    
    if (!formData.category || !formData.quantity || !formData.budget || !formData.description) {
      toast({ title: "Validation Error", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      await buyerApi.createProposal({
        vendor_id: vendorId,
        title: productName || formData.category,
        product_name: productName || formData.category,
        category: formData.category,
        quantity: formData.quantity,
        budget: formData.budget,
        location: formData.location,
        description: formData.description
      });

      toast({ 
        title: "Success", 
        description: "Your requirement has been posted successfully.", 
        className: "bg-green-50 border-green-200 text-green-900" 
      });
      
      setTimeout(() => navigate('/buyer/proposals'), 300);

    } catch (error) {
      console.error("Submission failed:", error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to create proposal. Please try again.", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
           <h1 className="text-2xl font-bold text-neutral-800">New Proposal</h1>
           <p className="text-gray-500">Post a new requirement to get quotes from vendors</p>
           {vendorId && (
             <p className="text-sm text-[#003D82] mt-1">
               {lockVendor ? 'Vendor locked:' : 'Sending direct enquiry to'} {vendorName || 'selected vendor'}
             </p>
           )}
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-3">
          <CardTitle>Requirement Details</CardTitle>
          <CardDescription>Fill in the details to receive accurate quotes</CardDescription>
          {productName && (
            <p className="text-sm text-gray-600">Product interest: <span className="font-medium">{productName}</span></p>
          )}
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="category">{lockCategory ? 'Category *' : 'Select Category *'}</Label>
              {lockCategory ? (
                <Input
                  id="category"
                  value={formData.category}
                  readOnly
                  className="bg-gray-50"
                />
              ) : (
                <Select value={formData.category} onValueChange={(val) => handleChange('category', val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category === 'Industrial' ? 'Industrial Machinery' : category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <Label htmlFor="quantity">Quantity *</Label>
                <div className="flex gap-1.5">
                  <Input 
                    id="quantity" 
                    type="number" 
                    placeholder="e.g. 100" 
                    value={formData.quantity}
                    onChange={(e) => handleChange('quantity', e.target.value)}
                  />
                  <div className="flex items-center justify-center px-3 bg-gray-50 border rounded-md text-sm text-gray-500 min-w-[58px]">
                    Units
                  </div>
                </div>
              </div>
              
              <div className="space-y-1.5">
                <Label htmlFor="budget">Budget (₹) *</Label>
                <Input 
                  id="budget" 
                  type="number" 
                  placeholder="e.g. 50000" 
                  value={formData.budget}
                  onChange={(e) => handleChange('budget', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="location">Delivery Location *</Label>
              <Input 
                id="location" 
                placeholder="City or Pincode" 
                value={formData.location}
                onChange={(e) => handleChange('location', e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Detailed Requirement *</Label>
              <Textarea
                id="description" 
                placeholder="Describe your requirement in detail (specifications, quality, brands, etc.)" 
                className="min-h-[120px]"
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
              />
            </div>

            <div className="pt-1 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-[#003D82] min-w-[150px]" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" /> Post Requirement
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateProposal;
