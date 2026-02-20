import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Send, MessageSquare, Trash2 } from 'lucide-react';
import { vendorApi } from '@/modules/vendor/services/vendorApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';

const SupportTicket = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');

  const displayId = useMemo(() => {
    if (!ticket) return '';
    return ticket.ticket_display_id || ticket.id?.slice(0, 8);
  }, [ticket]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await vendorApi.support.getTicketDetail(id);
        setTicket(data || null);
        setMessages(data?.messages || []);
      } catch (error) {
        console.error(error);
        toast({ title: 'Error', description: 'Failed to load ticket', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    if (id) load();
  }, [id]);

  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text || !ticket) return;
    setSending(true);
    try {
      const msg = await vendorApi.support.sendMessage(ticket.id, text);
      setMessages((prev) => [...prev, msg]);
      setNewMessage('');
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Failed to send message', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const getStatusBadge = (status) => {
    const upper = String(status || 'OPEN').toUpperCase();
    const styles = {
      OPEN: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
      CLOSED: 'bg-green-100 text-green-800 border-green-200',
    };
    return styles[upper] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getPriorityBadge = (priority) => {
    const upper = String(priority || 'MEDIUM').toUpperCase();
    const styles = {
      HIGH: 'bg-red-100 text-red-800 border-red-200',
      MEDIUM: 'bg-orange-100 text-orange-800 border-orange-200',
      LOW: 'bg-gray-100 text-gray-800 border-gray-200',
    };
    return styles[upper] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const handleDelete = async () => {
    if (!ticket) return;
    const ok = window.confirm('Delete this ticket permanently?');
    if (!ok) return;
    try {
      await vendorApi.support.deleteTicket(ticket.id);
      toast({ title: 'Ticket deleted' });
      navigate('/vendor/support');
    } catch (error) {
      console.error(error);
      toast({ title: 'Delete failed', description: error.message || 'Unable to delete ticket', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/vendor/support')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to tickets
        </Button>
        <div className="rounded-lg border p-6 text-center text-gray-500">
          Ticket not found.
        </div>
      </div>
    );
  }

  const isClosed = String(ticket.status || '').toUpperCase() === 'CLOSED';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate('/vendor/support')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to tickets
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="destructive" size="sm" className="flex items-center gap-1" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
          <Badge variant="outline" className={getPriorityBadge(ticket.priority)}>
            {String(ticket.priority || 'MEDIUM').toUpperCase()}
          </Badge>
          <Badge variant="outline" className={getStatusBadge(ticket.status)}>
            {String(ticket.status || 'OPEN').toUpperCase()}
          </Badge>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm space-y-2">
        <h1 className="text-2xl font-bold text-neutral-900">{ticket.subject || 'Support Ticket'}</h1>
        <p className="text-xs text-neutral-500">
          ID: #{displayId} • {ticket.created_at ? new Date(ticket.created_at).toLocaleString() : ''}
        </p>
        {ticket.description && (
          <p className="text-sm text-neutral-700">{ticket.description}</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-neutral-500" />
          <span className="text-sm font-semibold">Conversation</span>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-4 space-y-3 bg-neutral-50">
          {messages.length === 0 ? (
            <div className="text-center text-sm text-neutral-500 py-8">
              No messages yet.
            </div>
          ) : (
            messages.map((msg) => {
              const isVendor = String(msg.sender_type || '').toUpperCase() === 'VENDOR';
              return (
                <div key={msg.id} className={`flex ${isVendor ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                    isVendor ? 'bg-[#003D82] text-white' : 'bg-white border border-neutral-200 text-neutral-800'
                  }`}>
                    <div className="text-[10px] opacity-70 mb-1">
                      {isVendor ? 'You' : 'Support'} • {msg.created_at ? new Date(msg.created_at).toLocaleString() : ''}
                    </div>
                    <div>{msg.message}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {!isClosed && (
          <div className="border-t bg-white p-4">
            <div className="flex gap-2">
              <Textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message..."
                className="min-h-[70px]"
              />
              <Button
                className="bg-[#003D82]"
                onClick={handleSend}
                disabled={sending || !newMessage.trim()}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupportTicket;
