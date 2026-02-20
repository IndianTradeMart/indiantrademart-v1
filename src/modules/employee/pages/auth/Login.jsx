import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEmployeeAuth } from '@/modules/employee/context/EmployeeAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Briefcase, Lock, Mail, AlertCircle } from 'lucide-react';
import Logo from '@/shared/components/Logo';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';

const Login = () => {
  const navigate = useNavigate();
  const { login } = useEmployeeAuth();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.email || !formData.password) {
      setError('Please enter both email and password');
      return;
    }

    setIsLoading(true);

    try {
      const user = await login(formData.email, formData.password);

      if (user) {
        // ✅ Role-based redirect (covers ADMIN/HR too)
        if (user.role === 'ADMIN') {
          navigate('/admin/dashboard');
        } else if (user.role === 'HR') {
          navigate('/hr/dashboard');
        } else if (user.role === 'FINANCE') {
          navigate('/admin/finance-portal/dashboard');
        } else if (user.role === 'DATA_ENTRY' || user.role === 'DATAENTRY') {
          navigate('/employee/dataentry/dashboard');
        } else if (user.role === 'SUPPORT') {
          navigate('/employee/support/dashboard');
        } else if (user.role === 'SALES') {
          navigate('/employee/sales/dashboard');
        } else {
          navigate('/');
        }
      } else {
        setError('Invalid credentials');
      }
    } catch (err) {
      console.error(err);
      setError('An unexpected error occurred during login.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute -top-[30%] -right-[10%] w-[800px] h-[800px] rounded-full bg-blue-600/10 blur-3xl"></div>
        <div className="absolute top-[60%] -left-[10%] w-[600px] h-[600px] rounded-full bg-purple-600/10 blur-3xl"></div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10 mb-8">
        <Logo
          className="mx-auto h-16 brightness-0 invert"
          showTagline={false}
          compact={true}
        />

        <h2 className="mt-6 text-center text-3xl font-extrabold text-white tracking-tight">
          Employee Portal
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400">
          Restricted access for authorized personnel only
        </p>
      </div>

      <div className="mt-2 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <Card className="border-slate-800 bg-slate-950/50 backdrop-blur-xl shadow-2xl text-slate-200">
          <CardHeader>
            <CardTitle className="text-xl text-center">Sign In</CardTitle>
            <CardDescription className="text-center text-slate-400">
              Enter your staff credentials to continue
            </CardDescription>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="mb-4 p-3 rounded bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" /> {error}
              </div>
            )}

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">
                  Work Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                  <Input
                    id="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="pl-10 bg-slate-900/50 border-slate-700 focus:border-blue-500 text-white placeholder:text-slate-600"
                    placeholder="name@itm.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="password" className="text-slate-300">
                    Password
                  </Label>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      toast({
                        title: "Contact IT Support",
                        description: "Please contact admin to reset password.",
                      });
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Forgot password?
                  </a>
                </div>

                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                  <Input
                    id="password"
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="pl-10 bg-slate-900/50 border-slate-700 focus:border-blue-500 text-white placeholder:text-slate-600"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white h-11"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Briefcase className="mr-2 h-4 w-4" />
                )}
                Access Workspace
              </Button>
            </form>
          </CardContent>

          <CardFooter className="bg-slate-900/50 border-t border-slate-800 p-4 rounded-b-xl">
            <div className="w-full">
              <p className="text-xs text-center text-slate-500 mb-2">Test Credentials</p>
              <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-400 text-center">
                <div
                  className="p-1 bg-slate-800 rounded border border-slate-700 cursor-pointer hover:bg-slate-700"
                  onClick={() => setFormData({ email: 'deepak@yourcompany.com', password: '123456789' })}
                >
                  <span className="font-bold text-blue-400">Data Entry</span><br />
                  deepak@yourcompany.com
                </div>
                <div
                  className="p-1 bg-slate-800 rounded border border-slate-700 cursor-pointer hover:bg-slate-700"
                  onClick={() => setFormData({ email: 'support@itm.com', password: 'support' })}
                >
                  <span className="font-bold text-purple-400">Support</span><br />
                  support@itm.com
                </div>
                <div
                  className="p-1 bg-slate-800 rounded border border-slate-700 cursor-pointer hover:bg-slate-700"
                  onClick={() => setFormData({ email: 'sales@itm.com', password: 'sales' })}
                >
                  <span className="font-bold text-emerald-400">Sales</span><br />
                  sales@itm.com
                </div>
              </div>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default Login;
