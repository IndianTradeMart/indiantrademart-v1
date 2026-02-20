
import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { categoryApi } from '@/modules/directory/services/categoryApi';
import { directoryApi } from '@/modules/directory/api/directoryApi';
import { supabase } from '@/lib/customSupabaseClient';
import PillBreadcrumbs from '@/shared/components/PillBreadcrumbs';
import SearchResultsList from '@/modules/directory/components/SearchResultsList';
import { Loader2, Folder, ArrowRight, MapPin, Home, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DynamicCategory = () => {
  const { fullSlug, slug: urlSlug } = useParams();
  const slug = fullSlug || urlSlug;
  const navigate = useNavigate();
  const [category, setCategory] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState(null);
  const [city, setCity] = useState(null);
  const [isLocationBased, setIsLocationBased] = useState(false);

  // Parse slug to extract service slug and location
  const parseSlug = (slug) => {
    const parts = slug.split('-in-');
    if (parts.length === 2) {
      return {
        serviceSlug: parts[0],
        location: parts[1].replace(/-/g, ' '),
        isLocation: true
      };
    }
    return { serviceSlug: slug, location: null, isLocation: false };
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { serviceSlug, location, isLocation } = parseSlug(slug);

      // Check if this is a location-based search
      if (isLocation) {
        setIsLocationBased(true);
        console.log('Location-based search:', { serviceSlug, location });
        
        // Fetch micro-category by slug
        const micro = await directoryApi.getMicroCategoryBySlug(serviceSlug);
        console.log('Fetched micro-category:', micro);
        if (micro) {
          setCategory(micro);

          // Match location to state or city
          let stateId = null, cityId = null;
          
          // Search in states
          const { data: states } = await supabase
            .from('states')
            .select('id, name, slug')
            .ilike('name', `%${location}%`);
          
          if (states && states.length > 0) {
            stateId = states[0].id;
            setState(states[0]);
          }
          
          // Also search in cities
          const { data: cities } = await supabase
            .from('cities')
            .select('id, name, slug, state_id')
            .ilike('name', `%${location}%`);
          
          if (cities && cities.length > 0) {
            cityId = cities[0].id;
            stateId = cities[0].state_id;
            setCity(cities[0]);
          }

          // Fetch products
          const result = await directoryApi.getProductsByMicroAndLocation({
            microSlug: serviceSlug,
            stateId,
            cityId
          });
          
          setProducts(result.data || []);
        }
      } else {
        // Original behavior for non-location based requests
        const catData = await categoryApi.getCategoryBySlug(slug);
        if (catData) {
          setCategory(catData);
        }
      }
      setLoading(false);
    };

    if (slug) fetchData();
  }, [slug]);

  if (loading) {
     return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#00A699]" /></div>;
  }

  if (!category) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
            <h2 className="text-2xl font-bold mb-4">Service Not Found</h2>
            <Button onClick={() => navigate('/directory')}>Browse Directory</Button>
        </div>
    );
  }

  const locationName = city?.name || state?.name;
  const pageTitle = `${category.meta_tags || category.name}${locationName ? ' in ' + locationName : ''}`;
  const pageDescription = category.meta_description || category.name;
  const pageKeywords =
    category.keywords ||
    category.meta_keywords ||
    category.meta_tags ||
    `${category.name}, suppliers, manufacturers, IndianTradeMart`;

  const hasChildren = children && children.length > 0;

  return (
    <>
      <Helmet>
        <title>{pageTitle} | IndianTradeMart</title>
        <meta name="description" content={pageDescription} />
        <meta name="keywords" content={pageKeywords} />
      </Helmet>

      <div className="min-h-screen bg-gray-50">
        {/* Breadcrumb and Header */}
        <div className="bg-white border-b py-6">
          <div className="container mx-auto px-4">
            {isLocationBased ? (
              <>
                <nav className="flex text-sm text-gray-500 items-center flex-wrap mb-4">
                  <Link to="/directory" className="hover:text-blue-700 flex items-center">
                    <Home className="w-3 h-3 mr-1" /> Directory
                  </Link>
                  <ChevronRight className="w-4 h-4 mx-2" />
                  <span className="font-semibold text-gray-900">{category.name}</span>
                  {locationName && (
                    <>
                      <ChevronRight className="w-4 h-4 mx-2" />
                      <span className="text-gray-900 flex items-center">
                        <MapPin className="w-3 h-3 mr-1" /> {locationName}
                      </span>
                    </>
                  )}
                </nav>
                <h1 className="text-3xl md:text-4xl font-bold mb-2 text-gray-900">
                  {category.meta_tags || category.name}
                  {locationName && <span className="text-2xl text-gray-600"> in {locationName}</span>}
                </h1>
                {category.meta_description && (
                  <p className="text-gray-700 max-w-3xl mt-3 leading-relaxed">
                    {category.meta_description}
                  </p>
                )}
              </>
            ) : (
              <>
                <PillBreadcrumbs className="mb-4" />
                <h1 className="text-3xl md:text-4xl font-bold mb-2 text-gray-900">
                  {category.name}
                </h1>
                <p className="text-gray-500 text-lg">
                  {hasChildren ? `Select a ${category.type === 'HEAD' ? 'sub-category' : 'micro-category'}` : `Browse verified suppliers & products`}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Content Section */}
        <div className="container mx-auto px-4 py-8">
          {isLocationBased ? (
            /* Location-based product listing */
            products.length > 0 ? (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">
                    Available {category.name} Services
                    {locationName && <span> in {locationName}</span>}
                  </h2>
                  <p className="text-gray-600 mt-2">
                    Showing {products.length} service provider{products.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {products.map((product) => (
                    <Link
                      key={product.id}
                      to={`/p/${product.slug}`}
                      className="bg-white rounded-lg border hover:border-blue-500 hover:shadow-lg transition-all group overflow-hidden"
                    >
                      <div className="aspect-square bg-gray-100 overflow-hidden">
                        {product.images && product.images[0] && (
                          <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-bold text-gray-900 mb-2 line-clamp-2 group-hover:text-blue-600">
                          {product.name}
                        </h3>
                        <p className="text-sm text-gray-600 mb-3">
                          {product.vendors?.company_name}
                        </p>
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-lg text-blue-600">₹{product.price}</span>
                          <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700">
                            {product.price_unit}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">
                  No {category.name} services found
                  {locationName && <span> in {locationName}</span>}
                </p>
              </div>
            )
          ) : (
            /* Original category listing */
            hasChildren ? (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {children.map(child => (
                  <Link 
                    key={child.id} 
                    to={`/categories/${child.slug}`}
                    className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-[#00A699] transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Folder className="w-5 h-5 text-[#00A699]" />
                        <span className="font-medium text-gray-800">{child.name}</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[#00A699]" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <SearchResultsList 
                filters={{ priceRange: [0, 1000000], rating: 0, verified: false, inStock: false }} 
                query="" 
                city="" 
                category={category.name} 
              />
            )
          )}
        </div>
      </div>
    </>
  );
};

export default DynamicCategory;
