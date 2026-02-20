import React, { useEffect, useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Loader2, Search, ChevronRight, CheckCircle } from 'lucide-react';
import { directoryApi } from '@/modules/directory/api/directoryApi';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';

const CategoryTypeahead = ({ onSelect, defaultValue = '', placeholder = "Search category...", disabled = false, onAutoSelect = null }) => {
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const wrapperRef = useRef(null);

  useEffect(() => {
    // Hide suggestions on click outside
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShow(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length >= 2) {
        setLoading(true);
        try {
          const results = await directoryApi.searchMicroCategories(query);
          setSuggestions(results);
          
          // Just show dropdown, don't auto-select
          if (results.length > 0) {
            setShow(true);
          } else {
            setShow(false);
          }
          
          setHighlightIndex(-1);
        } catch (e) {
          console.error(e);
          setSuggestions([]);
        } finally {
          setLoading(false);
        }
      } else {
        setSuggestions([]);
        setShow(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleKeyDown = (e) => {
    if (!show || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0) {
        handleSelect(suggestions[highlightIndex]);
      }
    } else if (e.key === 'Escape') {
      setShow(false);
    }
  };

  const handleSelect = (item) => {
    setQuery(item.name);
    setShow(false);
    onSelect(item);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <Input 
          value={query} 
          onChange={(e) => { setQuery(e.target.value); if(!e.target.value) onSelect(null); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="pr-8"
          disabled={disabled}
        />
        <div className="absolute right-2 top-2.5 text-slate-400">
           {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Search className="w-4 h-4"/>}
        </div>
      </div>
      
      {show && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto">
          {suggestions.map((item, idx) => (
            <div 
              key={item.id} 
              className={cn(
                "px-4 py-2 cursor-pointer text-sm border-b last:border-0",
                idx === highlightIndex ? "bg-blue-50 text-[#003D82]" : "hover:bg-slate-50 text-slate-700"
              )}
              onClick={() => handleSelect(item)}
            >
              <div className="font-medium flex items-center gap-2">
                {item.name}
                {item.type && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${item.type === 'micro' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                    {item.type === 'micro' ? 'Micro' : 'Sub'}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 flex items-center gap-1">
                 {item.path.split(' > ').join(' › ')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CategoryTypeahead;