
import { supabase } from '@/lib/customSupabaseClient';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';
import { resolveBuyerProfile } from '@/modules/buyer/services/buyerSession';

export const buyerProfileApi = {
  getProfile: async () => {
    return resolveBuyerProfile({ required: true });
  },

  updateProfile: async (updates) => {
    const res = await fetchWithCsrf(apiUrl('/api/auth/buyer/profile'), {
      method: 'PATCH',
      body: JSON.stringify(updates || {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.error || 'Failed to update profile');
    }
    return json?.buyer || null;
  },

  uploadAvatar: async (file) => {
    if (!file) throw new Error('No file selected');
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Image too large (max 5MB)');
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

    const res = await fetchWithCsrf(apiUrl('/api/auth/buyer/profile/avatar'), {
      method: 'POST',
      body: JSON.stringify({
        file_name: file.name,
        content_type: file.type,
        data_url: dataUrl,
        size: file.size,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.error || 'Failed to upload avatar');
    }

    return json?.publicUrl || null;
  },

  changePassword: async (newPassword) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) throw error;
    return true;
  }
};
