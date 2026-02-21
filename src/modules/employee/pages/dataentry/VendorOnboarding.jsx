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
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';
import { vendorApi } from '@/modules/vendor/services/vendorApi';
import { Copy, ExternalLink } from 'lucide-react';

const cleanText = (value) => value.replace(/\s{2,}/g, ' ').replace(/^\s+/, '');
const sanitizeOwnerName = (value) => cleanText(value.replace(/[^A-Za-z\s.'-]/g, ''));
const sanitizeCompanyName = (value) => cleanText(value.replace(/[^A-Za-z0-9\s.&,'()/:-]/g, ''));
const sanitizeEmail = (value) => value.toLowerCase().replace(/\s+/g, '');
const sanitizePhone = (value) => value.replace(/\D/g, '').slice(0, 10);
const sanitizeGst = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
const sanitizeAddress = (value) => cleanText(value.replace(/[^A-Za-z0-9\s,./#()'-]/g, ''));

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[6-9]\d{9}$/;
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const EMPTY_FORM = {
  companyName: '',
  ownerName: '',
  email: '',
  phone: '',
  address: '',
  stateId: '',
  cityId: '',
  gstNumber: '',
  tempPassword: ''
};

const generateTempPassword = () => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$%&*!?';
  const all = upper + lower + digits + symbols;

  const pick = (pool) => pool[Math.floor(Math.random() * pool.length)];
  const seed = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (seed.length < 10) seed.push(pick(all));

  for (let i = seed.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [seed[i], seed[j]] = [seed[j], seed[i]];
  }

  return seed.join('');
};

const VendorOnboarding = () => {
  const [loading, setLoading] = useState(false);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [createdVendor, setCreatedVendor] = useState(null);

  useEffect(() => {
    vendorApi.getStates().then(setStates).catch(console.error);
  }, []);

  const validateField = (field, value, data = formData) => {
    const text = String(value || '').trim();

    switch (field) {
      case 'companyName':
        if (!text) return 'Company name is required';
        if (text.length < 2) return 'Company name must be at least 2 characters';
        return '';
      case 'ownerName':
        if (!text) return 'Owner name is required';
        if (text.length < 2) return 'Owner name must be at least 2 characters';
        return '';
      case 'email':
        if (!text) return 'Email is required';
        if (!EMAIL_REGEX.test(text)) return 'Please enter a valid email address';
        return '';
      case 'phone':
        if (!text) return 'Business phone is required';
        if (!PHONE_REGEX.test(text)) return 'Enter a valid 10-digit Indian mobile number';
        return '';
      case 'address':
        if (!text) return 'Business address is required';
        if (text.length < 8) return 'Address must be at least 8 characters';
        return '';
      case 'stateId':
        if (!text) return 'State is required';
        return '';
      case 'cityId':
        if (!String(data.stateId || '').trim()) return '';
        if (!text) return 'City is required';
        return '';
      case 'gstNumber':
        if (!text) return '';
        if (!GST_REGEX.test(text)) return 'Enter valid GST (e.g. 27ABCDE1234F1Z5)';
        return '';
      case 'tempPassword':
        if (!text) return '';
        if (!STRONG_PASSWORD_REGEX.test(text)) {
          return 'Password must be 8+ chars with upper, lower, number and symbol';
        }
        return '';
      default:
        return '';
    }
  };

  const validateForm = (data) => {
    const nextErrors = {};
    Object.keys(EMPTY_FORM).forEach((field) => {
      const message = validateField(field, data[field], data);
      if (message) nextErrors[field] = message;
    });
    return nextErrors;
  };

  const updateField = (field, value) => {
    setCreatedVendor(null);
    setFormData((prev) => {
      const next = field === 'stateId' ? { ...prev, stateId: value, cityId: '' } : { ...prev, [field]: value };

      setErrors((current) => {
        const updated = { ...current };

        const fieldError = validateField(field, next[field], next);
        if (fieldError) updated[field] = fieldError;
        else delete updated[field];

        if (field === 'stateId') {
          const cityError = validateField('cityId', next.cityId, next);
          if (cityError) updated.cityId = cityError;
          else delete updated.cityId;
        }

        return updated;
      });

      return next;
    });
  };

  const handleStateChange = async (stateId) => {
    updateField('stateId', stateId);
    setCities([]);
    if (!stateId) return;

    try {
      const c = await vendorApi.getCities(stateId);
      setCities(c || []);
    } catch (error) {
      toast({ title: 'Failed to load cities', description: error.message, variant: 'destructive' });
    }
  };

  const copyCredentials = async () => {
    if (!createdVendor) return;
    const text = `Email: ${createdVendor.email}\nPassword: ${createdVendor.password}\nVendor ID: ${createdVendor.vendorId}`;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Credentials copied' });
    } catch {
      toast({ title: 'Copy failed', description: 'Please copy manually.', variant: 'destructive' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const sanitized = {
      companyName: cleanText(formData.companyName || '').trim(),
      ownerName: cleanText(formData.ownerName || '').trim(),
      email: sanitizeEmail(formData.email || ''),
      phone: sanitizePhone(formData.phone || ''),
      address: cleanText(formData.address || '').trim(),
      stateId: String(formData.stateId || '').trim(),
      cityId: String(formData.cityId || '').trim(),
      gstNumber: sanitizeGst(formData.gstNumber || ''),
      tempPassword: String(formData.tempPassword || '').trim(),
    };

    const nextErrors = validateForm(sanitized);
    setErrors(nextErrors);
    setFormData(sanitized);
    setCreatedVendor(null);

    if (Object.keys(nextErrors).length > 0) {
      toast({
        title: 'Please fix form errors',
        description: 'All required fields must be valid before creating vendor.',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);

    try {
      const password = sanitized.tempPassword || generateTempPassword();

      // Create auth user but preserve employee session.
      const registerResponse = await fetchWithCsrf(apiUrl('/api/auth/register'), {
        method: 'POST',
        body: JSON.stringify({
          email: sanitized.email,
          password,
          full_name: sanitized.ownerName,
          role: 'VENDOR',
          phone: sanitized.phone,
          no_session: true,
        }),
      });

      let registerBody = null;
      try {
        registerBody = await registerResponse.json();
      } catch (_) {
        registerBody = null;
      }

      if (!registerResponse.ok || registerBody?.success === false) {
        throw new Error(registerBody?.error || `User registration failed (${registerResponse.status})`);
      }

      const userId = registerBody?.user?.id;
      if (!userId) throw new Error('User registration did not return user id');

      const stateName = states.find((s) => s.id === sanitized.stateId)?.name;
      const cityName = cities.find((c) => c.id === sanitized.cityId)?.name;

      await vendorApi.registerVendor({
        userId,
        companyName: sanitized.companyName,
        ownerName: sanitized.ownerName,
        email: sanitized.email,
        phone: sanitized.phone,
        address: sanitized.address,
        gstNumber: sanitized.gstNumber,
        stateId: sanitized.stateId,
        cityId: sanitized.cityId,
        stateName,
        cityName,
      });

      const vendor = await vendorApi.getVendorByUserId(userId);

      setCreatedVendor({
        vendorId: vendor?.vendor_id || 'N/A',
        email: sanitized.email,
        password,
      });

      toast({
        title: 'Vendor created',
        description: `Vendor ID: ${vendor?.vendor_id || 'N/A'}`
      });

      setFormData(EMPTY_FORM);
      setErrors({});
      setCities([]);
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

  return (
    <div className="w-full max-w-5xl mx-auto p-4 lg:p-6">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Internal Vendor Onboarding</CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Company Name <span className="text-red-500">*</span></Label>
                <Input
                  id="companyName"
                  name="companyName"
                  type="text"
                  autoComplete="organization"
                  value={formData.companyName}
                  onChange={(e) => updateField('companyName', sanitizeCompanyName(e.target.value))}
                  className={errors.companyName ? 'border-red-500' : ''}
                />
                {errors.companyName ? <p className="mt-1 text-xs text-red-500">{errors.companyName}</p> : null}
              </div>

              <div>
                <Label>Owner Name <span className="text-red-500">*</span></Label>
                <Input
                  id="ownerName"
                  name="ownerName"
                  type="text"
                  autoComplete="name"
                  value={formData.ownerName}
                  onChange={(e) => updateField('ownerName', sanitizeOwnerName(e.target.value))}
                  className={errors.ownerName ? 'border-red-500' : ''}
                />
                {errors.ownerName ? <p className="mt-1 text-xs text-red-500">{errors.ownerName}</p> : null}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Email <span className="text-red-500">*</span></Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => updateField('email', sanitizeEmail(e.target.value))}
                  className={errors.email ? 'border-red-500' : ''}
                />
                {errors.email ? <p className="mt-1 text-xs text-red-500">{errors.email}</p> : null}
              </div>

              <div>
                <Label>Business Phone <span className="text-red-500">*</span></Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  pattern="[0-9]{10}"
                  value={formData.phone}
                  onChange={(e) => updateField('phone', sanitizePhone(e.target.value))}
                  className={errors.phone ? 'border-red-500' : ''}
                />
                {errors.phone ? <p className="mt-1 text-xs text-red-500">{errors.phone}</p> : null}
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
                className={errors.gstNumber ? 'border-red-500' : ''}
              />
              {errors.gstNumber ? <p className="mt-1 text-xs text-red-500">{errors.gstNumber}</p> : null}
            </div>

            <div>
              <Label>Business Address <span className="text-red-500">*</span></Label>
              <Input
                id="address"
                name="address"
                type="text"
                autoComplete="street-address"
                value={formData.address}
                onChange={(e) => updateField('address', sanitizeAddress(e.target.value))}
                className={errors.address ? 'border-red-500' : ''}
              />
              {errors.address ? <p className="mt-1 text-xs text-red-500">{errors.address}</p> : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>State <span className="text-red-500">*</span></Label>
                <Select value={formData.stateId} onValueChange={handleStateChange}>
                  <SelectTrigger className={errors.stateId ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select State" />
                  </SelectTrigger>
                  <SelectContent>
                    {states.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.stateId ? <p className="mt-1 text-xs text-red-500">{errors.stateId}</p> : null}
              </div>

              <div>
                <Label>City <span className="text-red-500">*</span></Label>
                <Select
                  value={formData.cityId}
                  onValueChange={(v) => updateField('cityId', v)}
                >
                  <SelectTrigger className={errors.cityId ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select City" />
                  </SelectTrigger>
                  <SelectContent>
                    {cities.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.cityId ? <p className="mt-1 text-xs text-red-500">{errors.cityId}</p> : null}
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
                onChange={(e) => updateField('tempPassword', String(e.target.value || '').replace(/\s/g, ''))}
                className={errors.tempPassword ? 'border-red-500' : ''}
              />
              {errors.tempPassword ? <p className="mt-1 text-xs text-red-500">{errors.tempPassword}</p> : null}
              <p className="mt-1 text-xs text-slate-500">Leave blank to auto-generate a strong password.</p>
            </div>

            {createdVendor ? (
              <div className="rounded-md border bg-slate-50 p-3 space-y-2">
                <p className="text-sm font-medium text-slate-900">Vendor created successfully</p>
                <p className="text-xs text-slate-700">Vendor ID: {createdVendor.vendorId}</p>
                <p className="text-xs text-slate-700">Email: {createdVendor.email}</p>
                <p className="text-xs text-slate-700">Password: {createdVendor.password}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={copyCredentials}>
                    <Copy className="mr-1 h-4 w-4" /> Copy Credentials
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('/vendor/login', '_blank', 'noopener,noreferrer')}
                  >
                    <ExternalLink className="mr-1 h-4 w-4" /> Open Vendor Login
                  </Button>
                </div>
              </div>
            ) : null}

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
