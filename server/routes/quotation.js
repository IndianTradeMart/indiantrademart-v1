import express from 'express';
import nodemailer from 'nodemailer';
import { supabase } from '../lib/supabaseClient.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

/**
 * Middleware to check basic request validation
 */
const validateQuotationRequest = (req, res, next) => {
  // Ensure required fields are present
  const { buyer_email, vendor_id, quotation_title } = req.body || {};
  
  if (!buyer_email || !vendor_id || !quotation_title) {
    return res.status(400).json({ error: 'Missing required fields: buyer_email, vendor_id, quotation_title' });
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(buyer_email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  
  // Validate vendor_id is UUID or numeric
  if (!/^[a-f0-9-]{36}$|^\d+$/.test(vendor_id.toString())) {
    return res.status(400).json({ error: 'Invalid vendor_id format' });
  }
  
  next();
};

/**
 * Create transporter:
 * - Prefer SMTP_* (production)
 * - Fallback to Gmail (local dev) if SMTP not configured
 */
const createTransporter = () => {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  if (process.env.GMAIL_EMAIL && process.env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_EMAIL,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }

  throw new Error(
    'Email transporter config missing. Set SMTP_HOST/SMTP_USER/SMTP_PASS (recommended) or GMAIL_EMAIL/GMAIL_APP_PASSWORD for local.'
  );
};

const transporter = createTransporter();

const insertNotification = async (payload) => {
  if (!payload?.user_id) return;

  let { error } = await supabase.from('notifications').insert([payload]);
  if (error && String(error?.message || '').toLowerCase().includes('reference_id')) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.reference_id;
    ({ error } = await supabase.from('notifications').insert([fallbackPayload]));
  }
  if (error) throw error;
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

async function resolveVendorForUser(user = {}) {
  const userId = String(user?.id || '').trim();
  const email = normalizeEmail(user?.email || '');

  if (userId) {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (!error && data) return data;
  }

  if (email) {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('email', email)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) return data;
  }

  return null;
}

async function resolveBuyerForUser(user = {}) {
  const userId = String(user?.id || '').trim();
  const email = normalizeEmail(user?.email || '');

  if (userId) {
    const { data, error } = await supabase
      .from('buyers')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (!error && data) return data;
  }

  if (email) {
    const { data, error } = await supabase
      .from('buyers')
      .select('*')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) return data;
  }

  return null;
}

const enrichBuyers = async (rows = []) => {
  const buyerIds = Array.from(
    new Set(
      (rows || [])
        .map((row) => String(row?.buyer_id || '').trim())
        .filter(Boolean)
    )
  );

  if (!buyerIds.length) return rows || [];

  const { data: buyers, error } = await supabase
    .from('buyers')
    .select('id, full_name, company_name, email, phone, avatar_url, is_active')
    .in('id', buyerIds);

  if (error || !Array.isArray(buyers)) return rows || [];

  const buyerMap = new Map(
    buyers.map((buyer) => [
      String(buyer.id),
      {
        full_name: buyer?.full_name || buyer?.company_name || null,
        company_name: buyer?.company_name || null,
        email: buyer?.email || null,
        phone: buyer?.phone || null,
        avatar_url: buyer?.avatar_url || null,
        is_active: typeof buyer?.is_active === 'boolean' ? buyer.is_active : null,
      },
    ])
  );

  return (rows || []).map((row) => ({
    ...row,
    buyers: buyerMap.get(String(row?.buyer_id || '').trim()) || null,
  }));
};

const enrichVendors = async (rows = []) => {
  const vendorIds = Array.from(
    new Set(
      (rows || [])
        .map((row) => String(row?.vendor_id || '').trim())
        .filter(Boolean)
    )
  );

  if (!vendorIds.length) return rows || [];

  const { data: vendors, error } = await supabase
    .from('vendors')
    .select('id, company_name, owner_name, phone, email, profile_image, is_verified, verification_badge, kyc_status, is_active')
    .in('id', vendorIds);

  if (error || !Array.isArray(vendors)) return rows || [];

  const vendorMap = new Map(vendors.map((vendor) => [String(vendor.id), vendor]));

  return (rows || []).map((row) => ({
    ...row,
    vendors: vendorMap.get(String(row?.vendor_id || '').trim()) || null,
  }));
};

const sanitizeMessageText = (value) =>
  String(value || '')
    .replace(/\r\n/g, '\n')
    .trim();

const MESSAGE_MARKERS = {
  edited: /^::itm_edited::$/i,
  deliveredBuyer: /^::itm_delivered_buyer::(.+)$/i,
  deliveredVendor: /^::itm_delivered_vendor::(.+)$/i,
  readBuyer: /^::itm_read_buyer::(.+)$/i,
  readVendor: /^::itm_read_vendor::(.+)$/i,
};

