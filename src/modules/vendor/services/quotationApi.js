// ✅ Frontend Quotation API (Vite bundle-safe)
//
// This file is imported by React pages (SendQuotation.jsx, Buyer Quotations, etc.)
// so it MUST be an ESM module and MUST export `quotationApi`.
//
// Local dev:
//   Vite proxy routes /api -> http://localhost:3001 (see vite.config.js)
// Production (Netlify):
//   Netlify Functions are available at /.netlify/functions/<name>

import { supabase } from '@/lib/customSupabaseClient';
import { vendorApi } from '@/modules/vendor/services/vendorApi';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';

// Helper to decide whether we're on localhost dev or Netlify
const isLocal =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const API_BASE = isLocal ? '/api' : '/.netlify/functions';

const safeJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const fetchQuotationJson = async (path, options = {}) => {
  const res = await fetchWithCsrf(apiUrl(path), options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || data?.message || 'Request failed');
  }
  return data;
};

const normalizeQuotationRow = (row) => {
  if (!row) return row;
  return {
    ...row,

    // Backward-compatible aliases used by UI
    quotation_amount: row.quotation_amount ?? row.budget ?? null,
    terms_conditions: row.terms_conditions ?? row.description ?? null,

    // Common aliases
    amount: row.amount ?? row.quotation_amount ?? row.budget ?? null,
  };
};

