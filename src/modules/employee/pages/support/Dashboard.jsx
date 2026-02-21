import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';
import { MessageSquare, CheckCircle, Clock, Loader2, AlertCircle, ArrowUpRight, TrendingUp, Users, Building2, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import StatsCard from '@/shared/components/StatsCard';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';

const Dashboard = () => {
  const [stats, setStats] = useState({ open: 0, resolved: 0, avgTime: 0, inProgress: 0, highPriority: 0 });
  const [recentTickets, setRecentTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);


      // ✅ Single source of truth: fetch tickets from DB (via API); compute stats client-side
      const ticketsResponse = await fetchWithCsrf(apiUrl('/api/support/tickets?pageSize=200'));
      const ticketsData = await ticketsResponse.json();

      const allTickets = Array.isArray(ticketsData?.tickets) ? ticketsData.tickets : [];

      if (!allTickets.length) {
        setStats({ open: 0, inProgress: 0, highPriority: 0, resolved: 0, avgTime: '—' });
        setRecentTickets([]);
        return;
      }

      const isResolved = (s) => ['RESOLVED', 'CLOSED'].includes((s || '').toString().toUpperCase());
      const isClosed = (s) => ['CLOSED', 'CANCELLED'].includes((s || '').toString().toUpperCase());
      const isHigh = (p) => ['HIGH', 'URGENT'].includes((p || '').toString().toUpperCase());

      const openTickets = allTickets.filter((t) => (t.status || '').toString().toUpperCase() === 'OPEN');
      const inProgressTickets = allTickets.filter((t) => (t.status || '').toString().toUpperCase() === 'IN_PROGRESS');
      const highPriorityTickets = allTickets.filter((t) => isHigh(t.priority) && !isClosed(t.status));

      // Resolved today (based on resolved_at if exists; fallback to updated_at)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const resolvedToday = allTickets.filter((t) => {
        if (!isResolved(t.status)) return false;
        const dt = t.resolved_at || t.updated_at || t.updatedAt;
        if (!dt) return false;
        const d = new Date(dt);
        if (Number.isNaN(d.getTime())) return false;
        d.setHours(0, 0, 0, 0);
        return d.getTime() === today.getTime();
      });

      // Avg resolution time (resolved/closed where we have resolved_at)
      const resolvedWithTimes = allTickets
        .filter((t) => isResolved(t.status) && t.created_at && (t.resolved_at || t.updated_at))
        .map((t) => {
          const start = new Date(t.created_at);
          const end = new Date(t.resolved_at || t.updated_at);
          if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
          const ms = end.getTime() - start.getTime();
          return ms > 0 ? ms : null;
        })
        .filter(Boolean);

      let avgTime = '—';
      if (resolvedWithTimes.length) {
        const avgMs = resolvedWithTimes.reduce((a, b) => a + b, 0) / resolvedWithTimes.length;
        const minutes = Math.round(avgMs / (1000 * 60));
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        avgTime = h > 0 ? `${h}h ${m}m` : `${m}m`;
      }

      setStats({
        open: openTickets.length,
        inProgress: inProgressTickets.length,
        highPriority: highPriorityTickets.length,
        resolved: resolvedToday.length,
        avgTime,
      });

      // Recent tickets (latest first) - keep UI light
      setRecentTickets(allTickets.slice(0, 10));
    } catch (error) {
      console.error('Dashboard error:', error);

      // Fallback to Supabase direct (still real DB)
      try {
        const { data: allTickets, error: sbError } = await supabase
          .from('support_tickets')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200);

        if (sbError) throw sbError;

        const list = Array.isArray(allTickets) ? allTickets : [];
        const openTickets = list.filter((t) => (t.status || '').toString().toUpperCase() === 'OPEN');
        const inProgressTickets = list.filter((t) => (t.status || '').toString().toUpperCase() === 'IN_PROGRESS');
        const highPriorityTickets = list.filter(
          (t) =>
            ['HIGH', 'URGENT'].includes((t.priority || '').toString().toUpperCase()) &&
            !['CLOSED', 'CANCELLED'].includes((t.status || '').toString().toUpperCase())
        );

        setStats({
          open: openTickets.length,
          inProgress: inProgressTickets.length,
          highPriority: highPriorityTickets.length,
          resolved: 0,
          avgTime: '—',
        });
        setRecentTickets(list.slice(0, 10));
      } catch (fallbackError) {
        console.error('Fallback error:', fallbackError);
        toast({
          title: 'Support dashboard load failed',
          description: fallbackError?.message || 'Unable to fetch tickets from DB',
          variant: 'destructive',
        });
        setStats({ open: 0, inProgress: 0, highPriority: 0, resolved: 0, avgTime: '—' });
        setRecentTickets([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'OPEN': return 'secondary';
      case 'IN_PROGRESS': return 'warning';
      case 'RESOLVED': return 'default';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support Dashboard</h1>
          <p className="text-gray-600 mt-1">Overview of support tickets and team performance</p>
        </div>
        <Link to="/employee/support/tickets">
          <Button className="bg-[#003D82]">
            <MessageSquare className="h-4 w-4 mr-2" /> View All Tickets
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-500">Open</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.open}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-500">In Progress</p>
                <p className="text-2xl font-bold text-blue-600">{stats.inProgress}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-500">High Priority</p>
                <p className="text-2xl font-bold text-red-600">{stats.highPriority}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-500">Resolved Today</p>
                <p className="text-2xl font-bold text-green-600">{stats.resolved}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-500">Avg Response</p>
                <p className="text-2xl font-bold text-purple-600">{stats.avgTime}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Tickets */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Recent Tickets</CardTitle>
            <Link to="/employee/support/tickets">
              <Button variant="ghost" size="sm" className="text-[#003D82]">
                View All <ArrowUpRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-gray-400" />
            </div>
          ) : recentTickets.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>No tickets found</p>
              <p className="text-sm">New support tickets will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentTickets.map(ticket => (
                <div key={ticket.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`p-2 rounded-full ${ticket.vendor_id ? 'bg-blue-100' : 'bg-green-100'}`}>
                      {ticket.vendor_id ? (
                        <Building2 className="h-4 w-4 text-blue-600" />
                      ) : (
                        <User className="h-4 w-4 text-green-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{ticket.subject}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(ticket.created_at).toLocaleDateString()} • ID: {ticket.id?.substring(0, 8)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        ticket.priority === 'HIGH'
                          ? 'bg-red-100 text-red-800 border-red-200'
                          : ticket.priority === 'MEDIUM'
                          ? 'bg-orange-100 text-orange-800 border-orange-200'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {ticket.priority || 'MEDIUM'}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        ticket.status === 'OPEN'
                          ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                          : ticket.status === 'IN_PROGRESS'
                          ? 'bg-blue-100 text-blue-800 border-blue-200'
                          : 'bg-green-100 text-green-800 border-green-200'
                      }`}
                    >
                      {ticket.status}
                    </Badge>
                    <Link to="/employee/support/tickets">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                        <ArrowUpRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
