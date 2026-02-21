// ✅ File: src/modules/vendor/services/vendorApi.js
import { supabase } from '@/lib/customSupabaseClient';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';

// ---------------- HELPERS ----------------

const fetchVendorJson = async (path, options = {}) => {
  const res = await fetchWithCsrf(apiUrl(path), options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error || data?.message || 'Request failed';
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
};

// Helper to get current vendor ID based on auth user
const getVendorId = async () => {
  const { data: { user }, error: uErr } = await supabase.auth.getUser();
  if (uErr) throw uErr;
  if (!user) throw new Error('Not authenticated');

  const { data: vendorByUser, error: byUserError } = await supabase
    .from('vendors')
    .select('id, user_id, email')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (vendorByUser?.id) return vendorByUser.id;
  if (byUserError) {
    console.warn('Vendor lookup by user_id failed:', byUserError?.message || byUserError);
  }

  const email = String(user.email || '').toLowerCase().trim();
  if (!email) {
    throw new Error('Vendor profile not found');
  }

  const { data: vendorByEmail, error: byEmailError } = await supabase
    .from('vendors')
    .select('id, user_id, email')
    .ilike('email', email)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byEmailError) {
    console.warn('Vendor lookup by email failed:', byEmailError?.message || byEmailError);
    throw new Error('Vendor profile not found');
  }

  if (!vendorByEmail?.id) {
    throw new Error('Vendor profile not found');
  }

  // Best effort relink for legacy rows missing user_id mapping.
  if (!vendorByEmail.user_id || vendorByEmail.user_id !== user.id) {
    supabase
      .from('vendors')
      .update({ user_id: user.id })
      .eq('id', vendorByEmail.id)
      .then(() => {})
      .catch(() => {});
  }

  return vendorByEmail.id;
};

// Helper for ID Generation
const generateRandomString = (length, chars) => {
  let result = '';
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
};

// Helper to generate URL-friendly slug from text
const generateSlug = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

// Helper to generate unique slug by appending random string
const generateUniqueSlug = (text) => {
  const baseSlug = generateSlug(text);
  const timestamp = Math.random().toString(36).substring(2, 8);
  return `${baseSlug}-${timestamp}`.substring(0, 100);
};

const generateVendorIdString = (ownerName = '', companyName = '', phone = '') => {
  const digits = '0123456789';

  // First 4 letters of owner name (uppercase), padded with X if needed
  let part1 = ownerName
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4)
    .padEnd(4, 'X');

  // First 4 letters of company name (uppercase), padded with Z if needed
  let part2 = companyName
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4)
    .padEnd(4, 'Z');

  // Last 2 digits of phone number, or 2 random digits if not available
  let part3 = phone ? phone.replace(/\D/g, '').slice(-2).padStart(2, '0') : generateRandomString(2, digits);

  // 2 random digits
  const part4 = generateRandomString(2, digits);

  return `${part1}-V-${part2}-${part3}${part4}`;
};

// Convert camelCase -> snake_case
const toSnake = (key) => key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');

// Calculate profile completion percentage based on filled fields
const calculateProfileCompletion = (vendorData) => {
  const fieldsToCheck = [
    'company_name',
    'owner_name',
    'phone',
    'email',
    'address',
    'gst_number',
    'state',
    'city',
    'website_url',
    'profile_image',
    'primary_business_type',
    'year_of_establishment'
  ];

  const filledFields = fieldsToCheck.filter(field =>
    vendorData[field] &&
    vendorData[field].toString().trim() !== '' &&
    vendorData[field] !== null
  ).length;

  return Math.round((filledFields / fieldsToCheck.length) * 100);
};

// ✅ NEW: Normalize account status fields safely (works even if columns don't exist)
const normalizeVendorAccountStatus = (vendor) => {
  // If column doesn't exist, it will be undefined and safely handled.
  const isVerified = vendor?.is_verified === true;
  const isActive = vendor?.is_active === true;

  // Suspended/terminated means NOT active (but login can still happen via Supabase auth)
  const isSuspended = vendor?.is_active === false;

  // Optional columns (if your DB has them)
  const suspensionMessage =
    vendor?.suspension_message ||
    vendor?.suspension_reason ||
    vendor?.termination_message ||
    vendor?.termination_reason ||
    '';

  const terminatedAt = vendor?.terminated_at || null;
  const suspensionAt = vendor?.suspended_at || null;

  // Status string for UI
  // Priority: terminated_at -> TERMINATED, else is_active false -> SUSPENDED, else ACTIVE/UNVERIFIED
  let accountStatus = 'ACTIVE';
  if (terminatedAt) accountStatus = 'TERMINATED';
  else if (isSuspended) accountStatus = 'SUSPENDED';
  else if (!isVerified) accountStatus = 'UNVERIFIED';

  return {
    isVerified,
    isActive,
    isSuspended,
    accountStatus,
    suspensionMessage,
    terminatedAt,
    suspensionAt
  };
};

const normalizeEmailValue = (value) => String(value || '').trim().toLowerCase();
const normalizeTextValue = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const isPlaceholderBuyerName = (value) => {
  const normalized = normalizeTextValue(value).toLowerCase();
  return (
    !normalized ||
    normalized === 'buyer' ||
    normalized === 'customer' ||
    normalized === 'unknown' ||
    normalized === 'unknown buyer'
  );
};

const pickFirstTextValue = (...values) => {
  for (const value of values) {
    const text = normalizeTextValue(value);
    if (text) return text;
  }
  return '';
};

const pickPreferredBuyerName = (...values) => {
  let fallback = '';
  for (const value of values) {
    const text = normalizeTextValue(value);
    if (!text) continue;
    if (!fallback) fallback = text;
    if (!isPlaceholderBuyerName(text)) return text;
  }
  return fallback;
};

const toBuyerMeta = (buyer = {}) => ({
  user_id: String(buyer?.user_id || '').trim() || null,
  full_name: normalizeTextValue(buyer?.full_name || buyer?.company_name) || null,
  company_name: normalizeTextValue(buyer?.company_name) || null,
  email: normalizeEmailValue(buyer?.email) || null,
  phone: normalizeTextValue(buyer?.phone) || null,
  avatar_url: normalizeTextValue(buyer?.avatar_url) || null,
  is_active: typeof buyer?.is_active === 'boolean' ? buyer.is_active : null,
});

const enrichProposalBuyerMeta = async (rows = []) => {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return list;

  try {
    const proposalIds = Array.from(
      new Set(list.map((row) => String(row?.id || '').trim()).filter(Boolean))
    );

    const leadByProposalId = new Map();
    if (proposalIds.length) {
      const { data: leads, error: leadError } = await supabase
        .from('leads')
        .select('proposal_id, buyer_id, buyer_name, buyer_email, buyer_phone, company_name, created_at')
        .in('proposal_id', proposalIds)
        .order('created_at', { ascending: false });

      if (!leadError && Array.isArray(leads)) {
        leads.forEach((lead) => {
          const key = String(lead?.proposal_id || '').trim();
          if (!key || leadByProposalId.has(key)) return;
          leadByProposalId.set(key, lead);
        });
      }
    }

    const buyerIds = Array.from(
      new Set(
        list
          .flatMap((row) => {
            const lead = leadByProposalId.get(String(row?.id || '').trim()) || {};
            return [row?.buyer_id, lead?.buyer_id];
          })
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      )
    );

    const buyerEmails = Array.from(
      new Set(
        list
          .flatMap((row) => {
            const lead = leadByProposalId.get(String(row?.id || '').trim()) || {};
            return [row?.buyer_email, row?.buyers?.email, lead?.buyer_email];
          })
          .map((value) => normalizeEmailValue(value))
          .filter(Boolean)
      )
    );

    const buyerById = new Map();
    if (buyerIds.length) {
      const { data: buyersById, error: buyerByIdError } = await supabase
        .from('buyers')
        .select('id, user_id, full_name, company_name, email, phone, avatar_url, is_active')
        .in('id', buyerIds);

      if (!buyerByIdError && Array.isArray(buyersById)) {
        buyersById.forEach((buyer) => {
          const key = String(buyer?.id || '').trim();
          if (!key) return;
          buyerById.set(key, toBuyerMeta(buyer));
        });
      }
    }

    const buyerByEmail = new Map();
    if (buyerEmails.length) {
      const { data: buyersByEmail, error: buyerByEmailError } = await supabase
        .from('buyers')
        .select('id, user_id, full_name, company_name, email, phone, avatar_url, is_active')
        .in('email', buyerEmails);

      if (!buyerByEmailError && Array.isArray(buyersByEmail)) {
        buyersByEmail.forEach((buyer) => {
          const emailKey = normalizeEmailValue(buyer?.email);
          if (!emailKey || buyerByEmail.has(emailKey)) return;
          buyerByEmail.set(emailKey, toBuyerMeta(buyer));
        });
      }
    }

    return list.map((row) => {
      const proposalKey = String(row?.id || '').trim();
      const lead = leadByProposalId.get(proposalKey) || {};
      const rowBuyerId = String(row?.buyer_id || '').trim();
      const leadBuyerId = String(lead?.buyer_id || '').trim();
      const rowBuyerEmail = normalizeEmailValue(row?.buyer_email || row?.buyers?.email);
      const leadBuyerEmail = normalizeEmailValue(lead?.buyer_email);

      const fromId = buyerById.get(rowBuyerId) || buyerById.get(leadBuyerId) || null;
      const fromEmail = buyerByEmail.get(rowBuyerEmail) || buyerByEmail.get(leadBuyerEmail) || null;
      const currentBuyer = toBuyerMeta(row?.buyers || {});

      const mergedName = pickPreferredBuyerName(
        fromId?.full_name,
        fromEmail?.full_name,
        currentBuyer?.full_name,
        lead?.buyer_name,
        row?.buyer_name,
        fromId?.company_name,
        fromEmail?.company_name,
        currentBuyer?.company_name
      );
      const mergedEmail = pickFirstTextValue(
        fromId?.email,
        fromEmail?.email,
        currentBuyer?.email,
        lead?.buyer_email,
        row?.buyer_email
      ).toLowerCase();
      const mergedPhone = pickFirstTextValue(
        fromId?.phone,
        fromEmail?.phone,
        currentBuyer?.phone,
        lead?.buyer_phone,
        row?.buyer_phone
      );
      const mergedCompany = pickFirstTextValue(
        fromId?.company_name,
        fromEmail?.company_name,
        currentBuyer?.company_name,
        lead?.company_name,
        row?.company_name
      );
      const mergedAvatar = pickFirstTextValue(
        fromId?.avatar_url,
        fromEmail?.avatar_url,
        currentBuyer?.avatar_url,
        row?.buyer_avatar
      );
      const mergedUserId = pickFirstTextValue(
        fromId?.user_id,
        fromEmail?.user_id,
        currentBuyer?.user_id
      );

      const buyerMeta = {
        user_id: mergedUserId || null,
        full_name: mergedName || null,
        company_name: mergedCompany || null,
        email: mergedEmail || null,
        phone: mergedPhone || null,
        avatar_url: mergedAvatar || null,
        is_active:
          typeof fromId?.is_active === 'boolean'
            ? fromId.is_active
            : typeof fromEmail?.is_active === 'boolean'
              ? fromEmail.is_active
              : typeof currentBuyer?.is_active === 'boolean'
                ? currentBuyer.is_active
                : null,
      };

      const hasBuyerMeta = Object.values(buyerMeta).some(
        (value) => value !== null && value !== undefined && String(value).trim() !== ''
      );

      return {
        ...row,
        buyer_name: mergedName || row?.buyer_name || null,
        buyer_email: mergedEmail || row?.buyer_email || null,
        buyer_phone: mergedPhone || row?.buyer_phone || null,
        company_name: mergedCompany || row?.company_name || null,
        buyer_avatar: mergedAvatar || row?.buyer_avatar || null,
        buyers: hasBuyerMeta ? buyerMeta : row?.buyers || null,
      };
    });
  } catch (error) {
    console.warn('[vendorApi] proposal buyer enrichment failed:', error?.message || error);
    return list;
  }
};

