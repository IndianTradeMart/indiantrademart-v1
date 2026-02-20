import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowRight, CheckCircle2, Mail, ArrowLeft, ShieldCheck, User } from 'lucide-react';
import Logo from '@/shared/components/Logo';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { StateDropdown, CityDropdown } from '@/shared/components/LocationSelectors';
import { otpService } from '@/services/otpService';
import { isAlreadyRegisteredError } from '@/modules/buyer/services/buyerSession';

// âœ… FIX: Default 5 minutes (pehle 1/2 tha)
const OTP_TIMER_SECONDS = 5 * 60;

const StepIndicator = ({ step }) => {
  const steps = [
    { num: 1, title: 'Basic Details', icon: User },
    { num: 2, title: 'Verification', icon: ShieldCheck }
  ];

  return (
    <div className="flex justify-between mb-8 relative max-w-[200px] mx-auto">
      <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-200 -z-10 -translate-y-1/2" />
      {steps.map((s) => (
        <div key={s.num} className="flex flex-col items-center bg-gray-50 px-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
              step >= s.num ? 'border-[#00A699] bg-[#00A699] text-white' : 'border-gray-300 text-gray-400 bg-white'
            }`}
          >
            <s.icon className="h-4 w-4" />
          </div>
          <span className={`text-xs mt-1 font-medium ${step >= s.num ? 'text-[#00A699]' : 'text-gray-400'}`}>
            {s.title}
          </span>
        </div>
      ))}
    </div>
  );
};

const Register = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(OTP_TIMER_SECONDS);
  const [otp, setOtp] = useState('');

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    company_name: '',
    address: '',
    state_id: '',
    city_id: '',
    state_name: '',
    city_name: '',
    password: '',
    confirm_password: ''
  });

  useEffect(() => {
    let interval;
    if (step === 2 && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [step, timer]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleStateChange = (id, item) => {
    setFormData((prev) => ({
      ...prev,
      state_id: id,
      state_name: item.name,
      city_id: '',
      city_name: ''
    }));
  };

  const handleCityChange = (id, item) => {
    setFormData((prev) => ({
      ...prev,
      city_id: id,
      city_name: item.name
    }));
  };

  const validateStep1 = () => {
    if (formData.password !== formData.confirm_password) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return false;
    }
    if (formData.password.length < 8) {
      toast({ title: 'Password too weak', description: 'Min 8 chars required', variant: 'destructive' });
      return false;
    }
    if (!formData.email.includes('@')) {
      toast({ title: 'Invalid Email Address', variant: 'destructive' });
      return false;
    }
    if (formData.phone.length !== 10 || isNaN(formData.phone)) {
      toast({ title: 'Invalid Phone Number', description: 'Must be 10 digits', variant: 'destructive' });
      return false;
    }
    if (!formData.full_name || !formData.state_id || !formData.city_id) {
      toast({ title: 'Missing Fields', description: 'Please fill all required fields', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const handleStep1Submit = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (!validateStep1()) return;

    setLoading(true);
    try {
      const otpResp = await otpService.requestOtp(formData.email);

      setStep(2);
      const expiresIn = Number(otpResp?.expiresIn);
      setTimer(Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : OTP_TIMER_SECONDS);
      setOtp('');

      toast({ title: 'OTP Sent', description: `Verification code sent to ${formData.email}` });
    } catch (error) {
      console.error('Signup error:', error);
      toast({ title: 'Registration Failed', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (e) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtp(cleaned);
  };

  const handleOtpVerify = async (e) => {
    e.preventDefault();
    if (loading) return;
    const cleaned = (otp || '').replace(/\D/g, '');
    const normalizedEmail = String(formData.email || '').trim().toLowerCase();

    if (cleaned.length !== 6) {
      toast({ title: 'Invalid OTP', description: 'Please enter a valid 6-digit OTP code.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      await otpService.verifyOtp(normalizedEmail, cleaned);

      let authData;
      try {
        authData = await otpService.createAuthUser(normalizedEmail, formData.password, {
          full_name: formData.full_name,
          role: 'BUYER',
          phone: formData.phone,
          company_name: formData.company_name,
          state_id: formData.state_id,
          city_id: formData.city_id,
          state: formData.state_name,
          city: formData.city_name
        });
      } catch (err) {
        if (isAlreadyRegisteredError(err)) {
          // If account already exists, try direct login so user doesn't need to re-enter credentials.
          const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password: formData.password,
            options: { data: { role: 'BUYER' } },
            role: 'BUYER',
          });
          if (loginError) {
            toast({
              title: 'Account already exists',
              description: 'Please login with your email and password.',
              variant: 'destructive'
            });
            setTimeout(() => navigate('/buyer/login'), 800);
            return;
          }
          authData = loginData;
        }
        if (!authData) throw err;
      }

      const authUserFromRegister = authData?.user || authData?.session?.user || null;
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;

      const userId = authUserFromRegister?.id || userRes?.user?.id;
      if (!userId) throw new Error('Registration completed but user session could not be confirmed.');

      try {
        await supabase.from('notifications').insert([
          {
            user_id: userId,
            type: 'WELCOME',
            title: 'Welcome to Indian Trade Mart',
            message: 'Your buyer account is ready. Start exploring suppliers and proposals.',
            link: '/buyer/dashboard',
            is_read: false,
            created_at: new Date().toISOString()
          }
        ]);
      } catch (e2) {
        console.warn('Welcome notification failed:', e2);
      }

      setStep(3);
      toast({
        title: 'Registration Successful!',
        description: 'Your account is verified. Redirecting to dashboard...',
        className: 'bg-green-50 border-green-200'
      });

      setTimeout(() => navigate('/buyer/dashboard'), 1200);
    } catch (error) {
      console.error('Verification error:', error);
      toast({ title: 'Verification Failed', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  const handleResendOtp = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const otpResp = await otpService.resendOtp(formData.email);
      const expiresIn = Number(otpResp?.expiresIn);
      setTimer(Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : OTP_TIMER_SECONDS);
      setOtp('');
      toast({ title: 'OTP Resent', description: 'A new 6-digit code has been sent to your email.' });
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-6">
          <Logo />
        </div>
        <h2 className="text-3xl font-extrabold text-gray-900 mb-6">
          {step === 1 && 'Create Buyer Account'}
          {step === 2 && 'Verify Email'}
          {step === 3 && 'Registration Complete'}
        </h2>

        {step < 3 && <StepIndicator step={step} />}
      </div>

      <div className="mt-2 sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-xl sm:px-10 border border-gray-100">
          {step === 1 && (
            <form className="space-y-6" onSubmit={handleStep1Submit}>
              <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="full_name">Full Name *</Label>
                  <Input id="full_name" name="full_name" required className="mt-1" placeholder="John Doe" value={formData.full_name} onChange={handleChange} />
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <Input id="email" name="email" type="email" required className="mt-1" placeholder="john@example.com" value={formData.email} onChange={handleChange} />
                </div>

                <div>
                  <Label htmlFor="phone">Mobile Number *</Label>
                  <Input id="phone" name="phone" type="tel" required className="mt-1" placeholder="10 digit number" maxLength={10} value={formData.phone} onChange={handleChange} />
                </div>

                <div>
                  <Label htmlFor="company_name">Company (Optional)</Label>
                  <Input id="company_name" name="company_name" className="mt-1" placeholder="Your Company" value={formData.company_name} onChange={handleChange} />
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor="address">Address (Optional)</Label>
                  <Input id="address" name="address" className="mt-1" placeholder="Street, Sector, Area" value={formData.address} onChange={handleChange} />
                </div>

                <div>
                  <Label className="block mb-1">State *</Label>
                  <StateDropdown value={formData.state_id} onChange={handleStateChange} />
                </div>

                <div>
                  <Label className="block mb-1">City *</Label>
                  <CityDropdown stateId={formData.state_id} value={formData.city_id} onChange={handleCityChange} />
                </div>

                <div>
                  <Label htmlFor="password">Password *</Label>
                  <Input id="password" name="password" type="password" required className="mt-1" placeholder="Min 8 chars" value={formData.password} onChange={handleChange} />
                </div>

                <div>
                  <Label htmlFor="confirm_password">Confirm Password *</Label>
                  <Input id="confirm_password" name="confirm_password" type="password" required className="mt-1" placeholder="Re-enter password" value={formData.confirm_password} onChange={handleChange} />
                </div>
              </div>

              <Button type="submit" className="w-full flex justify-center py-3 px-4 bg-[#00A699] hover:bg-[#008c81]" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Sign Up & Verify'} <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleOtpVerify} className="space-y-6">
              <div className="flex flex-col items-center space-y-4">
                <div className="bg-teal-50 p-3 rounded-full">
                  <Mail className="w-8 h-8 text-teal-600" />
                </div>
                <div className="text-center space-y-1">
                  <Label className="text-lg">One-Time Password</Label>
                  <p className="text-sm text-gray-500">
                    Enter the OTP sent to <strong>{formData.email}</strong>
                  </p>
                </div>

                <Input
                  value={otp}
                  onChange={handleOtpChange}
                  className="text-center text-2xl tracking-widest w-56 h-12 font-mono"
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                />

                <div className="text-sm text-gray-500 flex flex-col items-center gap-1">
                  <span>
                    Expires in: <span className="font-medium text-red-500">{formatTime(timer)}</span>
                  </span>
                  {timer === 0 && (
                    <button type="button" onClick={handleResendOtp} className="text-teal-600 underline hover:text-teal-800">
                      Resend OTP
                    </button>
                  )}
                </div>
              </div>

              <div className="pt-4 flex flex-col gap-3">
                <Button type="submit" className="w-full bg-[#00A699] hover:bg-[#008c81]" disabled={loading || otp.replace(/\D/g, '').length !== 6}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Verify & Create Account'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setStep(1)} disabled={loading}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
              </div>
            </form>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4 animate-in zoom-in duration-300">
              <div className="bg-green-100 p-4 rounded-full">
                <CheckCircle2 className="w-16 h-16 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Success!</h3>
              <p className="text-center text-gray-500 max-w-xs">
                Your buyer account has been created successfully. Redirecting to dashboard...
              </p>
              <Button onClick={() => navigate('/buyer/dashboard')} className="mt-4 bg-[#00A699]">
                Go to Dashboard
              </Button>
            </div>
          )}

          {step === 1 && (
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">Already have an account?</span>
                </div>
              </div>

              <div className="mt-6">
                <Link to="/buyer/login" className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                  Sign in instead
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Register;

