
import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/shared/hooks/useAuth';
import { directoryApi } from '@/modules/directory/api/directoryApi';

const QuotePopup = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [isVisible, setIsVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  
  // Timer references
  const showTimerRef = useRef(null);
  const closeTimerRef = useRef(null);
  
  const [formData, setFormData] = useState({
    productName: '',
    quantity: '',
    unit: '',
    email: '',
    phone: '',
    stateId: '',
    cityId: '',
    description: ''
  });

  // Check if current page allows popup
  const isAllowedPage = () => {
    const path = location.pathname;
    return path === '/' || 
           path.startsWith('/directory') || 
           path.startsWith('/product') ||
           path.startsWith('/categories');
  };

  // Fetch states on mount
  useEffect(() => {
    const loadStates = async () => {
      try {
        setLoadingLocations(true);
        const statesData = await directoryApi.getStates();
        setStates(statesData);
      } catch (error) {
        console.error('Error loading states:', error);
      } finally {
        setLoadingLocations(false);
      }
    };
    loadStates();
  }, []);

  // Load cities when state changes
  useEffect(() => {
    const loadCities = async () => {
      if (formData.stateId) {
        try {
          const citiesData = await directoryApi.getCities(formData.stateId);
          setCities(citiesData);
          // Reset city selection when state changes
          setFormData(prev => ({ ...prev, cityId: '' }));
        } catch (error) {
          console.error('Error loading cities:', error);
        }
      } else {
        setCities([]);
      }
    };
    loadCities();
  }, [formData.stateId]);

  useEffect(() => {
    // 1. Reset state on navigation
    setIsVisible(false);
    clearTimers();

    // 2. Conditions to NOT show
    if (user) return; // User is logged in
    if (!isAllowedPage()) return; // Not on allowed page
    if (sessionStorage.getItem('itm_quote_popup_shown')) return; // Shown once this session
    if (localStorage.getItem('itm_quote_popup_closed')) return; // User explicitly closed it before

    // 3. Start Delay Timer (35 seconds)
    showTimerRef.current = setTimeout(() => {
      showPopup();
    }, 35000); 

    return () => clearTimers();
  }, [user, location.pathname]);

  const clearTimers = () => {
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  };

  const showPopup = () => {
    setIsVisible(true);
    sessionStorage.setItem('itm_quote_popup_shown', 'true');

    // 4. Auto-close Logic (35 seconds duration)
    closeTimerRef.current = setTimeout(() => {
      // Only auto-close if user hasn't started typing (checking if form data is empty)
      setFormData(currentData => {
        if (!currentData.productName && !currentData.email) {
          setIsVisible(false);
        }
        return currentData;
      });
    }, 35000);
  };

  const handleClose = () => {
    setIsVisible(false);
    clearTimers();
    // Mark as closed so it doesn't annoy user again
    localStorage.setItem('itm_quote_popup_closed', 'true');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleStateChange = (e) => {
    setFormData(prev => ({ ...prev, stateId: e.target.value }));
  };

  const handleCityChange = (e) => {
    setFormData(prev => ({ ...prev, cityId: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
       // Extract phone number (remove +91 prefix if any)
       const phoneNum = formData.phone.replace(/^\+91\s*/, '');

       const stateName = states.find((s) => s.id === formData.stateId)?.name || '';
       const cityName = cities.find((c) => c.id === formData.cityId)?.name || '';
       const locationText = cityName && stateName
         ? `${cityName}, ${stateName}`
         : (stateName || cityName || 'India');
       
       const { error } = await supabase.from('leads').insert([{
           product_name: formData.productName,
           quantity: formData.quantity,
           buyer_name: formData.email.split('@')[0], // Extract name from email prefix
           buyer_email: formData.email,
           buyer_phone: phoneNum,
           message: formData.description,
           location: locationText,
           state_id: formData.stateId || null,
           city_id: formData.cityId || null,
           status: 'AVAILABLE',
           category: 'General',
           created_at: new Date().toISOString()
       }]);

       if (error) throw error;

       toast({
         title: "Quote Requested",
         description: "We will connect you with suppliers shortly!",
         className: "bg-green-600 text-white border-green-700"
       });
       
       handleClose();

    } catch (error) {
       console.error("Lead creation error", error);
       toast({
         title: "Error",
         description: "Failed to submit request. Please try again.",
         variant: "destructive"
       });
    } finally {
       setLoading(false);
    }
  };

  // Double check in render to prevent flash
  if (user) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={handleClose}
            />

            {/* Modal */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.2 }}
                className="relative bg-white rounded-lg shadow-2xl overflow-hidden border border-gray-200 w-[90%] md:w-[500px] z-[9999]"
            >
                <button 
                    onClick={handleClose}
                    className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors z-10 p-1 hover:bg-gray-100 rounded-full"
                >
                    <X className="h-5 w-5" />
                </button>

                <div className="p-6 md:p-8">
                    <div className="mb-6">
                        <h2 className="text-2xl font-bold text-gray-900">Get a Quote</h2>
                        <p className="text-gray-500 mt-2 text-sm">Tell us what you need, and we'll help you get quotes</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="productName" className="text-xs font-bold uppercase text-gray-500">
                                Product Name <span className="text-red-500">*</span>
                            </Label>
                            <Input 
                                id="productName"
                                name="productName"
                                placeholder="e.g. Industrial Pumps"
                                required
                                value={formData.productName}
                                onChange={handleInputChange}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="quantity" className="text-xs font-bold uppercase text-gray-500">
                                    Quantity <span className="text-red-500">*</span>
                                </Label>
                                <Input 
                                    id="quantity"
                                    name="quantity"
                                    type="number"
                                    placeholder="0"
                                    required
                                    value={formData.quantity}
                                    onChange={handleInputChange}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="unit" className="text-xs font-bold uppercase text-gray-500">
                                    Unit <span className="text-red-500">*</span>
                                </Label>
                                <Input 
                                    id="unit"
                                    name="unit"
                                    placeholder="e.g. Pcs"
                                    required
                                    value={formData.unit}
                                    onChange={handleInputChange}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="email" className="text-xs font-bold uppercase text-gray-500">
                                Email <span className="text-red-500">*</span>
                            </Label>
                            <Input 
                                id="email"
                                name="email"
                                type="email"
                                placeholder="your@email.com"
                                required
                                value={formData.email}
                                onChange={handleInputChange}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="phone" className="text-xs font-bold uppercase text-gray-500">
                                Phone <span className="text-red-500">*</span>
                            </Label>
                            <div className="flex">
                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                                    +91
                                </span>
                                <Input 
                                    id="phone"
                                    name="phone"
                                    type="tel"
                                    placeholder="98765 43210"
                                    required
                                    className="rounded-l-none"
                                    value={formData.phone}
                                    onChange={handleInputChange}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="state" className="text-xs font-bold uppercase text-gray-500">
                                    State <span className="text-red-500">*</span>
                                </Label>
                                <select
                                    id="state"
                                    value={formData.stateId}
                                    onChange={handleStateChange}
                                    required
                                    disabled={loadingLocations}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003D82] text-sm"
                                >
                                    <option value="">Select State</option>
                                    {states.map(state => (
                                        <option key={state.id} value={state.id}>
                                            {state.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="city" className="text-xs font-bold uppercase text-gray-500">
                                    City <span className="text-red-500">*</span>
                                </Label>
                                <select
                                    id="city"
                                    value={formData.cityId}
                                    onChange={handleCityChange}
                                    required
                                    disabled={!formData.stateId || cities.length === 0}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003D82] text-sm"
                                >
                                    <option value="">Select City</option>
                                    {cities.map(city => (
                                        <option key={city.id} value={city.id}>
                                            {city.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="description" className="text-xs font-bold uppercase text-gray-500">
                                Description
                            </Label>
                            <textarea
                                id="description"
                                name="description"
                                placeholder="Tell us more about your requirement..."
                                rows="3"
                                value={formData.description}
                                onChange={handleInputChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003D82] text-sm font-sans"
                            />
                        </div>

                        <Button 
                            type="submit" 
                            className="w-full bg-[#003D82] hover:bg-[#002a5c] text-white font-bold h-11 mt-2"
                            disabled={loading}
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Submit Request
                        </Button>
                    </form>
                </div>
            </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default QuotePopup;
