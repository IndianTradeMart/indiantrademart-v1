import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { urlParser } from '@/shared/utils/urlParser';

const slugify = (value) => {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

// Extract inline location from query like:
// "land survey in delhi" -> { cleanQuery: "land survey", inlineLocation: "delhi" }
const extractInlineLocation = (q = '') => {
  const text = (q || '').trim();
  if (!text) return { cleanQuery: '', inlineLocation: '' };

  // prefer last occurrence of " in " or " near "
  const match = text.match(/\s+(?:in|near)\s+([^,]+)$/i);
  if (!match) return { cleanQuery: text, inlineLocation: '' };

  const inlineLocation = (match[1] || '').trim();
  const cleanQuery = text.slice(0, match.index).trim();
  return { cleanQuery, inlineLocation };
};

// Resolve a free-text location to { stateSlug, citySlug }
// Supports:
// - "Delhi" (state)
// - "West Delhi" (city) -> looks up city, then fetches its state
// - "Katihar, Bihar" (city, state)
const resolveLocationSlugs = async (locationText = '') => {
  const raw = (locationText || '').trim();
  if (!raw) return { stateSlug: '', citySlug: '' };

  // If user typed "City, State"
  if (raw.includes(',')) {
    const [cityPart, statePart] = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const stateSlug = slugify(statePart || '');
    const citySlug = slugify(cityPart || '');
    return { stateSlug, citySlug };
  }

  const maybeSlug = slugify(raw);
  if (!maybeSlug) return { stateSlug: '', citySlug: '' };

  // 1) Try state first
  try {
    const { data: sData } = await supabase
      .from('states')
      .select('id, slug')
      .eq('slug', maybeSlug)
      .maybeSingle();

    if (sData?.slug) {
      return { stateSlug: sData.slug, citySlug: '' };
    }
  } catch (e) {
    // ignore
  }

  // 2) Try city and fetch its state
  try {
    const { data: cData } = await supabase
      .from('cities')
      .select('slug, state_id')
      .eq('slug', maybeSlug)
      .maybeSingle();

    if (cData?.slug && cData?.state_id) {
      const { data: sData } = await supabase
        .from('states')
        .select('slug')
        .eq('id', cData.state_id)
        .maybeSingle();

      if (sData?.slug) {
        return { stateSlug: sData.slug, citySlug: cData.slug };
      }
    }
  } catch (e) {
    // ignore
  }

  // 3) Fallback: treat as state slug (better than showing All India)
  return { stateSlug: maybeSlug, citySlug: '' };
};

const HeroSection = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    const q0 = (query || '').trim();
    if (!q0) return;

    // If user typed "... in delhi" inside query and left location empty, extract it.
    let finalLocationText = (location || '').trim();
    let finalQueryText = q0;

    if (!finalLocationText) {
      const { cleanQuery, inlineLocation } = extractInlineLocation(q0);
      if (inlineLocation) {
        finalLocationText = inlineLocation;
        finalQueryText = cleanQuery || q0;
        // update UI (optional, but helps user understand)
        setLocation(inlineLocation);
        setQuery(cleanQuery);
      }
    }

    const serviceSlug = slugify(finalQueryText);
    if (!serviceSlug) return;

    const { stateSlug, citySlug } = await resolveLocationSlugs(finalLocationText);
    const url = urlParser.createStructuredUrl(serviceSlug, stateSlug, citySlug);
    navigate(url);
  };

  return (
    <div className="relative bg-slate-900 pt-20 pb-24 lg:pt-32 lg:pb-40 overflow-hidden">
      {/* Professional Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 opacity-90 z-0"></div>

      {/* Decorative Abstract Shapes */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-blue-500 opacity-10 blur-3xl"></div>
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-indigo-500 opacity-10 blur-3xl"></div>

      <div className="container mx-auto px-4 relative z-10 text-center">
        <div className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium text-blue-200 ring-1 ring-inset ring-blue-700/30 bg-blue-900/30 mb-6">
          <span className="flex h-2 w-2 rounded-full bg-blue-400 mr-2"></span>
          India's Leading B2B Marketplace
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-6 tracking-tight">
          Connect with Trusted <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-blue-400">
            Manufacturers & Suppliers
          </span>
        </h1>

        <p className="text-lg md:text-xl text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed">
          Discover verified business partners, source quality products, and grow your network with confidence on our
          secure platform.
        </p>

        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSearch} className="bg-white p-2 rounded-xl shadow-2xl flex flex-col md:flex-row gap-2">
            {/* Location Input */}
            <div className="flex items-center md:w-1/3 px-4 bg-slate-50 rounded-lg border border-transparent focus-within:border-blue-500 focus-within:bg-white transition-all duration-200">
              <MapPin className="h-5 w-5 text-slate-400 mr-3 flex-shrink-0" />
              <Input
                className="border-0 bg-transparent focus-visible:ring-0 px-0 h-14 text-slate-900 placeholder:text-slate-400 font-medium"
                placeholder="Location (e.g. Mumbai)"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            {/* Keyword Input */}
            <div className="flex items-center flex-1 px-4 bg-slate-50 rounded-lg border border-transparent focus-within:border-blue-500 focus-within:bg-white transition-all duration-200">
              <Search className="h-5 w-5 text-slate-400 mr-3 flex-shrink-0" />
              <Input
                className="border-0 bg-transparent focus-visible:ring-0 px-0 h-14 text-slate-900 placeholder:text-slate-400 font-medium"
                placeholder="Search products, services, or companies..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {/* Search Button */}
            <Button
              type="submit"
              className="h-14 px-8 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-lg shadow-lg md:w-auto w-full transition-all duration-200"
            >
              Search
            </Button>
          </form>
        </div>

        <div className="mt-8 flex flex-wrap justify-center items-center gap-4 text-sm text-slate-400">
          <span className="font-semibold text-slate-300">Trending:</span>
          <button
            onClick={() => setQuery('Industrial Machinery')}
            className="hover:text-blue-300 transition-colors px-3 py-1 bg-white/5 rounded-full border border-white/10"
          >
            Industrial Machinery
          </button>
          <button
            onClick={() => setQuery('Textiles')}
            className="hover:text-blue-300 transition-colors px-3 py-1 bg-white/5 rounded-full border border-white/10"
          >
            Textiles
          </button>
          <button
            onClick={() => setQuery('Chemicals')}
            className="hover:text-blue-300 transition-colors px-3 py-1 bg-white/5 rounded-full border border-white/10"
          >
            Chemicals
          </button>
          <button
            onClick={() => setQuery('Electronics')}
            className="hover:text-blue-300 transition-colors px-3 py-1 bg-white/5 rounded-full border border-white/10"
          >
            Electronics
          </button>
        </div>
      </div>
    </div>
  );
};

export default HeroSection;
