import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { IndianRupee, Percent } from 'lucide-react';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';

const number = (v) => Number(v || 0);
const fmt = (d) => {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date)) return '-';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const AdminFinance = () => {
  const [payments, setPayments] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    code: '',
    discount_type: 'PERCENT',
    value: '',
    plan_id: 'ANY',
    vendor_id: '',
    max_uses: '',
    expires_at: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [payRes, cpnRes, planRes] = await Promise.all([
        fetchWithCsrf('/api/finance/payments'),
        fetchWithCsrf('/api/finance/coupons'),
        fetchWithCsrf('/api/payment/plans'),
      ]);
      const payJson = await payRes.json();
      const cpnJson = await cpnRes.json();
      const planJson = await planRes.json();
      if (payJson.success) setPayments(payJson.data || []);
      if (cpnJson.success) setCoupons(cpnJson.data || []);
      if (planJson.success) setPlans(planJson.data || []);
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to load finance data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const deleteCoupon = async (id) => {
    if (!id) return;
    if (!window.confirm('Delete this coupon?')) return;
    try {
      const res = await fetchWithCsrf(`/api/finance/coupons/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed');
      toast({ title: 'Deleted', description: 'Coupon removed' });
      fetchData();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const kpis = useMemo(() => {
    const gross = payments.reduce((s, p) => s + number(p.amount), 0);
    const net = payments.reduce((s, p) => s + number(p.net_amount ?? p.amount), 0);
    return { gross, net };
  }, [payments]);

  const createCoupon = async () => {
    try {
      if (!form.code || !form.value) {
        toast({ title: 'Required', description: 'Code and value are required', variant: 'destructive' });
        return;
      }
      const payload = {
        ...form,
        code: form.code.trim().toUpperCase(),
        value: Number(form.value),
        max_uses: form.max_uses ? Number(form.max_uses) : 0,
        plan_id: form.plan_id === 'ANY' ? null : form.plan_id,
        vendor_id: form.vendor_id || null,
        expires_at: form.expires_at || null,
      };
      const res = await fetchWithCsrf('/api/finance/coupons', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed');
      toast({ title: 'Coupon created', description: payload.code });
      setForm({ ...form, code: '', value: '', max_uses: '', vendor_id: '' });
      fetchData();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const exportCsv = () => {
    const header = [
      'vendor',
      'plan',
      'amount',
      'discount',
      'net',
      'coupon',
      'payment_date',
      'transaction',
    ];
    const rows = payments.map((p) =>
      [
        p.vendor?.company_name || p.vendor_id,
        p.plan?.name || p.plan_id,
        number(p.amount),
        number(p.discount_amount || 0),
        number(p.net_amount ?? p.amount),
        p.coupon_code || '',
        p.payment_date || '',
        p.transaction_id || '',
      ].join(',')
    );
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'payments.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Finance</h1>
          <p className="text-sm text-neutral-500">Payments overview and coupon management</p>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={loading}>
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Gross</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold flex items-center gap-2">
            <IndianRupee className="h-5 w-5" />
            {kpis.gross.toLocaleString('en-IN')}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Net</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold flex items-center gap-2">
            <IndianRupee className="h-5 w-5" />
            {kpis.net.toLocaleString('en-IN')}
          </CardContent>
        </Card>
      </div>

      <Card id="payments">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Payments</CardTitle>
          <div className="space-x-2">
            <Button size="sm" variant="outline" onClick={exportCsv}>
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Net</TableHead>
                <TableHead>Coupon</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Txn</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.vendor?.company_name || p.vendor_id}</TableCell>
                  <TableCell>{p.plan?.name || p.plan_id}</TableCell>
                  <TableCell>₹ {number(p.amount).toLocaleString('en-IN')}</TableCell>
                  <TableCell>{number(p.discount_amount || 0) > 0 ? `₹ ${number(p.discount_amount).toLocaleString('en-IN')}` : '-'}</TableCell>
                  <TableCell>₹ {number(p.net_amount ?? p.amount).toLocaleString('en-IN')}</TableCell>
                  <TableCell>{p.coupon_code || '-'}</TableCell>
                  <TableCell>{fmt(p.payment_date)}</TableCell>
                  <TableCell className="text-xs break-all">{p.transaction_id || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create Coupon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Code</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="NEWYEAR50" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v })}>
                <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENT">Percent</SelectItem>
                  <SelectItem value="FLAT">Flat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Value</Label>
              <div className="flex items-center gap-2">
                {form.discount_type === 'PERCENT' ? <Percent className="h-4 w-4 text-neutral-500" /> : <IndianRupee className="h-4 w-4 text-neutral-500" />}
                <Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Plan (optional)</Label>
              <Select value={form.plan_id} onValueChange={(v) => setForm({ ...form, plan_id: v })}>
                <SelectTrigger><SelectValue placeholder="Any plan" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANY">Any</SelectItem>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vendor ID (optional)</Label>
              <Input value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })} placeholder="Limit to vendor" />
            </div>
            <div>
              <Label>Max Uses (0 = unlimited)</Label>
              <Input type="number" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} />
            </div>
            <div>
              <Label>Expires At</Label>
              <Input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
            </div>
          </div>
          <Button onClick={createCoupon}>Create Coupon</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coupons</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-semibold">{c.code}</TableCell>
                  <TableCell>{c.discount_type === 'PERCENT' ? `${c.value}%` : `₹ ${c.value}`}</TableCell>
                  <TableCell>
                    {c.plan_id ? (c.plan?.name || c.plan_id) : 'Any'}
                  </TableCell>
                  <TableCell>
                    {c.vendor_id
                      ? (c.vendor?.company_name || c.vendor?.owner_name || c.vendor?.vendor_id || c.vendor_id)
                      : 'Any'}
                  </TableCell>
                  <TableCell>{c.used_count || 0}/{c.max_uses || '∞'}</TableCell>
                  <TableCell>
                    <Badge variant={c.is_active ? 'default' : 'secondary'}>{c.is_active ? 'Active' : 'Inactive'}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="destructive" onClick={() => deleteCoupon(c.id)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminFinance;
