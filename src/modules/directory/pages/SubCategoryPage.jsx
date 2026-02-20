import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { directoryApi } from '@/modules/directory/api/directoryApi';
import { ChevronRight, Home, Loader2 } from 'lucide-react';

const toTitle = (slug) => (slug || '').replace(/-/g, ' ').trim();

const SubCategoryPage = () => {
  const { headSlug } = useParams();
  const navigate = useNavigate();

  const [headCategory, setHeadCategory] = useState(null);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const pageTitle = useMemo(
    () => (headCategory?.name ? headCategory.name : toTitle(headSlug)),
    [headCategory, headSlug]
  );

  const seoTitle = useMemo(() => {
    const metaTitle = headCategory?.meta_tags;
    if (metaTitle) return metaTitle;
    return `${pageTitle} | IndianTradeMart`;
  }, [headCategory, pageTitle]);

  const seoDescription = useMemo(() => {
    const metaDesc = headCategory?.description;
    if (metaDesc) return metaDesc;
    return `Browse ${pageTitle} categories and find suppliers on IndianTradeMart.`;
  }, [headCategory, pageTitle]);

  const seoKeywords = useMemo(() => {
    const metaKw = headCategory?.keywords;
    if (metaKw) return metaKw;
    return `${pageTitle}, suppliers, manufacturers, business directory, IndianTradeMart`;
  }, [headCategory, pageTitle]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setNotFound(false);
      setHeadCategory(null);
      setSubs([]);

      try {
        // 1) Try HEAD category
        let head = null;
        try {
          head = await directoryApi.getHeadCategoryBySlug(headSlug);
        } catch (headErr) {
          console.error('[SubCategoryPage] head lookup failed', headErr);
        }

        if (head) {
          if (!alive) return;
          setHeadCategory(head);

          const { data: subRows, error: subErr } = await supabase
            .from('sub_categories')
            .select('id, name, slug, image_url, description')
            .eq('head_category_id', head.id)
            .eq('is_active', true)
            .order('name');

          if (subErr) console.error('[SubCategoryPage] subs fetch failed', subErr);
          if (!alive) return;
          setSubs(subRows || []);
          return;
        }

        // 2) Try SUB category slug -> redirect
        const { data: subMatch, error: subMatchErr } = await supabase
          .from('sub_categories')
          .select('slug, head_categories(slug)')
          .eq('slug', headSlug)
          .limit(1);

        if (subMatchErr) console.error('[SubCategoryPage] sub slug lookup failed', subMatchErr);

        const sub = subMatch && subMatch.length ? subMatch[0] : null;
        const parentHeadSlug = sub?.head_categories?.slug;
        if (sub && parentHeadSlug) {
          navigate(`/directory/${parentHeadSlug}/${sub.slug}`, { replace: true });
          return;
        }

        // 3) Try MICRO category slug -> redirect
        const { data: microMatch, error: microMatchErr } = await supabase
          .from('micro_categories')
          .select('slug, sub_categories(slug, head_categories(slug))')
          .eq('slug', headSlug)
          .limit(1);

        if (microMatchErr) console.error('[SubCategoryPage] micro slug lookup failed', microMatchErr);

        const micro = microMatch && microMatch.length ? microMatch[0] : null;
        const subSlug = micro?.sub_categories?.slug;
        const headSlug2 = micro?.sub_categories?.head_categories?.slug;

        if (micro && headSlug2 && subSlug) {
          navigate(`/directory/${headSlug2}/${subSlug}/${micro.slug}`, { replace: true });
          return;
        }

        if (!alive) return;
        setNotFound(true);
      } catch (e) {
        console.error('[SubCategoryPage] load failed', e);
        if (!alive) return;
        setNotFound(true);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    if (headSlug) load();
    return () => {
      alive = false;
    };
  }, [headSlug, navigate]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDescription} />
        <meta name="keywords" content={seoKeywords} />
      </Helmet>

      <div className="bg-white border-b py-4">
        <div className="container mx-auto px-4">
          <nav className="flex text-sm text-gray-500 mb-4 items-center">
            <Link to="/directory" className="hover:text-blue-700 flex items-center">
              <Home className="w-3 h-3 mr-1" /> Directory
            </Link>
            <ChevronRight className="w-4 h-4 mx-2" />
            <span className="font-semibold text-gray-900 capitalize">{pageTitle}</span>
          </nav>
          <h1 className="text-3xl font-bold text-slate-900 capitalize">{pageTitle}</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-600">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...
          </div>
        ) : notFound ? (
          <div className="text-center text-gray-500 py-16">
            <div className="text-lg font-semibold text-gray-900">Category not found</div>
            <p className="mt-2">Please browse categories from directory.</p>
            <Link
              to="/directory"
              className="inline-flex mt-6 items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 font-semibold"
            >
              Browse Directory
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {subs.map((sub) => (
              <Link
                key={sub.id}
                to={`/directory/${headSlug}/${sub.slug}`}
                className="bg-white p-5 rounded-lg border hover:border-blue-500 hover:shadow-md transition-all"
              >
                <h3 className="font-bold text-gray-800 mb-1">{sub.name}</h3>
                <div className="text-xs text-gray-500">View Categories →</div>
              </Link>
            ))}

            {subs.length === 0 && (
              <div className="col-span-full text-center text-gray-500 py-10">
                No sub-categories found.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SubCategoryPage;
