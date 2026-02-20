import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2, MapPin, ArrowLeft, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import DirectorySearchBar from '@/modules/directory/components/DirectorySearchBar';
import { vendorService } from '@/modules/directory/services/vendorService';
import Card from '@/shared/components/Card';

const CityPage = () => {
  const navigate = useNavigate();
  const { citySlug } = useParams();
  const normalizedCitySlug = String(citySlug || '').toLowerCase();

  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState(null);
  const [state, setState] = useState(null);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [vendors, setVendors] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data: cityData, error: cityErr } = await supabase
          .from('cities')
          .select('id, name, slug, supplier_count, state_id')
          .eq('slug', normalizedCitySlug)
          .single();

        if (cityErr || !cityData) {
          setCity(null);
          setState(null);
          return;
        }

        setCity(cityData);

        if (cityData.state_id) {
          const { data: stateData } = await supabase
            .from('states')
            .select('id, name, slug')
            .eq('id', cityData.state_id)
            .single();
          setState(stateData || null);
        } else {
          setState(null);
        }
      } catch (e) {
        console.error('Failed to load city page', e);
        setCity(null);
        setState(null);
      } finally {
        setLoading(false);
      }
    };

    if (normalizedCitySlug) load();
  }, [normalizedCitySlug]);

  useEffect(() => {
    const loadVendors = async () => {
      if (!normalizedCitySlug) return;
      setVendorsLoading(true);
      try {
        const data = await vendorService.getVendorsByCity({
          citySlug: normalizedCitySlug,
          limit: 24,
          page: 1,
        });
        setVendors(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error('Failed to load city vendors', e);
        setVendors([]);
      } finally {
        setVendorsLoading(false);
      }
    };

    loadVendors();
  }, [normalizedCitySlug]);

  const VendorImage = ({ src, name }) => {
    const [failed, setFailed] = useState(false);
    const letter = String(name || 'S').trim().charAt(0).toUpperCase() || 'S';

    if (!src || failed) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-100 text-4xl font-extrabold text-slate-300">
          {letter}
        </div>
      );
    }

    return (
      <img
        src={src}
        alt={name}
        className="w-full h-full object-cover"
        onError={() => setFailed(true)}
        loading="lazy"
      />
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-600">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...
      </div>
    );
  }

  if (!city) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">
        <div className="text-2xl font-bold text-slate-900">City not found</div>
        <p className="text-slate-600 mt-2">Please choose a city from the list.</p>
        <div className="mt-6 flex gap-3">
          <Link
            to="/directory/cities"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 font-semibold"
          >
            Browse Cities
          </Link>
          <Link
            to="/directory"
            className="inline-flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:border-blue-500 text-slate-800 px-5 py-2.5 font-semibold"
          >
            Browse Directory
          </Link>
        </div>
      </div>
    );
  }

  const title = `${city.name}${state?.name ? `, ${state.name}` : ''} Suppliers | IndianTradeMart`;
  const desc = `Find suppliers and products in ${city.name}${state?.name ? `, ${state.name}` : ''} on IndianTradeMart.`;

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={desc} />
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

              <div className="min-w-0">
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                  <MapPin className="w-4 h-4" />
                  <Link to="/directory" className="hover:text-blue-700">IndianTradeMart</Link>
                  <span>/</span>
                  <Link to="/directory/cities" className="hover:text-blue-700">Cities</Link>
                </div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 truncate mt-1">
                  Suppliers in {city.name}{state?.name ? `, ${state.name}` : ''}
                </h1>
                {Number(city.supplier_count || 0) > 0 && (
                  <p className="text-sm text-slate-600 mt-1">
                    {Number(city.supplier_count || 0).toLocaleString('en-IN')} suppliers available
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 max-w-4xl">
              {/* Pre-fill location so user can search any service inside this city */}
              <DirectorySearchBar
                enableSuggestions
                initialState={state?.slug || ''}
                initialCity={city.slug}
                className="shadow-sm"
              />
              <p className="text-xs text-slate-500 mt-2">
                Tip: Type a product/service and hit search to see results filtered for this city.
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="container mx-auto px-4 py-10">
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              Suppliers in {city.name}
            </h2>

            {vendorsLoading ? (
              <div className="text-sm text-slate-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading suppliers...
              </div>
            ) : vendors.length === 0 ? (
              <div className="text-sm text-slate-500">
                No suppliers found for this city. Try searching a product/service above.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {vendors.map((vendor) => (
                  <Card
                    key={vendor.id}
                    className="hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => navigate(`/directory/vendor/${vendor.id}`)}
                  >
                    <Card.Content className="p-0">
                      <div className="h-40 bg-slate-100 relative overflow-hidden">
                        <VendorImage src={vendor.image} name={vendor.name} />
                        {vendor.verified && (
                          <span className="absolute top-2 right-2 bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full flex items-center">
                            <ShieldCheck className="w-3 h-3 mr-1" /> Verified
                          </span>
                        )}
                      </div>

                      <div className="p-5">
                        <h3 className="font-bold text-lg mb-1">{vendor.name}</h3>

                        <div className="flex items-center text-sm text-slate-500 mb-3">
                          <MapPin className="w-4 h-4 mr-1" />
                          {vendor.city || '-'}
                          {vendor.state ? `, ${vendor.state}` : ''}
                        </div>

                        {vendor.description && (
                          <p className="text-sm text-slate-600 mb-4 line-clamp-2">{vendor.description}</p>
                        )}

                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/directory/vendor/${vendor.id}`);
                          }}
                        >
                          View Profile
                        </Button>
                      </div>
                    </Card.Content>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="text-lg font-semibold text-slate-900">What next?</div>
            <ul className="mt-3 text-sm text-slate-600 space-y-2 list-disc list-inside">
              <li>Use the search box above to find suppliers by product/service in this city.</li>
              <li>Or browse industries from the directory page and then apply location using the search bar.</li>
            </ul>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/directory"
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 font-semibold"
              >
                Browse Industries
              </Link>
              <Link
                to="/directory/cities"
                className="inline-flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:border-blue-500 text-slate-800 px-5 py-2.5 font-semibold"
              >
                View All Cities
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default CityPage;
