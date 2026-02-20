
import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, X, Bot } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const ChatBotModal = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState([
    { id: 'intro', text: "Hi! I'm your TradeMart assistant. How can I help?", sender: 'bot' }
  ]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef(null);

  // Load history on open
  useEffect(() => {
    if (isOpen && user) {
      loadHistory();
    }
  }, [isOpen, user]);

  const loadHistory = async () => {
    const { data } = await supabase
      .from('chatbot_history')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(50);
      
    if (data && data.length > 0) {
      // Map DB schema to UI schema
      const history = data.map(m => ({
        id: m.id,
        text: m.message,
        sender: m.sender
      }));
      setMessages(prev => [...prev.filter(p => p.id === 'intro'), ...history]);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const text = inputValue;
    const tempId = Date.now();
    
    // UI Update
    setMessages(prev => [...prev, { id: tempId, text, sender: 'user' }]);
    setInputValue("");

    // Persist User Msg
    if (user) {
      await supabase.from('chatbot_history').insert([{
        user_id: user.id,
        message: text,
        sender: 'user'
      }]);
    }

    // Simulate Response
    setTimeout(async () => {
      const responses = [
        "I can help you with that. Could you provide more details?",
        "To update your profile, go to the 'My Profile' section.",
        "You can search for vendors using the top search bar.",
        "That's interesting! Let me check our records."
      ];
      const reply = responses[Math.floor(Math.random() * responses.length)];
      
      setMessages(prev => [...prev, { id: Date.now(), text: reply, sender: 'bot' }]);
      
      // Persist Bot Msg
      if (user) {
        await supabase.from('chatbot_history').insert([{
          user_id: user.id,
          message: reply,
          sender: 'bot'
        }]);
      }
    }, 1000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px] p-0 gap-0 overflow-hidden rounded-xl border-0 shadow-2xl">
        <div className="bg-[#003D82] p-4 flex justify-between items-center text-white">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm">TradeMart Assistant</h3>
              <p className="text-xs text-blue-200 flex items-center gap-1">
                <span className="h-2 w-2 bg-green-400 rounded-full block animate-pulse"></span> Online
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/10 rounded-full h-8 w-8">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="h-[400px] bg-gray-50 overflow-y-auto p-4 flex flex-col gap-3">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                msg.sender === 'user' ? 'bg-[#003D82] text-white rounded-tr-none' : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-3 bg-white border-t border-gray-100 flex gap-2">
          <Input 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type your message..." 
            className="flex-1 bg-gray-50 border-gray-200 focus-visible:ring-[#003D82]"
          />
          <Button onClick={handleSend} size="icon" className="bg-[#00A699] hover:bg-[#008c81] text-white shrink-0">
            <Send className="h-4 w-4 ml-0.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ChatBotModal;
