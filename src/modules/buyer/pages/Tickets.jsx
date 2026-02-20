
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, MessageSquare, Filter, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { buyerApi } from '@/modules/buyer/services/buyerApi';
import { toast } from '@/components/ui/use-toast';
import { mapStatusToValid } from '@/shared/constants/ticketStatusMapping';

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

const Tickets = () => {
  const { buyerId } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [open, setOpen] = useState(false);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    priority: 'MEDIUM',
    status: 'OPEN'
  });
  
  const [errors, setErrors] = useState({});

  useEffect(() => {
    fetchTickets();
  }, [buyerId]);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const data = await buyerApi.getTickets();
      setTickets(data);
    } catch (error) {
      console.error("Fetch error:", error);
      toast({ title: "Error", description: "Failed to load tickets", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.subject.trim()) newErrors.subject = "Subject is required";
    else if (formData.subject.length < 5) newErrors.subject = "Subject must be at least 5 characters";
    
    if (!formData.description.trim()) newErrors.description = "Description is required";
    else if (formData.description.length < 10) newErrors.description = "Description must be at least 10 characters";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast({ title: "Validation Error", description: "Please check the form for errors.", variant: "destructive" });
      return;
    }

    setSubmitLoading(true);

    try {
      const validStatus = mapStatusToValid(formData.status);
      
      await buyerApi.createTicket({
        subject: formData.subject,
        description: formData.description,
        priority: formData.priority,
        status: validStatus
      });

      toast({ 
        title: "Success", 
        description: "Support ticket raised successfully!", 
        className: "bg-green-50 border-green-200 text-green-900" 
      });
      
      setTimeout(() => {
        setOpen(false);
        setFormData({ subject: '', description: '', priority: 'MEDIUM', status: 'OPEN' });
        fetchTickets();
      }, 300);

    } catch (error) {
      console.error('Ticket error:', error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to raise ticket. Please try again.", 
        variant: "destructive" 
      });
    } finally {
      setSubmitLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'OPEN': return 'bg-blue-100 text-blue-800 hover:bg-blue-200';
      case 'IN_PROGRESS': return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200';
      case 'CLOSED': return 'bg-green-100 text-green-800 hover:bg-green-200';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'HIGH': return 'text-red-600 bg-red-50 border-red-200';
      case 'MEDIUM': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'LOW': return 'text-gray-600 bg-gray-50 border-gray-200';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    if (statusFilter !== 'ALL' && ticket.status !== statusFilter) return false;
    if (priorityFilter !== 'ALL' && ticket.priority !== priorityFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
           <h1 className="text-3xl font-bold tracking-tight">Support Tickets</h1>
           <p className="text-gray-500">Manage your support requests and inquiries</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#003D82]">
              <Plus className="mr-2 h-4 w-4" /> New Ticket
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Raise Support Ticket</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject *</Label>
                <Input 
                  id="subject" 
                  value={formData.subject}
                  onChange={(e) => {
                    setFormData({...formData, subject: sanitizeTicketSubject(e.target.value)});
                    if (errors.subject) setErrors({...errors, subject: null});
                  }}
                  placeholder="Brief issue summary"
                  className={errors.subject ? "border-red-500" : ""}
                />
                {errors.subject && <p className="text-xs text-red-500">{errors.subject}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority *</Label>
                <Select 
                  value={formData.priority} 
                  onValueChange={(val) => setFormData({...formData, priority: val})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low - General Inquiry</SelectItem>
                    <SelectItem value="MEDIUM">Medium - Functional Issue</SelectItem>
                    <SelectItem value="HIGH">High - Critical Issue</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="desc">Description *</Label>
                <Textarea 
                  id="desc"
                  value={formData.description}
                  onChange={(e) => {
                    setFormData({...formData, description: sanitizeTicketDescription(e.target.value)});
                    if (errors.description) setErrors({...errors, description: null});
                  }}
                  placeholder="Describe your issue in detail..."
                  className={`min-h-[120px] ${errors.description ? "border-red-500" : ""}`}
                />
                {errors.description && <p className="text-xs text-red-500">{errors.description}</p>}
              </div>

              <Button type="submit" className="w-full bg-[#003D82]" disabled={submitLoading}>
                {submitLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...
                  </>
                ) : 'Submit Ticket'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-4 p-4 bg-white rounded-lg border shadow-sm flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium">Filters:</span>
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Priorities</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="grid gap-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-lg bg-gray-50">
            <MessageSquare className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">No tickets found</h3>
            <p className="mt-1 text-sm text-gray-500">Get started by creating a new support ticket.</p>
          </div>
        ) : (
          filteredTickets.map((ticket) => (
            <Card key={ticket.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3 pt-4 px-4 sm:px-6">
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-semibold text-[#003D82]">{ticket.subject}</CardTitle>
                      <Badge variant="outline" className={`text-xs ${getPriorityColor(ticket.priority)}`}>
                        {ticket.priority}
                      </Badge>
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span>ID: #{ticket.id.slice(0, 8).toUpperCase()}</span>
                      <span>•</span>
                      <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Badge className={`${getStatusColor(ticket.status)} border-0`}>
                    {ticket.status.replace('_', ' ')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 sm:px-6 pb-4">
                <p className="text-sm text-gray-600 line-clamp-2">{ticket.description}</p>
                {ticket.status !== 'CLOSED' && (
                  <div className="mt-3 flex justify-end">
                     <Button variant="ghost" size="sm" className="text-xs h-7 text-gray-500">
                        View Details
                     </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default Tickets;