export const quotationApi = {
  /**
   * Send quotation to a buyer email.
   * - Local:   POST /api/quotation/send (proxied to Express on :3001)
   * - Netlify: POST /.netlify/functions/quotation/send
   */
  sendQuotation: async (quotationData) => {
    const vendor = await vendorApi.auth.me();
    if (!vendor?.id) throw new Error('Vendor not found');

    const payload = {
      quotation_title: quotationData?.quotation_title,
      quotation_amount: quotationData?.quotation_amount,
      quantity: quotationData?.quantity || null,
      unit: quotationData?.unit || 'pieces',
      validity_days: quotationData?.validity_days || 30,
      delivery_days: quotationData?.delivery_days || null,
      terms_conditions: quotationData?.terms_conditions || '',
      buyer_email: quotationData?.buyer_email,
      // ⚠️ Backend validates buyer_id itself; kept for backwards compatibility.
      buyer_id: quotationData?.buyer_id || null,

      vendor_id: vendor.id,
      vendor_name: vendor.owner_name || vendor.ownerName || null,
      vendor_company: vendor.company_name || vendor.companyName || null,
      vendor_phone: vendor.phone || null,
      vendor_email: vendor.email || null,

      // Optional PDF attachment (base64)
      attachment_name: quotationData?.attachment?.name || null,
      attachment_base64: quotationData?.attachment?.base64 || null,
      attachment_mime: quotationData?.attachment?.mime || null,
    };

    const url = `${API_BASE}/quotation/send`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || data?.message || 'Failed to send quotation');
    }

    return data;
  },

  /**
   * Get quotations sent by the logged-in vendor.
   * NOTE: Stored in `proposals` with status='SENT'.
   */
  getSentQuotations: async (opts = {}) => {
    try {
      const params = new URLSearchParams();
      if (opts?.limit) params.set('limit', String(opts.limit));
      const query = params.toString();
      const response = await fetchQuotationJson(`/api/quotation/sent${query ? `?${query}` : ''}`);
      if (Array.isArray(response?.quotations)) {
        return response.quotations.map(normalizeQuotationRow);
      }
    } catch (e) {
      console.warn('[quotationApi.getSentQuotations] backend fetch failed, falling back:', e?.message || e);
    }

    const vendor = await vendorApi.auth.me();
    if (!vendor?.id) throw new Error('Vendor not found');

    let q = supabase
      .from('proposals')
      .select('*')
      .eq('vendor_id', vendor.id)
      .eq('status', 'SENT')
      .not('buyer_email', 'is', null)
      .neq('buyer_email', '')
      .order('created_at', { ascending: false });

    if (opts?.limit) q = q.limit(opts.limit);

    const { data, error } = await q;
    if (error) throw error;

    const rows = (data || []).map(normalizeQuotationRow);
    const buyerIds = Array.from(
      new Set(rows.map((row) => String(row?.buyer_id || '').trim()).filter(Boolean))
    );

    if (!buyerIds.length) return rows;

    const { data: buyers, error: buyerError } = await supabase
      .from('buyers')
      .select('id, full_name, company_name, email, phone, mobile_number, mobile')
      .in('id', buyerIds);

    if (buyerError || !Array.isArray(buyers)) return rows;

    const buyerMap = new Map(
      buyers.map((buyer) => [
        String(buyer.id),
        {
          full_name: buyer?.full_name || buyer?.company_name || null,
          company_name: buyer?.company_name || null,
          email: buyer?.email || null,
          phone: buyer?.phone || buyer?.mobile_number || buyer?.mobile || null,
        },
      ])
    );

    return rows.map((row) => ({
      ...row,
      buyers: row?.buyers || buyerMap.get(String(row?.buyer_id || '').trim()) || null,
    }));
  },

  /**
   * Get quotations received by a buyer.
   * Caller usually passes buyer EMAIL.
   *
   * We support both:
   * - Registered buyer: find buyers.id by email and fetch proposals by buyer_id
   * - Unregistered buyer: fetch proposals by buyer_email (buyer_id may be null)
   */
  getReceivedQuotations: async (buyerEmailOrId) => {
    try {
      const response = await fetchQuotationJson('/api/quotation/received');
      if (Array.isArray(response?.quotations)) {
        const rows = response.quotations.map(normalizeQuotationRow);
        rows.sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0));
        return rows;
      }
    } catch (e) {
      console.warn('[quotationApi.getReceivedQuotations] backend fetch failed, falling back:', e?.message || e);
    }

    if (!buyerEmailOrId) throw new Error('Buyer ID or email required');

    const raw = String(buyerEmailOrId).trim();
    const looksLikeEmail = raw.includes('@');
    const email = looksLikeEmail ? raw.toLowerCase() : null;

    let buyerId = looksLikeEmail ? null : raw;

    // If email provided, attempt to resolve buyers.id
    if (looksLikeEmail) {
      const { data: buyer, error: bErr } = await supabase
        .from('buyers')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      if (bErr) throw bErr;
      buyerId = buyer?.id || null;
    }

    const results = [];
    const seen = new Set();

    // 1) Registered flow: by buyer_id
    if (buyerId) {
      const { data, error } = await supabase
        .from('proposals')
        .select(
          `
          id, title, budget, quantity, description, status, created_at, buyer_email, vendor_id,
          vendors:vendor_id(id, company_name, owner_name, profile_image, phone, email, is_verified, verification_badge, kyc_status, is_active)
        `
        )
        .eq('buyer_id', buyerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      (data || []).forEach((row) => {
        const norm = normalizeQuotationRow(row);
        if (norm?.id && !seen.has(norm.id)) {
          seen.add(norm.id);
          results.push(norm);
        }
      });
    }

    // 2) Email flow (covers unregistered and also acts as fallback)
    if (email) {
      const { data, error } = await supabase
        .from('proposals')
        .select(
          `
          id, title, budget, quantity, description, status, created_at, buyer_email, vendor_id,
          vendors:vendor_id(id, company_name, owner_name, profile_image, phone, email, is_verified, verification_badge, kyc_status, is_active)
        `
        )
        .eq('buyer_email', email)
        .order('created_at', { ascending: false });
      if (error) throw error;
      (data || []).forEach((row) => {
        const norm = normalizeQuotationRow(row);
        if (norm?.id && !seen.has(norm.id)) {
          seen.add(norm.id);
          results.push(norm);
        }
      });
    }

    // Sort newest first (in case we merged two lists)
    results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return results;
  },

  /**
   * Optional helper: update quotation/proposal status.
   * Example: quotationApi.updateStatus(id, 'ACCEPTED')
   */
  updateStatus: async (proposalId, status) => {
    if (!proposalId) throw new Error('proposalId is required');
    if (!status) throw new Error('status is required');

    const { data, error } = await supabase
      .from('proposals')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', proposalId)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    return normalizeQuotationRow(data);
  },
};
