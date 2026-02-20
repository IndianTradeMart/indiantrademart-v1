
import { supabase } from '@/lib/customSupabaseClient';
import { resolveBuyerId, resolveBuyerProfile } from '@/modules/buyer/services/buyerSession';

export const buyerProposalApi = {
  list: async (status = 'ALL') => {
    const buyerId = await resolveBuyerId({ required: true });

    let query = supabase
      .from('proposals')
      .select('*, vendor:vendors(company_name, id)')
      .eq('buyer_id', buyerId)
      .order('created_at', { ascending: false });

    if (status !== 'ALL') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  get: async (id) => {
    const { data, error } = await supabase
      .from('proposals')
      .select('*, vendor:vendors(*)')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  create: async (proposalData) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const buyer = await resolveBuyerProfile({ required: true });
    const buyerId = buyer?.id;
    if (!buyerId) throw new Error('Buyer profile not found');
    
    const { data, error } = await supabase
      .from('proposals')
      .insert([{ ...proposalData, buyer_id: buyerId, status: 'SENT' }])
      .select()
      .single();

    if (error) throw error;

    // Get vendor details to send notification
    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('id, user_id, company_name, email')
      .eq('id', proposalData.vendor_id)
      .single();

    if (vendorError) throw vendorError;

    // Create notification for vendor
    try {
      let vendorUserId = vendor?.user_id || null;
      if (!vendorUserId && vendor?.email) {
        const { data: userRow } = await supabase
          .from('users')
          .select('id')
          .eq('email', String(vendor.email).toLowerCase().trim())
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        vendorUserId = userRow?.id || null;
      }

      if (vendorUserId) {
        const notificationPayload = {
          user_id: vendorUserId,
          title: 'New Proposal Received',
          message: `${buyer.full_name || 'A buyer'} sent a proposal for ${proposalData.product_name || 'a product'}`,
          type: 'PROPOSAL',
          reference_id: data.id,
          is_read: false,
          created_at: new Date().toISOString()
        };

        console.log('Creating notification with payload:', notificationPayload);

        let { data: notifData, error: notifError } = await supabase
          .from('notifications')
          .insert([notificationPayload])
          .select();

        if (notifError && String(notifError?.message || '').toLowerCase().includes('reference_id')) {
          const fallbackPayload = { ...notificationPayload };
          delete fallbackPayload.reference_id;
          ({ data: notifData, error: notifError } = await supabase
            .from('notifications')
            .insert([fallbackPayload])
            .select());
        }

        if (notifError) {
          console.error('Failed to create notification:', notifError);
        } else {
          console.log('Notification created successfully:', notifData);
        }
      } else {
        console.warn('Vendor user mapping not found for proposal notification');
      }
    } catch (notifException) {
      console.error('Error creating notification:', notifException);
    }

    return data;
  },

  close: async (id) => {
    const { data, error } = await supabase
      .from('proposals')
      .update({ status: 'CLOSED' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};
