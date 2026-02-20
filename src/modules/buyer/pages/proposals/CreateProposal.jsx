
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { buyerProposalApi } from '@/modules/buyer/services/buyerProposalApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { Loader2, ArrowLeft } from 'lucide-react';
import Card from '@/shared/components/Card';

const CreateProposal = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preVendorId = searchParams.get('vendorId');
  const preVendorName = searchParams.get('vendorName');
  const preProductName = searchParams.get('productName');

  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    vendor_id: preVendorId || '',
    product_name: preProductName || '',
    quantity: '',
    budget: '',
    required_by_date: '',
    description: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await buyerProposalApi.create(formData);
      toast({ title: "Proposal Sent", description: "The vendor will be notified immediately." });
      navigate('/buyer/proposals');
    } catch (e) {
      toast({ title: "Error", description: "Failed to send proposal", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <Button variant="ghost" className="mb-4" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back
      </Button>
      
      <h1 className="text-2xl font-bold mb-6">Create New Proposal</h1>
      
      <Card>
        <Card.Content className="p-6">
           <form onSubmit={handleSubmit} className="space-y-6">
             {preVendorName && (
               <div className="bg-blue-50 text-blue-800 p-3 rounded-md text-sm mb-4">
                 Sending to: <strong>{preVendorName}</strong>
               </div>
             )}

             <div>
               <Label>Proposal Title</Label>
               <Input 
                 required 
                 value={formData.title}
                 onChange={e => setFormData({...formData, title: e.target.value})}
                 placeholder="e.g. Bulk Order for Safety Shoes"
               />
             </div>

             <div className="grid grid-cols-2 gap-4">
               <div>
                 <Label>Product Name</Label>
                 <Input 
                   required
                   value={formData.product_name}
                   onChange={e => setFormData({...formData, product_name: e.target.value})}
                 />
               </div>
               <div>
                 <Label>Quantity</Label>
                 <Input 
                   required
                   value={formData.quantity}
                   onChange={e => setFormData({...formData, quantity: e.target.value})}
                   placeholder="e.g. 500 Units"
                 />
               </div>
             </div>

             <div className="grid grid-cols-2 gap-4">
               <div>
                 <Label>Target Budget (₹)</Label>
                 <Input 
                   type="number"
                   value={formData.budget}
                   onChange={e => setFormData({...formData, budget: e.target.value})}
                 />
               </div>
               <div>
                 <Label>Required By</Label>
                 <Input 
                   type="date"
                   value={formData.required_by_date}
                   onChange={e => setFormData({...formData, required_by_date: e.target.value})}
                 />
               </div>
             </div>

             <div>
               <Label>Description / Requirements</Label>
               <textarea 
                 className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                 required
                 value={formData.description}
                 onChange={e => setFormData({...formData, description: e.target.value})}
               />
             </div>

             <div className="flex justify-end gap-3 pt-4">
               <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
               <Button type="submit" className="bg-[#003D82]" disabled={isLoading}>
                 {isLoading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                 Send Proposal
               </Button>
             </div>
           </form>
        </Card.Content>
      </Card>
    </div>
  );
};

// Send icon
const Send = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
);

export default CreateProposal;
