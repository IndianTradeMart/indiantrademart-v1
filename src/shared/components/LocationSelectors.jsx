import React, { useState, useEffect, useRef } from 'react';
import { locationService } from '@/shared/services/locationService';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// Generic Searchable Select Component
const SearchableSelect = ({ 
  items, 
  value, 
  onChange, 
  placeholder = "Select...", 
  searchPlaceholder = "Search...", 
  disabled = false,
  isLoading = false
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  
  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedItem = items.find(item => item.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled || isLoading}
        >
          {selectedItem ? selectedItem.name : placeholder}
          {isLoading ? (
            <Loader2 className="ml-2 h-4 w-4 animate-spin opacity-50" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0 z-[10050]" align="start">
        <div className="p-2 border-b">
          <Input 
            placeholder={searchPlaceholder} 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="max-h-[200px] overflow-y-auto p-1">
          {filteredItems.length === 0 ? (
            <div className="py-2 text-center text-sm text-gray-500">No results found.</div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center rounded-sm px-2 py-1.5 text-sm outline-none cursor-pointer hover:bg-accent hover:text-accent-foreground",
                  value === item.id && "bg-accent text-accent-foreground"
                )}
                onClick={() => {
                  onChange(item.id, item);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === item.id ? "opacity-100" : "opacity-0"
                  )}
                />
                {item.name}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

// --- Main Components ---

export const StateDropdown = ({ value, onChange, className }) => {
  const [states, setStates] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchStates = async () => {
      setLoading(true);
      try {
        const data = await locationService.getStates();
        setStates(data);
      } catch (error) {
        console.error("Failed to load states", error);
      } finally {
        setLoading(false);
      }
    };
    fetchStates();
  }, []);

  return (
    <SearchableSelect
      items={states}
      value={value}
      onChange={onChange}
      placeholder="Select State"
      searchPlaceholder="Search state..."
      isLoading={loading}
    />
  );
};

export const CityDropdown = ({ stateId, value, onChange, className, disabled }) => {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!stateId) {
      setCities([]);
      return;
    }

    const fetchCities = async () => {
      setLoading(true);
      try {
        const data = await locationService.getCities(stateId);
        setCities(data);
      } catch (error) {
        console.error("Failed to load cities", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCities();
  }, [stateId]);

  return (
    <SearchableSelect
      items={cities}
      value={value}
      onChange={onChange}
      placeholder="Select City"
      searchPlaceholder="Search city..."
      disabled={disabled || !stateId}
      isLoading={loading}
    />
  );
};
