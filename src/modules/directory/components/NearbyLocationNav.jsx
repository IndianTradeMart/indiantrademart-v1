import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, ChevronLeft } from 'lucide-react';
import { locationService } from '@/shared/services/locationService';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const NearbyLocationNav = ({ serviceSlug, stateSlug, currentCitySlug }) => {
  const navigate = useNavigate();

  // ✅ IMPORTANT
  // Nearby city pills must navigate to the SEARCH route.
  // If we use `/directory/${serviceSlug}/${stateSlug}/${citySlug}` it collides with
  // category hierarchy routes and opens MicroCategory/ProductListing pages by mistake.
  const buildSearchUrl = (svc, st, ct) => {
    if (!svc) return '/directory';
    let url = `/directory/search/${svc}`;
    if (st) url += `/${st}`;
    if (ct) url += `/${ct}`;
    return url;
  };

  const [loading, setLoading] = useState(true);
  const [cities, setCities] = useState([]);

  const [showOtherStates, setShowOtherStates] = useState(false);

  const [statesLoading, setStatesLoading] = useState(false);
  const [states, setStates] = useState([]);

  const [selectedState, setSelectedState] = useState(null); // { slug, name }
  const [otherCitiesLoading, setOtherCitiesLoading] = useState(false);
  const [otherCities, setOtherCities] = useState([]);

  const currentStateName = useMemo(() => {
    const found = states?.find((s) => s.slug === stateSlug);
    if (found?.name) return found.name;
    return (stateSlug || '').replace(/-/g, ' ');
  }, [states, stateSlug]);

  // Load current state cities (Nearby in current state)
  useEffect(() => {
    const fetchCities = async () => {
      if (!stateSlug) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const data = await locationService.getCitiesByStateSlug(stateSlug);

      // Filter out current city
      const filtered = (data || []).filter((c) => c.slug !== currentCitySlug);

      setCities(filtered);
      setLoading(false);

      // Reset other state UI when route changes
      setShowOtherStates(false);
      setSelectedState(null);
      setOtherCities([]);
    };

    fetchCities();
  }, [stateSlug, currentCitySlug]);

  // Preload states (for showing state name + state list)
  useEffect(() => {
    const loadStates = async () => {
      if (states && states.length > 0) return;

      setStatesLoading(true);
      const s = await locationService.getStates();
      setStates(s || []);
      setStatesLoading(false);
    };
    loadStates();
  }, [states]);

  const otherStates = useMemo(() => {
    return (states || []).filter((s) => s.slug !== stateSlug);
  }, [states, stateSlug]);

  const openOtherStates = async () => {
    setShowOtherStates(true);
    setSelectedState(null);
    setOtherCities([]);

    if (!states || states.length === 0) {
      setStatesLoading(true);
      const s = await locationService.getStates();
      setStates(s || []);
      setStatesLoading(false);
    }
  };

  const pickState = async (st) => {
    if (!st?.slug) return;
    setSelectedState({ slug: st.slug, name: st.name || st.slug.replace(/-/g, ' ') });

    setOtherCitiesLoading(true);
    const data = await locationService.getCitiesByStateSlug(st.slug);
    setOtherCities(data || []);
    setOtherCitiesLoading(false);
  };

  const goBackToNearbyCities = () => {
    setShowOtherStates(false);
    setSelectedState(null);
    setOtherCities([]);
  };

  const goBackToStates = () => {
    setSelectedState(null);
    setOtherCities([]);
  };

  if (!stateSlug) return null;

  const headerLabel = selectedState?.name
    ? `Cities in ${selectedState.name}`
    : `Nearby in ${currentStateName}`;

  return (
    <div className="w-full mt-4">
      <div className="flex items-center gap-2 mb-2">
        <MapPin className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {headerLabel}
        </span>
      </div>

      <div className="flex overflow-x-auto pb-2 gap-3 scrollbar-hide">
        {/* 1) Default view: Nearby cities in current state */}
        {!showOtherStates && (
          <>
            {loading ? (
              Array(6)
                .fill(0)
                .map((_, i) => (
                  <Skeleton key={i} className="h-8 w-24 rounded-full flex-shrink-0" />
                ))
            ) : (
              <>
                {/* ✅ State-level (All Cities) pill */}
                <button
                  type="button"
                  onClick={() => navigate(buildSearchUrl(serviceSlug, stateSlug, ''))}
                  className={cn(
                    "flex-shrink-0 px-4 py-1.5 rounded-full border text-sm font-medium transition-all",
                    !currentCitySlug
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "bg-white border-gray-300 text-gray-700 hover:border-blue-500 hover:text-blue-600 hover:shadow-sm"
                  )}
                  title={`All Cities in ${currentStateName}`}
                >
                  {currentStateName}
                </button>

                {/* ✅ Current city pill (active) */}
                {!!currentCitySlug && (
                  <button
                    type="button"
                    onClick={() => navigate(buildSearchUrl(serviceSlug, stateSlug, currentCitySlug))}
                    className={cn(
                      "flex-shrink-0 px-4 py-1.5 rounded-full border text-sm font-medium transition-all",
                      "bg-blue-50 border-blue-300 text-blue-700"
                    )}
                    title="Current city"
                  >
                    {(currentCitySlug || '').replace(/-/g, ' ')}
                  </button>
                )}

                {cities.map((city) => (
                  <button
                    key={city.id}
                    onClick={() => navigate(buildSearchUrl(serviceSlug, stateSlug, city.slug))}
                    className={cn(
                      "flex-shrink-0 px-4 py-1.5 rounded-full border text-sm font-medium transition-all",
                      "bg-white border-gray-300 text-gray-700 hover:border-blue-500 hover:text-blue-600 hover:shadow-sm"
                    )}
                  >
                    {city.name}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={openOtherStates}
                  className="flex-shrink-0 px-4 py-1.5 rounded-full border border-dashed border-gray-300 text-sm text-gray-500 hover:text-blue-600 hover:border-blue-400"
                >
                  View Other States
                </button>

                {cities.length === 0 && (
                  <span className="text-sm text-gray-400 italic px-2">
                    No other cities found nearby.
                  </span>
                )}
              </>
            )}
          </>
        )}

        {/* 2) Other States view */}
        {showOtherStates && !selectedState && (
          <>
            <button
              type="button"
              onClick={goBackToNearbyCities}
              className="flex-shrink-0 px-3 py-1.5 rounded-full border bg-white text-sm font-medium text-gray-700 hover:border-blue-400 hover:text-blue-600"
              title="Back"
            >
              <span className="inline-flex items-center gap-1">
                <ChevronLeft className="w-4 h-4" /> Back
              </span>
            </button>

            {statesLoading ? (
              Array(8)
                .fill(0)
                .map((_, i) => (
                  <Skeleton key={i} className="h-8 w-28 rounded-full flex-shrink-0" />
                ))
            ) : (
              <>
                {otherStates.map((st) => (
                  <button
                    key={st.id || st.slug}
                    onClick={() => pickState(st)}
                    className={cn(
                      "flex-shrink-0 px-4 py-1.5 rounded-full border text-sm font-medium transition-all",
                      "bg-white border-gray-300 text-gray-700 hover:border-blue-500 hover:text-blue-600 hover:shadow-sm"
                    )}
                    title={st.name}
                  >
                    {st.name}
                  </button>
                ))}

                {otherStates.length === 0 && (
                  <span className="text-sm text-gray-400 italic px-2">
                    No other states found.
                  </span>
                )}
              </>
            )}
          </>
        )}

        {/* 3) Selected other state -> show its cities */}
        {showOtherStates && selectedState && (
          <>
            <button
              type="button"
              onClick={goBackToStates}
              className="flex-shrink-0 px-3 py-1.5 rounded-full border bg-white text-sm font-medium text-gray-700 hover:border-blue-400 hover:text-blue-600"
              title="Back to states"
            >
              <span className="inline-flex items-center gap-1">
                <ChevronLeft className="w-4 h-4" /> States
              </span>
            </button>

            {/* ✅ Selected state (All Cities) pill */}
            <button
              type="button"
              onClick={() => navigate(buildSearchUrl(serviceSlug, selectedState.slug, ''))}
              className={cn(
                "flex-shrink-0 px-4 py-1.5 rounded-full border text-sm font-medium transition-all",
                "bg-blue-50 border-blue-300 text-blue-700"
              )}
              title={`All Cities in ${selectedState.name}`}
            >
              {selectedState.name}
            </button>

            {otherCitiesLoading ? (
              Array(8)
                .fill(0)
                .map((_, i) => (
                  <Skeleton key={i} className="h-8 w-24 rounded-full flex-shrink-0" />
                ))
            ) : (
              <>
                {(otherCities || []).map((city) => (
                  <button
                    key={city.id || city.slug}
                    onClick={() => navigate(buildSearchUrl(serviceSlug, selectedState.slug, city.slug))}
                    className={cn(
                      "flex-shrink-0 px-4 py-1.5 rounded-full border text-sm font-medium transition-all",
                      "bg-white border-gray-300 text-gray-700 hover:border-blue-500 hover:text-blue-600 hover:shadow-sm"
                    )}
                    title={city.name}
                  >
                    {city.name}
                  </button>
                ))}

                {(otherCities || []).length === 0 && (
                  <span className="text-sm text-gray-400 italic px-2">
                    No cities found for {selectedState.name}.
                  </span>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default NearbyLocationNav;
