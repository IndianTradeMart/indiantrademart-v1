// File: src/modules/category/services/categoryApi.js
import { supabase } from '@/lib/customSupabaseClient';

// Helper to generate slug
const generateSlug = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

export const categoryApi = {
  // --- HEAD CATEGORIES API ---
  headCategories: {
    list: async (includeInactive = false) => {
      let query = supabase
        .from('head_categories')
        .select('*');

      if (!includeInactive) query = query.eq('is_active', true);

      const { data, error } = await query.order('name');
      if (error) throw error;
      return data || [];
    },

    get: async (id) => {
      const { data, error } = await supabase
        .from('head_categories')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },

    getBySlug: async (slug) => {
      const { data, error } = await supabase
        .from('head_categories')
        .select('*')
        .eq('slug', slug)
        .single();
      if (error) throw error;
      return data;
    },

    create: async (name, slug, metadata = {}) => {
      const { data, error } = await supabase
        .from('head_categories')
        .insert([{
          name,
          slug: slug || generateSlug(name),
          is_active: true,
          image_url: metadata.imageUrl || null,
          description: metadata.description || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    update: async (id, updates) => {
      const { data, error } = await supabase
        .from('head_categories')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    delete: async (id) => {
      const { error } = await supabase.from('head_categories').delete().eq('id', id);
      if (error) throw error;
    },

    toggle: async (id, isActive) => {
      const { data, error } = await supabase
        .from('head_categories')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  },

  // --- SUB CATEGORIES API ---
  subCategories: {
    list: async (headCategoryId, includeInactive = false) => {
      let query = supabase
        .from('sub_categories')
        .select('*')
        .eq('head_category_id', headCategoryId);

      if (!includeInactive) query = query.eq('is_active', true);

      const { data, error } = await query.order('name');
      if (error) throw error;
      return data || [];
    },

    listAll: async (includeInactive = false) => {
      let query = supabase
        .from('sub_categories')
        .select('*, head_category:head_categories(id, name, slug)');

      if (!includeInactive) query = query.eq('is_active', true);

      const { data, error } = await query.order('name');
      if (error) throw error;
      return data || [];
    },

    get: async (id) => {
      const { data, error } = await supabase
        .from('sub_categories')
        .select('*, head_category:head_categories(*)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },

    getBySlug: async (slug) => {
      const { data, error } = await supabase
        .from('sub_categories')
        .select('*, head_category:head_categories(*)')
        .eq('slug', slug)
        .single();
      if (error) throw error;
      return data;
    },

    create: async (headCategoryId, name, slug, metadata = {}) => {
      const { data, error } = await supabase
        .from('sub_categories')
        .insert([{
          head_category_id: headCategoryId,
          name,
          slug: slug || generateSlug(name),
          is_active: true,
          image_url: metadata.imageUrl || null,
          description: metadata.description || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    update: async (id, updates) => {
      const { data, error } = await supabase
        .from('sub_categories')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    delete: async (id) => {
      const { error } = await supabase.from('sub_categories').delete().eq('id', id);
      if (error) throw error;
    },

    toggle: async (id, isActive) => {
      const { data, error } = await supabase
        .from('sub_categories')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  },

  // --- MICRO CATEGORIES API ---
  microCategories: {
    list: async (subCategoryId, includeInactive = false) => {
      let query = supabase
        .from('micro_categories')
        .select('*')
        .eq('sub_category_id', subCategoryId);

      if (!includeInactive) query = query.eq('is_active', true);

      const { data, error } = await query.order('name');
      if (error) throw error;
      return data || [];
    },

    listAll: async (includeInactive = false) => {
      let query = supabase
        .from('micro_categories')
        .select(`
          *,
          sub_category:sub_categories(id, name, slug, head_categories(id, name, slug))
        `);

      if (!includeInactive) query = query.eq('is_active', true);

      const { data, error } = await query.order('name');
      if (error) throw error;
      return data || [];
    },

    get: async (id) => {
      const { data, error } = await supabase
        .from('micro_categories')
        .select(`
          *,
          sub_category:sub_categories(*, head_categories(*))
        `)
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },

    getBySlug: async (slug) => {
      const { data, error } = await supabase
        .from('micro_categories')
        .select(`
          *,
          sub_category:sub_categories(*, head_categories(*))
        `)
        .eq('slug', slug)
        .single();
      if (error) throw error;
      return data;
    },

    create: async (subCategoryId, name, slug) => {
      const { data, error } = await supabase
        .from('micro_categories')
        .insert([{
          sub_category_id: subCategoryId,
          name,
          slug: slug || generateSlug(name),
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    update: async (id, updates) => {
      const { data, error } = await supabase
        .from('micro_categories')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    delete: async (id) => {
      const { error } = await supabase.from('micro_categories').delete().eq('id', id);
      if (error) throw error;
    },

    toggle: async (id, isActive) => {
      const { data, error } = await supabase
        .from('micro_categories')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  },

  // --- CATEGORY HIERARCHY API ---
  hierarchy: {
    getFullHierarchy: async () => {
      const { data, error } = await supabase
        .from('head_categories')
        .select(`
          *,
          sub_categories(
            *,
            micro_categories(id, name, slug, is_active)
          )
        `)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },

    getHeadWithSubAndMicro: async (headSlug) => {
      const { data, error } = await supabase
        .from('head_categories')
        .select(`
          *,
          sub_categories(
            *,
            micro_categories(*)
          )
        `)
        .eq('slug', headSlug)
        .eq('is_active', true)
        .single();
      if (error) throw error;
      return data;
    },

    getSubWithMicro: async (subSlug) => {
      const { data, error } = await supabase
        .from('sub_categories')
        .select(`
          *,
          head_categories(*),
          micro_categories(*)
        `)
        .eq('slug', subSlug)
        .eq('is_active', true)
        .single();
      if (error) throw error;
      return data;
    },

    searchCategories: async (query) => {
      if (!query || query.length < 2) return [];

      const { data: headResults } = await supabase
        .from('head_categories')
        .select('id, name, slug, is_active')
        .ilike('name', `%${query}%`)
        .eq('is_active', true);

      const { data: subResults } = await supabase
        .from('sub_categories')
        .select('id, name, slug, is_active')
        .ilike('name', `%${query}%`)
        .eq('is_active', true);

      const { data: microResults } = await supabase
        .from('micro_categories')
        .select('id, name, slug, is_active')
        .ilike('name', `%${query}%`)
        .eq('is_active', true);

      return {
        headCategories: headResults || [],
        subCategories: subResults || [],
        microCategories: microResults || []
      };
    }
  }
};
