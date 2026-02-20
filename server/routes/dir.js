// ✅ File: server/routes/dir.js
import express from 'express';
import { supabase } from '../lib/supabaseClient.js';

const router = express.Router();

// Plan priority (higher = better)
const PLAN_TIERS = [
  { key: 'diamond', label: 'DIAMOND', priority: 700 },
  { key: 'gold', label: 'GOLD', priority: 600 },
  { key: 'silver', label: 'SILVER', priority: 500 },
  { key: 'booster', label: 'BOOSTER', priority: 400 },
  { key: 'certified', label: 'CERTIFIED', priority: 300 },
  { key: 'startup', label: 'STARTUP', priority: 200 },
  { key: 'trial', label: 'TRIAL', priority: 100 },
];

function normPlanName(name) {
  return String(name || '').trim().toLowerCase();
}

function planToTierKey(planName) {
  const n = normPlanName(planName);
  if (!n) return 'trial';
  if (n.includes('diamond')) return 'diamond';
  if (n.includes('gold')) return 'gold';
  if (n.includes('silver')) return 'silver';
  if (n.includes('booster') || n.includes('boost')) return 'booster';
  if (n.includes('certified') || n.includes('certificate')) return 'certified';
  if (n.includes('startup')) return 'startup';
  if (n.includes('trial') || n.includes('free')) return 'trial';
  return 'trial';
}

function isValidId(v) {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  return s.length > 0;
}

