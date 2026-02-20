
import React, { useState } from 'react';
import { Search, Menu } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigate } from 'react-router-dom';
import NotificationBell from '@/shared/components/NotificationBell';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const BuyerHeaderSearch = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      // Navigate to directory search page - converts search term to slug format
      const searchSlug = searchTerm.trim().toLowerCase().replace(/\s+/g, '-');
      navigate(`/directory/${searchSlug}`);
      setSearchTerm('');
    }
  };

  return (
    <div className="h-16 px-6 flex items-center justify-between gap-4 bg-white border-b border-gray-100">
      {/* Search Bar */}
      <form className="flex-1 max-w-xl" onSubmit={handleSearch}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input 
            placeholder="Search for products, suppliers, or categories..." 
            className="pl-9 bg-gray-50 border-gray-200 focus-visible:ring-[#003D82] w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </form>

      {/* Right Actions */}
      <div className="flex items-center gap-3">
        <NotificationBell userId={user?.id || user?.user_id || null} />
        
        <div className="hidden md:flex items-center gap-3 pl-3 border-l ml-1">
           <div className="text-right hidden lg:block">
              <p className="text-sm font-semibold text-gray-900 leading-none truncate max-w-[150px]">
                {user?.full_name || 'Buyer Account'}
              </p>
              <p className="text-xs text-gray-500 mt-1 truncate max-w-[150px]">{user?.email}</p>
           </div>
           <Avatar className="h-8 w-8 border border-gray-200">
             <AvatarImage src={user?.avatar_url} alt={user?.full_name} />
             <AvatarFallback className="bg-[#003D82] text-white font-bold">
               {user?.full_name?.charAt(0) || 'B'}
             </AvatarFallback>
           </Avatar>
        </div>

        {/* Mobile Menu Toggle (Visible only on small screens) */}
        <Button variant="ghost" size="icon" className="md:hidden text-gray-600">
           <Menu className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};

export default BuyerHeaderSearch;
