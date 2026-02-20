import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { vendorApi } from '@/modules/vendor/services/vendorApi';

const cleanText = (value) => value.replace(/\s{2,}/g, ' ').replace(/^\s+/, '');
const sanitizeOwnerName = (value) => cleanText(value.replace(/[^A-Za-z\s.'-]/g, ''));
const sanitizeCompanyName = (value) => cleanText(value.replace(/[^A-Za-z0-9\s.&,'()/:-]/g, ''));
const sanitizeEmail = (value) => value.toLowerCase().replace(/\s+/g, '');
const sanitizePhone = (value) => value.replace(/\D/g, '').slice(0, 10);
const sanitizeGst = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
const sanitizeAddress = (value) => cleanText(value.replace(/[^A-Za-z0-9\s,./#()'-]/g, ''));

const VendorOnboarding = () => {
  const [loading, setLoading] = useState(false);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);

  const [formData, setFormData] = useState({
    companyName: '',
    ownerName: '',
    email: '',
    phone: '',
    address: '',
    stateId: '',
    cityId: '',
    gstNumber: '',
    tempPassword: ''
  });

  // ---------------- INIT ----------------
  useEffect(() => {
    vendorApi.getStates().then(setStates).catch(console.error);
  }, []);

  const handleStateChange = async (stateId) => {
    setFormData(p => ({ ...p, stateId, cityId: '' }));
    const c = await vendorApi.getCities(stateId);
    setCities(c);
  };

  // ---------------- SUBMIT ----------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const password =
        formData.tempPassword ||
        Math.random().toString(36).slice(-8) + 'Aa1!';

      // 1️⃣ CREATE AUTH USER
      const { data: authData, error: authError } =
        await supabase.auth.signUp({
          email: formData.email,
          password,
          options: {
            data: {
              role: 'VENDOR',
              full_name: formData.ownerName
            }
          }
        });

      if (authError) throw authError;
      const userId = authData.user.id;

      // Get state/city names (optional but API expects them)
      const stateName = states.find(s => s.id === formData.stateId)?.name;
      const cityName = cities.find(c => c.id === formData.cityId)?.name;

      // 2️⃣ REGISTER VENDOR (🔥 CORRECT API)
      await vendorApi.registerVendor({
        userId,
        companyName: formData.companyName,
        ownerName: formData.ownerName,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        gstNumber: formData.gstNumber,
        stateId: formData.stateId,
        cityId: formData.cityId,
        stateName,
        cityName
      });

      // 3️⃣ FETCH FINAL VENDOR (for display)
      const vendor = await vendorApi.getVendorByUserId(userId);

      toast({
        title: 'Vendor Created ✅',
        description: `Vendor ID: ${vendor.vendor_id}`
      });

      // RESET
      setFormData({
        companyName: '',
        ownerName: '',
        email: '',
        phone: '',
        address: '',
        stateId: '',
        cityId: '',
        gstNumber: '',
        tempPassword: ''
      });

    } catch (err) {
      console.error(err);
      toast({
        title: 'Error',
        description: err.message || 'Something went wrong',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // ---------------- UI ----------------
  return (
    <div className="w-full max-w-5xl mx-auto p-4 lg:p-6">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Internal Vendor Onboarding</CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Company Name</Label>
                <Input
                  id="companyName"
                  name="companyName"
                  type="text"
                  autoComplete="organization"
                  required
                  value={formData.companyName}
                  onChange={(e) => updateField('companyName', sanitizeCompanyName(e.target.value))}
                />
              </div>

              <div>
                <Label>Owner Name</Label>
                <Input
                  id="ownerName"
                  name="ownerName"
                  type="text"
                  autoComplete="name"
                  required
                  value={formData.ownerName}
                  onChange={(e) => updateField('ownerName', sanitizeOwnerName(e.target.value))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={formData.email}
                  onChange={(e) => updateField('email', sanitizeEmail(e.target.value))}
                />
              </div>

              <div>
                <Label>Business Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  pattern="[0-9]{10}"
                  required
                  value={formData.phone}
                  onChange={(e) => updateField('phone', sanitizePhone(e.target.value))}
                />
              </div>
            </div>

            <div>
              <Label>GST Number</Label>
              <Input
                id="gstNumber"
                name="gstNumber"
                type="text"
                autoComplete="off"
                value={formData.gstNumber}
                onChange={(e) => updateField('gstNumber', sanitizeGst(e.target.value))}
              />
            </div>

            <div>
              <Label>Business Address</Label>
              <Input
                id="address"
                name="address"
                type="text"
                autoComplete="street-address"
                value={formData.address}
                onChange={(e) => updateField('address', sanitizeAddress(e.target.value))}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>State</Label>
                <Select value={formData.stateId} onValueChange={handleStateChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select State" />
                  </SelectTrigger>
                  <SelectContent>
                    {states.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>City</Label>
                <Select
                  value={formData.cityId}
                  onValueChange={v => setFormData(p => ({ ...p, cityId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select City" />
                  </SelectTrigger>
                  <SelectContent>
                    {cities.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Temporary Password (optional)</Label>
              <Input
                id="tempPassword"
                name="tempPassword"
                type="password"
                autoComplete="new-password"
                value={formData.tempPassword}
                onChange={(e) => updateField('tempPassword', e.target.value)}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating Vendor...' : 'Create Vendor'}
              </Button>
            </div>

          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default VendorOnboarding;
