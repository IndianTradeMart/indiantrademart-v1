import { supabase } from '@/lib/customSupabaseClient';

export const locationService = {
  // Fetch all states
  getStates: async () => {
    const { data, error } = await supabase
      .from('states')
      .select('*')
      .eq('is_active', true)
      .order('name');
    
    if (error) {
      console.error('Error fetching states (is_active filter):', error);
    }

    if (Array.isArray(data) && data.length > 0) return data;

    const { data: fallback, error: fallbackError } = await supabase
      .from('states')
      .select('*')
      .order('name');

    if (fallbackError) {
      console.error('Error fetching states:', fallbackError);
      return [];
    }
    return fallback || [];
  },

  // Fetch cities for a specific state
  getCities: async (stateId) => {
    if (!stateId) return [];
    
    const { data, error } = await supabase
      .from('cities')
      .select('*')
      .eq('state_id', stateId)
      .eq('is_active', true)
      .order('name');
      
    if (error) {
      console.error('Error fetching cities (is_active filter):', error);
    }

    if (Array.isArray(data) && data.length > 0) return data;

    const { data: fallback, error: fallbackError } = await supabase
      .from('cities')
      .select('*')
      .eq('state_id', stateId)
      .order('name');

    if (fallbackError) {
      console.error('Error fetching cities:', fallbackError);
      return [];
    }
    return fallback || [];
  },

  // Fetch cities by state slug for nearby navigation
  getCitiesByStateSlug: async (stateSlug) => {
    if (!stateSlug) return [];

    try {
      // First get state ID
      const { data: stateData, error: stateError } = await supabase
        .from('states')
        .select('id')
        .eq('slug', stateSlug)
        .single();

      if (stateError || !stateData) return [];

      // Then get cities
      const { data: cities, error: citiesError } = await supabase
        .from('cities')
        .select('*')
        .eq('state_id', stateData.id)
        .eq('is_active', true)
        .order('name');

      if (citiesError) return [];
      
      // Add fake cities if none exist (for demo purposes if DB is empty)
      if (cities.length === 0) {
         return [
            { id: '101', name: 'Gurugram', slug: 'gurugram' },
            { id: '102', name: 'Noida', slug: 'noida' },
            { id: '103', name: 'Faridabad', slug: 'faridabad' },
            { id: '104', name: 'Ghaziabad', slug: 'ghaziabad' },
            { id: '105', name: 'Rohtak', slug: 'rohtak' },
         ];
      }

      return cities;
    } catch (e) {
      console.error("Error fetching nearby cities", e);
      return [];
    }
  },

  // Helper to find location details by slug
  getLocationBySlug: async (stateSlug, citySlug) => {
    try {
        let state = null;
        let city = null;

        if (stateSlug) {
            const { data: sData } = await supabase.from('states').select('*').eq('slug', stateSlug).single();
            state = sData;
        }

        if (citySlug && state) {
            const { data: cData } = await supabase.from('cities').select('*').eq('slug', citySlug).eq('state_id', state.id).single();
            city = cData;
        }

        return { state, city };
    } catch (e) {
        console.error("Location lookup failed", e);
        return { state: null, city: null };
    }
  },

  seedLocations: async () => {
      return true;
  }
};
