import { supabase } from '@/lib/customSupabaseClient';

export const dataEntryApi = {
  // --- PRODUCTS ---
  products: {
    list: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, vendor_id, vendors(company_name), status, created_at, price')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }
  },

  // --- HEAD CATEGORIES ---
  headCategories: {
    list: async () => {
      const { data, error } = await supabase
        .from('head_categories')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    create: async (name, description = '', imageUrl = '') => {
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const { data, error } = await supabase
        .from('head_categories')
        .insert([{ name, slug, description, image_url: imageUrl, is_active: true }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    update: async (id, updates) => {
      if (updates.name) {
        updates.slug = updates.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      }
      const { data, error } = await supabase
        .from('head_categories')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    delete: async (id) => {
      const { error } = await supabase.from('head_categories').delete().eq('id', id);
      if (error) throw error;
    }
  },

  // --- SUB CATEGORIES ---
  subCategories: {
    list: async () => {
      const { data, error } = await supabase
        .from('sub_categories')
        .select('*, head_categories(name)')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    create: async (headCategoryId, name, description = '', imageUrl = '') => {
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const { data, error } = await supabase
        .from('sub_categories')
        .insert([{ head_category_id: headCategoryId, name, slug, description, image_url: imageUrl, is_active: true }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    update: async (id, updates) => {
      if (updates.name) {
        updates.slug = updates.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      }
      const { data, error } = await supabase
        .from('sub_categories')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    delete: async (id) => {
      const { error } = await supabase.from('sub_categories').delete().eq('id', id);
      if (error) throw error;
    }
  },

  // --- MICRO CATEGORIES ---
  microCategories: {
    list: async () => {
      const { data, error } = await supabase
        .from('micro_categories')
        .select('*, sub_categories(name, head_categories(name))')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    create: async (subCategoryId, name) => {
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const { data, error } = await supabase
        .from('micro_categories')
        .insert([{ sub_category_id: subCategoryId, name, slug, is_active: true }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    update: async (id, updates) => {
      if (updates.name) {
        updates.slug = updates.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      }
      const { data, error } = await supabase
        .from('micro_categories')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    delete: async (id) => {
      const { error } = await supabase.from('micro_categories').delete().eq('id', id);
      if (error) throw error;
    }
  },

  // --- STATES ---
  states: {
    list: async () => {
      const { data, error } = await supabase
        .from('states')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    create: async (name) => {
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const { data, error} = await supabase
        .from('states')
        .insert([{ name, slug, is_active: true }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    update: async (id, name, isActive) => {
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const { data, error } = await supabase
        .from('states')
        .update({ name, slug, is_active: isActive })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    delete: async (id) => {
      const { error } = await supabase.from('states').delete().eq('id', id);
      if (error) throw error;
    }
  },

  // --- CITIES ---
  cities: {
    list: async () => {
      const { data, error } = await supabase
        .from('cities')
        .select('*, states(name)')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    create: async (stateId, name) => {
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const { data, error } = await supabase
        .from('cities')
        .insert([{ state_id: stateId, name, slug, is_active: true }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    update: async (id, name, isActive) => {
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const { data, error } = await supabase
        .from('cities')
        .update({ name, slug, is_active: isActive })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    delete: async (id) => {
      const { error } = await supabase.from('cities').delete().eq('id', id);
      if (error) throw error;
    }
  }
};
