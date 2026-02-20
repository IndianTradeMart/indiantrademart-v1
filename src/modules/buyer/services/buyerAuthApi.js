
import { supabase } from '@/lib/customSupabaseClient';

export const buyerAuthApi = {
  register: async (data) => {
    // 1. Sign up with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.full_name,
          role: 'BUYER'
        }
      }
    });

    if (authError) throw authError;

    if (authData.user) {
      // 2. Create Buyer Profile entry
      const { error: profileError } = await supabase
        .from('buyers')
        .insert([{
          user_id: authData.user.id,
          full_name: data.full_name,
          email: data.email,
          phone: data.phone,
          company_name: data.company_name,
          company_type: data.company_type,
          industry: data.industry,
          state: data.state,
          city: data.city
        }]);
      
      if (profileError) {
        // Cleanup if profile creation fails? (Advanced: use edge function for atomic transaction)
        console.error('Profile creation failed:', profileError);
        throw new Error('Account created but profile setup failed.');
      }
    }

    return { 
      user: authData.user, 
      next_step: authData.session ? 'go_dashboard' : 'verify_email' 
    };
  },

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  },

  logout: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  me: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile, error } = await supabase
      .from('buyers')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error) return null;
    return { ...user, ...profile };
  }
};
