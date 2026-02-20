
import { supabase } from '@/lib/customSupabaseClient';

// Ensure we handle authentication implicitly via the client
// The client handles tokens automatically.

export const categoryHierarchyApi = {
  // --- HEAD CATEGORIES ---
  getHeadCategories: async () => {
    const { data, error } = await supabase
      .from('head_categories')
      .select('*, sub_categories(count)')
      .order('name');
    if (error) {
      console.error("Fetch Head Cat Error:", error);
      throw error;
    }
    return data || [];
  },

  createHeadCategory: async (payload) => {
    const { data, error } = await supabase.from('head_categories').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },

  updateHeadCategory: async (id, payload) => {
    const { data, error } = await supabase.from('head_categories').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  deleteHeadCategory: async (id) => {
    // Check for subs
    const { count } = await supabase.from('sub_categories').select('*', { count: 'exact', head: true }).eq('head_category_id', id);
    if (count > 0) throw new Error("Cannot delete: Category has sub-categories");
    
    const { error } = await supabase.from('head_categories').delete().eq('id', id);
    if (error) throw error;
  },

  // --- SUB CATEGORIES ---
  getSubCategories: async (headId) => {
    const { data, error } = await supabase
      .from('sub_categories')
      .select('*, micro_categories(count)')
      .eq('head_category_id', headId)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  createSubCategory: async (payload) => {
    const { data, error } = await supabase.from('sub_categories').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },

  updateSubCategory: async (id, payload) => {
    const { data, error } = await supabase.from('sub_categories').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  deleteSubCategory: async (id) => {
    const { count } = await supabase.from('micro_categories').select('*', { count: 'exact', head: true }).eq('sub_category_id', id);
    if (count > 0) throw new Error("Cannot delete: Category has micro-categories");
    
    const { error } = await supabase.from('sub_categories').delete().eq('id', id);
    if (error) throw error;
  },

  // --- MICRO CATEGORIES ---
  getMicroCategories: async (subId) => {
    const { data, error } = await supabase
      .from('micro_categories')
      .select('*')
      .eq('sub_category_id', subId)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  createMicroCategory: async (payload) => {
    const { data, error } = await supabase.from('micro_categories').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },

  updateMicroCategory: async (id, payload) => {
    const { data, error } = await supabase.from('micro_categories').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  deleteMicroCategory: async (id) => {
    const { error } = await supabase.from('micro_categories').delete().eq('id', id);
    if (error) throw error;
  },

  // --- META TAGS ---
  getMicroCategoryMeta: async (microId) => {
    let res = await supabase
      .from('micro_category_meta')
      .select('*, states(name), cities(name)')
      .eq('micro_category_id', microId);
    if (res.error && (res.error.code === '42703' || /column .* does not exist/i.test(res.error.message || ''))) {
      res = await supabase
        .from('micro_category_meta')
        .select('*, states(name), cities(name)')
        .eq('micro_categories', microId);
    }
    if (res.error) throw res.error;
    return res.data || [];
  },

  createMicroCategoryMeta: async (payload) => {
    // Handle optional foreign keys (if 'none' or empty, set to null)
    const cleanPayload = {
      ...payload,
      state_id: payload.state_id === 'none' || !payload.state_id ? null : payload.state_id,
      city_id: payload.city_id === 'none' || !payload.city_id ? null : payload.city_id,
    };
    const basePayload = {
      ...cleanPayload,
    };
    delete basePayload.micro_category_id;
    delete basePayload.micro_categories;

    const microId = payload.micro_category_id || payload.micro_categories || null;
    let res = await supabase
      .from('micro_category_meta')
      .insert([{ ...basePayload, micro_category_id: microId }])
      .select()
      .single();
    if (res.error && (res.error.code === '42703' || /column .* does not exist/i.test(res.error.message || ''))) {
      res = await supabase
        .from('micro_category_meta')
        .insert([{ ...basePayload, micro_categories: microId }])
        .select()
        .single();
    }
    if (res.error) throw res.error;
    return res.data;
  },

  deleteMicroCategoryMeta: async (id) => {
    const { error } = await supabase.from('micro_category_meta').delete().eq('id', id);
    if (error) throw error;
  },

  // --- IMPORT ---
  importCategories: async (rows) => {
     let success = 0;
     let failed = 0;
     let errors = [];
     
     // Cache lookups to speed up
     // Ideally fetches all current cats, but for safety we might just upsert or check individually 
     // For this impl, we'll check individually to be safe on hierarchy
     
     for (const row of rows) {
       try {
         const headName = row.head_category?.trim();
         const subName = row.sub_category?.trim();
         const microName = row.micro_category?.trim();
         
         if (!headName || !subName || !microName) {
           failed++;
           errors.push(`Row missing data: ${JSON.stringify(row)}`);
           continue;
         }
         
         // 1. Head
         let headId;
         const { data: head } = await supabase.from('head_categories').select('id').eq('name', headName).maybeSingle();
         if (head) {
           headId = head.id;
         } else {
           const slug = headName.toLowerCase().replace(/[^a-z0-9]/g, '-');
           const { data: newHead, error: hErr } = await supabase.from('head_categories').insert([{ name: headName, slug, is_active: true }]).select().single();
           if (hErr) throw hErr;
           headId = newHead.id;
         }

         // 2. Sub
         let subId;
         const { data: sub } = await supabase.from('sub_categories').select('id').eq('name', subName).eq('head_category_id', headId).maybeSingle();
         if (sub) {
           subId = sub.id;
         } else {
           const slug = subName.toLowerCase().replace(/[^a-z0-9]/g, '-');
           const { data: newSub, error: sErr } = await supabase.from('sub_categories').insert([{ name: subName, slug, head_category_id: headId, is_active: true }]).select().single();
           if (sErr) throw sErr;
           subId = newSub.id;
         }

         // 3. Micro
         const { data: micro } = await supabase.from('micro_categories').select('id').eq('name', microName).eq('sub_category_id', subId).maybeSingle();
         if (!micro) {
           const slug = microName.toLowerCase().replace(/[^a-z0-9]/g, '-');
           const { error: mErr } = await supabase.from('micro_categories').insert([{ name: microName, slug, sub_category_id: subId, is_active: true }]);
           if (mErr) throw mErr;
         }
         
         success++;
       } catch (e) {
         failed++;
         errors.push(e.message);
       }
     }
     
     return { success, failed, total: rows.length, errors };
  }
};
