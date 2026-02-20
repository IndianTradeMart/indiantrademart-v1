import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Loader2 } from 'lucide-react';
import DirectorySearchBar from '@/modules/directory/components/DirectorySearchBar';
import HeadCategoryShowcase from '@/modules/directory/components/HeadCategoryShowcase';
import { categoryApi } from '@/modules/directory/services/categoryApi';

const DIRECTORY_SEO = {
  title: 'Business Directory, India Business Directory,Companies Directory in India',
  description:
    'India Business Directory - Online business & companies directory with free business listings of indian companies, exporter importer and detailed information about their business profiles. Free list yourself at largest & most trusted business directory in india.',
  keywords:
    'Business directory, india business directory, directory of companies, exporter importer directory, companies directory in india, companies database india, business directory in india, business listings, companies directories, online business directory, free directory, Indian companies directory, free business listings in india, free business listings, business directory, companies directory, business to business companies, directory of indian companies, exporters business directory, companies business listings, companies directory india, free indian companies business listings, indiamart',
};

const Directory = () => {
  const [homeCategories, setHomeCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const INITIAL_LIMIT = 4;

  useEffect(() => {
    const load = async () => {
      setLoadingCategories(true);
      try {
        // ✅ Head + Sub + Micro (all from DB) — no hardcode
        const data = await categoryApi.getHomeShowcaseCategories();
        setHomeCategories(data || []);
      } catch (e) {
        console.error('Failed to load directory categories:', e);
      } finally {
        setLoadingCategories(false);
      }
    };
    load();
  }, []);

  const visibleHeads = useMemo(() => {
    if (showAll) return homeCategories;
    return homeCategories.slice(0, INITIAL_LIMIT);
  }, [homeCategories, showAll]);

  const hasMore = homeCategories.length > INITIAL_LIMIT;

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <Helmet>
        <title>{DIRECTORY_SEO.title}</title>
        <meta name="description" content={DIRECTORY_SEO.description} />
        <meta name="keywords" content={DIRECTORY_SEO.keywords} />
      </Helmet>

      {/* ✅ Hero Search (KEEP THIS SAME) */}
      <div className="bg-[#003D82] py-16 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-6">Find Products & Suppliers</h1>

          <div className="max-w-4xl mx-auto">
            <DirectorySearchBar enableSuggestions className="shadow-xl" />
          </div>

          <p className="text-white/80 text-sm mt-4">Select a State/City to filter suppliers by location.</p>
        </div>
      </div>

      {/* ✅ Browse Industries (IndiaMART style showcase) */}
      <div className="container mx-auto px-4 py-12">
        <div className="flex items-center justify-between gap-4 mb-8">
          <h2 className="text-2xl font-bold text-slate-900">Browse Industries</h2>

          {hasMore && !loadingCategories && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-sm font-semibold text-blue-700 hover:text-blue-900 underline underline-offset-4"
            >
              {showAll ? 'View less' : 'View more'}
            </button>
          )}
        </div>

        {loadingCategories ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-8">
            {visibleHeads.map((head) => (
              <HeadCategoryShowcase
                key={head.id}
                head={head}
                subcategories={head.subcategories || []}
                subLimit={9}
                microPreviewLimit={3}
                leftOverlayLimit={5}
              />
            ))}

            {homeCategories.length === 0 && (
              <div className="text-center text-slate-500 py-10">No categories found.</div>
            )}

            {hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="px-6 py-3 rounded-md bg-white border border-slate-200 hover:border-blue-500 hover:shadow-md transition-all font-semibold text-slate-800"
                >
                  {showAll ? 'View less' : `View more (${homeCategories.length - INITIAL_LIMIT})`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Directory;
