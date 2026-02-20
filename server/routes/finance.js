import express from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireEmployeeRoles } from '../middleware/requireEmployeeRoles.js';

const router = express.Router();

// Finance APIs require FINANCE or ADMIN employees.
router.use(requireEmployeeRoles(['FINANCE', 'ADMIN']));

// GET /api/finance/payments
// Optional query params: vendor_id, plan_id, from, to, limit
router.get('/payments', async (req, res) => {
  try {
    const { vendor_id, plan_id, from, to, limit = 200 } = req.query;
    let query = supabase
      .from('vendor_payments')
      .select('*, vendor:vendors(id, vendor_id, company_name, email), plan:vendor_plans(id, name, price)')
      .order('payment_date', { ascending: false })
      .limit(Number(limit) || 200);

    if (vendor_id) query = query.eq('vendor_id', vendor_id);
    if (plan_id) query = query.eq('plan_id', plan_id);
    if (from) query = query.gte('payment_date', from);
    if (to) query = query.lte('payment_date', to);

    const { data, error } = await query;
    if (error) return res.status(500).json({ success: false, error: error.message });

    await writeAuditLog({
      req,
      actor: req.actor,
      action: 'FINANCE_PAYMENTS_VIEWED',
      entityType: 'vendor_payments',
      details: {
        filters: {
          vendor_id: vendor_id || null,
          plan_id: plan_id || null,
          from: from || null,
          to: to || null,
        },
        count: data?.length || 0,
      },
    });

    return res.json({ success: true, data: data || [] });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/finance/summary
router.get('/summary', async (_req, res) => {
  try {
    const { data: payments, error } = await supabase
      .from('vendor_payments')
      .select('amount, net_amount, payment_date');
    if (error) return res.status(500).json({ success: false, error: error.message });

    const { data: leads, error: leadErr } = await supabase
      .from('lead_purchases')
      .select('amount, purchase_date, created_at');
    if (leadErr) {
      // Do not fail summary if lead_purchases is missing/blocked.
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

    await writeAuditLog({
      req: _req,
      actor: _req.actor,
      action: 'FINANCE_SUMMARY_VIEWED',
      entityType: 'vendor_payments',
      details: { totalGross, totalNet, totalLead, totalRevenue, last30 },
    });

    return res.json({
      success: true,
      data: {
        totalGross,
        totalNet,
        totalLead,
        totalRevenue,
        last30,
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Coupons ---------------------------------------------------

// GET /api/finance/coupons
router.get('/coupons', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('vendor_plan_coupons')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ success: false, error: error.message });

    const coupons = Array.isArray(data) ? data : [];
    const planIds = Array.from(new Set(coupons.map((c) => c.plan_id).filter(Boolean)));
    const vendorIds = Array.from(new Set(coupons.map((c) => c.vendor_id).filter(Boolean)));

    let planMap = {};
    let vendorMap = {};

    if (planIds.length) {
      const { data: plans, error: planErr } = await supabase
        .from('vendor_plans')
        .select('id, name')
        .in('id', planIds);
      if (planErr) {
        console.warn('[finance/coupons] plan lookup failed:', planErr.message);
      } else {
        planMap = (plans || []).reduce((acc, p) => {
          if (p?.id) acc[p.id] = p;
          return acc;
        }, {});
      }
    }

    if (vendorIds.length) {
      const { data: vendors, error: vendorErr } = await supabase
        .from('vendors')
        .select('id, company_name, owner_name, vendor_id')
        .in('id', vendorIds);
      if (vendorErr) {
        console.warn('[finance/coupons] vendor lookup failed:', vendorErr.message);
      } else {
        vendorMap = (vendors || []).reduce((acc, v) => {
          if (v?.id) acc[v.id] = v;
          return acc;
        }, {});
      }
    }

    const enriched = coupons.map((c) => ({
      ...c,
      plan: c.plan_id ? planMap[c.plan_id] || null : null,
      vendor: c.vendor_id ? vendorMap[c.vendor_id] || null : null,
    }));

    return res.json({ success: true, data: enriched });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/finance/coupons
router.post('/coupons', async (req, res) => {
  try {
    const {
      code,
      discount_type,
      value,
      plan_id = null,
      vendor_id = null,
      max_uses = 0,
      expires_at = null,
      is_active = true,
    } = req.body || {};

    if (!code || !discount_type || !value) {
      return res.status(400).json({ success: false, error: 'code, discount_type, value are required' });
    }

    const payload = {
      code: String(code).toUpperCase(),
      discount_type: discount_type.toUpperCase(),
      value,
      plan_id,
      vendor_id,
      max_uses,
      expires_at,
      is_active,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('vendor_plan_coupons').insert([payload]).select().single();
    if (error) return res.status(500).json({ success: false, error: error.message });

    await writeAuditLog({
      req,
      actor: req.actor,
      action: 'COUPON_CREATED',
      entityType: 'vendor_plan_coupons',
      entityId: data?.id || null,
      details: {
        code: payload.code,
        discount_type: payload.discount_type,
        value: payload.value,
        plan_id: payload.plan_id,
        vendor_id: payload.vendor_id,
        expires_at: payload.expires_at,
      },
    });

    return res.json({ success: true, data });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/finance/coupons/:code/deactivate
router.post('/coupons/:code/deactivate', async (req, res) => {
  try {
    const { code } = req.params;
    const { data, error } = await supabase
      .from('vendor_plan_coupons')
      .update({ is_active: false })
      .eq('code', code.toUpperCase())
      .select()
      .single();
    if (error) return res.status(500).json({ success: false, error: error.message });

    await writeAuditLog({
      req,
      actor: req.actor,
      action: 'COUPON_DEACTIVATED',
      entityType: 'vendor_plan_coupons',
      entityId: data?.id || null,
      details: { code: code.toUpperCase() },
    });

    return res.json({ success: true, data });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/finance/coupons/:id
router.delete('/coupons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, error: 'Missing coupon id' });

    const { data, error } = await supabase
      .from('vendor_plan_coupons')
      .delete()
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ success: false, error: error.message });

    await writeAuditLog({
      req,
      actor: req.actor,
      action: 'COUPON_DELETED',
      entityType: 'vendor_plan_coupons',
      entityId: id,
      details: { code: data?.code || null },
    });

    return res.json({ success: true, data });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});
export default router;
