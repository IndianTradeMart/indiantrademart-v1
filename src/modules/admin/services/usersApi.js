
import { supabase } from '@/lib/customSupabaseClient';

/**
 * Helper to clean payloads for UUID columns.
 * Converts empty strings to NULL to prevent "invalid input syntax for type uuid" errors.
 */
const sanitizeUuid = (val) => {
  if (!val || val === '') return null;
  return val;
};

export const usersApi = {
  // --- USERS CRUD ---
  
  createUser: async (userData) => {
    // 1. Create auth user (which handles password hashing securely)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: userData.email,
      password: userData.password,
      options: {
        data: {
          full_name: userData.full_name,
          role: userData.role || 'USER', // Default role
          phone: userData.phone
        }
      }
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error("Failed to create auth user");

    // 2. Insert into public.users table (if not handled by triggers)
    // We check if the user exists first to avoid duplicate key errors if a trigger exists
    const { data: existing } = await supabase.from('users').select('id').eq('id', authData.user.id).single();
    
    if (!existing) {
      const { error: dbError } = await supabase.from('users').insert([{
        id: authData.user.id,
        email: userData.email,
        full_name: userData.full_name,
        role: userData.role || 'USER',
        phone: userData.phone,
        created_at: new Date().toISOString()
      }]);
      
      if (dbError) throw dbError;
    }

    // 3. If role is specific (ADMIN, EMPLOYEE), add to respective tables
    if (['ADMIN', 'DATA_ENTRY', 'SALES', 'SUPPORT', 'HR'].includes(userData.role)) {
       await usersApi.employees.create({
         user_id: authData.user.id,
         full_name: userData.full_name,
         email: userData.email,
         phone: userData.phone,
         role: userData.role,
         department: userData.department || 'General',
         status: 'ACTIVE'
       });
    }

    return authData.user;
  },

  getUser: async (id) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  listUsers: async (roleFilter = null) => {
    let query = supabase.from('users').select('*').order('created_at', { ascending: false });
    
    if (roleFilter) {
      query = query.eq('role', roleFilter);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  updateUser: async (id, updates) => {
    // Sanitize payload
    const payload = {
      full_name: updates.full_name,
      phone: updates.phone,
      role: updates.role,
      updated_at: new Date().toISOString()
    };

    // Remove undefined
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    const { data, error } = await supabase
      .from('users')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return data;
  },

  deleteUser: async (id) => {
    // Note: Deleting from auth.users requires service_role key usually.
    // Here we delete from public tables. Auth deletion might need Edge Function.
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) throw error;
  },

  // --- ADMIN MANAGEMENT ---
  admins: {
    list: async () => {
      // Fetch users with ADMIN role
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'ADMIN');
      if (error) throw error;
      return data;
    }
  },

  // --- EMPLOYEE MANAGEMENT ---
  employees: {
    create: async (employeeData) => {
      const { data, error } = await supabase
        .from('employees')
        .insert([{
          user_id: employeeData.user_id,
          full_name: employeeData.full_name,
          email: employeeData.email,
          phone: employeeData.phone,
          role: employeeData.role,
          department: employeeData.department,
          status: 'ACTIVE'
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    list: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },

    update: async (id, updates) => {
      const { data, error } = await supabase
        .from('employees')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    
    assignToVendor: async (employeeId, vendorId) => {
      const { error } = await supabase
        .from('vendors')
        .update({ assigned_to: employeeId })
        .eq('id', vendorId);
      if (error) throw error;
    }
  }
};
