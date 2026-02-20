import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { Loader2, ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { vendorApi } from '@/modules/vendor/services/vendorApi';
import { otpService } from '@/services/otpService';

// ✅ Logo component
import Logo from '@/shared/components/Logo';

const Steps = ({ currentStep }) => (
  <div className="flex justify-center mb-8">
    <div className="flex items-center gap-2">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
          currentStep >= 1 ? 'bg-[#003D82] text-white' : 'bg-gray-200 text-gray-500'
        }`}
      >
        1
      </div>
      <div className={`w-12 h-1 ${currentStep >= 2 ? 'bg-[#003D82]' : 'bg-gray-200'}`} />
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
          currentStep >= 2 ? 'bg-[#003D82] text-white' : 'bg-gray-200 text-gray-500'
        }`}
      >
        2
      </div>
      <div className={`w-12 h-1 ${currentStep >= 3 ? 'bg-[#003D82]' : 'bg-gray-200'}`} />
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
          currentStep >= 3 ? 'bg-[#003D82] text-white' : 'bg-gray-200 text-gray-500'
        }`}
      >
        3
      </div>
    </div>
  </div>
);

const VendorRegister = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [cityLoading, setCityLoading] = useState(false);
  const [timer, setTimer] = useState(120);

  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);

  const [formData, setFormData] = useState({
    companyName: '',
    gstNumber: '',
    address: '',
    ownerName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    stateId: '',
    cityId: '',
    stateName: '',
    cityName: '',
    otp: '',
  });

  useEffect(() => {
    loadStates();
  }, []);

  useEffect(() => {
    if (step === 3 && timer > 0) {
      const interval = setInterval(() => setTimer((p) => p - 1), 1000);
      return () => clearInterval(interval);
    }
  }, [step, timer]);

  const loadStates = async () => {
    try {
      const data = await vendorApi.getStates();
      setStates(data || []);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to load states', variant: 'destructive' });
    }
  };

  const handleStateChange = async (val) => {
    const selectedState = states.find((s) => s.id === val);

    setFormData((prev) => ({
      ...prev,
      stateId: val,
      stateName: selectedState?.name || '',
      cityId: '',
      cityName: '',
    }));

    setCities([]);
    if (val) {
      setCityLoading(true);
      try {
        const cityData = await vendorApi.getCities(val);
        setCities(cityData || []);
      } catch (e) {
        console.error(e);
        toast({ title: 'Error', description: 'Failed to load cities', variant: 'destructive' });
      } finally {
        setCityLoading(false);
      }
    }
  };

  const handleCityChange = (val) => {
    const selectedCity = cities.find((c) => c.id === val);
    setFormData((prev) => ({
      ...prev,
      cityId: val,
      cityName: selectedCity?.name || '',
    }));
  };

  // --- STEP 1 HANDLER ---
  const handleStep1 = (e) => {
    e.preventDefault();

    if (!formData.companyName || !formData.gstNumber) {
      toast({
        title: 'Missing Fields',
        description: 'Company Name and GST Number are required',
        variant: 'destructive',
      });
      return;
    }

    const gst = (formData.gstNumber || '').toUpperCase().trim();
    if (!/^[0-9A-Z]{15}$/.test(gst)) {
      toast({
        title: 'Invalid GST',
        description: 'GST number must be exactly 15 characters (0-9, A-Z).',
        variant: 'destructive',
      });
      return;
    }
    if (gst.length !== formData.gstNumber.length || gst !== formData.gstNumber) {
      setFormData((prev) => ({ ...prev, gstNumber: gst }));
    }

    // ✅ State/City Step-1 me hi required
    if (!formData.stateId || !formData.cityId) {
      toast({
        title: 'Missing Location',
        description: 'Please select both State and City',
        variant: 'destructive',
      });
      return;
    }

    setStep(2);
  };

  // --- STEP 2 HANDLER (Initiate Registration) ---
  const handleStep2 = async (e) => {
    e.preventDefault();

    const cleanOwner = (formData.ownerName || '').trim();
    if (!/^[A-Za-z ]+$/.test(cleanOwner) || cleanOwner.length < 3) {
      toast({
        title: 'Invalid Owner Name',
        description: 'Owner name should contain letters and spaces only (min 3 chars).',
        variant: 'destructive',
      });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({ title: 'Password Mismatch', description: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (formData.password.length < 8) {
      toast({
        title: 'Weak Password',
        description: 'Password must be at least 8 characters',
        variant: 'destructive',
      });
      return;
    }
    if (formData.phone.length !== 10) {
      toast({
        title: 'Invalid Phone',
        description: 'Phone number must be 10 digits',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      await otpService.requestOtp(formData.email);

      setStep(3);
      setTimer(120);
      toast({
        title: 'OTP Sent',
        description: 'A 6-digit code has been sent to your email. It will expire in 2 minutes.',
      });
    } catch (error) {
      toast({ title: 'Registration Failed', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // --- STEP 3 HANDLER (Verify OTP & Create Profile) ---
  const handleStep3 = async (e) => {
    e.preventDefault();

    if (formData.otp.length !== 6) {
      toast({ title: 'Invalid OTP', description: 'Please enter a valid 6-digit code.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      await otpService.verifyOtp(formData.email, formData.otp);

      const authData = await otpService.createAuthUser(formData.email, formData.password, {
        full_name: formData.ownerName,
      });

      if (!authData?.user) throw new Error('Failed to create auth user');

      await vendorApi.registerVendor({
        userId: authData.user.id,
        ...formData,
      });

      try {
        const { error: verifyError } = await supabase
          .from('vendors')
          .update({
            is_verified: true,
            verified_at: new Date().toISOString(),
            is_active: true,
          })
          .eq('user_id', authData.user.id);

        if (verifyError) console.warn('Verify error:', verifyError);
      } catch (err) {
        console.warn('Verification update error:', err);
      }

      if (authData.session) {
        await supabase.auth.setSession(authData.session);
      }

      try {
        await supabase.from('notifications').insert([{
          user_id: authData.user.id,
          type: 'WELCOME',
          title: 'Welcome to Indian Trade Mart',
          message: 'Your vendor account is ready. Complete KYC and start receiving leads.',
          link: '/vendor/dashboard',
          is_read: false,
          created_at: new Date().toISOString()
        }]);
      } catch (e) {
        console.warn('Welcome notification failed:', e);
      }

      toast({
        title: 'Registration Successful!',
        description: 'Your account is verified. Redirecting to dashboard...',
        className: 'bg-green-50 border-green-200',
      });

      setTimeout(() => navigate('/vendor/dashboard'), 500);
    } catch (error) {
      console.error('OTP Verification Error:', error);
      toast({
        title: 'Verification Failed',
        description: error.message || 'Invalid or expired OTP code. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    try {
      await otpService.resendOtp(formData.email);
      setTimer(120);
      setFormData((prev) => ({ ...prev, otp: '' }));
      toast({ title: 'OTP Resent', description: 'A new 6-digit code has been sent to your email.' });
    } catch (e) {
      console.error('Resend OTP Error:', e);
      toast({
        title: 'Error',
        description: e.message || 'Failed to resend OTP. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="text-center space-y-2">
          {/* ✅ LOGO CENTER + CLICK TO HOME + REMOVE TEXT */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex items-center justify-center hover:opacity-90 transition"
              aria-label="Go to home"
            >
              <Logo className="h-12 w-auto" />
            </button>
          </div>

          <CardTitle className="text-2xl font-bold text-[#003D82]">Vendor Registration</CardTitle>
          <CardDescription>Join India's leading B2B marketplace</CardDescription>
        </CardHeader>

        <CardContent>
          <Steps currentStep={step} />

          {/* STEP 1 */}
          {step === 1 && (
            <form onSubmit={handleStep1} className="space-y-4">
              <div className="space-y-2">
                <Label>Company Name *</Label>
                <Input
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  placeholder="e.g. Acme Industries"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>GST Number *</Label>
                <Input
                  value={formData.gstNumber}
                  onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value.toUpperCase() })}
                  placeholder="22AAAAA0000A1Z5"
                  maxLength={15}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Registered Address (Optional)</Label>
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Street address"
                />
              </div>

              {/* ✅ STATE + CITY ON STEP 1 (address ke niche) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>State *</Label>
                  <Select onValueChange={handleStateChange} value={formData.stateId} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select State" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {states.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>City *</Label>
                  <Select
                    onValueChange={handleCityChange}
                    value={formData.cityId}
                    disabled={!formData.stateId || cityLoading}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={cityLoading ? 'Loading...' : 'Select City'} />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {cities.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button type="submit" className="w-full bg-[#003D82]">
                Next <ArrowRight className="ml-2 w-4 h-4" />
              </Button>

              <div className="text-center text-sm text-gray-500">
                Already registered?{' '}
                <Link to="/vendor/login" className="text-[#003D82] font-semibold">
                  Login here
                </Link>
              </div>
            </form>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <form onSubmit={handleStep2} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Owner Name *</Label>
                  <Input
                    required
                    value={formData.ownerName}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        ownerName: e.target.value.replace(/[^A-Za-z ]/g, ''),
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Mobile Number *</Label>
                  <Input
                    required
                    type="tel"
                    maxLength={10}
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Email Address *</Label>
                <Input required type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Password *</Label>
                  <Input required type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                </div>

                <div className="space-y-2">
                  <Label>Confirm Password *</Label>
                  <Input
                    required
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <Button type="button" variant="outline" onClick={() => setStep(1)} className="w-1/3">
                  <ArrowLeft className="mr-2 w-4 h-4" /> Back
                </Button>
                <Button type="submit" className="w-2/3 bg-[#003D82]" disabled={loading}>
                  {loading ? <Loader2 className="animate-spin mr-2" /> : null} Register
                </Button>
              </div>
            </form>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <form onSubmit={handleStep3} className="space-y-6 text-center">
              <div className="space-y-2">
                <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-[#003D82] mb-4">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold">Verify Your Email</h3>
                <p className="text-sm text-gray-500">
                  We've sent a <b>6-digit</b> code to <span className="font-bold text-gray-800">{formData.email}</span>
                </p>
              </div>

              <div className="space-y-2">
                <Input
                  value={formData.otp}
                  onChange={(e) => setFormData({ ...formData, otp: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                  className="text-center text-2xl tracking-[0.5em] h-14"
                  placeholder="000000"
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />

                <div className="flex justify-between text-xs text-gray-500 px-2">
                  <span>
                    Expires in {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
                  </span>

                  {timer === 0 ? (
                    <button type="button" onClick={resendOtp} className="text-blue-600 hover:underline">
                      Resend OTP
                    </button>
                  ) : (
                    <span className="text-gray-300">Resend OTP</span>
                  )}
                </div>
              </div>

              <Button type="submit" className="w-full bg-green-600 hover:bg-green-700" disabled={loading}>
                {loading ? <Loader2 className="animate-spin mr-2" /> : null} Verify & Create Account
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VendorRegister;
