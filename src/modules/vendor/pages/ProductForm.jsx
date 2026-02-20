// ✅ File: src/modules/vendor/pages/ProductForm.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { vendorApi as vendorDataApi } from '@/modules/vendor/services/vendorApi';
import { vendorApi } from '@/modules/vendor/services/vendorApi';
import { dataEntryApi } from '@/modules/employee/services/dataEntryApi';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/use-toast';
import CategoryTypeahead from '@/shared/components/CategoryTypeahead';
import { generateSlug, generateUniqueSlug } from '@/shared/utils/slugUtils';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Loader2, Upload, X, Plus } from 'lucide-react';

const MAX_IMAGES = 7;
const MIN_PRODUCT_IMAGE_BYTES = 100 * 1024;
const MAX_PRODUCT_IMAGE_BYTES = 800 * 1024;

// ✅ IndiaMART-style common UOMs (practical + familiar)
const UNIT_OPTIONS = [
  'Piece', 'Nos', 'Unit', 'Set', 'Pair', 'Dozen',
  'Pack', 'Packet', 'Box', 'Carton', 'Bundle', 'Bag',
  'Bottle', 'Can', 'Jar',
  'Kg', 'Gram', 'Ton', 'Quintal',
  'Litre', 'ML',
  'Meter', 'CM', 'MM', 'Inch', 'Foot',
  'Sq Ft', 'Sq M', 'Cubic Ft', 'Cubic M',
  'Roll', 'Sheet', 'Tray',
  'Hour', 'Day', 'Month', 'Job/Service',
];

const SimpleRichText = ({ value, onChange, placeholder }) => (
  <textarea
    className="w-full min-h-[150px] p-3 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    value={value || ''}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
  />
);

const cx = (...arr) => arr.filter(Boolean).join(' ');
const bytesToKb = (bytes = 0) => `${Math.ceil(Number(bytes || 0) / 1024)}KB`;

