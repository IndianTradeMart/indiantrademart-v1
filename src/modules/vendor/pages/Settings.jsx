
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { vendorApi } from '@/modules/vendor/services/vendorApi';
import { otpService } from '@/services/otpService';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { Loader2, Copy, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const VendorSettings = () => {
  const navigate = useNavigate();
  const [passwords, setPasswords] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [vendorId, setVendorId] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchVendorId = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserEmail(user.email || '');
          const { data: vendor } = await supabase
            .from('vendors')
            .select('vendor_id')
            .eq('user_id', user.id)
            .single();
          setVendorId(vendor?.vendor_id);
        }
      } catch (e) {
        console.error('Error fetching vendor ID:', e);
      }
    };
    fetchVendorId();
  }, []);

  const handleCopyVendorId = () => {
    if (vendorId) {
      navigator.clipboard.writeText(vendorId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Vendor ID copied to clipboard" });
    }
  };

  const handleSendOtp = async () => {
    if (!userEmail) {
      toast({ title: "Email not found", description: "Re-login and try again.", variant: "destructive" });
      return;
    }
    setSendingOtp(true);
    try {
      await otpService.requestOtp(userEmail);
      setOtpSent(true);
      toast({ title: "OTP sent", description: `Code sent to ${userEmail}` });
    } catch (e) {
      toast({ title: "Failed to send OTP", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setSendingOtp(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (!otpSent || otp.length !== 6) {
      toast({ title: "OTP required", description: "Enter the 6-digit OTP sent to your email.", variant: "destructive" });
      return;
    }
    
    setLoading(true);
    try {
      await otpService.verifyOtp(userEmail, otp);
      await vendorApi.auth.updatePassword(passwords.newPassword);
      toast({ 
         title: "Password Updated", 
         description: "Your password has been changed. You have been logged out from all sessions for security." 
      });
      // Logout logic is handled in the API call usually, or we force it here
      await vendorApi.auth.logout();
      navigate('/auth/login');
    } catch (error) {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Account Settings</h1>
      
      {vendorId && (
        <Card className="border-2 border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-semibold text-slate-700">Your Vendor ID</Label>
                <p className="text-xs text-slate-500 mt-1">Use this ID for all support requests and transactions</p>
              </div>
              <div className="flex items-center gap-2 bg-white p-4 rounded-lg border border-blue-100">
                <code className="text-lg font-bold text-blue-700 flex-1 break-all">{vendorId}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyVendorId}
                  className="bg-white hover:bg-blue-50 shrink-0"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-slate-600">This ID never changes and can be used to identify your account.</p>
            </div>
          </CardContent>
        </Card>
      )}
      
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Email Verification (OTP)</Label>
                <Button type="button" size="sm" variant="outline" onClick={handleSendOtp} disabled={sendingOtp}>
                  {sendingOtp ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  {otpSent ? 'Resend OTP' : 'Send OTP'}
                </Button>
              </div>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="Enter 6-digit OTP"
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <p className="text-xs text-slate-500">OTP will be sent to your registered email: {userEmail || '—'}</p>
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input 
                type="password" 
                required
                minLength={6}
                value={passwords.newPassword}
                onChange={(e) => setPasswords({...passwords, newPassword: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input 
                type="password" 
                required
                minLength={6}
                value={passwords.confirmPassword}
                onChange={(e) => setPasswords({...passwords, confirmPassword: e.target.value})}
              />
            </div>
            <Button type="submit" className="w-full bg-[#003D82]" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Update Password & Logout All Devices
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default VendorSettings;
