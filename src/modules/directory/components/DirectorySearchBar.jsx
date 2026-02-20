import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { locationService } from '@/shared/services/locationService';
import { directoryApi } from '@/modules/directory/api/directoryApi';
import { urlParser } from '@/shared/utils/urlParser';
import { supabase } from '@/lib/customSupabaseClient';

const slugify = (value) => {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

// ✅ Resolve free-text location like "Delhi" / "New Delhi" to state/city slugs.
const resolveLocationSlugs = async (locText) => {
  const clean = (locText || '').trim();
  if (!clean) return { stateSlug: '', citySlug: '' };

  const locSlug = slugify(clean);

  try {
    const { data: cityBySlug } = await supabase
      .from('cities')
      .select('slug, state_id, name')
      .eq('slug', locSlug)
      .maybeSingle();

    if (cityBySlug?.slug && cityBySlug?.state_id) {
      const { data: st } = await supabase
        .from('states')
        .select('slug, name')
        .eq('id', cityBySlug.state_id)
        .maybeSingle();

      return { stateSlug: st?.slug || '', citySlug: cityBySlug.slug };
    }
  } catch {
    // ignore
  }

  try {
    const { data: stateBySlug } = await supabase
      .from('states')
      .select('slug, name')
      .eq('slug', locSlug)
      .maybeSingle();

    if (stateBySlug?.slug) {
      return { stateSlug: stateBySlug.slug, citySlug: '' };
    }
  } catch {
    // ignore
  }

  try {
    const { data: cities } = await supabase
      .from('cities')
      .select('slug, state_id, name')
      .ilike('name', `%${clean}%`)
      .limit(1);

    const city = cities?.[0];
    if (city?.slug && city?.state_id) {
      const { data: st } = await supabase
        .from('states')
        .select('slug, name')
        .eq('id', city.state_id)
        .maybeSingle();

      return { stateSlug: st?.slug || '', citySlug: city.slug };
    }
  } catch {
    // ignore
  }

  try {
    const { data: states } = await supabase
      .from('states')
      .select('slug, name')
      .ilike('name', `%${clean}%`)
      .limit(1);

    const st = states?.[0];
    if (st?.slug) return { stateSlug: st.slug, citySlug: '' };
  } catch {
    // ignore
  }

  return { stateSlug: '', citySlug: '' };
};

const DirectorySearchBar = ({
  initialService = '',
  initialState = '',
  initialCity = '',
  className = '',
  enableSuggestions = false,

  // ✅ when true -> Land Survey style slim bar
  compact = false,
}) => {
  const navigate = useNavigate();

  const [serviceText, setServiceText] = useState('');
  const [serviceSlug, setServiceSlug] = useState('');

  const [selectedStateSlug, setSelectedStateSlug] = useState('');
  const [selectedCitySlug, setSelectedCitySlug] = useState('');

  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const s = initialService || '';
    setServiceSlug(s);
    setServiceText(s ? s.replace(/-/g, ' ') : '');

    setSelectedStateSlug(initialState || '');
    setSelectedCitySlug(initialCity || '');
  }, [initialService, initialState, initialCity]);

  useEffect(() => {
    const load = async () => {
      setLoadingStates(true);
      try {
        const data = await locationService.getStates();
        setStates(data || []);
      } finally {
        setLoadingStates(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const loadCities = async () => {
      if (!selectedStateSlug) {
        setCities([]);
        return;
      }
      setLoadingCities(true);
      try {
        const data = await locationService.getCitiesByStateSlug(selectedStateSlug);
        setCities(data || []);
      } finally {
        setLoadingCities(false);
      }
    };
    loadCities();
  }, [selectedStateSlug]);

  useEffect(() => {
    if (!selectedStateSlug) {
      if (selectedCitySlug) setSelectedCitySlug('');
      return;
    }
    if (selectedCitySlug && cities.length > 0) {
      const exists = cities.some((c) => c.slug === selectedCitySlug);
      if (!exists) setSelectedCitySlug('');
    }
  }, [cities, selectedCitySlug, selectedStateSlug]);

  useEffect(() => {
    if (!enableSuggestions) return;

    const t = setTimeout(async () => {
      const q = serviceText?.trim();
      if (!q || q.length < 2) {
        setSuggestions([]);
        return;
      }
      try {
        const res = await directoryApi.searchMicroCategories(q);
        setSuggestions(res || []);
      } catch (e) {
        console.error('Suggestion search failed', e);
        setSuggestions([]);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [serviceText, enableSuggestions]);

  const canShowSuggestions = useMemo(
    () => enableSuggestions && showSuggestions && suggestions.length > 0,
    [enableSuggestions, showSuggestions, suggestions.length]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    let finalServiceText = (serviceText || '').trim();
    let freeLocText = '';

    if (!selectedStateSlug && !selectedCitySlug) {
      const m = finalServiceText.match(/^(.*)\s+in\s+(.+)$/i);
      if (m && m[1] && m[2]) {
        finalServiceText = m[1].trim();
        freeLocText = m[2].trim();
      }
    }

    const finalServiceSlug = serviceSlug || slugify(finalServiceText);
    if (!finalServiceSlug) return;

    if (selectedStateSlug || selectedCitySlug) {
      const url = urlParser.createStructuredUrl(finalServiceSlug, selectedStateSlug || '', selectedCitySlug || '');
      navigate(url);
      return;
    }

    if (freeLocText) {
      setSubmitting(true);
      try {
        const resolved = await resolveLocationSlugs(freeLocText);

        setServiceText(finalServiceText);
        setServiceSlug('');

        if (resolved?.stateSlug || resolved?.citySlug) {
          const url = urlParser.createStructuredUrl(finalServiceSlug, resolved.stateSlug || '', resolved.citySlug || '');
          navigate(url);
        } else {
          const sp = new URLSearchParams();
          sp.set('loc', freeLocText);
          navigate(`/directory/search/${finalServiceSlug}?${sp.toString()}`);
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const url = urlParser.createStructuredUrl(finalServiceSlug, '', '');
    navigate(url);
  };

  // ✅ Land Survey style sizing
  const wrapperPad = compact ? 'p-1.5' : 'p-2';
  const heightCls = compact ? 'h-11' : 'h-12'; // h-11 ≈ screenshot
  const iconTop = compact ? 'top-3' : 'top-3.5';
  const btnPx = compact ? 'px-10 text-sm' : 'px-12';

  return (
    <div
      className={`w-full bg-white border border-slate-200 rounded-xl overflow-hidden ${wrapperPad} ${className}`}
    >
      <form
        onSubmit={handleSubmit}
        className={`flex flex-col md:flex-row md:items-center ${compact ? 'gap-1.5 md:gap-0' : 'gap-2 md:gap-0'}`}
      >
        {/* Service Input */}
        <div className="flex-1 relative md:border-r md:border-slate-200">
          <div className={`absolute left-3 ${iconTop} text-gray-400`}>
            <Search className="w-5 h-5" />
          </div>

          <Input
            placeholder="Search product/service"
            className={`pl-10 border-0 bg-transparent focus-visible:ring-0 rounded-none ${heightCls}`}
            value={serviceText}
            onChange={(e) => {
              setServiceText(e.target.value);
              setServiceSlug('');
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          />

          {canShowSuggestions && (
            <div className="absolute top-full left-0 right-0 bg-white rounded-lg shadow-xl mt-2 z-50 overflow-hidden text-left border border-gray-100">
              {suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="w-full px-4 py-3 hover:bg-slate-50 text-left border-b last:border-0"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setServiceText(item.name);
                    setServiceSlug(item.slug);
                    setSuggestions([]);
                    setShowSuggestions(false);
                  }}
                >
                  <div className="font-medium text-slate-800">{item.name}</div>
                  <div className="text-xs text-slate-500">{item.path}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* State Select */}
        <div className="flex-1 relative md:border-r md:border-slate-200">
          <div className={`absolute left-3 ${iconTop} text-gray-400`}>
            <MapPin className="w-5 h-5" />
          </div>

          <select
            className={`w-full ${heightCls} pl-10 pr-8 bg-transparent border-0 focus:ring-0 text-sm text-gray-700 outline-none cursor-pointer appearance-none`}
            value={selectedStateSlug}
            onChange={(e) => {
              setSelectedStateSlug(e.target.value);
              setSelectedCitySlug('');
            }}
            disabled={loadingStates}
          >
            <option value="">All India</option>
            {states.map((s) => (
              <option key={s.id} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>

          {loadingStates && (
            <div className={`absolute right-3 ${iconTop} text-gray-400`}>
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
        </div>

        {/* City Select */}
        <div className="flex-1 relative">
          <div className={`absolute left-3 ${iconTop} text-gray-400`}>
            <MapPin className="w-5 h-5" />
          </div>

          <select
            className={`w-full ${heightCls} pl-10 pr-8 bg-transparent border-0 focus:ring-0 text-sm text-gray-700 outline-none cursor-pointer appearance-none`}
            value={selectedCitySlug}
            onChange={(e) => setSelectedCitySlug(e.target.value)}
            disabled={!selectedStateSlug || loadingCities}
          >
            <option value="">{selectedStateSlug ? 'All Cities' : 'Select State first'}</option>
            {cities.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>

          {loadingCities && (
            <div className={`absolute right-3 ${iconTop} text-gray-400`}>
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
        </div>

        <div className="md:pl-2">
          <Button
            type="submit"
            className={`bg-[#003D82] hover:bg-[#00254E] text-white ${btnPx} ${heightCls} rounded-lg`}
            disabled={submitting}
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching...
              </span>
            ) : (
              'Search'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default DirectorySearchBar;
