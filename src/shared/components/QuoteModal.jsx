
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';

const QuoteModal = ({ triggerText = "Get a Quote", serviceName = "", defaultOpen = false, onClose }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.target);
    const data = {
      product_name: formData.get('product') || serviceName,
      quantity: formData.get('quantity'),
      unit: formData.get('unit'),
      email: formData.get('email'),
      phone: formData.get('phone'),
    };

    try {
      const { error } = await supabase.from('quotes').insert([data]);
      
      if (error) throw error;

      toast({
        title: "Request Submitted Successfully",
        description: "We have sent your requirements to top verified suppliers. They will contact you shortly.",
        variant: "default",
        className: "bg-green-600 text-white border-none"
      });
      
      setIsOpen(false);
      if (onClose) onClose();
    } catch (error) {
      console.error("Quote submission error:", error);
      toast({
        title: "Submission Failed",
        description: "There was an error submitting your quote. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#003D82] hover:bg-[#002a5c] text-white">
          {triggerText}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-900">Get a Quote</DialogTitle>
          <p className="text-sm text-gray-500">Tell us what you need, and we'll help you get quotes</p>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="product">Service/Product Name <span className="text-red-500">*</span></Label>
            <Input 
              id="product" 
              name="product"
              placeholder="e.g. Industrial Pumps" 
              defaultValue={serviceName} 
              required 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
                <Label htmlFor="quantity">Quantity <span className="text-red-500">*</span></Label>
                <Input id="quantity" name="quantity" type="number" placeholder="0" required />
             </div>
             <div className="space-y-2">
                <Label htmlFor="unit">Unit <span className="text-red-500">*</span></Label>
                <Input id="unit" name="unit" placeholder="e.g. Pieces, Kgs" required />
             </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email <span className="text-red-500">*</span></Label>
            <Input id="email" name="email" type="email" placeholder="your@email.com" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone <span className="text-red-500">*</span></Label>
            <div className="flex">
               <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                 +91
               </span>
               <Input id="phone" name="phone" type="tel" placeholder="98765 43210" className="rounded-l-none" required />
            </div>
          </div>

          <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white text-lg h-11" disabled={loading}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
            {loading ? 'Submitting...' : 'Get Quote'}
          </Button>

          <p className="text-xs text-center text-gray-400 mt-2">
            By submitting, you agree to our Terms of Service and Privacy Policy.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default QuoteModal;
