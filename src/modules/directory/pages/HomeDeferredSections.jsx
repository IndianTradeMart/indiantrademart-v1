import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import TopCitiesSection from '@/modules/directory/components/TopCitiesSection';
import PremiumBrandsSection from '@/modules/directory/components/PremiumBrandsSection';
import HeadCategoryShowcase from '@/modules/directory/components/HeadCategoryShowcase';
import { vendorService } from '@/modules/directory/services/vendorService';
import { Button } from '@/components/ui/button';
import { CheckCircle, MapPin, ChevronRight, Loader2 } from 'lucide-react';
import { categoryApi } from '@/modules/directory/services/categoryApi';

const HomeDeferredSections = () => {
  const navigate = useNavigate();

  // Home page pe exactly 8 suppliers dikhane hain
  const FEATURED_INITIAL_LIMIT = 8;
  // Fetch slightly more than shown to ensure fill without heavy payload
  const FEATURED_FETCH_LIMIT = 12;

  // Small helper to avoid broken images in Featured Suppliers.
  const VendorImage = ({ src, name }) => {
    const [failed, setFailed] = useState(false);
    const letter = String(name || 'S').trim().charAt(0).toUpperCase() || 'S';

    if (!src || failed) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-100 text-5xl font-extrabold text-slate-300">
          {letter}
        </div>
      );
    }

    return (
      <img
        src={src}
        alt={name}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        onError={() => setFailed(true)}
        loading="lazy"
        decoding="async"
      />
    );
  };

  const [homeCategories, setHomeCategories] = useState([]);
  const [totalHeads, setTotalHeads] = useState(0);
  const [featuredVendors, setFeaturedVendors] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingVendors, setLoadingVendors] = useState(true);

  const [showAllHeads, setShowAllHeads] = useState(false);
  const HEAD_INITIAL_LIMIT = 3;
  const SUB_INITIAL_LIMIT = 9;
  const MICRO_PREVIEW_LIMIT = 3;

  useEffect(() => {
    categoryApi.getActiveHeadCategoryCount().then(setTotalHeads).catch(() => setTotalHeads(0));
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoadingCategories(true);
      try {
        const headLimit = showAllHeads ? 0 : HEAD_INITIAL_LIMIT;
        const data = await categoryApi.getHomeShowcaseCategories({
          headLimit: headLimit || undefined,
          subLimit: SUB_INITIAL_LIMIT,
          microLimit: MICRO_PREVIEW_LIMIT
        });
        setHomeCategories(data || []);
      } catch (e) {
        console.error('Failed to load home categories:', e);
      } finally {
        setLoadingCategories(false);
      }
    };
    load();
  }, [showAllHeads]);

  useEffect(() => {
    const load = async () => {
      setLoadingVendors(true);
      try {
        // IMPORTANT: vendorService default 6 -> so we pass bigger limit
        const vendors = await vendorService.getFeaturedVendors({ limit: FEATURED_FETCH_LIMIT });
        setFeaturedVendors(vendors || []);
      } catch (e) {
        console.error('Failed to load featured vendors:', e);
      } finally {
        setLoadingVendors(false);
      }
    };
    load();
  }, []);

  const visibleHeads = useMemo(() => {
    if (showAllHeads) return homeCategories;
    return homeCategories.slice(0, HEAD_INITIAL_LIMIT);
  }, [homeCategories, showAllHeads]);

  const hasMoreHeads = (totalHeads || 0) > HEAD_INITIAL_LIMIT;

  // Home UI: only 8 show
  const visibleFeaturedVendors = useMemo(
    () => (featuredVendors || []).slice(0, FEATURED_INITIAL_LIMIT),
    [featuredVendors]
  );

  const extraFeaturedCount = Math.max(
    0,
    (featuredVendors?.length || 0) - FEATURED_INITIAL_LIMIT
  );

  return (
    <>
      {/* IndiaMART-style Category Sections */}
      <section className="bg-white py-12 shadow-sm relative z-10 -mt-8 rounded-t-3xl border-t border-slate-100 mx-4 lg:mx-0">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
            <div>
              <h2 className="text-3xl font-extrabold text-slate-900 mb-1">
                Browse by Category
              </h2>
            </div>

            {hasMoreHeads && (
              <button
                type="button"
                onClick={() => setShowAllHeads((v) => !v)}
                className="text-sm font-semibold text-blue-700 hover:text-blue-900 underline underline-offset-4"
              >
                {showAllHeads ? 'View less' : 'View more'}
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
                <div className="text-center text-slate-500 py-10">
                  No categories found.
                </div>
              )}

              {hasMoreHeads && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAllHeads((v) => !v)}
                    className="px-6 py-3 rounded-md bg-white border border-slate-200 hover:border-blue-500 hover:shadow-md transition-all font-semibold text-slate-800"
                  >
                    {showAllHeads
                      ? 'View less'
                      : `View more (${Math.max(0, (totalHeads || 0) - HEAD_INITIAL_LIMIT)})`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Top Cities Section */}
      <TopCitiesSection />

      {/* Premium Brands Section */}
      <PremiumBrandsSection />

      {/* Featured Vendors */}
      <section className="py-20 bg-slate-50 container mx-auto px-4">
        <div className="flex justify-between items-end mb-10">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              Featured Suppliers
            </h2>
            <p className="text-slate-500">Trusted partners for your business needs</p>
          </div>

          <Button
            variant="link"
            className="text-blue-600 font-semibold hover:text-blue-800 p-0 h-auto"
            onClick={() => navigate('/directory/vendor')}
          >
            View More Suppliers{extraFeaturedCount > 0 ? ` (${extraFeaturedCount})` : ''}{' '}
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        {loadingVendors ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {visibleFeaturedVendors.map((vendor) => (
              <div
                key={vendor.id}
                className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:shadow-lg transition-all cursor-pointer group hover:-translate-y-1"
                onClick={() => navigate(`/directory/vendor/${vendor.id}`)}
              >
                <div className="relative h-32 mb-3 rounded-lg bg-slate-100 overflow-hidden">
                  <VendorImage src={vendor.image} name={vendor.name} />
                  {vendor.verified && (
                    <span className="absolute top-2 right-2 bg-white/95 backdrop-blur-sm px-2 py-0.5 rounded-full text-[10px] font-semibold text-blue-700 flex items-center gap-1 shadow-sm">
                      <CheckCircle className="w-3 h-3 fill-blue-100" /> Verified
                    </span>
                  )}
                </div>

                <h3 className="font-semibold text-slate-900 text-base line-clamp-1 mb-1 group-hover:text-blue-700 transition-colors">
                  {vendor.name}
                </h3>

                <div className="flex items-center text-xs text-slate-500 mb-3">
                  <MapPin className="w-3 h-3 mr-1.5" /> {vendor.city}, {vendor.state}
                </div>

                <Button className="w-full bg-white border border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white transition-all font-medium h-8 text-xs">
                  Contact Supplier
                </Button>
              </div>
            ))}

            {featuredVendors.length === 0 && (
              <div className="col-span-full text-center text-slate-500 py-10">
                No featured vendors found.
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
};

export default HomeDeferredSections;
