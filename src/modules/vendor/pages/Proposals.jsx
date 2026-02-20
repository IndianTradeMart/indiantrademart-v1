import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { vendorApi } from '@/modules/vendor/services/vendorApi';
import { quotationApi } from '@/modules/vendor/services/quotationApi';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Calendar, User, FileText, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const Proposals = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(() => {
    const tab = new URLSearchParams(location.search).get('tab');
    return tab === 'sent' ? 'sent' : 'received';
  });
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab');
    const nextTab = tab === 'sent' ? 'sent' : 'received';
    setActiveTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [location.search]);

  useEffect(() => {
    loadProposals();
  }, [activeTab]);

  const loadProposals = async () => {
    setLoading(true);
    try {
       let data = [];
       if (activeTab === 'sent') {
         try {
           data = await quotationApi.getSentQuotations();
         } catch {
           data = [];
         }
         if (!Array.isArray(data) || data.length === 0) {
           data = await vendorApi.proposals.list(activeTab);
         }
       } else {
         data = await vendorApi.proposals.list(activeTab);
       }
       setProposals(Array.isArray(data) ? data : []);
    } catch (e) {
       console.error(e);
       setProposals([]);
    } finally {
       setLoading(false);
    }
  };

  const openDetail = async (id) => {
    try {
      const data = await vendorApi.proposals.get(id);
      setSelected(data);
      setDetailOpen(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id) => {
    const ok = window.confirm('Delete this quotation?');
    if (!ok) return;
    try {
      await vendorApi.proposals.delete(id);
      setDetailOpen(false);
      setSelected(null);
      loadProposals();
    } catch (e) {
      console.error(e);
    }
  };

  const selectedBuyerName =
    selected?.buyers?.full_name ||
    selected?.buyer_name ||
    selected?.buyer_email ||
    'Customer';
  const selectedBuyerCompany =
    selected?.buyers?.company_name ||
    selected?.company_name ||
    null;
  const selectedBuyerEmail =
    selected?.buyers?.email ||
    selected?.buyer_email ||
    null;
  const selectedBuyerPhone =
    selected?.buyers?.phone ||
    selected?.buyer_phone ||
    null;
  const selectedBuyerLocation =
    selected?.buyers?.location ||
    [selected?.city, selected?.state].filter(Boolean).join(', ') ||
    selected?.location ||
    null;

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
          <div>
             <h1 className="text-2xl font-bold text-gray-900">My Proposals</h1>
             <p className="text-gray-500">Manage your sent and received quotations</p>
          </div>
          <Button className="bg-[#003D82]" onClick={() => navigate('/vendor/proposals/send')}>
             <Plus className="mr-2 h-4 w-4" /> Send Quotation
          </Button>
       </div>

       <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
             <TabsTrigger value="received">Received Requests</TabsTrigger>
             <TabsTrigger value="sent">Sent Quotations</TabsTrigger>
          </TabsList>

          <TabsContent value="received" className="space-y-4 mt-6">
             {loading ? <div className="flex justify-center p-8"><Loader2 className="animate-spin"/></div> : 
               proposals.length === 0 ? <div className="text-center p-8 border rounded bg-white text-gray-500">No proposals found.</div> :
               proposals.map(prop => (
                 <Card key={prop.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                       <div className="flex justify-between items-start">
                          <div>
                             <h3 className="font-bold text-lg text-[#003D82] mb-1">{prop.title}</h3>
                             <div className="text-sm text-gray-500 mb-4">
                                Requested by <span className="font-medium text-gray-800">{prop.buyers?.full_name || prop.buyer_name || prop.buyer_email || 'Buyer'}</span> on {new Date(prop.created_at).toLocaleDateString()}
                             </div>
                             <div className="flex gap-2">
                                <Badge variant="secondary">{prop.status}</Badge>
                                {prop.budget && <Badge variant="outline">Budget: ₹{prop.budget}</Badge>}
                             </div>
                          </div>
                          <div className="flex gap-2">
                            <Button onClick={() => openDetail(prop.id)}>View Details</Button>
                            <Button variant="outline" className="text-red-600 border-red-200" onClick={() => handleDelete(prop.id)}>
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          </div>
                       </div>
                    </CardContent>
                 </Card>
               ))
             }
          </TabsContent>
          
           <TabsContent value="sent" className="space-y-4 mt-6">
             {loading ? <div className="flex justify-center p-8"><Loader2 className="animate-spin"/></div> : 
               proposals.length === 0 ? <div className="text-center p-8 border rounded bg-white text-gray-500">No sent quotations yet. Create quotations to send to buyers.</div> :
               proposals.map(prop => (
                 <Card key={prop.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                       <div className="flex justify-between items-start">
                          <div>
                             <h3 className="font-bold text-lg text-[#003D82] mb-1">{prop.title}</h3>
                             <div className="text-sm text-gray-500 mb-4">
                               Sent to <span className="font-medium text-gray-800">{prop.buyers?.full_name || prop.buyer_name || prop.buyer_email || 'Customer'}</span> on {new Date(prop.created_at).toLocaleDateString()}
                             </div>
                             <div className="flex gap-2">
                                <Badge variant="secondary">{prop.status || 'PENDING'}</Badge>
                                {(prop.quotation_amount || prop.budget) && <Badge variant="outline">₹{prop.quotation_amount || prop.budget}</Badge>}
                                {prop.quantity && <Badge variant="outline">Qty: {prop.quantity}</Badge>}
                             </div>
                          </div>
                          <div className="flex gap-2">
                            <Button onClick={() => openDetail(prop.id)}>View Details</Button>
                            <Button variant="outline" className="text-red-600 border-red-200" onClick={() => handleDelete(prop.id)}>
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          </div>
                       </div>
                    </CardContent>
                 </Card>
               ))
             }
          </TabsContent>
      </Tabs>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.title || 'Proposal Details'}</DialogTitle>
            <DialogDescription>
              Sent on {selected?.created_at ? new Date(selected.created_at).toLocaleString() : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-start gap-2 text-neutral-700">
                <User className="h-4 w-4 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-neutral-900">{selectedBuyerName}</div>
                  {selectedBuyerCompany && (
                    <div className="text-xs text-neutral-500">Company: {selectedBuyerCompany}</div>
                  )}
                  {selectedBuyerEmail ? (
                    <div className="text-xs text-neutral-600">Email: {selectedBuyerEmail}</div>
                  ) : null}
                  {selectedBuyerPhone ? (
                    <div className="text-xs text-neutral-600">Phone: {selectedBuyerPhone}</div>
                  ) : null}
                  {selectedBuyerLocation ? (
                    <div className="text-xs text-neutral-600">Location: {selectedBuyerLocation}</div>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-1 text-neutral-700">
                <div className="flex gap-2 items-center">
                  <Badge variant="secondary">{selected?.status || 'PENDING'}</Badge>
                  {(selected?.quotation_amount || selected?.budget) && (
                    <Badge variant="outline">₹{selected?.quotation_amount || selected?.budget}</Badge>
                  )}
                </div>
                {selected?.product_name && (
                  <div className="text-xs text-neutral-600">Product: {selected.product_name}</div>
                )}
                {selected?.quantity && (
                  <div className="text-xs text-neutral-600">Quantity: {selected.quantity}</div>
                )}
                {selected?.required_by_date && (
                  <div className="text-xs text-neutral-600">
                    Required by: {new Date(selected.required_by_date).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>

            {selected?.description && (
              <div className="border rounded-lg p-3 text-neutral-700 bg-neutral-50">
                {selected.description}
              </div>
            )}
          </div>
          <div className="flex justify-between items-center gap-2">
            <div className="flex gap-2">
              {(selected?.buyers?.email || selected?.buyer_email) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const email = selected?.buyers?.email || selected?.buyer_email;
                    const subject = encodeURIComponent(`Regarding proposal: ${selected?.title || ''}`);
                    const body = encodeURIComponent(selected?.description || '');
                    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
                  }}
                >
                  Share via Email
                </Button>
              )}
            </div>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
            <Button variant="destructive" onClick={() => handleDelete(selected?.id)}>
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Proposals;
