import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, MapPin, ArrowLeft } from 'lucide-react';

const CitiesPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [cities, setCities] = useState([]);
  const [statesMap, setStatesMap] = useState({});
  const [q, setQ] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Load states first (so we can show the state name without relying on FK join names)
        const { data: statesData, error: statesErr } = await supabase
          .from('states')
          .select('id, name, slug')
          .eq('is_active', true)
          .order('name');

        if (statesErr) throw statesErr;
        const map = {};
        (statesData || []).forEach((s) => {
          map[s.id] = s;
        });
        setStatesMap(map);

        // Load all active cities
        const { data: citiesData, error: citiesErr } = await supabase
          .from('cities')
          .select('id, name, slug, supplier_count, state_id')
          .eq('is_active', true)
          .order('supplier_count', { ascending: false })
          .order('name');

        if (citiesErr) throw citiesErr;
        setCities(citiesData || []);
      } catch (e) {
        console.error('Failed to load cities', e);
        setCities([]);
        setStatesMap({});
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const filtered = useMemo(() => {
    const query = (q || '').trim().toLowerCase();
    if (!query) return cities;

    return (cities || []).filter((c) => {
      const stateName = statesMap?.[c.state_id]?.name || '';
      return (
        String(c.name || '').toLowerCase().includes(query) ||
        String(stateName).toLowerCase().includes(query)
      );
    });
  }, [cities, q, statesMap]);

  return (
    <>
      <Helmet>
        <title>All Cities | IndianTradeMart</title>
        <meta
          name="description"
          content="Browse suppliers by city on IndianTradeMart."
        />
      </Helmet>

      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                className="px-2"
                onClick={() => navigate(-1)}
                title="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900">All Cities</h1>
                <p className="text-sm text-slate-500 mt-1">Choose a city to explore suppliers and products.</p>
              </div>
            </div>

            <div className="mt-5 max-w-xl">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search city or state (e.g. Noida, Uttar Pradesh)"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="container mx-auto px-4 py-10">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-600">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading cities...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-lg font-semibold text-slate-900">No cities found</div>
              <p className="text-slate-500 mt-1">Try a different search.</p>
              <div className="mt-6">
                <Link
                  to="/directory"
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 font-semibold"
                >
                  Browse Directory
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {filtered.map((city) => {
                const state = statesMap?.[city.state_id];
                return (
                  <button
                    key={city.id}
                    type="button"
                    onClick={() => navigate(`/directory/city/${city.slug}`)}
                    className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-blue-500 transition-all"
                    title={city.name}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">{city.name}</div>
                        <div className="text-xs text-slate-500 mt-1 truncate">
                          {state?.name || '—'}
                        </div>
                      </div>
                      <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    </div>
                    {Number(city.supplier_count || 0) > 0 && (
                      <div className="text-xs text-slate-600 mt-3">
                        {Number(city.supplier_count || 0).toLocaleString('en-IN')} suppliers
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CitiesPage;
