import express from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { notifyUser, notifyRole } from '../lib/notify.js';

const router = express.Router();

const isHttpUrl = (v) => typeof v === 'string' && /^https?:\/\//i.test(v);
const looksLikePdf = (v = '') => String(v || '').toLowerCase().includes('.pdf');

function normalizeDocType(type = '') {
  return String(type || '').trim().toLowerCase().replace(/\s+/g, '_') || 'document';
}

function extractSupabasePath(url) {
  if (!isHttpUrl(url)) return null;

  const m =
    url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/i) ||
    url.match(/\/storage\/v1\/object\/sign\/([^/]+)\/(.+?)(\?.*)?$/i) ||
    url.match(/\/storage\/v1\/object\/([^/]+)\/(.+)$/i);

  if (!m) return null;

  const bucket = decodeURIComponent(m[1]);
  const path = decodeURIComponent(m[2]).split('?')[0];
  return { bucket, path };
}

async function toWorkingUrl(value, defaultBucket = 'avatars', expiresSec = 60 * 60) {
  try {
    if (!value) return '';

    if (isHttpUrl(value)) {
      const info = extractSupabasePath(value);
      if (info?.bucket && info?.path) {
        const { data, error } = await supabase.storage.from(info.bucket).createSignedUrl(info.path, expiresSec);
        if (!error && data?.signedUrl) return data.signedUrl;
      }
      return value;
    }

    const path = String(value).replace(/^\/+/, '');
    const { data, error } = await supabase.storage.from(defaultBucket).createSignedUrl(path, expiresSec);
    if (!error && data?.signedUrl) return data.signedUrl;

    return '';
  } catch {
    return '';
  }
}

// GET /api/kyc/vendors?status=ALL|PENDING|SUBMITTED|APPROVED|REJECTED
router.get('/vendors', async (req, res) => {
  try {
    const { status = 'ALL' } = req.query;

    let query = supabase.from('vendors').select('*').order('created_at', { ascending: false });
    if (status && status !== 'ALL') query = query.eq('kyc_status', status);

    const { data, error } = await query;
    if (error) return res.status(500).json({ success: false, error: 'Failed to fetch vendors', details: error.message });

    return res.json({ success: true, vendors: data || [] });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Failed to fetch vendors', details: e.message });
  }
});

