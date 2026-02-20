import { supabase } from '@/lib/customSupabaseClient';

// ✅ helper (only used for getTopCities fallback slug)
const slugify = (text = '') =>
  String(text || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const isMissingColumnError = (err) => {
  if (!err) return false;
  return err.code === '42703' || /column .* does not exist/i.test(err.message || '');
};

const normalizeMetaRows = (rows = []) =>
  (Array.isArray(rows) ? rows : []).map((r) => ({
    ...r,
    micro_categories: r?.micro_categories ?? r?.micro_category_id ?? null,
  }));

export const directoryApi = {
  getHeadCategories: async () => {
    const { data, error } = await supabase
      .from('head_categories')
      .select('id, name, slug, image_url, description')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  getSubCategories: async (headSlug) => {
    const { data: head } = await supabase.from('head_categories').select('id').eq('slug', headSlug).single();
    if (!head) return [];

    const { data, error } = await supabase
      .from('sub_categories')
      .select('id, name, slug, image_url, description')
      .eq('head_category_id', head.id)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  },

  // ✅ FIXED: micro_categories table me `description` column exist nahi karta
  getMicroCategories: async (subSlug, headSlug = null) => {
    if (!subSlug) return [];

    let subId = null;

    if (headSlug) {
      const { data: head, error: headErr } = await supabase
        .from('head_categories')
        .select('id')
        .eq('slug', headSlug)
        .limit(1);

      if (headErr) throw headErr;

      const headId = head?.[0]?.id;
      if (!headId) return [];

      const { data: subs, error: subErr } = await supabase
        .from('sub_categories')
        .select('id')
        .eq('slug', subSlug)
        .eq('head_category_id', headId)
        .limit(1);

      if (subErr) throw subErr;
      subId = subs?.[0]?.id || null;
    } else {
      const { data: subs, error: subErr } = await supabase
        .from('sub_categories')
        .select('id')
        .eq('slug', subSlug)
        .limit(1);

      if (subErr) throw subErr;
      subId = subs?.[0]?.id || null;
    }

    if (!subId) return [];

    const { data, error } = await supabase
      .from('micro_categories')
      .select('id, name, slug, sort_order, image_url')
      .eq('sub_category_id', subId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  // ✅ cover images derived from micro image OR products
  getMicroCategoryCovers: async (microIds = []) => {
    try {
      const ids = Array.isArray(microIds) ? microIds.filter(Boolean) : [];
      if (ids.length === 0) return {};

      // 1) First prefer explicit micro category images (if configured)
      const { data: microData, error: microErr } = await supabase
        .from('micro_categories')
        .select('id, image_url')
        .in('id', ids);
      if (microErr) throw microErr;

      const map = {};
      for (const m of microData || []) {
        const url = typeof m?.image_url === 'string' ? m.image_url.trim() : '';
        if (m?.id && url) map[m.id] = url;
      }

      // 2) Fill missing covers from latest product images
      const missing = ids.filter((id) => !map[id]);
      if (missing.length === 0) return map;

      const { data, error } = await supabase
        .from('products')
        .select('micro_category_id, images, created_at')
        .in('micro_category_id', missing)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false });

      if (error) throw error;

      for (const row of data || []) {
        const mid = row.micro_category_id;
        if (!mid || map[mid]) continue;

        const imgs = row.images;
        let url = null;

        if (Array.isArray(imgs) && imgs.length > 0) {
          const first = imgs[0];
          if (typeof first === 'string') url = first;
          else if (first && typeof first === 'object') url = first.url || first.image_url || first.src || null;
        }

        if (typeof url === 'string' && url.trim().length > 0) {
          map[mid] = url.trim();
        }
      }

      return map;
    } catch (e) {
      console.error('Error loading micro category covers:', e);
      return {};
    }
  },

  /**
   * ✅ NEW: micro-wise products preview (single query, then group client-side)
   * Returns: { [microId]: Product[] }
   */
  getProductsPreviewByMicroIds: async ({ microIds = [], perMicro = 6 }) => {
    try {
      const ids = Array.isArray(microIds) ? microIds.filter(Boolean) : [];
      const per = Math.max(1, Math.min(Number(perMicro) || 6, 12));
      if (ids.length === 0) return {};

      const fetchLimit = Math.min(ids.length * per * 3, 600);

      const { data, error } = await supabase
        .from('products')
        .select('id, name, slug, price, images, micro_category_id, created_at')
        .in('micro_category_id', ids)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false })
        .limit(fetchLimit);

      if (error) throw error;

      const map = {};
      for (const row of data || []) {
        const mid = row.micro_category_id;
        if (!mid) continue;
        if (!map[mid]) map[mid] = [];
        if (map[mid].length >= per) continue;
        map[mid].push(row);
      }

      return map;
    } catch (e) {
      console.error('Error loading products preview:', e);
      return {};
    }
  },

  searchMicroCategories: async (q) => {
    if (!q || q.length < 2) return [];

    let results = [];

    const { data: microData, error: microError } = await supabase
      .from('micro_categories')
      .select(`
        id, name, slug, 
        sub_categories(id, name, slug, head_categories(id, name, slug))
      `)
      .ilike('name', `%${q}%`)
      .limit(10);

    if (!microError && microData) {
      results = microData.map(item => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        path: `${item.sub_categories?.head_categories?.name} > ${item.sub_categories?.name} > ${item.name}`,
        head_id: item.sub_categories?.head_categories?.id,
        sub_id: item.sub_categories?.id,
        sub_slug: item.sub_categories?.slug,
        head_slug: item.sub_categories?.head_categories?.slug,
        type: 'micro'
      }));
    }

    if (results.length < 6) {
      const { data: prodData, error: prodError } = await supabase
        .from('products')
        .select('id, micro_category_id, status')
        .ilike('name', `%${q}%`)
        .or('status.eq.ACTIVE,status.is.null')
        .limit(20);

      if (!prodError && prodData) {
        const microIds = Array.from(new Set((prodData || []).map(p => p.micro_category_id).filter(Boolean)));

        if (microIds.length > 0) {
          const { data: microFromProducts, error: mpErr } = await supabase
            .from('micro_categories')
            .select(`
              id, name, slug,
              sub_categories(id, name, slug, head_categories(id, name, slug))
            `)
            .in('id', microIds)
            .limit(10);

          if (!mpErr && microFromProducts) {
            const mapped = microFromProducts.map(item => ({
              id: item.id,
              name: item.name,
              slug: item.slug,
              path: `${item.sub_categories?.head_categories?.name} > ${item.sub_categories?.name} > ${item.name}`,
              head_id: item.sub_categories?.head_categories?.id,
              sub_id: item.sub_categories?.id,
              sub_slug: item.sub_categories?.slug,
              head_slug: item.sub_categories?.head_categories?.slug,
              type: 'micro'
            }));

            results = [...mapped, ...results];
          }
        }
      }
    }

    if (results.length < 5) {
      const { data: subData, error: subError } = await supabase
        .from('sub_categories')
        .select(`
          id, name, slug,
          head_categories(id, name, slug)
        `)
        .ilike('name', `%${q}%`)
        .limit(10);

      if (!subError && subData) {
        const subResults = subData.map(item => ({
          id: item.id,
          name: item.name,
          slug: item.slug,
          path: `${item.head_categories?.name} > ${item.name}`,
          head_id: item.head_categories?.id,
          sub_id: item.id,
          sub_slug: item.slug,
          head_slug: item.head_categories?.slug,
          type: 'sub'
        }));

        results = [...results, ...subResults];
      }
    }

    const seen = new Set();
    const unique = [];
    for (const r of results) {
      const key = `${r.type}:${r.slug}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(r);
      }
    }

    return unique.slice(0, 10);
  },

  searchProducts: async ({ q, stateId, cityId, sort = '', page = 1, limit = 20 }) => {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('products')
      .select(`
        *,
        vendors!inner (
          id, company_name, city, state, state_id, city_id,
          seller_rating, kyc_status, verification_badge, trust_score
        )
      `, { count: 'exact' })
      .eq('status', 'ACTIVE');

    if (q) query = query.ilike('name', `%${q}%`);
    if (stateId) query = query.eq('vendors.state_id', stateId);
    if (cityId) query = query.eq('vendors.city_id', cityId);

    if (sort === 'price_asc') query = query.order('price', { ascending: true });
    else if (sort === 'price_desc') query = query.order('price', { ascending: false });
    else query = query.order('created_at', { ascending: false });

    query = query.range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;

    return { data: data || [], count };
  },

  listProductsByMicro: async ({ microSlug, stateId, cityId, q, sort, page = 1, limit = 20 }) => {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('products')
      .select(`
        *,
        vendors!inner (
          id, company_name, city, state, state_id, city_id,
          seller_rating, kyc_status, verification_badge, trust_score
        )
      `, { count: 'exact' })
      .eq('status', 'ACTIVE');

    if (microSlug) {
      const { data: micro, error: microErr } = await supabase
        .from('micro_categories')
        .select('id')
        .eq('slug', microSlug)
        .single();

      if (microErr) throw microErr;
      if (micro) query = query.eq('micro_category_id', micro.id);
    }

    if (q) query = query.ilike('name', `%${q}%`);
    if (stateId) query = query.eq('vendors.state_id', stateId);
    if (cityId) query = query.eq('vendors.city_id', cityId);

    if (sort === 'price_asc') query = query.order('price', { ascending: true });
    else if (sort === 'price_desc') query = query.order('price', { ascending: false });
    else query = query.order('created_at', { ascending: false });

    query = query.range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;

    return { data: data || [], count };
  },

  getProductDetailBySlug: async (slug) => {
    const { data: product, error } = await supabase
      .from('products')
      .select(`
        *,
        vendors (*)
      `)
      .eq('slug', slug)
      .single();

    if (error) throw error;

    if (product && product.micro_category_id) {
      const { data: catData } = await supabase
        .from('micro_categories')
        .select(`
          id, name, slug, image_url,
          sub_categories (
            id, name, slug,
            head_categories (id, name, slug)
          )
        `)
        .eq('id', product.micro_category_id)
        .single();

      if (catData) {
        product.micro_categories = catData;
      }
    }

    if (product && product.extra_micro_categories) {
      try {
        let extraCategories = product.extra_micro_categories;
        if (typeof extraCategories === 'string') extraCategories = JSON.parse(extraCategories);

        if (Array.isArray(extraCategories) && extraCategories.length > 0) {
          const extraIds = extraCategories.map(c => c?.id).filter(Boolean);

          if (extraIds.length > 0) {
            let metaRes = await supabase
              .from('micro_category_meta')
              .select('micro_categories, meta_tags, description')
              .in('micro_categories', extraIds);

            if (metaRes.error && isMissingColumnError(metaRes.error)) {
              metaRes = await supabase
                .from('micro_category_meta')
                .select('micro_category_id, meta_tags, description')
                .in('micro_category_id', extraIds);
            }

            const metaData = normalizeMetaRows(metaRes.data || []);
            if (metaData && metaData.length > 0) {
              product.extra_micro_categories = extraCategories.map(cat => {
                const withMeta = metaData.find(m => m.micro_categories === cat?.id);
                return withMeta ? { ...cat, meta_tags: withMeta.meta_tags, description: withMeta.description } : cat;
              });
            }
          }
        }
      } catch (err) {
        console.warn('Error processing extra_micro_categories:', err);
      }
    }

    if (product && product.micro_category_id) {
      try {
        let metaRes = await supabase
          .from('micro_category_meta')
          .select('meta_tags, description')
          .eq('micro_categories', product.micro_category_id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (metaRes.error && isMissingColumnError(metaRes.error)) {
          metaRes = await supabase
            .from('micro_category_meta')
            .select('meta_tags, description')
            .eq('micro_category_id', product.micro_category_id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        }

        if (metaRes.data) {
          product.primary_meta_tags = metaRes.data.meta_tags;
          product.primary_meta_description = metaRes.data.description;
        } else {
          if (product.micro_categories?.name) {
            product.primary_meta_tags = `${product.name} | ${product.micro_categories.name}`;
          }
        }
      } catch (err) {
        console.warn('Error fetching primary micro category meta:', err);
      }
    }

    return product;
  },

  getStates: async () => {
    const { data } = await supabase.from('states').select('id, name, slug').order('name');
    return data || [];
  },

  // ✅ also returns supplier_count safely (supports suplier_count column)
  getCities: async (stateId) => {
    if (!stateId) return [];

    // Helper: detect “column does not exist” errors (PostgREST)
    const isMissingColumnErr = (err) => {
      const msg = (err?.message || err?.details || '').toString().toLowerCase();
      return msg.includes('does not exist') || msg.includes('42703');
    };

    // ✅ IMPORTANT:
    // Production DB column is `supplier_count`.
    // Earlier code tried `suplier_count` first which creates a 400 in Network/Console.
    // So we try the correct column FIRST, and only fallback if truly missing.

    // 1) try correct column
    let res = await supabase
      .from('cities')
      .select('id, name, slug, supplier_count')
      .eq('state_id', stateId)
      .order('name');

    // 2) fallback: misspelled column (only if missing)
    if (res?.error && isMissingColumnErr(res.error)) {
      res = await supabase
        .from('cities')
        .select('id, name, slug, suplier_count')
        .eq('state_id', stateId)
        .order('name');
    }

    // 3) final fallback: no count
    if (res?.error) {
      res = await supabase
        .from('cities')
        .select('id, name, slug')
        .eq('state_id', stateId)
        .order('name');
    }

    const data = res?.data || [];
    return (Array.isArray(data) ? data : []).map((c) => {
      const count = Number(c?.suplier_count ?? c?.supplier_count ?? 0) || 0;
      return {
        ...c,
        slug: c?.slug || slugify(c?.name),
        // keep both for compatibility
        suplier_count: c?.suplier_count ?? c?.supplier_count ?? count,
        supplier_count: count,
      };
    });
  },

  /**
   * ✅ FIXED: getTopCities now reads REAL DB count column.
   * Your DB column: supplier_count ✅
   * UI expects: supplier_count ✅ we map it
   */
  getTopCities: async (limit = 200) => {
    let n = 200;
    if (typeof limit === 'number') n = limit;
    else if (limit && typeof limit === 'object') {
      n = Number(limit.limit || limit.pageSize || limit.size || 200);
    }
    if (!Number.isFinite(n) || n <= 0) n = 200;

    // 1) try with supplier_count (correct column)
    let res = await supabase
      .from('cities')
      .select('id, name, slug, supplier_count')
      .order('supplier_count', { ascending: false })
      .order('name', { ascending: true })
      .limit(n);

    // 2) fallback: no count (order by name only)
    if (res?.error) {
      res = await supabase
        .from('cities')
        .select('id, name, slug')
        .order('name', { ascending: true })
        .limit(n);
    }

    if (res?.error) {
      console.error('[directoryApi.getTopCities] error:', res.error);
      return [];
    }

    const data = res?.data || [];
    return (Array.isArray(data) ? data : []).map((c) => {
      const count = Number(c?.supplier_count ?? 0) || 0;
      return {
        ...c,
        slug: c?.slug || slugify(c?.name),
        supplier_count: count,
      };
    });
  },

  getHeadCategoryBySlug: async (headSlug) => {
    if (!headSlug) return null;
    let res = await supabase
      .from('head_categories')
      .select('id, name, slug, description, meta_tags, keywords')
      .eq('slug', headSlug)
      .limit(1);

    if (res.error && isMissingColumnError(res.error)) {
      res = await supabase
        .from('head_categories')
        .select('id, name, slug, description')
        .eq('slug', headSlug)
        .limit(1);
    }

    if (res.error) throw res.error;
    return (res.data && res.data.length ? res.data[0] : null);
  },

  getSubCategoryBySlug: async (subSlug, headSlug = null) => {
    if (!subSlug) return null;

    let headId = null;
    if (headSlug) {
      const { data: head } = await supabase
        .from('head_categories')
        .select('id')
        .eq('slug', headSlug)
        .limit(1);
      headId = head?.[0]?.id || null;
    }

    let res = await supabase
      .from('sub_categories')
      .select('id, name, slug, description, meta_tags, keywords, head_category_id')
      .eq('slug', subSlug)
      .limit(1);

    if (headId) {
      res = await supabase
        .from('sub_categories')
        .select('id, name, slug, description, meta_tags, keywords, head_category_id')
        .eq('slug', subSlug)
        .eq('head_category_id', headId)
        .limit(1);
    }

    if (res.error && isMissingColumnError(res.error)) {
      res = await supabase
        .from('sub_categories')
        .select('id, name, slug, description, head_category_id')
        .eq('slug', subSlug)
        .limit(1);

      if (headId) {
        res = await supabase
          .from('sub_categories')
          .select('id, name, slug, description, head_category_id')
          .eq('slug', subSlug)
          .eq('head_category_id', headId)
          .limit(1);
      }
    }

    if (res.error) throw res.error;
    return (res.data && res.data.length ? res.data[0] : null);
  },

  getMicroCategoryBySlug: async (microSlug) => {
    try {
      const { data: micro, error } = await supabase
        .from('micro_categories')
        .select(`
          id, name, slug,
          sub_categories (
            id, name, slug,
            head_categories (id, name, slug)
          )
        `)
        .eq('slug', microSlug)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !micro) return null;

      const runMetaQuery = async (col, fields) =>
        supabase
          .from('micro_category_meta')
          .select(fields)
          .eq(col, micro.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

      let metaRes = await runMetaQuery('micro_categories', 'meta_tags, description, keywords');
      if (metaRes.error && isMissingColumnError(metaRes.error)) {
        metaRes = await runMetaQuery('micro_categories', 'meta_tags, description');
      }
      if (metaRes.error && isMissingColumnError(metaRes.error)) {
        metaRes = await runMetaQuery('micro_category_id', 'meta_tags, description, keywords');
      }
      if (metaRes.error && isMissingColumnError(metaRes.error)) {
        metaRes = await runMetaQuery('micro_category_id', 'meta_tags, description');
      }

      return {
        ...micro,
        meta_tags: metaRes?.data?.meta_tags,
        meta_description: metaRes?.data?.description,
        meta_keywords: metaRes?.data?.keywords
      };
    } catch (err) {
      console.warn('Error fetching micro category by slug:', err);
      return null;
    }
  },

  getProductsByMicroAndLocation: async ({ microSlug, stateId, cityId, page = 1, limit = 20 }) => {
    try {
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data: micro, error: microError } = await supabase
        .from('micro_categories')
        .select('id')
        .eq('slug', microSlug)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (microError || !micro) return { data: [], count: 0 };

      let query = supabase
        .from('products')
        .select(`
          *,
          vendors!inner (
            id, company_name, city, state, state_id, city_id,
            seller_rating, kyc_status, verification_badge, trust_score
          )
        `, { count: 'exact' })
        .eq('micro_category_id', micro.id)
        .eq('status', 'ACTIVE');

      if (stateId) query = query.eq('vendors.state_id', stateId);
      if (cityId) query = query.eq('vendors.city_id', cityId);

      query = query.order('created_at', { ascending: false }).range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      return { data: data || [], count };
    } catch (err) {
      console.warn('Error fetching products by micro and location:', err);
      return { data: [], count: 0 };
    }
  }
};
