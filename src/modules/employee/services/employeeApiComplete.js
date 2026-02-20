import { supabase } from '@/lib/customSupabaseClient';

// Helper to get current employee ID from auth user
const getEmployeeId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  
  const { data: employee, error } = await supabase
    .from('employees')
    .select('id')
    .eq('user_id', user.id)
    .single();
    
  if (error || !employee) {
    throw new Error('Employee profile not found');
  }
  return employee.id;
};

export const employeeApi = {
  // --- AUTH & PROFILE ---
  auth: {
    me: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      const { data: employee } = await supabase
        .from('employees')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      return { ...user, ...employee };
    },
    
    logout: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
  },

  // --- EMPLOYEE PROFILE ---
  getProfile: async (employeeId) => {
    if (!employeeId) {
      employeeId = await getEmployeeId();
    }
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('id', employeeId)
      .single();
    if (error) throw error;
    return data;
  },

  updateProfile: async (updates) => {
    const employeeId = await getEmployeeId();
    const { data, error } = await supabase
      .from('employees')
      .update(updates)
      .eq('id', employeeId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // --- SUPPORT TICKETS ---
  createTicket: async (ticketData) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    const payload = {
      vendor_id: ticketData.vendor_id || null,
      buyer_id: ticketData.buyer_id || null,
      subject: ticketData.subject,
      description: ticketData.description,
      category: ticketData.category || 'General Inquiry',
      priority: ticketData.priority || 'Medium',
      status: 'OPEN',
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('support_tickets')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  getTickets: async (role = 'SUPPORT') => {
    let query = supabase.from('support_tickets').select('*, vendors(company_name), buyers(full_name)');
    
    // Filter based on role
    if (role === 'SALES') {
      query = query.eq('category', 'Sales Inquiry');
    } else if (role === 'SUPPORT') {
      query = query.neq('status', 'CLOSED');
    } else if (role === 'DATA_ENTRY') {
      query = query.eq('category', 'Data Entry Issue');
    }
    
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(100);

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

  addTicketMessage: async (ticketId, message) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { data, error } = await supabase
      .from('ticket_messages')
      .insert([{
        ticket_id: ticketId,
        sender_id: user.id,
        sender_type: 'SUPPORT',
        message: message,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  closeTicket: async (ticketId) => {
    const { data, error } = await supabase
      .from('support_tickets')
      .update({ 
        status: 'CLOSED',
        resolved_at: new Date().toISOString()
      })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  updateTicketStatus: async (ticketId, status) => {
    const { data, error } = await supabase
      .from('support_tickets')
      .update({ status, last_reply_at: new Date().toISOString() })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // --- DATA ENTRY ---
  createVendor: async (vendorData) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { data, error } = await supabase
      .from('vendors')
      .insert([{
        ...vendorData,
        created_by_user_id: user.id,
        kyc_status: 'PENDING',
        is_active: false,
        is_verified: false,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  getVendors: async (createdByMe = false) => {
    let query = supabase.from('vendors').select('*');
    
    if (createdByMe) {
      const { data: { user } } = await supabase.auth.getUser();
      query = query.eq('created_by_user_id', user.id);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  updateVendor: async (vendorId, updates) => {
    const { data, error } = await supabase
      .from('vendors')
      .update(updates)
      .eq('id', vendorId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // --- KYC MANAGEMENT ---
  uploadKycDocument: async (vendorId, documentType, file) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `vendor-kyc/${vendorId}/${documentType}_${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);

    const { data, error } = await supabase
      .from('kyc_documents')
      .insert([{
        vendor_id: vendorId,
        document_type: documentType,
        file_path: publicUrl,
        status: 'PENDING',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  getKycDocuments: async (vendorId) => {
    const { data, error } = await supabase
      .from('kyc_documents')
      .select('*')
      .eq('vendor_id', vendorId);

    if (error) throw error;
    return data || [];
  },

  submitKyc: async (vendorId) => {
    const { data, error } = await supabase
      .from('vendors')
      .update({ kyc_status: 'SUBMITTED' })
      .eq('id', vendorId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // --- CATEGORIES ---
  getHeadCategories: async () => {
    const { data, error } = await supabase
      .from('head_categories')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  getSubCategories: async (headCategoryId) => {
    const { data, error } = await supabase
      .from('sub_categories')
      .select('*')
      .eq('head_category_id', headCategoryId)
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  getMicroCategories: async (subCategoryId) => {
    const { data, error } = await supabase
      .from('micro_categories')
      .select('*')
      .eq('sub_category_id', subCategoryId)
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  // --- REQUIREMENTS & SUGGESTIONS ---
  getRequirements: async (filters = {}) => {
    let query = supabase.from('requirements').select('*');
    
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  updateRequirementStatus: async (requirementId, status) => {
    const { data, error } = await supabase
      .from('requirements')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', requirementId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  getSuggestions: async () => {
    const { data, error } = await supabase
      .from('suggestions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // --- LEADS ---
  getLeads: async (filters = {}) => {
    let query = supabase.from('leads').select('*');
    
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  createLead: async (leadData) => {
    const { data, error } = await supabase
      .from('leads')
      .insert([{
        ...leadData,
        status: 'AVAILABLE',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // --- QUOTES ---
  getQuotes: async () => {
    const { data, error } = await supabase
      .from('quotes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // --- DASHBOARD STATS ---
  getDashboardStats: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    const [ticketsCount, vendorsCount, leadsCount] = await Promise.all([
      supabase.from('support_tickets').select('*', { count: 'exact', head: true }).neq('status', 'CLOSED'),
      supabase.from('vendors').select('*', { count: 'exact', head: true }).eq('created_by_user_id', user.id),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'AVAILABLE')
    ]);

    return {
      pendingTickets: ticketsCount.count || 0,
      vendorsCreated: vendorsCount.count || 0,
      availableLeads: leadsCount.count || 0
    };
  }
};