const parseStoredMessage = (rawValue) => {
  const lines = String(rawValue || '').replace(/\r\n/g, '\n').split('\n');
  const contentLines = [];
  const meta = {
    edited: false,
    delivered_buyer_at: null,
    delivered_vendor_at: null,
    read_buyer_at: null,
    read_vendor_at: null,
  };

  for (const line of lines) {
    const trimmed = String(line || '').trim();
    if (!trimmed) {
      contentLines.push(line);
      continue;
    }

    if (MESSAGE_MARKERS.edited.test(trimmed)) {
      meta.edited = true;
      continue;
    }

    const deliveredBuyerMatch = trimmed.match(MESSAGE_MARKERS.deliveredBuyer);
    if (deliveredBuyerMatch) {
      meta.delivered_buyer_at = String(deliveredBuyerMatch[1] || '').trim() || null;
      continue;
    }

    const deliveredVendorMatch = trimmed.match(MESSAGE_MARKERS.deliveredVendor);
    if (deliveredVendorMatch) {
      meta.delivered_vendor_at = String(deliveredVendorMatch[1] || '').trim() || null;
      continue;
    }

    const readBuyerMatch = trimmed.match(MESSAGE_MARKERS.readBuyer);
    if (readBuyerMatch) {
      meta.read_buyer_at = String(readBuyerMatch[1] || '').trim() || null;
      continue;
    }

    const readVendorMatch = trimmed.match(MESSAGE_MARKERS.readVendor);
    if (readVendorMatch) {
      meta.read_vendor_at = String(readVendorMatch[1] || '').trim() || null;
      continue;
    }

    contentLines.push(line);
  }

  return {
    text: contentLines.join('\n').trimEnd(),
    meta,
  };
};

const composeStoredMessage = (textValue, meta = {}) => {
  const cleanText = sanitizeMessageText(textValue);
  if (!cleanText) return '';

  const lines = [cleanText];
  if (meta?.edited) lines.push('::itm_edited::');
  if (meta?.delivered_buyer_at) lines.push(`::itm_delivered_buyer::${meta.delivered_buyer_at}`);
  if (meta?.delivered_vendor_at) lines.push(`::itm_delivered_vendor::${meta.delivered_vendor_at}`);
  if (meta?.read_buyer_at) lines.push(`::itm_read_buyer::${meta.read_buyer_at}`);
  if (meta?.read_vendor_at) lines.push(`::itm_read_vendor::${meta.read_vendor_at}`);
  return lines.join('\n');
};

const resolveActorMessagingRole = (access = {}, user = {}) => {
  if (access?.isVendorParticipant && !access?.isBuyerParticipant) return 'vendor';
  if (access?.isBuyerParticipant && !access?.isVendorParticipant) return 'buyer';

  const role = String(user?.role || '').trim().toUpperCase();
  if (role === 'VENDOR') return 'vendor';
  return 'buyer';
};

const getRoleMarkerKeys = (role = 'buyer') =>
  role === 'vendor'
    ? { deliveredKey: 'delivered_vendor_at', readKey: 'read_vendor_at' }
    : { deliveredKey: 'delivered_buyer_at', readKey: 'read_buyer_at' };

const buildStoredMessageText = (value, existingMeta = {}, { edited = false } = {}) => {
  const parsed = parseStoredMessage(value);
  const mergedMeta = {
    edited: edited || Boolean(existingMeta?.edited),
    delivered_buyer_at: existingMeta?.delivered_buyer_at || parsed.meta.delivered_buyer_at || null,
    delivered_vendor_at: existingMeta?.delivered_vendor_at || parsed.meta.delivered_vendor_at || null,
    read_buyer_at: existingMeta?.read_buyer_at || parsed.meta.read_buyer_at || null,
    read_vendor_at: existingMeta?.read_vendor_at || parsed.meta.read_vendor_at || null,
  };
  return composeStoredMessage(parsed.text, mergedMeta);
};

const normalizeMessageRow = (row = {}, actorPublicUserId = null, actorRole = 'buyer') => {
  const parsed = parseStoredMessage(row?.message);
  const isMe =
    !!actorPublicUserId &&
    String(row?.sender_id || '').trim() === String(actorPublicUserId).trim();

  const recipientRole = actorRole === 'buyer' ? 'vendor' : 'buyer';
  const { deliveredKey, readKey } = getRoleMarkerKeys(recipientRole);
  const deliveredAt = parsed.meta?.[deliveredKey] || null;
  const readAt = parsed.meta?.[readKey] || null;

  let deliveryState = 'sent';
  if (readAt) deliveryState = 'read';
  else if (deliveredAt) deliveryState = 'delivered';

  return {
    ...row,
    message: parsed.text,
    is_edited: Boolean(parsed.meta.edited),
    is_me: isMe,
    delivered_at: deliveredAt,
    read_at: readAt,
    delivery_state: isMe ? deliveryState : 'received',
  };
};

