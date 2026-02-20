import { locationService } from '@/shared/services/locationService';

// Hardcoded for synchronous parsing when needed, though typically we'd fetch from DB.
// In a real app, this might be generated at build time or cached.
const KNOWN_STATES = [
    { name: 'Andhra Pradesh', slug: 'andhra-pradesh' },
    { name: 'Arunachal Pradesh', slug: 'arunachal-pradesh' },
    { name: 'Assam', slug: 'assam' },
    { name: 'Bihar', slug: 'bihar' },
    { name: 'Chhattisgarh', slug: 'chhattisgarh' },
    { name: 'Goa', slug: 'goa' },
    { name: 'Gujarat', slug: 'gujarat' },
    { name: 'Haryana', slug: 'haryana' },
    { name: 'Himachal Pradesh', slug: 'himachal-pradesh' },
    { name: 'Jharkhand', slug: 'jharkhand' },
    { name: 'Karnataka', slug: 'karnataka' },
    { name: 'Kerala', slug: 'kerala' },
    { name: 'Madhya Pradesh', slug: 'madhya-pradesh' },
    { name: 'Maharashtra', slug: 'maharashtra' },
    { name: 'Manipur', slug: 'manipur' },
    { name: 'Meghalaya', slug: 'meghalaya' },
    { name: 'Mizoram', slug: 'mizoram' },
    { name: 'Nagaland', slug: 'nagaland' },
    { name: 'Odisha', slug: 'odisha' },
    { name: 'Punjab', slug: 'punjab' },
    { name: 'Rajasthan', slug: 'rajasthan' },
    { name: 'Sikkim', slug: 'sikkim' },
    { name: 'Tamil Nadu', slug: 'tamil-nadu' },
    { name: 'Telangana', slug: 'telangana' },
    { name: 'Tripura', slug: 'tripura' },
    { name: 'Uttar Pradesh', slug: 'uttar-pradesh' },
    { name: 'Uttarakhand', slug: 'uttarakhand' },
    { name: 'West Bengal', slug: 'west-bengal' },
    { name: 'Delhi', slug: 'delhi' },
    { name: 'Chandigarh', slug: 'chandigarh' },
    { name: 'Jammu and Kashmir', slug: 'jammu-and-kashmir' },
    { name: 'Ladakh', slug: 'ladakh' },
    { name: 'Puducherry', slug: 'puducherry' }
];

// Sort by length desc to match longest slugs first
const SORTED_STATES = KNOWN_STATES.sort((a, b) => b.slug.length - a.slug.length);

export const urlParser = {
    parseSeoSlug: (fullSlug) => {
        if (!fullSlug || typeof fullSlug !== 'string') return null;

        const delimiter = '-in-';
        const parts = fullSlug.split(delimiter);

        if (parts.length < 2) {
            return { serviceSlug: fullSlug, citySlug: null, stateSlug: null };
        }

        let serviceSlug = parts[0];
        let locationPart = parts.slice(1).join(delimiter);

        const lastIndex = fullSlug.lastIndexOf(delimiter);
        if (lastIndex !== -1) {
             serviceSlug = fullSlug.substring(0, lastIndex);
             locationPart = fullSlug.substring(lastIndex + delimiter.length);
        }

        let stateSlug = null;
        let citySlug = null;

        for (const state of SORTED_STATES) {
            if (locationPart.endsWith(state.slug)) {
                stateSlug = state.slug;
                const cityPart = locationPart.slice(0, -(state.slug.length));
                if (cityPart.endsWith('-')) {
                    citySlug = cityPart.slice(0, -1);
                } else if (cityPart === '') {
                     citySlug = null; 
                } else {
                     citySlug = cityPart; 
                }
                break;
            }
        }

        if (!stateSlug) {
            const exactState = SORTED_STATES.find(s => s.slug === locationPart);
            if (exactState) {
                stateSlug = exactState.slug;
                citySlug = null;
            } else {
                citySlug = locationPart; 
            }
        }

        return { serviceSlug, citySlug, stateSlug };
    },

    createSeoUrl: (serviceSlug, stateSlug, citySlug) => {
        let url = `/directory/${serviceSlug}`;
        if (stateSlug && citySlug) {
            url += `-in-${citySlug}-${stateSlug}`;
        } else if (stateSlug) {
            url += `-in-${stateSlug}`;
        }
        return url;
    },
    
    // ✅ Important: moved under /directory/search/... to avoid conflict with category routes
    createStructuredUrl: (serviceSlug, stateSlug, citySlug) => {
        let url = `/directory/search/${serviceSlug}`;
        if (stateSlug) url += `/${stateSlug}`;
        if (citySlug) url += `/${citySlug}`;
        return url;
    }
};