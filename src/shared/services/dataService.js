import { supabase } from '@/lib/customSupabaseClient';

export const dataService = {
  // Generic Fetch
  getAll: async (table, select = '*') => {
    const { data, error } = await supabase.from(table).select(select);
    if (error) throw error;
    return data;
  },

  getById: async (table, id, select = '*') => {
    const { data, error } = await supabase.from(table).select(select).eq('id', id).single();
    if (error) throw error;
    return data;
  },

  // Specific Module Helpers
  
  // Buyer
  getBuyerProfile: async (userId) => {
    const { data, error } = await supabase.from('buyers').select('*').eq('user_id', userId).single();
    if (error && error.code !== 'PGRST116') throw error; // Ignore not found
    return data;
  },

  // Vendor
  getVendorProfile: async (userId) => {
     const { data, error } = await supabase.from('vendors').select('*').eq('user_id', userId).single();
     if (error && error.code !== 'PGRST116') throw error;
     return data;
  },

  // Products
  getProducts: async (filters = {}) => {
    let query = supabase.from('products').select('*, vendor:vendors(company_name)');
    
    if (filters.category) query = query.eq('category', filters.category);
    if (filters.vendorId) query = query.eq('vendor_id', filters.vendorId);
    if (filters.limit) query = query.limit(filters.limit);
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
  
  // Leads (Sales)
  getLeads: async () => {
    const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
};