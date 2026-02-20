import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { leadApi } from '@/modules/lead/services/leadApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/Card';
import { TrendingUp, Eye, ShoppingCart, Users, Mail, Phone } from 'lucide-react';

const startOf = (unit) => {
  const d = new Date();
  if (unit === 'day') d.setHours(0, 0, 0, 0);
  if (unit === 'week') {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
  }
  if (unit === 'year') {
    d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
  }
  return d;
};

const safeDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
};

const isPurchasedLeadRow = (row = {}) => {
  const source = String(row?.source || '').toLowerCase();
  if (source === 'purchased') return true;
  if (source === 'direct') return false;

  if (row?.lead_purchase_id) return true;
  if (row?.payment_status) return true;
  if (row?.purchase_amount !== null && row?.purchase_amount !== undefined) return true;
  return false;
};

const resolveVendor = async (sessionUser) => {
  const userId = String(sessionUser?.id || '').trim();
  const userEmail = String(sessionUser?.email || '').trim().toLowerCase();

  if (userId) {
    const { data: vendorByUserId, error: byUserErr } = await supabase
      .from('vendors')
      .select('id, trust_score')
      .eq('user_id', userId)
      .maybeSingle();

    if (!byUserErr && vendorByUserId) return vendorByUserId;
  }

  if (userEmail) {
    const { data: vendorByEmailRows, error: byEmailErr } = await supabase
      .from('vendors')
      .select('id, trust_score')
      .ilike('email', userEmail)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (!byEmailErr && Array.isArray(vendorByEmailRows) && vendorByEmailRows[0]) {
      return vendorByEmailRows[0];
    }
  }

  return null;
};

const Analytics = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const fetchAnalytics = async () => {
      try {
        setLoading(true);

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          if (alive) setStats(null);
          return;
        }

        const vendor = await resolveVendor(session.user);
        if (!vendor?.id) {
          if (alive) setStats(null);
          return;
        }

        // Products + views
        const { data: products, count: productCount, error: productErr } = await supabase
          .from('products')
          .select('views', { count: 'exact' })
          .eq('vendor_id', vendor.id);

        if (productErr) throw productErr;
        const totalViews = (products || []).reduce((sum, p) => sum + (p.views || 0), 0);

        // Purchased leads (same source used in "My Leads", so counts stay aligned)
        let myLeads = [];
        try {
          myLeads = await leadApi.marketplace.getMyLeads();
        } catch (myLeadsError) {
          console.error('Failed to fetch my leads for analytics:', myLeadsError);
        }

        const purchasedRows = (myLeads || []).filter((row) => isPurchasedLeadRow(row));
        const dayStart = startOf('day');
        const weekStart = startOf('week');
        const yearStart = startOf('year');

        let dailyLeads = 0;
        let weeklyLeads = 0;
        let yearlyLeads = 0;

        purchasedRows.forEach((row) => {
          const dt = safeDate(row?.purchase_date || row?.purchaseDate || row?.created_at);
          if (!dt) return;
          if (dt >= dayStart) dailyLeads += 1;
          if (dt >= weekStart) weeklyLeads += 1;
          if (dt >= yearStart) yearlyLeads += 1;
        });

        const totalLeads = purchasedRows.length;

        // Contacts (distinct leads contacted)
        const { data: contacts, error: contactErr } = await supabase
          .from('lead_contacts')
          .select('lead_id, contact_type, contact_date')
          .eq('vendor_id', vendor.id);

        if (contactErr) throw contactErr;

        const contactSet = new Set((contacts || []).map((c) => c.lead_id));
        const totalContacted = contactSet.size;
        const dailyContacted = new Set(
          (contacts || [])
            .filter((c) => {
              const dt = safeDate(c?.contact_date);
              return dt && dt >= dayStart;
            })
            .map((c) => c.lead_id)
        ).size;
        const weeklyContacted = new Set(
          (contacts || [])
            .filter((c) => {
              const dt = safeDate(c?.contact_date);
              return dt && dt >= weekStart;
            })
            .map((c) => c.lead_id)
        ).size;

        // Proposals sent
        const { count: proposalsSent, error: proposalErr } = await supabase
          .from('proposals')
          .select('*', { count: 'exact' })
          .eq('vendor_id', vendor.id);

        if (proposalErr) throw proposalErr;

        if (!alive) return;
        setStats({
          totalViews,
          totalProducts: productCount || 0,
          totalLeads: totalLeads || 0,
          dailyLeads: dailyLeads || 0,
          weeklyLeads: weeklyLeads || 0,
          yearlyLeads: yearlyLeads || 0,
          totalContacted,
          dailyContacted,
          weeklyContacted,
          proposalsSent: proposalsSent || 0,
          trustScore: vendor.trust_score || 0,
        });
      } catch (error) {
        console.error('Failed to fetch analytics:', error);
      } finally {
        if (alive) setLoading(false);
      }
    };

    fetchAnalytics();

    const handleLeadPurchase = () => {
      fetchAnalytics();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('itm:lead_purchased', handleLeadPurchase);
      window.addEventListener('focus', handleLeadPurchase);
    }

    return () => {
      alive = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('itm:lead_purchased', handleLeadPurchase);
        window.removeEventListener('focus', handleLeadPurchase);
      }
    };
  }, []);

  if (loading) return <div className="p-8 text-center">Loading analytics...</div>;
  if (!stats) return <div className="p-8 text-center text-gray-500">No analytics data.</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-neutral-800">Analytics</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-600 flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Total Views
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-neutral-800">{stats.totalViews.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-600 flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-neutral-800">{stats.totalProducts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-600 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Leads Purchased
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-neutral-800">{stats.totalLeads}</div>
            <div className="text-xs text-neutral-500 mt-1">
              Today: {stats.dailyLeads} | This Week: {stats.weeklyLeads} | This Year: {stats.yearlyLeads}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-600 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Trust Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-neutral-800">{stats.trustScore}</div>
            <div className="text-xs text-neutral-500 mt-1">Higher is better</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
              Lead Interactions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-600">Leads Contacted (distinct)</span>
              <span className="text-lg font-bold text-neutral-900">{stats.totalContacted}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg border bg-neutral-50 p-2">
                <div className="text-[11px] text-neutral-500">Today</div>
                <div className="font-semibold text-neutral-900">{stats.dailyContacted}</div>
              </div>
              <div className="rounded-lg border bg-neutral-50 p-2">
                <div className="text-[11px] text-neutral-500">This Week</div>
                <div className="font-semibold text-neutral-900">{stats.weeklyContacted}</div>
              </div>
              <div className="rounded-lg border bg-neutral-50 p-2">
                <div className="text-[11px] text-neutral-500">This Year</div>
                <div className="font-semibold text-neutral-900">{stats.totalContacted}</div>
              </div>
            </div>
            <div className="text-xs text-neutral-500 flex items-center gap-2">
              <Phone className="h-3.5 w-3.5" /> Calls / <Mail className="h-3.5 w-3.5" /> Emails logged in real time
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-neutral-700">Performance Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-neutral-600">
            <p>Real-time stats combine product views, lead purchases, and contact events.</p>
            <p>Use these numbers to monitor how often you reach out to buyers and how many leads you're acquiring each day.</p>
            <p>
              Proposals sent: <span className="font-semibold text-neutral-900">{stats.proposalsSent}</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Analytics;

