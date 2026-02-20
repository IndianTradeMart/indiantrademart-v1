
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInternalAuth } from '@/modules/admin/context/InternalAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Lock, Shield } from 'lucide-react';

const Login = () => {
  const navigate = useNavigate();
  const { login } = useInternalAuth();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    const user = await login(formData.email, formData.password);
    
    if (user) {
      // Role-based redirection
      switch(user.role) {
        case 'ADMIN':
          navigate('/admin/dashboard');
          break;
        case 'HR':
          navigate('/hr/dashboard');
          break;
        case 'DATAENTRY':
          navigate('/employee/dataentry/dashboard');
          break;
        case 'SUPPORT':
          navigate('/employee/support/dashboard');
          break;
        case 'SALES':
          navigate('/employee/sales/dashboard');
          break;
        default:
          navigate('/admin/dashboard');
      }
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-4">
          <div className="h-16 w-16 bg-[#003D82] rounded-full flex items-center justify-center border-4 border-neutral-800">
            <Shield className="h-8 w-8 text-white" />
          </div>
        </div>
        <h2 className="mt-2 text-center text-3xl font-extrabold text-white">
          Admin & Staff Portal
        </h2>
        <p className="mt-2 text-center text-sm text-neutral-400">
          Secure Login for Authorized Personnel
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="mt-1"
                placeholder="role@platform.com"
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                className="mt-1"
                placeholder="••••••••"
              />
            </div>

            <div>
              <Button
                type="submit"
                className="w-full bg-[#003D82] hover:bg-[#002d61]"
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                Sign In
              </Button>
            </div>
          </form>
          
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Available Roles</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 text-xs text-gray-500 bg-gray-50 p-3 rounded border">
              <div>
                <span className="font-bold text-gray-900 block">ADMIN</span>
                admin@platform.com
              </div>
              <div>
                <span className="font-bold text-gray-900 block">HR</span>
                hr@platform.com
              </div>
              <div>
                <span className="font-bold text-gray-900 block">SUPPORT</span>
                support@platform.com
              </div>
               <div>
                <span className="font-bold text-gray-900 block">SALES</span>
                sales@platform.com
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
