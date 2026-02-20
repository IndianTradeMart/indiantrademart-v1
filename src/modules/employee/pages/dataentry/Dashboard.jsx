import React, { useEffect, useState } from 'react';
import { useEmployeeAuth } from '@/modules/employee/context/EmployeeAuthContext';
import { dataEntryApi } from '@/modules/employee/services/dataEntryApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Package, FileCheck, AlertCircle, Plus, Upload, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';

const StatCard = ({ title, value, icon: Icon, color, subtext }) => (
  <Card>
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">{title}</p>
          <h3 className="text-2xl font-bold mt-2 text-neutral-900">{value}</h3>
          {subtext && <p className="text-xs text-neutral-400 mt-1">{subtext}</p>}
        </div>
        <div className={`p-3 rounded-full ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </CardContent>
  </Card>
);

const Dashboard = () => {
  const { user } = useEmployeeAuth();
  const [stats, setStats] = useState({ totalVendors: 0, totalProducts: 0, pendingKyc: 0, approvedKyc: 0 });
  const [activities, setActivities] = useState([]);
  const [categoryRequests, setCategoryRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestUpdatingId, setRequestUpdatingId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const effectiveUserId = user?.user_id || user?.id;
        const [statsData, activitiesData, requestsData] = await Promise.all([
          dataEntryApi.getDashboardStats(effectiveUserId),
          dataEntryApi.getRecentActivities(effectiveUserId),
          dataEntryApi.getCategoryRequests(6)
        ]);
        setStats(statsData);
        setActivities(activitiesData);
        setCategoryRequests(requestsData || []);
      } catch (error) {
        console.error("Dashboard Error", error);
        setCategoryRequests([]);
      } finally {
        setLoading(false);
        setRequestsLoading(false);
      }
    };
    if (user) fetchData();
  }, [user]);

  const getRequestMeta = (ticket) => {
    const raw = ticket?.attachments;
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }
    return {};
  };

  const resolveRequestStatus = (ticket) => {
    const meta = getRequestMeta(ticket);
    if (meta?.task_status) return String(meta.task_status).toUpperCase();
    const st = String(ticket?.status || '').toUpperCase();
    if (st === 'IN_PROGRESS') return 'IN_PROGRESS';
    if (st === 'CLOSED') return 'DONE';
    return 'ASSIGNED';
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'DONE':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'IN_PROGRESS':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const updateCategoryRequestStatus = async (ticketId, nextStatus) => {
    if (!ticketId || requestUpdatingId) return;
    setRequestUpdatingId(ticketId);
    try {
      const res = await fetchWithCsrf(apiUrl(`/api/category-requests/${ticketId}/status`), {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to update request');
      }

      if (data?.ticket) {
        setCategoryRequests((prev) =>
          (prev || []).map((t) => (t.id === ticketId ? data.ticket : t))
        );
      } else {
        setCategoryRequests((prev) =>
          (prev || []).map((t) => {
            if (t.id !== ticketId) return t;
            const meta = getRequestMeta(t);
            return {
              ...t,
              attachments: { ...meta, task_status: nextStatus },
            };
          })
        );
      }
    } catch (error) {
      console.error(error);
    } finally {
      setRequestUpdatingId(null);
    }
  };

  if (loading) return <div className="p-8">Loading dashboard...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Welcome back, {user?.name?.split(' ')[0]}!</h1>
        <p className="text-neutral-500 mt-2">Here's what's happening with your assigned vendors today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Assigned Vendors" 
          value={stats.totalVendors} 
          icon={Users} 
          color="bg-blue-600"
          subtext="Vendors created by you" 
        />
        <StatCard 
          title="Total Products" 
          value={stats.totalProducts} 
          icon={Package} 
          color="bg-purple-600"
          subtext="Across all your vendors"
        />
        <StatCard 
          title="Pending KYC" 
          value={stats.pendingKyc} 
          icon={AlertCircle} 
          color="bg-amber-500"
          subtext="Require verification"
        />
        <StatCard 
          title="Approved KYC" 
          value={stats.approvedKyc} 
          icon={FileCheck} 
          color="bg-emerald-600"
          subtext="Successfully verified"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No recent activity.</div>
              ) : (
                <div className="space-y-4">
                  {activities.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-4 pb-4 border-b last:border-0 last:pb-0">
                      <div className={`mt-1 w-2 h-2 rounded-full ${item.type === 'VENDOR' ? 'bg-blue-500' : 'bg-green-500'}`} />
                      <div>
                        <p className="text-sm font-medium text-neutral-900">{item.message}</p>
                        <p className="text-xs text-neutral-500">{new Date(item.time).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link to="/employee/dataentry/vendor-onboarding">
                <Button className="w-full justify-start" variant="outline">
                  <Plus className="mr-2 h-4 w-4" /> Create New Vendor
                </Button>
              </Link>
              <Link to="/employee/dataentry/vendors">
                <Button className="w-full justify-start" variant="outline">
                  <Package className="mr-2 h-4 w-4" /> Manage Vendor Products
                </Button>
              </Link>
              <Link to="/employee/dataentry/categories/upload">
                <Button className="w-full justify-start" variant="outline">
                  <Upload className="mr-2 h-4 w-4" /> Bulk Import Categories
                </Button>
              </Link>
              <Link to="/employee/dataentry/records">
                <Button className="w-full justify-start text-blue-600" variant="ghost">
                  View All Records <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Category Requests</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {requestsLoading ? (
                <div className="text-sm text-gray-500">Loading requests...</div>
              ) : categoryRequests.length === 0 ? (
                <div className="text-sm text-gray-500">No category requests yet.</div>
              ) : (
                categoryRequests.map((req) => {
                  const meta = getRequestMeta(req);
                  const status = resolveRequestStatus(req);
                  const groupName = meta?.group_name || req?.subject?.replace(/^Category request:\s*/i, '') || 'Category request';
                  const vendorName = meta?.vendor_name || req?.vendors?.company_name || 'Vendor';
                  const note = meta?.note || req?.description || '';
                  const isUpdating = requestUpdatingId === req.id;
                  return (
                    <div key={req.id} className="border rounded-lg p-3 bg-white">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-neutral-900 truncate">{groupName}</p>
                          <p className="text-xs text-neutral-500 truncate">Vendor: {vendorName}</p>
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${getStatusBadgeClass(status)}`}>
                          {status}
                        </Badge>
                      </div>
                      {note && (
                        <p className="text-xs text-neutral-500 mt-2 line-clamp-2">
                          Note: {note}
                        </p>
                      )}
                      <p className="text-[10px] text-neutral-400 mt-1">
                        {new Date(req.created_at).toLocaleString()}
                      </p>
                      {status !== 'DONE' && (
                        <div className="flex gap-2 mt-2">
                          {status !== 'IN_PROGRESS' && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isUpdating}
                              onClick={() => updateCategoryRequestStatus(req.id, 'IN_PROGRESS')}
                            >
                              {isUpdating ? '...' : 'Start'}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isUpdating}
                            onClick={() => updateCategoryRequestStatus(req.id, 'DONE')}
                          >
                            {isUpdating ? '...' : 'Mark Done'}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
