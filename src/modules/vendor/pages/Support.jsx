
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlusCircle, MessageCircle, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { vendorApi } from '@/modules/vendor/services/vendorApi';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from '@/components/ui/use-toast';

const sanitizeTicketSubject = (value) =>
  String(value || '')
    .replace(/[^\p{L}\p{N}\s.,:;!?()'"&/@#-]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s+/, '')
    .slice(0, 120);

const sanitizeTicketDescription = (value) =>
  String(value || '')
    .replace(/[^\p{L}\p{N}\s.,:;!?()'"&/@#\-_\n]/gu, '')
    .replace(/\r\n/g, '\n')
    .slice(0, 1500);

const Support = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [newTicket, setNewTicket] = useState({ subject: '', category: '', description: '', priority: 'Medium' });
  const [creating, setCreating] = useState(false);
  const [viewFilter, setViewFilter] = useState('OPEN'); // OPEN | CLOSED | ALL

  useEffect(() => {
    loadTickets();
  }, []);

  const loadTickets = async () => {
    try {
      const data = await vendorApi.support.getTickets();
      setTickets(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (ticketId) => {
    if (!ticketId) return;
    const ok = window.confirm('Delete this ticket permanently?');
    if (!ok) return;
    try {
      await vendorApi.support.deleteTicket(ticketId);
      setTickets((prev) => prev.filter((t) => t.id !== ticketId));
      toast({ title: 'Ticket deleted' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Delete failed', description: error.message || 'Unable to delete ticket', variant: 'destructive' });
    }
  };

  const handleCreate = async () => {
    if (!newTicket.subject || !newTicket.description || !newTicket.category) {
      toast({ title: "Please fill all fields", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      await vendorApi.support.createTicket(newTicket);
      setOpen(false);
      setNewTicket({ subject: '', category: '', description: '', priority: 'Medium' });
      loadTickets();
      toast({ title: "Ticket Created" });
    } catch (error) {
      toast({
        title: "Error creating ticket",
        description: error?.message || "Please try again",
        variant: "destructive"
      });
    } finally {
      setCreating(false);
    }
  };

  const filteredTickets = tickets.filter((t) => {
    const status = String(t.status || '').toUpperCase();
    if (viewFilter === 'ALL') return true;
    if (viewFilter === 'OPEN') return status !== 'CLOSED';
    if (viewFilter === 'CLOSED') return status === 'CLOSED';
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Support Tickets</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#003D82]">
              <PlusCircle className="mr-2 h-4 w-4" /> New Ticket
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Support Ticket</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  value={newTicket.subject}
                  onChange={(e) =>
                    setNewTicket({ ...newTicket, subject: sanitizeTicketSubject(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select onValueChange={v => setNewTicket({...newTicket, category: v})}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Technical">Technical Issue</SelectItem>
                    <SelectItem value="Billing">Billing & Payments</SelectItem>
                    <SelectItem value="Account">Account Management</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-gray-500">Priority will be set by our support team based on urgency.</p>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={newTicket.description}
                  onChange={(e) =>
                    setNewTicket({ ...newTicket, description: sanitizeTicketDescription(e.target.value) })
                  }
                />
              </div>
              <Button className="w-full bg-[#003D82]" onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null} Submit Ticket
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2">
        {['OPEN', 'CLOSED', 'ALL'].map((f) => (
          <Button
            key={f}
            variant={viewFilter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewFilter(f)}
          >
            {f === 'ALL' ? 'All Tickets' : f === 'OPEN' ? 'Open' : 'Closed'}
          </Button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto h-8 w-8 text-gray-400" /></div>
        ) : filteredTickets.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No tickets found.</div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {filteredTickets.map(ticket => (
              <div key={ticket.id} className="flex items-center gap-3 hover:bg-neutral-50 px-4 py-3 transition-colors">
                <Link to={`/vendor/support/${ticket.id}`} className="flex-1 min-w-0 flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                    <MessageCircle className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-neutral-900 truncate">{ticket.subject}</h3>
                    <p className="text-xs text-neutral-500 truncate">ID: #{ticket.ticket_display_id || ticket.id.slice(0,8)} • {new Date(ticket.created_at).toLocaleDateString()}</p>
                  </div>
                </Link>
                <Badge variant={ticket.status === 'OPEN' ? 'warning' : ticket.status === 'CLOSED' ? 'secondary' : 'default'}>
                  {ticket.status}
                </Badge>
                <Button size="icon" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => handleDelete(ticket.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Support;
