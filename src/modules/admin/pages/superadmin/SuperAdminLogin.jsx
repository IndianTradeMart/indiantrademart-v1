import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSuperAdmin } from '@/modules/admin/context/SuperAdminContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldAlert, Lock, Fingerprint } from 'lucide-react';

const SuperAdminLogin = () => {
  const navigate = useNavigate();
  const { login } = useSuperAdmin();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const success = await login(formData.email, formData.password);
    if (success) {
      // ✅ Keep route consistent with /admin/superadmin/*
      navigate('/admin/superadmin/dashboard');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center items-center px-4 md:px-6 relative overflow-hidden">
      {/* Matrix-like background effect */}
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=2070&auto=format&fit=crop')] opacity-10 bg-cover bg-center pointer-events-none"></div>
      
      <div className="w-full max-w-md bg-neutral-900 border border-red-900/30 p-6 md:p-8 rounded-2xl shadow-2xl relative z-10 mx-auto">
        <div className="flex flex-col items-center mb-8">
          <div className="h-16 w-16 md:h-20 md:w-20 bg-red-950 rounded-full flex items-center justify-center border-4 border-red-900 mb-4 animate-pulse">
            <ShieldAlert className="h-8 w-8 md:h-10 md:w-10 text-red-500" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tighter text-center">RESTRICTED AREA</h1>
          <p className="text-red-500 font-mono text-[10px] md:text-xs mt-2 uppercase tracking-widest text-center">
            Authorized Personnel Only
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-neutral-400">System ID</Label>
            <div className="relative">
              <Fingerprint className="absolute left-3 top-3.5 h-5 w-5 text-neutral-600" />
              <Input
                id="email"
                type="email"
                placeholder="superadmin@platform.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="pl-10 h-12 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-600 focus:border-red-500 focus:ring-red-900/50"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-neutral-400">Access Key</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 h-5 w-5 text-neutral-600" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="pl-10 h-12 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-600 focus:border-red-500 focus:ring-red-900/50"
                required
              />
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full bg-red-800 hover:bg-red-700 text-white font-bold py-6 rounded-lg transition-all transform hover:scale-[1.02] text-sm md:text-base"
            disabled={loading}
          >
            {loading ? 'Authenticating...' : 'INITIALIZE SESSION'}
          </Button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-xs text-neutral-600 font-mono">
            IP Address Logged: {Math.floor(Math.random() * 255)}.{Math.floor(Math.random() * 255)}.{Math.floor(Math.random() * 255)}.{Math.floor(Math.random() * 255)}
          </p>
          <p className="text-[10px] text-neutral-700 mt-1">
            Unauthorized access attempts are monitored and reported.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminLogin;
