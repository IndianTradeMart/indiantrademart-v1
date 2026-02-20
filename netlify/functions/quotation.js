import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'itm_access';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // eslint-disable-next-line no-console
  console.error('[quotation function] Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

let cachedTransporter = null;
const getTransporter = () => {
  if (cachedTransporter) return cachedTransporter;

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    cachedTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    return cachedTransporter;
  }

  if (process.env.GMAIL_EMAIL && process.env.GMAIL_APP_PASSWORD) {
    cachedTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_EMAIL,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
    return cachedTransporter;
  }

  throw new Error(
    'Email transporter config missing. Set SMTP_HOST/SMTP_USER/SMTP_PASS (recommended) or GMAIL_EMAIL/GMAIL_APP_PASSWORD for local.'
  );
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeRole = (value) => String(value || '').trim().toUpperCase();

const parseCookies = (cookieHeader = '') => {
  const out = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return out;
  cookieHeader.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const key = decodeURIComponent(part.slice(0, idx).trim());
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    if (key) out[key] = value;
  });
  return out;
};

const getCookie = (event, name) => {
  const header = event?.headers?.cookie || event?.headers?.Cookie || '';
  const cookies = parseCookies(header);
  return cookies[name];
};

const parseBearerToken = (headers = {}) => {
  const header = headers.Authorization || headers.authorization;
  if (!header || typeof header !== 'string') return null;
  if (!header.startsWith('Bearer ')) return null;
  return header.replace('Bearer ', '').trim();
};

let warnedMissingJwtSecret = false;
const getJwtSecret = () => {
  const secret =
    process.env.JWT_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error('Missing JWT_SECRET (or fallback secret) in environment');
  }

  if (!process.env.JWT_SECRET && !warnedMissingJwtSecret) {
    // eslint-disable-next-line no-console
    console.warn(
      '[Quotation] JWT_SECRET missing. Falling back to another secret. Configure a dedicated JWT_SECRET.'
    );
    warnedMissingJwtSecret = true;
  }

  return secret;
};

const verifyAuthToken = (token) => {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
};

const getOrigin = (event) =>
  event?.headers?.origin ||
  event?.headers?.Origin ||
  '*';

const baseHeaders = (event) => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': getOrigin(event),
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
  Vary: 'Origin',
});

const json = (event, statusCode, body) => ({
  statusCode,
  headers: baseHeaders(event),
  body: JSON.stringify(body),
});

const ok = (event, body) => json(event, 200, body);
const bad = (event, msg, details, statusCode = 400) =>
  json(event, statusCode, { success: false, error: msg, details: details || null });
const unauthorized = (event, msg) => bad(event, msg || 'Unauthorized', null, 401);
const forbidden = (event, msg) => bad(event, msg || 'Forbidden', null, 403);
const fail = (event, msg, details) => json(event, 500, { success: false, error: msg, details });
const methodNotAllowed = (event) => json(event, 405, { error: 'Method not allowed' });

