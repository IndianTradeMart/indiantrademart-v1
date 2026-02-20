
import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from '@/components/ui/use-toast';
import { Ticket } from 'lucide-react';

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

const RaiseTicketModal = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      toast({
        title: "Please fill all required fields",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      setOpen(false);
      setSubject('');
      setDescription('');
      toast({
        title: "Ticket Raised Successfully",
        description: "Your support ticket has been created. Reference ID: #TCK-8821",
        className: "bg-green-50 border-green-200 text-green-900",
      });
    }, 1000);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || <Button>Raise Ticket</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-[#003D82]" />
            Raise Support Ticket
          </DialogTitle>
          <DialogDescription>
            Describe your issue and we'll help you resolve it as quickly as possible.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Issue Type</Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="order">Order Issue</SelectItem>
                <SelectItem value="payment">Payment Problem</SelectItem>
                <SelectItem value="technical">Technical Support</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(sanitizeTicketSubject(e.target.value))}
              placeholder="Brief summary of the issue"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea 
              value={description}
              onChange={(e) => setDescription(sanitizeTicketDescription(e.target.value))}
              placeholder="Please provide detailed information..." 
              className="min-h-[100px]"
              required
            />
          </div>

          <DialogFooter>
             <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
             <Button type="submit" className="bg-[#003D82]" disabled={loading}>
                {loading ? 'Submitting...' : 'Submit Ticket'}
             </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RaiseTicketModal;
