import { createClient } from '@supabase/supabase-js';

const json = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    ...extraHeaders,
  },
  body: JSON.stringify(body),
});

const getSupabase = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
};

const parseRoute = (path = '') => {
  const parts = path.split('/').filter(Boolean);
  const idx = parts.lastIndexOf('finance');
  const rest = idx >= 0 ? parts.slice(idx + 1) : [];
  return { action: rest[0] || '', params: rest.slice(1) };
};

export const handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });

    const { action } = parseRoute(event.path);
    const supabase = getSupabase();

    // GET /api/finance/payments
    if (event.httpMethod === 'GET' && action === 'payments') {
      const { vendor_id, plan_id, from, to, limit = 200 } = event.queryStringParameters || {};
      let query = supabase
        .from('vendor_payments')
        .select('*, vendor:vendors(id,vendor_id,company_name,email), plan:vendor_plans(id,name,price)')
        .order('payment_date', { ascending: false })
        .limit(Number(limit) || 200);
      if (vendor_id) query = query.eq('vendor_id', vendor_id);
      if (plan_id) query = query.eq('plan_id', plan_id);
      if (from) query = query.gte('payment_date', from);
      if (to) query = query.lte('payment_date', to);
      const { data, error } = await query;
      if (error) return json(500, { success: false, error: error.message });
      return json(200, { success: true, data: data || [] });
    }

    // GET /api/finance/summary
    if (event.httpMethod === 'GET' && action === 'summary') {
      const { data: payments, error } = await supabase.from('vendor_payments').select('amount, net_amount, payment_date');
      if (error) return json(500, { success: false, error: error.message });
      const { data: leads, error: leadErr } = await supabase.from('lead_purchases').select('amount, purchase_date, created_at');
      if (leadErr) {
        console.warn('[finance/summary] lead_purchases error:', leadErr.message);
      }
      const now = new Date();
      const thirtyAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      let totalGross = 0;
      let totalNet = 0;
      let totalLead = 0;
      let last30 = 0;
      (payments || []).forEach((p) => {
        const gross = Number(p.amount || 0);
        const net = Number(p.net_amount ?? p.amount ?? 0);
        totalGross += gross;
        totalNet += net;
        if (p.payment_date && new Date(p.payment_date) >= thirtyAgo) last30 += net;
      });
      (leads || []).forEach((l) => {
        const amt = Number(l.amount || 0);
        totalLead += amt;
        const d = l.purchase_date || l.created_at;
        if (d && new Date(d) >= thirtyAgo) last30 += amt;
      });
      const totalRevenue = totalNet + totalLead;
      return json(200, { success: true, data: { totalGross, totalNet, totalLead, totalRevenue, last30 } });
    }

    // GET /api/finance/coupons
    if (event.httpMethod === 'GET' && action === 'coupons') {
      const { data, error } = await supabase.from('vendor_plan_coupons').select('*').order('created_at', { ascending: false });
      if (error) return json(500, { success: false, error: error.message });
      return json(200, { success: true, data: data || [] });
    }

    // POST /api/finance/coupons
    if (event.httpMethod === 'POST' && action === 'coupons') {
      const body = event.body ? JSON.parse(event.body) : {};
      const { code, discount_type, value, plan_id = null, vendor_id = null, max_uses = 0, expires_at = null, is_active = true } = body;
      if (!code || !discount_type || !value) return json(400, { success: false, error: 'code, discount_type, value are required' });
      const payload = {
        code: String(code).toUpperCase(),
        discount_type: String(discount_type).toUpperCase(),
        value,
        plan_id,
        vendor_id,
        max_uses,
        expires_at,
        is_active,
        created_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from('vendor_plan_coupons').insert([payload]).select().single();
      if (error) return json(500, { success: false, error: error.message });
      return json(200, { success: true, data });
    }

    // DELETE /api/finance/coupons/:id
    if (event.httpMethod === 'DELETE' && action === 'coupons') {
      const { params } = parseRoute(event.path);
      const id = params?.[0];
      if (!id) return json(400, { success: false, error: 'Missing coupon id' });
      const { data, error } = await supabase
        .from('vendor_plan_coupons')
        .delete()
        .eq('id', id)
        .select()
        .single();
      if (error) return json(500, { success: false, error: error.message });
      return json(200, { success: true, data });
    }

    // POST /api/finance/coupons/:code/deactivate
    if (event.httpMethod === 'POST' && action === 'coupons' && (event.path || '').toLowerCase().includes('deactivate')) {
      const parts = event.path.split('/').filter(Boolean);
      const code = parts[parts.length - 2]; // /api/finance/coupons/:code/deactivate
      const { data, error } = await supabase
        .from('vendor_plan_coupons')
        .update({ is_active: false })
        .eq('code', String(code).toUpperCase())
        .select()
        .single();
      if (error) return json(500, { success: false, error: error.message });
      return json(200, { success: true, data });
    }

    return json(404, { success: false, error: 'Invalid finance route' });
  } catch (error) {
    console.error('Finance function error:', error);
    return json(500, { success: false, error: error.message || 'Internal error' });
  }
};