const readBody = (event) => {
  if (!event?.body) return {};
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const parseTail = (eventPath) => {
  const parts = String(eventPath || '').split('/').filter(Boolean);
  const fnIndex = parts.indexOf('quotation');
  if (fnIndex >= 0) return parts.slice(fnIndex + 1);
  return parts;
};

const resolveAuthenticatedUser = async (event) => {
  const bearer = parseBearerToken(event?.headers || {});
  if (bearer) {
    const { data: authData, error } = await supabase.auth.getUser(bearer);
    if (error || !authData?.user) return null;
    return {
      id: authData.user.id,
      email: normalizeEmail(authData.user?.email || ''),
      role: normalizeRole(
        authData.user?.app_metadata?.role ||
          authData.user?.user_metadata?.role ||
          authData.user?.role ||
          ''
      ),
    };
  }

  const cookieToken = getCookie(event, AUTH_COOKIE_NAME);
  if (!cookieToken) return null;
  const decoded = verifyAuthToken(cookieToken);
  if (!decoded?.sub) return null;
  return {
    id: decoded.sub,
    email: normalizeEmail(decoded?.email || ''),
    role: normalizeRole(decoded?.role || ''),
  };
};

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

const sanitizeMessageText = (value) =>
  String(value || '')
    .replace(/\r\n/g, '\n')
    .trim();

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

  const role = normalizeRole(user?.role || '');
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

const applyMessageAcks = async (rows = [], actorRole = 'buyer', actorPublicUserId = null, options = {}) => {
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
};

const listVendorCandidatesForUser = async ({ userId = '', email = '' } = {}) => {
  const byId = new Map();

  if (userId) {
    const { data: byUserRows } = await supabase
      .from('vendors')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(10);
    (byUserRows || []).forEach((row) => {
      const key = String(row?.id || '').trim();
      if (!key) return;
      byId.set(key, row);
    });
  }

  if (email) {
    const { data: byEmailRows } = await supabase
      .from('vendors')
      .select('*')
      .ilike('email', email)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(25);
    (byEmailRows || []).forEach((row) => {
      const key = String(row?.id || '').trim();
      if (!key) return;
      if (!byId.has(key)) byId.set(key, row);
    });
  }

  return Array.from(byId.values());
};

const loadVendorActivityScoreMap = async (vendorIds = []) => {
  const ids = Array.from(new Set((vendorIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  const scoreMap = new Map(ids.map((id) => [id, { proposals: 0, leads: 0, purchases: 0, products: 0 }]));
  if (!ids.length) return scoreMap;

  const [proposalRes, leadRes, purchaseRes, productRes] = await Promise.allSettled([
    supabase.from('proposals').select('vendor_id').in('vendor_id', ids),
    supabase.from('leads').select('vendor_id').in('vendor_id', ids),
    supabase.from('lead_purchases').select('vendor_id').in('vendor_id', ids),
    supabase.from('products').select('vendor_id').in('vendor_id', ids),
  ]);

  const addRows = (result, key) => {
    if (result?.status !== 'fulfilled') return;
    const rows = result?.value?.data;
    if (!Array.isArray(rows)) return;
    rows.forEach((row) => {
      const vendorId = String(row?.vendor_id || '').trim();
      if (!vendorId || !scoreMap.has(vendorId)) return;
      const current = scoreMap.get(vendorId);
      current[key] = (current[key] || 0) + 1;
      scoreMap.set(vendorId, current);
    });
  };

  addRows(proposalRes, 'proposals');
  addRows(leadRes, 'leads');
  addRows(purchaseRes, 'purchases');
  addRows(productRes, 'products');

  return scoreMap;
};

const scoreVendorCandidate = (candidate = {}, userId = '', activityMap = new Map()) => {
  const vendorId = String(candidate?.id || '').trim();
  if (!vendorId) return Number.NEGATIVE_INFINITY;
  const activity = activityMap.get(vendorId) || {};

  let score = 0;
  if (userId && String(candidate?.user_id || '').trim() === userId) score += 10000;
  score += Number(activity?.proposals || 0) * 70;
  score += Number(activity?.leads || 0) * 45;
  score += Number(activity?.purchases || 0) * 30;
  score += Number(activity?.products || 0) * 10;

  const updatedTs = new Date(candidate?.updated_at || candidate?.created_at || 0).getTime();
  if (Number.isFinite(updatedTs)) score += Math.floor(updatedTs / 100000000);
  return score;
};

const resolveVendorForUser = async (user = {}) => {
  const userId = String(user?.id || '').trim();
  const email = normalizeEmail(user?.email || '');

  const candidates = await listVendorCandidatesForUser({ userId, email });
  if (!candidates.length) return null;

  let selected = candidates[0];
  if (candidates.length > 1) {
    const activityMap = await loadVendorActivityScoreMap(candidates.map((row) => row?.id));
    selected = [...candidates].sort((a, b) => {
      const scoreDelta =
        scoreVendorCandidate(b, userId, activityMap) - scoreVendorCandidate(a, userId, activityMap);
      if (scoreDelta !== 0) return scoreDelta;

      const aTs = new Date(a?.updated_at || a?.created_at || 0).getTime();
      const bTs = new Date(b?.updated_at || b?.created_at || 0).getTime();
      return bTs - aTs;
    })[0];
  }

  if (selected && userId && String(selected?.user_id || '').trim() !== userId) {
    try {
      await supabase
        .from('vendors')
        .update({ user_id: userId })
        .eq('id', selected.id);
      selected.user_id = userId;
    } catch {
      // ignore relink failures
    }
  }

  return selected || null;
};

const resolveBuyerForUser = async (user = {}) => {
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
};

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

const resolvePublicUserIdForActor = async (user = {}) => {
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
};

const resolveProposalForMessaging = async (proposalId) => {
  if (!proposalId) return null;

  const { data, error } = await supabase
    .from('proposals')
    .select('id, vendor_id, buyer_id, buyer_email, title, product_name')
    .eq('id', proposalId)
    .maybeSingle();

  if (error) throw new Error(error.message || 'Failed to load proposal');
  return data || null;
};

const resolveProposalParticipantUserIds = async (proposal = {}) => {
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
};

const canActorAccessProposalMessages = async (user = {}, proposal = {}) => {
  const [buyer, vendor] = await Promise.all([resolveBuyerForUser(user), resolveVendorForUser(user)]);

  const actorEmail = normalizeEmail(user?.email || '');
  const buyerEmail = normalizeEmail(proposal?.buyer_email || '');
  const proposalBuyerId = String(proposal?.buyer_id || '').trim();
  const proposalVendorId = String(proposal?.vendor_id || '').trim();

  const isVendorParticipant = Boolean(vendor?.id && String(vendor.id).trim() === proposalVendorId);

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
};

const sendQuotationEmail = async (buyerEmail, quotationData, isRegistered) => {
  const transporter = getTransporter();
  const { vendor, quotation } = quotationData;

  let attachments = [];
  try {
    const name = quotation?.attachment_name;
    const b64 = quotation?.attachment_base64;
    const mime = quotation?.attachment_mime;
    if (b64) {
      const safeMime = (mime || 'application/pdf').toLowerCase();
      if (safeMime !== 'application/pdf') throw new Error('Only PDF attachments are supported');
      const buf = Buffer.from(String(b64), 'base64');
      const maxBytes = 2 * 1024 * 1024;
      if (buf.length > maxBytes) throw new Error('PDF too large (max 2MB)');
      attachments = [
        {
          filename: name || 'quotation.pdf',
          content: buf,
          contentType: 'application/pdf',
        },
      ];
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Attachment skipped:', e?.message || e);
    attachments = [];
  }

  const frontendUrl = process.env.VITE_FRONTEND_URL || 'https://indiantrademart.netlify.app';
  const registrationText = isRegistered
    ? `View quotation in your dashboard: ${frontendUrl}/buyer/quotations`
    : `Register to view quotation in dashboard: ${frontendUrl}/buyer/register?email=${encodeURIComponent(
        buyerEmail
      )}`;

  const mailOptions = {
    from: `${process.env.APP_NAME || 'IndianTradeMart'} <${process.env.GMAIL_EMAIL || process.env.SMTP_USER}>`,
    to: buyerEmail,
    subject: `Quotation from ${vendor.company_name || vendor.owner_name || 'Vendor'}`,
    ...(attachments.length ? { attachments } : {}),
    text: [
      `Hello ${buyerEmail.split('@')[0] || 'Buyer'},`,
      '',
      `Vendor: ${vendor.owner_name || 'N/A'} (${vendor.company_name || 'N/A'})`,
      `Phone: ${vendor.phone || 'N/A'}`,
      `Email: ${vendor.email || 'N/A'}`,
      '',
      `Title: ${quotation.title || ''}`,
      `Amount: ${quotation.quotation_amount || ''}`,
      `Quantity: ${quotation.quantity || ''}`,
      `Validity Days: ${quotation.validity_days || ''}`,
      `Delivery Days: ${quotation.delivery_days || ''}`,
      `Terms: ${quotation.terms_conditions || ''}`,
      '',
      registrationText,
    ].join('\n'),
  };

  const info = await transporter.sendMail(mailOptions);
  // eslint-disable-next-line no-console
  console.log('Quotation email sent:', info.messageId, 'to:', buyerEmail);
  return true;
};

const handleGetSent = async (event, user) => {
  const vendor = await resolveVendorForUser(user);
  if (!vendor?.id) {
    return forbidden(event, 'Vendor access required');
  }

  let query = supabase
    .from('proposals')
    .select('*')
    .eq('vendor_id', vendor.id)
    .eq('status', 'SENT')
    .not('buyer_email', 'is', null)
    .neq('buyer_email', '')
    .order('created_at', { ascending: false });

  const requestedLimit = Number(event?.queryStringParameters?.limit || 0);
  if (Number.isFinite(requestedLimit) && requestedLimit > 0) {
    query = query.limit(Math.min(requestedLimit, 200));
  }

  const { data, error } = await query;
  if (error) return fail(event, error.message || 'Failed to fetch sent quotations');

  const enriched = await enrichBuyers(data || []);
  return ok(event, { success: true, quotations: enriched, total: enriched.length });
};

const handleGetReceived = async (event, user) => {
  const buyer = await resolveBuyerForUser(user);
  if (!buyer?.id && !normalizeEmail(user?.email || '')) {
    return forbidden(event, 'Buyer access required');
  }

  const buyerId = String(buyer?.id || '').trim();
  const buyerEmail = normalizeEmail(buyer?.email || user?.email || '');

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
  return ok(event, { success: true, quotations: enriched, total: enriched.length });
};

const handleGetReceivedDetail = async (event, user, quotationId) => {
  const normalizedId = String(quotationId || '').trim();
  if (!normalizedId) return bad(event, 'Invalid quotation id');

  const buyer = await resolveBuyerForUser(user);
  const buyerId = String(buyer?.id || '').trim();
  const buyerEmail = normalizeEmail(buyer?.email || user?.email || '');

  if (!buyerId && !buyerEmail) {
    return forbidden(event, 'Buyer access required');
  }

  const { data: quotation, error } = await supabase
    .from('proposals')
    .select('*')
    .eq('id', normalizedId)
    .maybeSingle();

  if (error) return fail(event, error.message || 'Failed to fetch quotation detail');
  if (!quotation) return bad(event, 'Quotation not found', null, 404);

  const ownerMatch =
    (buyerId && String(quotation?.buyer_id || '').trim() === buyerId) ||
    (buyerEmail && normalizeEmail(quotation?.buyer_email || '') === buyerEmail);

  if (!ownerMatch) return bad(event, 'Quotation not found', null, 404);

  const [enrichedQuotation] = await enrichVendors([quotation]);

  const { data: messages, error: msgError } = await supabase
    .from('proposal_messages')
    .select('*')
    .eq('proposal_id', normalizedId)
    .order('created_at', { ascending: true });

  if (msgError) return fail(event, msgError.message || 'Failed to fetch quotation messages');

  const actorPublicUserId = await resolvePublicUserIdForActor(user);
  const actorRole = 'buyer';

  return ok(event, {
    success: true,
    quotation: {
      ...(enrichedQuotation || quotation),
      messages: (messages || []).map((row) => normalizeMessageRow(row, actorPublicUserId, actorRole)),
    },
  });
};

const handleAckDelivered = async (event, user) => {
  const body = readBody(event);
  const requestedIds = Array.isArray(body?.proposal_ids)
    ? body.proposal_ids
    : Array.isArray(body?.proposalIds)
      ? body.proposalIds
      : [];

  const proposalIds = Array.from(
    new Set(
      requestedIds
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  ).slice(0, 200);

  if (!proposalIds.length) {
    return ok(event, { success: true, updated: 0 });
  }

  const actorPublicUserId = await resolvePublicUserIdForActor(user);
  if (!actorPublicUserId) {
    return forbidden(event, 'User profile not found for messaging');
  }

  let updated = 0;

  for (const proposalId of proposalIds) {
    const proposal = await resolveProposalForMessaging(proposalId);
    if (!proposal) continue;

    const access = await canActorAccessProposalMessages(user, proposal);
    if (!access.isAllowed) continue;

    const actorRole = resolveActorMessagingRole(access, user);
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

  return ok(event, { success: true, updated });
};

const handleGetProposalMessages = async (event, user, proposalId) => {
  const normalizedProposalId = String(proposalId || '').trim();
  if (!normalizedProposalId) {
    return bad(event, 'Invalid proposal id');
  }

  const proposal = await resolveProposalForMessaging(normalizedProposalId);
  if (!proposal) {
    return bad(event, 'Proposal not found', null, 404);
  }

  const access = await canActorAccessProposalMessages(user, proposal);
  if (!access.isAllowed) {
    return forbidden(event, 'Forbidden');
  }

  const actorPublicUserId = await resolvePublicUserIdForActor(user);
  const actorRole = resolveActorMessagingRole(access, user);

  const { data, error } = await supabase
    .from('proposal_messages')
    .select('*')
    .eq('proposal_id', normalizedProposalId)
    .order('created_at', { ascending: true });

  if (error) {
    return fail(event, error.message || 'Failed to load messages');
  }

  const ackedRows = await applyMessageAcks(data || [], actorRole, actorPublicUserId, {
    markDelivered: true,
    markRead: true,
  });
  const participants = await resolveProposalParticipantUserIds(proposal);

  const normalizedMessages = (ackedRows || []).map((row) =>
    normalizeMessageRow(row, actorPublicUserId, actorRole)
  );

  return ok(event, {
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
};

const handlePostProposalMessage = async (event, user, proposalId) => {
  const normalizedProposalId = String(proposalId || '').trim();
  if (!normalizedProposalId) {
    return bad(event, 'Invalid proposal id');
  }

  const messageText = sanitizeMessageText(readBody(event)?.message);
  if (!messageText) return bad(event, 'Message is required');
  if (messageText.length > 4000) return bad(event, 'Message is too long');

  const proposal = await resolveProposalForMessaging(normalizedProposalId);
  if (!proposal) {
    return bad(event, 'Proposal not found', null, 404);
  }

  const access = await canActorAccessProposalMessages(user, proposal);
  if (!access.isAllowed) {
    return forbidden(event, 'Forbidden');
  }

  const actorPublicUserId = await resolvePublicUserIdForActor(user);
  const actorRole = resolveActorMessagingRole(access, user);
  if (!actorPublicUserId) {
    return forbidden(event, 'User profile not found for messaging');
  }

  const storedMessage = buildStoredMessageText(messageText, {}, { edited: false });
  if (!storedMessage) return bad(event, 'Message is required');

  const { data, error } = await supabase
    .from('proposal_messages')
    .insert([
      {
        proposal_id: normalizedProposalId,
        sender_id: actorPublicUserId,
        message: storedMessage,
        created_at: new Date().toISOString(),
      },
    ])
    .select('*')
    .maybeSingle();

  if (error) {
    return fail(event, error.message || 'Failed to send message');
  }

  return json(event, 201, {
    success: true,
    message: normalizeMessageRow(data || {}, actorPublicUserId, actorRole),
  });
};

const handlePatchProposalMessage = async (event, user, proposalId, messageId) => {
  const normalizedProposalId = String(proposalId || '').trim();
  const normalizedMessageId = String(messageId || '').trim();
  if (!normalizedProposalId || !normalizedMessageId) {
    return bad(event, 'Invalid proposal or message id');
  }

  const messageText = sanitizeMessageText(readBody(event)?.message);
  if (!messageText) return bad(event, 'Message is required');
  if (messageText.length > 4000) return bad(event, 'Message is too long');

  const proposal = await resolveProposalForMessaging(normalizedProposalId);
  if (!proposal) {
    return bad(event, 'Proposal not found', null, 404);
  }

  const access = await canActorAccessProposalMessages(user, proposal);
  if (!access.isAllowed) {
    return forbidden(event, 'Forbidden');
  }

  const actorPublicUserId = await resolvePublicUserIdForActor(user);
  const actorRole = resolveActorMessagingRole(access, user);
  if (!actorPublicUserId) {
    return forbidden(event, 'User profile not found for messaging');
  }

  const { data: existingRow, error: existingError } = await supabase
    .from('proposal_messages')
    .select('*')
    .eq('id', normalizedMessageId)
    .eq('proposal_id', normalizedProposalId)
    .eq('sender_id', actorPublicUserId)
    .maybeSingle();

  if (existingError) {
    return fail(event, existingError.message || 'Failed to load message');
  }
  if (!existingRow) {
    return bad(event, 'Message not found', null, 404);
  }

  const existingParsed = parseStoredMessage(existingRow?.message);
  const storedMessage = buildStoredMessageText(messageText, existingParsed.meta, { edited: true });
  if (!storedMessage) return bad(event, 'Message is required');

  const { data, error } = await supabase
    .from('proposal_messages')
    .update({ message: storedMessage })
    .eq('id', existingRow.id)
    .select('*')
    .maybeSingle();

  if (error) {
    return fail(event, error.message || 'Failed to edit message');
  }
  if (!data) {
    return bad(event, 'Message not found', null, 404);
  }

  return ok(event, {
    success: true,
    message: normalizeMessageRow(data, actorPublicUserId, actorRole),
  });
};

const handleDeleteProposalConversation = async (event, user, proposalId) => {
  const normalizedProposalId = String(proposalId || '').trim();
  if (!normalizedProposalId) {
    return bad(event, 'Invalid proposal id');
  }

  const proposal = await resolveProposalForMessaging(normalizedProposalId);
  if (!proposal) {
    return bad(event, 'Proposal not found', null, 404);
  }

  const access = await canActorAccessProposalMessages(user, proposal);
  if (!access.isAllowed) {
    return forbidden(event, 'Forbidden');
  }

  const { data, error } = await supabase
    .from('proposal_messages')
    .delete()
    .eq('proposal_id', normalizedProposalId)
    .select('id');

  if (error) {
    return fail(event, error.message || 'Failed to delete chat');
  }

  return ok(event, {
    success: true,
    deletedCount: Array.isArray(data) ? data.length : 0,
  });
};

const handleDeleteProposalMessage = async (event, user, proposalId, messageId) => {
  const normalizedProposalId = String(proposalId || '').trim();
  const normalizedMessageId = String(messageId || '').trim();
  if (!normalizedProposalId || !normalizedMessageId) {
    return bad(event, 'Invalid proposal or message id');
  }

  const proposal = await resolveProposalForMessaging(normalizedProposalId);
  if (!proposal) {
    return bad(event, 'Proposal not found', null, 404);
  }

  const access = await canActorAccessProposalMessages(user, proposal);
  if (!access.isAllowed) {
    return forbidden(event, 'Forbidden');
  }

  const actorPublicUserId = await resolvePublicUserIdForActor(user);
  if (!actorPublicUserId) {
    return forbidden(event, 'User profile not found for messaging');
  }

  const { data, error } = await supabase
    .from('proposal_messages')
    .delete()
    .eq('id', normalizedMessageId)
    .eq('proposal_id', normalizedProposalId)
    .eq('sender_id', actorPublicUserId)
    .select('id');

  if (error) {
    return fail(event, error.message || 'Failed to delete message');
  }
  if (!Array.isArray(data) || data.length === 0) {
    return bad(event, 'Message not found', null, 404);
  }

  return ok(event, { success: true, deletedMessageId: normalizedMessageId });
};

const handleSendQuotation = async (event) => {
  const body = readBody(event);
  const {
    quotation_title,
    quotation_amount,
    quantity,
    validity_days,
    delivery_days,
    terms_conditions,
    buyer_email,
    buyer_id,
    vendor_id,
    vendor_name,
    vendor_company,
    vendor_phone,
    vendor_email,
    attachment_name,
    attachment_base64,
    attachment_mime,
  } = body;

  if (!quotation_title || !quotation_amount || !buyer_email || !vendor_id) {
    return bad(
      event,
      'Missing required fields: quotation_title, quotation_amount, buyer_email, vendor_id'
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(buyer_email || ''))) {
    return bad(event, 'Invalid email format');
  }

  const targetBuyerEmail = normalizeEmail(buyer_email);
  const { data: buyerCheck } = await supabase
    .from('buyers')
    .select('id, full_name, email, is_registered')
    .eq('email', targetBuyerEmail)
    .maybeSingle();

  const isRegistered = !!buyerCheck;

  let safeBuyerId = buyerCheck?.id || null;
  if (!safeBuyerId && buyer_id) {
    const { data: buyerById } = await supabase
      .from('buyers')
      .select('id')
      .eq('id', buyer_id)
      .maybeSingle();
    safeBuyerId = buyerById?.id || null;
  }

  const quotationPayload = {
    vendor_id,
    buyer_id: safeBuyerId,
    buyer_email: targetBuyerEmail,
    title: quotation_title,
    product_name: quotation_title,
    quantity: quantity || null,
    budget: quotation_amount ? parseFloat(quotation_amount) : null,
    description: terms_conditions || '',
    status: 'SENT',
  };

  const { data: inserted, error: dbError } = await supabase
    .from('proposals')
    .insert([quotationPayload])
    .select('*')
    .maybeSingle();

  if (dbError) {
    return fail(event, dbError.message || 'Failed to save quotation', dbError);
  }

  let savedQuotation = inserted || null;
  if (!savedQuotation) {
    const { data: fetchedData } = await supabase
      .from('proposals')
      .select('*')
      .eq('vendor_id', quotationPayload.vendor_id)
      .eq('buyer_email', quotationPayload.buyer_email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    savedQuotation = fetchedData || null;
  }

  if (!savedQuotation?.id) {
    return fail(event, 'Failed to save quotation - no data returned');
  }

  let vendorRow = null;
  if (vendor_id) {
    const { data } = await supabase
      .from('vendors')
      .select('owner_name, company_name, phone, email')
      .eq('id', vendor_id)
      .maybeSingle();
    vendorRow = data || null;
  }

  const vendorData = {
    owner_name: vendor_name || vendorRow?.owner_name || null,
    company_name: vendor_company || vendorRow?.company_name || null,
    phone: vendor_phone || vendorRow?.phone || null,
    email: vendor_email || vendorRow?.email || null,
  };

  let emailSent = false;
  try {
    await sendQuotationEmail(
      targetBuyerEmail,
      {
        vendor: vendorData,
        quotation: {
          title: quotation_title,
          quotation_amount,
          quantity,
          validity_days,
          delivery_days,
          terms_conditions,
          attachment_name,
          attachment_base64,
          attachment_mime,
        },
      },
      isRegistered
    );
    emailSent = true;

    await supabase.from('quotation_emails').insert([
      {
        quotation_id: savedQuotation.id,
        recipient_email: targetBuyerEmail,
        subject: `Quotation from ${vendorData.company_name || vendorData.owner_name || 'Vendor'}`,
        status: 'SENT',
      },
    ]);
  } catch (emailError) {
    // eslint-disable-next-line no-console
    console.error('Email sending error (non-blocking):', emailError);
    try {
      await supabase.from('quotation_emails').insert([
        {
          quotation_id: savedQuotation.id,
          recipient_email: targetBuyerEmail,
          subject: `Quotation from ${vendorData.company_name || vendorData.owner_name || 'Vendor'}`,
          status: 'FAILED',
          error_message: emailError?.message || 'Email failed',
        },
      ]);
    } catch {
      // ignore secondary logging failures
    }
  }

  if (isRegistered && buyerCheck?.id) {
    try {
      await supabase.from('buyer_notifications').insert([
        {
          buyer_id: buyerCheck.id,
          type: 'QUOTATION_RECEIVED',
          title: `New Quotation from ${vendorData.company_name || vendorData.owner_name || 'Vendor'}`,
          message: `Received quotation: ${quotation_title}`,
          reference_id: savedQuotation.id,
          reference_type: 'quotation',
          is_read: false,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch {
      // ignore notification failures
    }
  } else {
    try {
      await supabase.from('quotation_unregistered').insert([
        {
          email: targetBuyerEmail,
          quotation_id: savedQuotation.id,
          vendor_id,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch {
      // ignore tracking failures
    }
  }

  return ok(event, {
    success: true,
    message: `Quotation sent successfully to ${targetBuyerEmail}${
      isRegistered ? ' and added to their dashboard' : ' - they will see it after registering'
    }`,
    quotation_id: savedQuotation.id,
    buyer_registered: isRegistered,
    email_sent: emailSent,
  });
};

export const handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return ok(event, { ok: true });

    const tail = parseTail(event.path);
    if (!tail.length) return bad(event, 'Invalid quotation route', null, 404);

    if (tail[0] === 'send') {
      if (event.httpMethod !== 'POST') return methodNotAllowed(event);
      return handleSendQuotation(event);
    }

    if (tail[0] === 'sent') {
      if (event.httpMethod !== 'GET') return methodNotAllowed(event);
      const user = await resolveAuthenticatedUser(event);
      if (!user) return unauthorized(event, 'Unauthorized');
      return handleGetSent(event, user);
    }

    if (tail[0] === 'received') {
      if (event.httpMethod !== 'GET') return methodNotAllowed(event);
      const user = await resolveAuthenticatedUser(event);
      if (!user) return unauthorized(event, 'Unauthorized');

      if (tail.length === 1) return handleGetReceived(event, user);
      return handleGetReceivedDetail(event, user, tail[1]);
    }

    if (tail[0] === 'messages' && tail[1] === 'ack-delivered') {
      if (event.httpMethod !== 'POST') return methodNotAllowed(event);
      const user = await resolveAuthenticatedUser(event);
      if (!user) return unauthorized(event, 'Unauthorized');
      return handleAckDelivered(event, user);
    }

    // /api/quotation/:proposalId/messages
    if (tail.length === 2 && tail[1] === 'messages') {
      const user = await resolveAuthenticatedUser(event);
      if (!user) return unauthorized(event, 'Unauthorized');

      if (event.httpMethod === 'GET') return handleGetProposalMessages(event, user, tail[0]);
      if (event.httpMethod === 'POST') return handlePostProposalMessage(event, user, tail[0]);
      if (event.httpMethod === 'DELETE') return handleDeleteProposalConversation(event, user, tail[0]);
      return methodNotAllowed(event);
    }

    // /api/quotation/:proposalId/messages/:messageId
    if (tail.length === 3 && tail[1] === 'messages') {
      const user = await resolveAuthenticatedUser(event);
      if (!user) return unauthorized(event, 'Unauthorized');

      if (event.httpMethod === 'PATCH') {
        return handlePatchProposalMessage(event, user, tail[0], tail[2]);
      }
      if (event.httpMethod === 'DELETE') {
        return handleDeleteProposalMessage(event, user, tail[0], tail[2]);
      }
      return methodNotAllowed(event);
    }

    return bad(event, 'Invalid quotation route', null, 404);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Quotation function error:', error);
    return fail(event, error?.message || 'Server error');
  }
};
