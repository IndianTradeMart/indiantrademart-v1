import { supabase } from '@/lib/customSupabaseClient';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';
import { resolveBuyerId, resolveBuyerProfile, getAuthUserOrThrow } from '@/modules/buyer/services/buyerSession';

// Helper to get current buyer ID from auth user
const getBuyerId = async () => {
  return resolveBuyerId({ required: true });
};

// Helper: current auth user
const getAuthUser = async () => {
  return getAuthUserOrThrow();
};

// Helper: remove undefined keys
const stripUndefined = (obj) => {
  const cleaned = { ...obj };
  Object.keys(cleaned).forEach((k) => cleaned[k] === undefined && delete cleaned[k]);
  return cleaned;
};

const MESSAGE_MARKERS = {
  edited: /^::itm_edited::$/i,
  deliveredBuyer: /^::itm_delivered_buyer::(.+)$/i,
  deliveredVendor: /^::itm_delivered_vendor::(.+)$/i,
  readBuyer: /^::itm_read_buyer::(.+)$/i,
  readVendor: /^::itm_read_vendor::(.+)$/i,
};

const normalizeProposalMessage = (row = {}) => {
  const lines = String(row?.message || '').replace(/\r\n/g, '\n').split('\n');
  const contentLines = [];
  let isEdited = false;

  for (const line of lines) {
    const trimmed = String(line || '').trim();
    if (
      MESSAGE_MARKERS.edited.test(trimmed) ||
      MESSAGE_MARKERS.deliveredBuyer.test(trimmed) ||
      MESSAGE_MARKERS.deliveredVendor.test(trimmed) ||
      MESSAGE_MARKERS.readBuyer.test(trimmed) ||
      MESSAGE_MARKERS.readVendor.test(trimmed)
    ) {
      if (MESSAGE_MARKERS.edited.test(trimmed)) {
        isEdited = true;
      }
      continue;
    }
    contentLines.push(line);
  }

  return {
    ...row,
    message: contentLines.join('\n').trimEnd(),
    is_edited: isEdited || Boolean(row?.is_edited),
  };
};

// ✅ Safe lead insert with fallback (agar leads table me buyer_id/buyer_user_id columns na ho)
const insertLeadSafely = async (leadPayload) => {
  const attempts = [];

  // Attempt 1: as-is
  attempts.push(stripUndefined({ ...leadPayload }));

  // Attempt 2: without buyer_user_id
  const a2 = { ...leadPayload };
  delete a2.buyer_user_id;
  attempts.push(stripUndefined(a2));

  // Attempt 3: without buyer_id
  const a3 = { ...leadPayload };
  delete a3.buyer_id;
  attempts.push(stripUndefined(a3));

  // Attempt 4: without both
  const a4 = { ...leadPayload };
  delete a4.buyer_id;
  delete a4.buyer_user_id;
  attempts.push(stripUndefined(a4));

  let lastError = null;

  for (let i = 0; i < attempts.length; i++) {
    const payload = attempts[i];
    const { data, error } = await supabase
      .from('leads')
      .insert([payload])
      .select()
      .single();

    if (!error) return data;

    lastError = error;
    console.warn(`[Lead Insert Attempt ${i + 1}] Failed:`, error?.message || error, payload);
  }

  throw lastError || new Error('Failed to insert lead');
};

