import express from 'express';
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabaseClient.js';
import { normalizeEmail } from '../lib/auth.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { notifyRole } from '../lib/notify.js';

const router = express.Router();

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=300&q=80';
const FALLBACK_SERVICE_IMAGE =
  'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=800&q=80';
const ALLOWED_UPLOAD_BUCKETS = new Set(['avatars', 'product-images', 'product-media']);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const PRODUCT_IMAGE_MIN_BYTES = 100 * 1024;
const PRODUCT_IMAGE_MAX_BYTES = 800 * 1024;
const KYC_DOC_MIN_BYTES = 100 * 1024;
const KYC_DOC_MAX_BYTES = 2 * 1024 * 1024;
const KYC_ALLOWED_DOC_TYPES = new Set(['GST', 'PAN', 'AADHAR', 'BANK']);
const KYC_ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png']);

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

const isValidId = (v) => typeof v === 'string' && v.trim().length > 0;

const parseDataUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.startsWith('data:')) {
    const match = raw.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) return null;
    return { mime: match[1], base64: match[2] };
  }
  return { mime: null, base64: raw };
};

const sanitizeFilename = (name) =>
  String(name || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^_+/, '')
    .slice(0, 120) || 'upload';

const buildUploadPath = ({ vendorId, originalName, contentType }) => {
  const safeName = sanitizeFilename(originalName || '');
  const extFromMime = MIME_EXT[contentType] || '';
  const hasExt = safeName.includes('.');
  const base = hasExt ? safeName.replace(/\.[^/.]+$/, '') : safeName;
  const ext = hasExt ? safeName.split('.').pop() : (extFromMime || 'bin');
  const fileName = `${base || 'upload'}.${ext}`;
  return `${vendorId}/${Date.now()}-${randomUUID()}-${fileName}`;
};

const isBucketMissingError = (error) => {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('bucket not found') || (msg.includes('bucket') && msg.includes('not found'));
};

const getUploadBucketCandidates = (bucket) => {
  if (bucket === 'product-images') return ['product-images', 'product-media', 'avatars'];
  if (bucket === 'product-media') return ['product-media', 'product-images', 'avatars'];
  return [bucket];
};

const VENDOR_UPDATE_BLOCK = new Set([
  'id',
  'user_id',
  'created_at',
  'updated_at',
  'role',
  'aud',
  'app_metadata',
  'user_metadata',
  'confirmed_at',
  'email_confirmed_at',
  'last_sign_in_at',
  'phone_confirmed_at',
  'identities',
  'factors',
  'is_anonymous',
]);

const sanitizeVendorUpdates = (updates = {}) => {
  const cleaned = {};
  Object.entries(updates || {}).forEach(([key, value]) => {
    if (VENDOR_UPDATE_BLOCK.has(key)) return;
    if (value === undefined) return;
    cleaned[key] = value;
  });
  return cleaned;
};

async function resolveVendorForUser(user) {
  const userId = user?.id || null;
  const email = normalizeEmail(user?.email || '');

  let vendor = null;
  if (userId) {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    vendor = data || null;
  }

  if (!vendor && email) {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    if (error) throw new Error(error.message);
    vendor = data || null;
  }

  if (vendor && userId && vendor.user_id !== userId) {
    await supabase
      .from('vendors')
      .update({ user_id: userId })
      .eq('id', vendor.id);
    vendor.user_id = userId;
  }

  return vendor;
}

async function resolveBuyerId(userId) {
  if (!userId) return null;
  const { data: buyer } = await supabase
    .from('buyers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  return buyer?.id || null;
}

async function resolveBuyerProfileForUser(user = {}) {
  const userId = String(user?.id || '').trim();
  const email = normalizeEmail(user?.email || '');

  if (userId) {
    const { data: byUserId } = await supabase
      .from('buyers')
      .select('id, full_name, company_name, email, phone, whatsapp')
      .eq('user_id', userId)
      .maybeSingle();
    if (byUserId) return byUserId;
  }

  if (email) {
    const { data: byEmail, error: byEmailError } = await supabase
      .from('buyers')
      .select('id, full_name, company_name, email, phone, whatsapp')
      .ilike('email', email)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);
    if (!byEmailError && Array.isArray(byEmail) && byEmail[0]) return byEmail[0];
  }

  return null;
}

const nonEmptyText = (value, maxLen = 500) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.slice(0, maxLen);
};

