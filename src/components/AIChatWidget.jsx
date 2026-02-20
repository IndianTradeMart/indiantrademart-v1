import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Globe2, Loader2, X, Minimize2, Maximize2, User, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const API_URL = '/api/chat';
const DEFAULT_PROVIDER = 'openai';

// ITM Brand Colors - professional blue & orange theme
const colors = {
  primary: '#1e3a8a',      // Deep Blue
  secondary: '#ff6b35',    // Vibrant Orange
  accent: '#0ea5e9',       // Sky Blue
  success: '#10b981',      // Green
  background: '#f8fafc',   // Light Gray
  text: '#1e293b',         // Dark Gray
};

const uiCopy = {
  en: {
    title: 'ITM Support',
    subtitle: 'We\'re here to help',
    placeholder: 'Type your message here...',
    send: 'Send',
    language: 'Language',
    quick: 'How can we help you?',
    typing: 'Typing...',
    error: 'Connection error. Please try again.',
    welcome: 'Hello! Welcome to Indian Trade Mart - India\'s leading B2B marketplace. Looking for products or suppliers? I\'m here to help!',
    online: 'Online',
  },
  hi: {
    title: 'ITM सपोर्ट',
    subtitle: 'हम आपकी मदद के लिए यहाँ हैं',
    placeholder: 'अपना संदेश यहाँ लिखें...',
    send: 'भेजें',
    language: 'भाषा',
    quick: 'हम आपकी कैसे मदद कर सकते हैं?',
    typing: 'लिख रहे हैं...',
    error: 'कनेक्शन त्रुटि। कृपया पुनः प्रयास करें।',
    welcome: 'नमस्ते! Indian Trade Mart में आपका स्वागत है - भारत का अग्रणी B2B मार्केटप्लेस। उत्पाद या सप्लायर खोज रहे हैं? मैं मदद के लिए यहाँ हूँ!',
    online: 'ऑनलाइन',
  },
};

const quickPrompts = [
  { en: 'Browse Products', hi: 'उत्पाद देखें', icon: '🛍️' },
  { en: 'Find Suppliers', hi: 'सप्लायर खोजें', icon: '🏭' },
  { en: 'Post Requirement', hi: 'आवश्यकता पोस्ट करें', icon: '📋' },
  { en: 'Get Quote', hi: 'कोटेशन पाएं', icon: '💰' },
];

const AIChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [language, setLanguage] = useState('en');
  const [provider] = useState(DEFAULT_PROVIDER);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const [viewport, setViewport] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  });

  const copy = uiCopy[language] || uiCopy.en;
  const isMobile = viewport.width < 640;

  useEffect(() => {
    setMessages([{ id: 'welcome', role: 'assistant', text: copy.welcome }]);
  }, [language]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen && !isCollapsed) {
      inputRef.current?.focus();
    }
  }, [isOpen, isCollapsed]);

  useEffect(() => {
    const onResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;
    setError('');
    const userMsg = { id: Date.now(), role: 'user', text: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = [...messages, userMsg].map(({ role, text }) => ({
        role: role === 'assistant' ? 'assistant' : 'user',
        text,
      }));

      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, provider, language }),
      });

      if (!resp.ok) throw new Error('API error');
      const data = await resp.json();
      const botText = data.text || copy.error;
      setMessages((prev) => [...prev, { id: `bot-${Date.now()}`, role: 'assistant', text: botText }]);
    } catch (e) {
      console.error(e);
      setError('Unable to connect. Please check your connection.');
      setTimeout(() => setError(''), 4000);
    } finally {
      setLoading(false);
    }
  };

  const handleQuick = (prompt) => {
    sendMessage(prompt);
  };

  const handleOpen = () => {
    setIsOpen(true);
    setIsCollapsed(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    setIsCollapsed(false);
  };

  // Chat Button - ITM Style
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-[9999] group"
        aria-label="Open chat support"
      >
        <div className="relative">
          <div 
            className="h-9 w-9 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110"
            style={{
              background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.accent} 100%)`,
              boxShadow: '0 10px 40px rgba(30, 58, 138, 0.4)',
            }}
          >
            <MessageCircle className="h-8 w-8 text-white" strokeWidth={2} />
          </div>
          {/* Online indicator */}
          <span 
            className="absolute top-0 right-0 h-5 w-5 rounded-full border-[3px] border-white animate-pulse"
            style={{ backgroundColor: colors.success }}
          />
          {/* Notification badge */}
          <span 
            className="absolute -top-1 -right-1 h-6 w-6 rounded-full text-white text-xs font-bold flex items-center justify-center"
            style={{ backgroundColor: colors.secondary }}
          >
            1
          </span>
        </div>
      </button>
    );
  }

  // Chat Panel
  const panelWidth = isMobile ? Math.min(viewport.width - 20, 360) : 360;
  const panelHeight = isMobile 
    ? Math.min(viewport.height - 60, 520) 
    : Math.min(viewport.height * 0.7, 550);

  return (
    <div
      className="fixed z-[9999] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      style={{
        width: panelWidth,
        height: isCollapsed ? 'auto' : panelHeight,
        bottom: isMobile ? 10 : 24,
        right: isMobile ? '50%' : 24,
        transform: isMobile ? 'translateX(50%)' : 'none',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* Header - ITM Branded */}
      <div 
        className="relative px-4 py-3 text-white overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.accent} 100%)`,
        }}
      >
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full blur-3xl transform translate-x-16 -translate-y-16" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white rounded-full blur-2xl transform -translate-x-12 translate-y-12" />
        </div>
        
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div 
                className="h-10 w-10 rounded-full flex items-center justify-center shadow-lg border-2 border-white/20"
                style={{
                  background: `linear-gradient(135deg, ${colors.secondary} 0%, #ff8c61 100%)`,
                }}
              >
                <Bot className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <span 
                className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white"
                style={{ backgroundColor: colors.success }}
              />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">
                {copy.title}
              </h3>
              <p className="text-[11px] text-white/90 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: colors.success }} />
                {copy.online} • {copy.subtitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="h-8 w-8 text-white hover:bg-white/20 rounded-lg transition-colors"
            >
              {isCollapsed ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-8 w-8 text-white hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Language Switcher */}
        {!isCollapsed && (
          <div className="relative mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-white/80">
              <Globe2 className="h-3 w-3" />
              <span>{copy.language}</span>
            </div>
            <div className="flex gap-1.5 bg-white/15 backdrop-blur-sm rounded-lg p-0.5">
              {['en', 'hi'].map((lng) => (
                <button
                  key={lng}
                  onClick={() => setLanguage(lng)}
                  className={cn(
                    'px-3 py-1 rounded-md text-[11px] font-semibold transition-all duration-200',
                    language === lng
                      ? 'bg-white text-blue-900 shadow-sm'
                      : 'text-white/90 hover:bg-white/10'
                  )}
                >
                  {lng === 'en' ? 'EN' : 'हिं'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {!isCollapsed && (
        <>
          {/* Messages Area */}
          <div
            className="flex-1 overflow-y-auto px-3 py-3"
            style={{ 
              background: `linear-gradient(to bottom, #f8fafc 0%, #ffffff 100%)`,
              scrollbarWidth: 'thin',
              scrollbarColor: `${colors.accent} transparent`,
            }}
          >
            <div className="space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'flex gap-2 animate-in slide-in-from-bottom-3 duration-300',
                    m.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {m.role === 'assistant' && (
                    <div 
                      className="h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm"
                      style={{ 
                        background: `linear-gradient(135deg, ${colors.secondary} 0%, #ff8c61 100%)`,
                      }}
                    >
                      <Bot className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                    </div>
                  )}
                  <div
                    className={cn(
                      'px-3 py-2 rounded-2xl max-w-[75%] text-xs leading-relaxed shadow-sm',
                      m.role === 'user'
                        ? 'rounded-tr-md text-white'
                        : 'rounded-tl-md bg-white text-gray-800 border border-gray-200'
                    )}
                    style={m.role === 'user' ? {
                      background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.accent} 100%)`,
                    } : {}}
                  >
                    {m.text}
                  </div>
                  {m.role === 'user' && (
                    <div 
                      className="h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: colors.background }}
                    >
                      <User className="h-3.5 w-3.5" style={{ color: colors.primary }} strokeWidth={2.5} />
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-2 justify-start animate-in fade-in duration-300">
                  <div 
                    className="h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm"
                    style={{ 
                      background: `linear-gradient(135deg, ${colors.secondary} 0%, #ff8c61 100%)`,
                    }}
                  >
                    <Bot className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-2xl rounded-tl-md border border-gray-200 text-xs">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: colors.accent }} />
                    <span className="text-gray-600">{copy.typing}</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Quick Actions */}
          {messages.length <= 1 && (
            <div className="px-3 py-2.5 border-t border-gray-100 bg-gray-50/50">
              <p className="text-[11px] font-semibold mb-2" style={{ color: colors.text }}>
                {copy.quick}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {quickPrompts.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleQuick(p[language] || p.en)}
                    className="group flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-700 hover:border-blue-500 hover:shadow-sm transition-all duration-200"
                  >
                    <span className="text-sm">{p.icon}</span>
                    <span className="text-[11px] group-hover:text-blue-700">{p[language] || p.en}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="px-3 py-3 border-t border-gray-200 bg-white">
            {error && (
              <div 
                className="mb-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border"
                style={{
                  backgroundColor: '#fee2e2',
                  borderColor: '#fca5a5',
                  color: '#991b1b',
                }}
              >
                {error}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
                placeholder={copy.placeholder}
                disabled={loading}
                className="flex-1 border-gray-300 focus-visible:ring-2 rounded-lg text-xs h-9"
                style={{
                  '--tw-ring-color': colors.accent,
                }}
              />
              <Button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                className="h-9 px-3 text-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 font-semibold text-xs"
                style={{
                  background: loading || !input.trim() 
                    ? '#94a3b8' 
                    : `linear-gradient(135deg, ${colors.secondary} 0%, #ff8c61 100%)`,
                }}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Footer Branding */}
          <div className="px-3 py-2 border-t border-gray-100 bg-gradient-to-r from-blue-50 to-orange-50 text-center">
            <p className="text-[10px] font-medium" style={{ color: colors.text }}>
              Powered by <span className="font-bold" style={{ color: colors.primary }}>Indian Trade Mart</span>
            </p>
          </div>
        </>
      )}

      {isCollapsed && (
        <div className="px-4 py-3 bg-gray-50/50 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: colors.text }}>
              Chat minimized
            </p>
            <Button
              size="sm"
              onClick={() => setIsCollapsed(false)}
              className="h-8 px-3 text-white font-semibold text-xs shadow-sm hover:shadow-md transition-all"
              style={{
                background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.accent} 100%)`,
              }}
            >
              Expand
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIChatWidget;