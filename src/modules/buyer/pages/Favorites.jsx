
import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/shared/components/Card';
import { Star, MapPin, ExternalLink, HeartOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { buyerApi } from '@/modules/buyer/services/buyerApi';

const Favorites = () => {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchFavorites();
    }
  }, [user]);

  const fetchFavorites = async () => {
    try {
      setLoading(true);
      const data = await buyerApi.getFavorites();
      setFavorites(data || []);
    } catch (err) {
      console.error("Error fetching favorites:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFavorite = async (favId) => {
    // Optimistic UI update
    setFavorites(prev => prev.filter(f => f.id !== favId));
    
    // API call
    const target = favorites.find((f) => f.id === favId);
    const vendorId = target?.vendor_id || target?.vendors?.id || null;
    if (!vendorId) {
      fetchFavorites();
      return;
    }

    try {
      await buyerApi.removeFavorite(vendorId);
    } catch (error) {
      console.error("Failed to remove favorite", error);
      fetchFavorites(); // Revert on error
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
         <div>
            <h1 className="text-2xl font-bold text-gray-900">Saved Vendors</h1>
            <p className="text-gray-500">Quick access to your preferred suppliers</p>
         </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-20">
           <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : favorites.length === 0 ? (
        <Card className="bg-gray-50 border-dashed border-2 p-10 flex flex-col items-center justify-center text-center">
           <div className="h-16 w-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
              <Star className="h-8 w-8 text-gray-400" />
           </div>
           <h3 className="text-lg font-semibold text-gray-900">No Favorites Yet</h3>
           <p className="text-gray-500 mb-6 max-w-sm">Browse the directory and save vendors you trust to quickly access them here.</p>
           <Link to="/directory">
              <Button>Browse Directory</Button>
           </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {favorites.map((fav) => {
            const vendor = fav.vendors;
            if (!vendor) return null;

            return (
              <Card key={fav.id} className="overflow-hidden hover:shadow-md transition-shadow group">
                <div className="h-32 bg-gray-100 relative overflow-hidden flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
                   <span className="text-4xl font-bold text-blue-200">{vendor.company_name?.charAt(0)}</span>
                   
                   <button 
                     onClick={() => handleRemoveFavorite(fav.id)}
                     className="absolute top-2 right-2 p-2 bg-white/90 rounded-full text-red-500 hover:bg-red-50 transition-colors shadow-sm"
                     title="Remove from favorites"
                   >
                     <Star className="h-4 w-4 fill-current" />
                   </button>
                </div>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-2">
                     <div>
                        <h3 className="font-bold text-lg text-gray-900 line-clamp-1">{vendor.company_name}</h3>
                        <div className="flex items-center text-sm text-gray-500 mt-1">
                          <MapPin className="h-3 w-3 mr-1" /> {vendor.city}, {vendor.state}
                        </div>
                     </div>
                  </div>
                  
                  <div className="flex gap-3 mt-4">
                     <Link to={`/directory/vendor/${vendor.id}`} className="flex-1">
                        <Button variant="outline" className="w-full h-9 text-xs">
                          View Profile <ExternalLink className="h-3 w-3 ml-2" />
                        </Button>
                     </Link>
                     <Button className="flex-1 h-9 text-xs bg-[#003D82]">
                        Contact
                     </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Favorites;
