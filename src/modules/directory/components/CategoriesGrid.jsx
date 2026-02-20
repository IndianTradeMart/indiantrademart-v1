import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Laptop, Shirt, Cog, FlaskConical, Hammer, Wheat, 
  Car, Package, HeartPulse, UtensilsCrossed, Armchair, Printer 
} from 'lucide-react';
import { categoryApi } from '@/modules/directory/services/categoryApi';
import { Button } from '@/components/ui/button';

const iconMap = {
  Laptop, Shirt, Cog, FlaskConical, Hammer, Wheat,
  Car, Package, HeartPulse, UtensilsCrossed, Armchair, Printer
};

const CategoriesGrid = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await categoryApi.getTopLevelCategories();
        setCategories(data);
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, []);

  return (
    <section className="py-16 bg-neutral-50">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-[#003D82] mb-4">
            Browse by Category
          </h2>
          <p className="text-lg text-neutral-600">
            Explore thousands of products across multiple categories
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-10">
          {categories.slice(0, 12).map((category, index) => {
            const Icon = iconMap[category.icon];
            return (
              <motion.button
                key={category.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                whileHover={{ y: -8, scale: 1.05 }}
                onClick={() => navigate(`/categories/${category.slug}`)}
                className="bg-white rounded-lg p-6 shadow-md hover:shadow-xl transition-all border border-neutral-200 text-center group"
              >
                <div 
                  className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${category.color}15` }}
                >
                  <Icon 
                    className="h-8 w-8 group-hover:scale-110 transition-transform" 
                    style={{ color: category.color }}
                  />
                </div>
                <h3 className="font-semibold text-neutral-800 mb-1">
                  {category.name}
                </h3>
                <p className="text-sm text-neutral-500">
                  {category.count.toLocaleString()} products
                </p>
              </motion.button>
            );
          })}
        </div>
        
        <div className="text-center">
          <Button 
            variant="outline" 
            size="lg"
            className="border-[#003D82] text-[#003D82] hover:bg-[#003D82] hover:text-white"
            onClick={() => navigate('/categories')}
          >
            View All Categories
          </Button>
        </div>
      </div>
    </section>
  );
};

export default CategoriesGrid;