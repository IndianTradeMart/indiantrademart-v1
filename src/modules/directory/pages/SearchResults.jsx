// ✅ File: src/modules/directory/pages/SearchResults.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams, useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import SearchFilters from '@/modules/directory/components/SearchFilters';
import SearchResultsList from '@/modules/directory/components/SearchResultsList';
import PillBreadcrumbs from '@/shared/components/PillBreadcrumbs';
import NearbyLocationNav from '@/modules/directory/components/NearbyLocationNav';
import DirectorySearchBar from '@/modules/directory/components/DirectorySearchBar';
import { urlParser } from '@/shared/utils/urlParser';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { locationService } from '@/shared/services/locationService';
import { toast } from '@/components/ui/use-toast';

const normalizeText = (t) =>
  String(t || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const stemWord = (w = '') => {
  const s = String(w || '');
  if (s.length <= 3) return s;
  if (s.endsWith('ies') && s.length > 4) return s.slice(0, -3) + 'y';
  if (s.endsWith('es') && s.length > 3) return s.slice(0, -2);
  if (s.endsWith('s') && s.length > 3) return s.slice(0, -1);
  return s;
};

const normalizeForFuzzy = (t) =>
  normalizeText(t)
    .split(' ')
    .filter(Boolean)
    .map(stemWord)
    .join(' ');

const slugify = (text = '') =>
  String(text || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const safeJsonParse = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

const levenshtein = (a = '', b = '') => {
  a = String(a);
  b = String(b);
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
};

const getTargetLocations = (raw) => {
  if (!raw) return { tl: null, rawStr: null };
  if (typeof raw === 'object') return { tl: raw, rawStr: null };
  if (typeof raw === 'string') {
    const parsed = safeJsonParse(raw);
    if (parsed && typeof parsed === 'object') return { tl: parsed, rawStr: null };
    return { tl: null, rawStr: raw };
  }
  return { tl: null, rawStr: null };
};

const productMatchesLocation = (product, stateId, cityId, stateCityIdSet) => {
  if (!stateId && !cityId) return true;

  const { tl, rawStr } = getTargetLocations(product?.target_locations);

  const vendorFallback = () => {
    const vState = product?.vendors?.state_id ? String(product.vendors.state_id) : '';
    const vCity = product?.vendors?.city_id ? String(product.vendors.city_id) : '';

    if (cityId) return vCity === String(cityId) || (stateId ? vState === String(stateId) : false);
    if (stateId) return vState === String(stateId);
    return false;
  };

  if (!tl && rawStr) {
    const s = rawStr.replace(/\s+/g, '').toLowerCase();
    const pan = s.includes('"pan_india":true') || s.includes('"panindia":true');
    if (pan) return true;

    if (cityId && rawStr.includes(String(cityId))) return true;
    if (stateId && rawStr.includes(String(stateId))) return true;

    return vendorFallback();
  }

  if (!tl) return vendorFallback();
  if (!!tl.pan_india) return true;

  const targetStateIds = (tl.states || []).map((x) => String(x?.id)).filter(Boolean);
  const targetCityIds = (tl.cities || []).map((x) => String(x?.id)).filter(Boolean);

  const hasTargets = targetStateIds.length > 0 || targetCityIds.length > 0;
  if (!hasTargets) return vendorFallback();

  if (cityId) {
    if (targetCityIds.includes(String(cityId))) return true;
    if (stateId && targetStateIds.includes(String(stateId))) return true;
    return false;
  }

  if (stateId) {
    if (targetStateIds.includes(String(stateId))) return true;

    if (stateCityIdSet && targetCityIds.length > 0) {
      for (const cid of targetCityIds) {
        if (stateCityIdSet.has(String(cid))) return true;
      }
    }
    return false;
  }

  return true;
};

const resolveCategoryContext = async (slug) => {
  const s = String(slug || '').trim();
  if (!s) return { type: 'text' };

  {
    const { data } = await supabase.from('micro_categories').select('id, sub_category_id').eq('slug', s).maybeSingle();
    if (data?.id) return { type: 'micro', microId: data.id, subId: data.sub_category_id || null };
  }

  {
    const { data } = await supabase.from('sub_categories').select('id, head_category_id').eq('slug', s).maybeSingle();
    if (data?.id) return { type: 'sub', subId: data.id, headId: data.head_category_id || null };
  }

  {
    const { data } = await supabase.from('head_categories').select('id').eq('slug', s).maybeSingle();
    if (data?.id) return { type: 'head', headId: data.id };
  }

  return { type: 'text' };
};

const isBadRequest400 = (err) => {
  const status = err?.status ?? err?.code;
  const msg = String(err?.message || '').toLowerCase();
  return (
    status === 400 ||
    String(status) === '400' ||
    msg.includes('bad request') ||
    msg.includes('failed to parse') ||
    msg.includes('column') ||
    msg.includes('unknown') ||
    msg.includes('unexpected')
  );
};

// ✅ Plan priority for sorting (Diamond top -> Gold -> Silver -> Certified -> Booster -> Startup -> others)
const getPlanPriority = (planName) => {
  const p = String(planName || '').toLowerCase().trim();
  if (!p) return 0;
  if (p.includes('diamond') || p.includes('dimond')) return 600;
  if (p.includes('gold')) return 500;
  if (p.includes('silver')) return 400;
  if (p.includes('certified')) return 300;
  if (p.includes('booster')) return 200;
  if (p.includes('startup')) return 100;
  if (p.includes('trial')) return 0;
  return 10;
};

const SearchResults = () => {
  const [searchParams] = useSearchParams();
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [parsedParams, setParsedParams] = useState({
    serviceSlug: '',
    stateSlug: '',
    citySlug: '',
  });

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({
    priceRange: [0, 100000],
    rating: 0,
    verified: false,
    inStock: false,
  });

  const autoCorrectedRef = useRef(false);

  const buildSearchUrl = (svc, st, ct) => {
    if (!svc) return '/directory';
    let u = `/directory/search/${svc}`;
    if (st) u += `/${st}`;
    if (ct) u += `/${ct}`;
    return u;
  };

  useEffect(() => {
    let service = '';
    let state = '';
    let city = '';

    if (params.service) {
      service = params.service;
      state = params.state || '';
      city = params.city || '';
    } else if (params.slug) {
      const parsed = urlParser.parseSeoSlug(params.slug);
      service = parsed?.serviceSlug || '';
      state = parsed?.stateSlug || '';
      city = parsed?.citySlug || '';
    }

    setParsedParams({
      serviceSlug: service || '',
      stateSlug: state || '',
      citySlug: city || '',
    });

    autoCorrectedRef.current = false;
  }, [params, location.pathname, location.search]);

  const tryAutoCorrect = async ({ wrongSlug, stateSlug, citySlug }) => {
    if (!wrongSlug) return null;
    if (autoCorrectedRef.current) return null;

    const wrongRaw = String(wrongSlug || '');
    const wrong = normalizeForFuzzy(wrongRaw);
    if (wrong.length < 4) return null;

    const tokens = normalizeText(wrongRaw.replace(/[^a-z0-9]+/g, ' '))
      .split(' ')
      .map((x) => x.trim())
      .filter((x) => x.length >= 3)
      .slice(0, 4);

    const candidateMap = new Map();
    const addCandidate = (slug, name) => {
      if (!slug) return;
      const key = String(slug);
      if (!candidateMap.has(key)) candidateMap.set(key, { slug: key, name: name || slug });
    };
    const addRows = (rows = []) => {
      (rows || []).forEach((r) => {
        if (!r) return;
        addCandidate(r.slug, r.name);
      });
    };

    const fetchFromTable = async (table, tok) => {
      const { data, error } = await supabase
        .from(table)
        .select('id, name, slug')
        .or(`slug.ilike.%${tok}%,name.ilike.%${tok}%`)
        .limit(800);

      if (!error && Array.isArray(data)) addRows(data);
    };

    const fetchFromProducts = async (tok) => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, category, category_slug')
        .eq('status', 'ACTIVE')
        .or(`category_slug.ilike.%${tok}%,category.ilike.%${tok}%,name.ilike.%${tok}%`)
        .limit(900);

      if (error || !Array.isArray(data)) return;

      for (const p of data) {
        const s = p?.category_slug || slugify(p?.category) || '';
        const nm = p?.category || p?.category_slug || p?.name || s;
        if (s) addCandidate(s, nm);
      }
    };

    for (const tok of tokens) {
      await fetchFromTable('micro_categories', tok);
      await fetchFromTable('sub_categories', tok);
      await fetchFromTable('head_categories', tok);
      await fetchFromProducts(tok);
    }

    const candidates = Array.from(candidateMap.values());
    if (candidates.length === 0) return null;

    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const c of candidates) {
      const candSlug = normalizeForFuzzy(c.slug);
      const candName = normalizeForFuzzy(c.name);

      const d1 = candSlug ? levenshtein(wrong, candSlug) : Number.POSITIVE_INFINITY;
      const d2 = candName ? levenshtein(wrong, candName) : Number.POSITIVE_INFINITY;
      const d = Math.min(d1, d2);

      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
      if (bestDist === 0) break;
    }

    const allowed = Math.max(2, Math.min(6, Math.ceil(wrong.length * 0.3)));
    if (!best || bestDist > allowed) return null;
    if (String(best.slug) === String(wrongSlug)) return null;

    autoCorrectedRef.current = true;

    const correctedUrl = buildSearchUrl(best.slug, stateSlug, citySlug);
    navigate(correctedUrl, { replace: true });

    toast({
      title: 'Auto-corrected search',
      description: `Showing results for "${best.name}" (corrected from "${wrongRaw.replace(/-/g, ' ')}")`,
    });

    return best;
  };

  const runKeywordProductsQueryWithFallback = async ({ servicePhrase, serviceSlug, selectString }) => {
    const attempts = [
      [
        `category_slug.eq.${serviceSlug}`,
        `name.ilike.%${servicePhrase}%`,
        `category.ilike.%${servicePhrase}%`,
        `description.ilike.%${servicePhrase}%`,
      ],
      [`category_slug.eq.${serviceSlug}`, `name.ilike.%${servicePhrase}%`, `category.ilike.%${servicePhrase}%`],
      [`category_slug.eq.${serviceSlug}`, `name.ilike.%${servicePhrase}%`],
      [`category_slug.eq.${serviceSlug}`],
    ];

    let lastErr = null;

    for (const orParts of attempts) {
      const q = supabase
        .from('products')
        .select(selectString)
        .eq('status', 'ACTIVE')
        .eq('vendors.is_active', true)
        .or(orParts.join(','))
        .order('created_at', { ascending: false })
        .limit(300);

      const { data, error } = await q;
      if (!error) return data || [];

      lastErr = error;
      if (!isBadRequest400(error)) throw error;
    }

    if (lastErr) throw lastErr;
    return [];
  };

  // ✅ reads plan from correct table name (vendor_plan_subscriptions OR vendor_plan_subcriptions)
  const buildVendorPlanMap = async (vendorIds) => {
    const ids = (vendorIds || []).filter(Boolean);
    if (ids.length === 0) return new Map();

    const trySubsTable = async (tableName) => {
      const { data, error } = await supabase.from(tableName).select('vendor_id, plan_id').in('vendor_id', ids);
      if (error) return { data: null, error };
      return { data: data || [], error: null };
    };

    let subsResult = await trySubsTable('vendor_plan_subscriptions');
    if (subsResult.error) subsResult = await trySubsTable('vendor_plan_subcriptions');

    if (subsResult.error || !Array.isArray(subsResult.data)) {
      return new Map();
    }

    const subs = subsResult.data;
    const planIds = Array.from(new Set((subs || []).map((s) => s.plan_id).filter(Boolean)));
    if (planIds.length === 0) return new Map();

    const { data: plans, error: plansErr } = await supabase.from('vendor_plans').select('id, name').in('id', planIds);
    if (plansErr || !Array.isArray(plans)) return new Map();

    const planIdToName = new Map((plans || []).map((p) => [p.id, p.name]));
    const vendorIdToPlanName = new Map();

    (subs || []).forEach((s) => {
      const nm = planIdToName.get(s.plan_id);
      if (nm) vendorIdToPlanName.set(s.vendor_id, nm);
    });

    return vendorIdToPlanName;
  };

  useEffect(() => {
    const fetchResults = async () => {
      if (!parsedParams.serviceSlug) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const serviceSlug = parsedParams.serviceSlug;
        const servicePhrase = normalizeText(serviceSlug.replace(/-/g, ' '));

        const { state, city } = await locationService.getLocationBySlug(parsedParams.stateSlug, parsedParams.citySlug);
        const stateId = state?.id || null;
        const cityId = city?.id || null;

        let stateCityIdSet = null;
        if (stateId) {
          const allCities = await locationService.getCities(stateId);
          stateCityIdSet = new Set((allCities || []).map((c) => String(c.id)));
        }

        const ctx = await resolveCategoryContext(serviceSlug);

        if (ctx.type === 'text') {
          const corrected = await tryAutoCorrect({
            wrongSlug: serviceSlug,
            stateSlug: parsedParams.stateSlug,
            citySlug: parsedParams.citySlug,
          });
          if (corrected) {
            setResults([]);
            return;
          }
        }

        // ✅ IMPORTANT: include vendor meta columns from DB
        const selectString = `
          *,
          vendors!inner (
            id, company_name, city, state, state_id, city_id,
            seller_rating, kyc_status, verification_badge, trust_score,
            gst_verified, year_of_establishment, years_in_business, response_rate,
            is_active
          )
        `;

        let data = [];

        if (ctx.type === 'micro' && ctx.microId) {
          const { data: d, error } = await supabase
            .from('products')
            .select(selectString)
            .eq('status', 'ACTIVE')
            .eq('vendors.is_active', true)
            .eq('micro_category_id', ctx.microId)
            .order('created_at', { ascending: false })
            .limit(300);

          if (error) throw error;
          data = d || [];
        } else if (ctx.type === 'sub' && ctx.subId) {
          const { data: d, error } = await supabase
            .from('products')
            .select(selectString)
            .eq('status', 'ACTIVE')
            .eq('vendors.is_active', true)
            .eq('sub_category_id', ctx.subId)
            .order('created_at', { ascending: false })
            .limit(300);

          if (error) throw error;
          data = d || [];
        } else if (ctx.type === 'head' && ctx.headId) {
          const { data: d, error } = await supabase
            .from('products')
            .select(selectString)
            .eq('status', 'ACTIVE')
            .eq('vendors.is_active', true)
            .eq('head_category_id', ctx.headId)
            .order('created_at', { ascending: false })
            .limit(300);

          if (error) throw error;
          data = d || [];
        } else {
          data = await runKeywordProductsQueryWithFallback({
            servicePhrase,
            serviceSlug,
            selectString,
          });
        }

        const vendorIds = Array.from(
          new Set(
            (data || [])
              .map((p) => {
                const v = p?.vendors;
                if (Array.isArray(v)) return v[0]?.id;
                return v?.id;
              })
              .filter(Boolean)
          )
        );

        const vendorIdToPlanName = await buildVendorPlanMap(vendorIds);

        const mapped = (data || []).map((p) => {
          const v = p?.vendors;
          const vendorObj = Array.isArray(v) ? v[0] : v;
          const vendorId = vendorObj?.id || null;

          const planName = vendorId ? vendorIdToPlanName.get(vendorId) || '' : '';
          const planPriority = getPlanPriority(planName);

          return {
            ...p,
            vendors: vendorObj,
            vendorName: vendorObj?.company_name,
            vendorId,
            vendorCity: vendorObj?.city,
            vendorState: vendorObj?.state,
            vendorRating: vendorObj?.seller_rating || 4.5,
            vendorVerified: vendorObj?.kyc_status === 'VERIFIED' || !!vendorObj?.verification_badge,

            // ✅ vendor meta fields (DB-driven)
            vendorGstVerified: vendorObj?.gst_verified === true || vendorObj?.gst_verified === 1,
            vendorEstablishedYear: vendorObj?.year_of_establishment ?? null, // kept for compatibility
            vendorYearOfEstablishment: vendorObj?.year_of_establishment ?? null, // preferred
            vendorYearsInBusiness: vendorObj?.years_in_business ?? null,
            vendorResponseRate: vendorObj?.response_rate ?? null,

            vendorPlanName: planName,
            __planPriority: planPriority,
          };
        });

        const locationFiltered = mapped.filter((p) => productMatchesLocation(p, stateId, cityId, stateCityIdSet));

        if (locationFiltered.length === 0) {
          await tryAutoCorrect({
            wrongSlug: serviceSlug,
            stateSlug: parsedParams.stateSlug,
            citySlug: parsedParams.citySlug,
          });
          setResults([]);
          return;
        }

        // ✅ SORT:
        // 1) Plan priority (Diamond first, then Gold...)
        // 2) Keyword relevance
        // 3) Rating
        // 4) Latest
        const sorted = locationFiltered
          .map((p) => {
            const nm = normalizeText(p?.name);
            const exact = nm === servicePhrase ? 1000 : 0;
            const contains = nm.includes(servicePhrase) ? 200 : 0;
            return { ...p, __sortScore: exact + contains };
          })
          .sort((a, b) => {
            const ap = a.__planPriority || 0;
            const bp = b.__planPriority || 0;
            if (bp !== ap) return bp - ap;

            const as = a.__sortScore || 0;
            const bs = b.__sortScore || 0;
            if (bs !== as) return bs - as;

            const ar = Number(a.vendorRating || 0);
            const br = Number(b.vendorRating || 0);
            if (br !== ar) return br - ar;

            const at = a?.created_at ? new Date(a.created_at).getTime() : 0;
            const bt = b?.created_at ? new Date(b.created_at).getTime() : 0;
            return bt - at;
          });

        setResults(sorted);
      } catch (err) {
        console.error('Search failed', err);

        try {
          await tryAutoCorrect({
            wrongSlug: parsedParams.serviceSlug,
            stateSlug: parsedParams.stateSlug,
            citySlug: parsedParams.citySlug,
          });
        } catch (e) {}

        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [parsedParams.serviceSlug, parsedParams.stateSlug, parsedParams.citySlug, searchParams]);

  const filteredResults = (results || []).filter((item) => {
    if (filters.verified && !item.vendorVerified) return false;
    if (filters.inStock && !item.inStock) return false;
    return true;
  });

  const formatName = (s) => (s ? s.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) : '');
  const serviceName = formatName(parsedParams.serviceSlug);
  const cityName = formatName(parsedParams.citySlug);
  const stateName = formatName(parsedParams.stateSlug);

  const pageTitle = serviceName
    ? `${serviceName} Suppliers & Manufacturers${cityName ? ` in ${cityName}` : ''}${
        stateName && !cityName ? ` in ${stateName}` : ''
      }`
    : 'Search Results';

  const canonicalPath =
    parsedParams.citySlug && parsedParams.stateSlug
      ? `/directory/${parsedParams.serviceSlug}-in-${parsedParams.citySlug}-${parsedParams.stateSlug}`
      : parsedParams.stateSlug
        ? `/directory/${parsedParams.serviceSlug}-in-${parsedParams.stateSlug}`
        : `/directory/${parsedParams.serviceSlug}`;

  const canonicalUrl = `https://www.indiantrademart.com${canonicalPath}`;

  return (
    <>
      <Helmet>
        <title>{pageTitle} | IndianTradeMart</title>
        <meta
          name="description"
          content={`Find best ${serviceName} suppliers in ${cityName || stateName || 'India'}. Get quotes, compare prices and buy from verified manufacturers.`}
        />
        <link rel="canonical" href={canonicalUrl} />
      </Helmet>

      <div className="min-h-screen bg-neutral-50 pb-16">
        <div className="bg-white border-b sticky top-16 z-10 shadow-sm">
          <div className="container mx-auto px-4 py-2">
            <PillBreadcrumbs className="mb-2" overrideParams={parsedParams} />

            <div className="max-w-4xl mb-2">
              <DirectorySearchBar
                enableSuggestions
                className="shadow-sm"
                initialService={parsedParams.serviceSlug}
                initialState={parsedParams.stateSlug}
                initialCity={parsedParams.citySlug}
              />
            </div>

            <div className="flex items-start md:items-center justify-between gap-3">
              <motion.h1
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-base md:text-lg font-bold text-gray-900 leading-snug line-clamp-2"
              >
                {pageTitle}
              </motion.h1>

              <div className="flex-shrink-0 text-xs md:text-sm text-gray-500 pt-1 md:pt-0">
                {filteredResults.length} found
              </div>
            </div>

            {parsedParams.stateSlug && (
              <div className="mt-0 overflow-x-auto scrollbar-hide">
                <div className="min-w-max">
                  <NearbyLocationNav
                    serviceSlug={parsedParams.serviceSlug}
                    stateSlug={parsedParams.stateSlug}
                    currentCitySlug={parsedParams.citySlug}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="container mx-auto px-4 py-5">
          <div className="flex flex-col lg:flex-row gap-6">
            <aside className="w-full lg:w-64 flex-shrink-0 hidden lg:block">
              <SearchFilters filters={filters} setFilters={setFilters} />
            </aside>

            <main className="flex-1">
              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-[#003D82]" />
                </div>
              ) : (
                <SearchResultsList products={filteredResults} city={cityName || stateName} category={serviceName} />
              )}
            </main>
          </div>
        </div>
      </div>
    </>
  );
};

export default SearchResults;
