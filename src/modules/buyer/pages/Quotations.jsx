import React, { useEffect, useState } from 'react';
import { quotationApi } from '@/modules/vendor/services/quotationApi';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Building2, User, Mail, Phone, Calendar, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const BuyerQuotations = () => {
  const [activeTab, setActiveTab] = useState('received');
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buyerEmail, setBuyerEmail] = useState(null);

  useEffect(() => {
    loadBuyerEmail();
  }, []);

  useEffect(() => {
    if (buyerEmail) {
      loadQuotations();
    }
  }, [activeTab, buyerEmail]);

  const loadBuyerEmail = () => {
    // Get from auth or local storage
    const email = localStorage.getItem('buyer_email') || sessionStorage.getItem('buyer_email');
    if (email) {
      setBuyerEmail(email);
    } else {
      toast({ 
        title: 'Please login', 
        description: 'You need to be logged in to view quotations',
        variant: 'destructive'
      });
    }
  };

  const loadQuotations = async () => {
    if (!buyerEmail) return;
    
    setLoading(true);
    try {
      const data = await quotationApi.getReceivedQuotations(buyerEmail);
      setQuotations(data || []);
    } catch (error) {
      console.error('Error loading quotations:', error);
      toast({ 
        title: 'Error loading quotations',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredQuotations = quotations.filter(q => {
    if (activeTab === 'pending') return q.status === 'SENT';
    if (activeTab === 'accepted') return q.status === 'ACCEPTED';
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Quotations Received</h1>
        <p className="text-gray-500">Track and manage all quotations from vendors</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-[500px]">
          <TabsTrigger value="all">All ({quotations.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="accepted">Accepted</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4 mt-6">
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="animate-spin" />
            </div>
          ) : filteredQuotations.length === 0 ? (
            <div className="text-center p-8 border rounded bg-white text-gray-500">
              No quotations found
            </div>
          ) : (
            filteredQuotations.map(quotation => (
              <QuotationCard key={quotation.id} quotation={quotation} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

const QuotationCard = ({ quotation }) => {
  const vendor = quotation.vendors || {};

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row justify-between gap-6">
          {/* Left: Quotation Details */}
          <div className="space-y-3 flex-1">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-lg text-[#003D82]">{quotation.title}</h3>
                <p className="text-sm text-gray-500">
                  <Calendar className="inline h-3 w-3 mr-1" />
                  {new Date(quotation.created_at).toLocaleDateString()}
                </p>
              </div>
              <Badge variant={quotation.status === 'SENT' ? 'outline' : 'success'}>
                {quotation.status || 'PENDING'}
              </Badge>
            </div>

            {/* Vendor Info */}
            <div className="bg-gradient-to-r from-blue-50 to-teal-50 border border-blue-100 rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-gray-700">From Vendor:</p>
              <div className="space-y-1 text-sm">
                <p className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-500" />
                  <strong>{vendor.owner_name || 'N/A'}</strong>
                </p>
                <p className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-gray-500" />
                  {vendor.company_name || 'N/A'}
                </p>
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-500" />
                  {vendor.phone || 'N/A'}
                </p>
                <p className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-500" />
                  {vendor.email || 'N/A'}
                </p>
              </div>
            </div>

            {/* Quotation Details */}
            {quotation.terms_conditions && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm font-semibold text-gray-700 mb-2">Terms & Conditions:</p>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{quotation.terms_conditions}</p>
              </div>
            )}
          </div>

          {/* Right: Amount and Actions */}
          <div className="flex flex-col items-end justify-center min-w-[200px]">
            <div className="text-center mb-6">
              <p className="text-xs text-gray-500 mb-1">Quote Amount</p>
              <p className="text-3xl font-bold text-[#003D82]">
                ₹{quotation.quotation_amount?.toLocaleString?.() || quotation.quotation_amount || '0'}
              </p>
            </div>

            <div className="space-y-2 w-full">
              {quotation.quantity && (
                <div className="text-sm text-gray-600 text-right">
                  Qty: {quotation.quantity}
                </div>
              )}
              {quotation.validity_days && (
                <div className="text-sm text-gray-600 text-right">
                  Valid for: {quotation.validity_days} days
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-6 w-full">
              <Button variant="outline" className="flex-1">
                Contact Vendor
              </Button>
              <Button className="flex-1 bg-[#00A699] hover:bg-[#00857A]">
                Accept Quote
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default BuyerQuotations;
