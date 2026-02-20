import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { BadgeCheck, MapPin, Send, Star, Phone, Globe, Building2, User, MessageSquare, Wrench } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Card from '@/shared/components/Card';
import { Badge } from '@/shared/components/Badge';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';
import { toast } from '@/components/ui/use-toast';

// Internal Mock Data to ensure page is never blank
const FALLBACK_VENDORS = [
  {
    id: '1',
    company_name: "Aggarwal Enterprises",
    name: "Rajesh Aggarwal",
    city: "New Delhi",
    state: "Delhi",
    rating: 4.5,
    reviews: 124,
    verified: true,
    description: "Leading supplier of industrial construction materials with over 20 years of experience. We specialize in steel, cement, and safety equipment.",
    primary_business_type: "Manufacturer, Supplier",
    annual_turnover: "₹5-10 Cr",
    phone: "+91-9876543210",
    email: "contact@aggarwal.com",
    address: "Plot 45, Okhla Industrial Area, Phase III",
    established: "1998"
  },
  {
     id: '2',
     company_name: "Tech Solutions Pvt Ltd",
    city: "Mumbai",
    state: "Maharashtra",
    verified: true,
    rating: 4.8,
    reviews: 89,
    primary_business_type: "IT Services",
    description: "Technology solutions company offering cloud services, custom software, and IT consulting.",
    annual_turnover: "₹1-5 Cr"
  }
];

