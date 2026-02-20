import { supabase } from '@/lib/customSupabaseClient';

const isMissingColumnErr = (error, columnName) => {
  const msg = String(error?.message || error || '').toLowerCase();
  return msg.includes('column') && msg.includes(String(columnName).toLowerCase()) && msg.includes('does not exist');
};

// PostgREST uses GET query strings for `.in(...)`. If the list is huge,
// Netlify/edge can reject with 400 (URL too long). So we chunk requests.
const chunkArray = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// Fetch micro categories for many sub_category_ids safely (chunked + fallback
// when columns like is_active / sort_order are missing in some DB setups)
const fetchMicroCategoriesBySubIds = async (subIds) => {
  if (!Array.isArray(subIds) || subIds.length === 0) return [];

  const chunks = chunkArray(subIds, 60); // 60 keeps URL well under limits

  const runChunk = async (ids) => {
    // 1) try with is_active + sort_order
    let q = supabase
      .from('micro_categories')
      .select('id, sub_category_id, name, slug')
      .in('sub_category_id', ids)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    let res = await q;

    // If is_active column doesn't exist, retry without it
    if (res.error && isMissingColumnErr(res.error, 'is_active')) {
      res = await supabase
        .from('micro_categories')
        .select('id, sub_category_id, name, slug')
        .in('sub_category_id', ids)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
    }

    // If sort_order column doesn't exist, retry without it
    if (res.error && isMissingColumnErr(res.error, 'sort_order')) {
      // retry (with is_active if it exists)
      let q2 = supabase
        .from('micro_categories')
        .select('id, sub_category_id, name, slug')
        .in('sub_category_id', ids)
        .order('name', { ascending: true });

      // Keep is_active filter only if it's not the missing column
      if (!isMissingColumnErr(res.error, 'is_active')) {
        q2 = q2.eq('is_active', true);
      }

      res = await q2;

      // If is_active also missing, final fallback without it
      if (res.error && isMissingColumnErr(res.error, 'is_active')) {
        res = await supabase
          .from('micro_categories')
          .select('id, sub_category_id, name, slug')
          .in('sub_category_id', ids)
          .order('name', { ascending: true });
      }
    }

    if (res.error) {
      console.error('Error fetching micro categories chunk:', res.error);
      return [];
    }
    return res.data || [];
  };

  // Run with limited parallelism to avoid rate limits
  const results = [];
  const CONCURRENCY = 4;
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const batchRes = await Promise.all(batch.map(runChunk));
    batchRes.forEach((r) => results.push(...r));
  }

  return results;
};