const parseBudget = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const numeric = Number(String(value).replace(/[, ]+/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .trim();

const dedupe = (arr = []) => Array.from(new Set((arr || []).filter(Boolean)));

const fuzzyMatch = (left, right) => {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
};

const extractLeadCityState = (lead = {}) => {
  const city = String(lead?.city || lead?.city_name || '').trim();
  const state = String(lead?.state || lead?.state_name || '').trim();
  if (city || state) return { city, state };

  const location = String(lead?.location || '').trim();
  if (!location) return { city: '', state: '' };

  const parts = location.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return { city: parts[0], state: parts.slice(1).join(', ') };
  if (parts.length === 1) return { city: parts[0], state: '' };
  return { city: '', state: '' };
};

const buildLeadTokens = (lead = {}) =>
  dedupe(
    [
      lead?.title,
      lead?.product_name,
      lead?.product_interest,
      lead?.category,
      lead?.category_name,
      lead?.head_category,
      lead?.sub_category,
      lead?.service_name,
      lead?.requirement_title,
      lead?.description,
      lead?.message,
    ].map(normalizeText)
  );

const matchesAnyTextSet = (tokens = [], set = new Set()) => {
  if (!set || set.size === 0) return true;
  for (const token of tokens) {
    for (const item of set) {
      if (fuzzyMatch(token, item)) return true;
    }
  }
  return false;
};

async function loadMarketplaceFilterContext(vendorId) {
  const context = {
    autoLeadFilter: true,
    minBudget: null,
    maxBudget: null,
    categorySet: new Set(),
    citySet: new Set(),
    stateSet: new Set(),
  };

  const { data: prefs } = await supabase
    .from('vendor_preferences')
    .select('preferred_micro_categories, preferred_states, preferred_cities, auto_lead_filter, min_budget, max_budget')
    .eq('vendor_id', vendorId)
    .maybeSingle();

  context.autoLeadFilter = prefs?.auto_lead_filter !== false;

  const minBudgetNum = Number(prefs?.min_budget);
  const maxBudgetNum = Number(prefs?.max_budget);
  context.minBudget = Number.isFinite(minBudgetNum) ? minBudgetNum : null;
  context.maxBudget = Number.isFinite(maxBudgetNum) ? maxBudgetNum : null;

  const prefCategoryIds = dedupe((prefs?.preferred_micro_categories || []).map(String));
  const prefStateIds = dedupe((prefs?.preferred_states || []).map(String));
  const prefCityIds = dedupe((prefs?.preferred_cities || []).map(String));

  if (prefCategoryIds.length) {
    const [microRes, subRes, headRes] = await Promise.all([
      supabase.from('micro_categories').select('id, name').in('id', prefCategoryIds),
      supabase.from('sub_categories').select('id, name').in('id', prefCategoryIds),
      supabase.from('head_categories').select('id, name').in('id', prefCategoryIds),
    ]);

    [...(microRes?.data || []), ...(subRes?.data || []), ...(headRes?.data || [])].forEach((row) => {
      const value = normalizeText(row?.name);
      if (value) context.categorySet.add(value);
    });
  }

  if (prefStateIds.length) {
    const { data: states } = await supabase
      .from('states')
      .select('id, name')
      .in('id', prefStateIds);
    (states || []).forEach((row) => {
      const value = normalizeText(row?.name);
      if (value) context.stateSet.add(value);
    });
  }

  if (prefCityIds.length) {
    const { data: cities } = await supabase
      .from('cities')
      .select('id, name')
      .in('id', prefCityIds);
    (cities || []).forEach((row) => {
      const value = normalizeText(row?.name);
      if (value) context.citySet.add(value);
    });
  }

  const { data: products } = await supabase
    .from('products')
    .select('name, category_other')
    .eq('vendor_id', vendorId)
    .eq('status', 'ACTIVE');

  (products || []).forEach((row) => {
    const name = normalizeText(row?.name);
    const categoryOther = normalizeText(row?.category_other);
    if (name) context.categorySet.add(name);
    if (categoryOther) context.categorySet.add(categoryOther);
  });

  return context;
}

function applyMarketplaceFilters(leads = [], context) {
  const rows = Array.isArray(leads) ? leads : [];
  if (!rows.length) return [];

  const shouldAuto = context?.autoLeadFilter !== false;
  if (!shouldAuto) return rows;

  const hasCategoryFilter = (context?.categorySet?.size || 0) > 0;
  const hasCityFilter = (context?.citySet?.size || 0) > 0;
  const hasStateFilter = (context?.stateSet?.size || 0) > 0;
  const hasMinBudget = Number.isFinite(context?.minBudget);
  const hasMaxBudget = Number.isFinite(context?.maxBudget);

  const shouldFilterCategory = hasCategoryFilter;
  const shouldFilterLocation = hasCityFilter || hasStateFilter;
  const shouldFilterBudget = hasMinBudget || hasMaxBudget;

  if (!shouldFilterCategory && !shouldFilterLocation && !shouldFilterBudget) {
    return rows;
  }

  return rows.filter((lead) => {
    if (shouldFilterCategory) {
      const tokens = buildLeadTokens(lead);
      if (!matchesAnyTextSet(tokens, context.categorySet)) return false;
    }

    if (shouldFilterLocation) {
      const { city, state } = extractLeadCityState(lead);
      const cityText = normalizeText(city);
      const stateText = normalizeText(state);
      const locationText = normalizeText(lead?.location);

      const cityMatch = !hasCityFilter
        ? true
        : matchesAnyTextSet([cityText, locationText], context.citySet);
      const stateMatch = !hasStateFilter
        ? true
        : matchesAnyTextSet([stateText, locationText], context.stateSet);

      if (!cityMatch || !stateMatch) return false;
    }

    if (shouldFilterBudget) {
      const budget = Number.parseFloat(lead?.budget);
      if (Number.isFinite(context.minBudget) && Number.isFinite(budget) && budget < context.minBudget) {
        return false;
      }
      if (Number.isFinite(context.maxBudget) && Number.isFinite(budget) && budget > context.maxBudget) {
        return false;
      }
    }

    return true;
  });
}

const omitKeys = (obj, keys = []) =>
  Object.fromEntries(
    Object.entries(obj || {}).filter(([key, value]) => !keys.includes(key) && value !== undefined)
  );

async function attachBuyerMetaToProposals(rows = [], options = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const normalizeEmailValue = (value) => String(value || '').trim().toLowerCase();
  const normalizeNameValue = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const looksLikeHandleName = (value) => {
    const name = normalizeNameValue(value);
    if (!name) return true;
    if (name.includes('@')) return true;
    if (!/[a-zA-Z]/.test(name)) return true;
    if (!name.includes(' ') && /\d/.test(name)) return true;
    return false;
  };
  const toBuyerData = (buyer = {}) => ({
    user_id: buyer?.user_id || null,
    full_name: buyer?.full_name || buyer?.company_name || null,
    company_name: buyer?.company_name || null,
    email: buyer?.email || null,
    phone: buyer?.phone || buyer?.mobile_number || buyer?.mobile || null,
    avatar_url: buyer?.avatar_url || null,
    is_active: typeof buyer?.is_active === 'boolean' ? buyer.is_active : null,
  });
  const scoreBuyerData = (data = {}) => {
    const fullName = normalizeNameValue(data?.full_name);
    let score = 0;
    if (fullName && !looksLikeHandleName(fullName)) score += 100;
    else if (fullName) score += 10;
    if (normalizeNameValue(data?.company_name)) score += 20;
    if (normalizeEmailValue(data?.email)) score += 5;
    if (normalizeNameValue(data?.phone)) score += 3;
    if (normalizeNameValue(data?.avatar_url)) score += 2;
    return score;
  };
  const parseTs = (value) => {
    if (!value) return 0;
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts : 0;
  };
  const upsertBestCandidate = (map, key, data, tsValue) => {
    const mapKey = String(key || '').trim();
    if (!mapKey) return;
    const normalizedData = data || {};
    const next = {
      data: normalizedData,
      score: scoreBuyerData(normalizedData),
      ts: parseTs(tsValue),
    };
    const prev = map.get(mapKey);
    if (!prev || next.score > prev.score || (next.score === prev.score && next.ts > prev.ts)) {
      map.set(mapKey, next);
    }
  };
  const getCandidateData = (map, key) => map.get(String(key || '').trim())?.data || null;
  const isPlaceholderName = (value) => {
    const normalized = normalizeNameValue(value).toLowerCase();
    return (
      normalized === 'buyer' ||
      normalized === 'customer' ||
      normalized === 'unknown' ||
      normalized === 'unknown buyer'
    );
  };
  const pickFirstText = (...values) => {
    for (const value of values) {
      const text = nonEmptyText(value, 500);
      if (text) return text;
    }
    return null;
  };
  const pickPreferredPersonName = (...values) => {
    let fallback = null;
    for (const value of values) {
      const text = nonEmptyText(value, 160);
      if (!text) continue;
      if (!fallback) fallback = text;
      if (!isPlaceholderName(text)) return text;
    }
    return fallback;
  };
  const pickFirstBoolean = (...values) => {
    for (const value of values) {
      if (typeof value === 'boolean') return value;
    }
    return null;
  };

  const buyerIds = Array.from(
    new Set(
      list
        .map((row) => String(row?.buyer_id || '').trim())
        .filter(Boolean)
    )
  );
  const buyerEmails = Array.from(
    new Set(
      list
        .map((row) => normalizeEmailValue(row?.buyer_email))
        .filter(Boolean)
    )
  );

  const buyerMapById = new Map();
  const buyerMapByEmail = new Map();
  const userNameByEmail = new Map();
  const hydrateBuyerMapByEmails = async (emailKeys = []) => {
    const keys = Array.from(new Set((emailKeys || []).map(normalizeEmailValue).filter(Boolean)));
    if (!keys.length) return;

    const { data: buyersByEmail, error: buyerByEmailError } = await supabase
      .from('buyers')
      .select('id, user_id, full_name, company_name, email, phone, avatar_url, is_active, updated_at, created_at')
      .in('email', keys)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (!buyerByEmailError && Array.isArray(buyersByEmail)) {
      buyersByEmail.forEach((buyer) => {
        const emailKey = normalizeEmailValue(buyer?.email);
        if (!emailKey) return;
        const normalized = toBuyerData(buyer);
        const rowTs = buyer?.updated_at || buyer?.created_at || null;
        upsertBestCandidate(buyerMapByEmail, emailKey, normalized, rowTs);
      });
    }

    const unresolvedEmailKeys = keys.filter((email) => !buyerMapByEmail.has(email));
    if (!unresolvedEmailKeys.length) return;

    const fallbackRows = await Promise.all(
      unresolvedEmailKeys.map(async (emailKey) => {
        const { data: buyerByEmail, error } = await supabase
          .from('buyers')
          .select('id, user_id, full_name, company_name, email, phone, avatar_url, is_active, updated_at, created_at')
          .ilike('email', emailKey)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error || !buyerByEmail) return null;
        return buyerByEmail;
      })
    );

    fallbackRows.filter(Boolean).forEach((buyer) => {
      const emailKey = normalizeEmailValue(buyer?.email);
      if (!emailKey) return;
      upsertBestCandidate(
        buyerMapByEmail,
        emailKey,
        toBuyerData(buyer),
        buyer?.updated_at || buyer?.created_at || null
      );
    });
  };
  const hydrateUserNameByEmails = async (emailKeys = []) => {
    const keys = Array.from(new Set((emailKeys || []).map(normalizeEmailValue).filter(Boolean)));
    if (!keys.length) return;

    const { data: usersByEmail, error: usersByEmailError } = await supabase
      .from('users')
      .select('id, email, full_name, updated_at, created_at')
      .in('email', keys)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (!usersByEmailError && Array.isArray(usersByEmail)) {
      usersByEmail.forEach((userRow) => {
        const emailKey = normalizeEmailValue(userRow?.email);
        if (!emailKey || userNameByEmail.has(emailKey)) return;
        const fullName = nonEmptyText(userRow?.full_name, 160);
        if (fullName) userNameByEmail.set(emailKey, fullName);
      });
    }

    const unresolvedEmailKeys = keys.filter((email) => !userNameByEmail.has(email));
    if (!unresolvedEmailKeys.length) return;

    const fallbackRows = await Promise.all(
      unresolvedEmailKeys.map(async (emailKey) => {
        const { data: userByEmail, error } = await supabase
          .from('users')
          .select('id, email, full_name, updated_at, created_at')
          .ilike('email', emailKey)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error || !userByEmail) return null;
        return userByEmail;
      })
    );

    fallbackRows.filter(Boolean).forEach((userRow) => {
      const emailKey = normalizeEmailValue(userRow?.email);
      if (!emailKey || userNameByEmail.has(emailKey)) return;
      const fullName = nonEmptyText(userRow?.full_name, 160);
      if (fullName) userNameByEmail.set(emailKey, fullName);
    });
  };
  if (buyerIds.length) {
    const { data: buyers, error } = await supabase
      .from('buyers')
      .select('id, user_id, full_name, company_name, email, phone, avatar_url, is_active, updated_at, created_at')
      .in('id', buyerIds);

    if (!error && Array.isArray(buyers)) {
      buyers.forEach((buyer) => {
        const normalized = toBuyerData(buyer);
        const rowTs = buyer?.updated_at || buyer?.created_at || null;
        buyerMapById.set(String(buyer.id), normalized);
        const emailKey = normalizeEmailValue(buyer?.email);
        upsertBestCandidate(buyerMapByEmail, emailKey, normalized, rowTs);
      });
    }
  }

  await hydrateBuyerMapByEmails(buyerEmails);
  await hydrateUserNameByEmails(buyerEmails);

  const proposalIds = Array.from(
    new Set(
      list
        .map((row) => String(row?.id || '').trim())
        .filter(Boolean)
    )
  );
  const activeVendorUserId = String(options?.vendorUserId || '').trim();
  const vendorIds = Array.from(
    new Set(
      list
        .map((row) => String(row?.vendor_id || '').trim())
        .filter(Boolean)
    )
  );

  const vendorUserMap = new Map();
  if (vendorIds.length) {
    const { data: vendors, error: vendorError } = await supabase
      .from('vendors')
      .select('id, user_id')
      .in('id', vendorIds);

    if (!vendorError && Array.isArray(vendors)) {
      vendors.forEach((vendor) => {
        const key = String(vendor?.id || '').trim();
        if (!key) return;
        vendorUserMap.set(key, String(vendor?.user_id || '').trim());
      });
    }
  }

  const proposalBuyerCandidateUserIds = new Map();
  if (proposalIds.length) {
    const proposalVendorUserMap = new Map();
    list.forEach((row) => {
      const proposalKey = String(row?.id || '').trim();
      const vendorKey = String(row?.vendor_id || '').trim();
      if (!proposalKey || !vendorKey) return;
      const vendorUserId = String(vendorUserMap.get(vendorKey) || '').trim();
      if (vendorUserId) {
        proposalVendorUserMap.set(proposalKey, vendorUserId);
      }
    });

    const { data: proposalMessages, error: messageError } = await supabase
      .from('proposal_messages')
      .select('proposal_id, sender_id, created_at')
      .in('proposal_id', proposalIds)
      .order('created_at', { ascending: false });

    if (!messageError && Array.isArray(proposalMessages)) {
      proposalMessages.forEach((message) => {
        const proposalKey = String(message?.proposal_id || '').trim();
        const senderId = String(message?.sender_id || '').trim();
        if (!proposalKey || !senderId) return;
        const vendorUserId = String(proposalVendorUserMap.get(proposalKey) || '').trim();
        if (vendorUserId && senderId === vendorUserId) return;
        if (activeVendorUserId && senderId === activeVendorUserId) return;

        if (!proposalBuyerCandidateUserIds.has(proposalKey)) {
          proposalBuyerCandidateUserIds.set(proposalKey, []);
        }
        const candidateIds = proposalBuyerCandidateUserIds.get(proposalKey);
        if (!candidateIds.includes(senderId)) {
          candidateIds.push(senderId);
        }
      });
    }
  }

  const buyerUserIds = Array.from(
    new Set(
      Array.from(proposalBuyerCandidateUserIds.values())
        .flatMap((ids) => (Array.isArray(ids) ? ids : []))
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );

  const buyerMapByUserId = new Map();
  if (buyerUserIds.length) {
    const { data: buyersByUserId, error: buyerUserError } = await supabase
      .from('buyers')
      .select('id, user_id, full_name, company_name, email, phone, avatar_url, is_active, updated_at, created_at')
      .in('user_id', buyerUserIds)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (!buyerUserError && Array.isArray(buyersByUserId)) {
      buyersByUserId.forEach((buyer) => {
        const userKey = String(buyer?.user_id || '').trim();
        if (!userKey) return;
        upsertBestCandidate(
          buyerMapByUserId,
          userKey,
          toBuyerData(buyer),
          buyer?.updated_at || buyer?.created_at || null
        );
      });
    }
  }

  const unresolvedBuyerUserIds = buyerUserIds.filter((id) => !buyerMapByUserId.has(String(id)));
  if (unresolvedBuyerUserIds.length) {
    const { data: usersById, error: usersByIdError } = await supabase
      .from('users')
      .select('id, email, updated_at, created_at')
      .in('id', unresolvedBuyerUserIds);

    if (!usersByIdError && Array.isArray(usersById) && usersById.length) {
      const userEmailMap = new Map();
      usersById.forEach((row) => {
        const userId = String(row?.id || '').trim();
        const emailKey = normalizeEmailValue(row?.email);
        if (!userId || !emailKey) return;
        userEmailMap.set(userId, emailKey);
      });

      const userEmailKeys = Array.from(new Set(Array.from(userEmailMap.values()).filter(Boolean)));
      if (userEmailKeys.length) {
        const { data: buyersFromUserEmails, error: buyersFromUserEmailsError } = await supabase
          .from('buyers')
          .select('id, user_id, full_name, company_name, email, phone, avatar_url, is_active, updated_at, created_at')
          .in('email', userEmailKeys)
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false });

        if (!buyersFromUserEmailsError && Array.isArray(buyersFromUserEmails)) {
          const emailCandidateMap = new Map();
          buyersFromUserEmails.forEach((buyer) => {
            const emailKey = normalizeEmailValue(buyer?.email);
            if (!emailKey) return;
            upsertBestCandidate(
              emailCandidateMap,
              emailKey,
              toBuyerData(buyer),
              buyer?.updated_at || buyer?.created_at || null
            );
          });

          userEmailMap.forEach((emailKey, userId) => {
            const candidate = getCandidateData(emailCandidateMap, emailKey);
            if (!candidate) return;
            upsertBestCandidate(
              buyerMapByUserId,
              userId,
              candidate,
              usersById.find((row) => String(row?.id || '').trim() === userId)?.updated_at || null
            );
          });
        }
      }
    }
  }

  const proposalBuyerUserMap = new Map();
  proposalBuyerCandidateUserIds.forEach((candidateIds, proposalKey) => {
    if (!Array.isArray(candidateIds) || candidateIds.length === 0) return;

    let selected = '';
    for (const senderId of candidateIds) {
      if (getCandidateData(buyerMapByUserId, senderId)) {
        selected = senderId;
        break;
      }
    }
    if (!selected) {
      selected = String(candidateIds[0] || '').trim();
    }
    if (selected) {
      proposalBuyerUserMap.set(proposalKey, selected);
    }
  });

  const leadBuyerMap = new Map();
  if (proposalIds.length) {
    const { data: leads, error: leadError } = await supabase
      .from('leads')
      .select('proposal_id, buyer_id, buyer_name, buyer_email, buyer_phone, company_name, city, state, location, created_at')
      .in('proposal_id', proposalIds)
      .order('created_at', { ascending: false });

    if (!leadError && Array.isArray(leads)) {
      leads.forEach((lead) => {
        const key = String(lead?.proposal_id || '').trim();
        if (!key || leadBuyerMap.has(key)) return;

        const city = String(lead?.city || '').trim();
        const state = String(lead?.state || '').trim();
        const location =
          city && state
            ? `${city}, ${state}`
            : city || state || String(lead?.location || '').trim() || null;

        leadBuyerMap.set(key, {
          buyer_id: lead?.buyer_id || null,
          full_name: lead?.buyer_name || null,
          company_name: lead?.company_name || null,
          email: lead?.buyer_email || null,
          phone: lead?.buyer_phone || null,
          location,
        });
      });
    }
  }

  const leadBuyerIds = Array.from(
    new Set(
      Array.from(leadBuyerMap.values())
        .map((row) => String(row?.buyer_id || '').trim())
        .filter(Boolean)
    )
  );
  if (leadBuyerIds.length) {
    const { data: leadBuyerRows, error: leadBuyerRowsError } = await supabase
      .from('buyers')
      .select('id, user_id, full_name, company_name, email, phone, avatar_url, is_active, updated_at, created_at')
      .in('id', leadBuyerIds);

    if (!leadBuyerRowsError && Array.isArray(leadBuyerRows)) {
      leadBuyerRows.forEach((buyer) => {
        const buyerId = String(buyer?.id || '').trim();
        const normalized = toBuyerData(buyer);
        const rowTs = buyer?.updated_at || buyer?.created_at || null;
        if (buyerId) buyerMapById.set(buyerId, normalized);
        const emailKey = normalizeEmailValue(buyer?.email);
        if (emailKey) upsertBestCandidate(buyerMapByEmail, emailKey, normalized, rowTs);
      });
    }
  }

  const leadBuyerEmails = Array.from(
    new Set(
      Array.from(leadBuyerMap.values())
        .map((row) => normalizeEmailValue(row?.email))
        .filter(Boolean)
      )
  );
  await hydrateBuyerMapByEmails(leadBuyerEmails);
  await hydrateUserNameByEmails(leadBuyerEmails);

  return list.map((row) => ({
    ...row,
    buyers: (() => {
      const idKey = String(row?.buyer_id || '').trim();
      const proposalKey = String(row?.id || '').trim();
      const rowEmailKey = normalizeEmailValue(row?.buyer_email);
      const leadMeta = leadBuyerMap.get(proposalKey) || {};
      const leadEmailKey = normalizeEmailValue(leadMeta?.email);
      const proposalBuyerUserId = String(proposalBuyerUserMap.get(proposalKey) || '').trim();

      const rowBuyer = {
        full_name: row?.buyer_name || null,
        company_name: row?.company_name || null,
        email: row?.buyer_email || null,
        phone: row?.buyer_phone || null,
      };
      const byId = buyerMapById.get(idKey) || {};
      const byUserId = getCandidateData(buyerMapByUserId, proposalBuyerUserId) || {};
      const byLeadEmail = getCandidateData(buyerMapByEmail, leadEmailKey) || {};
      const byRowEmail = getCandidateData(buyerMapByEmail, rowEmailKey) || {};
      const userNameByLeadEmail = nonEmptyText(userNameByEmail.get(leadEmailKey), 160);
      const userNameByRowEmail = nonEmptyText(userNameByEmail.get(rowEmailKey), 160);
      const merged = {
        user_id: pickFirstText(
          byUserId?.user_id,
          byId?.user_id,
          byLeadEmail?.user_id,
          byRowEmail?.user_id,
          proposalBuyerUserId
        ),
        full_name: pickPreferredPersonName(
          byUserId?.full_name,
          byId?.full_name,
          byLeadEmail?.full_name,
          byRowEmail?.full_name,
          userNameByLeadEmail,
          userNameByRowEmail,
          leadMeta?.full_name,
          rowBuyer?.full_name
        ),
        company_name: pickFirstText(
          byUserId?.company_name,
          byId?.company_name,
          byLeadEmail?.company_name,
          byRowEmail?.company_name,
          leadMeta?.company_name,
          rowBuyer?.company_name
        ),
        email: pickFirstText(
          byUserId?.email,
          byId?.email,
          byLeadEmail?.email,
          byRowEmail?.email,
          leadMeta?.email,
          rowBuyer?.email
        ),
        phone: pickFirstText(
          byUserId?.phone,
          byId?.phone,
          byLeadEmail?.phone,
          byRowEmail?.phone,
          leadMeta?.phone,
          rowBuyer?.phone
        ),
        avatar_url: pickFirstText(
          byUserId?.avatar_url,
          byId?.avatar_url,
          byLeadEmail?.avatar_url,
          byRowEmail?.avatar_url
        ),
        is_active: pickFirstBoolean(
          byUserId?.is_active,
          byId?.is_active,
          byLeadEmail?.is_active,
          byRowEmail?.is_active
        ),
        location: pickFirstText(leadMeta?.location),
      };

      const hasAnyValue = Object.values(merged).some(
        (value) => value !== null && value !== undefined && String(value).trim() !== ''
      );

      return hasAnyValue ? merged : null;
    })(),
  }));
}