async function applyMessageAcks(rows = [], actorRole = 'buyer', actorPublicUserId = null, options = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length || !actorPublicUserId) return list;

  const markDelivered = options?.markDelivered !== false;
  const markRead = options?.markRead === true;
  const { deliveredKey, readKey } = getRoleMarkerKeys(actorRole);
  const nowIso = new Date().toISOString();

  const output = [];

  for (const row of list) {
    if (!row?.id) {
      output.push(row);
      continue;
    }

    if (String(row?.sender_id || '').trim() === String(actorPublicUserId).trim()) {
      output.push(row);
      continue;
    }

    const parsed = parseStoredMessage(row?.message);
    const nextMeta = { ...parsed.meta };
    let changed = false;

    if (markDelivered && !nextMeta[deliveredKey]) {
      nextMeta[deliveredKey] = nowIso;
      changed = true;
    }
    if (markRead && !nextMeta[readKey]) {
      nextMeta[readKey] = nowIso;
      changed = true;
    }

    if (!changed) {
      output.push(row);
      continue;
    }

    const storedMessage = composeStoredMessage(parsed.text, nextMeta);

    const { data: updatedRow, error } = await supabase
      .from('proposal_messages')
      .update({ message: storedMessage })
      .eq('id', row.id)
      .select('*')
      .maybeSingle();

    if (error || !updatedRow) {
      output.push(row);
      continue;
    }

    output.push(updatedRow);
  }

  return output;
}

async function resolvePublicUserIdForActor(user = {}) {
  const userId = String(user?.id || '').trim();
  const email = normalizeEmail(user?.email || '');

  if (userId) {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (!error && data?.id) return String(data.id);
  }

  if (email) {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data?.id) return String(data.id);
  }

  return null;
}

async function resolveProposalForMessaging(proposalId) {
  if (!proposalId) return null;

  const { data, error } = await supabase
    .from('proposals')
    .select('id, vendor_id, buyer_id, buyer_email, title, product_name')
    .eq('id', proposalId)
    .maybeSingle();

  if (error) throw new Error(error.message || 'Failed to load proposal');
  return data || null;
}

async function resolveProposalParticipantUserIds(proposal = {}) {
  const participantIds = {
    buyer_user_id: null,
    vendor_user_id: null,
  };

  const buyerId = String(proposal?.buyer_id || '').trim();
  const vendorId = String(proposal?.vendor_id || '').trim();
  const buyerEmail = normalizeEmail(proposal?.buyer_email || '');

  if (buyerId) {
    const { data: buyerRow } = await supabase
      .from('buyers')
      .select('user_id, email')
      .eq('id', buyerId)
      .maybeSingle();
    participantIds.buyer_user_id = String(buyerRow?.user_id || '').trim() || null;
  }

  if (!participantIds.buyer_user_id && buyerEmail) {
    const { data: buyerByEmail } = await supabase
      .from('buyers')
      .select('user_id')
      .eq('email', buyerEmail)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    participantIds.buyer_user_id = String(buyerByEmail?.user_id || '').trim() || null;
  }

  if (!participantIds.buyer_user_id && buyerEmail) {
    const { data: buyerUserByEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', buyerEmail)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    participantIds.buyer_user_id = String(buyerUserByEmail?.id || '').trim() || null;
  }

  if (vendorId) {
    const { data: vendorRow } = await supabase
      .from('vendors')
      .select('user_id, email')
      .eq('id', vendorId)
      .maybeSingle();
    participantIds.vendor_user_id = String(vendorRow?.user_id || '').trim() || null;

    const vendorEmail = normalizeEmail(vendorRow?.email || '');
    if (!participantIds.vendor_user_id && vendorEmail) {
      const { data: vendorUserByEmail } = await supabase
        .from('users')
        .select('id')
        .eq('email', vendorEmail)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      participantIds.vendor_user_id = String(vendorUserByEmail?.id || '').trim() || null;
    }
  }

  return participantIds;
}

async function canActorAccessProposalMessages(user = {}, proposal = {}) {
  const [buyer, vendor] = await Promise.all([
    resolveBuyerForUser(user),
    resolveVendorForUser(user),
  ]);

  const actorEmail = normalizeEmail(user?.email || '');
  const buyerEmail = normalizeEmail(proposal?.buyer_email || '');
  const proposalBuyerId = String(proposal?.buyer_id || '').trim();
  const proposalVendorId = String(proposal?.vendor_id || '').trim();

  const isVendorParticipant = Boolean(
    vendor?.id && String(vendor.id).trim() === proposalVendorId
  );

  const isBuyerParticipant = Boolean(
    (buyer?.id && String(buyer.id).trim() === proposalBuyerId) ||
    (buyerEmail && actorEmail && buyerEmail === actorEmail) ||
    (buyerEmail && normalizeEmail(buyer?.email || '') === buyerEmail)
  );

  return {
    isAllowed: isBuyerParticipant || isVendorParticipant,
    isBuyerParticipant,
    isVendorParticipant,
  };
}

// GET /api/quotation/sent (vendor dashboard list)
router.get('/sent', requireAuth(), async (req, res) => {
  try {
    const vendor = await resolveVendorForUser(req.user);
    if (!vendor?.id) {
      return res.status(403).json({ success: false, error: 'Vendor access required' });
    }

    let query = supabase
      .from('proposals')
      .select('*')
      .eq('vendor_id', vendor.id)
      .eq('status', 'SENT')
      .not('buyer_email', 'is', null)
      .neq('buyer_email', '')
      .order('created_at', { ascending: false });

    const requestedLimit = Number(req.query?.limit || 0);
    if (Number.isFinite(requestedLimit) && requestedLimit > 0) {
      query = query.limit(Math.min(requestedLimit, 200));
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ success: false, error: error.message || 'Failed to fetch sent quotations' });
    }

    const enriched = await enrichBuyers(data || []);
    return res.json({ success: true, quotations: enriched, total: enriched.length });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Failed to fetch sent quotations' });
  }
});

