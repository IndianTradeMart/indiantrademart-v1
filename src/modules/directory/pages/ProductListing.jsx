import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
import { Home, Loader2 } from 'lucide-react';

import DirectorySearchBar from '@/modules/directory/components/DirectorySearchBar';
import SearchFilters from '@/modules/directory/components/SearchFilters';
import SearchResultsList from '@/modules/directory/components/SearchResultsList';

import { directoryApi } from '@/modules/directory/api/directoryApi';
import { supabase } from '@/lib/customSupabaseClient';

const safeStr = (v) => (typeof v === 'string' ? v.trim() : '');
const stripHtml = (s) => safeStr(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const truncate = (s, n = 160) => {
  const t = stripHtml(s);
  if (!t) return '';
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1).trim()}…`;
};

const toTitleCase = (slug) =>
  safeStr(slug)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const buildKeywords = (...items) => {
  const seen = new Set();
  const out = [];
  items
    .flat()
    .filter(Boolean)
    .forEach((item) => {
      String(item)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => {
          const key = s.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            out.push(s);
          }
        });
    });
  return out.join(', ');
};

const numOrNull = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[₹,\s]/g, '').trim());
  return Number.isFinite(n) ? n : null;
};

const ProductListing = () => {
  const { headSlug, subSlug, microSlug, stateSlug = '', citySlug = '' } = useParams();

  const [microInfo, setMicroInfo] = useState(null);
  const [seoLoading, setSeoLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState([]);

  const [filters, setFilters] = useState({
    priceRange: [0, 100000],
    rating: 0,
    verified: false,
    inStock: false,
  });

  const resolvedRef = useRef({ key: '', stateId: null, cityId: null });

  const headName = useMemo(
    () => microInfo?.sub_categories?.head_categories?.name || toTitleCase(headSlug),
    [microInfo, headSlug]
  );
  const subName = useMemo(
    () => microInfo?.sub_categories?.name || toTitleCase(subSlug),
    [microInfo, subSlug]
  );
  const microName = useMemo(
    () => microInfo?.name || toTitleCase(microSlug),
    [microInfo, microSlug]
  );

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!microSlug) return;
      setSeoLoading(true);
      try {
        const m = await directoryApi.getMicroCategoryBySlug(microSlug);
        if (!alive) return;
        setMicroInfo(m || null);
      } catch {
        if (!alive) return;
        setMicroInfo(null);
      } finally {
        if (!alive) return;
        setSeoLoading(false);
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, [microSlug]);

  const pageTitle = useMemo(() => {
    const metaTitle = safeStr(microInfo?.meta_tags);
    if (metaTitle) return metaTitle;
    return `${microName} Suppliers & Manufacturers | ${subName} - ${headName} | IndianTradeMart`;
  }, [microInfo, microName, subName, headName]);

  const pageDescription = useMemo(() => {
    const metaDesc = safeStr(microInfo?.meta_description);
    if (metaDesc) return truncate(metaDesc);
    return truncate(`Browse ${microName} products and suppliers in this micro-category on IndianTradeMart.`);
  }, [microInfo, microName]);

  const pageKeywords = useMemo(() => {
    const metaKw = safeStr(microInfo?.meta_keywords);
    if (metaKw) return metaKw;
    return buildKeywords(
      microInfo?.meta_tags,
      microName,
      subName,
      headName,
      'suppliers',
      'manufacturers',
      'IndianTradeMart'
    );
  }, [microInfo, microName, subName, headName]);

  const canonicalUrl = useMemo(() => {
    try {
      const origin = window.location?.origin || '';
      if (!origin) return '';
      let u = `${origin}/directory/${headSlug}/${subSlug}/${microSlug}`;
      if (stateSlug) u += `/${stateSlug}`;
      if (citySlug) u += `/${citySlug}`;
      return u;
    } catch {
      return '';
    }
  }, [headSlug, subSlug, microSlug, stateSlug, citySlug]);

  const resolveLocationIds = async () => {
    const key = `${stateSlug || ''}::${citySlug || ''}`;
    if (resolvedRef.current.key === key) return resolvedRef.current;

    let stateId = null;
    let cityId = null;

    try {
      if (stateSlug) {
        const { data: st } = await supabase.from('states').select('id').eq('slug', stateSlug).maybeSingle();
        stateId = st?.id || null;
      }

      if (citySlug) {
        if (stateId) {
          const { data: ct } = await supabase
            .from('cities')
            .select('id')
            .eq('slug', citySlug)
            .eq('state_id', stateId)
            .maybeSingle();
          cityId = ct?.id || null;
        }

        if (!cityId) {
          const { data: ct2 } = await supabase.from('cities').select('id, state_id').eq('slug', citySlug).maybeSingle();
          cityId = ct2?.id || null;
          if (!stateId) stateId = ct2?.state_id || null;
        }
      }
    } catch {
      // ignore
    }

    resolvedRef.current = { key, stateId, cityId };
    return resolvedRef.current;
  };

  useEffect(() => {
    let alive = true;

    const fetchData = async () => {
      setLoading(true);
      try {
        const { stateId, cityId } = await resolveLocationIds();

        const { data } = await directoryApi.getProductsByMicroAndLocation({
          microSlug,
          stateId,
          cityId,
          page: 1,
          limit: 200,
        });

        if (!alive) return;

        const flat = (data || []).map((p) => {
          const v = p?.vendors || {};
          return {
            ...p,
            vendorName: v?.company_name || p?.vendorName,
            vendorCity: v?.city || p?.vendorCity,
            vendorState: v?.state || p?.vendorState,
            vendorRating: v?.seller_rating || p?.vendorRating,
            vendorVerified: !!(
              v?.verification_badge ||
              v?.is_verified ||
              String(v?.kyc_status || '').toUpperCase() === 'APPROVED'
            ),
            price_unit: p?.price_unit,
            qty_unit: p?.qty_unit,
          };
        });

        setResults(flat);
      } catch (e) {
        console.error('ProductListing fetch error:', e);
        if (!alive) return;
        setResults([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    fetchData();
    return () => {
      alive = false;
    };
  }, [microSlug, stateSlug, citySlug]);

  const filtered = useMemo(() => {
    const list = Array.isArray(results) ? results : [];
    let out = list;

    const [minP, maxP] = filters.priceRange || [0, 100000];
    out = out.filter((p) => {
      const price = numOrNull(p?.price);
      if (price === null) return true;
      return price >= minP && price <= maxP;
    });

    if (filters.rating > 0) {
      out = out.filter((p) => {
        const r = numOrNull(p?.rating) ?? numOrNull(p?.vendorRating) ?? 0;
        return r >= filters.rating;
      });
    }

    if (filters.verified) out = out.filter((p) => !!p?.vendorVerified);

    if (filters.inStock) {
      out = out.filter((p) => {
        const stock = numOrNull(p?.stock);
        return stock === null ? true : stock > 0;
      });
    }

    return out;
  }, [results, filters]);

  const chipBase = 'inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition';
  const chip = `${chipBase} bg-white text-slate-700 border-slate-200 hover:border-slate-300`;
  const chipActive = `${chipBase} bg-[#003D82] text-white border-[#003D82]`;

  return (
    <div className="min-h-screen bg-slate-50">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="keywords" content={pageKeywords} />
        {canonicalUrl ? <link rel="canonical" href={canonicalUrl} /> : null}
      </Helmet>

      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-6">
          {/* Chip breadcrumb row */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link to="/" className={chip}>
              <Home className="w-4 h-4" />
              IndianTradeMart
            </Link>
            <span className="text-slate-300">›</span>
            <Link to={`/directory/${headSlug}`} className={chip}>
              {headName}
            </Link>
            <span className="text-slate-300">›</span>
            <Link to={`/directory/${headSlug}/${subSlug}`} className={chip}>
              {subName}
            </Link>
            <span className="text-slate-300">›</span>
            <span className={chipActive}>{microName}</span>
          </div>

          {/* ✅ Search bar like Land Survey screenshot */}
          <div className="mt-4">
            <DirectorySearchBar
              initialService={microName}
              initialState={stateSlug}
              initialCity={citySlug}
              className="w-full"
              enableSuggestions
              compact
            />
          </div>

          {/* Title row */}
          <div className="mt-6 flex items-center justify-between gap-4 flex-wrap">
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900">
              {microName} Suppliers &amp; Manufacturers
            </h1>
            <div className="text-sm text-slate-500">{loading ? '' : `${filtered.length} found`}</div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="flex justify-center py-14">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-3">
              <SearchFilters filters={filters} setFilters={setFilters} />
            </div>
            <div className="lg:col-span-9">
              <SearchResultsList products={filtered} query={microName} city={citySlug} category={microSlug} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductListing;
