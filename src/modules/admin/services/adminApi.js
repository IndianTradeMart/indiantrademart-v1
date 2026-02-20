import { supabase } from '@/lib/customSupabaseClient';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';

const isLocalHost = () => {
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
};

const getAdminBase = () => {
  const override = import.meta.env.VITE_ADMIN_API_BASE;
  if (override && String(override).trim()) return String(override).trim();
  return isLocalHost() ? "/api/admin" : "/.netlify/functions/admin";
};

export const adminApi = {
  getStats: async () => {
    const [users, vendors, orders] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('vendors').select('*', { count: 'exact', head: true }),
      supabase.from('lead_purchases').select('*', { count: 'exact', head: true })
    ]);

    let totalRevenue = 0;
    try {
      const res = await fetchWithCsrf(apiUrl('/api/finance/summary'));
      if (res.ok) {
        const data = await res.json();
        const d = data?.data || {};
        totalRevenue =
          Number(d.totalRevenue ?? d.totalNet ?? d.totalGross ?? 0) || 0;
      } else {
        throw new Error(`Finance summary failed: ${res.status}`);
      }
    } catch (e) {
      const { data: revenueData } = await supabase.from('lead_purchases').select('amount');
      const { data: subData } = await supabase.from('vendor_payments').select('amount');

      totalRevenue =
        (revenueData?.reduce((a, b) => a + (b.amount || 0), 0) || 0) +
        (subData?.reduce((a, b) => a + (b.amount || 0), 0) || 0);
    }

    return {
      totalUsers: users.count || 0,
      activeVendors: vendors.count || 0,
      totalOrders: orders.count || 0,
      totalRevenue: totalRevenue
    };
  },

  // ✅ NEW: Server-first dashboard counts (prevents buyers/products showing 0 due to RLS)
  getDashboardCounts: async () => {
    const ADMIN_API_BASE = getAdminBase();

    // 1) Prefer server-side counts (best: bypasses RLS issues)
    try {
      const res = await fetchWithCsrf(`${ADMIN_API_BASE}/dashboard/counts`);

      if (res.ok) {
        const data = await res.json();

        // Accept multiple possible response shapes:
        // { counts: {...} } OR { success:true, counts:{...} } OR { data:{ counts:{...} } }
        const raw =
          data?.counts ??
          data?.data?.counts ??
          data?.data ??
          data ??
          {};

        return {
          totalBuyers: Number(raw?.totalBuyers ?? raw?.buyers ?? raw?.buyersCount ?? 0) || 0,
          totalProducts: Number(raw?.totalProducts ?? raw?.products ?? raw?.productsCount ?? 0) || 0,
          pendingKyc: Number(raw?.pendingKyc ?? raw?.pending_kyc ?? raw?.pendingKycCount ?? 0) || 0,
        };
      }

      // If endpoint exists but fails, continue to fallback
      console.warn(`[adminApi.getDashboardCounts] server failed: ${res.status}`);
    } catch (e) {
      console.warn('[adminApi.getDashboardCounts] server error:', e);
    }

    // 2) Fallback: client-side counts (may show 0 if RLS blocks)
    const [buyersRes, productsRes, pendingKycRes] = await Promise.all([
      supabase.from('buyers').select('*', { count: 'exact', head: true }),
      supabase.from('products').select('*', { count: 'exact', head: true }),
      supabase
        .from('vendors')
        .select('*', { count: 'exact', head: true })
        .eq('kyc_status', 'SUBMITTED'),
    ]);

    return {
      totalBuyers: buyersRes?.count || 0,
      totalProducts: productsRes?.count || 0,
      pendingKyc: pendingKycRes?.count || 0,
    };
  },

  getRecentOrders: async () => {
    const ADMIN_API_BASE = getAdminBase();
    try {
      const res = await fetchWithCsrf(`${ADMIN_API_BASE}/dashboard/recent-lead-purchases?limit=10`);
      if (res.ok) {
        const data = await res.json();
        return data?.orders || [];
      }
    } catch {
      // fallback below
    }

    const { data, error } = await supabase
      .from('lead_purchases')
      .select('*, vendor:vendors(company_name)')
      .order('purchase_date', { ascending: false })
      .limit(10);
    if (error) throw error;
    return data;
  },

  getDataEntryPerformance: async () => {
    const ADMIN_API_BASE = getAdminBase();
    try {
      const res = await fetchWithCsrf(`${ADMIN_API_BASE}/dashboard/data-entry-performance`);
      if (res.ok) {
        const data = await res.json();
        return data?.performance || [];
      }
    } catch {
      // fallback below
    }

    // Get all Data Entry employees
    const { data: employees } = await supabase
      .from('employees')
      .select('id, user_id, full_name, email')
      .in('role', ['DATA_ENTRY', 'DATAENTRY']);

    if (!employees) return [];

    // For each, count vendors created
    const performance = await Promise.all(employees.map(async (emp) => {
      let userId = emp.user_id;

      if (!userId && emp?.email) {
        const { data: userRow } = await supabase
          .from('users')
          .select('id')
          .eq('email', emp.email)
          .maybeSingle();
        if (userRow?.id) userId = userRow.id;
      }

      if (!userId) {
        return {
          id: emp.id,
          name: emp.full_name || emp.email || 'Data Entry',
          vendorsCreated: 0,
          productsListed: 0,
          kycVerified: 0
        };
      }

      const vendorFilter = [
        `created_by_user_id.eq.${userId}`,
        `assigned_to.eq.${userId}`,
        `user_id.eq.${userId}`,
        emp?.id ? `assigned_to.eq.${emp.id}` : null,
      ].filter(Boolean).join(',');
      const { count } = await supabase
        .from('vendors')
        .select('*', { count: 'exact', head: true })
        .or(vendorFilter);

      // Count products for those vendors
      const { data: vendors } = await supabase
        .from('vendors')
        .select('id')
        .or(vendorFilter);

      let productCount = 0;
      if (vendors && vendors.length > 0) {
        const vendorIds = vendors.map(v => v.id);
        const { count: pCount } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .in('vendor_id', vendorIds);
        productCount = pCount || 0;
      } else {
        const { count: pCount, error: pErr } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('created_by', userId);
        if (!pErr) productCount = pCount || 0;
      }

      return {
        id: userId,
        name: emp.full_name || emp.email || 'Data Entry',
        vendorsCreated: count || 0,
        productsListed: productCount,
        kycVerified: 0 // Placeholder logic
      };
    }));

    return performance;
  },

  getVendorsByCreator: async (creatorId) => {
    const { data, error } = await supabase
      .from('vendors')
      .select('*, products(*)')
      .or(`created_by_user_id.eq.${creatorId},assigned_to.eq.${creatorId}`);
    if (error) throw error;
    return data;
  },

  // ✅ Buyers API (NEW)
  buyers: {
    list: async () => {
      const { data, error } = await supabase
        .from('buyers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    // Try to update using any of these columns if they exist
    setActive: async (buyerId, isActive, reason = '') => {
      const { data: current, error: curErr } = await supabase
        .from('buyers')
        .select('*')
        .eq('id', buyerId)
        .single();

      if (curErr) throw curErr;

      const updates = { updated_at: new Date().toISOString() };

      if (typeof current?.is_active === 'boolean' || ('is_active' in current)) {
        updates.is_active = !!isActive;
      }
      if (typeof current?.status === 'string' || ('status' in current)) {
        updates.status = isActive ? 'ACTIVE' : 'TERMINATED';
      }
      if ('terminated_at' in current) {
        updates.terminated_at = isActive ? null : new Date().toISOString();
      }
      if ('terminated_reason' in current) {
        updates.terminated_reason = isActive ? null : (reason || null);
      }

      const { error } = await supabase
        .from('buyers')
        .update(updates)
        .eq('id', buyerId);

      if (error) throw error;
    }
  },

  // Data Entry API - Products
  products: {
    list: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, vendor_id, vendors(company_name), status, created_at, price')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }
  },

  // Data Entry API - States
  states: {
    list: async () => {
      const { data, error } = await supabase
        .from('states')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    create: async (name) => {
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const { data, error } = await supabase
        .from('states')
        .insert([{ name, slug, is_active: true }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    update: async (id, name, isActive) => {
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const { data, error } = await supabase
        .from('states')
        .update({ name, slug, is_active: isActive })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    delete: async (id) => {
      const { error } = await supabase.from('states').delete().eq('id', id);
      if (error) throw error;
    }
  },

  // Data Entry API - Cities
  cities: {
    list: async () => {
      const { data, error } = await supabase
        .from('cities')
        .select('*, states(name)')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    create: async (stateId, name) => {
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const { data, error } = await supabase
        .from('cities')
        .insert([{ state_id: stateId, name, slug, is_active: true }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    update: async (id, name, isActive) => {
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const { data, error } = await supabase
        .from('cities')
        .update({ name, slug, is_active: isActive })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    delete: async (id) => {
      const { error } = await supabase.from('cities').delete().eq('id', id);
      if (error) throw error;
    }
  },

  // Support Tickets API
  tickets: {
    list: async (filters = {}) => {
      let query = supabase
        .from('support_tickets')
        .select('*, vendors(company_name), buyers(full_name)')
        .order('created_at', { ascending: false });

      if (filters.status && filters.status !== 'ALL') {
        query = query.eq('status', filters.status);
      }
      if (filters.priority && filters.priority !== 'ALL') {
        query = query.eq('priority', filters.priority);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    getById: async (ticketId) => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*, vendors(company_name), buyers(full_name)')
        .eq('id', ticketId)
        .single();
      if (error) throw error;
      return data;
    },

    updateStatus: async (ticketId, status) => {
      const updates = { status, updated_at: new Date().toISOString() };
      if (status === 'CLOSED') {
        updates.resolved_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from('support_tickets')
        .update(updates)
        .eq('id', ticketId);
      if (error) throw error;
    },

    getMessages: async (ticketId) => {
      const { data, error } = await supabase
        .from('ticket_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },

    sendMessage: async (ticketId, message, senderType = 'SUPPORT') => {
      const { data, error } = await supabase
        .from('ticket_messages')
        .insert([{
          ticket_id: ticketId,
          message: message,
          sender_type: senderType,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  },

  // Vendors API
  vendors: {
    list: async (filters = {}) => {
      let query = supabase.from('vendors').select('*, products(count)').order('created_at', { ascending: false });

      if (filters.kycStatus && filters.kycStatus !== 'ALL') {
        query = query.eq('kyc_status', filters.kycStatus);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    getById: async (vendorId) => {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .eq('id', vendorId)
        .single();
      if (error) throw error;
      return data;
    },

    approveKyc: async (vendorId) => {
      const { error } = await supabase
        .from('vendors')
        .update({ kyc_status: 'APPROVED', is_verified: true, verified_at: new Date().toISOString() })
        .eq('id', vendorId);
      if (error) throw error;
    },

    rejectKyc: async (vendorId, reason) => {
      const { error } = await supabase
        .from('vendors')
        .update({ kyc_status: 'REJECTED', is_verified: false, rejection_reason: reason })
        .eq('id', vendorId);
      if (error) throw error;
    }
  }
};