export const categoryApi = {
  // ✅ Fetch top-level categories (Head Categories)
  getTopLevelCategories: async () => {
    try {
      // try sort_order first (if exists)
      let res = await supabase
        .from('head_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (res.error && isMissingColumnErr(res.error, 'sort_order')) {
        res = await supabase
          .from('head_categories')
          .select('*')
          .eq('is_active', true)
          .order('name', { ascending: true });
      }

      if (res.error) {
        console.error('Error fetching head categories:', res.error);
        return [];
      }
      return res.data || [];
    } catch (err) {
      console.error('Unexpected error fetching categories:', err);
      return [];
    }
  },

  /**
   * ✅ Home/Directory Showcase Data (NO hardcode)
   * Returns:
   * [
   *  { id,name,slug,image_url, subcategories: [
   *     { id,name,slug,image_url, micros:[{id,name,slug}] }
   *  ]}
   * ]
   */
  getHomeShowcaseCategories: async (options = {}) => {
    try {
      const headLimit = Number(options?.headLimit || 0);
      const subLimit = Number(options?.subLimit || 0);
      const microLimit = Number(options?.microLimit || 0);
      const useHeadLimit = Number.isFinite(headLimit) && headLimit > 0;
      const useSubLimit = Number.isFinite(subLimit) && subLimit > 0;
      const useMicroLimit = Number.isFinite(microLimit) && microLimit > 0;

      // 1) Heads
      let headQuery = supabase
        .from('head_categories')
        .select('id, name, slug, image_url, description')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (useHeadLimit) headQuery = headQuery.limit(headLimit);

      let headRes = await headQuery;

      if (headRes.error && isMissingColumnErr(headRes.error, 'sort_order')) {
        let fallbackHeadQuery = supabase
          .from('head_categories')
          .select('id, name, slug, image_url, description')
          .eq('is_active', true)
          .order('name', { ascending: true });
        if (useHeadLimit) fallbackHeadQuery = fallbackHeadQuery.limit(headLimit);
        headRes = await fallbackHeadQuery;
      }

      if (headRes.error) {
        console.error('Error fetching head categories:', headRes.error);
        return [];
      }

      const heads = headRes.data || [];
      if (heads.length === 0) return [];

      const headIds = heads.map((h) => h.id);

      // 2) Subs
      let subRes = await supabase
        .from('sub_categories')
        .select('id, head_category_id, name, slug, image_url, description')
        .in('head_category_id', headIds)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (subRes.error && isMissingColumnErr(subRes.error, 'sort_order')) {
        subRes = await supabase
          .from('sub_categories')
          .select('id, head_category_id, name, slug, image_url, description')
          .in('head_category_id', headIds)
          .eq('is_active', true)
          .order('name', { ascending: true });
      }

      if (subRes.error) {
        console.error('Error fetching sub categories:', subRes.error);
        return heads.map((h) => ({ ...h, subcategories: [] }));
      }

      const subs = subRes.data || [];

      // If subLimit is set, take only top N subs per head (order preserved by query)
      let limitedSubs = subs;
      if (useSubLimit) {
        const subsByHeadRaw = subs.reduce((acc, s) => {
          if (!acc[s.head_category_id]) acc[s.head_category_id] = [];
          acc[s.head_category_id].push(s);
          return acc;
        }, {});

        limitedSubs = [];
        for (const h of heads) {
          const list = subsByHeadRaw[h.id] || [];
          limitedSubs.push(...list.slice(0, subLimit));
        }
      }

      const subIds = limitedSubs.map((s) => s.id);

      // 3) Micros (chunked to avoid huge URLs / 400 on Netlify)
      const micros = await fetchMicroCategoriesBySubIds(subIds);

      // Group micros by sub
      const microsBySub = micros.reduce((acc, m) => {
        if (!acc[m.sub_category_id]) acc[m.sub_category_id] = [];
        if (!useMicroLimit || acc[m.sub_category_id].length < microLimit) {
          acc[m.sub_category_id].push({ id: m.id, name: m.name, slug: m.slug });
        }
        return acc;
      }, {});

      // Group subs by head and attach micros
      const subsByHead = limitedSubs.reduce((acc, s) => {
        if (!acc[s.head_category_id]) acc[s.head_category_id] = [];
        acc[s.head_category_id].push({
          id: s.id,
          name: s.name,
          slug: s.slug,
          image_url: s.image_url,
          description: s.description,
          micros: microsBySub[s.id] || []
        });
        return acc;
      }, {});

      // Attach subs to heads
      return heads.map((h) => ({
        ...h,
        subcategories: subsByHead[h.id] || []
      }));
    } catch (err) {
      console.error('Unexpected error building showcase categories:', err);
      return [];
    }
  },

  getActiveHeadCategoryCount: async () => {
    try {
      const { count, error } = await supabase
        .from('head_categories')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      if (error) {
        console.error('Error counting head categories:', error);
        return 0;
      }

      return count || 0;
    } catch (err) {
      console.error('Unexpected error counting head categories:', err);
      return 0;
    }
  },

  // ✅ Children fetch (HEAD -> SUB, SUB -> MICRO)
  getCategoryChildren: async (parentId, parentType = 'HEAD') => {
    try {
      let table = 'sub_categories';
      let foreignKey = 'head_category_id';

      if (parentType === 'SUB') {
        table = 'micro_categories';
        foreignKey = 'sub_category_id';
      }

      let res = await supabase
        .from(table)
        .select('*')
        .eq(foreignKey, parentId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (res.error && isMissingColumnErr(res.error, 'sort_order')) {
        res = await supabase
          .from(table)
          .select('*')
          .eq(foreignKey, parentId)
          .eq('is_active', true)
          .order('name', { ascending: true });
      }

      if (res.error) {
        console.error(`Error fetching children from ${table}:`, res.error);
        return [];
      }
      return res.data || [];
    } catch (err) {
      console.error('Unexpected error fetching children:', err);
      return [];
    }
  },

  // ✅ slug resolver
  getCategoryBySlug: async (slug) => {
    try {
      const { data: headData } = await supabase
        .from('head_categories')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();

      if (headData) return { ...headData, type: 'HEAD' };

      const { data: subData } = await supabase
        .from('sub_categories')
        .select(
          `
          *,
          parent:head_categories (
            id, name, slug
          )
        `
        )
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();

      if (subData) return { ...subData, type: 'SUB' };

      const { data: microData } = await supabase
        .from('micro_categories')
        .select(
          `
          *,
          parent:sub_categories (
            id, name, slug,
            grandparent:head_categories (
              id, name, slug
            )
          )
        `
        )
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();

      if (microData) return { ...microData, type: 'MICRO' };

      return null;
    } catch (err) {
      console.error('Unexpected error fetching category by slug:', err);
      return null;
    }
  },

  getCategoryHierarchy: async (slug) => {
    return await categoryApi.getCategoryBySlug(slug);
  },

  seedCategories: async (jsonData) => {
    const { data, error } = await supabase.functions.invoke('seed-categories', { body: jsonData });
    if (error) throw error;
    return data;
  }
};
