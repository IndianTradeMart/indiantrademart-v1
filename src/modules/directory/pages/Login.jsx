import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ShoppingBag, Store, RefreshCw, Briefcase, Globe } from 'lucide-react';
import Logo from '@/shared/components/Logo';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const BUYER_CREDENTIAL_MESSAGE = 'This email is not registered as buyer';

const Login = () => {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  
  // 'buyer' or 'seller'
  const [activeTab, setActiveTab] = useState('buyer'); 
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  // Default credentials based on tab - Password empty by default
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  // Switch tab helper
  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    if (tab === 'buyer') {
      setFormData({ email: '', password: '' });
    } else {
      setFormData({ email: '', password: '' });
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (loading) return;
    const normalizedEmail = String(formData.email || '').trim().toLowerCase();

    if (!normalizedEmail) {
      toast({
         title: "Email Required",
         description: "Please enter your email.",
         variant: "destructive"
      });
      return;
    }
    if (!formData.password) {
      toast({
         title: "Password Required",
         description: "Please enter your password to continue.",
         variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      const roleHint = activeTab === 'buyer' ? 'BUYER' : 'VENDOR';

      if (roleHint === 'BUYER') {
        const { data: vendorByEmail, error: vendorLookupError } = await supabase
          .from('vendors')
          .select('id')
          .ilike('email', normalizedEmail)
          .limit(1)
          .maybeSingle();

        if (!vendorLookupError && vendorByEmail?.id) {
          throw new Error(BUYER_CREDENTIAL_MESSAGE);
        }
      }

      const { error } = await signIn(normalizedEmail, formData.password, { role: roleHint });
      if (error) throw error;
      
      toast({ title: "Welcome back!", description: "Successfully logged in." });
      
      if (activeTab === 'buyer') navigate('/buyer/dashboard');
      else navigate('/vendor/dashboard');

    } catch (error) {
      console.error("Login failed", error);
      toast({ 
        title: "Login Failed", 
        description: error.message || "Invalid credentials. Please try again.",
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetData = async () => {
    setResetting(true);
    try {
      const { error } = await supabase.functions.invoke('reseed-users');
      if (error) throw error;
      toast({ title: "Success", description: "Database reset to original 7 demo users." });
      setShowResetDialog(false);
      handleTabSwitch(activeTab);
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Hero */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 relative flex-col justify-between p-12 text-white overflow-hidden">
         {/* Professional Background Gradient & Texture */}
         <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 opacity-90"></div>
         <div className="absolute inset-0 opacity-20" style={{backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '24px 24px'}}></div>
         
         <div className="relative z-10">
            <Logo to="/" className="h-8 brightness-0 invert" showTagline={true} variant="light" />
         </div>

         <div className="relative z-10 max-w-xl">
            <h1 className="text-5xl font-bold leading-tight mb-6">
               The Gateway to <br/> 
               <span className="text-blue-400">Global Trade</span>
            </h1>
            <p className="text-lg text-slate-300 leading-relaxed mb-8">
               Join millions of businesses on India's most trusted B2B marketplace. Connect, trade, and grow your network today with secure payments and verified partners.
            </p>
            
            <div className="flex gap-12 mt-12 border-t border-slate-700 pt-8">
               <div>
                  <div className="text-4xl font-bold text-white mb-1">5M+</div>
                  <div className="text-sm text-slate-400 uppercase tracking-wide font-medium">Verified Suppliers</div>
               </div>
               <div>
                  <div className="text-4xl font-bold text-white mb-1">20M+</div>
                  <div className="text-sm text-slate-400 uppercase tracking-wide font-medium">Products Listed</div>
               </div>
            </div>
         </div>

         <div className="relative z-10 flex justify-between items-center text-xs text-slate-500">
            <p>© 2024 IndianTradeMart. All rights reserved.</p>
            <div className="flex gap-4">
              <span className="hover:text-slate-300 cursor-pointer">Privacy</span>
              <span className="hover:text-slate-300 cursor-pointer">Terms</span>
            </div>
         </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-20 xl:px-24 bg-white">
         <div className="mx-auto w-full max-w-sm lg:w-96">
            <div className="mb-10">
               <h2 className="text-3xl font-bold text-slate-900">Welcome Back</h2>
               <p className="mt-2 text-sm text-slate-600">Please sign in to your account to continue</p>
            </div>

            {/* Role Toggle */}
            <div className="bg-slate-100 p-1 rounded-lg flex mb-8">
               <button 
                  onClick={() => handleTabSwitch('buyer')}
                  className={`flex-1 flex items-center justify-center py-2.5 text-sm font-medium rounded-md transition-all ${
                     activeTab === 'buyer' 
                     ? 'bg-white text-blue-700 shadow-sm border border-slate-200' 
                     : 'text-slate-500 hover:text-slate-900'
                  }`}
               >
                  <ShoppingBag className="w-4 h-4 mr-2" />
                  Buyer
               </button>
               <button 
                  onClick={() => handleTabSwitch('seller')}
                  className={`flex-1 flex items-center justify-center py-2.5 text-sm font-medium rounded-md transition-all ${
                     activeTab === 'seller' 
                     ? 'bg-white text-blue-700 shadow-sm border border-slate-200' 
                     : 'text-slate-500 hover:text-slate-900'
                  }`}
               >
                  <Store className="w-4 h-4 mr-2" />
                  Supplier
               </button>
            </div>

            <form className="space-y-6" onSubmit={handleLogin}>
               <div>
                  <Label htmlFor="email" className="text-slate-700">Email or Mobile Number</Label>
                  <Input 
                     id="email" 
                     name="email" 
                     type="email" 
                     required 
                     className="mt-1 h-11 bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500" 
                     value={formData.email} 
                     onChange={handleChange}
                     placeholder="name@example.com"
                  />
               </div>

               <div>
               <div className="flex justify-between items-center mb-1">
                     <Label htmlFor="password" className="text-slate-700">Password</Label>
                     <Link to={`/auth/forgot-password?role=${activeTab === 'buyer' ? 'BUYER' : 'VENDOR'}`} className="text-xs font-medium text-blue-600 hover:text-blue-800">Forgot password?</Link>
                  </div>
                  <Input 
                     id="password" 
                     name="password" 
                     type="password" 
                     required 
                     className="h-11 bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500" 
                     value={formData.password} 
                     onChange={handleChange}
                     placeholder="Enter your password"
                  />
               </div>

               <div>
                  <Button
                     type="submit"
                     className="w-full h-11 bg-blue-700 hover:bg-blue-800 text-lg shadow-md hover:shadow-lg transition-all"
                     disabled={loading}
                  >
                     {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                     {loading ? 'Signing In...' : 'Sign In'}
                  </Button>
               </div>
            </form>

            <div className="mt-8 text-center">
               <p className="text-sm text-slate-600">
                  New to IndianTradeMart?{' '}
                  <Link 
                     to={activeTab === 'buyer' ? "/buyer/register" : "/vendor/register"} 
                     className="font-bold text-blue-700 hover:text-blue-900"
                  >
                     Create Account
                  </Link>
               </p>
            </div>
         </div>
      </div>
    </div>
  );
};

export default Login;
