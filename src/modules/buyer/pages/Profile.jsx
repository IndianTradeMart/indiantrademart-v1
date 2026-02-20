
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { buyerProfileApi } from '@/modules/buyer/services/buyerProfileApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from '@/components/ui/use-toast';
import { Loader2, Upload, Save, User, Building, MapPin, Trash2, X, Pencil } from 'lucide-react';

const BuyerProfile = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    company_name: '',
    company_type: '',
    industry: '',
    gst_number: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    avatar_url: ''
  });
  const [savedData, setSavedData] = useState({
    full_name: '',
    email: '',
    phone: '',
    company_name: '',
    company_type: '',
    industry: '',
    gst_number: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    avatar_url: ''
  });

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const data = await buyerProfileApi.getProfile();

      if (data) {
        const nextData = {
          full_name: data.full_name || '',
          email: data.email || user.email || '',
          phone: data.phone || '',
          company_name: data.company_name || '',
          company_type: data.company_type || '',
          industry: data.industry || '',
          gst_number: data.gst_number || '',
          address: data.address || '',
          city: data.city || '',
          state: data.state || '',
          pincode: data.pincode || '',
          avatar_url: data.avatar_url || ''
        };
        setFormData(nextData);
        setSavedData(nextData);
      } else {
        // Initialize with user metadata if no buyer profile exists
        const nextData = {
          ...formData,
          email: user.email || '',
          full_name: user.user_metadata?.full_name || ''
        };
        setFormData(nextData);
        setSavedData(nextData);
      }
      setIsEditing(false);
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast({ title: "Error", description: "Failed to load profile", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = async (e) => {
    try {
      setUploading(true);
      const file = e.target.files[0];
      if (!file) return;
      const publicUrl = await buyerProfileApi.uploadAvatar(file);
      if (!publicUrl) {
        throw new Error('Upload failed');
      }

      setFormData(prev => ({ ...prev, avatar_url: publicUrl }));
      setSavedData(prev => ({ ...prev, avatar_url: publicUrl }));
      await saveData({ avatar_url: publicUrl });
      toast({ title: "Success", description: "Avatar updated" });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveImage = async () => {
    if (!formData.avatar_url || uploading) return;
    try {
      setUploading(true);
      await buyerProfileApi.updateProfile({ avatar_url: null });
      setFormData((prev) => ({ ...prev, avatar_url: '' }));
      setSavedData((prev) => ({ ...prev, avatar_url: '' }));
      toast({ title: 'Success', description: 'Profile photo removed' });
    } catch (error) {
      console.error('Error removing image:', error);
      toast({ title: 'Remove Failed', description: error.message || 'Could not remove image', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const saveData = async (dataToSave) => {
    await buyerProfileApi.updateProfile(dataToSave);
  };

  const handleSubmit = async () => {
    try {
      setSaving(true);
      await saveData(formData);
      setSavedData(formData);
      setIsEditing(false);
      toast({ title: "Profile Saved", description: "Your details have been updated." });
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({ title: "Save Failed", description: "Could not save profile changes.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setFormData(savedData);
    setIsEditing(false);
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="w-full space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
          <p className="text-gray-500">Manage your account details</p>
        </div>
        <div className="flex w-full sm:w-auto gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancelEdit} disabled={saving} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={saving} className="bg-blue-600 w-full sm:w-auto sm:min-w-[140px]">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save
              </Button>
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)} className="bg-blue-600 w-full sm:w-auto sm:min-w-[170px]">
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-1">
          <Card className="border border-slate-200 shadow-sm">
            <CardContent className="pt-4 pb-4 px-4 flex flex-col items-center">
              <div className="relative mb-2.5">
                <button
                  type="button"
                  className={`rounded-full ${formData.avatar_url ? 'cursor-zoom-in' : 'cursor-default'}`}
                  onClick={() => {
                    if (!formData.avatar_url) return;
                    setImagePreviewOpen(true);
                  }}
                  aria-label="Open profile image preview"
                >
                  <Avatar className="h-32 w-32 border-4 border-white shadow-lg">
                    <AvatarImage src={formData.avatar_url} />
                    <AvatarFallback className="text-3xl bg-blue-100 text-blue-700">
                      {formData.full_name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </button>
                <label className="absolute bottom-0 right-0 bg-blue-600 text-white p-2 rounded-full cursor-pointer hover:bg-blue-700">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
                </label>
                {formData.avatar_url ? (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    disabled={uploading}
                    className="absolute -top-1 -right-1 bg-red-600 text-white p-2 rounded-full hover:bg-red-700 disabled:opacity-60"
                    title="Remove profile photo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <h2 className="text-xl font-semibold text-slate-900 leading-tight text-center">{formData.full_name || 'User'}</h2>
              <p className="text-sm text-slate-600 mt-0.5 text-center break-all">{formData.email}</p>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-3">
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <User className="h-5 w-5 text-blue-600" />
                Personal Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-0 px-4 pb-4">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm text-slate-700">Full Name</Label>
                  <Input name="full_name" value={formData.full_name} onChange={handleInputChange} className="mt-1" disabled={!isEditing} />
                </div>
                <div>
                  <Label className="text-sm text-slate-700">Phone</Label>
                  <Input name="phone" type="tel" inputMode="numeric" value={formData.phone} onChange={handleInputChange} className="mt-1" disabled={!isEditing} />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-sm text-slate-700">Email</Label>
                  <Input value={formData.email} disabled className="bg-slate-50 mt-1" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Building className="h-5 w-5 text-blue-600" />
                Company Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-0 px-4 pb-4">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm text-slate-700">Company Name</Label>
                  <Input name="company_name" value={formData.company_name} onChange={handleInputChange} className="mt-1" disabled={!isEditing} />
                </div>
                <div>
                  <Label className="text-sm text-slate-700">Type</Label>
                  <select
                    name="company_type"
                    value={formData.company_type}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    className="w-full h-10 rounded-md border border-slate-200 bg-background px-3 py-2 text-sm mt-1 disabled:bg-slate-50 disabled:text-slate-500"
                  >
                    <option value="">Select Type</option>
                    <option value="Private Limited">Private Limited</option>
                    <option value="Proprietorship">Proprietorship</option>
                  </select>
                </div>
                <div>
                  <Label className="text-sm text-slate-700">Industry</Label>
                  <Input name="industry" value={formData.industry} onChange={handleInputChange} className="mt-1" disabled={!isEditing} />
                </div>
                <div>
                  <Label className="text-sm text-slate-700">GST Number</Label>
                  <Input name="gst_number" value={formData.gst_number} onChange={handleInputChange} className="mt-1" disabled={!isEditing} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <MapPin className="h-5 w-5 text-blue-600" />
                Address
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-0 px-4 pb-4">
               <div>
                 <Label className="text-sm text-slate-700">Street Address</Label>
                 <Input name="address" value={formData.address} onChange={handleInputChange} className="mt-1" disabled={!isEditing} />
               </div>
               <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-sm text-slate-700">City</Label>
                    <Input name="city" value={formData.city} onChange={handleInputChange} className="mt-1" disabled={!isEditing} />
                  </div>
                  <div>
                    <Label className="text-sm text-slate-700">State</Label>
                    <Input name="state" value={formData.state} onChange={handleInputChange} className="mt-1" disabled={!isEditing} />
                  </div>
                  <div>
                    <Label className="text-sm text-slate-700">Pincode</Label>
                    <Input name="pincode" inputMode="numeric" value={formData.pincode} onChange={handleInputChange} className="mt-1" disabled={!isEditing} />
                  </div>
               </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {imagePreviewOpen && formData.avatar_url ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"
          onClick={() => setImagePreviewOpen(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-xl bg-white p-3 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setImagePreviewOpen(false)}
              className="absolute right-2 top-2 rounded-full bg-slate-100 p-1.5 text-slate-600 hover:bg-slate-200"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={formData.avatar_url}
              alt={formData.full_name || 'Profile image'}
              className="w-full max-h-[320px] rounded-lg object-contain bg-slate-50"
            />
            <p className="mt-2 text-sm font-semibold text-slate-900 text-center">
              {formData.full_name || 'Profile'}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default BuyerProfile;