const ProductForm = () => {
  const location = useLocation();
  const { id, vendorId: routeVendorId, productId } = useParams();
  const formProductId = id || productId || '';
  const isDataEntryMode = location.pathname.startsWith('/employee/dataentry');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const step = params.get('step') || 'basic';
  const [resolvedVendorId, setResolvedVendorId] = useState(routeVendorId || '');
  const productsListPath = isDataEntryMode
    ? (resolvedVendorId ? `/employee/dataentry/vendors/${resolvedVendorId}/products` : '/employee/dataentry/vendors')
    : '/vendor/products';

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [matchingCategory, setMatchingCategory] = useState(false);

  // Location Data
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [selectedStateId, setSelectedStateId] = useState('');
  const [bulkCityLoading, setBulkCityLoading] = useState(false);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [extraCatInput, setExtraCatInput] = useState(null);
  const [showAddCityDialog, setShowAddCityDialog] = useState(false);
  const [customCityInput, setCustomCityInput] = useState('');

  // ✅ UI clean: Pan India details show/hide
  const [showPanIndiaDetails, setShowPanIndiaDetails] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    category_path: '',
    micro_category_id: null,
    sub_category_id: null,
    head_category_id: null,
    category_other: '',
    extra_micro_categories: [],
    min_order_qty: '',
    price_unit: '',
    description: '',

    price: '',
    status: 'ACTIVE',

    images: [],
    video_url: '',
    pdf_url: '',

    specifications: [{ key: '', value: '' }],
    target_locations: {
      pan_india: false,
      states: [],
      cities: [],
    },
  });

  const isPanIndia = !!formData.target_locations?.pan_india;

  // ✅ Pan India auto-fill guard (avoid re-fetch loop)
  const panIndiaAutoFilledRef = useRef(false);

  // ✅ Small concurrency pool to avoid too many API calls at once
  const asyncPool = async (poolLimit, array, iteratorFn) => {
    const ret = [];
    const executing = [];
    for (const item of array) {
      const p = Promise.resolve().then(() => iteratorFn(item));
      ret.push(p);

      if (poolLimit <= array.length) {
        const e = p.then(() => executing.splice(executing.indexOf(e), 1));
        executing.push(e);
        if (executing.length >= poolLimit) {
          await Promise.race(executing);
        }
      }
    }
    return Promise.all(ret);
  };

  const loadAllStatesAndCities = async () => {
    setBulkCityLoading(true);
    try {
      // 1) Ensure states list
      let stList = states;
      if (!stList || stList.length === 0) {
        stList = (await vendorApi.getStates()) || [];
        setStates(stList);
      }

      const allStatesSlim = (stList || [])
        .filter((s) => s?.id)
        .map((s) => ({ id: s.id, name: s.name }));

      // 2) Load all cities for all states (concurrency limited)
      const cityBuckets = [];
      await asyncPool(6, stList || [], async (st) => {
        if (!st?.id) return;
        const list = await vendorApi.getCities(st.id);
        (list || []).forEach((c) => cityBuckets.push(c));
      });

      const cityMap = new Map();
      for (const c of cityBuckets) {
        if (c?.id) cityMap.set(String(c.id), c);
      }

      const allCitiesSlim = Array.from(cityMap.values()).map((c) => ({
        id: c.id,
        name: c.name,
      }));

      setFormData((p) => ({
        ...p,
        target_locations: {
          pan_india: true,
          states: allStatesSlim,
          cities: allCitiesSlim,
        },
      }));

      // ✅ UI reset for state/city dropdown (now everything selected)
      setSelectedStateId('');
      setCities([]);
      setShowAddCityDialog(false);
      setCustomCityInput('');

      // ✅ UI clean: by default hide huge lists
      setShowPanIndiaDetails(false);

      toast({
        title: 'Pan India enabled',
        description: `All states (${allStatesSlim.length}) & all cities (${allCitiesSlim.length}) selected.`,
      });

      panIndiaAutoFilledRef.current = true;
    } catch (e) {
      console.error(e);
      toast({
        title: 'Pan India failed',
        description: 'All states/cities load nahi ho paya. Please try again.',
        variant: 'destructive',
      });

      setFormData((p) => ({
        ...p,
        target_locations: {
          ...p.target_locations,
          pan_india: false,
        },
      }));

      panIndiaAutoFilledRef.current = false;
    } finally {
      setBulkCityLoading(false);
    }
  };

  const statesCount = (formData.target_locations?.states || []).length;
  const citiesCount = (formData.target_locations?.cities || []).length;

  // Score
  const score = useMemo(() => {
    let s = 0;
    if (formData.name?.length > 5) s += 15;
    if (formData.price) s += 15;
    if (formData.description?.length > 50) s += 20;
    if (formData.images?.length >= 3) s += 20;
    else if (formData.images?.length > 0) s += 10;
    if (formData.category_path || formData.category_other) s += 10;

    if (formData.target_locations?.pan_india) s += 10;
    else if (
      (formData.target_locations?.states?.length || 0) > 0 ||
      (formData.target_locations?.cities?.length || 0) > 0
    ) s += 10;

    if (formData.pdf_url) s += 5;
    if (formData.video_url) s += 5;
    return Math.min(s, 100);
  }, [formData]);

  useEffect(() => {
    setResolvedVendorId(routeVendorId || '');
  }, [routeVendorId]);

  useEffect(() => {
    loadStates();
    if (formProductId) loadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formProductId, isDataEntryMode]);

  const loadStates = async () => {
    try {
      const data = await vendorApi.getStates();
      setStates(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadCities = async (sid) => {
    if (!sid) return;
    try {
      const data = await vendorApi.getCities(sid);
      setCities(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadProduct = async () => {
    setLoading(true);
    try {
      const data = isDataEntryMode
        ? await dataEntryApi.getProductById(formProductId)
        : await vendorApi.products.get(formProductId);
      if (data) {
        const relationImages = Array.isArray(data.product_images)
          ? data.product_images
              .map((image) => image?.image_url)
              .filter(Boolean)
          : [];
        const safeImagesFromProduct = Array.isArray(data.images)
          ? data.images
              .map((image) => {
                if (typeof image === 'string') return image;
                if (image && typeof image === 'object') return image.url || image.image_url || image.src || '';
                return '';
              })
              .filter(Boolean)
          : [];
        const safeImages = safeImagesFromProduct.length ? safeImagesFromProduct : relationImages;
        const safeSpecs =
          Array.isArray(data.specifications) && data.specifications.length
            ? data.specifications
            : [{ key: '', value: '' }];
        const safeTargets = {
          pan_india: !!data?.target_locations?.pan_india,
          states: data?.target_locations?.states || [],
          cities: data?.target_locations?.cities || [],
        };

        setFormData((p) => ({
          ...p,
          ...data,
          price_unit: data.price_unit || '',
          min_order_qty: data.min_order_qty || '',
          extra_micro_categories: data.extra_micro_categories || [],
          specifications: safeSpecs,
          images: safeImages,
          target_locations: safeTargets,
          status: data.status || 'ACTIVE',
        }));

        if (data?.vendor_id) {
          setResolvedVendorId(String(data.vendor_id));
        }

        const lastState = data?.target_locations?.states?.slice(-1)?.[0];
        if (lastState?.id) {
          setSelectedStateId(lastState.id);
          loadCities(lastState.id);
        }

        panIndiaAutoFilledRef.current = !!data?.target_locations?.pan_india;
        setShowPanIndiaDetails(false);
      }
    } catch (e) {
      console.error(e);
      toast({
        title: 'Unable to load product',
        description: e?.message || 'Product data not found',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // --- helpers ---
  const addLocations = (type, items) => {
    const safeItems = (items || []).filter(Boolean);
    if (!safeItems.length) return;

    setFormData((p) => {
      const list = p.target_locations[type] || [];
      const existingIds = new Set(list.map((x) => String(x.id)));
      const toAdd = safeItems
        .filter((it) => it?.id && !existingIds.has(String(it.id)))
        .map((it) => ({ id: it.id, name: it.name }));

      if (!toAdd.length) return p;

      return {
        ...p,
        target_locations: {
          ...p.target_locations,
          pan_india: false,
          [type]: [...list, ...toAdd],
        },
      };
    });

    panIndiaAutoFilledRef.current = false;
  };

  const addLocation = (type, item) => addLocations(type, item ? [item] : []);

  const removeLocation = (type, rid) => {
    setFormData((p) => ({
      ...p,
      target_locations: {
        ...p.target_locations,
        [type]: (p.target_locations[type] || []).filter(
          (x) => String(x.id) !== String(rid)
        ),
      },
    }));
    panIndiaAutoFilledRef.current = false;
  };

  // ✅ Pan India ON -> auto select ALL states + ALL cities
  // ✅ Pan India OFF -> clear selections
  const togglePanIndia = async (checked) => {
    if (!checked) {
      panIndiaAutoFilledRef.current = false;
      setShowPanIndiaDetails(false);

      setFormData((p) => ({
        ...p,
        target_locations: {
          pan_india: false,
          states: [],
          cities: [],
        },
      }));

      setSelectedStateId('');
      setCities([]);
      setShowAddCityDialog(false);
      setCustomCityInput('');

      toast({
        title: 'Pan India disabled',
        description: 'Ab aap manually states/cities select kar sakte ho.',
      });
      return;
    }

    if (panIndiaAutoFilledRef.current && formData.target_locations?.pan_india) {
      return;
    }

    setFormData((p) => ({
      ...p,
      target_locations: {
        ...p.target_locations,
        pan_india: true,
      },
    }));

    await loadAllStatesAndCities();
  };

  // ✅ ONLY ONE “Select All Cities” (Selected States)
  const selectAllCities = async () => {
    const selectedStates = formData.target_locations?.states || [];
    if (!selectedStates.length) {
      toast({ title: 'Select at least 1 state', variant: 'destructive' });
      return;
    }

    setBulkCityLoading(true);
    try {
      const all = [];
      for (const st of selectedStates) {
        const list = await vendorApi.getCities(st.id);
        (list || []).forEach((c) => all.push(c));
      }

      const map = new Map();
      for (const c of all) {
        if (c?.id) map.set(String(c.id), c);
      }

      addLocations('cities', Array.from(map.values()));
      toast({
        title: 'All cities added',
        description: 'Selected states ki saari cities select ho gayi.',
      });
    } catch (e) {
      console.error(e);
      toast({ title: 'Failed to load cities', variant: 'destructive' });
    } finally {
      setBulkCityLoading(false);
    }
  };

  // --- Handlers ---
  const handleNameBlur = async () => {
    if (
      formData.category_path ||
      formData.category_other ||
      (formData.name || '').length < 3
    ) return;

    setMatchingCategory(true);
    try {
      const match = await vendorDataApi.products.matchCategory(formData.name);
      if (match) {
        setFormData((p) => ({
          ...p,
          micro_category_id: match.micro_category_id,
          sub_category_id: match.sub_category_id,
          head_category_id: match.head_category_id,
          category_path: match.path,
          category_other: '',
        }));

        const confidence = match.matchScore || match.confidence || 0;
        if (confidence > 80) {
          toast({ title: '✓ Category Auto-detected!', description: `${match.path} (${confidence}% match)` });
        } else if (confidence > 50) {
          toast({ title: 'Category Auto-detected', description: `${match.path} (${confidence}% match - Please verify)` });
        }
      } else {
        toast({
          title: '⚠️ No Category Match Found',
          description: 'Please manually select a category from the dropdown',
          variant: 'destructive',
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setMatchingCategory(false);
    }
  };

  const handleImageUpload = async (e) => {
    const input = e.target;
    const files = Array.from(input.files || []);
    if (!files.length) return;

    if (formData.images.length + files.length > MAX_IMAGES) {
      toast({ title: `Max ${MAX_IMAGES} images allowed`, variant: 'destructive' });
      input.value = '';
      return;
    }

    const nonImages = files.filter((f) => !String(f?.type || '').startsWith('image/'));
    if (nonImages.length) {
      toast({
        title: 'Only image files are allowed',
        description: `${nonImages[0].name || 'Selected file'} is not a valid image.`,
        variant: 'destructive',
      });
      input.value = '';
      return;
    }

    const tooSmall = files.filter((f) => Number(f?.size || 0) < MIN_PRODUCT_IMAGE_BYTES);
    if (tooSmall.length) {
      toast({
        title: 'Image too small',
        description: `${tooSmall[0].name}: minimum size is ${bytesToKb(MIN_PRODUCT_IMAGE_BYTES)}.`,
        variant: 'destructive',
      });
      input.value = '';
      return;
    }

    const tooLarge = files.filter((f) => Number(f?.size || 0) > MAX_PRODUCT_IMAGE_BYTES);
    if (tooLarge.length) {
      toast({
        title: 'Image too large',
        description: `${tooLarge[0].name}: maximum size is ${bytesToKb(MAX_PRODUCT_IMAGE_BYTES)}.`,
        variant: 'destructive',
      });
      input.value = '';
      return;
    }

    setUploading(true);
    try {
      const newUrls = [];
      for (const file of files) {
        let url;
        if (isDataEntryMode) {
          url = await dataEntryApi.uploadProductMedia(file, 'image');
        } else {
          // Ensure auth + CSRF cookies are hydrated after refresh before upload starts.
          await supabase.auth.getSession();

          try {
            url = await vendorApi.auth.uploadImage(file, 'product-images');
          } catch (firstErr) {
            const errMsg = String(firstErr?.message || '').toLowerCase();
            const shouldRetry =
              errMsg.includes('csrf') ||
              errMsg.includes('unauthorized') ||
              errMsg.includes('forbidden') ||
              errMsg.includes('token');

            if (!shouldRetry) throw firstErr;

            // Retry once after forcing a fresh auth/session check.
            await supabase.auth.getSession();
            url = await vendorApi.auth.uploadImage(file, 'product-images');
          }
        }
        newUrls.push(url);
      }
      setFormData((p) => ({ ...p, images: [...p.images, ...newUrls] }));
    } catch (e) {
      toast({
        title: 'Upload Failed',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      input.value = '';
    }
  };

  // ✅ helper: make metadata always an object (metadata column exists in DB)
  const normalizeMetadata = (m) => {
    if (!m) return {};
    if (typeof m === 'object') return m;
    if (typeof m === 'string') {
      try {
        const parsed = JSON.parse(m);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }
    return {};
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (!formData.name || formData.name.trim().length < 2) {
      toast({ title: 'Product/Title Name is required', variant: 'destructive' });
      return;
    }

    if (!formData.category_path && !formData.category_other) {
      toast({
        title: 'Please select a category',
        description: 'Public search needs a category to show your product.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const payload = { ...formData };
      delete payload.qty_unit;
      delete payload.head_category;
      delete payload.sub_category;
      delete payload.micro_category;
      delete payload.product_images;

      if (!payload.slug || payload.slug.trim() === '') {
        payload.slug = generateUniqueSlug(formData.name);
      }

      // Normalize images to plain URL strings (avoid object arrays)
      payload.images = (payload.images || [])
        .map((img) => {
          if (typeof img === 'string') return img;
          if (img && typeof img === 'object') return img.url || img.image_url || img.src || '';
          return '';
        })
        .filter(Boolean);

      // Derive category for compatibility
      const derivedCategory =
        (payload.category_other || '').trim() ||
        String(payload.category_path || '')
          .split('>')
          .map((s) => s.trim())
          .filter(Boolean)
          .pop() ||
        '';

      if (derivedCategory) {
        payload.category = derivedCategory;

        // ✅ IMPORTANT FIX:
        // products table DOES NOT have category_slug column, so NEVER send it.
        // If you still want it, store inside metadata (safe JSON column).
        const catSlug = generateSlug(derivedCategory);
        payload.metadata = {
          ...normalizeMetadata(payload.metadata),
          category_slug: catSlug,
        };

        if (!payload.category_path) payload.category_path = derivedCategory;
      }

      if (!payload.status) payload.status = 'ACTIVE';

      if (isDataEntryMode && !formProductId && !resolvedVendorId) {
        throw new Error('Vendor context is missing. Please open Add Product from a vendor page.');
      }

      if (isDataEntryMode) {
        if (resolvedVendorId) {
          payload.vendor_id = resolvedVendorId;
        }

        if (formProductId) {
          await dataEntryApi.updateProduct(formProductId, payload);
          toast({ title: 'Updated successfully' });
          navigate(productsListPath);
        } else {
          await dataEntryApi.addProduct(payload);
          toast({ title: 'Product created successfully!' });
          navigate(productsListPath);
        }
      } else {
        if (formProductId) {
          await vendorApi.products.update(formProductId, payload);
          toast({ title: 'Updated successfully' });
          navigate(productsListPath);
        } else {
          await vendorApi.products.create(payload);
          toast({ title: 'Product created successfully!' });
          setTimeout(() => navigate(productsListPath), 800);
        }
      }
    } catch (e) {
      console.error('Save error:', e);
      toast({
        title: 'Error saving product',
        description: e.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddCustomCity = async () => {
    if (!customCityInput.trim()) {
      toast({ title: 'Please enter a city name', variant: 'destructive' });
      return;
    }
    if (!selectedStateId) {
      toast({ title: 'Please select a state first', variant: 'destructive' });
      return;
    }

    try {
      const cityName = customCityInput.trim();
      const citySlug = cityName.toLowerCase().replace(/\s+/g, '-');
      const st = states.find((x) => String(x.id) === String(selectedStateId));
      const stateSlug = (st?.slug || st?.name || '').toLowerCase().replace(/\s+/g, '-');
      const slug = stateSlug ? `${citySlug}-${stateSlug}` : citySlug;

      const { data, error } = await supabase
        .from('cities')
        .insert([{ name: cityName, slug: slug, state_id: selectedStateId }])
        .select()
        .single();

      if (error) throw error;

      if (data) {
        addLocation('cities', data);
        setCities((p) => [...p, data]);
        setCustomCityInput('');
        setShowAddCityDialog(false);
        toast({ title: 'City added successfully!' });
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'Failed to add city', variant: 'destructive' });
    }
  };

  if (loading && !formData) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between bg-white border rounded-md px-4 py-3 shadow-sm">
        <div>
          <div className="text-sm text-slate-500">
            {formProductId ? 'Edit Product' : 'Add New Product'}
          </div>
          <div className="text-xl font-bold text-slate-900">
            {formData.name || 'New Product'}
          </div>
        </div>
        <Button variant="ghost" onClick={() => navigate(productsListPath)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Cancel
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_280px] gap-6">
        {/* LEFT: Media */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Images ({formData.images.length}/{MAX_IMAGES})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="aspect-square bg-slate-100 rounded-lg border overflow-hidden relative flex items-center justify-center">
                {formData.images[activeImageIndex] ? (
                  <img
                    src={formData.images[activeImageIndex]}
                    className="w-full h-full object-contain"
                    alt="Product"
                  />
                ) : (
                  <div className="text-slate-400">No Image</div>
                )}
              </div>

              <div className="grid grid-cols-4 gap-2">
                {formData.images.map((img, i) => (
                  <div
                    key={i}
                    className={cx(
                      'aspect-square border rounded cursor-pointer overflow-hidden',
                      activeImageIndex === i ? 'ring-2 ring-blue-500' : ''
                    )}
                    onClick={() => setActiveImageIndex(i)}
                  >
                    <img src={img} className="w-full h-full object-cover" alt="" />
                  </div>
                ))}

                {formData.images.length < MAX_IMAGES && (
                  <label className="aspect-square border-2 border-dashed rounded flex items-center justify-center cursor-pointer hover:bg-slate-50">
                    {uploading ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Upload className="text-slate-400" />
                    )}
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageUpload}
                    />
                  </label>
                )}
              </div>

              {formData.images.length > 0 && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    type="button"
                    onClick={() => {
                      const imgs = [...formData.images];
                      const item = imgs.splice(activeImageIndex, 1)[0];
                      imgs.unshift(item);
                      setFormData((p) => ({ ...p, images: imgs }));
                      setActiveImageIndex(0);
                    }}
                  >
                    Set Primary
                  </Button>

                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1"
                    type="button"
                    onClick={() => {
                      const imgs = [...formData.images];
                      imgs.splice(activeImageIndex, 1);
                      setFormData((p) => ({ ...p, images: imgs }));
                      setActiveImageIndex(0);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              )}
              <p className="text-[11px] text-slate-500">
                Allowed image size: {bytesToKb(MIN_PRODUCT_IMAGE_BYTES)} to {bytesToKb(MAX_PRODUCT_IMAGE_BYTES)}.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Additional Media</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Video URL (YouTube)</Label>
                <Input
                  value={formData.video_url}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, video_url: e.target.value }))
                  }
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Brochure (PDF URL)</Label>
                <Input
                  value={formData.pdf_url}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, pdf_url: e.target.value }))
                  }
                  placeholder="https://..."
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CENTER: Form */}
        <form onSubmit={handleSave} className="space-y-6">
          <Tabs value={step} onValueChange={(v) => setParams({ step: v })}>
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="basic">Basic Details</TabsTrigger>
              <TabsTrigger value="specs">Specifications & Location</TabsTrigger>
            </TabsList>

            {/* BASIC TAB */}
            <TabsContent value="basic" className="space-y-4 mt-4">
              <Card>
                <CardContent className="p-6 space-y-5">
                  <div className="space-y-2">
                    <Label>Product/Title Name *</Label>
                    <div className="relative">
                      <Input
                        value={formData.name}
                        onChange={(e) =>
                          setFormData((p) => ({ ...p, name: e.target.value }))
                        }
                        onBlur={handleNameBlur}
                        required
                      />
                      {matchingCategory && (
                        <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-blue-500" />
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Category</Label>
                    {formData.category_path ? (
                      <div className="flex justify-between items-center p-2 bg-blue-50 border border-blue-100 rounded text-sm text-blue-700">
                        <span>{formData.category_path}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          onClick={() =>
                            setFormData((p) => ({
                              ...p,
                              category_path: '',
                              micro_category_id: null,
                              sub_category_id: null,
                              head_category_id: null,
                            }))
                          }
                        >
                          Change
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <CategoryTypeahead
                          onSelect={(item) => {
                            if (item) {
                              const isSub = item.type === 'sub';
                              setFormData((p) => ({
                                ...p,
                                category_path: item.path,
                                micro_category_id: isSub ? null : item.id,
                                sub_category_id: isSub ? item.id : item.sub_id,
                                head_category_id: item.head_id,
                                category_other: '',
                              }));
                            }
                          }}
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Or</span>
                          <Input
                            placeholder="Type custom category if not found"
                            className="h-8 text-sm"
                            value={formData.category_other}
                            onChange={(e) =>
                              setFormData((p) => ({
                                ...p,
                                category_other: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Add Keywords (Max 2)</Label>
                    <div className="flex gap-2">
                      <CategoryTypeahead
                        onSelect={setExtraCatInput}
                        placeholder="Search keyword..."
                        disabled={formData.extra_micro_categories.length >= 2}
                      />
                      <Button
                        type="button"
                        onClick={() => {
                          if (extraCatInput && formData.extra_micro_categories.length < 2) {
                            setFormData((p) => ({
                              ...p,
                              extra_micro_categories: [
                                ...p.extra_micro_categories,
                                extraCatInput,
                              ],
                            }));
                            setExtraCatInput(null);
                          }
                        }}
                      >
                        Add
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {formData.extra_micro_categories.map((c, i) => (
                        <div
                          key={i}
                          className="bg-slate-100 px-3 py-1 rounded-full text-xs flex items-center gap-2"
                        >
                          {c.name}
                          <X
                            className="w-3 h-3 cursor-pointer"
                            onClick={() => {
                              const n = [...formData.extra_micro_categories];
                              n.splice(i, 1);
                              setFormData((p) => ({ ...p, extra_micro_categories: n }));
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        value={formData.min_order_qty}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            min_order_qty: e.target.value,
                          }))
                        }
                        placeholder="e.g. 10"
                      />
                      <p className="text-[11px] text-slate-500">
                        Minimum order quantity (optional)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Unit</Label>
                      <Select
                        value={formData.price_unit || ''}
                        onValueChange={(v) =>
                          setFormData((p) => ({ ...p, price_unit: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select unit" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {UNIT_OPTIONS.map((u) => (
                            <SelectItem key={u} value={u}>
                              {u}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-slate-500">
                        IndiaMART style: Piece / Nos / Kg / Litre / Meter etc.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <SimpleRichText
                      value={formData.description}
                      onChange={(v) => setFormData((p) => ({ ...p, description: v }))}
                      placeholder="Write product/service details in simple words..."
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="button" onClick={() => setParams({ step: 'specs' })}>
                      Next: Specifications →
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* SPECS TAB */}
            <TabsContent value="specs" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pricing (Optional)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Price (₹)</Label>
                      <Input
                        type="number"
                        value={formData.price}
                        onChange={(e) =>
                          setFormData((p) => ({ ...p, price: e.target.value }))
                        }
                        placeholder="e.g. 500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Per Unit</Label>
                      <Input
                        value={formData.price_unit || ''}
                        readOnly
                        className="bg-slate-50"
                        placeholder="Select unit from Basic tab"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Agar exact price nahi hai, blank chhod sakte ho.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Specifications</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {formData.specifications.map((spec, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        placeholder="Attribute (e.g. Color)"
                        value={spec.key}
                        onChange={(e) => {
                          const n = [...formData.specifications];
                          n[i].key = e.target.value;
                          setFormData((p) => ({ ...p, specifications: n }));
                        }}
                      />
                      <Input
                        placeholder="Value (e.g. Red)"
                        value={spec.value}
                        onChange={(e) => {
                          const n = [...formData.specifications];
                          n[i].value = e.target.value;
                          setFormData((p) => ({ ...p, specifications: n }));
                        }}
                      />
                      {i > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const n = [...formData.specifications];
                            n.splice(i, 1);
                            setFormData((p) => ({ ...p, specifications: n }));
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setFormData((p) => ({
                        ...p,
                        specifications: [...p.specifications, { key: '', value: '' }],
                      }))
                    }
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add Row
                  </Button>
                </CardContent>
              </Card>

              {/* ✅ Location */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Where you can deliver / provide service
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* ✅ Pan India toggle (clean) */}
                  <div className="flex items-center justify-between rounded-md border p-3 bg-slate-50">
                    <div>
                      <div className="text-sm font-medium flex items-center gap-2">
                        Pan India
                        {bulkCityLoading ? (
                          <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                            <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-slate-500">
                        Enable karo to pure India me delivery/service available maana jayega.
                      </div>
                    </div>

                    <Switch
                      checked={isPanIndia}
                      onCheckedChange={togglePanIndia}
                      disabled={bulkCityLoading}
                    />
                  </div>

                  {/* ✅ CLEAN UI when Pan India is ON */}
                  {isPanIndia ? (
                    <div className="rounded-md border bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            ✅ Pan India Enabled
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            Aapka product/service <b>All India</b> ke liye available hai.
                          </div>
                          <div className="text-xs text-slate-500 mt-2">
                            Selected: <b>{statesCount}</b> States, <b>{citiesCount}</b> Cities
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowPanIndiaDetails((p) => !p)}
                        >
                          {showPanIndiaDetails ? 'Hide details' : 'View details'}
                        </Button>
                      </div>

                      {showPanIndiaDetails && (
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="rounded-md border p-3 bg-slate-50">
                            <div className="text-xs font-semibold text-slate-700 mb-2">
                              States (scroll)
                            </div>
                            <div className="max-h-40 overflow-auto flex flex-wrap gap-2">
                              {(formData.target_locations.states || []).map((s) => (
                                <span
                                  key={s.id}
                                  className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs"
                                >
                                  {s.name}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-md border p-3 bg-slate-50">
                            <div className="text-xs font-semibold text-slate-700 mb-2">
                              Cities (scroll)
                            </div>
                            <div className="max-h-40 overflow-auto flex flex-wrap gap-2">
                              {(formData.target_locations.cities || []).map((c) => (
                                <span
                                  key={c.id}
                                  className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs"
                                >
                                  {c.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    // ✅ Normal (Pan India OFF) UI
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* States */}
                      <div>
                        <Label>Select multiple states</Label>
                        <Select
                          onValueChange={(v) => {
                            const s = states.find((x) => String(x.id) === String(v));
                            addLocation('states', s);
                            setSelectedStateId(v);
                            loadCities(v);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Add State" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {states.map((s) => (
                              <SelectItem key={s.id} value={String(s.id)}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* ✅ scrollable chips (clean) */}
                        <div className="mt-2 rounded-md border bg-slate-50 p-2 max-h-32 overflow-auto">
                          <div className="flex flex-wrap gap-2">
                            {(formData.target_locations.states || []).map((s) => (
                              <span
                                key={s.id}
                                className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs flex items-center gap-1"
                              >
                                {s.name}
                                <X
                                  className="w-3 h-3 cursor-pointer"
                                  onClick={() => removeLocation('states', s.id)}
                                />
                              </span>
                            ))}
                            {!(formData.target_locations.states || []).length && (
                              <span className="text-xs text-slate-400">No states selected</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Cities */}
                      <div>
                        <Label>Select multiple cities of that state</Label>
                        <div className="space-y-2">
                          <Select
                            disabled={!selectedStateId}
                            onValueChange={(v) => {
                              if (v === 'OTHER') {
                                setShowAddCityDialog(true);
                                return;
                              }
                              const c = cities.find((x) => String(x.id) === String(v));
                              addLocation('cities', c);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue
                                placeholder={selectedStateId ? 'Add City' : 'Select state first'}
                              />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                              {cities.map((c) => (
                                <SelectItem key={c.id} value={String(c.id)}>
                                  {c.name}
                                </SelectItem>
                              ))}
                              <SelectItem value="OTHER">+ Add Other City</SelectItem>
                            </SelectContent>
                          </Select>

                          {showAddCityDialog && (
                            <div className="border rounded-md p-3 bg-blue-50">
                              <div className="space-y-2">
                                <Label className="text-sm">Enter city name</Label>
                                <Input
                                  placeholder="e.g. Bengaluru, Pune"
                                  value={customCityInput}
                                  onChange={(e) => setCustomCityInput(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && handleAddCustomCity()}
                                />
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="bg-emerald-600 hover:bg-emerald-700"
                                    onClick={handleAddCustomCity}
                                  >
                                    Add City
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setShowAddCityDialog(false);
                                      setCustomCityInput('');
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={bulkCityLoading || !(formData.target_locations.states || []).length}
                            onClick={selectAllCities}
                            className="w-full"
                          >
                            {bulkCityLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            Select All Cities (Selected States)
                          </Button>
                        </div>

                        {/* ✅ scrollable chips (clean) */}
                        <div className="mt-2 rounded-md border bg-slate-50 p-2 max-h-32 overflow-auto">
                          <div className="flex flex-wrap gap-2">
                            {(formData.target_locations.cities || []).map((c) => (
                              <span
                                key={c.id}
                                className="bg-green-50 text-green-700 px-2 py-1 rounded text-xs flex items-center gap-1"
                              >
                                {c.name}
                                <X
                                  className="w-3 h-3 cursor-pointer"
                                  onClick={() => removeLocation('cities', c.id)}
                                />
                              </span>
                            ))}
                            {!(formData.target_locations.cities || []).length && (
                              <span className="text-xs text-slate-400">No cities selected</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-between pt-4">
                <Button type="button" variant="outline" onClick={() => setParams({ step: 'basic' })}>
                  Back
                </Button>
                <Button type="submit" className="bg-[#003D82]">
                  {loading ? 'Saving...' : 'Save Product'}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </form>

        {/* RIGHT: Score */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Product Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-600 mb-2">{score}%</div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden mb-4">
                <div
                  className="bg-emerald-500 h-full transition-all duration-500"
                  style={{ width: `${score}%` }}
                />
              </div>
              <div className="text-xs text-slate-500 space-y-1">
                <div className={formData.name.length > 5 ? 'text-emerald-600' : ''}>
                  • Name Length ({formData.name.length}/5 chars)
                </div>
                <div className={formData.price ? 'text-emerald-600' : ''}>• Price Set (optional)</div>
                <div className={formData.images.length >= 3 ? 'text-emerald-600' : ''}>
                  • 3+ Images ({formData.images.length})
                </div>
                <div className={formData.category_path ? 'text-emerald-600' : ''}>• Category Selected</div>
                <div
                  className={
                    formData.target_locations?.pan_india ||
                    (formData.target_locations?.states || []).length ||
                    (formData.target_locations?.cities || []).length
                      ? 'text-emerald-600'
                      : ''
                  }
                >
                  • Location Selected
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ProductForm;
