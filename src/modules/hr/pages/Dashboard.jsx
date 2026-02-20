
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StatsCard from '@/shared/components/StatsCard';
import { Users, Clock, CalendarCheck, UserPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { hrApi } from '@/modules/hr/services/hrApi';
import { toast } from '@/components/ui/use-toast';

const normalizeStatus = (value) => String(value || '').trim().toUpperCase();
const normalizeDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};
const pickDate = (employee) =>
  normalizeDate(
    employee?.created_at ||
      employee?.joined_at ||
      employee?.joining_date ||
      employee?.join_date ||
      employee?.joined
  );
const pickName = (employee) =>
  employee?.full_name || employee?.name || employee?.employee_name || employee?.email || 'Employee';
const pickRole = (employee) => employee?.role || employee?.designation || employee?.title || 'Member';
const pickDepartment = (employee) => employee?.department || employee?.dept || employee?.team || 'Unassigned';
const isOnLeave = (employee) => {
  const status = normalizeStatus(
    employee?.status || employee?.attendance_status || employee?.leave_status || employee?.employment_status
  );
  return status.includes('LEAVE');
};
const isInactive = (employee) => {
  const status = normalizeStatus(
    employee?.status || employee?.attendance_status || employee?.leave_status || employee?.employment_status
  );
  return status.includes('INACTIVE') || status.includes('SUSPENDED') || status.includes('TERMINATED');
};

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalEmployees: 0,
    active: 0,
    onLeave: 0,
    newHires: 0,
  });
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [list, summary] = await Promise.all([hrApi.getEmployees(), hrApi.getStats()]);
      const allEmployees = Array.isArray(list) ? list : [];
      const total = summary?.totalEmployees ?? allEmployees.length;
      const onLeave = allEmployees.filter(isOnLeave).length;
      const inactive = allEmployees.filter(isInactive).length;
      const active = Math.max(total - onLeave - inactive, 0);

      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const newHires = allEmployees.filter((emp) => {
        const d = pickDate(emp);
        return d ? now - d.getTime() <= thirtyDaysMs : false;
      }).length;

      setEmployees(allEmployees);
      setStats({
        totalEmployees: total,
        active: summary?.active ?? active,
        onLeave: summary?.onLeave ?? onLeave,
        newHires,
      });
      setLastUpdated(new Date());
    } catch (error) {
      toast({
        title: 'Failed to load HR dashboard',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const recentEmployees = useMemo(() => {
    return [...(employees || [])]
      .sort((a, b) => {
        const da = pickDate(a)?.getTime() || 0;
        const db = pickDate(b)?.getTime() || 0;
        return db - da;
      })
      .slice(0, 6);
  }, [employees]);

  const departmentSnapshot = useMemo(() => {
    const counts = (employees || []).reduce((acc, employee) => {
      const dept = pickDepartment(employee);
      acc[dept] = (acc[dept] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [employees]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HR Dashboard</h1>
          <p className="text-sm text-gray-500">
            Track headcount, attendance, and new hires in one place.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-400">
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatsCard title="Total Employees" value={stats.totalEmployees} icon={Users} />
        <StatsCard title="Active Team" value={stats.active} icon={CalendarCheck} trend="Working today" />
        <StatsCard title="On Leave" value={stats.onLeave} icon={Clock} trend="Out of office" />
        <StatsCard title="New Hires (30d)" value={stats.newHires} icon={UserPlus} trend="Last 30 days" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Hires</CardTitle>
            <Link to="/hr/staff">
              <Button variant="ghost" size="sm" className="text-[#003D82]">
                View all
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-6 w-6 animate-spin text-[#003D82]" />
              </div>
            ) : recentEmployees.length === 0 ? (
              <div className="text-center py-10 text-gray-500">
                <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>No employees found yet.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentEmployees.map((employee) => {
                    const joined = pickDate(employee);
                    return (
                      <TableRow key={employee.id || employee.email}>
                        <TableCell className="font-medium">{pickName(employee)}</TableCell>
                        <TableCell>{pickRole(employee)}</TableCell>
                        <TableCell>{pickDepartment(employee)}</TableCell>
                        <TableCell className="text-right text-sm text-gray-500">
                          {joined ? joined.toLocaleDateString() : '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Department Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-[#003D82]" />
              </div>
            ) : departmentSnapshot.length === 0 ? (
              <div className="text-sm text-gray-500">
                Add employees to see department distribution.
              </div>
            ) : (
              departmentSnapshot.map(([dept, count]) => (
                <div key={dept} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{dept}</span>
                  <span className="font-semibold text-gray-900">{count}</span>
                </div>
              ))
            )}
            <div className="pt-2">
              <Link to="/hr/staff">
                <Button variant="outline" className="w-full">
                  Manage Employees
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
