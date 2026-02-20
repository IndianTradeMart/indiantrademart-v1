
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SearchBar = ({ className = '' }) => {
  const [product, setProduct] = useState('');
  const [city, setCity] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    if (product.trim()) {
      navigate(`/search?q=${encodeURIComponent(product)}&city=${encodeURIComponent(city)}`);
    }
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      onSubmit={handleSearch}
      className={`bg-white rounded-lg shadow-lg p-2 flex flex-col md:flex-row gap-2 ${className}`}
    >
      <div className="flex-1 flex items-center gap-2 px-4 py-2 border-b md:border-b-0 md:border-r border-neutral-200">
        <Search className="h-5 w-5 text-neutral-400 flex-shrink-0" />
        <input
          type="text"
          placeholder="Search products or services..."
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          className="flex-1 outline-none text-neutral-700 placeholder:text-neutral-400"
        />
      </div>
      <div className="flex-1 flex items-center gap-2 px-4 py-2">
        <MapPin className="h-5 w-5 text-neutral-400 flex-shrink-0" />
        <input
          type="text"
          placeholder="Enter city name..."
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="flex-1 outline-none text-neutral-700 placeholder:text-neutral-400"
        />
      </div>
      <Button
        type="submit"
        className="bg-[#00A699] hover:bg-[#00857A] text-white px-8 py-6 rounded-md"
      >
        Search
      </Button>
    </motion.form>
  );
};

export default SearchBar;
