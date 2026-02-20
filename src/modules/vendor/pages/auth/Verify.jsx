import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { vendorApi } from '@/modules/vendor/services/vendorApi';
import { otpService } from '@/services/otpService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 120;

const Verify = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const [timer, setTimer] = useState(OTP_TTL_SECONDS);
  const [initialSent, setInitialSent] = useState(false);

  useEffect(() => {
    const getEmail = async () => {
      try {
        if (location.state?.email) {
          setEmail(location.state.email);
          return;
        }

        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;

        if (user?.email) {
          setEmail(user.email);
          return;
        }

        toast({
          title: "Session Expired",
          description: "Please login again to verify.",
          variant: "destructive"
        });
        navigate('/vendor/login');
      } catch (e) {
        console.error('[Verify] getEmail failed:', e);
        toast({
          title: "Session Expired",
          description: "Please login again to verify.",
          variant: "destructive"
        });
        navigate('/vendor/login');
      }
    };

    getEmail();
  }, [location, navigate]);

  // ✅ Countdown timer
  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => setTimer(prev => prev - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ✅ Send OTP automatically once when email is available
  useEffect(() => {
    const sendInitialOtp = async () => {
      if (!email) return;
      if (initialSent) return;

      try {
        setLoading(true);

        // IMPORTANT: If your flow already sends OTP before redirecting here,
        // you can skip this by passing { state: { email, skipSendOtp: true } }
        if (location.state?.skipSendOtp === true) {
          setInitialSent(true);
          setTimer(OTP_TTL_SECONDS);
          return;
        }

        await otpService.resendOtp(email);
        setInitialSent(true);
        setTimer(OTP_TTL_SECONDS);

        toast({
          title: "OTP Sent",
          description: `A ${OTP_LENGTH}-digit code has been sent to your email.`,
        });
      } catch (e) {
        console.error('[Verify] initial OTP send failed:', e);
        // Don't block UI — user can still resend later
        toast({
          title: "OTP Not Sent",
          description: e?.message || "Unable to send OTP. Please use Resend OTP after timer ends.",
          variant: "destructive"
        });
        setInitialSent(true); // prevent infinite retry loop
      } finally {
        setLoading(false);
      }
    };

    sendInitialOtp();
  }, [email, initialSent, location.state]);

  const markVendorVerified = async (emailToVerify) => {
    // Prefer vendorApi if it is server-side (safer with RLS)
    // But also try direct update as fallback.
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1) Try vendorApi (if it updates by user id)
      if (user?.id && vendorApi?.updateVendorVerification) {
        try {
          await vendorApi.updateVendorVerification(user.id, true);
          return;
        } catch (e) {
          console.warn('[Verify] vendorApi.updateVendorVerification failed, trying direct DB update:', e);
        }
      }

      // 2) Fallback direct update (requires proper RLS)
      const { error } = await supabase
        .from('vendors')
        .update({
          is_verified: true,
          verified_at: new Date().toISOString(),
        })
        .eq('email', emailToVerify);

      if (error) throw error;
    } catch (e) {
      console.error('[Verify] markVendorVerified failed:', e);
      // We won't hard-fail verification flow, but we should inform the user/admin
      toast({
        title: "Verified, but profile not updated",
        description: "OTP verified, but vendor verification flag couldn't be updated. Please contact admin.",
        variant: "destructive"
      });
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();

    if (otp.length !== OTP_LENGTH) {
      toast({
        title: "Invalid OTP",
        description: `Please enter a valid ${OTP_LENGTH}-digit code.`,
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      await otpService.verifyOtp(email, otp);

      // ✅ make vendor verified in DB
      await markVendorVerified(email);

      toast({
        title: "Verified Successfully",
        description: "Welcome to your dashboard!",
        className: "bg-green-50"
      });

      navigate('/vendor/dashboard');
    } catch (error) {
      console.error('Verification error:', error);
      toast({
        title: "Verification Failed",
        description: error?.message || "Invalid or expired OTP code. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      setLoading(true);
      await otpService.resendOtp(email);
      setTimer(OTP_TTL_SECONDS);
      setOtp('');
      toast({
        title: "OTP Resent",
        description: `A new ${OTP_LENGTH}-digit code has been sent to your email.`
      });
    } catch (error) {
      console.error('[Verify] resend failed:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to resend OTP.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-[#003D82]">Verify Account</CardTitle>
          <CardDescription>
            Enter the OTP sent to <span className="font-semibold text-gray-900">{email || 'your email'}</span>
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleVerify} className="space-y-6">
            <div className="space-y-2">
              <Input
                type="text"
                placeholder={`Enter ${OTP_LENGTH}-digit OTP`}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                className="text-center text-2xl tracking-[0.5em] h-14"
                maxLength={OTP_LENGTH}
                inputMode="numeric"
                autoComplete="one-time-code"
              />

              <div className="flex justify-between text-sm text-gray-500">
                <span>Time remaining: {formatTime(timer)}</span>

                {timer === 0 ? (
                  <button
                    type="button"
                    onClick={handleResend}
                    className="text-[#003D82] hover:underline font-medium"
                    disabled={loading || !email}
                  >
                    Resend OTP
                  </button>
                ) : (
                  <span className="text-gray-300 cursor-not-allowed">Resend OTP</span>
                )}
              </div>

              <p className="text-xs text-gray-400 mt-1">
                💡 If you don't see the email, check your spam or junk folder
              </p>
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-lg bg-[#003D82]"
              disabled={loading || !email}
            >
              {loading ? <Loader2 className="animate-spin mr-2" /> : null}
              Verify Account
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate('/vendor/login')}
                className="text-sm text-gray-500 hover:text-gray-900"
              >
                Back to Login
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Verify;
