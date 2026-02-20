
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { categoryApi } from '@/modules/directory/services/categoryApi';

const CategoryHierarchy = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await categoryApi.getTopLevelCategories();
        setCategories(data);
        if (data.length > 0) {
          setExpandedId(data[0].id);
        }
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Explore Categories</h2>
      
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left Sidebar: Main Categories */}
        <div className="w-full md:w-1/4 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
           {categories.map((cat) => (
             <button
               key={cat.id}
               onClick={() => setExpandedId(cat.id)}
               className={`w-full text-left px-4 py-3 flex items-center justify-between border-b last:border-0 border-gray-100 hover:bg-green-50 transition-colors ${expandedId === cat.id ? 'bg-green-50 text-[#059669] font-semibold border-l-4 border-l-[#059669]' : 'text-gray-700'}`}
             >
               <span className="flex items-center gap-3">
                 {/* Icon simulation using text for now, or lucide if dynamic map used */}
                 {cat.name}
               </span>
               <ChevronRight className={`w-4 h-4 ${expandedId === cat.id ? 'text-[#059669]' : 'text-gray-400'}`} />
             </button>
           ))}
           <div className="p-3 text-center border-t bg-gray-50">
             <button onClick={() => navigate('/categories')} className="text-sm text-[#059669] font-semibold hover:underline">View All Categories</button>
           </div>
        </div>

        {/* Right Content: Sub & Micro Categories */}
        <div className="flex-1">
           {categories.filter(c => c.id === expandedId).map((mainCat) => (
             <div key={mainCat.id} className="space-y-8 animate-in fade-in duration-300">
                {/* Banner/Header for Main Category */}
                <div className="relative h-48 rounded-lg overflow-hidden shadow-sm">
                   <img src={mainCat.image} alt={mainCat.name} className="w-full h-full object-cover" />
                   <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end p-6">
                      <h3 className="text-3xl font-bold text-white">{mainCat.name}</h3>
                   </div>
                </div>

                {/* Sub Categories Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {mainCat.subs.map((sub) => (
                     <div key={sub.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                        <div className="flex h-full">
                           {/* Sub Cat Image */}
                           <div className="w-1/3 bg-gray-100 relative">
                             <img src={sub.image} alt={sub.name} className="w-full h-full object-cover" />
                           </div>
                           
                           {/* Micro Links */}
                           <div className="w-2/3 p-4 flex flex-col">
                             <h4 className="font-bold text-gray-800 mb-2 cursor-pointer hover:text-[#059669]" onClick={() => navigate(`/search?category=${mainCat.slug}&sub=${sub.slug}`)}>
                               {sub.name}
                             </h4>
                             <ul className="space-y-1.5 flex-1">
                               {sub.micros.slice(0, 4).map((micro) => (
                                 <li key={micro.id}>
                                   <button 
                                     onClick={() => navigate(`/search?category=${mainCat.slug}&sub=${sub.slug}&micro=${micro.slug}`)}
                                     className="text-sm text-gray-600 hover:text-[#059669] hover:underline text-left"
                                   >
                                     {micro.name}
                                   </button>
                                 </li>
                               ))}
                             </ul>
                             <button className="text-xs text-[#059669] font-medium mt-3 text-left hover:underline">
                               View All &rarr;
                             </button>
                           </div>
                        </div>
                     </div>
                   ))}
                </div>
             </div>
           ))}
        </div>
      </div>
    </div>
  );
};

export default CategoryHierarchy;