function clampInt(v, def, min, max) {
  const n = parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function safeQ(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  return s.slice(0, 100);
}

function applySort(q, sort) {
  if (sort === 'price_asc') return q.order('price', { ascending: true });
  if (sort === 'price_desc') return q.order('price', { ascending: false });
  return q.order('created_at', { ascending: false });
}

async function resolveMicroId(microSlug) {
  if (!microSlug) return null;

  const { data: micro, error } = await supabase
    .from('micro_categories')
    .select('id')
    .eq('slug', microSlug)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return micro?.id || null;
}

async function fetchRankedProductsViaRpc({ microId, cityId, stateId, q, sort, from, limit }) {
  const { data, error } = await supabase.rpc('dir_ranked_products', {
    p_micro_id: microId,
    p_city_id: cityId,
    p_state_id: stateId,
    p_q: q || null,
    p_sort: sort || null,
    p_limit: limit,
    p_offset: from,
  });

  if (error) throw error;

  const rows = data || [];
  let totalCount = rows.length > 0 ? Number(rows[0].total_count || 0) : 0;

  // If we paged past the end, probe once to recover total_count.
  if (rows.length === 0 && from > 0) {
    const { data: probeRows, error: probeErr } = await supabase.rpc('dir_ranked_products', {
      p_micro_id: microId,
      p_city_id: cityId,
      p_state_id: stateId,
      p_q: q || null,
      p_sort: sort || null,
      p_limit: 1,
      p_offset: 0,
    });
    if (!probeErr && probeRows?.length) {
      totalCount = Number(probeRows[0].total_count || 0);
    }
  }

  const cleanedRows = rows.map(({ total_count, ...rest }) => rest);
  return { rows: cleanedRows, totalCount };
}

async function getActivePlanMaps() {
  const nowIso = new Date().toISOString();

  const { data: subs, error } = await supabase
    .from('vendor_plan_subscriptions')
    .select('vendor_id, plan_id, status, end_date, start_date, plan:vendor_plans(name)')
    .eq('status', 'ACTIVE')
    .or(`end_date.is.null,end_date.gt.${nowIso}`)
    .order('start_date', { ascending: false });

  if (error) throw error;

  const planNameByVendor = {};
  const tierKeyByVendor = {};

  for (const s of subs || []) {
    const vid = s?.vendor_id;
    if (!isValidId(vid)) continue;
    if (planNameByVendor[vid]) continue;

    const planName = s?.plan?.name || '';
    planNameByVendor[vid] = planName;
    tierKeyByVendor[vid] = planToTierKey(planName);
  }

  return { planNameByVendor, tierKeyByVendor };
}

/**
 * ✅ IMPORTANT:
 * Hide suspended/terminated vendors' products.
 * Assuming vendors table has boolean column: is_active
 */
function buildBaseProductQuery({ microId, q, stateId, cityId }) {
  let query = supabase
    .from('products')
    .select(
      `
        *,
        vendors!inner (
          id, company_name, city, state, state_id, city_id,
          seller_rating, kyc_status, verification_badge, trust_score,
          is_active
        )
      `,
      { count: 'exact' }
    )
    .eq('status', 'ACTIVE')
    // ✅ hide products of suspended vendors
    .eq('vendors.is_active', true);

  if (microId) query = query.eq('micro_category_id', microId);
  if (q) query = query.ilike('name', `%${q}%`);
  if (stateId) query = query.eq('vendors.state_id', stateId);
  if (cityId) query = query.eq('vendors.city_id', cityId);

  return query;
}

async function countForVendorFilter({ microId, q, stateId, cityId, vendorFilter }) {
  let query = buildBaseProductQuery({ microId, q, stateId, cityId });

  if (vendorFilter?.type === 'in') {
    if (!vendorFilter.ids?.length) return 0;
    query = query.in('vendor_id', vendorFilter.ids);
  }

  if (vendorFilter?.type === 'notin') {
    if (vendorFilter.ids?.length) {
      const list = `(${vendorFilter.ids.join(',')})`;
      query = query.not('vendor_id', 'in', list);
    }
  }

  // NOTE: keep vendors embedded in the head-count query, otherwise
  // PostgREST throws: "'vendors' is not an embedded resource in this request".
  const { count, error } = await query.select('id, vendors!inner(id)', {
    count: 'exact',
    head: true,
  });
  if (error) throw error;
  return Number(count || 0);
}

async function fetchForVendorFilter({ microId, q, stateId, cityId, vendorFilter, sort, offsetInGroup, limit }) {
  let query = buildBaseProductQuery({ microId, q, stateId, cityId });

  if (vendorFilter?.type === 'in') {
    if (!vendorFilter.ids?.length) return [];
    query = query.in('vendor_id', vendorFilter.ids);
  }

  if (vendorFilter?.type === 'notin') {
    if (vendorFilter.ids?.length) {
      const list = `(${vendorFilter.ids.join(',')})`;
      query = query.not('vendor_id', 'in', list);
    }
  }

  query = applySort(query, sort);

  const from = offsetInGroup;
  const to = offsetInGroup + limit - 1;
  query = query.range(from, to);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function handleRankedProducts(req, res) {
  try {
    // NOTE: search page may send `q` OR `query` OR `term`
    const q = safeQ(req.query.q || req.query.query || req.query.term);
    const microSlug = safeQ(req.query.microSlug || req.query.micro || req.query.micro_slug);
    const sort = String(req.query.sort || '').trim();
    const page = clampInt(req.query.page, 1, 1, 5000);
    const limit = clampInt(req.query.limit, 20, 1, 50);
    const stateId = isValidId(req.query.stateId) ? req.query.stateId : (isValidId(req.query.state_id) ? req.query.state_id : null);
    const cityId = isValidId(req.query.cityId) ? req.query.cityId : (isValidId(req.query.city_id) ? req.query.city_id : null);

    const from = (page - 1) * limit;

    const microId = await resolveMicroId(microSlug);

    // ✅ Preferred path: slot-aware ranking via DB RPC (capacity-based seats).
    // If the migration isn't applied yet, we fall back to legacy tier buckets.
    try {
      const { rows, totalCount } = await fetchRankedProductsViaRpc({
        microId,
        cityId,
        stateId,
        q,
        sort,
        from,
        limit,
      });

      return res.json({ success: true, data: rows, count: totalCount });
    } catch (rpcErr) {
      // Continue to legacy logic below.
      console.warn('[dir] dir_ranked_products RPC failed, using legacy ranking:', rpcErr?.message);
    }

    const { planNameByVendor, tierKeyByVendor } = await getActivePlanMaps();
    const activeVendorIds = Object.keys(tierKeyByVendor);

    const bucketIds = {};
    PLAN_TIERS.forEach((t) => (bucketIds[t.key] = []));

    for (const [vendorId, tierKey] of Object.entries(tierKeyByVendor)) {
      if (bucketIds[tierKey]) bucketIds[tierKey].push(vendorId);
    }

    let totalCount = 0;
    let remainingOffset = from;
    let remainingLimit = limit;
    const out = [];

    // 1) Subscribed buckets (diamond..trial)
    for (const tier of PLAN_TIERS) {
      const ids = bucketIds[tier.key] || [];
      if (!ids.length) continue;

      const groupCount = await countForVendorFilter({
        microId,
        q,
        stateId,
        cityId,
        vendorFilter: { type: 'in', ids },
      });

      totalCount += groupCount;
      if (groupCount <= 0) continue;

      if (remainingOffset >= groupCount) {
        remainingOffset -= groupCount;
        continue;
      }

      if (remainingLimit > 0) {
        const rows = await fetchForVendorFilter({
          microId,
          q,
          stateId,
          cityId,
          vendorFilter: { type: 'in', ids },
          sort,
          offsetInGroup: remainingOffset,
          limit: remainingLimit,
        });

        out.push(...rows);
        remainingLimit = Math.max(0, remainingLimit - rows.length);
        remainingOffset = 0;
      }

      if (remainingLimit <= 0) break;
    }

    // 2) Vendors with NO active subscription (bottom)
    if (remainingLimit > 0) {
      const excludeIds = activeVendorIds.length <= 1000 ? activeVendorIds : [];

      const groupCount = await countForVendorFilter({
        microId,
        q,
        stateId,
        cityId,
        vendorFilter: { type: 'notin', ids: excludeIds },
      });

      totalCount += groupCount;

      if (groupCount > 0) {
        if (remainingOffset >= groupCount) {
          remainingOffset -= groupCount;
        } else {
          const rows = await fetchForVendorFilter({
            microId,
            q,
            stateId,
            cityId,
            vendorFilter: { type: 'notin', ids: excludeIds },
            sort,
            offsetInGroup: remainingOffset,
            limit: remainingLimit,
          });

          out.push(...rows);
          remainingLimit = Math.max(0, remainingLimit - rows.length);
          remainingOffset = 0;
        }
      }
    }

    const finalRows = (out || []).map((p) => {
      const vid = p?.vendor_id;
      const tierKey = tierKeyByVendor[vid] || 'trial';
      const planName = planNameByVendor[vid] || 'TRIAL';
      const tierMeta = PLAN_TIERS.find((x) => x.key === tierKey) || PLAN_TIERS[PLAN_TIERS.length - 1];

      const vendors = p?.vendors ? { ...p.vendors } : null;
      if (vendors) {
        vendors.plan_name = planName;
        vendors.plan_tier = tierMeta.label;
        vendors.plan_priority = tierMeta.priority;
      }

      return {
        ...p,
        vendors,
        vendor_plan_name: planName,
        vendor_plan_tier: tierMeta.label,
        vendor_plan_priority: tierMeta.priority,
      };
    });

    return res.json({ success: true, data: finalRows, count: totalCount });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: 'DIR_PRODUCTS_FAILED',
      details: e.message,
    });
  }
}

// ✅ IMPORTANT: your UI search page calls /api/dir/search
router.get('/search', handleRankedProducts);

// existing endpoint
router.get('/products', handleRankedProducts);

export default router;
