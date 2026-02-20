
import { supabase } from '@/lib/customSupabaseClient';

export const hrApi = {
  getEmployees: async () => {
    const { data, error } = await supabase.from('employees').select('*');
    if (error) throw error;
    return data;
  },
  
  getStats: async () => {
     const { count, error } = await supabase.from('employees').select('*', { count: 'exact', head: true });
     if (error) throw error;
     return {
        totalEmployees: count || 0,
        active: count || 0, // Simplified
        onLeave: 0
     };
  }
};
