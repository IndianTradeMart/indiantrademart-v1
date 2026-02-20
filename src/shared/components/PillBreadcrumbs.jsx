import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/customSupabaseClient';

const PillBreadcrumbs = ({ className, overrideParams }) => {
  const location = useLocation();
  const routeParams = useParams();

  const params = overrideParams || routeParams;

  const prettify = (slug) => String(slug || '').replace(/-/g, ' ').trim();

  const headSlug = params.headSlug;
  const subSlug = params.subSlug;
  const microSlugFromRoute = params.microSlug;

  const serviceSlug = params.service || params.serviceSlug;
  const stateSlug = params.state || params.stateSlug;
  const citySlug = params.city || params.citySlug;

  const isDirectorySearch = useMemo(
    () => location.pathname.startsWith('/directory/search') || !!serviceSlug,
    [location.pathname, serviceSlug]
  );

  // IndianTradeMart -> Head -> Sub -> (Micro?) -> Location
  // NOTE: :service can be a micro slug, sub slug, or head slug.
  const [microHierarchy, setMicroHierarchy] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!isDirectorySearch) return;

      if (!serviceSlug) {
        setMicroHierarchy(null);
        return;
      }

      if (headSlug && subSlug && microSlugFromRoute) {
        setMicroHierarchy({
          head: { slug: headSlug, name: prettify(headSlug) },
          sub: { slug: subSlug, name: prettify(subSlug) },
          micro: { slug: microSlugFromRoute, name: prettify(microSlugFromRoute) },
        });
        return;
      }

      try {
        // 1) MICRO
        const { data: microData } = await supabase
          .from('micro_categories')
          .select(
            `
              id, name, slug,
              sub_categories (
                id, name, slug,
                head_categories (id, name, slug)
              )
            `
          )
          .eq('slug', serviceSlug)
          .maybeSingle();

        if (cancelled) return;

        if (microData?.slug) {
          setMicroHierarchy({
            head: {
              slug: microData?.sub_categories?.head_categories?.slug,
              name: microData?.sub_categories?.head_categories?.name,
            },
            sub: {
              slug: microData?.sub_categories?.slug,
              name: microData?.sub_categories?.name,
            },
            micro: { slug: microData.slug, name: microData.name },
          });
          return;
        }

        // 2) SUB
        const { data: subData } = await supabase
          .from('sub_categories')
          .select(
            `
              id, name, slug,
              head_categories (id, name, slug)
            `
          )
          .eq('slug', serviceSlug)
          .maybeSingle();

        if (cancelled) return;

        if (subData?.slug) {
          setMicroHierarchy({
            head: {
              slug: subData?.head_categories?.slug,
              name: subData?.head_categories?.name,
            },
            sub: { slug: subData.slug, name: subData.name },
            micro: null,
          });
          return;
        }

        // 3) HEAD
        const { data: headData } = await supabase
          .from('head_categories')
          .select('id, name, slug')
          .eq('slug', serviceSlug)
          .maybeSingle();

        if (cancelled) return;

        if (headData?.slug) {
          setMicroHierarchy({ head: { slug: headData.slug, name: headData.name }, sub: null, micro: null });
          return;
        }

        setMicroHierarchy(null);
      } catch (_) {
        if (!cancelled) setMicroHierarchy(null);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isDirectorySearch, serviceSlug, headSlug, subSlug, microSlugFromRoute]);

  let items = [{ label: 'IndianTradeMart', path: '/', icon: Home }];

  if (location.pathname.startsWith('/directory') && (headSlug || subSlug || microSlugFromRoute)) {
    if (headSlug) items.push({ label: prettify(headSlug), path: `/directory/${headSlug}` });
    if (headSlug && subSlug) items.push({ label: prettify(subSlug), path: `/directory/${headSlug}/${subSlug}` });
    if (headSlug && subSlug && microSlugFromRoute) {
      items.push({ label: prettify(microSlugFromRoute), path: `/directory/${headSlug}/${subSlug}/${microSlugFromRoute}` });
    }

    const locationLabel = citySlug || stateSlug;
    if (locationLabel) items.push({ label: prettify(locationLabel), path: location.pathname });
  } else if (isDirectorySearch) {
    const h = microHierarchy?.head;
    const s = microHierarchy?.sub;
    const m = microHierarchy?.micro;

    if (h?.slug) items.push({ label: h.name || prettify(h.slug), path: `/directory/${h.slug}` });
    if (h?.slug && s?.slug) items.push({ label: s.name || prettify(s.slug), path: `/directory/${h.slug}/${s.slug}` });
    if (h?.slug && s?.slug && m?.slug) items.push({ label: m.name || prettify(m.slug), path: `/directory/${h.slug}/${s.slug}/${m.slug}` });

    // Fallback only when hierarchy not found
    if (!h?.slug && !s?.slug && !m?.slug && serviceSlug) {
      items.push({ label: prettify(serviceSlug), path: `/directory/search/${serviceSlug}` });
    }

    const locLabel = citySlug || stateSlug;
    if (locLabel) {
      const base = `/directory/search/${serviceSlug || ''}`;
      const locPath =
        citySlug && stateSlug ? `${base}/${stateSlug}/${citySlug}` : stateSlug ? `${base}/${stateSlug}` : location.pathname;
      items.push({ label: prettify(locLabel), path: locPath });
    }
  } else if (location.pathname.startsWith('/categories')) {
    items.push({ label: 'All Categories', path: '/categories' });
    if (params.slug) items.push({ label: prettify(params.slug), path: `/categories/${params.slug}` });
  }

  const pillBase = 'inline-flex items-center rounded-full border transition-colors leading-none';
  const pillSize = 'px-3 py-1 text-xs';
  const pillGap = 'gap-1.5';
  const labelClass = 'capitalize truncate max-w-[140px] sm:max-w-[180px] md:max-w-[220px]';

  return (
    <nav className={cn('w-full overflow-x-auto pb-1 scrollbar-hide', className)} aria-label="Breadcrumb">
      <div className={cn('flex items-center whitespace-nowrap', pillGap)}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const Icon = item.icon;

          return (
            <React.Fragment key={`${item.path}-${index}`}>
              {index > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}

              <Link
                to={item.path}
                title={item.label}
                className={cn(
                  pillBase,
                  pillSize,
                  isLast
                    ? 'bg-[#003D82] text-white border-[#003D82] hover:bg-[#002a5c]'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                {Icon && <Icon className="w-3 h-3 mr-1.5 flex-shrink-0" />}
                <span className={labelClass}>{item.label}</span>
              </Link>
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
};

export default PillBreadcrumbs;
