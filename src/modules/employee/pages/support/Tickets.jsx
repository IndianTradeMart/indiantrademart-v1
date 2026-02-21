import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supportApi } from '@/modules/employee/services/supportApi';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search, Eye, MessageSquare, Send, Loader2, Filter,
  User, Building2, Calendar, Bell, Mail
} from 'lucide-react';

const Tickets = () => {
  const location = useLocation();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketMessages, setTicketMessages] = useState([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [customerNotice, setCustomerNotice] = useState('');
  const [notifyingCustomer, setNotifyingCustomer] = useState(false);

  const ticketScope = location.pathname.endsWith('/vendor')
    ? 'VENDOR'
    : location.pathname.endsWith('/buyer')
      ? 'BUYER'
      : 'ALL';

  useEffect(() => {
    fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, priorityFilter, searchTerm, ticketScope]);

  const fetchTickets = async () => {
    try {
      setLoading(true);

      const filters = {
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        priority: priorityFilter !== 'ALL' ? priorityFilter : undefined,
        search: searchTerm || undefined,
        scope: ticketScope,
      };

      const data = await supportApi.getAllTickets(filters);
      setTickets(data || []);
    } catch (error) {
      console.error('Failed to fetch tickets:', error);
      toast({ title: "Error", description: "Failed to load tickets", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const openTicketDetails = async (ticket) => {
    setSelectedTicket(ticket);
    setDetailsOpen(true);
    setNewMessage("");
    setCustomerNotice(String(ticket?.description || ticket?.subject || '').trim());

    try {
      const msgs = await supportApi.getMessages(ticket.id);
      setTicketMessages(msgs || []);
    } catch (e) {
      console.error(e);
      setTicketMessages([]);
    }
  };

  const getTicketContact = (ticket) => {
    if (!ticket) return { type: 'UNKNOWN', email: '', label: '' };
    if (ticket.vendor_id) {
      return {
        type: 'VENDOR',
        email: ticket?.vendors?.email || '',
        label: ticket?.vendors?.company_name || ticket?.vendors?.owner_name || 'Vendor',
      };
    }
    if (ticket.buyer_id) {
      return {
        type: 'BUYER',
        email: ticket?.buyers?.email || '',
        label: ticket?.buyers?.full_name || ticket?.buyers?.company_name || 'Buyer',
      };
    }
    return { type: 'UNKNOWN', email: '', label: '' };
  };

  const handleNotifyCustomer = async () => {
    if (!selectedTicket) return;
    setNotifyingCustomer(true);
    try {
      const message = customerNotice.trim() || selectedTicket.description || selectedTicket.subject || 'Support update';
      await supportApi.notifyCustomer(selectedTicket.id, message);
      toast({ title: 'Notification sent', description: 'Bell notification sent to customer dashboard.' });
    } catch (error) {
      toast({
        title: 'Notification failed',
        description: error?.message || 'Could not notify customer',
        variant: 'destructive',
      });
    } finally {
      setNotifyingCustomer(false);
    }
  };

  const handleSendEmail = () => {
    if (!selectedTicket) return;
    const contact = getTicketContact(selectedTicket);
    if (!contact.email) {
      toast({ title: 'No email found', description: 'Customer email is not available for this ticket.', variant: 'destructive' });
      return;
    }
    const subject = encodeURIComponent(`Support Update: ${selectedTicket.subject || selectedTicket.ticket_display_id || 'Ticket'}`);
    const body = encodeURIComponent(customerNotice.trim() || selectedTicket.description || '');
    window.location.href = `mailto:${contact.email}?subject=${subject}&body=${body}`;
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedTicket) return;

    setSendingMessage(true);
    const messageText = newMessage.trim();

    try {
      await supportApi.sendMessage(selectedTicket.id, messageText);
      setNewMessage('');
      toast({ title: "Message sent" });

      // ✅ reload from API so reopen pe bhi same dikhe
      const msgs = await supportApi.getMessages(selectedTicket.id);
      setTicketMessages(msgs || []);
    } catch (error) {
      console.error('Failed to send message:', error);
      toast({ title: "Error", description: error.message || "Failed to send message", variant: "destructive" });
    } finally {
      setSendingMessage(false);
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    if (!selectedTicket) return;

    setUpdatingStatus(true);
    try {
      const response = await fetchWithCsrf(apiUrl(`/api/support/tickets/${selectedTicket.id}/status`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to update status');

      setSelectedTicket({ ...result.ticket });
      setTickets(tickets.map(t => (t.id === selectedTicket.id ? result.ticket : t)));

      toast({ title: "Status updated", description: `Ticket marked as ${newStatus}` });
    } catch (error) {
      console.error('Failed to update status:', error);
      toast({ title: "Error", description: error.message || "Failed to update status", variant: "destructive" });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getStatusBadge = (status) => {
    const upper = String(status || 'OPEN').toUpperCase();
    const styles = {
      'OPEN': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'IN_PROGRESS': 'bg-blue-100 text-blue-800 border-blue-200',
      'CLOSED': 'bg-green-100 text-green-800 border-green-200',
      'RESOLVED': 'bg-green-100 text-green-800 border-green-200'
    };
    return styles[upper] || 'bg-gray-100 text-gray-800';
  };

  const getPriorityBadge = (priority) => {
    const upper = String(priority || 'MEDIUM').toUpperCase();
    const styles = {
      'HIGH': 'bg-red-100 text-red-800 border-red-200',
      'MEDIUM': 'bg-orange-100 text-orange-800 border-orange-200',
      'LOW': 'bg-gray-100 text-gray-800 border-gray-200'
    };
    return styles[upper] || 'bg-gray-100 text-gray-800';
  };

  const filteredTickets = tickets.filter(ticket => {
    const s = searchTerm.toLowerCase();
    const matchesSearch =
      !s ||
      ticket.subject?.toLowerCase().includes(s) ||
      ticket.description?.toLowerCase().includes(s) ||
      ticket.ticket_display_id?.toLowerCase().includes(s) ||
      ticket?.vendors?.company_name?.toLowerCase().includes(s) ||
      ticket?.vendors?.email?.toLowerCase().includes(s) ||
      ticket?.buyers?.full_name?.toLowerCase().includes(s) ||
      ticket?.buyers?.email?.toLowerCase().includes(s);

    const ticketStatus = String(ticket.status || '').toUpperCase();
    const ticketPriority = String(ticket.priority || '').toUpperCase();

    const matchesStatus = statusFilter === 'ALL' || ticketStatus === statusFilter;
    const matchesPriority = priorityFilter === 'ALL' || ticketPriority === priorityFilter;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-neutral-800">
            {ticketScope === 'VENDOR' ? 'Help for Vendor' : ticketScope === 'BUYER' ? 'Help for Buyer' : 'Support Tickets'}
          </h2>
          <p className="text-gray-500">
            {ticketScope === 'VENDOR'
              ? 'Manage vendor-related support requests'
              : ticketScope === 'BUYER'
                ? 'Manage buyer-related support requests'
                : 'Manage and respond to customer support requests'}
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          {filteredTickets.length} Tickets
        </Badge>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 p-4 bg-white rounded-lg border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search tickets..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Priority</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>For</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Loader2 className="animate-spin mx-auto h-6 w-6 text-gray-400" />
                  </TableCell>
                </TableRow>
              ) : filteredTickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    No tickets found
                  </TableCell>
              </TableRow>
            ) : (
              filteredTickets.map(ticket => (
                <TableRow key={ticket.id} className="hover:bg-gray-50">
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm truncate max-w-[260px]">
                        {ticket.subject || 'No Subject'}
                      </p>
                      <p className="text-xs text-gray-500 truncate max-w-[260px]">
                        {ticket.description?.substring(0, 60)}...
                      </p>
                    </div>
                  </TableCell>

                  <TableCell>
                    {ticket.vendor_id ? (
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Building2 className="h-4 w-4 text-gray-400" />
                        <span className="truncate max-w-[180px]">{ticket?.vendors?.company_name || 'Vendor'}</span>
                      </div>
                    ) : ticket.buyer_id ? (
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <User className="h-4 w-4 text-gray-400" />
                        <span className="truncate max-w-[180px]">{ticket?.buyers?.full_name || ticket?.buyers?.company_name || 'Buyer'}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">General</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${getPriorityBadge(ticket.priority)}`}>
                      {String(ticket.priority || 'MEDIUM').toUpperCase()}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${getStatusBadge(ticket.status)}`}>
                      {String(ticket.status || 'OPEN').toUpperCase()}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-sm text-gray-500">
                    {ticket.created_at ? new Date(ticket.created_at).toLocaleDateString() : '—'}
                  </TableCell>

                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => openTicketDetails(ticket)}>
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Ticket Details
            </DialogTitle>
          </DialogHeader>

          {selectedTicket && (
            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{selectedTicket.subject}</h3>
                    <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                      <Calendar className="h-4 w-4" />
                      {new Date(selectedTicket.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className={getPriorityBadge(selectedTicket.priority)}>
                      {String(selectedTicket.priority || 'MEDIUM').toUpperCase()}
                    </Badge>
                    <Badge variant="outline" className={getStatusBadge(selectedTicket.status)}>
                      {String(selectedTicket.status || 'OPEN').toUpperCase()}
                    </Badge>
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <p className="text-sm font-medium text-gray-700">Description:</p>
                  <p className="text-sm text-gray-600 mt-1">{selectedTicket.description}</p>
                </div>
              </div>

              {(selectedTicket?.vendor_id || selectedTicket?.buyer_id) && (
                <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-blue-900">
                      {selectedTicket?.vendor_id ? 'Vendor Action' : 'Buyer Action'}
                    </span>
                    <Button size="sm" variant="outline" onClick={handleSendEmail}>
                      <Mail className="h-4 w-4 mr-1" /> Send Email
                    </Button>
                    <Button size="sm" className="bg-[#003D82]" onClick={handleNotifyCustomer} disabled={notifyingCustomer}>
                      {notifyingCustomer ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Bell className="h-4 w-4 mr-1" />}
                      Bell Notify
                    </Button>
                  </div>
                  <Textarea
                    value={customerNotice}
                    onChange={(e) => setCustomerNotice(e.target.value)}
                    placeholder="Write notification/email message for customer..."
                    className="min-h-[80px] bg-white"
                  />
                </div>
              )}

              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <span className="text-sm font-medium">Update Status:</span>
                <Select value={selectedTicket.status} onValueChange={handleUpdateStatus} disabled={updatingStatus}>
                  <SelectTrigger className="w-[150px] bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPEN">Open</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="CLOSED">Closed</SelectItem>
                  </SelectContent>
                </Select>
                {updatingStatus && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>

              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" /> Conversation
                </h4>

                <div className="space-y-3 max-h-[220px] overflow-y-auto p-2 bg-gray-50 rounded-lg">
                  {ticketMessages.length === 0 ? (
                    <p className="text-center text-gray-500 text-sm py-4">No messages yet</p>
                  ) : (
                    ticketMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`p-3 rounded-lg text-sm ${
                          String(msg.sender_type || '').toUpperCase() === 'SUPPORT'
                            ? 'bg-blue-100 ml-8'
                            : 'bg-white border mr-8'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium text-xs">
                            {String(msg.sender_type || '').toUpperCase() === 'SUPPORT' ? 'Support Team' : 'Customer'}
                          </span>
                          <span className="text-xs text-gray-500">
                            {msg.created_at ? new Date(msg.created_at).toLocaleString() : ''}
                          </span>
                        </div>
                        <p>{msg.message}</p>
                      </div>
                    ))
                  )}
                </div>

                {String(selectedTicket.status || '').toUpperCase() !== 'CLOSED' && (
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Type your reply..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      className="flex-1 min-h-[80px]"
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={sendingMessage || !newMessage.trim()}
                      className="bg-[#003D82]"
                    >
                      {sendingMessage ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Tickets;
