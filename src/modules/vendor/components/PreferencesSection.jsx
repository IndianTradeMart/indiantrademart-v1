import React, { useEffect, useState } from 'react';
import { vendorApi } from '@/modules/vendor/services/vendorApi';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { Loader2, X, Save } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';

const PreferencesSection = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState({
    preferred_micro_categories: [],
    preferred_states: [],
    preferred_cities: [],
    min_budget: 0,
    max_budget: 999999,
    auto_lead_filter: true
  });

  const [allStates, setAllStates] = useState([]);
  const [allCities, setAllCities] = useState([]);
  const [allHeadCategories, setAllHeadCategories] = useState([]);

  const [selectedStateId, setSelectedStateId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedCityId, setSelectedCityId] = useState('');
  const MAX_STATES = 6;
  const MAX_CITIES = 6;
  const MAX_CATEGORIES = 5;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load states from database
      const { data: states, error: statesError } = await supabase
        .from('states')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (statesError) throw statesError;
      setAllStates(states || []);
      console.log('States loaded:', states);

      // Load head categories from database
      try {
        const { data: headCategories, error: categoriesError } = await supabase
          .from('head_categories')
          .select('id, name')
          .eq('is_active', true)
          .order('name');

        if (categoriesError) {
          console.error('Error loading head categories:', categoriesError);
          setAllHeadCategories([]);
        } else {
          setAllHeadCategories(headCategories || []);
          console.log('Head categories loaded:', headCategories);
        }
      } catch (catError) {
        console.error('Error loading head categories:', catError);
        setAllHeadCategories([]);
      }

      // Load user preferences
      try {
        const prefs = await vendorApi.preferences.get();
        console.log('Preferences loaded:', prefs);
        setPreferences(prefs);

        // Load cities for first selected state
        if (prefs.preferred_states?.length > 0) {
          try {
            const cities = await vendorApi.locations.getCities(prefs.preferred_states[0]);
            setAllCities(cities || []);
            console.log('Cities loaded for state:', prefs.preferred_states[0]);
          } catch (e) {
            console.error('Error loading cities:', e);
          }
        } else if (states && states.length > 0) {
          // Auto-load cities for first state if no preferences exist
          try {
            const cities = await vendorApi.locations.getCities(states[0].id);
            setAllCities(cities || []);
            setSelectedStateId(states[0].id);
            console.log('Auto-loaded cities for first state');
          } catch (e) {
            console.error('Error auto-loading cities:', e);
          }
        }
      } catch (prefsError) {
        console.error('Error loading preferences:', prefsError);
        // Set default preferences
        setPreferences({
          preferred_micro_categories: [],
          preferred_states: [],
          preferred_cities: [],
          min_budget: 0,
          max_budget: 999999,
          auto_lead_filter: true
        });
      }
    } catch (e) {
      console.error('Error loading preferences data:', e);
      toast({
        title: 'Error loading preferences',
        description: e?.message || 'Something went wrong',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddState = async () => {
    if (!selectedStateId) return;
    if (preferences.preferred_states.includes(selectedStateId)) {
      toast({ title: 'Already added', variant: 'destructive' });
      return;
    }
    if (preferences.preferred_states.length >= MAX_STATES) {
      toast({ title: `Maximum ${MAX_STATES} states allowed`, variant: 'destructive' });
      return;
    }

    // Load cities for this state
    try {
      const cities = await vendorApi.locations.getCities(selectedStateId);
      setAllCities(cities || []);
    } catch (e) {
      console.error('Error loading cities:', e);
    }

    setPreferences(prev => ({
      ...prev,
      preferred_states: [...prev.preferred_states, selectedStateId]
    }));
    setSelectedStateId('');
  };

  const handleAddCity = async () => {
    if (!selectedCityId) return;
    if (preferences.preferred_cities.includes(selectedCityId)) {
      toast({ title: 'Already added', variant: 'destructive' });
      return;
    }
    if (preferences.preferred_cities.length >= MAX_CITIES) {
      toast({ title: `Maximum ${MAX_CITIES} cities allowed`, variant: 'destructive' });
      return;
    }

    setPreferences(prev => ({
      ...prev,
      preferred_cities: [...prev.preferred_cities, selectedCityId]
    }));
    setSelectedCityId('');
  };

  const handleAddCategory = async () => {
    if (!selectedCategoryId) return;
    if (preferences.preferred_micro_categories.includes(selectedCategoryId)) {
      toast({ title: 'Already added', variant: 'destructive' });
      return;
    }
    if (preferences.preferred_micro_categories.length >= MAX_CATEGORIES) {
      toast({ title: `Maximum ${MAX_CATEGORIES} categories allowed`, variant: 'destructive' });
      return;
    }

    setPreferences(prev => ({
      ...prev,
      preferred_micro_categories: [...prev.preferred_micro_categories, selectedCategoryId]
    }));
    setSelectedCategoryId('');
  };

  const handleRemoveState = (id) => {
    setPreferences(prev => ({
      ...prev,
      preferred_states: prev.preferred_states.filter(s => s !== id)
    }));
  };

  const handleRemoveCity = (id) => {
    setPreferences(prev => ({
      ...prev,
      preferred_cities: prev.preferred_cities.filter(c => c !== id)
    }));
  };

  const handleRemoveCategory = (id) => {
    setPreferences(prev => ({
      ...prev,
      preferred_micro_categories: prev.preferred_micro_categories.filter(c => c !== id)
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await vendorApi.preferences.update(preferences);
      toast({
        title: 'Preferences Updated',
        className: 'bg-green-50 text-green-900 border-green-200'
      });
    } catch (e) {
      console.error(e);
      toast({
        title: 'Update Failed',
        description: e?.message,
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  // Removed getCategoryName - now using inline rendering for all lists

  return (
    <div className="space-y-6">
      {/* States */}
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Preferred States (Max {MAX_STATES})</h3>
            <p className="text-sm text-gray-500 mb-4">Select up to {MAX_STATES} states where you operate or want to receive leads from</p>
          </div>

          <div className="flex gap-2">
            <select
              value={selectedStateId}
              onChange={(e) => {
                setSelectedStateId(e.target.value);
                // Auto load cities when state is selected
                if (e.target.value) {
                  vendorApi.locations.getCities(e.target.value).then(cities => {
                    setAllCities(cities || []);
                  }).catch(err => console.error('Error loading cities:', err));
                }
              }}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
              disabled={preferences.preferred_states.length >= MAX_STATES}
            >
              <option value="">Select a state</option>
              {allStates && allStates.length > 0 ? (
                allStates.map(state => (
                  <option key={state.id} value={state.id}>{state.name}</option>
                ))
              ) : (
                <option disabled>No states available</option>
              )}
            </select>
            <Button onClick={handleAddState} variant="outline" disabled={!selectedStateId || preferences.preferred_states.length >= MAX_STATES}>Add</Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {preferences.preferred_states.map(stateId => {
              const stateName = allStates.find(s => s.id === stateId)?.name || stateId;
              return (
                <Badge key={stateId} variant="secondary" className="flex items-center gap-2 px-3 py-1">
                  {stateName}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => handleRemoveState(stateId)} />
                </Badge>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Cities */}
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Preferred Cities (Max {MAX_CITIES})</h3>
            <p className="text-sm text-gray-500 mb-4">Select up to {MAX_CITIES} cities for more targeted leads</p>
          </div>

          <div className="flex gap-2">
            <select
              value={selectedCityId}
              onChange={(e) => setSelectedCityId(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
              disabled={preferences.preferred_cities.length >= MAX_CITIES || allCities.length === 0}
            >
              <option value="">Select a city</option>
              {allCities && allCities.length > 0 ? (
                allCities.map(city => (
                  <option key={city.id} value={city.id}>{city.name}</option>
                ))
              ) : (
                <option disabled>No cities available - select a state first</option>
              )}
            </select>
            <Button onClick={handleAddCity} variant="outline" disabled={!selectedCityId || preferences.preferred_cities.length >= MAX_CITIES}>Add</Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {preferences.preferred_cities.map(cityId => {
              const cityName = allCities.find(c => c.id === cityId)?.name || cityId;
              return (
                <Badge key={cityId} variant="secondary" className="flex items-center gap-2 px-3 py-1">
                  {cityName}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => handleRemoveCity(cityId)} />
                </Badge>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Categories */}
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Product Categories (Max {MAX_CATEGORIES})</h3>
            <p className="text-sm text-gray-500 mb-4">Select up to {MAX_CATEGORIES} main categories your business deals in</p>
          </div>

          <div className="flex gap-2">
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
              disabled={preferences.preferred_micro_categories.length >= MAX_CATEGORIES}
            >
              <option value="">Select a category</option>
              {allHeadCategories && allHeadCategories.length > 0 ? (
                allHeadCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))
              ) : (
                <option disabled>No categories available</option>
              )}
            </select>
            <Button onClick={handleAddCategory} variant="outline" disabled={!selectedCategoryId || preferences.preferred_micro_categories.length >= MAX_CATEGORIES}>Add</Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {preferences.preferred_micro_categories.map(catId => {
              const catName = allHeadCategories.find(c => c.id === catId)?.name || catId;
              return (
                <Badge key={catId} variant="secondary" className="flex items-center gap-2 px-3 py-1">
                  {catName}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => handleRemoveCategory(catId)} />
                </Badge>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Budget Range */}
      <Card className="p-6">
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">Budget Range (₹)</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Minimum Budget</Label>
              <Input
                type="number"
                value={preferences.min_budget}
                onChange={(e) => setPreferences(prev => ({ ...prev, min_budget: parseInt(e.target.value) || 0 }))}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Maximum Budget</Label>
              <Input
                type="number"
                value={preferences.max_budget}
                onChange={(e) => setPreferences(prev => ({ ...prev, max_budget: parseInt(e.target.value) || 999999 }))}
                placeholder="999999"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Auto Filter */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Auto Lead Filter</h3>
            <p className="text-sm text-gray-500">Automatically filter leads based on your preferences</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.auto_lead_filter}
              onChange={(e) => setPreferences(prev => ({ ...prev, auto_lead_filter: e.target.checked }))}
              className="w-5 h-5"
            />
          </label>
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#003D82] hover:bg-[#003D82]/90 flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Preferences'}
        </Button>
      </div>
    </div>
  );
};

export default PreferencesSection;
