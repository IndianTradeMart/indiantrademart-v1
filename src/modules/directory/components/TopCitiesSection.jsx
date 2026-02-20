import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { directoryApi } from '@/modules/directory/services/directoryApi';
import { motion } from 'framer-motion';

const TopCitiesSection = () => {
  const navigate = useNavigate();
  const [cities, setCities] = useState([]);

  // --- helpers ---
  const slugify = (text = '') =>
    text
      .toLowerCase()
      .trim()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

  const normalize = (name = '') =>
    name
      .toLowerCase()
      .trim()
      // keep letters/numbers/spaces only for matching
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ');

  useEffect(() => {
    const loadCities = async () => {
      // Fetch more than 10 so we can force our UI order reliably (keep light)
      const data = await directoryApi.getTopCities(50);

      const desiredSequence = [
        'Delhi',
        'Noida',
        'Mumbai',
        'Bangaluru',
        'Chennai',
        'Kolkata',
        'Jaipur',
        'Ahmedabad',
        'Hyderabad',
        'Lucknow',
      ];

      // aliases: desired -> possible API spellings
      const aliasMap = {
        delhi: ['delhi', 'new delhi', 'ncr delhi'],
        noida: ['noida'],
        mumbai: ['mumbai', 'bombay'],
        bangaluru: ['bengaluru', 'bangalore', 'bangaluru'],
        chennai: ['chennai', 'madras'],
        kolkata: ['kolkata', 'calcutta'],
        jaipur: ['jaipur'],
        ahmedabad: ['ahmedabad', 'ahmedavad'],
        hyderabad: ['hyderabad'],
        lucknow: ['lucknow'],
      };

      const raw = Array.isArray(data) ? data : [];
      const usedIds = new Set();

      const findCityInData = (wantedKey) => {
        const wantedAliases = aliasMap[wantedKey] || [wantedKey];
        const normalizedAliases = wantedAliases.map((x) => normalize(x));

        // Prefer exact-ish match first (includes)
        for (const city of raw) {
          if (!city || usedIds.has(city.id)) continue;
          const n = normalize(city.name || '');
          if (normalizedAliases.some((a) => n.includes(a))) return city;
        }

        // If nothing found, return null
        return null;
      };

      const finalCities = desiredSequence.map((desiredName) => {
        const desiredKey = normalize(desiredName); // e.g. "bangaluru"
        const found = findCityInData(desiredKey);

        if (found) {
          usedIds.add(found.id);
          return found;
        }

        // If missing from API result, add a placeholder city object
        return {
          id: `custom-${slugify(desiredName)}`,
          name: desiredName,
          slug: slugify(desiredName),
          supplier_count: 0,
        };
      });

      setCities(finalCities);
    };

    loadCities();
  }, []);

  const formatCount = (num) => {
    const n = Number(num || 0);
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K+';
    return n + '+';
  };

  // Helper to determine image based on city name or fallback
  const CityIcon = ({ city }) => {
    const name = (city?.name || '').toLowerCase();
    const CityImg = (props) => (
      <img loading="lazy" decoding="async" {...props} />
    );

    if (name.includes('delhi'))
      return (
        <CityImg
          alt="Delhi Gate Icon"
          className="w-full h-full object-contain p-2"
          src="https://images.unsplash.com/photo-1703083664356-a15a04d42e4c?auto=format&fit=crop&w=200&q=60"
        />
      );

    if (name.includes('noida'))
      return (
        <CityImg
          alt="Noida City Icon"
          className="w-full h-full object-contain p-2"
          src="https://images.unsplash.com/photo-1582407947304-fd86f028f716?auto=format&fit=crop&w=200&q=60"
        />
      );

    if (name.includes('mumbai'))
      return (
        <CityImg
          alt="Gateway of India Icon"
          className="w-full h-full object-contain p-2"
          src="https://images.unsplash.com/photo-1518918249916-0a72d4f98658?auto=format&fit=crop&w=200&q=60"
        />
      );

    // Handles Bengaluru/Bangalore/Bangaluru spellings
    if (name.includes('bengaluru') || name.includes('bangalore') || name.includes('bangaluru'))
      return (
        <CityImg
          alt="Vidhana Soudha Icon"
          className="w-full h-full object-contain p-2"
          src="https://images.unsplash.com/photo-1698127091046-3e260f65d6d8?auto=format&fit=crop&w=200&q=60"
        />
      );

    if (name.includes('chennai'))
      return (
        <CityImg
          alt="Chennai Central Icon"
          className="w-full h-full object-contain p-2"
          src="https://images.unsplash.com/photo-1635472276754-a5369ebf1bba?auto=format&fit=crop&w=200&q=60"
        />
      );

    if (name.includes('kolkata'))
      return (
        <CityImg
          alt="Howrah Bridge Icon"
          className="w-full h-full object-contain p-2"
          src="https://images.unsplash.com/photo-1571481808344-77708908c5a9?auto=format&fit=crop&w=200&q=60"
        />
      );

    if (name.includes('jaipur'))
      return (
        <CityImg
          alt="Hawa Mahal Icon"
          className="w-full h-full object-contain p-2"
          src="https://images.unsplash.com/photo-1617516203158-1b87bb39caa7?auto=format&fit=crop&w=200&q=60"
        />
      );

    if (name.includes('ahmedabad'))
      return (
        <CityImg
          alt="Ahmedabad Icon"
          className="w-full h-full object-contain p-2"
          src="https://images.unsplash.com/photo-1674783358278-bed2d6a4d57d?auto=format&fit=crop&w=200&q=60"
        />
      );

    if (name.includes('hyderabad'))
      return (
        <CityImg
          alt="Charminar Icon"
          className="w-full h-full object-contain p-2"
          src="https://images.unsplash.com/photo-1610341940372-5aab4d3786cb?auto=format&fit=crop&w=200&q=60"
        />
      );

    if (name.includes('lucknow'))
      return (
        <CityImg
          alt="Lucknow Icon"
          className="w-full h-full object-contain p-2"
          src="data:image/jpeg;base64,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"
        />
      );

    return <MapPin className="w-8 h-8 text-gray-400" strokeWidth={1.5} />;
  };

  return (
    <section className="py-16 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Find Suppliers from Top Cities</h2>
          <p className="text-gray-500 text-lg">Connect with verified suppliers across India's major business hubs</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-10">
          {cities.map((city, index) => (
            <motion.div
              key={city.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
              onClick={() => navigate(`/directory/city/${city.slug}`)}
              className="bg-white border border-gray-100 rounded-xl p-6 flex flex-col items-center justify-center hover:shadow-lg hover:border-blue-100 transition-all cursor-pointer group h-full"
              title={city.name}
            >
              <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mb-4 group-hover:bg-blue-50 transition-colors overflow-hidden border border-gray-100">
                <CityIcon city={city} />
              </div>
              <h3 className="font-bold text-gray-800 text-lg group-hover:text-blue-700 transition-colors">
                {city.name}
              </h3>
              <p className="text-sm text-gray-500 font-medium">
                {formatCount(city.supplier_count)} suppliers
              </p>
            </motion.div>
          ))}
        </div>

        <div className="flex justify-center">
          <Button
            onClick={() => navigate('/directory/cities')}
            className="bg-[#4F46E5] hover:bg-[#4338ca] text-white px-8 h-12 rounded-lg font-medium shadow-md shadow-blue-200"
          >
            View All Cities <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      </div>
    </section>
  );
};

export default TopCitiesSection;
