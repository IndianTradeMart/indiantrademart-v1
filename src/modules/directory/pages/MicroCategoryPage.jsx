import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { directoryApi } from '@/modules/directory/api/directoryApi';
import { ChevronRight, Home, Image as ImageIcon, Loader2, ExternalLink } from 'lucide-react';

const safeStr = (v) => (typeof v === 'string' ? v.trim() : '');
const safeImg = (url) => (typeof url === 'string' && url.trim().length > 0 ? url.trim() : null);
const humanTitle = (slug) => safeStr(slug).replace(/-/g, ' ').trim();

const stripHtml = (s) => safeStr(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const truncate = (s, n = 160) => {
  const t = stripHtml(s);
  if (!t) return '';
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1).trim()}…`;
};

const safeFirstImage = (product) => {
  const raw = product?.images;

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed[0]) {
        const first = parsed[0];
        if (typeof first === 'string') return first;
        if (first && typeof first === 'object') return first.url || first.image_url || first.src || null;
      }
    } catch (_) {}
  }

  if (Array.isArray(raw) && raw[0]) {
    const first = raw[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object') return first.url || first.image_url || first.src || null;
  }

  return product?.image || null;
};

const formatINR = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `₹${n.toLocaleString('en-IN')}`;
};

const MicroSideCard = ({ to, title, coverUrl }) => {
  const img = safeImg(coverUrl);

  return (
    <Link
      to={to}
      className="group bg-white rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all overflow-hidden flex lg:flex-col"
    >
      <div className="relative h-24 w-28 lg:w-full lg:h-40 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0">
        {img ? (
          <img
            src={img}
            alt={title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
            <ImageIcon className="w-7 h-7" />
          </div>
        )}
      </div>

      <div className="p-3 lg:p-4 flex-1">
        <h3 className="font-extrabold text-slate-900 group-hover:text-blue-700 transition-colors line-clamp-2">
          {title}
        </h3>
        <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
          View all <ExternalLink className="w-3.5 h-3.5" />
        </div>
      </div>
    </Link>
  );
};

const ProductMiniCard = ({ product }) => {
  const img = safeImg(safeFirstImage(product));
  const price = formatINR(product?.price);
  const slug = product?.slug || product?.id;

  return (
    <Link
      to={slug ? `/p/${slug}` : '/directory'}
      className="group bg-white rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all overflow-hidden"
      title={product?.name}
    >
      <div className="h-28 bg-slate-50 overflow-hidden flex items-center justify-center">
        {img ? (
          <img
            src={img}
            alt={product?.name || 'Product'}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="text-slate-400">
            <ImageIcon className="w-6 h-6" />
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="text-sm font-bold text-slate-900 line-clamp-2 group-hover:text-blue-700 transition-colors">
          {product?.name || 'Product'}
        </div>
        <div className="mt-2 text-xs text-slate-600">{price || 'Get latest price'}</div>
      </div>
    </Link>
  );
};

const MicroCategorySection = ({ headSlug, subSlug, micro, coverUrl, products = [] }) => {
  const title = micro?.name || humanTitle(micro?.slug);
  const microTo = `/directory/${headSlug}/${subSlug}/${micro.slug}`;

  return (
    <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
        <div className="lg:col-span-3 p-4 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white">
          <MicroSideCard to={microTo} title={title} coverUrl={coverUrl} />
        </div>

        <div className="lg:col-span-9 p-4 bg-white">
          {products.length === 0 ? (
            <div className="text-slate-500 text-sm py-8 text-center">
              No products added in this category yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {products.map((p) => (
                <ProductMiniCard key={p.id} product={p} />
              ))}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <Link
              to={microTo}
              className="text-sm font-semibold text-blue-700 hover:text-blue-900 underline underline-offset-4"
            >
              View all products →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

const MicroCategoryPage = () => {
  const { headSlug, subSlug } = useParams();

  const [micros, setMicros] = useState([]);
  const [covers, setCovers] = useState({});
  const [previews, setPreviews] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [subMeta, setSubMeta] = useState(null);

  // ✅ SEO (so home title/desc doesn't stick)
  const seoTitle = useMemo(() => {
    const metaTitle = safeStr(subMeta?.meta_tags);
    if (metaTitle) return metaTitle;
    const head = humanTitle(headSlug) || 'Directory';
    const sub = humanTitle(subSlug) || 'Category';
    return `${sub} | ${head} - IndianTradeMart`;
  }, [subMeta, headSlug, subSlug]);

  const seoDescription = useMemo(() => {
    const metaDesc = safeStr(subMeta?.description);
    if (metaDesc) return truncate(metaDesc);
    const head = humanTitle(headSlug) || 'Directory';
    const sub = humanTitle(subSlug) || 'Category';
    return truncate(
      `Browse micro-categories and products in ${sub} under ${head}. Find suppliers, compare prices, and get quotations on IndianTradeMart.`
    );
  }, [subMeta, headSlug, subSlug]);

  const seoKeywords = useMemo(() => {
    const metaKw = safeStr(subMeta?.keywords);
    if (metaKw) return metaKw;
    const head = humanTitle(headSlug) || 'Directory';
    const sub = humanTitle(subSlug) || 'Category';
    return `${sub}, ${head}, suppliers, products, IndianTradeMart`;
  }, [subMeta, headSlug, subSlug]);

  const canonicalUrl = useMemo(() => {
    try {
      const origin = window.location?.origin || '';
      return origin ? `${origin}/directory/${headSlug}/${subSlug}` : '';
    } catch {
      return '';
    }
  }, [headSlug, subSlug]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setErrorMsg('');
      setMicros([]);
      setCovers({});
      setPreviews({});

      try {
        const list = await directoryApi.getMicroCategories(subSlug, headSlug);
        if (!alive) return;
        setMicros(list || []);

        const ids = (list || []).map((m) => m.id).filter(Boolean);

        try {
          const coverMap = await directoryApi.getMicroCategoryCovers(ids);
          if (!alive) return;
          setCovers(coverMap || {});
        } catch (e) {
          console.warn('Cover fetch failed:', e);
        }

        try {
          if (typeof directoryApi.getProductsPreviewByMicroIds === 'function') {
            const previewMap = await directoryApi.getProductsPreviewByMicroIds({ microIds: ids, perMicro: 6 });
            if (!alive) return;
            setPreviews(previewMap || {});
          }
        } catch (e) {
          console.warn('Preview fetch failed:', e);
        }
      } catch (e) {
        console.error(e);
        if (!alive) return;
        setErrorMsg('Something went wrong while loading this category. Please try again.');
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    if (subSlug) load();
    return () => {
      alive = false;
    };
  }, [subSlug, headSlug]);

  useEffect(() => {
    let alive = true;
    const loadMeta = async () => {
      try {
        if (!subSlug) return;
        const meta = await directoryApi.getSubCategoryBySlug(subSlug, headSlug);
        if (!alive) return;
        setSubMeta(meta || null);
      } catch (e) {
        if (!alive) return;
        setSubMeta(null);
      }
    };
    loadMeta();
    return () => {
      alive = false;
    };
  }, [subSlug, headSlug]);

  const title = useMemo(() => humanTitle(subSlug), [subSlug]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDescription} />
        <meta name="keywords" content={seoKeywords} />
        {canonicalUrl ? <link rel="canonical" href={canonicalUrl} /> : null}
      </Helmet>

      <div className="bg-white border-b py-4">
        <div className="container mx-auto px-4">
          <nav className="flex text-sm text-gray-500 mb-4 items-center flex-wrap">
            <Link to="/directory" className="hover:text-blue-700 flex items-center">
              <Home className="w-3 h-3 mr-1" /> Directory
            </Link>
            <ChevronRight className="w-4 h-4 mx-2" />
            <Link to={`/directory/${headSlug}`} className="hover:text-blue-700 capitalize">
              {humanTitle(headSlug)}
            </Link>
            <ChevronRight className="w-4 h-4 mx-2" />
            <span className="font-semibold text-gray-900 capitalize">{title}</span>
          </nav>

          <h1 className="text-3xl font-extrabold text-slate-900 capitalize">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">Browse micro-categories and products in this sub-category.</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : errorMsg ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-700">
            {errorMsg}
          </div>
        ) : micros.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-500">
            No micro categories found.
          </div>
        ) : (
          <div className="space-y-5">
            {micros.map((m) => (
              <MicroCategorySection
                key={m.id}
                headSlug={headSlug}
                subSlug={subSlug}
                micro={m}
                coverUrl={m?.image_url || covers?.[m.id] || safeFirstImage((previews?.[m.id] || [])[0])}
                products={previews?.[m.id] || []}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MicroCategoryPage;