async function insertNotification(payload = {}) {
  if (!payload?.user_id) return;

  let { error } = await supabase.from('notifications').insert([payload]);
  if (error && String(error?.message || '').toLowerCase().includes('reference_id')) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.reference_id;
    ({ error } = await supabase.from('notifications').insert([fallbackPayload]));
  }
  if (error) throw error;
}

// ✅ Current vendor profile (auth-required)
router.get('/me', requireAuth({ roles: ['VENDOR'] }), async (req, res) => {
  try {
    const vendor = await resolveVendorForUser(req.user);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });
    return res.json({ success: true, vendor });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ✅ Update vendor profile (auth-required, bypasses RLS)
router.put('/me', requireAuth({ roles: ['VENDOR'] }), async (req, res) => {
  try {
    const vendor = await resolveVendorForUser(req.user);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const payload = sanitizeVendorUpdates(req.body || {});
    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('vendors')
      .update(payload)
      .eq('id', vendor.id)
      .select('*')
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, vendor: data || { ...vendor, ...payload } });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ✅ Upload image/media to Supabase Storage (auth-required, bypasses RLS)
router.post('/me/upload', requireAuth({ roles: ['VENDOR'] }), async (req, res) => {
  try {
    const vendor = await resolveVendorForUser(req.user);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const bucket = String(req.body?.bucket || 'avatars').trim() || 'avatars';
    if (!ALLOWED_UPLOAD_BUCKETS.has(bucket)) {
      return res.status(400).json({ success: false, error: 'Invalid upload bucket' });
    }

    const dataUrl = String(req.body?.data_url || req.body?.dataUrl || '').trim();
    const originalName = String(req.body?.file_name || req.body?.fileName || '').trim();
    const explicitType = String(req.body?.content_type || req.body?.contentType || '').trim();

    if (!dataUrl) {
      return res.status(400).json({ success: false, error: 'data_url is required' });
    }

    const parsed = parseDataUrl(dataUrl);
    if (!parsed?.base64) {
      return res.status(400).json({ success: false, error: 'Invalid base64 payload' });
    }

    const contentType = explicitType || parsed.mime || 'application/octet-stream';
    const uploadPurpose = String(req.body?.upload_purpose || req.body?.uploadPurpose || '').trim().toUpperCase();
    const isImage = contentType.startsWith('image/');
    const isVideo = bucket === 'product-media' && contentType.startsWith('video/');
    const isPdf = contentType === 'application/pdf';
    const isAllowed =
      bucket === 'product-images'
        ? isImage
        : (isImage || isPdf || isVideo);

    if (!isAllowed) {
      return res.status(400).json({ success: false, error: 'Unsupported file type' });
    }

    const buffer = Buffer.from(parsed.base64, 'base64');
    if (!buffer?.length) {
      return res.status(400).json({ success: false, error: 'Empty upload payload' });
    }
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return res.status(413).json({ success: false, error: 'File too large (max 10MB)' });
    }
    if (bucket === 'product-images') {
      if (buffer.length < PRODUCT_IMAGE_MIN_BYTES) {
        return res.status(400).json({ success: false, error: 'Image too small (minimum 100KB)' });
      }
      if (buffer.length > PRODUCT_IMAGE_MAX_BYTES) {
        return res.status(413).json({ success: false, error: 'Image too large (maximum 800KB)' });
      }
    }
    if (uploadPurpose === 'KYC_DOCUMENT') {
      if (!KYC_ALLOWED_MIME.has(contentType)) {
        return res.status(400).json({
          success: false,
          error: 'KYC accepts only JPG/PNG images',
        });
      }
      if (buffer.length < KYC_DOC_MIN_BYTES) {
        return res.status(400).json({
          success: false,
          error: 'KYC image too small (minimum 100KB)',
        });
      }
      if (buffer.length > KYC_DOC_MAX_BYTES) {
        return res.status(413).json({
          success: false,
          error: 'KYC image too large (maximum 2MB)',
        });
      }
    }

    const objectPath = buildUploadPath({
      vendorId: vendor.id,
      originalName,
      contentType,
    });

    const bucketCandidates = getUploadBucketCandidates(bucket);
    let uploadedBucket = null;
    let lastUploadError = null;

    for (const candidateBucket of bucketCandidates) {
      const { error: uploadError } = await supabase.storage
        .from(candidateBucket)
        .upload(objectPath, buffer, {
          contentType,
          upsert: true,
        });

      if (!uploadError) {
        uploadedBucket = candidateBucket;
        break;
      }

      lastUploadError = uploadError;
      if (!isBucketMissingError(uploadError)) {
        break;
      }
    }

    if (!uploadedBucket) {
      return res.status(500).json({ success: false, error: lastUploadError?.message || 'Upload failed' });
    }

    const { data } = supabase.storage.from(uploadedBucket).getPublicUrl(objectPath);
    return res.json({
      success: true,
      bucket: uploadedBucket,
      path: objectPath,
      publicUrl: data?.publicUrl || null,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ✅ Submit KYC for verification (auth-required)
router.post('/me/kyc/submit', requireAuth({ roles: ['VENDOR'] }), async (req, res) => {
  try {
    const vendor = await resolveVendorForUser(req.user);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const { data, error } = await supabase
      .from('vendors')
      .update({ kyc_status: 'SUBMITTED', updated_at: new Date().toISOString() })
      .eq('id', vendor.id)
      .select('*')
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });

    await notifyRole('ADMIN', {
      type: 'KYC_SUBMITTED',
      title: 'Vendor submitted KYC',
      message: `Vendor "${vendor.company_name || vendor.id}" submitted KYC for review.`,
      link: '/admin/kyc',
    });
    await notifyRole('SUPERADMIN', {
      type: 'KYC_SUBMITTED',
      title: 'Vendor submitted KYC',
      message: `Vendor "${vendor.company_name || vendor.id}" submitted KYC for review.`,
      link: '/admin/kyc',
    });

    return res.json({ success: true, vendor: data || { ...vendor, kyc_status: 'SUBMITTED' } });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ✅ Vendor documents (auth-required)
router.get('/me/documents', requireAuth({ roles: ['VENDOR'] }), async (req, res) => {
  try {
    const vendor = await resolveVendorForUser(req.user);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    let query = supabase
      .from('vendor_documents')
      .select('*')
      .eq('vendor_id', vendor.id);

    if (req.query?.type) query = query.eq('document_type', String(req.query.type));
    if (req.query?.status) query = query.eq('verification_status', String(req.query.status));

    const { data, error } = await query.order('uploaded_at', { ascending: false });
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, documents: data || [] });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/me/documents/:docId', requireAuth({ roles: ['VENDOR'] }), async (req, res) => {
  try {
    const vendor = await resolveVendorForUser(req.user);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const { docId } = req.params;
    if (!isValidId(docId)) {
      return res.status(400).json({ success: false, error: 'Invalid document id' });
    }

    const { data, error } = await supabase
      .from('vendor_documents')
      .select('*')
      .eq('id', docId)
      .eq('vendor_id', vendor.id)
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });
    if (!data) return res.status(404).json({ success: false, error: 'Document not found' });
    return res.json({ success: true, document: data });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/me/documents', requireAuth({ roles: ['VENDOR'] }), async (req, res) => {
  try {
    const vendor = await resolveVendorForUser(req.user);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const document_type = String(req.body?.document_type || '').trim().toUpperCase();
    const document_url = String(req.body?.document_url || '').trim();
    const original_name = String(req.body?.original_name || '').trim() || null;

    if (!document_type || !document_url) {
      return res.status(400).json({ success: false, error: 'document_type and document_url are required' });
    }
    if (!KYC_ALLOWED_DOC_TYPES.has(document_type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid document type. Allowed: GST, PAN, AADHAR, BANK',
      });
    }

    const { data: existingDocs, error: existingDocsError } = await supabase
      .from('vendor_documents')
      .select('id, document_type')
      .eq('vendor_id', vendor.id);

    if (existingDocsError) {
      return res.status(500).json({ success: false, error: existingDocsError.message });
    }

    const sameType = (existingDocs || []).find(
      (row) => String(row?.document_type || '').toUpperCase() === document_type
    );

    let data = null;
    let error = null;

    if (sameType?.id) {
      const updateRes = await supabase
        .from('vendor_documents')
        .update({
          document_type,
          document_url,
          original_name,
          uploaded_at: new Date().toISOString(),
          verification_status: 'PENDING',
        })
        .eq('id', sameType.id)
        .eq('vendor_id', vendor.id)
        .select('*')
        .maybeSingle();
      data = updateRes.data;
      error = updateRes.error;
    } else {
      if ((existingDocs || []).length >= 4) {
        return res.status(400).json({
          success: false,
          error: 'Only 4 KYC documents are allowed (GST, PAN, AADHAR, BANK)',
        });
      }

      const insertRes = await supabase
        .from('vendor_documents')
        .insert([{
          vendor_id: vendor.id,
          document_type,
          document_url,
          original_name,
          uploaded_at: new Date().toISOString(),
          verification_status: 'PENDING',
        }])
        .select('*')
        .maybeSingle();
      data = insertRes.data;
      error = insertRes.error;
    }

    if (error) return res.status(500).json({ success: false, error: error.message });

    await notifyRole('ADMIN', {
      type: 'KYC_DOCUMENT_UPLOADED',
      title: 'Vendor uploaded KYC document',
      message: `Vendor "${vendor.company_name || vendor.id}" uploaded ${document_type} document for KYC.`,
      link: '/admin/kyc',
    });
    await notifyRole('SUPERADMIN', {
      type: 'KYC_DOCUMENT_UPLOADED',
      title: 'Vendor uploaded KYC document',
      message: `Vendor "${vendor.company_name || vendor.id}" uploaded ${document_type} document for KYC.`,
      link: '/admin/kyc',
    });

    return res.json({ success: true, document: data });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/me/documents/:docId', requireAuth({ roles: ['VENDOR'] }), async (req, res) => {
  try {
    const vendor = await resolveVendorForUser(req.user);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const { docId } = req.params;
    if (!isValidId(docId)) {
      return res.status(400).json({ success: false, error: 'Invalid document id' });
    }

    const { error } = await supabase
      .from('vendor_documents')
      .delete()
      .eq('id', docId)
      .eq('vendor_id', vendor.id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/me/documents', requireAuth({ roles: ['VENDOR'] }), async (req, res) => {
  try {
    const vendor = await resolveVendorForUser(req.user);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const docType = String(req.query?.type || '').trim();
    if (!docType) {
      return res.status(400).json({ success: false, error: 'type query param is required' });
    }

    const { error } = await supabase
      .from('vendor_documents')
      .delete()
      .eq('vendor_id', vendor.id)
      .eq('document_type', docType);

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ✅ Vendor My Leads (auth-required, bypasses RLS)
router.get('/me/marketplace-leads', requireAuth({ roles: ['VENDOR'] }), async (req, res) => {
  try {
    const vendor = await resolveVendorForUser(req.user);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const maxVendorsPerLead = 5;

    const { data: marketplaceRows, error: rowsError } = await supabase
      .from('leads')
      .select('*')
      .is('vendor_id', null)
      .in('status', ['AVAILABLE', 'PURCHASED'])
      .order('created_at', { ascending: false })
      .limit(500);

    if (rowsError) {
      return res.status(500).json({ success: false, error: rowsError.message || 'Failed to fetch marketplace leads' });
    }

    const allRows = Array.isArray(marketplaceRows) ? marketplaceRows : [];
    if (!allRows.length) return res.json({ success: true, leads: [] });

    const allLeadIds = dedupe(allRows.map((row) => String(row?.id || '')).filter(Boolean));

    const [myPurchasesRes, allPurchasesRes, filterContext] = await Promise.all([
      supabase
        .from('lead_purchases')
        .select('lead_id')
        .eq('vendor_id', vendor.id),
      supabase
        .from('lead_purchases')
        .select('lead_id')
        .in('lead_id', allLeadIds),
      loadMarketplaceFilterContext(vendor.id),
    ]);

    if (myPurchasesRes?.error) {
      return res.status(500).json({ success: false, error: myPurchasesRes.error.message || 'Failed to fetch vendor purchases' });
    }
    if (allPurchasesRes?.error) {
      return res.status(500).json({ success: false, error: allPurchasesRes.error.message || 'Failed to fetch purchase counts' });
    }

    const myPurchasedLeadIds = new Set(
      (myPurchasesRes.data || []).map((row) => String(row?.lead_id || '')).filter(Boolean)
    );
    const purchaseCountByLead = new Map();
    (allPurchasesRes.data || []).forEach((row) => {
      const id = String(row?.lead_id || '').trim();
      if (!id) return;
      purchaseCountByLead.set(id, (purchaseCountByLead.get(id) || 0) + 1);
    });

    const eligibleRows = allRows.filter((row) => {
      const id = String(row?.id || '').trim();
      if (!id) return false;
      if (myPurchasedLeadIds.has(id)) return false;
      if ((purchaseCountByLead.get(id) || 0) >= maxVendorsPerLead) return false;
      return true;
    });

    if (!eligibleRows.length) return res.json({ success: true, leads: [] });

    const filteredRows = applyMarketplaceFilters(eligibleRows, filterContext);
    const finalRows = filteredRows.length ? filteredRows : eligibleRows;

    return res.json({ success: true, leads: finalRows });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Failed to load marketplace leads' });
  }
});

router.post('/me/leads/:leadId/purchase', requireAuth({ roles: ['VENDOR'] }), async (req, res) => {
  try {
    const vendor = await resolveVendorForUser(req.user);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const leadId = String(req.params?.leadId || '').trim();
    if (!leadId) {
      return res.status(400).json({ success: false, error: 'Invalid lead id' });
    }

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .maybeSingle();

    if (leadError) {
      return res.status(500).json({ success: false, error: leadError.message || 'Failed to fetch lead' });
    }
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const leadStatus = String(lead?.status || '').toUpperCase();
    if (leadStatus && !['AVAILABLE', 'PURCHASED'].includes(leadStatus)) {
      return res.status(409).json({ success: false, error: 'Lead no longer available' });
    }

    const { data: existingRows, error: existingError } = await supabase
      .from('lead_purchases')
      .select('id, purchase_date, amount')
      .eq('vendor_id', vendor.id)
      .eq('lead_id', leadId)
      .order('purchase_date', { ascending: false })
      .limit(1);

    if (existingError) {
      return res.status(500).json({ success: false, error: existingError.message || 'Failed to validate purchase' });
    }
    if (Array.isArray(existingRows) && existingRows.length > 0) {
      return res.status(409).json({ success: false, error: 'You already purchased this lead' });
    }

    const { count: purchaseCount, error: countError } = await supabase
      .from('lead_purchases')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', leadId);

    if (countError) {
      return res.status(500).json({ success: false, error: countError.message || 'Failed to validate lead capacity' });
    }
    if ((purchaseCount || 0) >= 5) {
      return res.status(409).json({ success: false, error: 'This lead has reached maximum 5 vendors limit' });
    }

    const amountFromBody = Number(req.body?.amount);
    const fallbackAmount = Number.isFinite(Number(lead?.price)) ? Number(lead.price) : 50;
    const finalAmount = Number.isFinite(amountFromBody) ? amountFromBody : fallbackAmount;

    const purchasePayload = {
      vendor_id: vendor.id,
      lead_id: leadId,
      amount: finalAmount,
      payment_status: 'COMPLETED',
      purchase_date: new Date().toISOString(),
    };

    const { data: purchaseRow, error: purchaseError } = await supabase
      .from('lead_purchases')
      .insert([purchasePayload])
      .select('*')
      .maybeSingle();

    if (purchaseError) {
      return res.status(500).json({ success: false, error: purchaseError.message || 'Failed to purchase lead' });
    }

    await supabase
      .from('leads')
      .update({ status: 'PURCHASED' })
      .eq('id', leadId);

    try {
      const vendorUserId = vendor?.user_id || null;
      if (vendorUserId) {
        await insertNotification({
          user_id: vendorUserId,
          type: 'LEAD_PURCHASED',
          title: 'Lead purchased',
          message: `You purchased a lead${lead?.product_name ? ` for ${lead.product_name}` : ''}. Contact details are now available.`,
          link: '/vendor/leads',
          reference_id: purchaseRow?.id || leadId,
          is_read: false,
          created_at: new Date().toISOString(),
        });
      }
    } catch (notifError) {
      console.warn('Lead purchase notification failed:', notifError?.message || notifError);
    }

    return res.status(201).json({
      success: true,
      purchase: purchaseRow || { ...purchasePayload, id: null },
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Failed to purchase lead' });
  }
});

router.get('/me/leads/:leadId', requireAuth({ roles: ['VENDOR'] }), async (req, res) => {
  try {
    const vendor = await resolveVendorForUser(req.user);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const leadId = String(req.params?.leadId || '').trim();
    if (!leadId) {
      return res.status(400).json({ success: false, error: 'Invalid lead id' });
    }

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .maybeSingle();

    if (leadError) {
      return res.status(500).json({ success: false, error: leadError.message || 'Failed to fetch lead' });
    }
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const isDirect = String(lead?.vendor_id || '').trim() === String(vendor.id || '').trim();

    const { data: purchaseRows, error: purchaseError } = await supabase
      .from('lead_purchases')
      .select('id, purchase_date, amount, payment_status')
      .eq('vendor_id', vendor.id)
      .eq('lead_id', leadId)
      .order('purchase_date', { ascending: false })
      .limit(1);

    if (purchaseError) {
      return res.status(500).json({ success: false, error: purchaseError.message || 'Failed to validate lead purchase' });
    }

    const purchase = Array.isArray(purchaseRows) && purchaseRows.length ? purchaseRows[0] : null;

    let isVisibleMarketplaceLead = false;
    if (!isDirect && !purchase) {
      const leadStatus = String(lead?.status || '').toUpperCase();
      const isMarketplace = !lead?.vendor_id && ['AVAILABLE', 'PURCHASED'].includes(leadStatus);
      if (isMarketplace) {
        const { count: purchaseCount, error: countError } = await supabase
          .from('lead_purchases')
          .select('id', { count: 'exact', head: true })
          .eq('lead_id', leadId);

        if (countError) {
          return res.status(500).json({ success: false, error: countError.message || 'Failed to validate lead capacity' });
        }

        isVisibleMarketplaceLead = (purchaseCount || 0) < 5;
      }
    }

    if (!isDirect && !purchase && !isVisibleMarketplaceLead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const source = isDirect ? 'Direct' : purchase ? 'Purchased' : 'Marketplace';
    const responseLead = {
      ...lead,
      source,
      purchase_date: purchase?.purchase_date || lead?.created_at || null,
      lead_purchase_id: purchase?.id || null,
      purchase_amount: purchase?.amount ?? null,
      payment_status: purchase?.payment_status || null,
    };

    return res.json({ success: true, lead: responseLead });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Failed to fetch lead' });
  }
});

router.get('/me/leads', requireAuth({ roles: ['VENDOR'] }), async (req, res) => {
  try {
    const vendor = await resolveVendorForUser(req.user);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const { data: purchases, error: purchaseError } = await supabase
      .from('lead_purchases')
      .select('id, lead_id, amount, payment_status, purchase_date')
      .eq('vendor_id', vendor.id)
      .order('purchase_date', { ascending: false });

    if (purchaseError) {
      return res.status(500).json({ success: false, error: purchaseError.message || 'Failed to fetch lead purchases' });
    }

    const purchasedIds = Array.from(
      new Set((purchases || []).map((p) => String(p?.lead_id || '')).filter(Boolean))
    );

    let purchasedLeads = [];
    if (purchasedIds.length) {
      const { data: purchasedRows, error: purchasedRowsError } = await supabase
        .from('leads')
        .select('*')
        .in('id', purchasedIds);

      if (purchasedRowsError) {
        return res.status(500).json({ success: false, error: purchasedRowsError.message || 'Failed to fetch purchased leads' });
      }

      const leadById = new Map((purchasedRows || []).map((lead) => [String(lead.id), lead]));
      purchasedLeads = (purchases || [])
        .map((purchase) => {
          const lead = leadById.get(String(purchase?.lead_id || ''));
          if (!lead) return null;
          return {
            ...lead,
            source: 'Purchased',
            purchase_date: purchase?.purchase_date || lead?.created_at || null,
            lead_purchase_id: purchase?.id || null,
            purchase_amount: purchase?.amount ?? null,
            payment_status: purchase?.payment_status || null,
          };
        })
        .filter(Boolean);
    }

    const { data: directRows, error: directError } = await supabase
      .from('leads')
      .select('*')
      .eq('vendor_id', vendor.id)
      .order('created_at', { ascending: false });

    if (directError) {
      return res.status(500).json({ success: false, error: directError.message || 'Failed to fetch direct leads' });
    }

    const purchasedLeadIdSet = new Set(purchasedLeads.map((lead) => String(lead?.id || '')).filter(Boolean));
    const directLeads = (directRows || [])
      .filter((lead) => !purchasedLeadIdSet.has(String(lead?.id || '')))
      .map((lead) => ({
        ...lead,
        source: 'Direct',
        purchase_date: lead?.created_at || null,
      }));

    const combined = [...purchasedLeads, ...directLeads].sort((a, b) => {
      const aTs = new Date(a?.purchase_date || a?.created_at || 0).getTime();
      const bTs = new Date(b?.purchase_date || b?.created_at || 0).getTime();
      return bTs - aTs;
    });

    return res.json({ success: true, leads: combined });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/me/proposals', requireAuth({ roles: ['VENDOR'] }), async (req, res) => {
  try {
    const vendor = await resolveVendorForUser(req.user);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const type = String(req.query?.type || 'received').toLowerCase();

    const { data: proposals, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('vendor_id', vendor.id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ success: false, error: error.message || 'Failed to fetch proposals' });
    }

    const enriched = await attachBuyerMetaToProposals(proposals || [], {
      vendorUserId: req.user?.id || '',
    });
    const withType = enriched.map((row) => {
      const hasBuyerEmail = Boolean(String(row?.buyer_email || '').trim());
      return {
        ...row,
        proposal_type: hasBuyerEmail ? 'sent' : 'received',
      };
    });

    const filtered =
      type === 'sent'
        ? withType.filter((row) => row.proposal_type === 'sent')
        : type === 'all'
          ? withType
          : withType.filter((row) => row.proposal_type === 'received');

    return res.json({ success: true, proposals: filtered });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/me/proposals/:proposalId', requireAuth({ roles: ['VENDOR'] }), async (req, res) => {
  try {
    const vendor = await resolveVendorForUser(req.user);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const { proposalId } = req.params;
    if (!isValidId(proposalId)) {
      return res.status(400).json({ success: false, error: 'Invalid proposal id' });
    }

    const { data: proposal, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', proposalId)
      .eq('vendor_id', vendor.id)
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });
    if (!proposal) return res.status(404).json({ success: false, error: 'Proposal not found' });

    const [enriched] = await attachBuyerMetaToProposals([proposal], {
      vendorUserId: req.user?.id || '',
    });
    return res.json({ success: true, proposal: enriched || proposal });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/me/proposals/:proposalId', requireAuth({ roles: ['VENDOR'] }), async (req, res) => {
  try {
    const vendor = await resolveVendorForUser(req.user);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const { proposalId } = req.params;
    if (!isValidId(proposalId)) {
      return res.status(400).json({ success: false, error: 'Invalid proposal id' });
    }

    const { error } = await supabase
      .from('proposals')
      .delete()
      .eq('id', proposalId)
      .eq('vendor_id', vendor.id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/:vendorId', async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!isValidId(vendorId)) {
      return res.status(400).json({ success: false, error: 'Invalid vendor id' });
    }

    const { data: vendor, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', vendorId)
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });

    return res.json({ success: true, vendor });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/:vendorId/products', async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!isValidId(vendorId)) {
      return res.status(400).json({ success: false, error: 'Invalid vendor id' });
    }

    const { data: products, error: pErr } = await supabase
      .from('products')
      .select('id, name, price, price_unit, images, category_other, micro_category_id, sub_category_id, head_category_id')
      .eq('vendor_id', vendorId)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: false });

    if (pErr) return res.status(500).json({ success: false, error: pErr.message });

    const microIds = Array.from(new Set((products || []).map((p) => p.micro_category_id).filter(Boolean)));
    const subIds = Array.from(new Set((products || []).map((p) => p.sub_category_id).filter(Boolean)));
    const headIds = Array.from(new Set((products || []).map((p) => p.head_category_id).filter(Boolean)));

    const [microRes, subRes, headRes] = await Promise.all([
      microIds.length
        ? supabase
            .from('micro_categories')
            .select('id, name, sub_categories(id, name, head_categories(id, name))')
            .in('id', microIds)
        : Promise.resolve({ data: [] }),
      subIds.length
        ? supabase
            .from('sub_categories')
            .select('id, name, head_categories(id, name)')
            .in('id', subIds)
        : Promise.resolve({ data: [] }),
      headIds.length
        ? supabase.from('head_categories').select('id, name').in('id', headIds)
        : Promise.resolve({ data: [] }),
    ]);

    const microLookup = {};
    (microRes?.data || []).forEach((m) => {
      microLookup[m.id] = {
        microName: m.name,
        subId: m.sub_categories?.id || null,
        subName: m.sub_categories?.name || null,
        headId: m.sub_categories?.head_categories?.id || null,
        headName: m.sub_categories?.head_categories?.name || null,
      };
    });

    const subLookup = {};
    (subRes?.data || []).forEach((s) => {
      subLookup[s.id] = {
        subName: s.name,
        headId: s.head_categories?.id || null,
        headName: s.head_categories?.name || null,
      };
    });

    const headLookup = {};
    (headRes?.data || []).forEach((h) => {
      headLookup[h.id] = h.name;
    });

    const mappedProducts = (products || []).map((p) => {
      const microInfo = microLookup[p.micro_category_id] || {};
      const subInfo = subLookup[p.sub_category_id] || {};
      const headName =
        microInfo.headName ||
        subInfo.headName ||
        headLookup[p.head_category_id] ||
        'Other Category';
      const subName =
        microInfo.subName ||
        subInfo.subName ||
        p.category_other ||
        'Other Subcategory';

      const image =
        (p.images && Array.isArray(p.images) && p.images[0]) ||
        (p.images && typeof p.images === 'string' ? p.images : FALLBACK_IMAGE);

      return {
        id: p.id,
        name: p.name,
        price: `₹${p.price}${p.price_unit ? ' / ' + p.price_unit : ''}`,
        category: p.category_other || microInfo.microName || subName || 'General',
        head_category_name: headName,
        sub_category_name: subName,
        micro_category_name: microInfo.microName || null,
        image,
      };
    });

    return res.json({ success: true, products: mappedProducts });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/:vendorId/services', async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!isValidId(vendorId)) {
      return res.status(400).json({ success: false, error: 'Invalid vendor id' });
    }

    let mappedServices = [];
    try {
      const { data: services, error } = await supabase
        .from('vendor_services')
        .select('*')
        .eq('vendor_id', vendorId);

      if (error) throw error;

      if (services?.length) {
        mappedServices = services.map((service) => ({
          id: service.id,
          name: service.name || service.service_name || service.title || 'Service',
          category: service.category || service.service_type || 'Service',
          description:
            service.description ||
            service.details ||
            service.short_description ||
            'Service details coming soon.',
          price: service.price
            ? `₹${service.price}${service.price_unit ? ' / ' + service.price_unit : ''}`
            : service.rate
              ? `₹${service.rate}`
              : 'Price on request',
          image:
            service.image ||
            service.cover_image ||
            (Array.isArray(service.images) ? service.images[0] : null) ||
            FALLBACK_SERVICE_IMAGE,
        }));
      }
    } catch {
      mappedServices = [];
    }

    return res.json({ success: true, services: mappedServices });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/:vendorId/service-categories', async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!isValidId(vendorId)) {
      return res.status(400).json({ success: false, error: 'Invalid vendor id' });
    }

    const { data: prefs, error } = await supabase
      .from('vendor_preferences')
      .select('preferred_micro_categories')
      .eq('vendor_id', vendorId)
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });

    const ids = prefs?.preferred_micro_categories || [];
    if (!ids?.length) return res.json({ success: true, categories: [] });

    const { data: headCats, error: headErr } = await supabase
      .from('head_categories')
      .select('id, name')
      .in('id', ids);

    if (headErr) return res.status(500).json({ success: false, error: headErr.message });

    const mapped = (headCats || []).map((h) => ({ id: h.id, name: h.name }));
    return res.json({ success: true, categories: mapped });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/:vendorId/favorite', requireAuth({ roles: ['BUYER'] }), async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!isValidId(vendorId)) {
      return res.status(400).json({ success: false, error: 'Invalid vendor id' });
    }

    const buyerId = await resolveBuyerId(req.user.id);
    if (!buyerId) {
      return res.status(404).json({ success: false, error: 'Buyer profile not found' });
    }

    const { data: favRow, error } = await supabase
      .from('favorites')
      .select('id')
      .eq('buyer_id', buyerId)
      .eq('vendor_id', vendorId)
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });

    return res.json({ success: true, isFavorite: !!favRow?.id });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/:vendorId/favorite', requireAuth({ roles: ['BUYER'] }), async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!isValidId(vendorId)) {
      return res.status(400).json({ success: false, error: 'Invalid vendor id' });
    }

    const buyerId = await resolveBuyerId(req.user.id);
    if (!buyerId) {
      return res.status(404).json({ success: false, error: 'Buyer profile not found' });
    }

    const { error } = await supabase
      .from('favorites')
      .insert([{ buyer_id: buyerId, vendor_id: vendorId }]);

    if (error && String(error.message || '').toLowerCase().includes('duplicate')) {
      return res.json({ success: true, isFavorite: true });
    }

    if (error) return res.status(500).json({ success: false, error: error.message });

    return res.json({ success: true, isFavorite: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/:vendorId/favorite', requireAuth({ roles: ['BUYER'] }), async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!isValidId(vendorId)) {
      return res.status(400).json({ success: false, error: 'Invalid vendor id' });
    }

    const buyerId = await resolveBuyerId(req.user.id);
    if (!buyerId) {
      return res.status(404).json({ success: false, error: 'Buyer profile not found' });
    }

    const { error } = await supabase
      .from('favorites')
      .delete()
      .match({ buyer_id: buyerId, vendor_id: vendorId });

    if (error) return res.status(500).json({ success: false, error: error.message });

    return res.json({ success: true, isFavorite: false });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/:vendorId/leads', requireAuth(), async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!isValidId(vendorId)) {
      return res.status(400).json({ success: false, error: 'Invalid vendor id' });
    }

    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('id, user_id, company_name, email')
      .eq('id', vendorId)
      .maybeSingle();

    if (vendorError) {
      return res.status(500).json({ success: false, error: vendorError.message });
    }
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const payload = req.body || {};
    const requirement = nonEmptyText(payload.description || payload.message, 5000);
    if (!requirement || requirement.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Requirement/description must be at least 10 characters',
      });
    }

    const buyerProfile = await resolveBuyerProfileForUser(req.user);
    const role = String(req.user?.role || '').toUpperCase();
    if (!buyerProfile && role !== 'BUYER') {
      return res.status(403).json({ success: false, error: 'Buyer account required' });
    }

    const fallbackBuyerName = nonEmptyText(
      req.user?.email ? String(req.user.email).split('@')[0] : 'Buyer',
      120
    ) || 'Buyer';

    const buyerName = nonEmptyText(
      buyerProfile?.full_name ||
        buyerProfile?.company_name ||
        payload.buyer_name ||
        fallbackBuyerName,
      160
    );

    const buyerEmail = nonEmptyText(
      buyerProfile?.email || req.user?.email || payload.buyer_email,
      320
    );
    const buyerPhone = nonEmptyText(
      buyerProfile?.phone ||
        buyerProfile?.mobile_number ||
        buyerProfile?.mobile ||
        buyerProfile?.whatsapp ||
        payload.buyer_phone,
      60
    );
    const companyName = nonEmptyText(
      buyerProfile?.company_name || payload.company_name,
      200
    );

    const title = nonEmptyText(
      payload.title || payload.product_name || payload.product_interest || 'Product enquiry',
      200
    );
    const productName = nonEmptyText(payload.product_name || payload.product_interest || title, 200);
    const productInterest = nonEmptyText(
      payload.product_interest || payload.product_name || title,
      200
    );

    const proposalBasePayload = {
      vendor_id: vendor.id,
      buyer_id: buyerProfile?.id || null,
      buyer_email: null,
      title,
      product_name: productName,
      quantity: nonEmptyText(payload.quantity, 80),
      budget: parseBudget(payload.budget),
      required_by_date: nonEmptyText(payload.required_by_date, 40),
      description: requirement,
      status: 'SENT',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const proposalVariants = [
      omitKeys(proposalBasePayload, []),
      omitKeys(proposalBasePayload, ['required_by_date']),
      omitKeys(proposalBasePayload, ['required_by_date', 'buyer_email']),
    ];

    let createdProposal = null;
    let proposalInsertError = null;

    for (const candidate of proposalVariants) {
      const { data: proposalRow, error: proposalErr } = await supabase
        .from('proposals')
        .insert([candidate])
        .select('id, vendor_id, buyer_id, title, product_name, status, created_at')
        .maybeSingle();

      if (!proposalErr) {
        createdProposal = proposalRow || {
          id: null,
          vendor_id: candidate?.vendor_id || vendor.id,
          buyer_id: candidate?.buyer_id || null,
          title: candidate?.title || null,
          product_name: candidate?.product_name || null,
          status: candidate?.status || 'SENT',
          created_at: candidate?.created_at || null,
        };
        break;
      }

      proposalInsertError = proposalErr;
    }

    if (!createdProposal) {
      return res.status(500).json({
        success: false,
        error: proposalInsertError?.message || 'Failed to create proposal',
      });
    }

    const baseLeadPayload = {
      vendor_id: vendor.id,
      title,
      product_name: productName,
      product_interest: productInterest,
      proposal_id: createdProposal?.id || null,
      buyer_id: buyerProfile?.id || null,
      buyer_name: buyerName,
      buyer_email: buyerEmail ? String(buyerEmail).toLowerCase().trim() : null,
      buyer_phone: buyerPhone,
      company_name: companyName,
      description: requirement,
      message: requirement,
      quantity: nonEmptyText(payload.quantity, 80),
      budget: parseBudget(payload.budget),
      category: nonEmptyText(payload.category, 120),
      category_slug: nonEmptyText(payload.category_slug, 160),
      location: nonEmptyText(payload.location, 200),
      status: 'AVAILABLE',
      created_at: new Date().toISOString(),
    };

    const variants = [
      omitKeys(baseLeadPayload, []),
      omitKeys(baseLeadPayload, ['location', 'category_slug', 'product_interest']),
      omitKeys(baseLeadPayload, ['location', 'category_slug', 'product_interest', 'buyer_phone', 'company_name']),
      {
        vendor_id: baseLeadPayload.vendor_id,
        title: baseLeadPayload.title,
        product_name: baseLeadPayload.product_name,
        buyer_name: baseLeadPayload.buyer_name,
        buyer_email: baseLeadPayload.buyer_email,
        description: baseLeadPayload.description,
        message: baseLeadPayload.message,
        quantity: baseLeadPayload.quantity,
        budget: baseLeadPayload.budget,
        status: 'AVAILABLE',
        created_at: baseLeadPayload.created_at,
      },
    ];

    let createdLead = null;
    let lastError = null;

    for (const candidate of variants) {
      const { data: leadRow, error: leadErr } = await supabase
        .from('leads')
        .insert([candidate])
        .select('id, vendor_id, title, buyer_id, buyer_name, buyer_email, created_at')
        .maybeSingle();

      if (!leadErr) {
        createdLead = leadRow || {
          id: null,
          vendor_id: vendor.id,
          title: candidate?.title || null,
          buyer_id: candidate?.buyer_id || null,
          buyer_name: candidate?.buyer_name || null,
          buyer_email: candidate?.buyer_email || null,
          created_at: candidate?.created_at || null,
        };
        break;
      }

      lastError = leadErr;
    }

    if (!createdLead) {
      console.warn('Lead insert failed after proposal create:', lastError?.message || lastError);
    }

    let vendorUserId = vendor.user_id || null;
    if (!vendorUserId && vendor?.email) {
      const { data: userRow } = await supabase
        .from('users')
        .select('id')
        .eq('email', String(vendor.email).toLowerCase().trim())
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      vendorUserId = userRow?.id || null;
    }

    if (vendorUserId) {
      try {
        await insertNotification({
          user_id: vendorUserId,
          type: 'NEW_LEAD',
          title: 'New enquiry received',
          message: `${buyerName || 'A buyer'} sent an enquiry for ${title || 'your listing'}`,
          link: '/vendor/proposals?tab=received',
          reference_id: createdProposal?.id || createdLead?.id || null,
          is_read: false,
          created_at: new Date().toISOString(),
        });
      } catch (notifError) {
        console.warn('Vendor lead notification failed:', notifError?.message || notifError);
      }
    }

    return res.status(201).json({ success: true, lead: createdLead, proposal: createdProposal });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/:vendorId/leads', requireAuth(), async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!isValidId(vendorId)) {
      return res.status(400).json({ success: false, error: 'Invalid vendor id' });
    }

    const buyerProfile = await resolveBuyerProfileForUser(req.user);
    if (!buyerProfile?.id) {
      return res.json({ success: true, leads: [] });
    }

    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .eq('vendor_id', vendorId)
      .eq('buyer_id', buyerProfile.id);

    if (error) return res.status(500).json({ success: false, error: error.message });

    return res.json({ success: true, leads: leads || [] });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