// GET /api/quotation/received (buyer dashboard list)
router.get('/received', requireAuth(), async (req, res) => {
  try {
    const buyer = await resolveBuyerForUser(req.user);
    if (!buyer?.id && !normalizeEmail(req.user?.email || '')) {
      return res.status(403).json({ success: false, error: 'Buyer access required' });
    }

    const buyerId = String(buyer?.id || '').trim();
    const buyerEmail = normalizeEmail(buyer?.email || req.user?.email || '');

    const merged = [];
    const seen = new Set();
    const pushRows = (rows = []) => {
      (rows || []).forEach((row) => {
        const key = String(row?.id || '').trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        merged.push(row);
      });
    };

    if (buyerId) {
      const byIdRes = await supabase
        .from('proposals')
        .select('*')
        .eq('buyer_id', buyerId)
        .not('buyer_email', 'is', null)
        .neq('buyer_email', '')
        .order('created_at', { ascending: false });
      if (!byIdRes.error) pushRows(byIdRes.data || []);
    }

    if (buyerEmail) {
      const byEmailRes = await supabase
        .from('proposals')
        .select('*')
        .eq('buyer_email', buyerEmail)
        .order('created_at', { ascending: false });
      if (!byEmailRes.error) pushRows(byEmailRes.data || []);
    }

    const enriched = await enrichVendors(merged);
    return res.json({ success: true, quotations: enriched, total: enriched.length });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Failed to fetch received quotations' });
  }
});

