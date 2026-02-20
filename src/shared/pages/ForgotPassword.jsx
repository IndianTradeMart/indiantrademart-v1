import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { Loader2, ArrowRight, Lock } from 'lucide-react';
import Logo from '@/shared/components/Logo';
import { passwordResetApi } from '@/services/passwordResetApi';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const role = searchParams.get('role')?.toUpperCase() || 'BUYER';

  // States
  const [step, setStep] = useState(1); // 1: email, 2: otp, 3: password
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpExpiry, setOtpExpiry] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  // OTP timer
  useEffect(() => {
    if (otpExpiry > 0) {
      const timer = setTimeout(() => setOtpExpiry(otpExpiry - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpExpiry]);

  // Step 1: Verify Email
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({
        title: 'Invalid Email',
        description: 'Please enter a valid email address',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      // Check if email exists with the specified role
      const data = await passwordResetApi.checkEmailByRole(email, role);

      // Request OTP
      await passwordResetApi.requestOTP(email);
      
      toast({
        title: 'OTP Sent',
        description: data.message || 'Check your email for the OTP code'
      });

      setOtpExpiry(120); // 2 minutes
      setStep(2);
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to verify email',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleOtpSubmit = async (e) => {
    e.preventDefault();

    if (!otp || otp.length !== 6) {
      toast({
        title: 'Invalid OTP',
        description: 'Please enter a valid 6-digit OTP',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      await passwordResetApi.verifyOTP(email, otp);
      
      toast({
        title: 'OTP Verified',
        description: 'You can now reset your password'
      });

      setStep(3);
    } catch (error) {
      toast({
        title: 'Invalid OTP',
        description: error.message || 'The OTP you entered is invalid or expired',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    setLoading(true);
    try {
      await passwordResetApi.resendOTP(email);
      
      toast({
        title: 'OTP Resent',
        description: 'Check your email for the new OTP code'
      });

      setOtpExpiry(120); // Reset timer to 2 minutes
      setOtp('');
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to resend OTP',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Reset Password
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      toast({
        title: 'Password Required',
        description: 'Please enter and confirm your password',
        variant: 'destructive'
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Password Too Short',
        description: 'Password must be at least 6 characters long',
        variant: 'destructive'
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Passwords Do Not Match',
        description: 'Please make sure your passwords match',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      await passwordResetApi.resetPassword(email, newPassword);
      
      toast({
        title: 'Password Reset Successful',
        description: 'Your password has been updated. You can now login with your new password.'
      });

      // Redirect to login
      setTimeout(() => {
        if (role === 'VENDOR') {
          navigate('/vendor/login');
        } else {
          navigate('/buyer/login');
        }
      }, 2000);
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reset password',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-between mb-8">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
              step >= s
                ? 'bg-[#003D82] text-white'
                : 'bg-gray-200 text-gray-600'
            }`}
          >
            {s}
          </div>
          {s < 3 && (
            <div
              className={`w-12 h-1 ${
                step > s ? 'bg-[#003D82]' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="mb-8">
        <Logo />
      </div>

      <Card className="w-full max-w-md shadow-lg border-t-4 border-t-[#003D82]">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center text-[#003D82]">
            Reset Password
          </CardTitle>
          <CardDescription className="text-center">
            {role === 'VENDOR' ? 'Seller Account Recovery' : 'Buyer Account Recovery'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {renderStepIndicator()}

          {/* Step 1: Email Verification */}
          {step === 1 && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <p className="text-xs text-gray-500">
                  Enter the email address associated with your {role.toLowerCase()} account
                </p>
              </div>

              <Button
                type="submit"
                className="w-full bg-[#003D82] hover:bg-[#002d62]"
                disabled={loading}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {loading ? 'Verifying...' : 'Continue'}
              </Button>
            </form>
          )}

          {/* Step 2: OTP Verification */}
          {step === 2 && (
            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="text-sm text-gray-700">
                  A 6-digit code has been sent to <strong>{email}</strong>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="otp">Enter OTP Code</Label>
                <Input
                  id="otp"
                  type="text"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength="6"
                  className="text-center text-2xl tracking-widest font-mono"
                  required
                />
                <p className="text-xs text-gray-500">
                  Code expires in {Math.floor(otpExpiry / 60)}:{(otpExpiry % 60).toString().padStart(2, '0')}
                </p>
              </div>

              <Button
                type="submit"
                className="w-full bg-[#003D82] hover:bg-[#002d62]"
                disabled={loading || otpExpiry === 0}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {loading ? 'Verifying...' : 'Verify OTP'}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleResendOtp}
                disabled={loading || otpExpiry > 60}
              >
                {otpExpiry > 60 ? `Resend in ${Math.floor((otpExpiry - 60) / 10)}s` : 'Resend OTP'}
              </Button>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full text-sm text-[#003D82] hover:underline"
              >
                Change Email
              </button>
            </form>
          )}

          {/* Step 3: Password Reset */}
          {step === 3 && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="bg-green-50 p-4 rounded-lg border border-green-200 flex items-center gap-2">
                <Lock className="w-4 h-4 text-green-600" />
                <p className="text-sm text-gray-700">
                  OTP verified successfully. Enter your new password.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="At least 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Must be at least 6 characters long
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showPassword"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  className="w-4 h-4 cursor-pointer"
                />
                <Label htmlFor="showPassword" className="cursor-pointer text-sm">
                  Show password
                </Label>
              </div>

              <Button
                type="submit"
                className="w-full bg-[#003D82] hover:bg-[#002d62]"
                disabled={loading}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {loading ? 'Resetting...' : 'Reset Password'}
              </Button>

              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full text-sm text-[#003D82] hover:underline"
              >
                Back to OTP Verification
              </button>
            </form>
          )}
        </CardContent>

        <CardFooter className="border-t p-4 bg-gray-50 rounded-b-lg flex flex-col items-center gap-2">
          <p className="text-sm text-gray-600">
            Remember your password?{' '}
            <button
              onClick={() => navigate(role === 'VENDOR' ? '/vendor/login' : '/buyer/login')}
              className="font-semibold text-[#003D82] hover:underline"
            >
              Sign In
            </button>
          </p>
        </CardFooter>
      </Card>

      <p className="mt-8 text-center text-sm text-gray-500">
        &copy; {new Date().getFullYear()} IndianTradeMart. All rights reserved.
      </p>
    </div>
  );
};

export default ForgotPassword;
