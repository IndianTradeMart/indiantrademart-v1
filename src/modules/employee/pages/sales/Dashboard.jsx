import React, { useEffect, useMemo, useState } from 'react';
import StatsCard from '@/shared/components/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { salesApi } from '@/modules/employee/services/salesApi';
import { DollarSign, Loader2, TrendingUp, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

const fmtDate = (v) => {
  try {
    const d = v ? new Date(v) : null;
    if (!d || Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString();
  } catch {
    return '-';
  }
};

const getLeadTitle = (lead) => {
  return (
    lead?.title ||
    lead?.product_name ||
    lead?.service_name ||
    lead?.requirement_title ||
    lead?.name ||
    'Untitled Lead'
  );
};

const getLeadBudget = (lead) => {
  const v = lead?.budget ?? lead?.budget_amount ?? lead?.price ?? lead?.amount;
  if (typeof v === 'number' && !Number.isNaN(v)) {
    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(v);
    } catch {
      return `₹${Math.round(v).toLocaleString('en-IN')}`;
    }
  }
  return v ? String(v) : '-';
};

const statusBadge = (status) => {
  const s = (status || '').toString().toUpperCase();
  if (['AVAILABLE', 'OPEN'].includes(s)) return { label: s, cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
  if (['PENDING', 'IN_PROGRESS'].includes(s)) return { label: s, cls: 'bg-blue-100 text-blue-800 border-blue-200' };
  if (['CONVERTED'].includes(s)) return { label: s, cls: 'bg-green-100 text-green-800 border-green-200' };
  if (['CLOSED', 'SOLD'].includes(s)) return { label: s, cls: 'bg-gray-100 text-gray-800 border-gray-200' };
  return { label: s || '-', cls: 'bg-gray-50 text-gray-700 border-gray-200' };
};

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [recentLeads, setRecentLeads] = useState([]);

  const load = async () => {
    try {
      setLoading(true);
      const [s, leads] = await Promise.all([
        salesApi.getStats(),
        salesApi.getAllLeads(),
      ]);
      setStats(s);
      setRecentLeads((leads || []).slice(0, 8));
    } catch (e) {
      console.error('Sales dashboard load error:', e);
      toast({
        title: 'Sales dashboard load failed',
        description: e?.message || 'Unable to fetch data from DB',
        variant: 'destructive',
      });
      setStats(null);
      setRecentLeads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const newLeadTrend = useMemo(() => {
    if (!stats) return { text: null, up: null };
    if (stats.newLeadsTrendPct === null) return { text: 'no prev data', up: null };
    return { text: `${Math.abs(stats.newLeadsTrendPct)}% vs last week`, up: stats.newLeadsTrendPct >= 0 };
  }, [stats]);

  const convTrend = useMemo(() => {
    if (!stats) return { text: null, up: null };
    if (stats.convertedTrendPct === null) return { text: 'no prev data', up: null };
    return { text: `${Math.abs(stats.convertedTrendPct)}% vs last week`, up: stats.convertedTrendPct >= 0 };
  }, [stats]);

  const revTrend = useMemo(() => {
    if (!stats) return { text: null, up: null };
    if (stats.revenueTrendPct === null) return { text: 'no prev data', up: null };
    return { text: `${Math.abs(stats.revenueTrendPct)}% vs last week`, up: stats.revenueTrendPct >= 0 };
  }, [stats]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Dashboard</h1>
          <p className="text-gray-600 mt-1">Real-time sales overview from database</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
          <Link to="/employee/sales/leads">
            <Button className="bg-[#003D82]">View Leads</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard
          title="New Leads (7 days)"
          value={loading ? '—' : String(stats?.newLeads7d ?? 0)}
          icon={Users}
          trend={newLeadTrend.text}
          trendUp={newLeadTrend.up}
          description="based on leads.created_at"
        />

        <StatsCard
          title="Conversions (7 days)"
          value={loading ? '—' : String(stats?.converted7d ?? 0)}
          icon={TrendingUp}
          trend={convTrend.text}
          trendUp={convTrend.up}
          description={`overall CR: ${stats?.conversionRate ?? 0}%`}
        />

        <StatsCard
          title="Revenue (7 days)"
          value={loading ? '—' : (stats?.revenue7dFmt || '₹0')}
          icon={DollarSign}
          trend={revTrend.text}
          trendUp={revTrend.up}
          description="based on lead_purchases.amount"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Leads</CardTitle>
          <Link to="/employee/sales/leads">
            <Button variant="ghost" className="text-[#003D82]">See all</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-gray-400" />
            </div>
          ) : recentLeads.length === 0 ? (
            <div className="text-center py-10 text-gray-500">No leads found in database.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLeads.map((lead) => {
                  const b = statusBadge(lead?.status);
                  return (
                    <TableRow key={lead?.id || Math.random()}>
                      <TableCell className="font-medium">{getLeadTitle(lead)}</TableCell>
                      <TableCell>{lead?.category || lead?.category_name || '-'}</TableCell>
                      <TableCell>{getLeadBudget(lead)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${b.cls}`}>{b.label}</Badge>
                      </TableCell>
                      <TableCell>{fmtDate(lead?.created_at)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