// GET /api/kyc/vendors/:vendorId/documents
router.get('/vendors/:vendorId/documents', async (req, res) => {
  try {
    const { vendorId } = req.params;

    // ✅ NO kyc_docs column here
    const { data: vendor, error: vErr } = await supabase
      .from('vendors')
      .select('id, company_name, owner_name, email, phone, kyc_status, gst_number, pan_number, created_at, updated_at')
      .eq('id', vendorId)
      .maybeSingle();

    if (vErr) return res.status(500).json({ success: false, error: 'Failed to fetch vendor', details: vErr.message });

    const docs = [];

    // 1) vendor_documents table (your upload is saving here)
    try {
      const { data: vDocs, error } = await supabase
        .from('vendor_documents')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('uploaded_at', { ascending: false });

      if (!error && vDocs?.length) {
        for (const d of vDocs) {
          const raw = d.document_url || d.url || d.file_path || d.path || d.public_url || '';
          const url = await toWorkingUrl(raw, 'avatars');
          if (!url) continue;

          docs.push({
            document_type: normalizeDocType(d.document_type || d.type || 'document'),
            url,
            original: raw,
            status: d.verification_status || d.status || 'PENDING',
            is_pdf: looksLikePdf(url) || looksLikePdf(raw),
            created_at: d.uploaded_at || d.created_at || vendor?.created_at || new Date().toISOString(),
            source: 'vendor_documents',
          });
        }
      }
    } catch {
      // ignore
    }

    // 2) Optional: kyc_documents table (if exists in your DB)
    try {
      const { data: tableDocs, error } = await supabase
        .from('kyc_documents')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false });

      if (!error && tableDocs?.length) {
        for (const d of tableDocs) {
          const raw = d.url || d.document_url || d.file_path || d.path || d.public_url || '';
          const url = await toWorkingUrl(raw, 'avatars');
          if (!url) continue;

          docs.push({
            document_type: normalizeDocType(d.document_type || d.type || 'document'),
            url,
            original: raw,
            status: d.status || d.verification_status || 'PENDING',
            is_pdf: looksLikePdf(url) || looksLikePdf(raw),
            created_at: d.created_at || vendor?.created_at || new Date().toISOString(),
            source: 'kyc_documents',
          });
        }
      }
    } catch {
      // ignore
    }

    // 3) Storage fallback (even if DB row missing)
    const folders = [`vendor-docs/${vendorId}`, `vendor-kyc/${vendorId}`];
    for (const folder of folders) {
      try {
        const { data: files, error } = await supabase.storage.from('avatars').list(folder, { limit: 100 });
        if (error || !files?.length) continue;

        for (const f of files) {
          if (!f?.name) continue;
          const fullPath = `${folder}/${f.name}`;

          const { data: signed, error: signErr } = await supabase.storage.from('avatars').createSignedUrl(fullPath, 60 * 60);
          if (signErr || !signed?.signedUrl) continue;

          docs.push({
            document_type: normalizeDocType((f.name.split('_')[0] || 'document').trim()),
            url: signed.signedUrl,
            original: fullPath,
            status: 'PENDING',
            is_pdf: looksLikePdf(f.name) || looksLikePdf(signed.signedUrl),
            created_at: f.created_at || vendor?.created_at || new Date().toISOString(),
            source: 'storage:list',
          });
        }
      } catch {
        // ignore
      }
    }

    // dedupe
    const seen = new Set();
    const finalDocs = (docs || []).filter((d) => {
      const key = `${d.document_type}::${d.url}`;
      if (!d.url) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return res.json({
      success: true,
      vendor: vendor || null,
      documents: finalDocs,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Failed to load documents', details: e.message });
  }
});

router.post('/vendors/:vendorId/approve', async (req, res) => {
  try {
    const { vendorId } = req.params;

    const { data, error } = await supabase
      .from('vendors')
      .update({
        kyc_status: 'APPROVED',
        is_verified: true,
        verification_badge: true,
        verified_at: new Date().toISOString(),
      })
      .eq('id', vendorId)
      .select()
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: 'Approve failed', details: error.message });

    if (data?.user_id) {
      await notifyUser({
        user_id: data.user_id,
        type: 'KYC_APPROVED',
        title: 'KYC Approved',
        message: 'Your KYC has been approved. Your account is now verified.',
        link: '/vendor/profile?tab=kyc',
      });
    }

    await notifyRole('DATA_ENTRY', {
      type: 'KYC_VENDOR_APPROVED',
      title: 'Vendor KYC approved',
      message: `Admin approved KYC for vendor "${data?.company_name || 'Vendor'}".`,
      link: '/employee/dataentry/kyc-review',
    });

    await notifyRole('SUPPORT', {
      type: 'KYC_VENDOR_APPROVED',
      title: 'Vendor KYC approved',
      message: `KYC approved for vendor "${data?.company_name || 'Vendor'}".`,
      link: '/employee/support/dashboard',
    });
    return res.json({ success: true, vendor: data });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Approve failed', details: e.message });
  }
});

router.post('/vendors/:vendorId/reject', async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { remarks } = req.body || {};

    const { data, error } = await supabase
      .from('vendors')
      .update({
        kyc_status: 'REJECTED',
        is_verified: false,
        verification_badge: false,
        rejection_reason: (remarks || '').trim() || null,
      })
      .eq('id', vendorId)
      .select()
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: 'Reject failed', details: error.message });

    if (data?.user_id) {
      await notifyUser({
        user_id: data.user_id,
        type: 'KYC_REJECTED',
        title: 'KYC Rejected',
        message: (remarks || '').trim() || 'Your KYC was rejected. Please re-upload the correct documents.',
        link: '/vendor/profile?tab=kyc',
      });
    }

    await notifyRole('DATA_ENTRY', {
      type: 'KYC_VENDOR_REJECTED',
      title: 'Vendor KYC rejected',
      message:
        `Admin rejected KYC for vendor "${data?.company_name || 'Vendor'}"` +
        `${(remarks || '').trim() ? `: ${(remarks || '').trim()}` : '.'}`,
      link: '/employee/dataentry/kyc-review',
    });

    await notifyRole('SUPPORT', {
      type: 'KYC_VENDOR_REJECTED',
      title: 'Vendor KYC rejected',
      message:
        `KYC rejected for vendor "${data?.company_name || 'Vendor'}"` +
        `${(remarks || '').trim() ? `: ${(remarks || '').trim()}` : '.'}`,
      link: '/employee/support/dashboard',
    });
    return res.json({ success: true, vendor: data });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Reject failed', details: e.message });
  }
});

export default router;
