
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Star, MapPin, Package, BadgeCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/shared/components/Badge';
import { vendorService } from '@/modules/directory/services/vendorService';

const FeaturedVendors = () => {
  const navigate = useNavigate();
  const [featuredVendors, setFeaturedVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVendors = async () => {
      try {
        const data = await vendorService.getFeaturedVendors();
        setFeaturedVendors(data);
      } catch (error) {
        console.error('Failed to fetch vendors:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchVendors();
  }, []);

  return (
    <section className="py-16 bg-white">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-[#003D82] mb-4">
            Featured Verified Vendors
          </h2>
          <p className="text-lg text-neutral-600">
            Connect with trusted suppliers across India
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {featuredVendors.map((vendor, index) => (
            <motion.div
              key={vendor.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -8 }}
              className="bg-white rounded-lg shadow-lg hover:shadow-xl transition-all border border-neutral-200 overflow-hidden cursor-pointer"
              onClick={() => navigate(`/vendor/${vendor.id}`)}
            >
              <div className="relative h-48 overflow-hidden">
                <img 
                  className="w-full h-full object-cover"
                  alt={`${vendor.name} facility`}
                  src="https://images.unsplash.com/photo-1674309343862-394ff2960acf?auto=format&fit=crop&w=600&q=60"
                  loading="lazy"
                  decoding="async"
                />
                {vendor.verified && (
                  <div className="absolute top-3 right-3">
                    <Badge variant="success" className="flex items-center gap-1">
                      <BadgeCheck className="h-3 w-3" />
                      Verified
                    </Badge>
                  </div>
                )}
              </div>

              <div className="p-5">
                <h3 className="font-bold text-lg text-[#003D82] mb-2">
                  {vendor.name}
                </h3>
                <p className="text-sm text-neutral-600 mb-3 line-clamp-2">
                  {vendor.description}
                </p>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-neutral-400" />
                    <span className="text-neutral-600">{vendor.city}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Package className="h-4 w-4 text-neutral-400" />
                    <span className="text-neutral-600">{vendor.products} Products</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-semibold text-sm">{vendor.rating}</span>
                    </div>
                    <span className="text-sm text-neutral-500">
                      ({vendor.reviews} reviews)
                    </span>
                  </div>
                </div>

                <Button 
                  className="w-full bg-[#00A699] hover:bg-[#00857A] text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/vendor/${vendor.id}`);
                  }}
                >
                  View Profile
                </Button>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-center mt-12"
        >
          <Button 
            variant="outline"
            size="lg"
            className="border-[#003D82] text-[#003D82] hover:bg-[#003D82] hover:text-white"
            onClick={() => navigate('/search')}
          >
            View All Vendors
          </Button>
        </motion.div>
      </div>
    </section>
  );
};

export default FeaturedVendors;