export const buyerApi = {
  // --- AUTH & PROFILE ---
  auth: {
    me: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const buyer = await resolveBuyerProfile({ required: false });

      return { ...user, ...buyer };
    },

    logout: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
  },

  // --- PROFILE MANAGEMENT ---
  getProfile: async (buyerId) => {
    const buyer = await resolveBuyerProfile({ required: true });
    if (buyerId && buyer?.id && String(buyer.id) !== String(buyerId)) {
      throw new Error('Buyer profile mismatch');
    }
    return buyer;
  },

  updateProfile: async (updates) => {
    // Convert camelCase to snake_case for backend update payload
    const payload = {};
    for (const [key, value] of Object.entries(updates || {})) {
      if (key.includes('_') || ['id', 'user_id', 'created_at', 'updated_at'].includes(key)) {
        payload[key] = value;
      } else {
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
        payload[snakeKey] = value;
      }
    }

    const res = await fetchWithCsrf(apiUrl('/api/auth/buyer/profile'), {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.error || 'Failed to update profile');
    }
    return json?.buyer || null;
  },

  uploadAvatar: async (file) => {
    const buyerId = await getBuyerId();
    const fileExt = file.name.split('.').pop();
    const fileName = `buyer-avatars/${buyerId}_${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);

    // Update buyer profile with avatar via backend (bypasses RLS)
    await buyerApi.updateProfile({ avatar_url: data.publicUrl });

    return data.publicUrl;
  },

  // --- STATISTICS ---
  getStats: async (buyerId) => {
    if (!buyerId) {
      buyerId = await getBuyerId();
    }

    const [proposalsRes, ticketsRes, favoritesRes] = await Promise.allSettled([
      supabase
        .from('proposals')
        .select('*', { count: 'exact', head: true })
        .eq('buyer_id', buyerId)
        .eq('status', 'SENT'),
      buyerApi.getTickets(buyerId),
      buyerApi.getFavorites(buyerId),
    ]);

    const proposals =
      proposalsRes.status === 'fulfilled'
        ? (proposalsRes.value?.count || 0)
        : 0;
    const tickets =
      ticketsRes.status === 'fulfilled'
        ? (Array.isArray(ticketsRes.value)
            ? ticketsRes.value.filter((t) => String(t?.status || '').toUpperCase() !== 'CLOSED').length
            : 0)
        : 0;
    const favorites =
      favoritesRes.status === 'fulfilled'
        ? (Array.isArray(favoritesRes.value) ? favoritesRes.value.length : 0)
        : 0;

    return {
      activeProposals: proposals || 0,
      openTickets: tickets || 0,
      favoriteVendors: favorites || 0
    };
  },

  // --- PROPOSALS ---
  createProposal: async (proposalData) => {
    const normalizeVendorId = (value) => {
      const cleaned = String(value ?? '').trim();
      if (!cleaned) return null;
      const lowered = cleaned.toLowerCase();
      if (lowered === 'null' || lowered === 'undefined') return null;
      return cleaned;
    };

    const urlVendorId =
      typeof window !== 'undefined'
        ? normalizeVendorId(
            new URLSearchParams(window.location.search).get('vendorId') ||
              new URLSearchParams(window.location.search).get('vendor_id')
          )
        : null;

    const resolvedVendorId =
      normalizeVendorId(proposalData?.vendor_id) ||
      normalizeVendorId(proposalData?.vendorId) ||
      normalizeVendorId(proposalData?.selected_vendor_id) ||
      normalizeVendorId(proposalData?.selectedVendorId) ||
      urlVendorId ||
      null;

    const buyerId = await getBuyerId();
    const user = await getAuthUser();

    // Get buyer profile for contact details
    const buyerProfile = await resolveBuyerProfile({ required: false });

    // Determine buyer name and company
    const buyerName = buyerProfile?.company_name || user?.user_metadata?.full_name || user?.email || 'Buyer';
    const buyerCompany = buyerProfile?.company_name || user?.user_metadata?.full_name || '';
    const buyerEmail = user?.email || '';
    const buyerPhone = buyerProfile?.phone || buyerProfile?.mobile_number || '';

    const payload = {
      buyer_id: buyerId,
      buyer_email: null,
      vendor_id: resolvedVendorId,
      title: proposalData.title || proposalData.product_name || proposalData.category,
      product_name: proposalData.product_name || proposalData.category,
      quantity: proposalData.quantity,
      budget: parseFloat(proposalData.budget) || 0,
      required_by_date: proposalData.required_by_date || null,
      description: proposalData.description,
      status: 'SENT',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Direct vendor proposal path must go through backend API
    // to bypass RLS and ensure vendor sees it in "Received Requests".
    if (payload.vendor_id) {
      const directProposalRes = await fetchWithCsrf(apiUrl(`/api/vendors/${payload.vendor_id}/leads`), {
        method: 'POST',
        body: JSON.stringify({
          title: payload.title,
          product_name: payload.product_name,
          product_interest: payload.product_name,
          buyer_name: buyerName,
          buyer_email: buyerEmail,
          buyer_phone: buyerPhone,
          company_name: buyerCompany,
          description: payload.description,
          message: payload.description,
          quantity: payload.quantity,
          budget: payload.budget,
          category: proposalData.category || '',
          category_slug: proposalData.category_slug || '',
          location: proposalData.location || 'India',
          required_by_date: proposalData.required_by_date || null,
        }),
      });

      const directProposalJson = await directProposalRes.json().catch(() => ({}));
      if (!directProposalRes.ok || !directProposalJson?.success) {
        throw new Error(directProposalJson?.error || 'Failed to create proposal request');
      }

      const createdProposal = directProposalJson?.proposal || null;
      if (createdProposal) return createdProposal;

      return {
        id: null,
        vendor_id: payload.vendor_id,
        buyer_id: buyerId,
        title: payload.title,
        product_name: payload.product_name,
        quantity: payload.quantity,
        budget: payload.budget,
        description: payload.description,
        status: 'SENT',
        created_at: new Date().toISOString(),
      };
    }

    const { data: proposal, error: propError } = await supabase
      .from('proposals')
      .insert([payload])
      .select()
      .single();

    if (propError) throw propError;

    // ✅ Lead create (Direct lead OR Marketplace lead)
    // - Direct lead: vendor_id set
    // - Marketplace lead: vendor_id null
    const leadPayload = {
      vendor_id: payload.vendor_id || null,

      // ✅ buyer mapping (agar columns exist)
      buyer_id: buyerId,
      buyer_user_id: user?.id || null,

      title: payload.title,
      product_name: payload.product_name,
      category: proposalData.category || '',
      quantity: payload.quantity,
      budget: payload.budget,
      location: proposalData.location || 'India',
      city: proposalData.city || null,
      state: proposalData.state || null,
      message: payload.description,
      buyer_name: buyerName,
      buyer_email: buyerEmail,
      buyer_phone: buyerPhone,
      company_name: buyerCompany,
      status: 'AVAILABLE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      proposal_id: proposal.id
    };

    if (!leadPayload.buyer_name || !leadPayload.buyer_email) {
      console.warn('Lead missing buyer details:', {
        buyer_name: leadPayload.buyer_name,
        buyer_email: leadPayload.buyer_email
      });
    }

    let leadData = null;
    let createdThroughVendorLeadApi = false;

    // Prefer backend path for direct enquiry so vendor notification always triggers server-side.
    if (payload.vendor_id) {
      try {
        const directLeadRes = await fetchWithCsrf(apiUrl(`/api/vendors/${payload.vendor_id}/leads`), {
          method: 'POST',
          body: JSON.stringify({
            title: payload.title,
            product_name: payload.product_name,
            product_interest: payload.product_name,
            buyer_name: buyerName,
            buyer_email: buyerEmail,
            buyer_phone: buyerPhone,
            company_name: buyerCompany,
            description: payload.description,
            message: payload.description,
            quantity: payload.quantity,
            budget: payload.budget,
            category: proposalData.category || '',
            category_slug: proposalData.category_slug || '',
            location: proposalData.location || null,
          }),
        });
        const directLeadJson = await directLeadRes.json().catch(() => ({}));
        if (!directLeadRes.ok || !directLeadJson?.success) {
          throw new Error(directLeadJson?.error || 'Failed to create direct enquiry lead');
        }
        leadData = directLeadJson?.lead || null;
        createdThroughVendorLeadApi = true;
      } catch (directLeadError) {
        console.warn('[buyerApi.createProposal] direct lead API failed, falling back:', directLeadError?.message || directLeadError);
      }
    }

    if (!leadData) {
      try {
        leadData = await insertLeadSafely(leadPayload);
        console.log('Lead created successfully:', leadData);
      } catch (leadError) {
        console.error('Failed to create lead record:', leadError, 'Payload:', leadPayload);
        throw new Error(`Proposal created but failed to register as lead: ${leadError.message || 'Unknown error'}`);
      }
    }

    // Fallback client-side notification only when backend lead API wasn't used.
    if (payload.vendor_id && !createdThroughVendorLeadApi) {
      try {
        const { data: vendorProfile } = await supabase
          .from('vendors')
          .select('user_id, email')
          .eq('id', payload.vendor_id)
          .maybeSingle();

        let vendorUserId = vendorProfile?.user_id || null;
        if (!vendorUserId && vendorProfile?.email) {
          const { data: userRow } = await supabase
            .from('users')
            .select('id')
            .eq('email', String(vendorProfile.email).toLowerCase().trim())
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          vendorUserId = userRow?.id || null;
        }

        if (vendorUserId) {
          const notificationPayload = {
            user_id: vendorUserId,
            type: 'NEW_LEAD',
            title: 'New enquiry received',
            message: `${buyerName || 'A buyer'} sent an enquiry for ${payload.product_name || 'your listing'}`,
            link: '/vendor/leads?tab=my_leads',
            reference_id: leadData?.id || proposal?.id || null,
            is_read: false,
            created_at: new Date().toISOString(),
          };

          let { error: notifError } = await supabase
            .from('notifications')
            .insert([notificationPayload]);

          if (notifError && String(notifError?.message || '').toLowerCase().includes('reference_id')) {
            const fallbackPayload = { ...notificationPayload };
            delete fallbackPayload.reference_id;
            ({ error: notifError } = await supabase.from('notifications').insert([fallbackPayload]));
          }

          if (notifError) throw notifError;
        }
      } catch (notifErr) {
        console.warn('Vendor lead notification failed:', notifErr);
      }
    }

    return proposal;
  },

  getProposals: async (buyerId) => {
    let user = null;
    try {
      user = await getAuthUser();
    } catch {
      user = null;
    }

    if (!buyerId) {
      try {
        buyerId = await getBuyerId();
      } catch {
        buyerId = null;
      }
    }

    const email = String(user?.email || '').toLowerCase().trim();
    const merged = [];
    const seen = new Set();

    const pushRows = (rows = []) => {
      (rows || []).forEach((row) => {
        const key = String(row?.id || '');
        if (!key || seen.has(key)) return;
        seen.add(key);
        merged.push(row);
      });
    };

    const fetchSupabaseRows = async (column, value) => {
      if (!value) return;
      try {
        let { data, error } = await supabase
          .from('proposals')
          .select('*, vendors(user_id, company_name, owner_name, profile_image, email, phone, is_verified, verification_badge, kyc_status, is_active)')
          .eq(column, value)
          .order('created_at', { ascending: false });

        if (error) {
          const fallback = await supabase
            .from('proposals')
            .select('*')
            .eq(column, value)
            .order('created_at', { ascending: false });
          data = fallback.data;
          error = fallback.error;
        }

        if (error) {
          console.warn(`[buyerApi.getProposals] ${column} query failed:`, error?.message || error);
          return;
        }
        pushRows(data || []);
      } catch (err) {
        console.warn(`[buyerApi.getProposals] ${column} query threw:`, err?.message || err);
      }
    };

    await fetchSupabaseRows('buyer_id', buyerId);
    await fetchSupabaseRows('buyer_email', email);

    // Backend merge for received quotations (bypasses restrictive RLS on proposals table).
    try {
      const response = await fetchWithCsrf(apiUrl('/api/quotation/received'));
      const json = await response.json().catch(() => ({}));
      if (response.ok && Array.isArray(json?.quotations)) {
        const backendRows = json.quotations.map((row) => ({
          ...row,
          vendors: row?.vendors || row?.vendor || null,
        }));
        pushRows(backendRows);
      }
    } catch (err) {
      console.warn('[buyerApi.getProposals] backend quotation merge failed:', err?.message || err);
    }

    // Best effort vendor enrichment for plain rows.
    const missingVendorIds = Array.from(
      new Set(
        merged
          .filter((row) => !row?.vendors)
          .map((row) => String(row?.vendor_id || '').trim())
          .filter(Boolean)
      )
    );

    if (missingVendorIds.length) {
      const { data: vendors, error: vendorErr } = await supabase
        .from('vendors')
        .select('id, user_id, company_name, owner_name, profile_image, email, phone, is_verified, verification_badge, kyc_status, is_active')
        .in('id', missingVendorIds);

      if (!vendorErr && Array.isArray(vendors)) {
        const vendorMap = new Map(vendors.map((v) => [String(v.id), v]));
        for (const row of merged) {
          if (!row?.vendors && row?.vendor_id) {
            row.vendors = vendorMap.get(String(row.vendor_id)) || null;
          }
        }
      }
    }

    return merged.sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime());
  },

  // ✅ NEW: Buyer ke sent leads (direct/marketplace) fetch
  // First tries by buyer_id, then fallback by buyer_email
  getSentLeads: async (buyerId) => {
    let user = null;
    try {
      user = await getAuthUser();
    } catch {
      user = null;
    }

    if (!buyerId) {
      try {
        buyerId = await getBuyerId();
      } catch {
        buyerId = null;
      }
    }

    const email = String(user?.email || '').toLowerCase().trim();
    const merged = [];
    const seen = new Set();

    const pushRows = (rows = []) => {
      (rows || []).forEach((row) => {
        const key = String(row?.id || '');
        if (!key || seen.has(key)) return;
        seen.add(key);
        merged.push(row);
      });
    };

    if (buyerId) {
      try {
        let { data, error } = await supabase
          .from('leads')
          .select('*, vendors(user_id, company_name, profile_image)')
          .eq('buyer_id', buyerId)
          .order('created_at', { ascending: false });

        if (error) {
          const fallback = await supabase
            .from('leads')
            .select('*')
            .eq('buyer_id', buyerId)
            .order('created_at', { ascending: false });
          data = fallback.data;
          error = fallback.error;
        }

        if (!error) pushRows(data || []);
      } catch {
        // ignore
      }
    }

    if (email) {
      try {
        let { data, error } = await supabase
          .from('leads')
          .select('*, vendors(user_id, company_name, profile_image)')
          .eq('buyer_email', email)
          .order('created_at', { ascending: false });

        if (error) {
          const fallback = await supabase
            .from('leads')
            .select('*')
            .eq('buyer_email', email)
            .order('created_at', { ascending: false });
          data = fallback.data;
          error = fallback.error;
        }

        if (!error) pushRows(data || []);
      } catch {
        // ignore
      }
    }

    return merged.sort(
      (a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
    );
  },

  getProposalDetail: async (proposalId) => {
    // Prefer backend detail endpoint (works with cookie auth and legacy buyer mapping).
    try {
      const res = await fetchWithCsrf(apiUrl(`/api/quotation/received/${proposalId}`));
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.quotation) {
        return {
          ...json.quotation,
          messages: json?.quotation?.messages || [],
        };
      }
    } catch (e) {
      console.warn('[buyerApi.getProposalDetail] backend fetch failed, falling back:', e?.message || e);
    }

    let user = null;
    try {
      user = await getAuthUser();
    } catch {
      user = null;
    }

    let proposal = null;
    let propError = null;

    const withVendorRes = await supabase
      .from('proposals')
      .select('*, vendors(user_id, company_name, profile_image, phone, email)')
      .eq('id', proposalId)
      .maybeSingle();

    proposal = withVendorRes.data;
    propError = withVendorRes.error;

    if (propError) {
      const fallbackRes = await supabase
        .from('proposals')
        .select('*')
        .eq('id', proposalId)
        .maybeSingle();
      proposal = fallbackRes.data;
      propError = fallbackRes.error;
    }

    if (propError) throw propError;
    if (!proposal) throw new Error('Proposal not found');

    // Buyer guard: allow only own proposal (buyer_id OR buyer_email).
    const buyerId = await resolveBuyerId({ required: false }).catch(() => null);
    const email = String(user?.email || '').toLowerCase().trim();
    if (buyerId || email) {
      const ownerMatch =
        (buyerId && String(proposal?.buyer_id || '') === String(buyerId)) ||
        (email && String(proposal?.buyer_email || '').toLowerCase().trim() === email);
      if (!ownerMatch) {
        throw new Error('Proposal not found');
      }
    }

    if (!proposal?.vendors && proposal?.vendor_id) {
      const { data: vendorRow } = await supabase
        .from('vendors')
        .select('company_name, profile_image, phone, email')
        .eq('id', proposal.vendor_id)
        .maybeSingle();
      if (vendorRow) {
        proposal.vendors = vendorRow;
      }
    }

    const { data: messages, error: msgError } = await supabase
      .from('proposal_messages')
      .select('*')
      .eq('proposal_id', proposalId)
      .order('created_at', { ascending: true });

    if (msgError) throw msgError;

    return {
      ...proposal,
      messages: (messages || []).map((row) => normalizeProposalMessage(row))
    };
  },

  addProposalMessage: async (proposalId, message) => {
    const user = await getAuthUser();

    const { data, error } = await supabase
      .from('proposal_messages')
      .insert([{
        proposal_id: proposalId,
        sender_id: user.id,
        message: message,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  updateProposalStatus: async (proposalId, status) => {
    const { data, error } = await supabase
      .from('proposals')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', proposalId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // --- SUPPORT TICKETS ---
  createTicket: async (ticketData) => {
    const buyerId = await getBuyerId();

    const payload = {
      buyer_id: buyerId,
      subject: ticketData.subject,
      description: ticketData.description,
      priority: String(ticketData.priority || 'MEDIUM').toUpperCase(),
      status: 'OPEN',
      category: ticketData.category || 'General Inquiry',
      created_at: new Date().toISOString()
    };
    const res = await fetchWithCsrf(apiUrl('/api/support/tickets'), {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || 'Failed to create ticket');
    return json?.ticket || null;
  },

  getTickets: async (buyerId) => {
    if (!buyerId) {
      buyerId = await getBuyerId();
    }
    const res = await fetchWithCsrf(apiUrl('/api/support/tickets'));
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || 'Failed to fetch tickets');
    const rows = Array.isArray(json?.tickets) ? json.tickets : [];
    return rows
      .filter((t) => t?.buyer_id === buyerId)
      .sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0));
  },

  getTicketDetail: async (ticketId) => {
    const [ticketRes, messagesRes] = await Promise.all([
      fetchWithCsrf(apiUrl(`/api/support/tickets/${ticketId}`)),
      fetchWithCsrf(apiUrl(`/api/support/tickets/${ticketId}/messages`)),
    ]);

    const ticketJson = await ticketRes.json().catch(() => ({}));
    const msgJson = await messagesRes.json().catch(() => ({}));

    if (!ticketRes.ok) throw new Error(ticketJson?.error || 'Failed to fetch ticket');
    if (!messagesRes.ok) throw new Error(msgJson?.error || 'Failed to fetch ticket messages');

    return {
      ...(ticketJson?.ticket || {}),
      messages: Array.isArray(msgJson?.messages) ? msgJson.messages : [],
    };
  },

  updateTicketStatus: async (ticketId, status) => {
    const res = await fetchWithCsrf(apiUrl(`/api/support/tickets/${ticketId}/status`), {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || 'Failed to update ticket status');
    return json?.ticket || null;
  },

  addTicketMessage: async (ticketId, message) => {
    const user = await getAuthUser();
    const res = await fetchWithCsrf(apiUrl(`/api/support/tickets/${ticketId}/messages`), {
      method: 'POST',
      body: JSON.stringify({
        message,
        sender_id: user.id,
        sender_type: 'BUYER',
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || 'Failed to send ticket message');
    return json?.message || null;
  },

  getTicketMessages: async (ticketId) => {
    const res = await fetchWithCsrf(apiUrl(`/api/support/tickets/${ticketId}/messages`));
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || 'Failed to fetch ticket messages');
    return Array.isArray(json?.messages) ? json.messages : [];
  },

  closeTicket: async (ticketId) => {
    return buyerApi.updateTicketStatus(ticketId, 'CLOSED');
  },

  // --- FAVORITES ---
  addFavorite: async (vendorId) => {
    const buyerId = await getBuyerId();

    const { data, error } = await supabase
      .from('favorites')
      .insert([{
        buyer_id: buyerId,
        vendor_id: vendorId,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  removeFavorite: async (vendorId) => {
    const buyerId = await getBuyerId();

    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('buyer_id', buyerId)
      .eq('vendor_id', vendorId);

    if (error) throw error;
  },

  getFavorites: async (buyerId) => {
    if (!buyerId) {
      buyerId = await getBuyerId();
    }

    const { data, error } = await supabase
      .from('favorites')
      .select('*, vendors(id, user_id, company_name, email, phone, profile_image, verification_badge, seller_rating)')
      .eq('buyer_id', buyerId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  isFavorited: async (vendorId) => {
    const buyerId = await getBuyerId();

    const { data, error } = await supabase
      .from('favorites')
      .select('id')
      .eq('buyer_id', buyerId)
      .eq('vendor_id', vendorId)
      .maybeSingle();

    if (error) throw error;
    return !!data;
  },

  // --- SUGGESTIONS ---
  getSuggestions: async () => {
    const buyerId = await getBuyerId();

    const { data, error } = await supabase
      .from('suggestions')
      .select('*')
      .eq('buyer_id', buyerId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  createSuggestion: async (suggestionData) => {
    const buyerId = await getBuyerId();

    const { data, error } = await supabase
      .from('suggestions')
      .insert([{
        buyer_id: buyerId,
        subject: suggestionData.subject,
        message: suggestionData.message,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // --- DIRECTORY ---
  searchVendors: async (filters = {}) => {
    let query = supabase
      .from('vendors')
      .select('id, company_name, email, phone, profile_image, verification_badge, seller_rating, state, city');

    if (filters.state_id) {
      query = query.eq('state_id', filters.state_id);
    }
    if (filters.city_id) {
      query = query.eq('city_id', filters.city_id);
    }
    if (filters.search) {
      query = query.ilike('company_name', `%${filters.search}%`);
    }

    query = query.eq('is_active', true).eq('is_verified', true);

    const { data, error } = await query
      .order('seller_rating', { ascending: false })
      .limit(50);

    if (error) throw error;
    return data || [];
  },

  getVendorProfile: async (vendorId) => {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', vendorId)
      .single();

    if (error) throw error;
    return data;
  },

  getVendorProducts: async (vendorId) => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('vendor_id', vendorId)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }
};