// ---------------- API ----------------

export const vendorApi = {
  auth: {
    me: async () => {
      const { data: { user }, error: uErr } = await supabase.auth.getUser();
      if (uErr) throw uErr;
      if (!user) return null;

      const { data: vendor, error } = await supabase
        .from('vendors')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (!vendor) return null;
      return { ...vendor, role: 'VENDOR', user_id: user.id, email: user.email };
    },
  },
  // --- LOCATION API ---
  locations: {
    // --- STATES ---
    getStates: async (includeInactive = false) => {
      let query = supabase
        .from('states')
        .select('*')
        .order('name');

      if (!includeInactive) query = query.eq('is_active', true);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    getState: async (id) => {
      const { data, error } = await supabase
        .from('states')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },

    createState: async (name, slug) => {
      const { data, error } = await supabase
        .from('states')
        .insert([{
          name,
          slug: slug || generateSlug(name),
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    updateState: async (id, updates) => {
      const { data, error } = await supabase
        .from('states')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    deleteState: async (id) => {
      const { error } = await supabase.from('states').delete().eq('id', id);
      if (error) throw error;
    },

    toggleStateActive: async (id, isActive) => {
      const { data, error } = await supabase
        .from('states')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    // --- CITIES ---
    getCities: async (stateId, includeInactive = false) => {
      if (!stateId) return [];
      let query = supabase
        .from('cities')
        .select('*')
        .eq('state_id', stateId)
        .order('name');

      if (!includeInactive) query = query.eq('is_active', true);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    getCity: async (id) => {
      const { data, error } = await supabase
        .from('cities')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },

    getCitiesWithState: async (includeInactive = false) => {
      let query = supabase
        .from('cities')
        .select('*, state:states(id, name, slug)')
        .order('name');

      if (!includeInactive) query = query.eq('is_active', true);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    createCity: async (stateId, name, slug) => {
      const { data, error } = await supabase
        .from('cities')
        .insert([{
          state_id: stateId,
          name,
          slug: slug || generateSlug(name),
          is_active: true,
          supplier_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    updateCity: async (id, updates) => {
      const { data, error } = await supabase
        .from('cities')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    deleteCity: async (id) => {
      const { error } = await supabase.from('cities').delete().eq('id', id);
      if (error) throw error;
    },

    toggleCityActive: async (id, isActive) => {
      const { data, error } = await supabase
        .from('cities')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    incrementSupplierCount: async (id) => {
      const { data: city, error: getErr } = await supabase
        .from('cities')
        .select('supplier_count')
        .eq('id', id)
        .single();
      if (getErr) throw getErr;

      const newCount = (city?.supplier_count || 0) + 1;
      const { data, error } = await supabase
        .from('cities')
        .update({ supplier_count: newCount })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    decrementSupplierCount: async (id) => {
      const { data: city, error: getErr } = await supabase
        .from('cities')
        .select('supplier_count')
        .eq('id', id)
        .single();
      if (getErr) throw getErr;

      const newCount = Math.max(0, (city?.supplier_count || 0) - 1);
      const { data, error } = await supabase
        .from('cities')
        .update({ supplier_count: newCount })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  },

  // Legacy aliases for backward compatibility
  getStates: async () => {
    return vendorApi.locations.getStates(false);
  },

  getCities: async (stateId) => {
    return vendorApi.locations.getCities(stateId, false);
  },

  // --- UTILS ---
  generateVendorId: async (phone = '') => {
    let unique = false;
    let newId = '';
    let attempts = 0;

    while (!unique && attempts < 10) {
      newId = generateVendorIdString('', '', phone);

      const { data, error } = await supabase
        .from('vendors')
        .select('id')
        .eq('vendor_id', newId)
        .maybeSingle();

      if (error) throw error;
      if (!data) unique = true;
      attempts++;
    }

    if (!unique) throw new Error("Failed to generate unique Vendor ID");
    return newId;
  },

  getVendorByUserId: async (userId) => {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  // ✅ NEW: Account status fetch for current vendor (for suspended overlay check)
  account: {
    getStatus: async () => {
      const { data: { user }, error: uErr } = await supabase.auth.getUser();
      if (uErr) throw uErr;
      if (!user) throw new Error('Not authenticated');

      const { data: vendor, error } = await supabase
        .from('vendors')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      return normalizeVendorAccountStatus(vendor);
    }
  },

  // --- REGISTRATION & VERIFICATION ---
  registerVendor: async (payload) => {
    const {
      userId,
      companyName,
      gstNumber,
      address,
      ownerName,
      email,
      phone,
      stateId,
      cityId,
      stateName,
      cityName
    } = payload;

    const { data: existing, error: exErr } = await supabase
      .from('vendors')
      .select('id, vendor_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (exErr) throw exErr;

    let vendorId = existing?.vendor_id;

    if (!vendorId || vendorId.includes('-') === false) {
      let unique = false;
      let attempts = 0;

      while (!unique && attempts < 10) {
        vendorId = generateVendorIdString(ownerName, companyName, phone);

        const { data: already, error } = await supabase
          .from('vendors')
          .select('id')
          .eq('vendor_id', vendorId)
          .maybeSingle();

        if (error) throw error;
        if (!already) unique = true;
        attempts++;
      }

      if (!unique) throw new Error("Failed to generate unique Vendor ID");
    }

    const vendorData = {
      company_name: companyName,
      gst_number: gstNumber,
      address: address,
      registered_address: address,
      owner_name: ownerName,
      email: email,
      phone: phone,
      state_id: stateId || null,
      city_id: cityId || null,
      state: stateName,
      city: cityName,
      kyc_status: 'PENDING',
      profile_completion: calculateProfileCompletion({ company_name: companyName, gst_number: gstNumber, address, owner_name: ownerName, email, phone, state: stateName, city: cityName }),
      updated_at: new Date().toISOString(),
      vendor_id: vendorId
    };

    if (existing) {
      const { error } = await supabase
        .from('vendors')
        .update(vendorData)
        .eq('id', existing.id);

      if (error) throw error;
    } else {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('vendors')
        .insert([{
          user_id: userId,
          ...vendorData,
          is_active: true,
          is_verified: true,
          verified_at: nowIso,
          created_at: nowIso,
          updated_at: nowIso
        }]);

      if (error) throw error;
    }
  },

  updateVendorVerification: async (userId, isVerified) => {
    const updates = {
      is_verified: isVerified,
      verified_at: isVerified ? new Date().toISOString() : null,
      is_active: isVerified
    };

    const { data, error } = await supabase
      .from('vendors')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // --- AUTH & PROFILE ---
  auth: {
    // ✅ FIXED: we do NOT spread full auth user object (confirmed_at/is_anonymous etc won’t leak to UI draft)
    me: async () => {
      const { data: { user }, error: uErr } = await supabase.auth.getUser();
      if (uErr) throw uErr;
      if (!user) return null;

      let vendor = null;

      // Prefer backend endpoint (RLS-safe and mapping-safe).
      try {
        const response = await fetchVendorJson('/api/vendors/me');
        vendor = response?.vendor || null;
      } catch (error) {
        if (error?.status === 401 || error?.status === 403) {
          return null;
        }
        vendor = null;
      }

      // Fallback by user_id
      if (!vendor) {
        const { data: byUserId, error: byUserErr } = await supabase
          .from('vendors')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        if (byUserErr) throw byUserErr;
        vendor = byUserId || null;
      }

      // Fallback by email (legacy rows can miss user_id link)
      const normalizedEmail = String(user.email || '').toLowerCase().trim();
      if (!vendor && normalizedEmail) {
        const { data: byEmail, error: byEmailErr } = await supabase
          .from('vendors')
          .select('*')
          .ilike('email', normalizedEmail)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (byEmailErr) throw byEmailErr;
        vendor = byEmail || null;
      }

      // Best effort relink for future lookups.
      if (vendor?.id && vendor?.user_id !== user.id) {
        supabase
          .from('vendors')
          .update({ user_id: user.id })
          .eq('id', vendor.id)
          .then(() => {})
          .catch(() => {});
      }

      const account = normalizeVendorAccountStatus(vendor);

      const transformedVendor = vendor ? {
        ...vendor,

        // camel aliases (optional)
        companyName: vendor.company_name,
        ownerName: vendor.owner_name,
        gstNumber: vendor.gst_number,
        panNumber: vendor.pan_number,
        aadharNumber: vendor.aadhar_number,
        websiteUrl: vendor.website_url,
        primaryBusinessType: vendor.primary_business_type,
        annualTurnover: vendor.annual_turnover,
        registeredAddress: vendor.registered_address,
        stateId: vendor.state_id,
        cityId: vendor.city_id,
        vendorId: vendor.vendor_id || null,
        profileImage: vendor.profile_image,
        kycStatus: vendor.kyc_status,
        kycDocs: vendor.kyc_docs,
        profileCompletion: vendor.profile_completion,
        isVerified: vendor.is_verified,
        isActive: vendor.is_active,
        verifiedAt: vendor.verified_at,
        createdAt: vendor.created_at,
        updatedAt: vendor.updated_at,

        secondaryEmail: vendor.secondary_email,
        secondaryPhone: vendor.secondary_phone,
        landlineNumber: vendor.landline_number,
        cinNumber: vendor.cin_number,
        llpinNumber: vendor.llpin_number,
        iecCode: vendor.iec_code,
        yearOfEstablishment: vendor.year_of_establishment,
        ownerDesignation: vendor.owner_designation,

        // ✅ NEW: account status aliases (safe even if columns missing)
        accountStatus: account.accountStatus,
        isSuspended: account.isSuspended,
        suspensionMessage: account.suspensionMessage,
        suspendedAt: account.suspensionAt,
        terminatedAt: account.terminatedAt,
      } : null;

      // ✅ Return safe auth + vendor data
      return {
        user_id: user.id,
        email: vendor?.email || user.email || null,
        phone: vendor?.phone || user.phone || null,
        role: 'VENDOR',
        ...transformedVendor
      };
    },

    logout: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },

    updatePassword: async (newPassword) => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },

    // ✅ FIXED: auth fields will NEVER go into vendors update
    updateProfile: async (updates) => {
      // ✅ auth-only keys must never go to vendors table
      const BLOCK = new Set([
        'id', 'user_id', 'aud', 'role', 'created_at', 'updated_at',
        'confirmed_at', 'email_confirmed_at', 'last_sign_in_at', 'phone_confirmed_at',
        'app_metadata', 'user_metadata', 'identities', 'factors',
        'is_anonymous' // ✅ IMPORTANT (your current error)
      ]);

      const safeUpdates = Object.fromEntries(
        Object.entries(updates || {}).filter(([k]) => !BLOCK.has(k))
      );

      // Build DB update in snake_case
      const dbUpdates = {};
      for (const [key, value] of Object.entries(safeUpdates)) {
        // if already snake_case keep it
        if (key.includes('_')) dbUpdates[key] = value;
        else dbUpdates[toSnake(key)] = value;
      }

      // always touch updated_at (optional)
      dbUpdates.updated_at = new Date().toISOString();

      // Try to compute profile completion from existing vendor data (non-blocking)
      try {
        const vendorId = await getVendorId();
        const { data: currentVendor, error: fetchError } = await supabase
          .from('vendors')
          .select('*')
          .eq('id', vendorId)
          .single();

        if (!fetchError && currentVendor) {
          const mergedVendor = { ...currentVendor, ...dbUpdates };
          dbUpdates.profile_completion = calculateProfileCompletion(mergedVendor);
        }
      } catch (err) {
        console.warn('[VendorProfile] profile completion calc skipped:', err?.message || err);
      }

      const { vendor } = await fetchVendorJson('/api/vendors/me', {
        method: 'PUT',
        body: JSON.stringify(dbUpdates),
      });

      return vendor || null;
    },

    uploadImage: async (file, bucket = 'avatars', options = {}) => {
      if (!file) throw new Error('No file provided');
      const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
      const PRODUCT_MIN_BYTES = 100 * 1024;
      const PRODUCT_MAX_BYTES = 800 * 1024;
      const isProductImage = String(bucket || '').trim() === 'product-images';

      if (isProductImage) {
        if (file.size < PRODUCT_MIN_BYTES) {
          throw new Error('Image too small (minimum 100KB)');
        }
        if (file.size > PRODUCT_MAX_BYTES) {
          throw new Error('Image too large (maximum 800KB)');
        }
      } else if (file.size > DEFAULT_MAX_BYTES) {
        throw new Error('File too large (max 10MB)');
      }

      const hasCsrfCookie = () =>
        typeof document !== 'undefined' &&
        document.cookie
          .split('; ')
          .some((row) => row.startsWith('itm_csrf='));

      const refreshAuthCookies = async () => {
        await fetch(apiUrl('/api/auth/me'), {
          method: 'GET',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'Cache-Control': 'no-cache',
          },
        }).catch(() => null);
      };

      if (!hasCsrfCookie()) {
        await refreshAuthCookies();
      }

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const payload = {
        bucket,
        file_name: file.name,
        content_type: file.type,
        data_url: dataUrl,
        size: file.size,
      };
      if (options?.uploadPurpose) payload.upload_purpose = options.uploadPurpose;
      if (options?.documentType) payload.document_type = options.documentType;

      const doUpload = () =>
        fetchVendorJson('/api/vendors/me/upload', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

      let res;
      try {
        res = await doUpload();
      } catch (error) {
        const msg = String(error?.message || '').toLowerCase();
        const shouldRetry =
          msg.includes('csrf') ||
          msg.includes('unauthorized') ||
          msg.includes('forbidden');

        if (!shouldRetry) throw error;

        await refreshAuthCookies();
        res = await doUpload();
      }

      if (!res?.publicUrl) {
        throw new Error('Upload failed');
      }

      return res.publicUrl;
    }
  },

  // --- ✅ NOTIFICATIONS API ---
  notifications: {
    list: async (limit = 8, filters = {}) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let query = supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id);

      if (filters.type) query = query.eq('type', filters.type);
      if (filters.isRead !== undefined) query = query.eq('is_read', filters.isRead);

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },

    get: async (id) => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },

    create: async (notification) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('notifications')
        .insert([{
          user_id: user.id,
          ...notification,
          is_read: false,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    unreadCount: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;

      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;
      return count || 0;
    },

    countByType: async (type) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;

      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('type', type);

      if (error) throw error;
      return count || 0;
    },

    markAsRead: async (id) => {
      const { data, error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    markAsUnread: async (id) => {
      const { data, error } = await supabase
        .from('notifications')
        .update({ is_read: false })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    markAllAsRead: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;
    },

    markAllAsUnread: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('notifications')
        .update({ is_read: false })
        .eq('user_id', user.id);

      if (error) throw error;
    },

    deleteById: async (id) => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },

    deleteByType: async (type) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id)
        .eq('type', type);
      if (error) throw error;
    },

    deleteAllRead: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id)
        .eq('is_read', true);
      if (error) throw error;
    },

    deleteAll: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id);
      if (error) throw error;
    }
  },

  // --- VENDOR PROFILE API ---
  getVendorProfile: async (userId) => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  updateVendorProfile: async (userId, updates) => {
    const { data, error } = await supabase
      .from('vendors')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // --- VENDOR DOCUMENTS API ---
  documents: {
    upload: async (file, type) => {
      if (!file) throw new Error('No file provided');
      const normalizedType = String(type || '').trim().toUpperCase();
      const allowedTypes = new Set(['GST', 'PAN', 'AADHAR', 'BANK']);
      if (!allowedTypes.has(normalizedType)) {
        throw new Error('Invalid document type');
      }

      const minSize = 100 * 1024;
      const maxSize = 2 * 1024 * 1024;
      const fileSize = Number(file.size || 0);
      if (fileSize < minSize) {
        throw new Error('Image too small (minimum 100KB)');
      }
      if (fileSize > maxSize) {
        throw new Error('Image too large (maximum 2MB)');
      }

      const ext = String(file.name || '').toLowerCase().split('.').pop();
      const contentType = String(file.type || '').toLowerCase();
      const allowedMime = new Set([
        'image/jpeg',
        'image/jpg',
        'image/png',
      ]);
      const allowedExt = new Set(['jpg', 'jpeg', 'png']);
      const mimeOk = !contentType || allowedMime.has(contentType);
      const extOk = !ext || allowedExt.has(ext);
      if (!mimeOk || !extOk) {
        throw new Error('Unsupported file type. Please upload JPG/PNG only.');
      }

      const existingDocs = await vendorApi.documents.list();
      const hasSameType = (existingDocs || []).some(
        (doc) => String(doc?.document_type || '').toUpperCase() === normalizedType
      );
      if (!hasSameType && (existingDocs || []).length >= 4) {
        throw new Error('Only 4 KYC documents are allowed (GST, PAN, AADHAR, BANK)');
      }

      // Upload via backend endpoint to bypass storage RLS restrictions.
      const publicUrl = await vendorApi.auth.uploadImage(file, 'avatars', {
        uploadPurpose: 'KYC_DOCUMENT',
        documentType: normalizedType,
      });

      const { document } = await fetchVendorJson('/api/vendors/me/documents', {
        method: 'POST',
        body: JSON.stringify({
          document_type: normalizedType,
          document_url: publicUrl,
          original_name: file.name,
        }),
      });

      return document;
    },

    list: async (filters = {}) => {
      const params = new URLSearchParams();
      if (filters.type) params.set('type', filters.type);
      if (filters.status) params.set('status', filters.status);
      const query = params.toString();

      const { documents } = await fetchVendorJson(
        `/api/vendors/me/documents${query ? `?${query}` : ''}`
      );
      return documents || [];
    },

    getByType: async (type) => {
      return vendorApi.documents.list({ type });
    },

    getById: async (id) => {
      const { document } = await fetchVendorJson(`/api/vendors/me/documents/${id}`);
      return document;
    },

    updateVerificationStatus: async (id, status) => {
      const validStatuses = ['PENDING', 'VERIFIED', 'REJECTED'];
      if (!validStatuses.includes(status)) throw new Error(`Invalid status: ${status}`);

      const { data, error } = await supabase
        .from('vendor_documents')
        .update({ verification_status: status })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    getPendingDocuments: async () => {
      return vendorApi.documents.list({ status: 'PENDING' });
    },

    getVerifiedDocuments: async () => {
      return vendorApi.documents.list({ status: 'VERIFIED' });
    },

    delete: async (id) => {
      await fetchVendorJson(`/api/vendors/me/documents/${id}`, { method: 'DELETE' });
    },

    deleteByType: async (type) => {
      const params = new URLSearchParams({ type });
      await fetchVendorJson(`/api/vendors/me/documents?${params.toString()}`, { method: 'DELETE' });
    }
  },

  // --- VENDOR CONTACT PERSONS API ---
  contactPersons: {
    list: async () => {
      const vendorId = await getVendorId();
      const { data, error } = await supabase
        .from('vendor_contact_persons')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    get: async (id) => {
      const { data, error } = await supabase
        .from('vendor_contact_persons')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },

    getPrimary: async () => {
      const vendorId = await getVendorId();
      const { data, error } = await supabase
        .from('vendor_contact_persons')
        .select('*')
        .eq('vendor_id', vendorId)
        .eq('is_primary', true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    create: async (contactData) => {
      const vendorId = await getVendorId();

      // Validate email format if provided
      if (contactData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactData.email)) {
        throw new Error('Invalid email format');
      }

      // If this is marked as primary, unset other primary contacts
      if (contactData.is_primary) {
        const { error: updateErr } = await supabase
          .from('vendor_contact_persons')
          .update({ is_primary: false })
          .eq('vendor_id', vendorId);
        if (updateErr) throw updateErr;
      }

      const { data, error } = await supabase
        .from('vendor_contact_persons')
        .insert([{
          ...contactData,
          vendor_id: vendorId,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    update: async (id, updates) => {
      // Validate email format if provided
      if (updates.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
        throw new Error('Invalid email format');
      }

      const { data: contact, error: getErr } = await supabase
        .from('vendor_contact_persons')
        .select('vendor_id')
        .eq('id', id)
        .single();
      if (getErr) throw getErr;

      // If setting as primary, unset other primary contacts
      if (updates.is_primary) {
        const { error: updateErr } = await supabase
          .from('vendor_contact_persons')
          .update({ is_primary: false })
          .eq('vendor_id', contact.vendor_id)
          .neq('id', id);
        if (updateErr) throw updateErr;
      }

      const { data, error } = await supabase
        .from('vendor_contact_persons')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    setPrimary: async (id) => {
      const { data: contact, error: getErr } = await supabase
        .from('vendor_contact_persons')
        .select('vendor_id')
        .eq('id', id)
        .single();
      if (getErr) throw getErr;

      // Unset all other primary contacts
      const { error: updateErr } = await supabase
        .from('vendor_contact_persons')
        .update({ is_primary: false })
        .eq('vendor_id', contact.vendor_id)
        .neq('id', id);
      if (updateErr) throw updateErr;

      // Set this one as primary
      const { data, error } = await supabase
        .from('vendor_contact_persons')
        .update({ is_primary: true })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    delete: async (id) => {
      const { data: contact, error: getErr } = await supabase
        .from('vendor_contact_persons')
        .select('is_primary, vendor_id')
        .eq('id', id)
        .single();
      if (getErr) throw getErr;

      // If deleting primary contact, set another as primary
      if (contact?.is_primary) {
        const { data: otherContact, error: listErr } = await supabase
          .from('vendor_contact_persons')
          .select('id')
          .eq('vendor_id', contact.vendor_id)
          .neq('id', id)
          .limit(1)
          .maybeSingle();
        if (listErr) throw listErr;

        if (otherContact?.id) {
          const { error: setErr } = await supabase
            .from('vendor_contact_persons')
            .update({ is_primary: true })
            .eq('id', otherContact.id);
          if (setErr) throw setErr;
        }
      }

      const { error } = await supabase.from('vendor_contact_persons').delete().eq('id', id);
      if (error) throw error;
    }
  },

  // --- VENDOR MESSAGES API ---
  messages: {
    list: async () => {
      const vendorId = await getVendorId();
      const { data, error } = await supabase
        .from('vendor_messages')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    markAsRead: async (id) => {
      const { error } = await supabase
        .from('vendor_messages')
        .update({ is_read: true })
        .eq('id', id);
      if (error) throw error;
    },

    sendReply: async (id) => {
      const { error } = await supabase
        .from('vendor_messages')
        .update({ is_replied: true })
        .eq('id', id);
      if (error) throw error;
      return true;
    },

    delete: async (id) => {
      const { error } = await supabase.from('vendor_messages').delete().eq('id', id);
      if (error) throw error;
    }
  },

  // --- PRODUCTS API ---
  products: {
    list: async (filters = {}) => {
      const vendorId = await getVendorId();
      let query = supabase
        .from('products')
        .select('*')
        .eq('vendor_id', vendorId);

      if (filters.status) query = query.eq('status', filters.status);
      if (filters.category) query = query.eq('micro_category_id', filters.category);

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    listByStatus: async (status = 'ACTIVE') => {
      const vendorId = await getVendorId();
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('vendor_id', vendorId)
        .eq('status', status)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    get: async (id) => {
      // Avoid broken relationships in cache: select plain columns only
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Product not found');
      return data;
    },

    create: async (productData) => {
      const vendorId = await getVendorId();
      const slug = generateUniqueSlug(productData.name);

      const insertData = {
        ...productData,
        vendor_id: vendorId,
        slug,
        status: productData.status || 'DRAFT',
        views: 0,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('products')
        .insert([insertData])
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    update: async (id, updates) => {
      const updateData = { ...updates };
      if (updates.name) updateData.slug = generateUniqueSlug(updates.name);
      updateData.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('products')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    updateStatus: async (id, status) => {
      const validStatuses = ['ACTIVE', 'DRAFT', 'ARCHIVED'];
      if (!validStatuses.includes(status)) throw new Error(`Invalid status: ${status}`);

      const { data, error } = await supabase
        .from('products')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    delete: async (id) => {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
    },

    addImage: async (productId, file) => {
      const fileExt = file.name.split('.').pop();
      const fileName = `products/${productId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: false });

      if (uploadError) throw new Error(`Failed to upload image: ${uploadError.message}`);

      const { data: publicUrl } = supabase.storage.from('avatars').getPublicUrl(fileName);

      const { data: product, error: getError } = await supabase
        .from('products')
        .select('images')
        .eq('id', productId)
        .single();

      if (getError) throw getError;

      const currentImages = product?.images || [];
      const newImages = [...currentImages, { url: publicUrl.publicUrl, uploaded_at: new Date().toISOString() }];

      const { data, error } = await supabase
        .from('products')
        .update({ images: newImages })
        .eq('id', productId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    removeImage: async (productId, imageUrl) => {
      const { data: product, error: getError } = await supabase
        .from('products')
        .select('images')
        .eq('id', productId)
        .single();

      if (getError) throw getError;

      const updatedImages = (product?.images || []).filter(img => img.url !== imageUrl);

      const { data, error } = await supabase
        .from('products')
        .update({ images: updatedImages })
        .eq('id', productId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    incrementViews: async (id) => {
      const { data: product, error: getError } = await supabase
        .from('products')
        .select('views')
        .eq('id', id)
        .single();

      if (getError) throw getError;

      const newViews = (product?.views || 0) + 1;
      const { error } = await supabase
        .from('products')
        .update({ views: newViews })
        .eq('id', id);

      if (error) throw error;
    },

    getAllMicroCategories: async () => {
      const { data, error } = await supabase
        .from('micro_categories')
        .select(`
          id, name, slug, description,
          sub_categories(id, name, slug, head_categories(id, name, slug))
        `)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data || [];
    },

    matchCategory: async (name) => {
      if (!name || name.length < 3) return null;

      const cleanName = String(name || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const { extractKeywords, findBestMatchingCategory, isStrongMatch } = await import('@/shared/utils/categoryMatcher');
      const keywords = extractKeywords(cleanName);
      const primaryPhrase = keywords.slice(0, 3).join(' ');
      const searchPhrase = primaryPhrase || cleanName;

      const { data: exactMatch, error: e1 } = await supabase
        .from('micro_categories')
        .select(`
          id, name, slug,
          sub_categories(id, name, slug, head_categories(id, name, slug))
        `)
        .ilike('name', `${searchPhrase}%`)
        .limit(1)
        .maybeSingle();

      if (e1) throw e1;

      if (exactMatch) {
        return {
          confidence: 95,
          micro_category_id: exactMatch.id,
          name: exactMatch.name,
          slug: exactMatch.slug,
          sub_category_id: exactMatch.sub_categories?.id,
          head_category_id: exactMatch.sub_categories?.head_categories?.id,
          path: `${exactMatch.sub_categories?.head_categories?.name} > ${exactMatch.sub_categories?.name} > ${exactMatch.name}`,
          matchScore: 95
        };
      }

      try {
        let candidates = [];

        if (searchPhrase) {
          const { data: phraseMatch } = await supabase
            .from('micro_categories')
            .select(`
              id, name, slug,
              sub_categories(id, name, slug, head_categories(id, name, slug))
            `)
            .eq('is_active', true)
            .ilike('name', `%${searchPhrase}%`)
            .limit(10);
          candidates = phraseMatch || [];
        }

        if (!candidates.length && keywords.length) {
          const orFilter = keywords.slice(0, 4).map((k) => `name.ilike.%${k}%`).join(',');
          const { data: keywordHits } = await supabase
            .from('micro_categories')
            .select(`
              id, name, slug,
              sub_categories(id, name, slug, head_categories(id, name, slug))
            `)
            .eq('is_active', true)
            .or(orFilter)
            .limit(120);
          candidates = keywordHits || [];
        }

        if (!candidates.length) {
          const { data: allCategories } = await supabase
            .from('micro_categories')
            .select(`
              id, name, slug,
              sub_categories(id, name, slug, head_categories(id, name, slug))
            `)
            .eq('is_active', true)
            .limit(1200);
          candidates = allCategories || [];
        }

        if (candidates.length) {
          const match = findBestMatchingCategory(cleanName, candidates);
          if (match) {
            const category = match.category;
            const score = match.score;
            return {
              confidence: Math.round(score * 100),
              micro_category_id: category.id,
              name: category.name,
              slug: category.slug,
              sub_category_id: category.sub_categories?.id,
              head_category_id: category.sub_categories?.head_categories?.id,
              path: `${category.sub_categories?.head_categories?.name} > ${category.sub_categories?.name} > ${category.name}`,
              matchScore: Math.round(score * 100),
              isStrong: isStrongMatch(score),
              matchType: 'micro',
            };
          }
        }

        // Sub-category fallback (if micro not found)
        let subCandidates = [];
        if (searchPhrase) {
          const { data: subPhrase } = await supabase
            .from('sub_categories')
            .select('id, name, slug, head_categories(id, name, slug)')
            .eq('is_active', true)
            .ilike('name', `%${searchPhrase}%`)
            .limit(10);
          subCandidates = subPhrase || [];
        }

        if (!subCandidates.length && keywords.length) {
          const orFilter = keywords.slice(0, 4).map((k) => `name.ilike.%${k}%`).join(',');
          const { data: subKeywordHits } = await supabase
            .from('sub_categories')
            .select('id, name, slug, head_categories(id, name, slug)')
            .eq('is_active', true)
            .or(orFilter)
            .limit(120);
          subCandidates = subKeywordHits || [];
        }

        if (!subCandidates.length) {
          const { data: allSubs } = await supabase
            .from('sub_categories')
            .select('id, name, slug, head_categories(id, name, slug)')
            .eq('is_active', true)
            .limit(800);
          subCandidates = allSubs || [];
        }

        if (!subCandidates.length) return null;

        const subMatch = findBestMatchingCategory(cleanName, subCandidates);
        if (!subMatch) return null;

        const subCategory = subMatch.category;
        const subScore = subMatch.score;
        return {
          confidence: Math.round(subScore * 100),
          micro_category_id: null,
          name: subCategory.name,
          slug: subCategory.slug,
          sub_category_id: subCategory.id,
          head_category_id: subCategory.head_categories?.id,
          path: `${subCategory.head_categories?.name} > ${subCategory.name}`,
          matchScore: Math.round(subScore * 100),
          isStrong: isStrongMatch(subScore),
          matchType: 'sub',
        };
      } catch (e) {
        console.error('Category match error:', e);
        return null;
      }
    }
  },

  // --- PROPOSALS API ---
  proposals: {
    list: async (type = 'received') => {
      const rawType = String(type || 'received').toLowerCase();
      const safeType = rawType === 'sent' || rawType === 'all' ? rawType : 'received';

      const filterByType = (rows = []) => {
        const list = Array.isArray(rows) ? rows : [];
        if (safeType === 'all') return list;
        if (safeType === 'sent') {
          const byBuyerEmail = list.filter((row) => Boolean(String(row?.buyer_email || '').trim()));
          if (byBuyerEmail.length > 0) return byBuyerEmail;
          return list.filter((row) => String(row?.status || '').toUpperCase() === 'SENT');
        }
        return list.filter((row) => !String(row?.buyer_email || '').trim());
      };

      try {
        const query = new URLSearchParams({ type: safeType }).toString();
        const response = await fetchVendorJson(`/api/vendors/me/proposals?${query}`);
        if (Array.isArray(response?.proposals)) {
          const hydrated = await enrichProposalBuyerMeta(response.proposals);
          const typedRows = filterByType(hydrated);
          if (typedRows.length > 0 || safeType === 'all') {
            return typedRows;
          }

          // Some deployments return empty for specific type even when rows exist in "all".
          try {
            const allResponse = await fetchVendorJson('/api/vendors/me/proposals?type=all');
            if (Array.isArray(allResponse?.proposals)) {
              const allHydrated = await enrichProposalBuyerMeta(allResponse.proposals);
              const filteredAll = filterByType(allHydrated);
              if (filteredAll.length > 0) return filteredAll;
            }
          } catch {
            // ignore all-type fallback errors
          }
        }
      } catch (e) {
        console.warn('[vendorApi.proposals.list] backend fetch failed, falling back:', e?.message || e);
      }

      // Additional production-safe fallback for sent quotations.
      if (safeType === 'sent' || safeType === 'all') {
        try {
          const sentResponse = await fetchVendorJson('/api/quotation/sent');
          if (Array.isArray(sentResponse?.quotations) && sentResponse.quotations.length > 0) {
            const hydratedSent = await enrichProposalBuyerMeta(sentResponse.quotations);
            if (safeType === 'sent') return hydratedSent;
            if (safeType === 'all') return hydratedSent;
          }
        } catch (e) {
          console.warn('[vendorApi.proposals.list] quotation sent fallback failed:', e?.message || e);
        }
      }

      // Client fallback (older installs / temporary backend mismatch).
      const vendorId = await getVendorId();
      const { data, error } = await supabase
        .from('proposals')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      return enrichProposalBuyerMeta(filterByType(rows));
    },

    create: async (quotationData) => {
      const vendorId = await getVendorId();
      const { data, error } = await supabase
        .from('proposals')
        .insert([{
          vendor_id: vendorId,
          title: quotationData.title || quotationData.quotation_title,
          product_name: quotationData.product_name || quotationData.quotation_title,
          quantity: quotationData.quantity || null,
          budget: quotationData.budget || quotationData.quotation_amount,
          description: quotationData.description || quotationData.terms_conditions || '',
          status: quotationData.status || 'SENT',
          buyer_id: quotationData.buyer_id || null
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    get: async (id) => {
      try {
        const response = await fetchVendorJson(`/api/vendors/me/proposals/${id}`);
        if (response?.proposal) return response.proposal;
      } catch (e) {
        console.warn('[vendorApi.proposals.get] backend fetch failed, falling back:', e?.message || e);
      }

      const vendorId = await getVendorId();
      let { data, error } = await supabase
        .from('proposals')
        .select('*, buyers(full_name, email, phone, company_name)')
        .eq('vendor_id', vendorId)
        .eq('id', id)
        .maybeSingle();
      if (error) {
        ({ data, error } = await supabase
          .from('proposals')
          .select('*')
          .eq('vendor_id', vendorId)
          .eq('id', id)
          .maybeSingle());
      }
      if (error) throw error;
      return data;
    },

    delete: async (id) => {
      try {
        await fetchVendorJson(`/api/vendors/me/proposals/${id}`, { method: 'DELETE' });
        return true;
      } catch (e) {
        console.warn('[vendorApi.proposals.delete] backend delete failed, falling back:', e?.message || e);
      }

      const vendorId = await getVendorId();
      const { error } = await supabase
        .from('proposals')
        .delete()
        .eq('id', id)
        .eq('vendor_id', vendorId);
      if (error) throw error;
      return true;
    }
  },

  // --- LEADS API ---
  leads: {
    getMarketplaceLeads: async () => {
      const vendorId = await getVendorId();
      const { data: purchased, error: pErr } = await supabase
        .from('lead_purchases')
        .select('lead_id')
        .eq('vendor_id', vendorId);

      if (pErr) throw pErr;

      const purchasedIds = purchased?.map(p => p.lead_id) || [];

      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('status', 'ACTIVE')
        .neq('vendor_id', vendorId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []).filter(l => !purchasedIds.includes(l.id));
    },

    getMyLeads: async () => {
      try {
        const { leads } = await fetchVendorJson('/api/vendors/me/leads');
        if (Array.isArray(leads)) return leads;
      } catch (e) {
        console.warn('[vendorApi.leads.getMyLeads] backend fetch failed, falling back:', e?.message || e);
      }

      const vendorId = await getVendorId();

      const { data: purchases, error: pError } = await supabase
        .from('lead_purchases')
        .select('*, lead:leads(*)')
        .eq('vendor_id', vendorId);

      if (pError) throw pError;

      const { data: direct, error: dError } = await supabase
        .from('leads')
        .select('*')
        .eq('vendor_id', vendorId);

      if (dError) throw dError;

      const { data: proposals, error: propError } = await supabase
        .from('proposals')
        .select('*, buyer:buyers(full_name, company_name)')
        .eq('vendor_id', vendorId)
        .eq('status', 'SENT')
        .order('created_at', { ascending: false });

      if (propError) console.error('Error fetching proposals:', propError);

      const purchasedLeads = (purchases || []).map(p => ({ ...p.lead, source: 'Purchased', purchase_date: p.purchase_date }));
      const directLeads = (direct || []).map(l => ({ ...l, source: 'Direct', purchase_date: l.created_at }));
      const directProposals = (proposals || []).map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        category: 'Proposal',
        status: 'AVAILABLE',
        source: 'Direct Proposal',
        purchase_date: p.created_at,
        created_at: p.created_at,
        buyer_name: p.buyer?.full_name || 'Unknown Buyer',
        buyer_company: p.buyer?.company_name,
        quantity: p.quantity,
        budget: p.budget,
        required_by_date: p.required_by_date
      }));

      return [...purchasedLeads, ...directLeads, ...directProposals].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    },

    purchase: async (leadId) => {
      const vendorId = await getVendorId();
      const { data: lead, error: lErr } = await supabase.from('leads').select('price').eq('id', leadId).single();
      if (lErr) throw lErr;

      const { data, error } = await supabase
        .from('lead_purchases')
        .insert([{
          vendor_id: vendorId,
          lead_id: leadId,
          amount: lead?.price || 0,
          payment_status: 'COMPLETED',
          purchase_date: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  // --- DASHBOARD STATS ---
  dashboard: {
    getStats: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: vendor, error: vendorError } = await supabase
        .from('vendors')
        .select('id, profile_completion, kyc_status, vendor_id')
        .eq('user_id', user.id)
        .single();

      if (vendorError || !vendor) {
        console.error('Vendor not found:', vendorError);
        return {
          totalProducts: 0,
          totalLeads: 0,
          totalMessages: 0,
          profileCompletion: 0,
          kycStatus: 'PENDING',
          trustScore: 0,
          rating: 0
        };
      }

      const [products, leads, proposals, messages] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact' }).eq('vendor_id', vendor.id).limit(1),
        supabase.from('leads').select('*', { count: 'exact' }).eq('vendor_id', vendor.id).eq('status', 'AVAILABLE').limit(1),
        supabase.from('proposals').select('*', { count: 'exact' }).eq('vendor_id', vendor.id).eq('status', 'SENT').limit(1),
        supabase.from('vendor_messages').select('*', { count: 'exact' }).eq('vendor_id', vendor.id).limit(1)
      ]);

      return {
        totalProducts: products.count || 0,
        totalLeads: (leads.count || 0) + (proposals.count || 0),
        totalMessages: messages.count || 0,
        profileCompletion: vendor.profile_completion || 0,
        kycStatus: vendor.kyc_status || 'PENDING',
        trustScore: 0,
        rating: 0,
        vendorId: vendor.vendor_id
      };
    }
  },

  getRecentProducts: async (userId) => {
    const { data: vendor, error: vErr } = await supabase.from('vendors').select('id').eq('user_id', userId).single();
    if (vErr) throw vErr;
    if (!vendor) return [];
    const { data, error } = await supabase.from('products').select('*').eq('vendor_id', vendor.id).order('created_at', { ascending: false }).limit(5);
    if (error) throw error;
    return data || [];
  },

  getRecentLeads: async (userId) => {
    const { data: vendor, error: vErr } = await supabase.from('vendors').select('id').eq('user_id', userId).single();
    if (vErr) throw vErr;
    if (!vendor) return [];
    const { data, error } = await supabase.from('leads').select('*').eq('vendor_id', vendor.id).order('created_at', { ascending: false }).limit(5);
    if (error) throw error;
    return data || [];
  },

  getSupportStats: async (userId) => {
    const { data: vendor, error: vErr } = await supabase.from('vendors').select('id').eq('user_id', userId).single();
    if (vErr) throw vErr;
    if (!vendor) return { total: 0, unresolved: 0 };

    const { count, error: e1 } = await supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('vendor_id', vendor.id);
    if (e1) throw e1;

    const { count: open, error: e2 } = await supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('vendor_id', vendor.id).neq('status', 'CLOSED');
    if (e2) throw e2;

    return { total: count || 0, unresolved: open || 0 };
  },

  // --- BANKING API ---
  banking: {
    list: async () => {
      const vendorId = await getVendorId();
      const { data, error } = await supabase
        .from('vendor_bank_details')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    get: async (id) => {
      const { data, error } = await supabase
        .from('vendor_bank_details')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },

    getPrimary: async () => {
      const vendorId = await getVendorId();
      const { data, error } = await supabase
        .from('vendor_bank_details')
        .select('*')
        .eq('vendor_id', vendorId)
        .eq('is_primary', true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    add: async (bankData) => {
      const vendorId = await getVendorId();
      // Remove temporary ID before sending to database
      const { id, ...cleanData } = bankData;

      // If this is marked as primary, unset other primary accounts
      if (cleanData.is_primary) {
        const { error: updateErr } = await supabase
          .from('vendor_bank_details')
          .update({ is_primary: false })
          .eq('vendor_id', vendorId);
        if (updateErr) throw updateErr;
      }

      const { data, error } = await supabase
        .from('vendor_bank_details')
        .insert([{
          ...cleanData,
          vendor_id: vendorId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    update: async (id, updates) => {
      const { data: bankDetail, error: getErr } = await supabase
        .from('vendor_bank_details')
        .select('vendor_id')
        .eq('id', id)
        .single();
      if (getErr) throw getErr;

      // If setting as primary, unset other primary accounts
      if (updates.is_primary) {
        const { error: updateErr } = await supabase
          .from('vendor_bank_details')
          .update({ is_primary: false })
          .eq('vendor_id', bankDetail.vendor_id)
          .neq('id', id);
        if (updateErr) throw updateErr;
      }

      const { data, error } = await supabase
        .from('vendor_bank_details')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    setPrimary: async (id) => {
      const { data: bankDetail, error: getErr } = await supabase
        .from('vendor_bank_details')
        .select('vendor_id')
        .eq('id', id)
        .single();
      if (getErr) throw getErr;

      // Unset all other primary accounts
      const { error: updateErr } = await supabase
        .from('vendor_bank_details')
        .update({ is_primary: false })
        .eq('vendor_id', bankDetail.vendor_id)
        .neq('id', id);
      if (updateErr) throw updateErr;

      // Set this one as primary
      const { data, error } = await supabase
        .from('vendor_bank_details')
        .update({ is_primary: true, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    delete: async (id) => {
      const { data: bankDetail, error: getErr } = await supabase
        .from('vendor_bank_details')
        .select('is_primary')
        .eq('id', id)
        .single();
      if (getErr) throw getErr;

      // If deleting primary account, set another as primary
      if (bankDetail?.is_primary) {
        const { data: bankData, error: listErr } = await supabase
          .from('vendor_bank_details')
          .select('id')
          .neq('id', id)
          .limit(1)
          .maybeSingle();
        if (listErr) throw listErr;

        if (bankData?.id) {
          const { error: setErr } = await supabase
            .from('vendor_bank_details')
            .update({ is_primary: true })
            .eq('id', bankData.id);
          if (setErr) throw setErr;
        }
      }

      const { error } = await supabase.from('vendor_bank_details').delete().eq('id', id);
      if (error) throw error;
    }
  },

  // --- SUBSCRIPTIONS ---
  subscriptions: {
    getCurrent: async () => {
      const vendorId = await getVendorId();
      const { data, error } = await supabase
        .from('vendor_plan_subscriptions')
        .select('*, plan:vendor_plans(*)')
        .eq('vendor_id', vendorId)
        .eq('status', 'ACTIVE')
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    getHistory: async () => {
      const vendorId = await getVendorId();
      const { data, error } = await supabase
        .from('vendor_plan_subscriptions')
        .select('*, plan:vendor_plans(*)')
        .eq('vendor_id', vendorId)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    getQuota: async () => {
      const vendorId = await getVendorId();
      const { data, error } = await supabase
        .from('vendor_lead_quota')
        .select('*')
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    getAllPlans: async () => {
      const { data, error } = await supabase
        .from('vendor_plans')
        .select('*')
        .eq('is_active', true)
        .order('price', { ascending: true });
      if (error) throw error;
      return data || [];
    },

    subscribe: async (planId) => {
      const vendorId = await getVendorId();
      const { data: plan, error: planErr } = await supabase
        .from('vendor_plans')
        .select('id')
        .eq('id', planId)
        .single();
      if (planErr) throw planErr;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 365);

      const { data, error } = await supabase
        .from('vendor_plan_subscriptions')
        .insert([{
          vendor_id: vendorId,
          plan_id: planId,
          start_date: today.toISOString(),
          end_date: endDate.toISOString(),
          status: 'ACTIVE',
          plan_duration_days: 365,
          auto_renewal_enabled: false,
          renewal_notification_sent: false
        }])
        .select('*, plan:vendor_plans(*)')
        .single();
      if (error) throw error;
      return data;
    },

    renew: async (subscriptionId) => {
      const { data: currentSub, error: subErr } = await supabase
        .from('vendor_plan_subscriptions')
        .select('id, end_date')
        .eq('id', subscriptionId)
        .single();
      if (subErr) throw subErr;

      const endDate = new Date(currentSub.end_date);
      const newEndDate = new Date(endDate);
      newEndDate.setDate(newEndDate.getDate() + 365);

      const { data, error } = await supabase
        .from('vendor_plan_subscriptions')
        .update({
          end_date: newEndDate.toISOString(),
          renewal_notification_sent: false,
          renewal_notification_sent_at: null
        })
        .eq('id', subscriptionId)
        .select('*, plan:vendor_plans(*)')
        .single();
      if (error) throw error;
      return data;
    },

    cancel: async (subscriptionId) => {
      const { error } = await supabase
        .from('vendor_plan_subscriptions')
        .update({ status: 'CANCELLED' })
        .eq('id', subscriptionId);
      if (error) throw error;
    },

    updateAutoRenewal: async (subscriptionId, enabled) => {
      const { data, error } = await supabase
        .from('vendor_plan_subscriptions')
        .update({ auto_renewal_enabled: enabled })
        .eq('id', subscriptionId)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  },

  // --- LEAD QUOTA API ---
  leadQuota: {
    get: async () => {
      const vendorId = await getVendorId();
      const { data, error } = await supabase
        .from('vendor_lead_quota')
        .select('*')
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (error) throw error;

      if (!data) {
        return {
          vendor_id: vendorId,
          daily_used: 0,
          daily_limit: 0,
          weekly_used: 0,
          weekly_limit: 0,
          yearly_used: 0,
          yearly_limit: 0,
          last_reset_date: new Date().toISOString()
        };
      }
      return data;
    },

    initialize: async (planId) => {
      const vendorId = await getVendorId();
      const { data: plan, error: planErr } = await supabase
        .from('vendor_plans')
        .select('daily_limit, weekly_limit, yearly_limit')
        .eq('id', planId)
        .single();
      if (planErr) throw planErr;

      const { data: existing, error: existErr } = await supabase
        .from('vendor_lead_quota')
        .select('id')
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (existErr) throw existErr;

      const quotaData = {
        vendor_id: vendorId,
        plan_id: planId,
        daily_used: 0,
        daily_limit: plan?.daily_limit || 0,
        weekly_used: 0,
        weekly_limit: plan?.weekly_limit || 0,
        yearly_used: 0,
        yearly_limit: plan?.yearly_limit || 0,
        last_reset_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (existing?.id) {
        const { data, error } = await supabase
          .from('vendor_lead_quota')
          .update(quotaData)
          .eq('vendor_id', vendorId)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('vendor_lead_quota')
          .insert([quotaData])
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },

    incrementDaily: async () => {
      const vendorId = await getVendorId();
      const { data: quota, error: getErr } = await supabase
        .from('vendor_lead_quota')
        .select('*')
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (getErr) throw getErr;

      if (!quota) throw new Error('Quota not initialized');

      const newUsed = (quota.daily_used || 0) + 1;
      if (newUsed > quota.daily_limit) {
        throw new Error(`Daily quota exceeded: ${newUsed}/${quota.daily_limit}`);
      }

      const { data, error } = await supabase
        .from('vendor_lead_quota')
        .update({ daily_used: newUsed, updated_at: new Date().toISOString() })
        .eq('vendor_id', vendorId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    incrementWeekly: async () => {
      const vendorId = await getVendorId();
      const { data: quota, error: getErr } = await supabase
        .from('vendor_lead_quota')
        .select('*')
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (getErr) throw getErr;

      if (!quota) throw new Error('Quota not initialized');

      const newUsed = (quota.weekly_used || 0) + 1;
      if (newUsed > quota.weekly_limit) {
        throw new Error(`Weekly quota exceeded: ${newUsed}/${quota.weekly_limit}`);
      }

      const { data, error } = await supabase
        .from('vendor_lead_quota')
        .update({ weekly_used: newUsed, updated_at: new Date().toISOString() })
        .eq('vendor_id', vendorId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    incrementYearly: async () => {
      const vendorId = await getVendorId();
      const { data: quota, error: getErr } = await supabase
        .from('vendor_lead_quota')
        .select('*')
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (getErr) throw getErr;

      if (!quota) throw new Error('Quota not initialized');

      const newUsed = (quota.yearly_used || 0) + 1;
      if (newUsed > quota.yearly_limit) {
        throw new Error(`Yearly quota exceeded: ${newUsed}/${quota.yearly_limit}`);
      }

      const { data, error } = await supabase
        .from('vendor_lead_quota')
        .update({ yearly_used: newUsed, updated_at: new Date().toISOString() })
        .eq('vendor_id', vendorId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    resetDaily: async () => {
      const vendorId = await getVendorId();
      const { data, error } = await supabase
        .from('vendor_lead_quota')
        .update({ daily_used: 0, updated_at: new Date().toISOString() })
        .eq('vendor_id', vendorId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    resetWeekly: async () => {
      const vendorId = await getVendorId();
      const { data, error } = await supabase
        .from('vendor_lead_quota')
        .update({ weekly_used: 0, updated_at: new Date().toISOString() })
        .eq('vendor_id', vendorId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    resetYearly: async () => {
      const vendorId = await getVendorId();
      const { data, error } = await supabase
        .from('vendor_lead_quota')
        .update({ yearly_used: 0, last_reset_date: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('vendor_id', vendorId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    canAccessDaily: async () => {
      const vendorId = await getVendorId();
      const { data: quota, error } = await supabase
        .from('vendor_lead_quota')
        .select('daily_used, daily_limit')
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (error) throw error;

      if (!quota) return false;
      return quota.daily_used < quota.daily_limit;
    },

    canAccessWeekly: async () => {
      const vendorId = await getVendorId();
      const { data: quota, error } = await supabase
        .from('vendor_lead_quota')
        .select('weekly_used, weekly_limit')
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (error) throw error;

      if (!quota) return false;
      return quota.weekly_used < quota.weekly_limit;
    },

    canAccessYearly: async () => {
      const vendorId = await getVendorId();
      const { data: quota, error } = await supabase
        .from('vendor_lead_quota')
        .select('yearly_used, yearly_limit')
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (error) throw error;

      if (!quota) return false;
      return quota.yearly_used < quota.yearly_limit;
    }
  },

  // --- PREFERENCES API ---
  preferences: {
    get: async () => {
      const vendorId = await getVendorId();
      const { data, error } = await supabase
        .from('vendor_preferences')
        .select('*')
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (error) throw error;
      return data || {
        vendor_id: vendorId,
        preferred_micro_categories: [],
        preferred_states: [],
        preferred_cities: [],
        min_budget: 0,
        max_budget: 999999,
        auto_lead_filter: true
      };
    },

    create: async (preferencesData) => {
      const vendorId = await getVendorId();
      const { data, error } = await supabase
        .from('vendor_preferences')
        .insert([{
          vendor_id: vendorId,
          ...preferencesData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    update: async (preferencesData) => {
      const vendorId = await getVendorId();
      const { data: existing } = await supabase
        .from('vendor_preferences')
        .select('id')
        .eq('vendor_id', vendorId)
        .maybeSingle();

      if (existing?.id) {
        // Update existing
        const { data, error } = await supabase
          .from('vendor_preferences')
          .update({
            ...preferencesData,
            updated_at: new Date().toISOString()
          })
          .eq('vendor_id', vendorId)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('vendor_preferences')
          .insert([{
            vendor_id: vendorId,
            ...preferencesData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }])
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },

    updateBudgetRange: async (minBudget, maxBudget) => {
      const vendorId = await getVendorId();
      const { data, error } = await supabase
        .from('vendor_preferences')
        .update({
          min_budget: minBudget,
          max_budget: maxBudget,
          updated_at: new Date().toISOString()
        })
        .eq('vendor_id', vendorId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    addCategory: async (microCategoryId) => {
      const vendorId = await getVendorId();
      const { data: prefs, error: getErr } = await supabase
        .from('vendor_preferences')
        .select('preferred_micro_categories')
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (getErr) throw getErr;

      const categories = prefs?.preferred_micro_categories || [];
      if (!categories.includes(microCategoryId)) {
        categories.push(microCategoryId);
      }

      const { data, error } = await supabase
        .from('vendor_preferences')
        .update({
          preferred_micro_categories: categories,
          updated_at: new Date().toISOString()
        })
        .eq('vendor_id', vendorId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    removeCategory: async (microCategoryId) => {
      const vendorId = await getVendorId();
      const { data: prefs, error: getErr } = await supabase
        .from('vendor_preferences')
        .select('preferred_micro_categories')
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (getErr) throw getErr;

      const categories = (prefs?.preferred_micro_categories || []).filter(id => id !== microCategoryId);

      const { data, error } = await supabase
        .from('vendor_preferences')
        .update({
          preferred_micro_categories: categories,
          updated_at: new Date().toISOString()
        })
        .eq('vendor_id', vendorId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    addState: async (stateId) => {
      const vendorId = await getVendorId();
      const { data: prefs, error: getErr } = await supabase
        .from('vendor_preferences')
        .select('preferred_states')
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (getErr) throw getErr;

      const states = prefs?.preferred_states || [];
      if (!states.includes(stateId)) {
        states.push(stateId);
      }

      const { data, error } = await supabase
        .from('vendor_preferences')
        .update({
          preferred_states: states,
          updated_at: new Date().toISOString()
        })
        .eq('vendor_id', vendorId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    removeState: async (stateId) => {
      const vendorId = await getVendorId();
      const { data: prefs, error: getErr } = await supabase
        .from('vendor_preferences')
        .select('preferred_states')
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (getErr) throw getErr;

      const states = (prefs?.preferred_states || []).filter(id => id !== stateId);

      const { data, error } = await supabase
        .from('vendor_preferences')
        .update({
          preferred_states: states,
          updated_at: new Date().toISOString()
        })
        .eq('vendor_id', vendorId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    addCity: async (cityId) => {
      const vendorId = await getVendorId();
      const { data: prefs, error: getErr } = await supabase
        .from('vendor_preferences')
        .select('preferred_cities')
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (getErr) throw getErr;

      const cities = prefs?.preferred_cities || [];
      if (!cities.includes(cityId)) {
        cities.push(cityId);
      }

      const { data, error } = await supabase
        .from('vendor_preferences')
        .update({
          preferred_cities: cities,
          updated_at: new Date().toISOString()
        })
        .eq('vendor_id', vendorId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    removeCity: async (cityId) => {
      const vendorId = await getVendorId();
      const { data: prefs, error: getErr } = await supabase
        .from('vendor_preferences')
        .select('preferred_cities')
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (getErr) throw getErr;

      const cities = (prefs?.preferred_cities || []).filter(id => id !== cityId);

      const { data, error } = await supabase
        .from('vendor_preferences')
        .update({
          preferred_cities: cities,
          updated_at: new Date().toISOString()
        })
        .eq('vendor_id', vendorId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    toggleAutoFilter: async (enabled) => {
      const vendorId = await getVendorId();
      const { data, error } = await supabase
        .from('vendor_preferences')
        .update({
          auto_lead_filter: enabled,
          updated_at: new Date().toISOString()
        })
        .eq('vendor_id', vendorId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    getStats: async () => {
      const vendorId = await getVendorId();
      const { data: prefs } = await supabase
        .from('vendor_preferences')
        .select('preferred_states, preferred_cities, preferred_micro_categories')
        .eq('vendor_id', vendorId)
        .maybeSingle();

      if (!prefs) return { vendorsInMyState: 0, vendorsInMyCity: 0, vendorsInMyCategories: 0 };

      // Count vendors in my states
      let vendorsInState = 0;
      if (prefs.preferred_states?.length > 0) {
        const stateIds = prefs.preferred_states;
        const { count } = await supabase
          .from('vendor_preferences')
          .select('*', { count: 'exact', head: true })
          .or(stateIds.map((id) => `preferred_states.contains.${JSON.stringify([id])}`).join(','));
        vendorsInState = count || 0;
      }

      // Count vendors in my cities
      let vendorsInCity = 0;
      if (prefs.preferred_cities?.length > 0) {
        const cityIds = prefs.preferred_cities;
        const { count } = await supabase
          .from('vendor_preferences')
          .select('*', { count: 'exact', head: true })
          .or(cityIds.map((id) => `preferred_cities.contains.${JSON.stringify([id])}`).join(','));
        vendorsInCity = count || 0;
      }

      // Count vendors in my categories
      let vendorsInCategories = 0;
      if (prefs.preferred_micro_categories?.length > 0) {
        const catIds = prefs.preferred_micro_categories;
        const { count } = await supabase
          .from('vendor_preferences')
          .select('*', { count: 'exact', head: true })
          .or(catIds.map((id) => `preferred_micro_categories.contains.${JSON.stringify([id])}`).join(','));
        vendorsInCategories = count || 0;
      }

      return {
        vendorsInMyState: vendorsInState,
        vendorsInMyCity: vendorsInCity,
        vendorsInMyCategories: vendorsInCategories
      };
    }
  },

  // --- SUPPORT API ---
  support: {
    getTickets: async (filters = {}) => {
      const vendorId = await getVendorId();
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.category) params.set('category', filters.category);
      const query = params.toString();
      const response = await fetchVendorJson(
        `/api/support/vendor/${vendorId}${query ? `?${query}` : ''}`
      );
      return response?.tickets || [];
    },

    getTicketsByStatus: async (status) => {
      const validStatuses = ['OPEN', 'CLOSED', 'IN_PROGRESS'];
      if (!validStatuses.includes(status)) throw new Error(`Invalid status: ${status}`);
      return vendorApi.support.getTickets({ status });
    },

    getOpenTickets: async () => {
      return vendorApi.support.getTicketsByStatus('OPEN');
    },

    getClosedTickets: async () => {
      return vendorApi.support.getTicketsByStatus('CLOSED');
    },

    createTicket: async (ticketData) => {
      const vendorId = await getVendorId();
      const payload = {
        vendor_id: vendorId,
        subject: String(ticketData?.subject || '').trim(),
        description: String(ticketData?.description || '').trim(),
        category: String(ticketData?.category || 'General').trim() || 'General',
        priority: String(ticketData?.priority || 'MEDIUM').toUpperCase(),
        status: 'OPEN',
        attachments: Array.isArray(ticketData?.attachments) ? ticketData.attachments : [],
      };

      const response = await fetchVendorJson('/api/support/tickets', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      return response?.ticket || null;
    },

    getTicket: async (id) => {
      const response = await fetchVendorJson(`/api/support/tickets/${id}`);
      return response?.ticket || null;
    },

    deleteTicket: async (id) => {
      // Vendors can only delete their own tickets
      const vendorId = await getVendorId();
      const { error } = await supabase
        .from('support_tickets')
        .delete()
        .eq('id', id)
        .eq('vendor_id', vendorId);
      if (error) throw error;
      return true;
    },

    getTicketDetail: async (id) => {
      const [ticketResponse, messagesResponse] = await Promise.all([
        fetchVendorJson(`/api/support/tickets/${id}`),
        fetchVendorJson(`/api/support/tickets/${id}/messages`),
      ]);

      const ticket = ticketResponse?.ticket || null;
      const messages = messagesResponse?.messages || [];
      if (!ticket) throw new Error('Ticket not found');

      return { ...ticket, messages };
    },

    updateTicketStatus: async (id, status) => {
      const normalized = String(status || '').toUpperCase();
      const validStatuses = ['OPEN', 'CLOSED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'];
      if (!validStatuses.includes(normalized)) throw new Error(`Invalid status: ${status}`);

      const response = await fetchVendorJson(`/api/support/tickets/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: normalized }),
      });
      return response?.ticket || null;
    },

    updateTicketPriority: async (id, priority) => {
      const normalized = String(priority || '').toUpperCase();
      const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'URGENT'];
      if (!validPriorities.includes(normalized)) throw new Error(`Invalid priority: ${priority}`);

      const response = await fetchVendorJson(`/api/support/tickets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ priority: normalized }),
      });
      return response?.ticket || null;
    },

    closeTicket: async (id) => {
      return vendorApi.support.updateTicketStatus(id, 'CLOSED');
    },

    reopenTicket: async (id) => {
      return vendorApi.support.updateTicketStatus(id, 'OPEN');
    },

    addMessage: async (ticketId, message) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const response = await fetchVendorJson(`/api/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          message: String(message || '').trim(),
          sender_type: 'VENDOR',
          sender_id: user.id,
        }),
      });
      return response?.message || null;
    },

    getMessages: async (ticketId) => {
      const response = await fetchVendorJson(`/api/support/tickets/${ticketId}/messages`);
      return response?.messages || [];
    },

    deleteMessage: async (id) => {
      const { error } = await supabase
        .from('ticket_messages')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },

    getStats: async () => {
      const vendorId = await getVendorId();
      const { count: totalCount } = await supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', vendorId);

      const { count: openCount } = await supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', vendorId)
        .eq('status', 'OPEN');

      const { count: closedCount } = await supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', vendorId)
        .eq('status', 'CLOSED');

      const { count: inProgressCount } = await supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', vendorId)
        .eq('status', 'IN_PROGRESS');

      return {
        total: totalCount || 0,
        open: openCount || 0,
        closed: closedCount || 0,
        unresolved: (openCount || 0) + (inProgressCount || 0)
      };
    },

    sendMessage: async (ticketId, message) => {
      return vendorApi.support.addMessage(ticketId, message);
    }
  },

  // --- KYC ---
  kyc: {
    getStatus: async () => {
      const vendorId = await getVendorId();
      const { data, error } = await supabase
        .from('vendors')
        .select('kyc_status, kyc_docs')
        .eq('id', vendorId)
        .single();
      if (error) throw error;

      const docs = data?.kyc_docs || {};

      return {
        status: data?.kyc_status || 'PENDING',
        documents: {
          pan: docs.pan || false,
          gst: docs.gst || false,
          businessProof: docs.businessProof || false,
          bankProof: docs.bankProof || false
        }
      };
    },

    uploadDoc: async (type, file) => {
      const vendorId = await getVendorId();
      const fileExt = file.name.split('.').pop();
      const fileName = `vendor-kyc/${vendorId}/${type}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);

      const { data, error: e1 } = await supabase.from('vendors').select('kyc_docs').eq('id', vendorId).single();
      if (e1) throw e1;

      const currentDocs = data?.kyc_docs || {};

      const { error: e2 } = await supabase.from('vendors').update({
        kyc_docs: { ...currentDocs, [type]: true, [`${type}_url`]: publicUrl }
      }).eq('id', vendorId);

      if (e2) throw e2;
    },

    submit: async () => {
      await fetchVendorJson('/api/vendors/me/kyc/submit', { method: 'POST' });
    }
  }
};
