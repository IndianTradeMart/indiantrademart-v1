
import React from 'react';
import { motion } from 'framer-motion';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/react-slider';
import Card from '@/shared/components/Card';

const SearchFilters = ({ filters, setFilters }) => {
  const handleReset = () => {
    setFilters({
      priceRange: [0, 100000],
      rating: 0,
      verified: false,
      inStock: false,
    });
  };

  return (
    <Card>
      <Card.Header>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-[#003D82]" />
            <Card.Title>Filters</Card.Title>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-[#00A699] hover:text-[#00857A]"
          >
            <X className="h-4 w-4 mr-1" />
            Reset
          </Button>
        </div>
      </Card.Header>
      
      <Card.Content className="space-y-6">
        {/* Price Range */}
        <div>
          <Label className="text-sm font-semibold mb-3 block">Price Range</Label>
          <Slider
            value={filters.priceRange}
            onValueChange={(value) => setFilters({ ...filters, priceRange: value })}
            min={0}
            max={100000}
            step={1000}
            className="mb-2"
          />
          <div className="flex justify-between text-sm text-neutral-600">
            <span>₹{filters.priceRange[0].toLocaleString()}</span>
            <span>₹{filters.priceRange[1].toLocaleString()}</span>
          </div>
        </div>

        {/* Rating */}
        <div>
          <Label className="text-sm font-semibold mb-3 block">Minimum Rating</Label>
          <div className="space-y-2">
            {[4, 3, 2, 1].map((rating) => (
              <div key={rating} className="flex items-center space-x-2">
                <Checkbox
                  id={`rating-${rating}`}
                  checked={filters.rating === rating}
                  onCheckedChange={(checked) => 
                    setFilters({ ...filters, rating: checked ? rating : 0 })
                  }
                />
                <label
                  htmlFor={`rating-${rating}`}
                  className="text-sm cursor-pointer"
                >
                  {rating}★ & above
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Verified Suppliers */}
        <div>
          <Label className="text-sm font-semibold mb-3 block">Supplier Status</Label>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="verified"
                checked={filters.verified}
                onCheckedChange={(checked) => 
                  setFilters({ ...filters, verified: checked })
                }
              />
              <label htmlFor="verified" className="text-sm cursor-pointer">
                Verified Suppliers Only
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="inStock"
                checked={filters.inStock}
                onCheckedChange={(checked) => 
                  setFilters({ ...filters, inStock: checked })
                }
              />
              <label htmlFor="inStock" className="text-sm cursor-pointer">
                In Stock Only
              </label>
            </div>
          </div>
        </div>
      </Card.Content>
    </Card>
  );
};

export default SearchFilters;
