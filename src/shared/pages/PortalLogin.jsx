import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useInternalAuth } from '@/modules/admin/context/InternalAuthContext';
import { Loader2, Lock, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const PortalLogin = ({ portalName, colorScheme, defaultEmail, icon: Icon }) => {
  const navigate = useNavigate();
  const { login } = useInternalAuth();

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const getColorClass = (type) => {
    const colors = {
      blue: 'bg-blue-600 hover:bg-blue-700 text-blue-600',
      emerald: 'bg-emerald-600 hover:bg-emerald-700 text-emerald-600',
      purple: 'bg-purple-600 hover:bg-purple-700 text-purple-600',
    };
    return colors[colorScheme] || colors.blue;
  };

  const activeColor = getColorClass().split(' ')[0];

  const portalKey = (portalName || '').toLowerCase();
  const expectedRole = portalKey.includes('hr')
    ? 'HR'
    : portalKey.includes('finance')
      ? 'FINANCE'
      : 'ADMIN';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // ✅ pass expectedRole so fallback role can be applied if RPC doesn't return role
      const user = await login(formData.email, formData.password, expectedRole);

      if (user) {
        if (user.status === 'BLOCKED') {
          setError('Your account has been suspended. Contact administrator.');
          setIsLoading(false);
          return;
        }

        switch (user.role) {
          case 'ADMIN':
            navigate('/admin/dashboard');
            break;
          case 'FINANCE':
            navigate('/admin/finance-portal/dashboard');
            break;
          case 'HR':
            navigate('/hr/dashboard');
            break;
          case 'DATA_ENTRY':
          case 'DATAENTRY':
            navigate('/employee/dataentry/dashboard');
            break;
          case 'SUPPORT':
            navigate('/employee/support/dashboard');
            break;
          case 'SALES':
            navigate('/employee/sales/dashboard');
            break;
          case 'EMPLOYEE':
            navigate('/employee/dataentry/dashboard');
            break;
          default:
            console.error("Unknown role:", user.role);
            setError(`Role mismatch: '${user.role}' not recognized for this portal.`);
        }
      } else {
        setError('Invalid login credentials');
      }
    } catch (err) {
      console.error(err);
      setError('System error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-6">
          <div className="h-16 w-16 rounded-xl flex items-center justify-center shadow-lg bg-white">
            {Icon && <Icon className={`h-8 w-8 ${getColorClass().split(' ').pop()}`} />}
          </div>
        </div>
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          {portalName}
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Restricted System Access
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200/50 rounded-2xl sm:px-10 border border-slate-100">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Work Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder={defaultEmail || "name@company.com"}
                className="h-11 bg-slate-50 border-slate-200 focus:bg-white transition-colors"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••"
                  className="h-11 bg-slate-50 border-slate-200 focus:bg-white transition-colors pr-10"
                />
                <Lock className="absolute right-3 top-3 h-5 w-5 text-slate-400" />
              </div>
            </div>

            {error && (
              <Alert variant="destructive" className="bg-red-50 border-red-100 text-red-800">
                <AlertCircle className="h-4 w-4" />
                <div className="ml-2">
                  <AlertTitle>Authentication Failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </div>
              </Alert>
            )}

            <Button
              type="submit"
              className={`w-full h-11 text-base font-medium shadow-lg hover:shadow-xl transition-all ${activeColor}`}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Sign In"}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100">
            <p className="text-xs text-center text-slate-400">
              Authorized personnel only. All activities are monitored.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortalLogin;
