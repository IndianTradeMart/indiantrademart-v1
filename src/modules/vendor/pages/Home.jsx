
import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { CheckCircle2, TrendingUp, Users, Globe, ArrowRight } from 'lucide-react';
import { vendorService } from '@/modules/directory/services/vendorService';

const VendorHome = () => {
  const [testimonialVendors, setTestimonialVendors] = useState([]);

  useEffect(() => {
    const fetchVendors = async () => {
      try {
        const data = await vendorService.getFeaturedVendors();
        setTestimonialVendors(data?.slice(0, 3) || []);
      } catch (error) {
        console.error('Failed to fetch vendors:', error);
      }
    };
    fetchVendors();
  }, []);

  return (
    <>
      <Helmet>
        <title>Sell on IndianTradeMart - Grow Your Business | Vendor Portal</title>
        <meta name="description" content="Register as a vendor on IndianTradeMart to reach millions of buyers. Boost your sales, expand your network, and grow your business online." />
      </Helmet>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#003D82] to-[#00254E] text-white py-20 lg:py-32">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-4xl lg:text-6xl font-bold mb-6 leading-tight">
                Take Your Business to the <span className="text-[#00A699]">Next Level</span>
              </h1>
              <p className="text-xl text-neutral-300 mb-8">
                Join India's fastest-growing B2B marketplace. Connect with verified buyers, manage inquiries, and grow your sales exponentially.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link to="/vendor/register">
                  <Button size="lg" className="w-full sm:w-auto bg-[#00A699] hover:bg-[#00857A] text-white h-14 px-8 text-lg font-bold">
                    Start Selling Now
                  </Button>
                </Link>
                <Link to="/vendor/login">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto border-white text-white hover:bg-white/10 h-14 px-8 text-lg">
                    Vendor Login
                  </Button>
                </Link>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="absolute inset-0 bg-[#00A699] rounded-full filter blur-[100px] opacity-20" />
              <img 
                 src="https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&q=80&w=1000" 
                 alt="Business Growth" 
                 className="rounded-lg shadow-2xl relative z-10"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-neutral-50 border-b border-neutral-200">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-4xl font-bold text-[#003D82] mb-2">50k+</p>
              <p className="text-neutral-600">Active Vendors</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-[#003D82] mb-2">1M+</p>
              <p className="text-neutral-600">Monthly Buyers</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-[#003D82] mb-2">₹500Cr</p>
              <p className="text-neutral-600">Annual GMV</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-[#003D82] mb-2">100+</p>
              <p className="text-neutral-600">Categories</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-neutral-800 mb-4">Why Sell on IndianTradeMart?</h2>
            <p className="text-lg text-neutral-600 max-w-2xl mx-auto">We provide the tools and exposure you need to scale your business efficiently.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 border border-neutral-200 rounded-xl hover:shadow-lg transition-shadow">
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mb-6">
                <Globe className="h-7 w-7 text-[#003D82]" />
              </div>
              <h3 className="text-xl font-bold mb-3">Pan-India Reach</h3>
              <p className="text-neutral-600">Access buyers from every corner of the country. Break geographical barriers and expand your market.</p>
            </div>
            <div className="p-8 border border-neutral-200 rounded-xl hover:shadow-lg transition-shadow">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-6">
                <Users className="h-7 w-7 text-green-700" />
              </div>
              <h3 className="text-xl font-bold mb-3">Verified Leads</h3>
              <p className="text-neutral-600">Get high-quality, verified leads matching your products. Don't waste time on cold calls.</p>
            </div>
            <div className="p-8 border border-neutral-200 rounded-xl hover:shadow-lg transition-shadow">
              <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center mb-6">
                <TrendingUp className="h-7 w-7 text-orange-700" />
              </div>
              <h3 className="text-xl font-bold mb-3">Growth Analytics</h3>
              <p className="text-neutral-600">Track your performance with advanced analytics dashboard. Make data-driven decisions.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-neutral-900 text-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-16">Success Stories</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonialVendors.map((vendor, idx) => (
              <div key={idx} className="bg-neutral-800 p-8 rounded-xl relative">
                <div className="flex items-center gap-1 mb-4 text-yellow-400">
                  {[...Array(5)].map((_, i) => <CheckCircle2 key={i} className="h-4 w-4" />)}
                </div>
                <p className="text-neutral-300 mb-6 italic">"Since joining IndianTradeMart, our leads have increased by 200%. The platform is incredibly easy to use and effective."</p>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-neutral-700 rounded-full overflow-hidden">
                    <img src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" alt="User" />
                  </div>
                  <div>
                    <p className="font-bold">{vendor.company_name || vendor.name}</p>
                    <p className="text-sm text-neutral-400">CEO, {vendor.city || 'India'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#00A699]">
        <div className="container mx-auto px-4 text-center text-white">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to Grow?</h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto opacity-90">Join the thousands of smart businesses already selling on IndianTradeMart.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/vendor/register">
              <Button size="lg" className="bg-white text-[#00A699] hover:bg-neutral-100 font-bold h-14 px-8">
                Create Account <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
};

export default VendorHome;