// GET /api/quotation/received/:quotationId (buyer quotation detail)
router.get('/received/:quotationId', requireAuth(), async (req, res) => {
  try {
    const quotationId = String(req.params?.quotationId || '').trim();
    if (!quotationId) {
      return res.status(400).json({ success: false, error: 'Invalid quotation id' });
    }

    const buyer = await resolveBuyerForUser(req.user);
    const buyerId = String(buyer?.id || '').trim();
    const buyerEmail = normalizeEmail(buyer?.email || req.user?.email || '');

    if (!buyerId && !buyerEmail) {
      return res.status(403).json({ success: false, error: 'Buyer access required' });
    }

    const { data: quotation, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', quotationId)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ success: false, error: error.message || 'Failed to fetch quotation detail' });
    }
    if (!quotation) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    const ownerMatch =
      (buyerId && String(quotation?.buyer_id || '').trim() === buyerId) ||
      (buyerEmail && normalizeEmail(quotation?.buyer_email || '') === buyerEmail);

    if (!ownerMatch) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    const [enrichedQuotation] = await enrichVendors([quotation]);

    const { data: messages, error: msgError } = await supabase
      .from('proposal_messages')
      .select('*')
      .eq('proposal_id', quotationId)
      .order('created_at', { ascending: true });

    if (msgError) {
      return res.status(500).json({ success: false, error: msgError.message || 'Failed to fetch quotation messages' });
    }

    const actorPublicUserId = await resolvePublicUserIdForActor(req.user);
    const actorRole = 'buyer';

    return res.json({
      success: true,
      quotation: {
        ...(enrichedQuotation || quotation),
        messages: (messages || []).map((row) => normalizeMessageRow(row, actorPublicUserId, actorRole)),
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Failed to fetch quotation detail' });
  }
});

// POST /api/quotation/messages/ack-delivered
router.post('/messages/ack-delivered', requireAuth(), async (req, res) => {
  try {
    const requestedIds = Array.isArray(req.body?.proposal_ids)
      ? req.body.proposal_ids
      : Array.isArray(req.body?.proposalIds)
        ? req.body.proposalIds
        : [];

    const proposalIds = Array.from(
      new Set(
        requestedIds
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      )
    ).slice(0, 200);

    if (!proposalIds.length) {
      return res.json({ success: true, updated: 0 });
    }

    const actorPublicUserId = await resolvePublicUserIdForActor(req.user);
    if (!actorPublicUserId) {
      return res.status(403).json({ success: false, error: 'User profile not found for messaging' });
    }

    let updated = 0;

    for (const proposalId of proposalIds) {
      const proposal = await resolveProposalForMessaging(proposalId);
      if (!proposal) continue;

      const access = await canActorAccessProposalMessages(req.user, proposal);
      if (!access.isAllowed) continue;

      const actorRole = resolveActorMessagingRole(access, req.user);
      const { data, error } = await supabase
        .from('proposal_messages')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('created_at', { ascending: true });

      if (error) continue;

      const ackedRows = await applyMessageAcks(data || [], actorRole, actorPublicUserId, {
        markDelivered: true,
        markRead: false,
      });

      for (let i = 0; i < (data || []).length; i += 1) {
        const before = data[i];
        const after = ackedRows[i];
        if (!before?.id || !after?.id) continue;
        if (String(before.message || '') !== String(after.message || '')) {
          updated += 1;
        }
      }
    }

    return res.json({ success: true, updated });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Failed to acknowledge delivery' });
  }
});

// GET /api/quotation/:proposalId/messages
router.get('/:proposalId/messages', requireAuth(), async (req, res) => {
  try {
    const proposalId = String(req.params?.proposalId || '').trim();
    if (!proposalId) {
      return res.status(400).json({ success: false, error: 'Invalid proposal id' });
    }

    const proposal = await resolveProposalForMessaging(proposalId);
    if (!proposal) {
      return res.status(404).json({ success: false, error: 'Proposal not found' });
    }

    const access = await canActorAccessProposalMessages(req.user, proposal);
    if (!access.isAllowed) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const actorPublicUserId = await resolvePublicUserIdForActor(req.user);
    const actorRole = resolveActorMessagingRole(access, req.user);

    const { data, error } = await supabase
      .from('proposal_messages')
      .select('*')
      .eq('proposal_id', proposalId)
      .order('created_at', { ascending: true });

    if (error) {
      return res.status(500).json({ success: false, error: error.message || 'Failed to load messages' });
    }

    const ackedRows = await applyMessageAcks(data || [], actorRole, actorPublicUserId, {
      markDelivered: true,
      markRead: true,
    });
    const participants = await resolveProposalParticipantUserIds(proposal);

    const normalizedMessages = (ackedRows || []).map((row) =>
      normalizeMessageRow(row, actorPublicUserId, actorRole)
    );

    return res.json({
      success: true,
      proposal: {
        id: proposal.id,
        title: proposal.title,
        product_name: proposal.product_name,
      },
      actor_user_id: actorPublicUserId,
      participants,
      messages: normalizedMessages,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Failed to load messages' });
  }
});

// POST /api/quotation/:proposalId/messages
router.post('/:proposalId/messages', requireAuth(), async (req, res) => {
  try {
    const proposalId = String(req.params?.proposalId || '').trim();
    if (!proposalId) {
      return res.status(400).json({ success: false, error: 'Invalid proposal id' });
    }

    const messageText = sanitizeMessageText(req.body?.message);
    if (!messageText) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }
    if (messageText.length > 4000) {
      return res.status(400).json({ success: false, error: 'Message is too long' });
    }

    const proposal = await resolveProposalForMessaging(proposalId);
    if (!proposal) {
      return res.status(404).json({ success: false, error: 'Proposal not found' });
    }

    const access = await canActorAccessProposalMessages(req.user, proposal);
    if (!access.isAllowed) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const actorPublicUserId = await resolvePublicUserIdForActor(req.user);
    const actorRole = resolveActorMessagingRole(access, req.user);
    if (!actorPublicUserId) {
      return res.status(403).json({ success: false, error: 'User profile not found for messaging' });
    }

    const storedMessage = buildStoredMessageText(messageText, {}, { edited: false });
    if (!storedMessage) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    const { data, error } = await supabase
      .from('proposal_messages')
      .insert([
        {
          proposal_id: proposalId,
          sender_id: actorPublicUserId,
          message: storedMessage,
          created_at: new Date().toISOString(),
        },
      ])
      .select('*')
      .maybeSingle();

    if (error) {
      return res.status(500).json({ success: false, error: error.message || 'Failed to send message' });
    }

    return res.status(201).json({
      success: true,
      message: normalizeMessageRow(data || {}, actorPublicUserId, actorRole),
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Failed to send message' });
  }
});

// PATCH /api/quotation/:proposalId/messages/:messageId
router.patch('/:proposalId/messages/:messageId', requireAuth(), async (req, res) => {
  try {
    const proposalId = String(req.params?.proposalId || '').trim();
    const messageId = String(req.params?.messageId || '').trim();

    if (!proposalId || !messageId) {
      return res.status(400).json({ success: false, error: 'Invalid proposal or message id' });
    }

    const messageText = sanitizeMessageText(req.body?.message);
    if (!messageText) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }
    if (messageText.length > 4000) {
      return res.status(400).json({ success: false, error: 'Message is too long' });
    }

    const proposal = await resolveProposalForMessaging(proposalId);
    if (!proposal) {
      return res.status(404).json({ success: false, error: 'Proposal not found' });
    }

    const access = await canActorAccessProposalMessages(req.user, proposal);
    if (!access.isAllowed) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const actorPublicUserId = await resolvePublicUserIdForActor(req.user);
    const actorRole = resolveActorMessagingRole(access, req.user);
    if (!actorPublicUserId) {
      return res.status(403).json({ success: false, error: 'User profile not found for messaging' });
    }

    const { data: existingRow, error: existingError } = await supabase
      .from('proposal_messages')
      .select('*')
      .eq('id', messageId)
      .eq('proposal_id', proposalId)
      .eq('sender_id', actorPublicUserId)
      .maybeSingle();

    if (existingError) {
      return res.status(500).json({ success: false, error: existingError.message || 'Failed to load message' });
    }
    if (!existingRow) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    const existingParsed = parseStoredMessage(existingRow?.message);
    const storedMessage = buildStoredMessageText(messageText, existingParsed.meta, { edited: true });
    if (!storedMessage) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    const { data, error } = await supabase
      .from('proposal_messages')
      .update({ message: storedMessage })
      .eq('id', existingRow.id)
      .select('*')
      .maybeSingle();

    if (error) {
      return res.status(500).json({ success: false, error: error.message || 'Failed to edit message' });
    }
    if (!data) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    return res.json({
      success: true,
      message: normalizeMessageRow(data, actorPublicUserId, actorRole),
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Failed to edit message' });
  }
});

// DELETE /api/quotation/:proposalId/messages
router.delete('/:proposalId/messages', requireAuth(), async (req, res) => {
  try {
    const proposalId = String(req.params?.proposalId || '').trim();
    if (!proposalId) {
      return res.status(400).json({ success: false, error: 'Invalid proposal id' });
    }

    const proposal = await resolveProposalForMessaging(proposalId);
    if (!proposal) {
      return res.status(404).json({ success: false, error: 'Proposal not found' });
    }

    const access = await canActorAccessProposalMessages(req.user, proposal);
    if (!access.isAllowed) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const { data, error } = await supabase
      .from('proposal_messages')
      .delete()
      .eq('proposal_id', proposalId)
      .select('id');

    if (error) {
      return res.status(500).json({ success: false, error: error.message || 'Failed to delete chat' });
    }

    return res.json({
      success: true,
      deletedCount: Array.isArray(data) ? data.length : 0,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Failed to delete chat' });
  }
});

// DELETE /api/quotation/:proposalId/messages/:messageId
router.delete('/:proposalId/messages/:messageId', requireAuth(), async (req, res) => {
  try {
    const proposalId = String(req.params?.proposalId || '').trim();
    const messageId = String(req.params?.messageId || '').trim();

    if (!proposalId || !messageId) {
      return res.status(400).json({ success: false, error: 'Invalid proposal or message id' });
    }

    const proposal = await resolveProposalForMessaging(proposalId);
    if (!proposal) {
      return res.status(404).json({ success: false, error: 'Proposal not found' });
    }

    const access = await canActorAccessProposalMessages(req.user, proposal);
    if (!access.isAllowed) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const actorPublicUserId = await resolvePublicUserIdForActor(req.user);
    if (!actorPublicUserId) {
      return res.status(403).json({ success: false, error: 'User profile not found for messaging' });
    }

    const { data, error } = await supabase
      .from('proposal_messages')
      .delete()
      .eq('id', messageId)
      .eq('proposal_id', proposalId)
      .eq('sender_id', actorPublicUserId)
      .select('id');

    if (error) {
      return res.status(500).json({ success: false, error: error.message || 'Failed to delete message' });
    }
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    return res.json({ success: true, deletedMessageId: messageId });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Failed to delete message' });
  }
});

async function sendQuotationEmail(to, data, isRegistered) {
  const vendor = data.vendor || {};
  const quotation = data.quotation || {};

  // Optional PDF attachment
  let attachments = [];
  try {
    const name = quotation.attachment_name;
    const b64 = quotation.attachment_base64;
    const mime = quotation.attachment_mime;
    if (b64) {
      const safeMime = (mime || 'application/pdf').toLowerCase();
      if (safeMime !== 'application/pdf') {
        throw new Error('Only PDF attachments are supported');
      }
      const buf = Buffer.from(String(b64), 'base64');
      const maxBytes = 2 * 1024 * 1024; // 2MB (matches UI)
      if (buf.length > maxBytes) {
        throw new Error('PDF too large (max 2MB)');
      }
      attachments = [
        {
          filename: name || 'quotation.pdf',
          content: buf,
          contentType: 'application/pdf',
        },
      ];
    }
  } catch (e) {
    // Attachment errors should not break the full flow; send without attachment.
    console.warn('Attachment skipped:', e?.message || e);
    attachments = [];
  }

  const subject = `Quotation from ${vendor.company_name || vendor.owner_name || 'Vendor'}`;

  const text = `
Quotation Details
-----------------
Title: ${quotation.title || ''}
Amount: ${quotation.quotation_amount || ''}
Quantity: ${quotation.quantity || ''} ${quotation.unit || ''}
Validity Days: ${quotation.validity_days || ''}
Delivery Days: ${quotation.delivery_days || ''}
Terms: ${quotation.terms_conditions || ''}

Vendor
------
Name: ${vendor.owner_name || ''}
Company: ${vendor.company_name || ''}
Phone: ${vendor.phone || ''}
Email: ${vendor.email || ''}

${isRegistered ? 'You can also view this quotation in your dashboard.' : 'Register on IndianTradeMart to view quotations in your dashboard.'}
`;

  const html = `
  <div style="font-family: Arial, sans-serif; line-height: 1.6;">
    <h2 style="margin:0 0 10px 0;">Quotation from ${vendor.company_name || vendor.owner_name || 'Vendor'}</h2>

    <h3 style="margin:20px 0 8px 0;">Quotation Details</h3>
    <ul>
      <li><b>Title:</b> ${quotation.title || ''}</li>
      <li><b>Amount:</b> ${quotation.quotation_amount || ''}</li>
      <li><b>Quantity:</b> ${quotation.quantity || ''} ${quotation.unit || ''}</li>
      <li><b>Validity Days:</b> ${quotation.validity_days || ''}</li>
      <li><b>Delivery Days:</b> ${quotation.delivery_days || ''}</li>
    </ul>

    <h3 style="margin:20px 0 8px 0;">Terms & Conditions</h3>
    <p>${(quotation.terms_conditions || '').replace(/\n/g, '<br/>')}</p>

    <h3 style="margin:20px 0 8px 0;">Vendor</h3>
    <ul>
      <li><b>Name:</b> ${vendor.owner_name || ''}</li>
      <li><b>Company:</b> ${vendor.company_name || ''}</li>
      <li><b>Phone:</b> ${vendor.phone || ''}</li>
      <li><b>Email:</b> ${vendor.email || ''}</li>
    </ul>

    <p style="margin-top: 18px;">
      ${isRegistered ? 'You can also view this quotation in your dashboard.' : 'Register on IndianTradeMart to view quotations in your dashboard.'}
    </p>
  </div>
  `;

  const from =
    process.env.MAIL_FROM ||
    process.env.SMTP_USER ||
    process.env.GMAIL_EMAIL ||
    'no-reply@indiantrademart.com';

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
    ...(attachments.length ? { attachments } : {}),
  });
}

// POST /api/quotation/send
router.post('/send', validateQuotationRequest, async (req, res) => {
  try {
    const {
      quotation_title,
      quotation_amount,
      quantity,
      unit, // ✅ still accepted (email me use hoga)
      validity_days,
      delivery_days,
      terms_conditions,
      buyer_email,
      vendor_id,
      vendor_name,
      vendor_company,
      vendor_phone,
      vendor_email,

      // ✅ Optional PDF attachment (base64)
      attachment_name,
      attachment_base64,
      attachment_mime,

      // ⚠️ Ignore buyer_id from request (UI was sending lead.id sometimes)
      buyer_id,
    } = req.body || {};

    if (!buyer_email || !vendor_id || !quotation_title) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const buyerEmail = String(buyer_email).toLowerCase().trim();

    // ✅ Make quantity store-friendly (merge unit into quantity; proposals table has no `unit`)
    let qtyValue = quantity ?? null;
    if (qtyValue !== null && qtyValue !== undefined) {
      const qStr = String(qtyValue).trim();
      const uStr = String(unit || '').trim();
      if (uStr && qStr && !qStr.toLowerCase().includes(uStr.toLowerCase())) {
        qtyValue = `${qStr} ${uStr}`; // e.g. "10 kg"
      } else {
        qtyValue = qStr || null;
      }
    }

    // Check if buyer exists (handle duplicate legacy rows safely).
    const { data: buyerRows, error: buyerErr } = await supabase
      .from('buyers')
      .select('id, user_id, full_name, email, created_at')
      .eq('email', buyerEmail)
      .order('created_at', { ascending: false })
      .limit(5);

    if (buyerErr) console.warn('Buyer lookup warning:', buyerErr);

    const buyerMatches = Array.isArray(buyerRows) ? buyerRows : [];
    const buyerCheck = buyerMatches.find((row) => row?.user_id) || buyerMatches[0] || null;

    let buyerUserId = buyerCheck?.user_id || null;
    if (!buyerUserId) {
      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .select('id')
        .eq('email', buyerEmail)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const userErrMessage = String(userErr?.message || '').toLowerCase();
      if (userErr && !userErrMessage.includes('multiple')) {
        console.warn('Public user lookup warning:', userErr);
      }
      buyerUserId = userRow?.id || null;
    }

    const isRegistered = Boolean(buyerCheck?.id || buyerUserId);

    // Buyer candidates depending on FK configuration
    const buyerCandidateSet = new Set();
    if (buyerCheck?.id) buyerCandidateSet.add(buyerCheck.id);
    if (buyerCheck?.user_id && buyerCheck.user_id !== buyerCheck.id) buyerCandidateSet.add(buyerCheck.user_id);
    if (buyerUserId && buyerUserId !== buyerCheck?.id) buyerCandidateSet.add(buyerUserId);

    // Optional legacy: if buyer_id provided and exists in buyers, accept it as candidate
    if (buyer_id) {
      const { data: buyerById } = await supabase.from('buyers').select('id').eq('id', buyer_id).maybeSingle();
      if (buyerById?.id) buyerCandidateSet.add(buyerById.id);
    }
    const buyerCandidates = Array.from(buyerCandidateSet);

    const baseQuotationPayload = {
      vendor_id,
      buyer_id: null,
      buyer_email: buyerEmail,
      title: quotation_title,
      product_name: quotation_title,
      quantity: qtyValue, // ✅ contains unit inside
      // ✅ REMOVED: unit (column doesn't exist in proposals)
      budget: quotation_amount ? parseFloat(quotation_amount) : null,
      description: terms_conditions || '',
      status: 'SENT',
    };

    const tryInsert = async (buyerIdValue) => {
      const payload = { ...baseQuotationPayload, buyer_id: buyerIdValue ?? null };
      return supabase.from('proposals').insert([payload]).select('id, vendor_id, buyer_id, title').single();
    };

    let savedQuotation = null;
    let lastError = null;

    for (const candidate of buyerCandidates) {
      const { data, error } = await tryInsert(candidate);
      if (!error && data) {
        savedQuotation = data;
        break;
      }
      lastError = error;
      const msg = (error?.message || '').toLowerCase();
      const code = error?.code;
      const retryable = msg.includes('foreign key') || code === '23503' || code === '22P02';
      if (!retryable) break;
    }

    if (!savedQuotation) {
      const { data, error } = await tryInsert(null);
      if (!error && data) savedQuotation = data;
      else lastError = error;
    }

    if (!savedQuotation) {
      console.error('Database INSERT error:', lastError);
      return res.status(500).json({
        error: lastError?.message || 'Failed to save quotation',
        details: lastError,
      });
    }

    // Email vendor data
    const vendorData = {
      owner_name: vendor_name,
      company_name: vendor_company,
      phone: vendor_phone,
      email: vendor_email,
    };

    // Send email (non-blocking for DB)
    try {
      await sendQuotationEmail(
        buyerEmail,
        {
          vendor: vendorData,
          quotation: {
            title: quotation_title,
            quotation_amount,
            quantity, // email me quantity original
            unit,     // ✅ email me unit show hoga
            validity_days,
            delivery_days,
            terms_conditions,

            // ✅ attachment
            attachment_name,
            attachment_base64,
            attachment_mime,
          },
        },
        isRegistered
      );

      await supabase.from('quotation_emails').insert([
        {
          quotation_id: savedQuotation.id,
          recipient_email: buyerEmail,
          subject: `Quotation from ${vendor_company || vendor_name}`,
          status: 'SENT',
        },
      ]);
    } catch (emailError) {
      console.error('Email sending error (non-blocking):', emailError);
      try {
        await supabase.from('quotation_emails').insert([
          {
            quotation_id: savedQuotation.id,
            recipient_email: buyerEmail,
            subject: `Quotation from ${vendor_company || vendor_name}`,
            status: 'FAILED',
            error_message: emailError?.message || 'Email failed',
          },
        ]);
      } catch (_) {}
    }

    // Create notification if registered buyer.
    if (isRegistered) {
      try {
        if (buyerCheck?.id) {
          await supabase.from('buyer_notifications').insert([
            {
              buyer_id: buyerCheck.id,
              type: 'QUOTATION_RECEIVED',
              title: `New Quotation from ${vendor_company || vendor_name}`,
              message: `Received quotation: ${quotation_title}`,
              reference_id: savedQuotation.id,
              reference_type: 'quotation',
              is_read: false,
              created_at: new Date().toISOString(),
            },
          ]);
        }

        if (buyerUserId) {
          await insertNotification({
            user_id: buyerUserId,
            type: 'QUOTATION_RECEIVED',
            title: `New Quotation from ${vendor_company || vendor_name}`,
            message: `You received quotation: ${quotation_title}`,
            link: `/buyer/proposals/${savedQuotation.id}`,
            reference_id: savedQuotation.id,
            is_read: false,
            created_at: new Date().toISOString(),
          });
        }
      } catch (notifError) {
        console.warn('Notification creation failed:', notifError);
      }
    } else {
      // Track unregistered buyer
      try {
        await supabase.from('quotation_unregistered').insert([
          {
            email: buyerEmail,
            quotation_id: savedQuotation.id,
            vendor_id,
            created_at: new Date().toISOString(),
          },
        ]);
      } catch (trackError) {
        console.warn('Unregistered tracking failed:', trackError);
      }
    }

    // Also notify vendor bell so sent quotations reflect in dashboard activity.
    try {
      const { data: vendorRow } = await supabase
        .from('vendors')
        .select('user_id, email')
        .eq('id', vendor_id)
        .maybeSingle();

      let vendorUserId = vendorRow?.user_id || null;
      if (!vendorUserId) {
        const vendorEmail = String(vendor_email || vendorRow?.email || '').toLowerCase().trim();
        if (vendorEmail) {
          const { data: vendorUserRow } = await supabase
            .from('users')
            .select('id')
            .eq('email', vendorEmail)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          vendorUserId = vendorUserRow?.id || null;
        }
      }

      if (vendorUserId) {
        await insertNotification({
          user_id: vendorUserId,
          type: 'QUOTATION_SENT',
          title: 'Quotation sent',
          message: `Quotation sent to ${buyerEmail}`,
          link: '/vendor/proposals?tab=sent',
          reference_id: savedQuotation.id,
          is_read: false,
          created_at: new Date().toISOString(),
        });
      }
    } catch (vendorNotifError) {
      console.warn('Vendor quotation notification failed:', vendorNotifError);
    }

    return res.status(200).json({
      success: true,
      message: `Quotation sent successfully to ${buyerEmail}${
        isRegistered ? ' and added to their dashboard' : ' - they will see it after registering'
      }`,
      quotation_id: savedQuotation.id,
      buyer_registered: isRegistered,
    });
  } catch (e) {
    console.error('Quotation route error:', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
});

export default router;
