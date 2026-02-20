
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import Logo from '@/shared/components/Logo';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const BUYER_CREDENTIAL_MESSAGE = 'This email is not registered as buyer';

const Login = () => {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (loading) return;
    const normalizedEmail = String(formData.email || '').trim().toLowerCase();

    if (!normalizedEmail) {
      toast({
        title: "Email Missing",
        description: "Please enter your email.",
        variant: "destructive"
      });
      return;
    }
    if (!formData.password) {
       toast({
         title: "Password Missing",
         description: "Please enter your password.",
         variant: "destructive"
       });
       return;
    }
    setLoading(true);

    try {
      const { data: vendorByEmail, error: vendorLookupError } = await supabase
        .from('vendors')
        .select('id')
        .ilike('email', normalizedEmail)
        .limit(1)
        .maybeSingle();

      if (!vendorLookupError && vendorByEmail?.id) {
        throw new Error(BUYER_CREDENTIAL_MESSAGE);
      }

      const { error } = await signIn(normalizedEmail, formData.password, { role: 'BUYER' });
      if (error) throw error;
      toast({ title: "Welcome back!", description: "Successfully logged in." });
      navigate('/buyer/dashboard', { replace: true });
    } catch (error) {
      console.error("Login failed", error);
      const message =
        String(error?.message || '').trim() || "Invalid credentials.";
      toast({
        title: "Login Failed",
        description: message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-6">
          <Logo />
        </div>
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
          Buyer Login
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Access your procurement dashboard
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200/50 sm:rounded-xl sm:px-10 border border-slate-100">
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <Label htmlFor="email" className="text-slate-700">Email Address</Label>
              <Input 
                id="email" 
                name="email" 
                type="email" 
                required 
                className="mt-1" 
                value={formData.email} 
                onChange={handleChange}
                placeholder="name@company.com"
              />
            </div>

            <div>
              <div className="flex justify-between items-center">
                 <Label htmlFor="password" className="text-slate-700">Password</Label>
                 <a href="/auth/forgot-password?role=buyer" className="text-xs font-medium text-blue-600 hover:text-blue-800">Forgot password?</a>
              </div>
              <Input 
                id="password" 
                name="password" 
                type="password" 
                required 
                className="mt-1" 
                value={formData.password} 
                onChange={handleChange}
                placeholder="Enter your password"
              />
            </div>

            <div>
              <Button
                type="submit"
                className="w-full flex justify-center py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white font-semibold transition-all"
                disabled={loading}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {loading ? 'Signing In...' : 'Sign in'}
                {!loading && <ArrowRight className="ml-2 w-4 h-4" />}
              </Button>
            </div>
          </form>

          <div className="mt-6">
             <div className="relative">
                <div className="absolute inset-0 flex items-center">
                   <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                   <span className="px-2 bg-white text-slate-500">New to IndianTradeMart?</span>
                </div>
             </div>
             <div className="mt-6">
                <Link to="/buyer/register" className="w-full flex justify-center py-2 px-4 border border-slate-300 rounded-md shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors">
                   Create new buyer account
                </Link>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
