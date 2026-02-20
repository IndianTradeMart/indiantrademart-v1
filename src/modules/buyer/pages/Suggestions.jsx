
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Lightbulb, Send } from 'lucide-react';
import { buyerApi } from '@/modules/buyer/services/buyerApi';
import { toast } from '@/components/ui/use-toast';

const Suggestions = () => {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ subject: '', message: '' });

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const data = await buyerApi.getSuggestions();
      setSuggestions(data);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load suggestions", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.subject.trim() || !formData.message.trim()) {
      toast({ title: "Error", description: "Please fill all fields", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      await buyerApi.createSuggestion({ ...formData });
      
      toast({ title: "Success", description: "Thank you for your suggestion!", className: "bg-green-50" });
      setFormData({ subject: '', message: '' });
      fetchSuggestions();
    } catch (error) {
      toast({ title: "Error", description: "Failed to submit suggestion", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
         <h1 className="text-3xl font-bold tracking-tight">Suggestions & Feedback</h1>
         <p className="text-gray-500">Help us improve your experience on IndianTradeMart</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Submission Form */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                Submit Suggestion
              </CardTitle>
              <CardDescription>Share your ideas or report data issues.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input 
                    id="subject"
                    placeholder="Topic..."
                    value={formData.subject}
                    onChange={(e) => setFormData({...formData, subject: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea 
                    id="message"
                    placeholder="Tell us what you think..."
                    className="min-h-[120px]"
                    value={formData.message}
                    onChange={(e) => setFormData({...formData, message: e.target.value})}
                  />
                </div>
                <Button type="submit" className="w-full bg-[#003D82]" disabled={submitting}>
                  {submitting ? <Loader2 className="animate-spin h-4 w-4" /> : <><Send className="mr-2 h-4 w-4" /> Submit</>}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* List of Suggestions */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold">Your History</h2>
          {loading ? (
             <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-400" /></div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-10 border rounded-lg bg-gray-50 text-gray-500">
              No suggestions submitted yet.
            </div>
          ) : (
            suggestions.map(item => (
              <Card key={item.id}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-medium text-[#003D82]">{item.subject}</h3>
                    <span className="text-xs text-gray-400">{new Date(item.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">{item.message}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Suggestions;
