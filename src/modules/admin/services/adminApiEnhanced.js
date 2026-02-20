import { supabase } from '@/lib/customSupabaseClient';

export const adminApi = {
  // --- AUTHENTICATION ---
  auth: {
    me: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      const { data: admin } = await supabase
        .from('admin_users')
        .select('*')
        .eq('email', user.email)
        .maybeSingle();
      
      return { ...user, ...admin };
    },
    
    logout: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
  },

  // --- DASHBOARD STATISTICS ---
  getStats: async () => {
    try {
      const [users, vendors, buyers, products, proposals] = await Promise.all([
        supabase.from('auth.users').select('*', { count: 'exact', head: true }),
        supabase.from('vendors').select('*', { count: 'exact', head: true }).eq('is_verified', true),
        supabase.from('buyers').select('*', { count: 'exact', head: true }),
        supabase.from('products').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
        supabase.from('proposals').select('*', { count: 'exact', head: true })
      ]);

      const { data: revenueData } = await supabase.from('lead_purchases').select('amount');
      const { data: paymentData } = await supabase.from('vendor_payments').select('amount');
      
      const totalRevenue = (revenueData?.reduce((a, b) => a + (b.amount || 0), 0) || 0) + 
                          (paymentData?.reduce((a, b) => a + (b.amount || 0), 0) || 0);

      return {
        totalUsers: users.count || 0,
        activeVendors: vendors.count || 0,
        totalBuyers: buyers.count || 0,
        activeProducts: products.count || 0,
        totalProposals: proposals.count || 0,
        totalRevenue: totalRevenue
      };
    } catch (error) {
      console.error('Dashboard stats error:', error);
      throw error;
    }
  },

  // --- USER MANAGEMENT ---
  getUsers: async (role = null) => {
    let query = supabase.from('auth.users').select('*');
    if (role) {
      query = query.eq('role', role);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  getUserDetail: async (userId) => {
    const { data, error } = await supabase
      .from('auth.users')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  },

  // --- VENDOR MANAGEMENT ---
  getVendors: async (filters = {}) => {
    let query = supabase.from('vendors').select('*');
    
    if (filters.status) {
      query = query.eq('kyc_status', filters.status);
    }
    if (filters.verified) {
      query = query.eq('is_verified', filters.verified);
    }
    if (filters.search) {
      query = query.ilike('company_name', `%${filters.search}%`);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  getVendorDetail: async (vendorId) => {
    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', vendorId)
      .single();

    if (vendorError) throw vendorError;

    const { data: documents } = await supabase
      .from('vendor_documents')
      .select('*')
      .eq('vendor_id', vendorId);

    const { data: kyc } = await supabase
      .from('kyc_documents')
      .select('*')
      .eq('vendor_id', vendorId);

    return {
      ...vendor,
      documents: documents || [],
      kyc_documents: kyc || []
    };
  },

  // --- KYC VERIFICATION ---
  getKycPending: async () => {
    const { data, error } = await supabase
      .from('vendors')
      .select('id, company_name, owner_name, email, kyc_status, created_at')
      .eq('kyc_status', 'SUBMITTED')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  getKycDocuments: async (vendorId) => {
    const { data, error } = await supabase
      .from('kyc_documents')
      .select('*')
      .eq('vendor_id', vendorId);
    if (error) throw error;
    return data || [];
  },

  approveKyc: async (vendorId, remarks = '') => {
    const { error: updateError } = await supabase
      .from('vendors')
      .update({
        kyc_status: 'APPROVED',
        is_verified: true,
        verified_at: new Date().toISOString()
      })
      .eq('id', vendorId);

    if (updateError) throw updateError;

    // Log audit
    await logAuditAction('KYC_APPROVED', 'vendors', vendorId, { remarks });

    return { success: true };
  },

  rejectKyc: async (vendorId, reason = '') => {
    const { error: updateError } = await supabase
      .from('vendors')
      .update({
        kyc_status: 'REJECTED',
        is_verified: false
      })
      .eq('id', vendorId);

    if (updateError) throw updateError;

    // Log audit
    await logAuditAction('KYC_REJECTED', 'vendors', vendorId, { reason });

    return { success: true };
  },

  // --- BUYERS ---
  getBuyers: async (filters = {}) => {
    let query = supabase.from('buyers').select('*');
    
    if (filters.search) {
      query = query.ilike('full_name', `%${filters.search}%`);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  getBuyerDetail: async (buyerId) => {
    const { data, error } = await supabase
      .from('buyers')
      .select('*')
      .eq('id', buyerId)
      .single();
    if (error) throw error;
    return data;
  },

  // --- PRODUCTS ---
  getProducts: async (filters = {}) => {
    let query = supabase.from('products').select('*, vendors(company_name)');
    
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.vendor_id) {
      query = query.eq('vendor_id', filters.vendor_id);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // --- SUPPORT TICKETS ---
  getSupportTickets: async (filters = {}) => {
    let query = supabase
      .from('support_tickets')
      .select('*, vendors(company_name), buyers(full_name)');
    
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  getTicketDetail: async (ticketId) => {
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (ticketError) throw ticketError;

    const { data: messages } = await supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    return {
      ...ticket,
      messages: messages || []
    };
  },

  // --- AUDIT LOGS ---
  getAuditLogs: async (filters = {}) => {
    let query = supabase.from('audit_logs').select('*');
    
    if (filters.user_id) {
      query = query.eq('user_id', filters.user_id);
    }
    if (filters.action) {
      query = query.eq('action', filters.action);
    }
    if (filters.entity_type) {
      query = query.eq('entity_type', filters.entity_type);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false }).limit(1000);
    if (error) throw error;
    return data || [];
  },

  // --- SYSTEM CONFIG ---
  getSystemConfig: async () => {
    const { data, error } = await supabase.from('system_config').select('*');
    if (error) throw error;
    return data || [];
  },

  updateSystemConfig: async (configKey, value) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { data, error } = await supabase
      .from('system_config')
      .upsert({
        config_key: configKey,
        maintenance_mode: value.maintenance_mode,
        maintenance_message: value.maintenance_message,
        updated_by: user?.id,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // --- ANALYTICS ---
  getRecentOrders: async (limit = 10) => {
    const { data, error } = await supabase
      .from('lead_purchases')
      .select('*, vendors(company_name), leads(title)')
      .order('purchase_date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  getDataEntryPerformance: async () => {
    const { data: employees } = await supabase
      .from('employees')
      .select('id, full_name, user_id')
      .eq('role', 'DATA_ENTRY');

    if (!employees || employees.length === 0) return [];

    const performance = await Promise.all(employees.map(async (emp) => {
      const { count: vendorCount } = await supabase
        .from('vendors')
        .select('*', { count: 'exact', head: true })
        .eq('created_by_user_id', emp.user_id);

      const { data: vendors } = await supabase
        .from('vendors')
        .select('id')
        .eq('created_by_user_id', emp.user_id);

      let productCount = 0;
      if (vendors && vendors.length > 0) {
        const vendorIds = vendors.map(v => v.id);
        const { count } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .in('vendor_id', vendorIds);
        productCount = count || 0;
      }

      return {
        id: emp.id,
        name: emp.full_name,
        vendorsCreated: vendorCount || 0,
        productsListed: productCount
      };
    }));

    return performance;
  },

  // --- CATEGORIES ---
  getCategories: async (level = null) => {
    let query = supabase.from('categories').select('*');
    if (level) {
      query = query.eq('level', level);
    }
    const { data, error } = await query.order('name');
    if (error) throw error;
    return data || [];
  },

  createCategory: async (categoryData) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { data, error } = await supabase
      .from('categories')
      .insert([{
        ...categoryData,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    await logAuditAction('CATEGORY_CREATED', 'categories', data.id, categoryData);
    return data;
  },

  // --- LOCATIONS ---
  getStates: async () => {
    const { data, error } = await supabase
      .from('states')
      .select('*')
      .order('name');
    if (error) throw error;
    return data || [];
  },

  getCities: async (stateId) => {
    const { data, error } = await supabase
      .from('cities')
      .select('*')
      .eq('state_id', stateId)
      .order('name');
    if (error) throw error;
    return data || [];
  }
};

// Helper function to log audit actions
const logAuditAction = async (action, entityType, entityId, details = {}) => {
  const { data: { user } } = await supabase.auth.getUser();
  
  await supabase.from('audit_logs').insert([{
    user_id: user?.id,
    action: action,
    entity_type: entityType,
    entity_id: entityId,
    details: details,
    created_at: new Date().toISOString()
  }]);
};
