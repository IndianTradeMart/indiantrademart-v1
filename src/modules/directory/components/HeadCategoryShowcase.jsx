import React, { memo, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { Loader2 } from 'lucide-react';

const cx = (...arr) => arr.filter(Boolean).join(' ');

const safeImg = (url) => (typeof url === 'string' && url.trim().length > 0 ? url.trim() : null);

const ImgOrFallback = ({ src, alt, className }) => {
  const s = safeImg(src);
  if (!s) {
    return (
      <div
        className={cx(
          'bg-slate-100 flex items-center justify-center text-slate-500 font-semibold',
          className
        )}
        aria-label={alt}
      >
        {String(alt || '?').slice(0, 1).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={s}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cx('object-cover', className)}
      onError={(e) => {
        e.currentTarget.style.display = 'none';
        const parent = e.currentTarget.parentElement;
        if (parent) {
          parent.classList.add(
            'bg-slate-100',
            'flex',
            'items-center',
            'justify-center',
            'text-slate-500',
            'font-semibold'
          );
          parent.setAttribute('aria-label', alt);
          parent.innerText = String(alt || '?').slice(0, 1).toUpperCase();
        }
      }}
    />
  );
};

/**
 * Props:
 *  - head: { id, name, slug, image_url }
 *  - subcategories: [{ id, name, slug, image_url, micros: [{id,name,slug}] }]
 *  - subLimit?: number
 *  - microPreviewLimit?: number
 *  - leftOverlayLimit?: number
 */
const HeadCategoryShowcase = ({
  head,
  subcategories = [],
  subLimit = 9,
  microPreviewLimit = 3,
  leftOverlayLimit = 5
}) => {
  const headName = head?.name || head?.slug || 'Category';
  const headSlug = head?.slug;

  // ✅ per-head "View more" for subcategories
  const [showAllSubs, setShowAllSubs] = useState(false);

  // ✅ fallback micro fetch if micros missing
  const [microMap, setMicroMap] = useState({});
  const [microLoading, setMicroLoading] = useState(false);

  const allSubs = useMemo(() => (Array.isArray(subcategories) ? subcategories : []), [subcategories]);

  const visibleSubs = useMemo(() => {
    if (showAllSubs) return allSubs;
    return allSubs.slice(0, subLimit);
  }, [allSubs, showAllSubs, subLimit]);

  const leftOverlayItems = useMemo(() => allSubs.slice(0, leftOverlayLimit), [allSubs, leftOverlayLimit]);

  const hasMoreSubs = allSubs.length > subLimit;

  // ✅ if micros not coming from API, fetch once here
  useEffect(() => {
    const needFallback =
      visibleSubs.length > 0 &&
      visibleSubs.some((s) => !Array.isArray(s.micros) || s.micros.length === 0);

    if (!needFallback) return;

    const subIds = visibleSubs.map((s) => s.id).filter(Boolean);
    if (subIds.length === 0) return;

    let cancelled = false;

    const loadMicros = async () => {
      setMicroLoading(true);
      try {
        const { data, error } = await supabase
          .from('micro_categories')
          .select('id, sub_category_id, name, slug')
          .in('sub_category_id', subIds)
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (error) {
          console.error('Micro fetch error (fallback):', error);
          return;
        }

        const map = {};
        for (const m of data || []) {
          if (!map[m.sub_category_id]) map[m.sub_category_id] = [];
          map[m.sub_category_id].push({ id: m.id, name: m.name, slug: m.slug });
        }

        if (!cancelled) setMicroMap(map);
      } finally {
        if (!cancelled) setMicroLoading(false);
      }
    };

    loadMicros();

    return () => {
      cancelled = true;
    };
  }, [visibleSubs]);

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-4 border-b bg-white flex items-center justify-between gap-3">
        <Link
          to={headSlug ? `/directory/${headSlug}` : '/directory'}
          className="text-2xl font-extrabold text-blue-800 hover:text-blue-900 underline underline-offset-4 decoration-blue-300"
        >
          {headName}
        </Link>

        {headSlug && (
          <Link
            to={`/directory/${headSlug}`}
            className="text-sm font-semibold text-blue-700 hover:text-blue-900"
          >
            View all ›
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Left image block */}
        <div className="lg:col-span-4 border-r border-slate-200">
          <div className="relative h-[260px] sm:h-[300px] lg:h-full min-h-[320px] bg-slate-50">
            <ImgOrFallback src={head?.image_url} alt={headName} className="w-full h-full" />

            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />

            <div className="absolute left-4 bottom-16 right-4">
              <div className="space-y-2">
                {leftOverlayItems.map((s) => (
                  <Link
                    key={s.id || s.slug}
                    to={headSlug && s?.slug ? `/directory/${headSlug}/${s.slug}` : '/directory'}
                    className="block text-white/95 text-sm hover:text-white transition-colors line-clamp-1 drop-shadow"
                    title={s?.name}
                  >
                    {s?.name}
                  </Link>
                ))}
              </div>
            </div>

            <div className="absolute left-4 bottom-4">
              <Link
                to={headSlug ? `/directory/${headSlug}` : '/directory'}
                className="inline-flex items-center justify-center px-6 py-2.5 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white font-bold shadow-md hover:shadow-lg transition-all"
              >
                View All
              </Link>
            </div>
          </div>
        </div>

        {/* Right subcategory tiles */}
        <div className="lg:col-span-8 p-4 sm:p-5 bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleSubs.map((sub) => {
              const subName = sub?.name || sub?.slug || 'Subcategory';
              const subSlug = sub?.slug;

              // ✅ micros priority: API-provided -> fallback map
              const microsRaw =
                (Array.isArray(sub?.micros) && sub.micros.length > 0 ? sub.micros : microMap[sub?.id]) || [];

              const microList = microsRaw.slice(0, microPreviewLimit);
              const hasMoreMicros = microsRaw.length > microPreviewLimit;

              return (
                <div
                  key={sub?.id || subSlug}
                  className="border border-slate-200 bg-white hover:border-slate-300 hover:shadow-md transition-all"
                >
                  <Link
                    to={headSlug && subSlug ? `/directory/${headSlug}/${subSlug}` : '/directory'}
                    className="flex gap-3 p-3 group"
                  >
                    <div className="w-14 h-14 bg-slate-50 border border-slate-200 overflow-hidden shrink-0">
                      <ImgOrFallback src={sub?.image_url} alt={subName} className="w-full h-full" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors line-clamp-2">
                        {subName}
                      </div>

                      <div className="mt-2 space-y-1">
                        {microList.map((m) => (
                          <span
                            key={m.id || m.slug}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (headSlug && subSlug && m?.slug) {
                                window.location.href = `/directory/${headSlug}/${subSlug}/${m.slug}`;
                              }
                            }}
                            className="block text-sm text-slate-700 hover:text-blue-700 line-clamp-1 cursor-pointer"
                            title={m?.name}
                          >
                            {m?.name}
                          </span>
                        ))}

                        {microLoading && microList.length === 0 && (
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Loading micro categories...
                          </div>
                        )}

                        {!microLoading && microList.length === 0 && (
                          <div className="text-xs text-slate-500">No micro categories</div>
                        )}

                        {hasMoreMicros && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              if (headSlug && subSlug) {
                                window.location.href = `/directory/${headSlug}/${subSlug}`;
                              } else {
                                window.location.href = '/directory';
                              }
                            }}
                            className="block text-xs font-semibold text-blue-700 hover:text-blue-900 pt-1 cursor-pointer"
                          >
                            View more →
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}

            {visibleSubs.length === 0 && (
              <div className="col-span-full text-center text-slate-500 py-10">No sub-categories found.</div>
            )}
          </div>

          {/* ✅ "View more" under (for subcategories) */}
          {hasMoreSubs && (
            <div className="flex justify-center mt-6">
              <button
                type="button"
                onClick={() => setShowAllSubs((v) => !v)}
                className="px-6 py-2.5 rounded-md bg-white border border-slate-200 hover:border-blue-500 hover:shadow-md transition-all font-semibold text-slate-800"
              >
                {showAllSubs ? 'View less' : `View more (${allSubs.length - subLimit})`}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default memo(HeadCategoryShowcase);
