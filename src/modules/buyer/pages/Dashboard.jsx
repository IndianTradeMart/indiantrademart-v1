
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/Card';
import { 
  Ticket, FileText, Star, TrendingUp, Clock, 
  Loader2, MessageSquare, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { buyerApi } from '@/modules/buyer/services/buyerApi';

const Dashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    activeTickets: 0,
    pendingProposals: 0,
    favorites: 0,
    unreadMessages: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [statData, proposals] = await Promise.all([
        buyerApi.getStats(),
        buyerApi.getProposals(),
      ]);

      setStats({
        activeTickets: statData?.openTickets || 0,
        pendingProposals: statData?.activeProposals || 0,
        favorites: statData?.favoriteVendors || 0,
        unreadMessages: 0,
      });

      setRecentActivity((proposals || []).slice(0, 5));

    } catch (error) {
      console.error("Dashboard data fetch error:", error);
      setError(error?.message || "Failed to load dashboard data. Please check connection.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="flex h-96 justify-center items-center"><Loader2 className="h-8 w-8 animate-spin text-gray-300" /></div>;
  if (error) return <div className="flex h-96 justify-center items-center text-red-500 gap-2"><AlertCircle /> {error}</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Welcome back, {user?.full_name || 'Buyer'}</p>
        </div>
        <div className="flex gap-3">
          <Link to="/buyer/proposals/new">
            <Button className="bg-[#003D82] shadow-sm hover:bg-[#002d61]">
              <TrendingUp className="mr-2 h-4 w-4" /> Post Requirement
            </Button>
          </Link>
          <Link to="/buyer/tickets">
            <Button variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50">
              Support Center
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Pending Proposals" value={stats.pendingProposals} icon={FileText} color="text-blue-600" bg="bg-blue-50" link="/buyer/proposals" />
        <StatCard label="Active Tickets" value={stats.activeTickets} icon={Ticket} color="text-orange-600" bg="bg-orange-50" link="/buyer/tickets" />
        <StatCard label="Favorite Vendors" value={stats.favorites} icon={Star} color="text-yellow-600" bg="bg-yellow-50" link="/buyer/favorites" />
        <StatCard label="Messages" value={stats.unreadMessages} icon={MessageSquare} color="text-green-600" bg="bg-green-50" link="/buyer/messages" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-bold">Recent Activities</CardTitle>
              <Link to="/buyer/proposals" className="text-sm text-[#003D82] hover:underline">View All</Link>
            </CardHeader>
            <CardContent>
              {recentActivity.length > 0 ? (
                <div className="space-y-4">
                  {recentActivity.map((item, i) => (
                    <div key={i} className="flex items-center p-3 rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100">
                      <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center mr-4 shrink-0">
                        <Clock className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                        <p className="text-xs text-gray-500 truncate">
                          To: {item.vendors?.company_name || 'Public Request'}
                        </p>
                      </div>
                      <div className="text-right pl-4">
                         <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            item.status === 'RESPONDED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                         }`}>
                           {item.status}
                         </span>
                         <p className="text-[10px] text-gray-400 mt-1">{new Date(item.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-gray-400">No recent activity</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions / Promo */}
        <div className="lg:col-span-1 space-y-6">
           <Card className="bg-gradient-to-br from-[#003D82] to-[#002855] text-white border-none">
            <CardContent className="p-6">
              <h4 className="font-bold text-lg mb-2">Enhance Your Profile</h4>
              <p className="text-blue-100 text-sm mb-6">
                Suppliers trust verified buyers. Add your GST and company details to get faster quotes.
              </p>
              <Link to="/buyer/profile">
                <Button className="w-full bg-white text-[#003D82] hover:bg-blue-50 font-semibold border-none">
                  Update Profile
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, icon: Icon, color, bg, link }) => (
  <Link to={link}>
    <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border-gray-100">
      <CardContent className="p-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
          <h3 className="text-3xl font-bold text-gray-900">{value}</h3>
        </div>
        <div className={`h-12 w-12 rounded-full ${bg} flex items-center justify-center ${color}`}>
          <Icon className="h-6 w-6" />
        </div>
      </CardContent>
    </Card>
  </Link>
);

export default Dashboard;
