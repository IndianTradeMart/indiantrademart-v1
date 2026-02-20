
import { apiClient } from '@/shared/services/apiClient';

export const managementApi = {
  // Admin
  getSystemSettings: () => apiClient.get('/api/staff/admin/system-settings'),
  updateSystemSettings: (data) => apiClient.put('/api/staff/admin/system-settings', data),
  getAuditLogs: () => apiClient.get('/api/staff/admin/audit-logs'),
  importCategories: (csvData) => apiClient.post('/api/staff/master-data/categories/import-csv', csvData),

  // HR
  getStaffList: (filters) => apiClient.get(`/api/staff/hr/staff?${new URLSearchParams(filters)}`),
  createStaff: (data) => apiClient.post('/api/staff/hr/staff', data),
  getStaffDetail: (id) => apiClient.get(`/api/staff/hr/staff/${id}`),
  updateStaff: (id, data) => apiClient.put(`/api/staff/hr/staff/${id}`, data),
  
  // Pricing
  approvePricingRule: (ruleId) => apiClient.post(`/api/staff/hr/pricing-rules/${ruleId}/approve`),
  rejectPricingRule: (ruleId) => apiClient.post(`/api/staff/hr/pricing-rules/${ruleId}/reject`),
};
