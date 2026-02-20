import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { vendorApi } from '@/modules/vendor/services/vendorApi';
import { MapPin, Layers, X, Zap } from 'lucide-react';

const TRIAL_PLAN_ID = '7fee24d0-de18-44d3-a357-be7b40492a1a';
const TRIAL_DURATION_DAYS = 30;
const DEFAULT_LIMITS = { states: 2, cities: 20, categories: 5 };

const CoverageSettings = () => {
  const [vendorId, setVendorId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingCoverage, setSavingCoverage] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);

  const [plan, setPlan] = useState(null);
  const [coverageLimits, setCoverageLimits] = useState(DEFAULT_LIMITS);

  const [states, setStates] = useState([]);
  const [stateCities, setStateCities] = useState({});
  const [selectedStates, setSelectedStates] = useState([]);
  const [selectedCities, setSelectedCities] = useState([]);

  const [subCategories, setSubCategories] = useState([]);
  const [microCategories, setMicroCategories] = useState([]);
  const [microCategoryLookup, setMicroCategoryLookup] = useState({});
  const [preferredCategories, setPreferredCategories] = useState([]);
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState('');
  const [selectedMicroCategoryId, setSelectedMicroCategoryId] = useState('');
  const [categoryQuery, setCategoryQuery] = useState('');
  const [catSuggestions, setCatSuggestions] = useState([]);
  const [catLoading, setCatLoading] = useState(false);
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const [categoryHint, setCategoryHint] = useState('');
  const [planName, setPlanName] = useState('');

  // ---------- helpers ----------
  const ensureTrialActive = async () => {
    try {
      const { data: active } = await supabase
        .from('vendor_plan_subscriptions')
        .select('*, plan:vendor_plans(*)')
        .eq('vendor_id', vendorId)
        .eq('status', 'ACTIVE')
        .maybeSingle();
      if (active) return active;

      const start = new Date();
      const end = new Date(start.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
      const { data: trial, error } = await supabase
        .from('vendor_plan_subscriptions')
        .insert([{
          vendor_id: vendorId,
          plan_id: TRIAL_PLAN_ID,
          start_date: start.toISOString(),
          end_date: end.toISOString(),
          status: 'ACTIVE',
          plan_duration_days: TRIAL_DURATION_DAYS,
          auto_renewal_enabled: false,
          renewal_notification_sent: false
        }])
        .select('*, plan:vendor_plans(*)')
        .single();
      if (error) throw error;
      toast({ title: 'Trial Activated', description: 'Free trial started automatically.' });
      return trial;
    } catch (e) {
      console.error('Trial activation failed', e);
      return null;
    }
  };

  const getCoverageLimits = (planObj) => {
    if (!planObj) return DEFAULT_LIMITS;
    let f = planObj.features || {};
    if (typeof f === 'string') {
      try { f = JSON.parse(f); } catch (_) { f = {}; }
    }
    return {
      states: Number(f.states_limit || DEFAULT_LIMITS.states),
      cities: Number(f.cities_limit || DEFAULT_LIMITS.cities),
      categories: Number(f.categories_limit || DEFAULT_LIMITS.categories),
    };
  };

  // ---------- load ----------
  useEffect(() => {
    const fetchVendorId = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: vendor } = await supabase
          .from('vendors')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (vendor?.id) setVendorId(vendor.id);
      } catch (e) {
        console.error('Vendor fetch failed', e);
      }
    };
    fetchVendorId();
  }, []);

  useEffect(() => {
    if (!vendorId) return;
    const loadAll = async () => {
      setLoading(true);
      try {
        // plan
        const { data: sub } = await supabase
          .from('vendor_plan_subscriptions')
          .select('*, plan:vendor_plans(*)')
          .eq('vendor_id', vendorId)
          .eq('status', 'ACTIVE')
          .order('created_at', { ascending: false })
          .limit(1);
        let active = sub && sub.length ? sub[0] : null;
        if (!active) active = await ensureTrialActive();
        setPlan(active?.plan || null);
        setPlanName(active?.plan?.name || 'Trial');
        const limits = getCoverageLimits(active?.plan);
        setCoverageLimits(limits);

        // preferences
        const { data: prefs } = await supabase
          .from('vendor_preferences')
          .select('preferred_states, preferred_cities, preferred_micro_categories')
          .eq('vendor_id', vendorId)
          .maybeSingle();
        const prefStates = prefs?.preferred_states || [];
        const prefCities = prefs?.preferred_cities || [];
        const prefCats = prefs?.preferred_micro_categories || [];

        // Trim if previous selection exceeds current plan limits
        if (prefStates.length > limits.states) {
          toast({ title: 'States trimmed', description: `Kept first ${limits.states} as per ${planName} plan.` });
        }
        if (prefCities.length > limits.cities) {
          toast({ title: 'Cities trimmed', description: `Kept first ${limits.cities} as per ${planName} plan.` });
        }
        if (prefCats.length > limits.categories) {
          toast({ title: 'Categories trimmed', description: `Kept first ${limits.categories} as per ${planName} plan.` });
        }

        setSelectedStates(prefStates.slice(0, limits.states));
        setSelectedCities(prefCities.slice(0, limits.cities));
        setPreferredCategories(prefCats.slice(0, limits.categories));

        // states list
        const { data: stateList } = await supabase
          .from('states')
          .select('id, name')
          .eq('is_active', true)
          .order('name');
        setStates(stateList || []);

        // cities for selected states
        const selectedStateIds = prefs?.preferred_states || [];
        if (selectedStateIds.length) {
          const { data: cities } = await supabase
            .from('cities')
            .select('id, name, state_id')
            .in('state_id', selectedStateIds)
            .eq('is_active', true);
          const grouped = {};
          (cities || []).forEach((c) => {
            grouped[c.state_id] = grouped[c.state_id] || [];
            grouped[c.state_id].push(c);
          });
          setStateCities(grouped);
        }

        // sub categories
        const { data: subCats } = await supabase
          .from('sub_categories')
          .select('id, name, head_categories(id, name)')
          .eq('is_active', true)
          .order('name');
        setSubCategories(subCats || []);

        // micro category details for selected preferences
        if (prefCats.length) {
          const { data: microDetails } = await supabase
            .from('micro_categories')
            .select('id, name, sub_categories(id, name, head_categories(id, name))')
            .in('id', prefCats);
          const lookup = {};
          (microDetails || []).forEach((item) => {
            lookup[item.id] = item;
          });
          setMicroCategoryLookup(lookup);
        } else {
          setMicroCategoryLookup({});
        }
      } catch (e) {
        console.error('Coverage load failed', e);
        toast({ title: 'Error', description: 'Could not load coverage data', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, [vendorId]);

  // ---------- handlers ----------
  const addState = async (stateId) => {
    if (!stateId) return;
    if (selectedStates.includes(stateId)) return;
    if (selectedStates.length >= coverageLimits.states) {
      toast({ title: 'Limit reached', description: `Max ${coverageLimits.states} states allowed in ${planName} plan.` });
      return;
    }
    setSelectedStates((p) => [...p, stateId]);
    if (!stateCities[stateId]) {
      const { data: cities } = await supabase
        .from('cities')
        .select('id, name, state_id')
        .eq('state_id', stateId)
        .eq('is_active', true)
        .order('name');
      setStateCities((prev) => ({ ...prev, [stateId]: cities || [] }));
    }
  };

  const addCity = (cityId) => {
    if (!cityId) return;
    if (selectedCities.includes(cityId)) return;
    if (selectedCities.length >= coverageLimits.cities) {
      toast({ title: 'Limit reached', description: `Max ${coverageLimits.cities} cities allowed in ${planName} plan.` });
      return;
    }
    setSelectedCities((p) => [...p, cityId]);
  };

  const saveCoverage = async () => {
    if (!vendorId) return;
    setSavingCoverage(true);
    try {
      await vendorApi.preferences.update({
        preferred_states: selectedStates,
        preferred_cities: selectedCities,
      });
      toast({ title: 'Coverage saved', description: 'Service coverage updated.' });
    } catch (e) {
      toast({ title: 'Error', description: e?.message || 'Could not save coverage', variant: 'destructive' });
    } finally {
      setSavingCoverage(false);
    }
  };

  const handleSubCategoryChange = async (subId, options = {}) => {
    const { keepQuery = false, hint } = options;
    setSelectedSubCategoryId(subId);
    setSelectedMicroCategoryId('');
    if (hint !== undefined) {
      setCategoryHint(hint);
    } else {
      setCategoryHint('');
    }
    if (!keepQuery) {
      setCategoryQuery('');
      setShowCatDropdown(false);
      setCatSuggestions([]);
    }
    if (!subId) {
      setMicroCategories([]);
      return;
    }
    try {
      const { data } = await supabase
        .from('micro_categories')
        .select('id, name, sub_categories(id, name, head_categories(id, name))')
        .eq('sub_category_id', subId)
        .eq('is_active', true)
        .order('name');
      const list = data || [];
      setMicroCategories(list);
      if (list.length) {
        setMicroCategoryLookup((prev) => {
          const next = { ...prev };
          list.forEach((item) => {
            next[item.id] = item;
          });
          return next;
        });
      }
      return list;
    } catch (e) {
      console.error('Micro categories load failed', e);
      toast({ title: 'Error', description: 'Could not load micro categories', variant: 'destructive' });
      setMicroCategories([]);
      return [];
    }
  };

  const handleMicroChange = (microId) => {
    setSelectedMicroCategoryId(microId);
    setCategoryHint('');
    const micro = microCategories.find((m) => m.id === microId);
    if (micro?.name) {
      setCategoryQuery(micro.name);
    }
    setShowCatDropdown(false);
  };

  const applyMicroSelection = async (item, silent = false) => {
    if (!item?.id || !item?.sub_id) return;
    if (!silent) {
      setCategoryQuery(item.name || '');
    }
    setCategoryHint('');
    setShowCatDropdown(false);
    setCatSuggestions([]);
    await handleSubCategoryChange(item.sub_id, { keepQuery: true });
    setSelectedMicroCategoryId(item.id);
    if (item.raw) {
      setMicroCategoryLookup((prev) => ({ ...prev, [item.id]: item.raw }));
    }
  };

  const applySubSelection = async (item, silent = false) => {
    if (!item?.id) return;
    if (!silent) {
      setCategoryQuery(item.name || '');
    }
    setShowCatDropdown(false);
    setCatSuggestions([]);
    await handleSubCategoryChange(item.id, {
      keepQuery: true,
      hint: 'Sub category selected. Please select a micro category.'
    });
  };

  const applySearchSelection = async (item, silent = false) => {
    if (!item) return;
    if (item.type === 'sub') {
      await applySubSelection(item, silent);
      return;
    }
    await applyMicroSelection(item, silent);
  };

  useEffect(() => {
    const q = (categoryQuery || '').trim();
    if (q.length < 2) {
      setCatSuggestions([]);
      setShowCatDropdown(false);
      setCatLoading(false);
      return;
    }

    setCatLoading(true);
    const timer = setTimeout(async () => {
      try {
        const [microRes, subRes] = await Promise.all([
          supabase
            .from('micro_categories')
            .select('id, name, sub_categories(id, name, head_categories(id, name))')
            .ilike('name', `%${q}%`)
            .eq('is_active', true)
            .order('name')
            .limit(6),
          supabase
            .from('sub_categories')
            .select('id, name, head_categories(id, name)')
            .ilike('name', `%${q}%`)
            .eq('is_active', true)
            .order('name')
            .limit(6)
        ]);

        if (microRes.error) throw microRes.error;
        if (subRes.error) throw subRes.error;

        const microList = (microRes.data || []).map((m) => ({
          type: 'micro',
          id: m.id,
          name: m.name,
          sub_id: m.sub_categories?.id,
          sub_name: m.sub_categories?.name,
          head_id: m.sub_categories?.head_categories?.id,
          head_name: m.sub_categories?.head_categories?.name,
          raw: m
        }));
        const subList = (subRes.data || []).map((s) => ({
          type: 'sub',
          id: s.id,
          name: s.name,
          head_id: s.head_categories?.id,
          head_name: s.head_categories?.name,
          raw: s
        }));

        const combined = [...microList, ...subList].slice(0, 8);
        setCatSuggestions(combined);
        setShowCatDropdown(true);

        const exactMicro = microList.find((item) => (item.name || '').toLowerCase() === q.toLowerCase());
        if (exactMicro) {
          await applySearchSelection(exactMicro, true);
          return;
        }
        const exactSub = subList.find((item) => (item.name || '').toLowerCase() === q.toLowerCase());
        if (exactSub) {
          await applySearchSelection(exactSub, true);
        }
      } catch (e) {
        console.error('Category search failed', e);
        setCatSuggestions([]);
        setShowCatDropdown(false);
      } finally {
        setCatLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [categoryQuery]);

  const addCategory = async () => {
    if (!selectedMicroCategoryId) return;
    if (preferredCategories.includes(selectedMicroCategoryId)) {
      toast({ title: 'Already added', variant: 'destructive' });
      return;
    }
    if (preferredCategories.length >= coverageLimits.categories) {
      toast({ title: `Max ${coverageLimits.categories} categories allowed in ${planName} plan.` });
      return;
    }
    setSavingCategory(true);
    try {
      const updated = [...preferredCategories, selectedMicroCategoryId];
      await vendorApi.preferences.update({ preferred_micro_categories: updated });
      setPreferredCategories(updated);
      setSelectedMicroCategoryId('');
      setCategoryQuery('');
      toast({ title: 'Category added' });
    } catch (e) {
      toast({ title: 'Error', description: e?.message || 'Could not add category', variant: 'destructive' });
    } finally {
      setSavingCategory(false);
    }
  };

  const removeCategory = async (catId) => {
    setSavingCategory(true);
    try {
      const updated = preferredCategories.filter((id) => id !== catId);
      await vendorApi.preferences.update({ preferred_micro_categories: updated });
      setPreferredCategories(updated);
    } catch (e) {
      toast({ title: 'Error', description: e?.message || 'Could not remove category', variant: 'destructive' });
    } finally {
      setSavingCategory(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[360px]">
        <div className="text-center text-slate-500 flex flex-col items-center gap-2">
          <Zap className="w-6 h-6 animate-spin text-slate-400" />
          <p>Loading coverage & categories...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Service Coverage & Categories</h1>
        <p className="text-slate-600 text-sm mt-1">
          Select where your services are shown and the categories buyers see.
        </p>
        {planName && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-blue-50 text-blue-800 px-3 py-1 text-xs border border-blue-100">
            <span className="font-semibold">Current Plan:</span> {planName} • {coverageLimits.states} states • {coverageLimits.cities} cities • {coverageLimits.categories} categories
          </div>
        )}
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-semibold text-gray-900">Coverage</h3>
              <p className="text-sm text-gray-600">
                Limits: {coverageLimits.states} states, {coverageLimits.cities} cities (based on your active plan).
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={saveCoverage} disabled={savingCoverage}>
            {savingCoverage ? 'Saving...' : 'Save Coverage'}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
               <p className="text-sm font-semibold text-slate-800">States</p>
               <span className="text-xs text-slate-500">{selectedStates.length}/{coverageLimits.states}</span>
             </div>
            <select
              onChange={(e) => addState(e.target.value)}
              value=""
              className="w-full border rounded-lg px-3 py-2"
              disabled={coverageLimits.states === 0 || selectedStates.length >= coverageLimits.states || states.length === 0}
            >
              <option value="">Select a state</option>
              {states.map((st) => (
                <option key={st.id} value={st.id}>{st.name}</option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2 mt-2">
              {selectedStates.map((sid) => {
                const st = states.find((s) => s.id === sid);
                return (
                  <Badge key={sid} variant="secondary" className="px-3 py-1 flex items-center gap-1">
                    {st?.name || sid}
                    <X className="w-3 h-3 cursor-pointer" onClick={() => setSelectedStates((p) => p.filter((id) => id !== sid))} />
                  </Badge>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
               <p className="text-sm font-semibold text-slate-800">Cities</p>
               <span className="text-xs text-slate-500">{selectedCities.length}/{coverageLimits.cities}</span>
             </div>
            <select
              onChange={(e) => addCity(e.target.value)}
              value=""
              className="w-full border rounded-lg px-3 py-2"
              disabled={coverageLimits.cities === 0 || selectedCities.length >= coverageLimits.cities || selectedStates.length === 0}
            >
              <option value="">Select a city</option>
              {selectedStates.flatMap((sid) => stateCities[sid] || []).map((city) => (
                <option key={city.id} value={city.id}>{city.name}</option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2 mt-2">
              {selectedCities.map((cid) => {
                const city = Object.values(stateCities).flat().find((c) => c.id === cid);
                return (
                  <Badge key={cid} variant="outline" className="px-3 py-1 flex items-center gap-1">
                    {city?.name || cid}
                    <X className="w-3 h-3 cursor-pointer" onClick={() => setSelectedCities((p) => p.filter((id) => id !== cid))} />
                  </Badge>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-semibold text-gray-900">Service Categories</h3>
              <p className="text-sm text-gray-600">Select sub category and micro category (up to {coverageLimits.categories}).</p>
            </div>
          </div>
          <Button variant="outline" onClick={addCategory} disabled={!selectedMicroCategoryId || savingCategory || preferredCategories.length >= coverageLimits.categories}>
            {savingCategory ? 'Saving...' : 'Add'}
          </Button>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <input
              type="text"
              value={categoryQuery}
              onChange={(e) => {
                setCategoryQuery(e.target.value);
                setCategoryHint('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && catSuggestions.length) {
                  e.preventDefault();
                  applySearchSelection(catSuggestions[0]);
                }
              }}
              onFocus={() => {
                if (catSuggestions.length) setShowCatDropdown(true);
              }}
              onBlur={() => setTimeout(() => setShowCatDropdown(false), 150)}
              placeholder="Type micro or sub category (auto select)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
            />
            {categoryHint && (
              <p className="mt-1 text-xs text-amber-600">{categoryHint}</p>
            )}
            {showCatDropdown && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow">
                {catLoading && (
                  <div className="px-3 py-2 text-sm text-gray-500">Searching...</div>
                )}
                {!catLoading && catSuggestions.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
                )}
                {!catLoading && catSuggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-gray-50"
                    onMouseDown={() => applySearchSelection(item)}
                  >
                    <div className="text-sm font-medium text-gray-900">{item.name}</div>
                    <div className="text-xs text-gray-500">
                      {item.type === 'micro' ? 'Micro' : 'Sub'} • {item.sub_name || item.name} • {item.head_name || 'Head'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            value={selectedSubCategoryId}
            onChange={(e) => handleSubCategoryChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
            disabled={subCategories.length === 0}
          >
            <option value="">Select a sub category</option>
            {subCategories.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>
          <select
            value={selectedMicroCategoryId}
            onChange={(e) => handleMicroChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
            disabled={preferredCategories.length >= coverageLimits.categories || microCategories.length === 0 || !selectedSubCategoryId}
          >
            <option value="">Select a micro category</option>
            {microCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {preferredCategories.length === 0 ? (
            <p className="text-sm text-gray-500">No categories selected yet.</p>
          ) : (
            preferredCategories.map((catId) => {
              const micro = microCategoryLookup[catId];
              const catName = micro
                ? `${micro.sub_categories?.name || 'Sub'} > ${micro.name}`
                : catId;
              return (
                <Badge key={catId} variant="secondary" className="flex items-center gap-2 px-3 py-1">
                  {catName}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => removeCategory(catId)} />
                </Badge>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
};

export default CoverageSettings;
