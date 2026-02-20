
import { supabase } from '@/lib/customSupabaseClient';

export const adminKycApi = {
  getAllVendors: async ({ status, search, page = 1, limit = 10 }) => {
    let query = supabase
      .from('vendors')
      .select('*, kyc_docs:kyc_documents(*)', { count: 'exact' });

    if (status && status !== 'all') {
      // Map UI status to DB status
      const statusMap = { 
        'pending': 'PENDING', 
        'approved': 'VERIFIED', 
        'rejected': 'REJECTED' 
      };
      query = query.eq('kyc_status', statusMap[status] || status);
    }

    if (search) {
      query = query.or(`company_name.ilike.%${search}%,email.ilike.%${search}%,vendor_id.ilike.%${search}%`);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    return { data, count };
  },

  approveVendor: async (vendorId) => {
    // 1. Update Vendor Status
    const { error } = await supabase
      .from('vendors')
      .update({ 
        kyc_status: 'VERIFIED',
        verification_badge: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', vendorId);

    if (error) throw error;

    // 2. Create Notification (Simulated)
    // In a real app, this would be a trigger or a separate insert
    await supabase.from('notifications').insert([{
        user_id: (await supabase.from('vendors').select('user_id').eq('id', vendorId).single()).data.user_id,
        type: 'kyc_approved',
        title: 'KYC Approved',
        message: 'Your KYC documents have been verified. You can now list products.',
        is_read: false
    }]);

    return true;
  },

  rejectVendor: async (vendorId, remarks) => {
    const { data: { user } } = await supabase.auth.getUser();

    // 1. Update Vendor Status
    const { error } = await supabase
      .from('vendors')
      .update({ 
        kyc_status: 'REJECTED',
        verification_badge: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', vendorId);

    if (error) throw error;

    // 2. Add Remarks
    const { error: remarkError } = await supabase
      .from('kyc_remarks')
      .insert([{
        vendor_id: vendorId,
        remarks: remarks,
        created_by: user.id
      }]);

    if (remarkError) throw remarkError;

    // 3. Notification
    await supabase.from('notifications').insert([{
        user_id: (await supabase.from('vendors').select('user_id').eq('id', vendorId).single()).data.user_id,
        type: 'kyc_rejected',
        title: 'KYC Rejected',
        message: `Your KYC was rejected. Reason: ${remarks}`,
        is_read: false
    }]);

    return true;
  },

  getVendorRemarks: async (vendorId) => {
    const { data, error } = await supabase
      .from('kyc_remarks')
      .select('*, created_by_user:users(full_name)') // Assuming users table has full_name
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    return data;
  }
};
