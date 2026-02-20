import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { IndianRupee, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { useInternalAuth } from '@/modules/admin/context/InternalAuthContext';

const number = (v) => Number(v || 0);
const currencyFormatter = new Intl.NumberFormat('en-IN');

const formatCurrency = (value) => currencyFormatter.format(number(value));

const safeReadJson = async (res) => {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await res.json();
  const text = await res.text();
  throw new Error(`API returned non-JSON (${res.status}). Got: ${text.slice(0, 120)}...`);
};

const formatDate = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return format(d, 'dd MMM yyyy');
};

const csvEscape = (value) => {
  const text = String(value ?? '');
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const FinanceDashboard = () => {
  const { user: internalUser, isLoading: internalLoading } = useInternalAuth();
  const [summary, setSummary] = useState({ totalGross: 0, totalNet: 0, last30: 0 });
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        fetchWithCsrf('/api/finance/summary'),
        fetchWithCsrf('/api/finance/payments'),
      ]);
      const sj = await safeReadJson(s);
      const pj = await safeReadJson(p);
      if (!sj?.success) throw new Error(sj?.error || 'Failed to load finance summary');
      if (!pj?.success) throw new Error(pj?.error || 'Failed to load finance payments');
      setSummary(sj?.data || { totalGross: 0, totalNet: 0, last30: 0 });
      setPayments(Array.isArray(pj?.data) ? pj.data : []);
      setLastUpdated(new Date());
    } catch (e) {
      toast({ title: 'Error', description: e?.message || 'Failed to load finance data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (internalLoading) return;

    const role = String(internalUser?.role || '').toUpperCase();
    const canAccessFinance = role === 'FINANCE' || role === 'ADMIN';

    if (!canAccessFinance) {
      setLoading(false);
      return;
    }

    load();
  }, [internalLoading, internalUser?.role]);

  const exportCsv = () => {
    const header = ['vendor', 'plan', 'net', 'payment_date', 'coupon'];
    const rows = (payments || []).map((p) =>
      [
        p.vendor?.company_name || p.vendor_id || '',
        p.plan?.name || p.plan_id || '',
        number(p.net_amount ?? p.amount),
        p.payment_date || '',
        p.coupon_code || '',
      ]
        .map(csvEscape)
        .join(',')
    );
    const csv = [header.map(csvEscape).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'finance-dashboard.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const cards = useMemo(
    () => [
      { title: 'Total Gross', value: summary.totalGross },
      { title: 'Total Net', value: summary.totalNet },
      { title: 'Last 30 days', value: summary.last30 },
    ],
    [summary]
  );

  const paymentRows = useMemo(() => {
    return (payments || [])
      .slice()
      .sort((a, b) => {
        const daRaw = new Date(a.payment_date || 0).getTime();
        const dbRaw = new Date(b.payment_date || 0).getTime();
        const da = Number.isNaN(daRaw) ? 0 : daRaw;
        const db = Number.isNaN(dbRaw) ? 0 : dbRaw;
        return db - da;
      });
  }, [payments]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Finance Dashboard</h1>
          <p className="text-sm text-neutral-500">Payments overview for finance team</p>
          {lastUpdated ? (
            <p className="text-xs text-neutral-400 mt-1">
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          ) : null}
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardHeader>
              <CardTitle>{c.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold flex items-center gap-2">
              <IndianRupee className="h-5 w-5" />
              {formatCurrency(c.value)}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card id="payments">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Payments</CardTitle>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={payments.length === 0}>
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
            </div>
          ) : paymentRows.length === 0 ? (
            <div className="text-center py-8 text-neutral-500">No payments found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Coupon</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentRows.slice(0, 200).map((p) => (
                  <TableRow key={p.id || `${p.vendor_id}-${p.payment_date}`}>
                    <TableCell>{p.vendor?.company_name || p.vendor_id || '-'}</TableCell>
                    <TableCell>{p.plan?.name || p.plan_id || '-'}</TableCell>
                    <TableCell>₹ {formatCurrency(p.net_amount ?? p.amount)}</TableCell>
                    <TableCell>{formatDate(p.payment_date)}</TableCell>
                    <TableCell>{p.coupon_code || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FinanceDashboard;
