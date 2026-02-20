
import { supabase } from '@/lib/customSupabaseClient';

export const superAdminApi = {
  // System Configuration & Maintenance
  system: {
    getMaintenanceStatus: async () => {
      const { data, error } = await supabase
        .from('system_config')
        .select('maintenance_mode, maintenance_message')
        .eq('config_key', 'maintenance_mode')
        .single();
      
      if (error) throw error;
      return data;
    },

    updateMaintenanceStatus: async (maintenanceMode, maintenanceMessage, userId) => {
      const { data, error } = await supabase
        .from('system_config')
        .update({
          maintenance_mode: maintenanceMode,
          maintenance_message: maintenanceMessage,
          updated_at: new Date(),
          updated_by: userId
        })
        .eq('config_key', 'maintenance_mode')
        .select();

      if (error) throw error;
      return data;
    },

    getSystemLogs: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    }
  },

  // Page Control
  pages: {
    getAll: async () => {
      const { data, error } = await supabase
        .from('page_status')
        .select('*')
        .order('page_name');
      if (error) throw error;
      return data;
    },

    updateStatus: async (pageId, isBlanked, errorMessage) => {
      const { data, error } = await supabase
        .from('page_status')
        .update({ 
          is_blanked: isBlanked, 
          error_message: errorMessage,
          updated_at: new Date()
        })
        .eq('id', pageId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    create: async (pageName, pageRoute, errorMessage) => {
      const { data, error } = await supabase
        .from('page_status')
        .insert([{
          page_name: pageName,
          page_route: pageRoute,
          error_message: errorMessage,
          is_blanked: false
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    delete: async (pageId) => {
      const { error } = await supabase
        .from('page_status')
        .delete()
        .eq('id', pageId);
      if (error) throw error;
      return true;
    }
  },

  // User Management
  users: {
    getAll: async (page = 1, limit = 10, search = '', roleFilter = 'ALL', statusFilter = 'ALL') => {
      let query = supabase
        .from('users')
        .select('*', { count: 'exact' });
      
      if (search) {
        query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
      }

      if (roleFilter !== 'ALL') {
        query = query.eq('role', roleFilter);
      }

      if (statusFilter !== 'ALL') {
        query = query.eq('status', statusFilter);
      }
      
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      
      const { data, count, error } = await query
        .range(from, to)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      return { data, count };
    },

    create: async (userData) => {
      // NOTE: Creating user in public.users. 
      // For auth.users, client-side creation logs in the user immediately which kills admin session.
      // In a real prod environment, this should be an Edge Function.
      const { data, error } = await supabase
        .from('users')
        .insert([{
          full_name: userData.name,
          email: userData.email,
          role: userData.role,
          status: userData.status || 'ACTIVE',
          password_hash: userData.password, // Storing hash/password as requested (insecure practice disclaimer needed)
          created_at: new Date(),
          updated_at: new Date()
        }])
        .select()
        .single();
        
      if (error) throw error;
      return data;
    },

    update: async (userId, userData) => {
      const { data, error } = await supabase
        .from('users')
        .update({
          full_name: userData.name,
          email: userData.email,
          role: userData.role,
          status: userData.status,
          updated_at: new Date()
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    delete: async (userId) => {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);
      if (error) throw error;
      return true;
    },

    resetPassword: async (userId, newPassword) => {
      const { error } = await supabase
        .from('users')
        .update({
          password_hash: newPassword, // In real app, hash this
          updated_at: new Date()
        })
        .eq('id', userId);
      if (error) throw error;
      return true;
    },

    toggleStatus: async (userId, currentStatus) => {
      const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const { error } = await supabase
        .from('users')
        .update({
          status: newStatus,
          updated_at: new Date()
        })
        .eq('id', userId);
      if (error) throw error;
      return newStatus;
    }
  },

  // Dashboard Overview Stats
  getDashboardStats: async () => {
    try {
      const [users, vendors, products] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('vendors').select('id', { count: 'exact', head: true }),
        supabase.from('products').select('id', { count: 'exact', head: true }),
      ]);

      return {
        totalUsers: users.count || 0,
        totalVendors: vendors.count || 0,
        totalProducts: products.count || 0,
      };
    } catch (e) {
      console.error("Error fetching dashboard stats:", e);
      return {
        totalUsers: 0,
        totalVendors: 0,
        totalProducts: 0,
      };
    }
  }
};
