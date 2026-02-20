
import { apiClient } from '@/shared/services/apiClient';

export const dirApi = {
  searchDirectory: (params) => {
    const query = new URLSearchParams(params).toString();
    return apiClient.get(`/api/dir/search?${query}`);
  },
  
  getVendorBySlug: (vendorSlug) => {
    return apiClient.get(`/api/dir/vendor/${vendorSlug}`);
  },

  getCategories: () => {
    return apiClient.get('/api/dir/categories');
  }
};
