
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { dataService } from '@/shared/services/dataService';
import { useNavigate } from 'react-router-dom';

const TopCities = () => {
  const [cities, setCities] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch from persistent storage
    const storedCities = dataService.getCities();
    setCities(storedCities.filter(c => c.isActive !== false)); // Only show active
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
          <h2 className="text-3xl md:text-4xl font-bold text-[#8B6F47] mb-4">
            Find Suppliers By City
          </h2>
          <p className="text-lg text-neutral-600">
            Connect with verified manufacturers and wholesalers in top industrial hubs
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-6">
          {cities.map((city, index) => (
            <motion.div
              key={city.id}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
              whileHover={{ y: -5 }}
              onClick={() => navigate(`/search?loc=${encodeURIComponent(city.name)}`)}
              className="flex flex-col items-center group cursor-pointer"
            >
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-lg mb-3 group-hover:border-[#059669] transition-all duration-300 relative">
                <img 
                  src={city.image} 
                  alt={city.name} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <h3 className="font-semibold text-gray-800 group-hover:text-[#059669] transition-colors text-center">
                {city.name}
              </h3>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TopCities;