const FALLBACK_PRODUCTS = [
  { id: 101, name: "Industrial Safety Shoes", price: "₹850", category: "Safety Gear", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=300&q=80" },
  { id: 102, name: "High Grade Cement (50kg)", price: "₹380", category: "Construction", image: "https://images.unsplash.com/photo-1518709414768-a8c55406a779?auto=format&fit=crop&w=300&q=80" },
  { id: 103, name: "Steel TMT Bars", price: "₹45,000/ton", category: "Raw Material", image: "https://images.unsplash.com/photo-1535813547-99c456a41d4a?auto=format&fit=crop&w=300&q=80" },
  { id: 104, name: "Safety Helmets", price: "₹120", category: "Safety Gear", image: "https://images.unsplash.com/photo-1595166661134-8c8a164b1d6f?auto=format&fit=crop&w=300&q=80" },
];

const FALLBACK_SERVICE_IMAGE = "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=800&q=80";

class VendorProfileErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[VendorProfile] render error:', error, info);
    if (typeof window !== 'undefined') {
      window.__vendorProfileError = { error, info };
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Card>
            <Card.Content className="p-6 text-center text-gray-600 space-y-3">
              <div className="text-lg font-semibold text-gray-900">Something went wrong</div>
              <p>Vendor profile could not load. Please refresh the page.</p>
              {this.state.error && (
                <pre className="text-xs text-gray-500 break-all whitespace-pre-wrap text-left bg-gray-50 border rounded p-3">
                  {String(this.state.error?.message || this.state.error)}
                </pre>
              )}
              <Button variant="outline" onClick={() => window.location.reload()}>
                Reload
              </Button>
            </Card.Content>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

// Mask phone number to show only first 2 and last 2 digits
const maskPhoneNumber = (phone) => {
  if (!phone) return '+91-XXXXXXXXXX';
  const cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.length < 4) return '+91-XXXXXXXXXX';
  return '+91' + cleaned.slice(0, 2) + 'XXXXXXXX' + cleaned.slice(-2);
};

const VendorProfileContent = () => {
  const { vendorId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, userRole } = useAuth();
  const isBuyer = userRole === 'BUYER' && !!user;

  // ✅ Favorites (buyer)
  const [isFavorite, setIsFavorite] = useState(false);
  const [favLoading, setFavLoading] = useState(false);

  const [vendor, setVendor] = useState(null);
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [serviceCategories, setServiceCategories] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'products');
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [selectedCollectionKey, setSelectedCollectionKey] = useState('');
  const [showAllServiceCollections, setShowAllServiceCollections] = useState(false);

  useEffect(() => {
    // Fetch vendor data from backend APIs
    const fetchVendor = async () => {
      setLoading(true);
      try {
        const vendorRes = await fetchWithCsrf(apiUrl(`/api/vendors/${vendorId}`));
        if (!vendorRes.ok) throw new Error('Vendor not found');
        const vendorJson = await vendorRes.json();
        const vendorData = vendorJson?.vendor;

        if (vendorData) {
          setVendor({
            id: vendorData.id,
            company_name: vendorData.company_name,
            name: vendorData.owner_name || vendorData.first_name,
            city: vendorData.city,
            state: vendorData.state,
            rating: vendorData.seller_rating || 4.0,
            reviews: 0,
            verified: vendorData.verification_badge || vendorData.is_verified || false,
            primary_business_type: vendorData.primary_business_type,
            description: vendorData.description || vendorData.business_description || vendorData.primary_business_type || "Established business",
            phone: vendorData.phone || "+91-XXXXXXXXXX",
            address: vendorData.registered_address || vendorData.address || "Address available on request",
            established: vendorData.year_of_establishment || "2020",
            gst: vendorData.gst_number,
            email: vendorData.email,
            website: vendorData.website_url,
            profile_image: vendorData.profile_image,
            annual_turnover: vendorData.annual_turnover || vendorData.annualTurnover
          });

          const [productsRes, servicesRes, categoriesRes] = await Promise.all([
            fetchWithCsrf(apiUrl(`/api/vendors/${vendorId}/products`)),
            fetchWithCsrf(apiUrl(`/api/vendors/${vendorId}/services`)),
            fetchWithCsrf(apiUrl(`/api/vendors/${vendorId}/service-categories`)),
          ]);

          if (productsRes.ok) {
            const productsJson = await productsRes.json();
            setProducts(productsJson?.products || []);
          } else {
            setProducts([]);
          }
          setShowAllProducts(false);

          if (servicesRes.ok) {
            const servicesJson = await servicesRes.json();
            setServices(servicesJson?.services || []);
          } else {
            setServices([]);
          }

          if (categoriesRes.ok) {
            const categoriesJson = await categoriesRes.json();
            setServiceCategories(categoriesJson?.categories || []);
          } else {
            setServiceCategories([]);
          }
        } else {
          setVendor(FALLBACK_VENDORS[0]);
          setProducts([]);
          setServices([]);
          setServiceCategories([]);
          setShowAllProducts(false);
        }
      } catch (e) {
        console.error("Vendor fetch failed", e);
        setVendor(FALLBACK_VENDORS[0]);
        setProducts([]);
        setServices([]);
        setServiceCategories([]);
        setShowAllProducts(false);
      } finally {
        setLoading(false);
      }
    };

    if (vendorId) {
      fetchVendor();
    }
  }, [vendorId]);

  // ✅ Load favorite status
  useEffect(() => {
    const loadFavoriteStatus = async () => {
      if (!isBuyer || !user?.id || !vendorId) return;

      try {
        const res = await fetchWithCsrf(apiUrl(`/api/vendors/${vendorId}/favorite`));
        if (!res.ok) return;
        const data = await res.json();
        setIsFavorite(!!data?.isFavorite);
      } catch (e) {
        console.warn('[VendorProfile] favorite status load failed:', e);
      }
    };

    loadFavoriteStatus();
  }, [vendorId, isBuyer, user?.id]);

  const toggleFavorite = async () => {
    if (!isBuyer) {
      toast({ title: 'Login required', description: 'Please login as Buyer to add favorites.' });
      navigate('/buyer/login');
      return;
    }

    if (!vendorId || favLoading) return;
    setFavLoading(true);

    try {
      if (isFavorite) {
        const res = await fetchWithCsrf(apiUrl(`/api/vendors/${vendorId}/favorite`), {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to remove favorite');

        setIsFavorite(false);
        toast({ title: 'Removed from Favorites' });
      } else {
        const res = await fetchWithCsrf(apiUrl(`/api/vendors/${vendorId}/favorite`), {
          method: 'POST',
        });
        if (!res.ok) throw new Error('Failed to add favorite');

        setIsFavorite(true);
        toast({ title: 'Added to Favorites' });
      }
    } catch (e) {
      console.error('Favorite toggle error:', e);
      toast({ title: 'Failed', description: 'Could not update favorite. Try again.' });
    } finally {
      setFavLoading(false);
    }
  };

  // Load leads submitted by buyer to this vendor
  useEffect(() => {
    const loadLeads = async () => {
      if (!isBuyer || !user?.id) return;

      try {
        const res = await fetchWithCsrf(apiUrl(`/api/vendors/${vendorId}/leads`));
        if (!res.ok) return;
        const data = await res.json();
        if (data?.leads) setLeads(data.leads);
      } catch (error) {
        console.error('Error loading leads:', error);
      }
    };

    loadLeads();
  }, [vendorId, isBuyer, user]);

  // Always use fallback if no vendor, but not for products
  const displayVendor = vendor || FALLBACK_VENDORS[0];
  const displayProducts = Array.isArray(products) ? products : [];
  const displayServices = Array.isArray(services) ? services : [];
  const visibleProducts = showAllProducts ? displayProducts : displayProducts.slice(0, 6);
  const groupedCollections = useMemo(() => {
    try {
      const groups = {};
      (displayProducts || []).forEach((product) => {
        const head = String(product?.head_category_name || 'Other Category');
        const sub = String(product?.sub_category_name || 'Other Subcategory');
        if (!groups[head]) groups[head] = {};
        if (!groups[head][sub]) groups[head][sub] = [];
        groups[head][sub].push(product);
      });
      return groups;
    } catch (e) {
      console.error('[VendorProfile] product grouping failed:', e);
      return {};
    }
  }, [displayProducts]);
  const hasCollections = Object.keys(groupedCollections || {}).length > 0;
  const collectionList = useMemo(() => {
    const list = [];
    Object.entries(groupedCollections || {}).forEach(([headName, subGroups]) => {
      const safeSubGroups = subGroups && typeof subGroups === 'object' ? subGroups : {};
      Object.entries(safeSubGroups).forEach(([subName, items]) => {
        const key = `${headName}|||${subName}`;
        list.push({
          key,
          headName,
          subName,
          items: Array.isArray(items) ? items : []
        });
      });
    });
    return list.sort((a, b) => String(a.subName).localeCompare(String(b.subName)));
  }, [groupedCollections]);
  const selectedCollection = collectionList.find((c) => c.key === selectedCollectionKey) || null;
  const visibleCollections = showAllServiceCollections ? collectionList : collectionList.slice(0, 6);

  const handleEnquire = (product) => {
    const vendorName = encodeURIComponent(displayVendor?.company_name || '');
    const productName = encodeURIComponent(product?.name || '');
    if (isBuyer) {
      navigate(`/buyer/proposals/new?vendorId=${displayVendor.id}&vendorName=${vendorName}&productName=${productName}`);
    } else {
      navigate('/buyer/login');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-64 w-full rounded-xl" />
        <div className="grid grid-cols-4 gap-6">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl font-sans">

      {/* Hero / Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <div className="bg-[#003D82] h-24 w-full"></div>
        <div className="px-8 pb-8">
          <div className="relative flex flex-col md:flex-row justify-between items-start -mt-10">
            <div className="flex gap-6 items-end">
              <div className="h-24 w-24 rounded-lg bg-white p-1 shadow-md border border-gray-100 overflow-hidden">
                {displayVendor.profile_image ? (
                  <img src={displayVendor.profile_image} alt={displayVendor.company_name} className="h-full w-full object-cover rounded" />
                ) : (
                  <div className="h-full w-full bg-gray-100 rounded flex items-center justify-center text-2xl font-bold text-[#003D82]">
                    {displayVendor.company_name?.charAt(0) || 'V'}
                  </div>
                )}
              </div>
              <div className="pb-1">
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                  {displayVendor.company_name || 'Company Name'}
                  {displayVendor.verified && <BadgeCheck className="text-blue-500 h-6 w-6 fill-blue-50" />}
                </h1>
                <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                  <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {displayVendor.city || 'City'}{displayVendor.state ? `, ${displayVendor.state}` : ''}</span>
                  <span className="flex items-center gap-1"><Star className="h-4 w-4 text-orange-400 fill-orange-400" /> {displayVendor.rating || 4.0} ({displayVendor.reviews || 0} Reviews)</span>
                </div>
              </div>
            </div>

            {/* ✅ ACTIONS */}
            <div className="mt-6 md:mt-0 flex gap-3">
              {/* ✅ Favorite Button */}
              <Button
                variant="outline"
                className={`border-gray-300 ${isFavorite ? 'bg-yellow-50' : ''}`}
                onClick={toggleFavorite}
                disabled={favLoading}
                title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Star
                  className={`h-4 w-4 mr-2 ${isFavorite ? 'text-yellow-500' : ''}`}
                  fill={isFavorite ? 'currentColor' : 'none'}
                />
                {isFavorite ? 'Favorited' : 'Add Favorite'}
              </Button>

              <Button variant="outline" className="border-gray-300">
                <Phone className="h-4 w-4 mr-2" /> View Number
              </Button>

              <Button
                className="bg-[#00A699] hover:bg-[#008c81]"
                onClick={() => {
                  if (isBuyer) navigate(`/buyer/proposals/new?vendorId=${displayVendor.id}&vendorName=${encodeURIComponent(displayVendor.company_name)}`);
                  else navigate('/buyer/login');
                }}
              >
                <Send className="h-4 w-4 mr-2" /> Send Enquiry
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content: Products & About */}
        <div className="lg:col-span-2 space-y-8">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start border-b rounded-none p-0 h-auto bg-transparent gap-6">
              <TabsTrigger value="products" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#00A699] data-[state=active]:shadow-none px-4 py-3 text-base">Products</TabsTrigger>
              <TabsTrigger value="services" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#00A699] data-[state=active]:shadow-none px-4 py-3 text-base">Services</TabsTrigger>
              <TabsTrigger value="about" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#00A699] data-[state=active]:shadow-none px-4 py-3 text-base">About Company</TabsTrigger>
              {isBuyer && <TabsTrigger value="my-leads" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#00A699] data-[state=active]:shadow-none px-4 py-3 text-base"><MessageSquare className="w-4 h-4 mr-2" />My Leads</TabsTrigger>}
              <TabsTrigger value="reviews" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#00A699] data-[state=active]:shadow-none px-4 py-3 text-base">Reviews</TabsTrigger>
            </TabsList>

            <TabsContent value="products" className="pt-6">
              {displayProducts && displayProducts.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visibleProducts.map(product => (
                      <Card key={product.id} className="overflow-hidden hover:shadow-md transition-shadow group cursor-pointer">
                        <div className="h-24 bg-gray-100 relative overflow-hidden">
                          <img
                            src={product.image || 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=300&q=80'}
                            alt={product.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                        <Card.Content className="p-2.5">
                          <Badge variant="outline" className="mb-1.5 text-[10px]">
                            {product.category}
                          </Badge>
                          <h3 className="font-semibold text-xs text-gray-900 mb-1 line-clamp-2">{product.name}</h3>
                          <div className="flex justify-between items-center mt-1.5">
                            <span className="font-semibold text-[#003D82] text-xs">{product.price}</span>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => handleEnquire(product)}
                            >
                              Enquire
                            </Button>
                          </div>
                        </Card.Content>
                      </Card>
                    ))}
                  </div>

                  {displayProducts.length > 6 && !showAllProducts && (
                    <div className="flex justify-center mt-6">
                      <Button variant="outline" onClick={() => setShowAllProducts(true)}>
                        View all products ({displayProducts.length})
                      </Button>
                    </div>
                  )}

                  {showAllProducts && displayProducts.length > 6 && (
                    <div className="flex justify-center mt-3">
                      <Button variant="ghost" onClick={() => setShowAllProducts(false)}>
                        Show fewer products
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <Card>
                  <Card.Content className="p-6 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-3">
                      <Globe className="h-12 w-12 text-gray-300" />
                      <p>No products available yet</p>
                    </div>
                  </Card.Content>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="services" className="pt-6">
              {hasCollections ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {visibleCollections.map((col) => {
                      const previewImage = col.items?.[0]?.image || 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=300&q=80';
                      return (
                        <Card
                          key={col.key}
                          className={`overflow-hidden hover:shadow-md transition-shadow cursor-pointer border ${selectedCollectionKey === col.key ? 'border-[#00A699]' : 'border-gray-200'}`}
                          onClick={() => setSelectedCollectionKey(col.key)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedCollectionKey(col.key);
                            }
                          }}
                        >
                          <div className="h-20 bg-gray-100 relative overflow-hidden">
                            <img src={previewImage} alt={col.subName} className="w-full h-full object-cover" />
                          </div>
                          <Card.Content className="p-2.5">
                            <div className="text-[11px] font-semibold text-gray-900 line-clamp-1">{col.subName}</div>
                            <div className="text-[10px] text-gray-500 line-clamp-1">{col.headName}</div>
                            <div className="mt-2 flex items-center justify-between">
                              <Badge variant="secondary" className="text-[10px]">{col.items.length} item(s)</Badge>
                              <span className="text-[10px] text-[#00A699]">View</span>
                            </div>
                          </Card.Content>
                        </Card>
                      );
                    })}
                  </div>
                  {collectionList.length > 6 && !showAllServiceCollections && (
                    <div className="flex justify-center">
                      <Button variant="outline" onClick={() => setShowAllServiceCollections(true)}>
                        View all services ({collectionList.length})
                      </Button>
                    </div>
                  )}
                  {showAllServiceCollections && collectionList.length > 6 && (
                    <div className="flex justify-center">
                      <Button variant="ghost" onClick={() => setShowAllServiceCollections(false)}>
                        Show fewer services
                      </Button>
                    </div>
                  )}

                  <Dialog open={!!selectedCollection} onOpenChange={(open) => { if (!open) setSelectedCollectionKey(''); }}>
                    <DialogContent className="max-w-4xl">
                      <DialogHeader>
                        <DialogTitle className="text-base">
                          {selectedCollection?.subName}
                        </DialogTitle>
                        <p className="text-xs text-gray-500">{selectedCollection?.headName}</p>
                      </DialogHeader>
                      {selectedCollection && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {selectedCollection.items.map(product => (
                            <Card key={product.id} className="overflow-hidden hover:shadow-md transition-shadow group cursor-pointer">
                              <div className="h-24 bg-gray-100 relative overflow-hidden">
                                <img
                                  src={product.image || 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=300&q=80'}
                                  alt={product.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <Card.Content className="p-2.5">
                                <Badge variant="outline" className="mb-1.5 text-[10px]">
                                  {product.micro_category_name || product.sub_category_name || product.category}
                                </Badge>
                                <h3 className="font-semibold text-xs text-gray-900 mb-1 line-clamp-2">{product.name}</h3>
                                <div className="flex justify-between items-center mt-1.5">
                                  <span className="font-semibold text-[#003D82] text-xs">{product.price}</span>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() => handleEnquire(product)}
                                  >
                                    Enquire
                                  </Button>
                                </div>
                              </Card.Content>
                            </Card>
                          ))}
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>
              ) : (
                <Card>
                  <Card.Content className="p-6 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-3">
                      <Wrench className="h-12 w-12 text-gray-300" />
                      <p>No collections available yet</p>
                    </div>
                  </Card.Content>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="about" className="pt-6">
              <Card>
                <Card.Content className="p-6">
                  <h3 className="text-xl font-bold mb-4">About {displayVendor.company_name}</h3>
                  <div className="mb-6 space-y-2">
                    <p className="text-sm text-gray-500 font-medium">Business Description</p>
                    <p className="text-gray-600 leading-relaxed">
                      {displayVendor.description || 'Description not provided'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Business Type</p>
                      <p className="font-medium">{displayVendor.primary_business_type || 'Manufacturer, Supplier'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Established</p>
                      <p className="font-medium">{displayVendor.established || '2010'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">GST Number</p>
                      <p className="font-medium">{displayVendor.gst || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Annual Turnover</p>
                      <p className="font-medium">{displayVendor.annual_turnover || 'Not provided'}</p>
                    </div>
                  </div>
                </Card.Content>
              </Card>
            </TabsContent>

            <TabsContent value="my-leads" className="pt-6">
              <Card>
                <Card.Content className="p-6">
                  {leads.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <MessageSquare className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                      <p>No leads submitted yet</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {leads.map(lead => (
                        <div key={lead.id} className="border rounded-lg p-4 hover:bg-gray-50">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-semibold text-gray-900">{lead.title}</h4>
                            <Badge className={`${lead.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{lead.status}</Badge>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{lead.description}</p>
                          <div className="grid grid-cols-2 gap-4 text-sm text-gray-500">
                            <div>
                              <span className="font-medium">Category:</span> {lead.category}
                            </div>
                            {lead.budget && (
                              <div>
                                <span className="font-medium">Budget:</span> {lead.budget}
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-2">
                            Created: {new Date(lead.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card.Content>
              </Card>
            </TabsContent>

            <TabsContent value="reviews" className="pt-6">
              <Card>
                <Card.Content className="p-6 text-center text-gray-500">
                  <Star className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  <p>No detailed reviews available yet.</p>
                </Card.Content>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar: Contact Info */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <Card.Content className="p-6 space-y-4">
              <h3 className="font-bold text-gray-900 border-b pb-2">Contact Details</h3>

              <div className="flex gap-3 items-start">
                <div className="bg-blue-50 p-2 rounded-lg"><User className="h-5 w-5 text-blue-600" /></div>
                <div>
                  <p className="text-xs text-gray-500">Contact Person</p>
                  <p className="font-medium">{displayVendor.name || 'Contact'}</p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <div className="bg-green-50 p-2 rounded-lg"><Phone className="h-5 w-5 text-green-600" /></div>
                <div>
                  <p className="text-xs text-gray-500">Mobile Number</p>
                  <p className="font-medium text-green-700">{displayVendor.phone ? maskPhoneNumber(displayVendor.phone) : '+91-XXXXXXXXXX'}</p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <div className="bg-purple-50 p-2 rounded-lg"><Building2 className="h-5 w-5 text-purple-600" /></div>
                <div>
                  <p className="text-xs text-gray-500">Address</p>
                  <p className="font-medium text-sm">{displayVendor.address || 'Address'}</p>
                  <p className="text-sm text-gray-600">{displayVendor.city || 'City'}, {displayVendor.state || 'State'}</p>
                </div>
              </div>

              <div className="pt-2">
                <Button className="w-full bg-[#003D82]">Contact Supplier</Button>
              </div>
            </Card.Content>
          </Card>

          <Card className="bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
            <Card.Content className="p-6">
              <h3 className="font-bold text-indigo-900 mb-2">Safe Trading Guide</h3>
              <ul className="text-sm text-indigo-800 space-y-2 list-disc pl-4">
                <li>Check verified badge before dealing</li>
                <li>Always communicate via portal</li>
                <li>Never pay to personal bank accounts</li>
              </ul>
            </Card.Content>
          </Card>
        </div>
      </div>
    </div>
  );
};

const VendorProfile = () => (
  <VendorProfileErrorBoundary>
    <VendorProfileContent />
  </VendorProfileErrorBoundary>
);

export default VendorProfile;
