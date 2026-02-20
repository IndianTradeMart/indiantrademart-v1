import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[dir function] Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(
  SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY || ''
);

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  },
  body: JSON.stringify(body),
});

const ok = (b) => json(200, b);
const fail = (msg, details) => json(500, { success: false, error: msg, details });

function parseTail(eventPath) {
  const parts = String(eventPath || '').split('/').filter(Boolean);
  const fnIndex = parts.indexOf('dir');
  if (fnIndex >= 0) return parts.slice(fnIndex + 1);
  return parts;
}

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

function buildBaseProductQuery({ microId, q, stateId, cityId }) {
  let query = supabase
    .from('products')
    .select(
      `
        *,
        vendors!inner (
          id, company_name, city, state, state_id, city_id,
          seller_rating, kyc_status, verification_badge, trust_score
        )
      `,
      { count: 'exact' }
    )
    .eq('status', 'ACTIVE');

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

  const { count, error } = await query.select('id', { count: 'exact', head: true });
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

export async function handler(event) {
  try {
    if (event.httpMethod === 'OPTIONS') return ok({ ok: true });

    const tail = parseTail(event.path);

    // GET /.netlify/functions/dir/products
    if (event.httpMethod === 'GET' && tail[0] === 'products') {
      const qs = event.queryStringParameters || {};

      const q = safeQ(qs.q);
      const microSlug = safeQ(qs.microSlug);
      const sort = String(qs.sort || '').trim();
      const page = clampInt(qs.page, 1, 1, 5000);
      const limit = clampInt(qs.limit, 20, 1, 50);
      const stateId = isValidId(qs.stateId) ? qs.stateId : null;
      const cityId = isValidId(qs.cityId) ? qs.cityId : null;

      const from = (page - 1) * limit;
      const microId = await resolveMicroId(microSlug);

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

      return ok({ success: true, data: finalRows, count: totalCount });
    }

    return ok({ success: false, error: 'NOT_FOUND', details: 'Unknown route' });
  } catch (e) {
    return fail('DIR_FUNCTION_FAILED', e.message);
  }
}
