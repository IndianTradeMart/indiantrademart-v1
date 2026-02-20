import React, { useState, useEffect } from 'react';
import { Loader2, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { directoryApi } from '../api/directoryApi';

const BrowseByIndustry = ({ limit = 9 }) => {
  const navigate = useNavigate();
  const [headCategories, setHeadCategories] = useState([]);
  const [expandedHeadId, setExpandedHeadId] = useState(null);
  const [subCategoriesMap, setSubCategoriesMap] = useState({});
  const [microCategoriesMap, setMicroCategoriesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingSubFor, setLoadingSubFor] = useState(null);
  const displayedCategories = headCategories.slice(0, limit);
  const hasMoreCategories = headCategories.length > limit;

  // Fetch head categories on mount
  useEffect(() => {
    const fetchHeadCategories = async () => {
      try {
        setLoading(true);
        const categories = await directoryApi.getHeadCategories();
        setHeadCategories(categories);
      } catch (error) {
        console.error('Error fetching head categories:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchHeadCategories();
  }, []);

  // Load sub categories when head category is expanded
  const handleExpandHead = async (headCategory) => {
    if (expandedHeadId === headCategory.id) {
      setExpandedHeadId(null);
      return;
    }

    // Already loaded
    if (subCategoriesMap[headCategory.id]) {
      setExpandedHeadId(headCategory.id);
      return;
    }

    try {
      setLoadingSubFor(headCategory.id);
      const subCategories = await directoryApi.getSubCategories(headCategory.slug);
      setSubCategoriesMap((prev) => ({
        ...prev,
        [headCategory.id]: subCategories
      }));
      setExpandedHeadId(headCategory.id);
    } catch (error) {
      console.error('Error fetching sub categories:', error);
    } finally {
      setLoadingSubFor(null);
    }
  };

  // Load micro categories when sub category is expanded
  const handleExpandSub = async (subCategory, headCategory) => {
    const key = `${headCategory.id}-${subCategory.id}`;

    if (microCategoriesMap[key]) {
      // Toggle off
      setMicroCategoriesMap((prev) => ({
        ...prev,
        [key]: null
      }));
      return;
    }

    try {
      // ✅ Pass head slug too so sub-category resolves uniquely even if slug duplicates across heads
      const microCategories = await directoryApi.getMicroCategories(subCategory.slug, headCategory.slug);
      setMicroCategoriesMap((prev) => ({
        ...prev,
        [key]: microCategories
      }));
    } catch (error) {
      console.error('Error fetching micro categories:', error);
    }
  };

  if (loading) {
    return (
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4 text-center">
          <Loader2 className="h-12 w-12 text-blue-600 animate-spin mx-auto" />
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 bg-gray-50">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Browse by Industry</h1>
          <p className="text-gray-600 text-lg max-w-2xl">
            Comprehensive product listings from top manufacturers and verified suppliers across key sectors.
          </p>
        </div>

        {/* Head Categories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {displayedCategories.map((headCategory) => (
            <div
              key={headCategory.id}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Card Header with Image */}
              <div
                onClick={() => handleExpandHead(headCategory)}
                className="cursor-pointer bg-gradient-to-br from-blue-50 to-blue-100 p-6 h-40 flex flex-col items-center justify-center"
              >
                {headCategory.image_url ? (
                  <img
                    src={headCategory.image_url}
                    alt={headCategory.name}
                    className="h-32 w-32 object-cover rounded-lg"
                  />
                ) : (
                  <div className="text-5xl mb-2">📦</div>
                )}
              </div>

              {/* Card Body */}
              <div className="p-6">
                <div
                  onClick={() => handleExpandHead(headCategory)}
                  className="cursor-pointer flex items-start justify-between mb-4"
                >
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900">{headCategory.name}</h3>
                    <p className="text-blue-600 text-sm font-medium">High Demand</p>
                  </div>
                  <ChevronRight
                    className={`h-5 w-5 text-gray-400 transition-transform ${
                      expandedHeadId === headCategory.id ? 'rotate-90' : ''
                    }`}
                  />
                </div>

                <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                  {headCategory.description || 'Industrial machinery, raw materials, tools...'}
                </p>

                {/* Expandable Sub Categories Section */}
                {expandedHeadId === headCategory.id && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    {loadingSubFor === headCategory.id ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {(subCategoriesMap[headCategory.id] || []).slice(0, 5).map((subCategory) => {
                          const microKey = `${headCategory.id}-${subCategory.id}`;
                          const hasMicro = microCategoriesMap[microKey];
                          const microCategories = microCategoriesMap[microKey] || [];

                          return (
                            <div key={subCategory.id}>
                              <button
                                onClick={() => handleExpandSub(subCategory, headCategory)}
                                className="w-full text-left flex items-center justify-between p-2 rounded hover:bg-blue-50 transition-colors text-sm"
                              >
                                <span className="font-medium text-gray-700">{subCategory.name}</span>
                                <ChevronRight
                                  className={`h-4 w-4 text-gray-400 transition-transform ${
                                    hasMicro ? 'rotate-90' : ''
                                  }`}
                                />
                              </button>

                              {/* Micro Categories */}
                              {hasMicro && microCategories.length > 0 && (
                                <div className="ml-4 mt-2 space-y-2">
                                  {microCategories.slice(0, 4).map((microCategory) => (
                                    <button
                                      key={microCategory.id}
                                      onClick={() =>
                                        navigate(
                                          `/directory/${headCategory.slug}/${subCategory.slug}/${microCategory.slug}`
                                        )
                                      }
                                      className="block text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors text-left"
                                    >
                                      • {microCategory.name}
                                    </button>
                                  ))}
                                  {microCategories.length > 4 && (
                                    <button
                                      onClick={() => navigate(`/directory/${headCategory.slug}/${subCategory.slug}`)}
                                      className="block text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors text-left"
                                    >
                                      + View All
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {(subCategoriesMap[headCategory.id] || []).length > 5 && (
                          <button
                            onClick={() => navigate(`/directory/${headCategory.slug}`)}
                            className="w-full text-center text-blue-600 hover:text-blue-800 font-medium text-sm py-2 border-t border-gray-200 hover:underline"
                          >
                            + View All Categories
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* View All Categories Button */}
        {hasMoreCategories && (
          <div className="text-center mt-12">
            <button
              onClick={() => navigate('/categories')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-3 rounded-lg font-bold text-lg transition-colors"
            >
              View All Categories
            </button>
          </div>
        )}

        {headCategories.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500 text-lg">No categories available yet.</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default BrowseByIndustry;
