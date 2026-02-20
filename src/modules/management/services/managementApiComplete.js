import { supabase } from '@/lib/customSupabaseClient';

export const managementApi = {
  // --- DASHBOARD STATISTICS ---
  getDashboardStats: async () => {
    try {
      const [vendors, buyers, products, proposals, leads, revenue] = await Promise.all([
        supabase.from('vendors').select('*', { count: 'exact', head: true }).eq('is_verified', true),
        supabase.from('buyers').select('*', { count: 'exact', head: true }),
        supabase.from('products').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
        supabase.from('proposals').select('*', { count: 'exact', head: true }),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'AVAILABLE'),
        supabase.from('lead_purchases').select('amount')
      ]);

      const totalRevenue = revenue.data?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

      return {
        activeVendors: vendors.count || 0,
        totalBuyers: buyers.count || 0,
        activeProducts: products.count || 0,
        totalProposals: proposals.count || 0,
        availableLeads: leads.count || 0,
        totalRevenue: totalRevenue
      };
    } catch (error) {
      console.error('Dashboard stats error:', error);
      throw error;
    }
  },

  // --- REVENUE ANALYTICS ---
  getRevenueAnalytics: async (timeRange = '30d') => {
    let startDate = new Date();
    
    if (timeRange === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (timeRange === '30d') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (timeRange === '90d') {
      startDate.setMonth(startDate.getMonth() - 3);
    } else if (timeRange === '1y') {
      startDate.setFullYear(startDate.getFullYear() - 1);
    }

    const { data: leadRevenue } = await supabase
      .from('lead_purchases')
      .select('amount, purchase_date')
      .gte('purchase_date', startDate.toISOString());

    const { data: paymentRevenue } = await supabase
      .from('vendor_payments')
      .select('amount, payment_date')
      .gte('payment_date', startDate.toISOString());

    // Group by date
    const revenueByDate = {};
    
    leadRevenue?.forEach(p => {
      const date = new Date(p.purchase_date).toISOString().split('T')[0];
      revenueByDate[date] = (revenueByDate[date] || 0) + (p.amount || 0);
    });

    paymentRevenue?.forEach(p => {
      const date = new Date(p.payment_date).toISOString().split('T')[0];
      revenueByDate[date] = (revenueByDate[date] || 0) + (p.amount || 0);
    });

    return Object.entries(revenueByDate).map(([date, amount]) => ({
      date,
      amount
    }));
  },

  // --- VENDOR ANALYTICS ---
  getVendorAnalytics: async () => {
    const { data: vendors } = await supabase
      .from('vendors')
      .select('kyc_status, is_verified, created_at');

    const stats = {
      verified: 0,
      pending: 0,
      rejected: 0,
      submitted: 0
    };

    vendors?.forEach(v => {
      if (v.kyc_status === 'APPROVED') stats.verified++;
      else if (v.kyc_status === 'PENDING') stats.pending++;
      else if (v.kyc_status === 'REJECTED') stats.rejected++;
      else if (v.kyc_status === 'SUBMITTED') stats.submitted++;
    });

    return stats;
  },

  // --- PRODUCT ANALYTICS ---
  getProductAnalytics: async () => {
    const { data: products } = await supabase
      .from('products')
      .select('status, created_at');

    const stats = {
      active: 0,
      draft: 0,
      archived: 0,
      total: 0
    };

    products?.forEach(p => {
      stats.total++;
      if (p.status === 'ACTIVE') stats.active++;
      else if (p.status === 'DRAFT') stats.draft++;
      else if (p.status === 'ARCHIVED') stats.archived++;
    });

    return stats;
  },

  // --- USER ACTIVITY ---
  getUserActivity: async (timeRange = '30d') => {
    let startDate = new Date();
    
    if (timeRange === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (timeRange === '30d') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (timeRange === '90d') {
      startDate.setMonth(startDate.getMonth() - 3);
    }

    const { data: proposals } = await supabase
      .from('proposals')
      .select('created_at')
      .gte('created_at', startDate.toISOString());

    const { data: tickets } = await supabase
      .from('support_tickets')
      .select('created_at')
      .gte('created_at', startDate.toISOString());

    // Group by date
    const activityByDate = {};
    
    proposals?.forEach(p => {
      const date = new Date(p.created_at).toISOString().split('T')[0];
      activityByDate[date] = (activityByDate[date] || 0) + 1;
    });

    tickets?.forEach(t => {
      const date = new Date(t.created_at).toISOString().split('T')[0];
      activityByDate[date] = (activityByDate[date] || 0) + 1;
    });

    return Object.entries(activityByDate).map(([date, count]) => ({
      date,
      activity: count
    }));
  },

  // --- CATEGORY PERFORMANCE ---
  getCategoryPerformance: async () => {
    const { data: products } = await supabase
      .from('products')
      .select('category')
      .eq('status', 'ACTIVE');

    const categories = {};
    products?.forEach(p => {
      categories[p.category] = (categories[p.category] || 0) + 1;
    });

    return Object.entries(categories).map(([category, count]) => ({
      category,
      count
    })).sort((a, b) => b.count - a.count);
  },

  // --- LOCATION PERFORMANCE ---
  getLocationPerformance: async () => {
    const { data: vendors } = await supabase
      .from('vendors')
      .select('state, city')
      .eq('is_verified', true);

    const locations = {};
    vendors?.forEach(v => {
      const location = `${v.city}, ${v.state}`;
      locations[location] = (locations[location] || 0) + 1;
    });

    return Object.entries(locations)
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  },

  // --- RECENT TRANSACTIONS ---
  getRecentTransactions: async (limit = 20) => {
    const { data: leadPurchases } = await supabase
      .from('lead_purchases')
      .select('*, vendor:vendors(company_name), lead:leads(title)')
      .order('purchase_date', { ascending: false })
      .limit(limit);

    const { data: payments } = await supabase
      .from('vendor_payments')
      .select('*, vendor:vendors(company_name)')
      .order('payment_date', { ascending: false })
      .limit(limit);

    const transactions = [
      ...(leadPurchases || []).map(p => ({
        id: p.id,
        type: 'Lead Purchase',
        vendor: p.vendor?.company_name,
        amount: p.amount,
        date: p.purchase_date,
        status: p.payment_status
      })),
      ...(payments || []).map(p => ({
        id: p.id,
        type: 'Payment',
        vendor: p.vendor?.company_name,
        amount: p.amount,
        date: p.payment_date,
        status: p.status
      }))
    ];

    return transactions.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit);
  },

  // --- TOP PERFORMERS ---
  getTopVendors: async (limit = 10) => {
    const { data, error } = await supabase
      .from('vendors')
      .select('id, company_name, seller_rating, verification_badge, profile_image, state, city')
      .eq('is_verified', true)
      .order('seller_rating', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  getTopProducts: async (limit = 10) => {
    const { data, error } = await supabase
      .from('products')
      .select('*, vendors(company_name)')
      .eq('status', 'ACTIVE')
      .order('views', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  // --- SYSTEM HEALTH ---
  getSystemHealth: async () => {
    const [pendingKyc, pendingTickets, unverifiedVendors] = await Promise.all([
      supabase.from('vendors').select('*', { count: 'exact', head: true }).eq('kyc_status', 'SUBMITTED'),
      supabase.from('support_tickets').select('*', { count: 'exact', head: true }).neq('status', 'CLOSED'),
      supabase.from('vendors').select('*', { count: 'exact', head: true }).eq('is_verified', false)
    ]);

    return {
      pendingKycVerifications: pendingKyc.count || 0,
      openSupportTickets: pendingTickets.count || 0,
      unverifiedVendors: unverifiedVendors.count || 0
    };
  }
};
