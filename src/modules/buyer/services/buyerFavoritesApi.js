
import { supabase } from '@/lib/customSupabaseClient';
import { resolveBuyerId } from '@/modules/buyer/services/buyerSession';

export const buyerFavoritesApi = {
  list: async () => {
    const buyerId = await resolveBuyerId({ required: true });
    
    const { data, error } = await supabase
      .from('favorites')
      .select('*, vendor:vendors(*)')
      .eq('buyer_id', buyerId);

    if (error) throw error;
    return data;
  },

  add: async (vendorId) => {
    const buyerId = await resolveBuyerId({ required: true });
    
    const { data, error } = await supabase
      .from('favorites')
      .insert([{ buyer_id: buyerId, vendor_id: vendorId }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  remove: async (vendorId) => {
    const buyerId = await resolveBuyerId({ required: true });
    
    const { error } = await supabase
      .from('favorites')
      .delete()
      .match({ buyer_id: buyerId, vendor_id: vendorId });

    if (error) throw error;
    return true;
  }
};
