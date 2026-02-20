
import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';
import { categoryApi } from '@/modules/directory/services/categoryApi';
import { supabase } from '@/lib/customSupabaseClient';
import Breadcrumbs from '@/shared/components/Breadcrumbs';
import SearchResultsList from '@/modules/directory/components/SearchResultsList';

const CategoryDetail = () => {
  const { slug } = useParams();
  const [category, setCategory] = useState(null);
  const [categoryProducts, setCategoryProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const categoryData = await categoryApi.getCategoryBySlug(slug);
        setCategory(categoryData);
        
        if (categoryData) {
          const { data: products } = await supabase
            .from('products')
            .select('*')
            .or(`category.ilike.%${categoryData.name}%,category_path.ilike.%${slug}%`);
          setCategoryProducts(products || []);
        }
      } catch (error) {
        console.error('Failed to load category:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [slug]);

  if (!category) {
    return <div className="container mx-auto px-4 py-8">Category not found</div>;
  }

  return (
    <>
      <Helmet>
        <title>{category.name} Suppliers & Products - IndianTradeMart</title>
        <meta name="description" content={`Find verified ${category.name} suppliers and manufacturers in India. Compare prices and get quotes for ${category.name} products.`} />
      </Helmet>

      <div className="min-h-screen bg-neutral-50">
        <div className="bg-[#003D82] text-white py-12">
          <div className="container mx-auto px-4">
            <Breadcrumbs />
            <h1 className="text-3xl md:text-4xl font-bold mb-2">
              {category.name}
            </h1>
            <p className="text-white/80 text-lg">
              {category.count.toLocaleString()} verified products available
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
           <SearchResultsList 
             filters={{ priceRange: [0, 1000000], rating: 0, verified: false, inStock: false }} 
             query="" 
             city="" 
             category={category.name} 
           />
        </div>
      </div>
    </>
  );
};

export default CategoryDetail;
