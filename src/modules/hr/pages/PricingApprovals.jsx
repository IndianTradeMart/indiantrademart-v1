
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Modal from '@/shared/components/Modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, X } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const PricingApprovals = () => {
  const [approvals, setApprovals] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [actionType, setActionType] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchApprovals = async () => {
      try {
        const { data, error } = await supabase
          .from('vendor_plans')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setApprovals(data || []);
      } catch (error) {
        console.error('Failed to fetch approvals:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchApprovals();
  }, []);

  const openModal = (item, type) => {
    setSelectedItem(item);
    setActionType(type);
    setRemarks('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setApprovals(approvals.filter(a => a.id !== selectedItem.id));
    toast({ 
      title: actionType === 'APPROVE' ? "Price Approved" : "Price Rejected",
      description: `Request for ${selectedItem.product} processed.`
    });
    setSelectedItem(null);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-neutral-800">Pricing Approvals Queue</h2>

      <div className="bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Old Price</TableHead>
              <TableHead>New Price</TableHead>
              <TableHead>Requested By</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {approvals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-neutral-500">No pending approvals.</TableCell>
              </TableRow>
            ) : (
              approvals.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.vendor}</TableCell>
                  <TableCell>{item.product}</TableCell>
                  <TableCell className="text-neutral-500 line-through">₹{item.oldPrice}</TableCell>
                  <TableCell className="font-bold text-green-600">₹{item.newPrice}</TableCell>
                  <TableCell>{item.requestedBy}</TableCell>
                  <TableCell>{item.date}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 h-8" onClick={() => openModal(item, 'APPROVE')}>
                        <Check className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="destructive" className="h-8" onClick={() => openModal(item, 'REJECT')}>
                        <X className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {selectedItem && (
        <Modal
          isOpen={!!selectedItem}
          onClose={() => setSelectedItem(null)}
          title={actionType === 'APPROVE' ? "Confirm Approval" : "Reject Request"}
          size="sm"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-neutral-600">
              You are about to <strong>{actionType === 'APPROVE' ? 'approve' : 'reject'}</strong> the price change for 
              <br/>
              <span className="font-semibold">{selectedItem.product}</span> by {selectedItem.vendor}.
            </p>
            <div>
              <Label>Remarks (Optional)</Label>
              <Input 
                value={remarks} 
                onChange={(e) => setRemarks(e.target.value)} 
                placeholder="Add internal note..."
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setSelectedItem(null)}>Cancel</Button>
              <Button 
                type="submit" 
                className={actionType === 'APPROVE' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
              >
                Confirm {actionType === 'APPROVE' ? 'Approval' : 'Rejection'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default PricingApprovals;
