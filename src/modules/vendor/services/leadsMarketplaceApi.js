// Lead Marketplace API - Comprehensive lead discovery and purchase system
import { supabase } from '@/lib/customSupabaseClient';
import { vendorApi } from './vendorApi';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';

// ============ HELPER FUNCTIONS ============

// Calculate days remaining until plan expiry
const calculateDaysLeft = (endDate) => {
  if (!endDate) return 0;
  const end = new Date(endDate);
  const now = new Date();
  const daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  return Math.max(0, daysLeft);
};

// Check if subscription is valid and not expired
const isSubscriptionActive = (subscription) => {
  if (!subscription) return false;
  if (subscription.status !== 'ACTIVE') return false;
  // If no end_date or end_date is in future, subscription is valid
  if (!subscription.end_date) return true;
  const daysLeft = calculateDaysLeft(subscription.end_date);
  return daysLeft > 0;
};

// Get last reset date for daily quota (midnight today)
const getLastDailyReset = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

// Get last reset date for weekly quota (last Monday midnight)
const getLastWeeklyReset = () => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const lastMonday = new Date(today);
  const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  lastMonday.setDate(diff);
  lastMonday.setHours(0, 0, 0, 0);
  return lastMonday;
};

// Reset quota based on time intervals
const resetQuota = async (vendorId, quota) => {
  if (!quota) return null;
  
  const lastDaily = new Date(quota.daily_reset_at || quota.updated_at || quota.created_at);
  const lastWeekly = new Date(quota.weekly_reset_at || quota.updated_at || quota.created_at);
  const todayMidnight = getLastDailyReset();
  const lastMondayMidnight = getLastWeeklyReset();
  
  let updated = { ...quota };
  let needsUpdate = false;
  
  // Reset daily quota if day changed
  if (lastDaily < todayMidnight) {
    updated.daily_used = 0;
    updated.daily_reset_at = todayMidnight.toISOString();
    needsUpdate = true;
  }
  
  // Reset weekly quota if week changed (Monday passed)
  if (lastWeekly < lastMondayMidnight) {
    updated.weekly_used = 0;
    updated.weekly_reset_at = lastMondayMidnight.toISOString();
    needsUpdate = true;
  }
  
  // Update database if reset needed
  if (needsUpdate) {
    const { error } = await supabase
      .from('vendor_lead_quota')
      .update({
        daily_used: updated.daily_used,
        weekly_used: updated.weekly_used,
        daily_reset_at: updated.daily_reset_at,
        weekly_reset_at: updated.weekly_reset_at,
        updated_at: new Date().toISOString()
      })
      .eq('vendor_id', vendorId);
    
    if (error) console.error('Quota reset error:', error);
  }
  
  return updated;
};

const fetchVendorJson = async (path, options = {}) => {
  const response = await fetchWithCsrf(apiUrl(path), options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error || payload?.message || 'Request failed';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload;
};

export const leadsMarketplaceApi = {
  // ============ VENDOR PREFERENCES ============
  
  // Get vendor's preferences
  getPreferences: async () => {
    const vendor = await vendorApi.auth.me();
    if (!vendor?.id) throw new Error('Vendor not found');
    
    const { data, error } = await supabase
      .from('vendor_preferences')
      .select('*')
      .eq('vendor_id', vendor.id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  },

  // Save/update vendor preferences
  savePreferences: async (preferences) => {
    const vendor = await vendorApi.auth.me();
    if (!vendor?.id) throw new Error('Vendor not found');

    const { data: existing } = await supabase
      .from('vendor_preferences')
      .select('id')
      .eq('vendor_id', vendor.id)
      .maybeSingle();

    const payloadData = {
      vendor_id: vendor.id,
      preferred_micro_categories: preferences.preferred_micro_categories || [],
      preferred_states: preferences.preferred_states || [],
      preferred_cities: preferences.preferred_cities || [],
      min_budget: preferences.min_budget || 0,
      max_budget: preferences.max_budget || 999999,
      auto_lead_filter: preferences.auto_lead_filter !== false,
      updated_at: new Date().toISOString()
    };

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from('vendor_preferences')
        .update(payloadData)
        .eq('vendor_id', vendor.id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      payloadData.created_at = new Date().toISOString();
      const { data, error } = await supabase
        .from('vendor_preferences')
        .insert([payloadData])
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    return result;
  },

  // ============ LEAD DISCOVERY & FILTERING ============

  // Get available leads filtered by vendor preferences
  getAvailableLeads: async (filters = {}) => {
    const vendor = await vendorApi.auth.me();
    if (!vendor?.id) throw new Error('Vendor not found');

    // Get vendor preferences
    const preferences = await leadsMarketplaceApi.getPreferences();
    
    // Get vendor's quota
    let { data: quota } = await supabase
      .from('vendor_lead_quota')
      .select('*')
      .eq('vendor_id', vendor.id)
      .maybeSingle();

    // Reset quota if needed
    if (quota) {
      quota = await resetQuota(vendor.id, quota);
    }

    // ✅ Check active subscription and plan expiry
    const { data: allSubscriptions } = await supabase
      .from('vendor_plan_subscriptions')
      .select('*')
      .eq('vendor_id', vendor.id);
    
    // Find the first ACTIVE subscription
    let subData = null;
    if (allSubscriptions && allSubscriptions.length > 0) {
      subData = allSubscriptions.find(sub => sub.status === 'ACTIVE');
    }
    
    // Fetch plan separately if subscription exists
    let subscription = null;
    if (subData && subData.plan_id) {
      const { data: planData } = await supabase
        .from('vendor_plans')
        .select('*')
        .eq('id', subData.plan_id)
        .maybeSingle();
      subscription = { ...subData, plan: planData };
    } else {
      subscription = subData;
    }

    // If no active subscription, cannot view leads
    if (!isSubscriptionActive(subscription)) {
      return { 
        data: [], 
        quota, 
        subscription,
        message: 'No active subscription plan. Please subscribe to view leads.' 
      };
    }

    // Get plan limits from subscription
    const plan = subscription?.plan;
    const dailyLimit = plan?.daily_limit || 0;
    const weeklyLimit = plan?.weekly_limit || 0;
    const yearlyLimit = plan?.yearly_limit || 0;

    // Check quota limits against plan
    if (quota) {
      if (dailyLimit > 0 && quota.daily_used >= dailyLimit) {
        return { data: [], quota, subscription, message: 'Daily lead limit reached' };
      }
      if (weeklyLimit > 0 && quota.weekly_used >= weeklyLimit) {
        return { data: [], quota, subscription, message: 'Weekly lead limit reached' };
      }
      if (yearlyLimit > 0 && quota.yearly_used >= yearlyLimit) {
        return { data: [], quota, subscription, message: 'Yearly lead limit reached' };
      }
    }

    // Build filter query
    let query = supabase
      .from('leads')
      .select(`
        id, title, product_name, budget, quantity, 
        location, status, created_at, message,
        buyer_name, buyer_email, buyer_phone, company_name
      `)
      .eq('status', 'AVAILABLE')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // Last 30 days

    // Apply preferences filter if auto-filtering enabled
    if (preferences?.auto_lead_filter) {
      // Note: Since leads table doesn't have micro_category_id, we'll need to match by product_name
      // In production, you'd want to add these foreign keys to leads table
    }

    // Apply custom filters
    if (filters.budget_min) {
      query = query.gte('budget', filters.budget_min);
    }
    if (filters.budget_max) {
      query = query.lte('budget', filters.budget_max);
    }
    if (filters.search) {
      query = query.ilike('product_name', `%${filters.search}%`);
    }

    // Apply pagination
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data: data || [],
      quota,
      preferences,
      subscription,
      pagination: { page, limit, total: count }
    };
  },

  // Get lead summary (before purchase)
  getLeadSummary: async (leadId) => {
    const { data, error } = await supabase
      .from('leads')
      .select(`
        id, title, product_name, budget, quantity, location,
        created_at, company_name
      `)
      .eq('id', leadId)
      .single();

    if (error) throw error;
    return data;
  },

  // ============ LEAD PURCHASE ============

  // Purchase a lead
  purchaseLead: async (leadId, leadSnapshot = null) => {
    const vendor = await vendorApi.auth.me();
    if (!vendor?.id) throw new Error('Vendor not found');

    console.log('[TRACE] Starting purchaseLead for vendor:', vendor.id);

    const normalizedLeadId = String(leadId || '').trim();
    if (!normalizedLeadId) throw new Error('Lead not found');

    // Resolve lead: prefer fresh DB row, but safely fallback to caller snapshot
    let lead =
      leadSnapshot && String(leadSnapshot?.id || '').trim() === normalizedLeadId
        ? leadSnapshot
        : null;

    const { data: leadFromDb, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', normalizedLeadId)
      .maybeSingle();

    if (leadError && !lead) {
      throw leadError;
    }
    if (leadFromDb) {
      lead = leadFromDb;
    }
    if (!lead) {
      throw new Error('Lead no longer available');
    }

    // Lead can be purchased by multiple vendors; only block closed states.
    const status = String(lead?.status || '').toUpperCase();
    if (status && !['AVAILABLE', 'PURCHASED'].includes(status)) {
      throw new Error('Lead no longer available');
    }

    // Check if already purchased by this vendor
    const { data: alreadyPurchasedRows, error: alreadyPurchasedError } = await supabase
      .from('lead_purchases')
      .select('id')
      .eq('vendor_id', vendor.id)
      .eq('lead_id', normalizedLeadId)
      .limit(1);

    if (alreadyPurchasedError) {
      console.warn('Lead purchase pre-check failed (already purchased):', alreadyPurchasedError);
    }

    if (Array.isArray(alreadyPurchasedRows) && alreadyPurchasedRows.length > 0) {
      throw new Error('You already purchased this lead');
    }

    // Soft-check vendor cap per lead (do not block on read-policy errors)
    const { count: purchaseCount, error: countError } = await supabase
      .from('lead_purchases')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', normalizedLeadId);

    if (countError) {
      console.warn('Lead purchase count check failed:', countError);
    } else if ((purchaseCount || 0) >= 5) {
      throw new Error('This lead has reached maximum 5 vendors limit');
    }

    // ✅ Check active subscription and plan validity
    console.log('[TRACE] Querying subscriptions for vendor:', vendor.id);
    
    // Due to RLS blocking the query, fetch ALL subscriptions and filter client-side
    const { data: allSubscriptions, error: allError } = await supabase
      .from('vendor_plan_subscriptions')
      .select('*')
      .eq('vendor_id', vendor.id);
    
    console.log('[TRACE] All subscriptions query result:', { error: allError, count: allSubscriptions?.length });
    
    // Find the first ACTIVE subscription
    let subData = null;
    if (allSubscriptions && allSubscriptions.length > 0) {
      subData = allSubscriptions.find(sub => sub.status === 'ACTIVE');
      console.log('[TRACE] Found ACTIVE subscription:', { exists: !!subData, subData });
    }
    
    // If subscription exists, fetch the plan separately
    let subscription = null;
    if (subData && subData.plan_id) {
      const { data: planData } = await supabase
        .from('vendor_plans')
        .select('*')
        .eq('id', subData.plan_id)
        .maybeSingle();
      
      subscription = { ...subData, plan: planData };
      console.log('[TRACE] Plan fetched:', { planExists: !!planData, planName: planData?.name });
    } else {
      subscription = subData;
      console.log('[TRACE] No ACTIVE subscription found or missing plan_id');
    }

    console.log('[DEBUG] Subscription check:', {
      vendor_id: vendor.id,
      subscription_exists: !!subscription,
      subscription_status: subscription?.status,
      subscription_end_date: subscription?.end_date,
      subscription_plan_id: subscription?.plan_id,
      plan_exists: !!subscription?.plan,
      plan_data: subscription?.plan,
      is_subscription_null: subscription === null,
      is_subscription_undefined: subscription === undefined,
      is_active_result: isSubscriptionActive(subscription)
    });

    if (!isSubscriptionActive(subscription)) {
      console.error('[ERROR] Subscription check failed:', {
        subscription,
        vendor_id: vendor.id,
        subscription_status: subscription?.status,
        subscription_end_date: subscription?.end_date
      });
      throw new Error('No active subscription plan. Please subscribe to purchase leads.');
    }

    // Get plan limits from subscription
    const plan = subscription.plan;
    const dailyLimit = plan?.daily_limit || 0;
    const weeklyLimit = plan?.weekly_limit || 0;
    const yearlyLimit = plan?.yearly_limit || 0;

    // Get and reset quota - create if doesn't exist
    let { data: quota } = await supabase
      .from('vendor_lead_quota')
      .select('*')
      .eq('vendor_id', vendor.id)
      .maybeSingle();

    // If quota doesn't exist, create it
    if (!quota) {
      const quotaPayload = {
        vendor_id: vendor.id,
        plan_id: subscription.plan_id,
        daily_used: 0,
        weekly_used: 0,
        yearly_used: 0,
        daily_reset_at: new Date().toISOString(),
        weekly_reset_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: newQuota, error: quotaError } = await supabase
        .from('vendor_lead_quota')
        .insert([quotaPayload])
        .select()
        .maybeSingle();
      
      if (quotaError) {
        console.error('Failed to create quota:', quotaError);
        // Continue anyway - maybe quota check isn't critical
      } else {
        quota = newQuota || quotaPayload;
      }
    } else if (quota) {
      quota = await resetQuota(vendor.id, quota);
    }

    // Check quota against plan limits (only if limit > 0, meaning it's enforced)
    let withinIncludedQuota = true;
    if (quota) {
      const dailyRem = dailyLimit > 0 ? dailyLimit - (quota.daily_used || 0) : Infinity;
      const weeklyRem = weeklyLimit > 0 ? weeklyLimit - (quota.weekly_used || 0) : Infinity;
      const yearlyRem = yearlyLimit > 0 ? yearlyLimit - (quota.yearly_used || 0) : Infinity;
      const minRem = Math.min(dailyRem, weeklyRem, yearlyRem);
      withinIncludedQuota = minRem > 0;
    }

    // Calculate lead price
    // If within included quota => free; else pay-per-lead using lead.price or default ₹50
    const leadPrice = withinIncludedQuota ? 0 : (lead?.price ?? 50);

    // Prefer backend purchase endpoint (service-role path; avoids client RLS insert errors).
    const purchasePayload = {
      vendor_id: vendor.id,
      lead_id: normalizedLeadId,
      amount: leadPrice,
      payment_status: 'COMPLETED',
      purchase_date: new Date().toISOString()
    };

    let purchase = null;
    let usedBackendPurchase = false;
    try {
      const result = await fetchVendorJson(`/api/vendors/me/leads/${encodeURIComponent(normalizedLeadId)}/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: leadPrice }),
      });
      purchase = result?.purchase || null;
      usedBackendPurchase = true;
    } catch (backendError) {
      const status = Number(backendError?.status || 0);
      if (status === 401 || status === 403) {
        throw new Error(backendError?.message || 'Unauthorized');
      }
      if (status >= 400 && status < 500 && status !== 404) {
        throw backendError;
      }
      console.warn('Backend lead purchase endpoint failed, falling back to client insert:', backendError);
    }

    if (!purchase) {
      const { data: purchaseRow, error: purchaseError } = await supabase
        .from('lead_purchases')
        .insert([purchasePayload])
        .select()
        .maybeSingle();

      if (purchaseError) throw purchaseError;
      purchase = purchaseRow || null;
    }

    if (!usedBackendPurchase) {
      // Update lead status when fallback path was used.
      await supabase
        .from('leads')
        .update({ status: 'PURCHASED' })
        .eq('id', normalizedLeadId);
    }

    // Update quota (track usage even for paid extra leads)
    if (quota) {
      await supabase
        .from('vendor_lead_quota')
        .update({
          daily_used: (quota.daily_used || 0) + 1,
          weekly_used: (quota.weekly_used || 0) + 1,
          yearly_used: (quota.yearly_used || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('vendor_id', vendor.id);
    }

    if (!usedBackendPurchase) {
      try {
        const userId = vendor.user_id || (await supabase.auth.getUser()).data?.user?.id;
        if (userId) {
          await supabase.from('notifications').insert([{
            user_id: userId,
            type: 'LEAD_PURCHASED',
            title: 'Lead purchased',
            message: `You purchased a lead${lead?.product_name ? ` for ${lead.product_name}` : ''}. Contact details are now available.`,
            link: '/vendor/leads',
            is_read: false,
            created_at: new Date().toISOString()
          }]);
        }
      } catch (e) {
        console.warn('Lead purchase notification failed:', e);
      }
    }

    return purchase || { ...purchasePayload, id: null };
  },

  // ============ PURCHASED LEAD DETAILS ============

  // Get full lead details (only for purchased leads)
  getPurchasedLeadDetails: async (leadId) => {
    const vendor = await vendorApi.auth.me();
    if (!vendor?.id) throw new Error('Vendor not found');

    // Verify purchase
    const { data: purchase, error: purchaseError } = await supabase
      .from('lead_purchases')
      .select('*')
      .eq('vendor_id', vendor.id)
      .eq('lead_id', leadId)
      .maybeSingle();

    if (purchaseError) throw purchaseError;
    if (!purchase) throw new Error('You have not purchased this lead');

    // Get full lead details
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError) throw leadError;

    // Get contact history
    const { data: contacts } = await supabase
      .from('lead_contacts')
      .select('*')
      .eq('vendor_id', vendor.id)
      .eq('lead_id', leadId)
      .order('contact_date', { ascending: false });

    return {
      lead,
      purchase,
      contacts: contacts || [],
      buyer: {
        name: lead.buyer_name,
        email: lead.buyer_email,
        phone: lead.buyer_phone,
        company: lead.company_name
      }
    };
  },

  // ============ CONTACT MANAGEMENT ============

  // Log a contact attempt
  logContact: async (leadId, contactType, notes = '') => {
    const vendor = await vendorApi.auth.me();
    if (!vendor?.id) throw new Error('Vendor not found');

    // Allow contact if vendor owns the lead OR has purchased it
    const { data: leadRow } = await supabase
      .from('leads')
      .select('vendor_id')
      .eq('id', leadId)
      .maybeSingle();

    const isOwner = leadRow?.vendor_id === vendor.id;

    const { data: purchase } = await supabase
      .from('lead_purchases')
      .select('id')
      .eq('vendor_id', vendor.id)
      .eq('lead_id', leadId)
      .maybeSingle();

    if (!isOwner && !purchase) throw new Error('You have not purchased this lead');

    // Reset and load quota
    let { data: quota } = await supabase
      .from('vendor_lead_quota')
      .select('*')
      .eq('vendor_id', vendor.id)
      .maybeSingle();

    if (quota) {
      quota = await resetQuota(vendor.id, quota);
      const limits = {
        daily: quota.daily_limit || 0,
        weekly: quota.weekly_limit || 0,
        yearly: quota.yearly_limit || 0,
      };

      // Even if limits are hit, allow logging (paid extra contacts) but don't block
      const { error: quotaErr } = await supabase
        .from('vendor_lead_quota')
        .update({
          daily_used: (quota.daily_used || 0) + 1,
          weekly_used: (quota.weekly_used || 0) + 1,
          yearly_used: (quota.yearly_used || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('vendor_id', vendor.id);
      if (quotaErr) throw quotaErr;
    }

    // Create contact record
    const { data, error } = await supabase
      .from('lead_contacts')
      .insert([{
        vendor_id: vendor.id,
        lead_id: leadId,
        contact_type: contactType, // CALL, WHATSAPP, EMAIL
        status: 'PENDING',
        notes,
        contact_date: new Date().toISOString(),
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    // Notify UI to increment contacted counters
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('itm:lead_contacted', { detail: { leadId, contactType } }));
      }
    } catch (e) {
      console.error('contact event dispatch failed', e);
    }

    return data;
  },

  // Update contact status
  updateContactStatus: async (contactId, status, notes = '') => {
    const { data, error } = await supabase
      .from('lead_contacts')
      .update({
        status,
        notes,
        contact_date: new Date().toISOString()
      })
      .eq('id', contactId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Get contact history for a lead
  getContactHistory: async (leadId) => {
    const { data, error } = await supabase
      .from('lead_contacts')
      .select('*')
      .eq('lead_id', leadId)
      .order('contact_date', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // ============ LEAD HISTORY ============

  // Get all purchased leads
  getPurchasedLeads: async (filters = {}) => {
    const vendor = await vendorApi.auth.me();
    if (!vendor?.id) throw new Error('Vendor not found');

    let query = supabase
      .from('lead_purchases')
      .select(`
        id, lead_id, purchase_date, amount,
        leads (
          id, title, product_name, budget, location,
          buyer_name, buyer_email, company_name
        )
      `)
      .eq('vendor_id', vendor.id);

    // Apply filters
    if (filters.status) {
      query = query.eq('payment_status', filters.status);
    }

    // Apply sorting
    if (filters.sort_by === 'recent') {
      query = query.order('purchase_date', { ascending: false });
    } else if (filters.sort_by === 'oldest') {
      query = query.order('purchase_date', { ascending: true });
    }

    // Pagination
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data: data || [],
      pagination: { page, limit, total: count }
    };
  },

  // Get lead with contact summary
  getLeadWithContactSummary: async (leadId) => {
    const vendor = await vendorApi.auth.me();
    if (!vendor?.id) throw new Error('Vendor not found');

    // Get lead details
    const { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    // Get contacts
    const { data: contacts } = await supabase
      .from('lead_contacts')
      .select('*')
      .eq('vendor_id', vendor.id)
      .eq('lead_id', leadId);

    // Get last contact
    const lastContact = contacts && contacts.length > 0 ? contacts[0] : null;

    return {
      lead,
      totalContacts: contacts?.length || 0,
      lastContact,
      contactSummary: {
        calls: contacts?.filter(c => c.contact_type === 'CALL').length || 0,
        whatsapp: contacts?.filter(c => c.contact_type === 'WHATSAPP').length || 0,
        emails: contacts?.filter(c => c.contact_type === 'EMAIL').length || 0,
        converted: contacts?.filter(c => c.status === 'CONVERTED').length || 0
      }
    };
  },

  // ============ STATS & ANALYTICS ============

  // Get vendor's lead stats - Enhanced with daily/weekly/yearly/direct tracking
  getLeadStats: async () => {
    const vendor = await vendorApi.auth.me();
    if (!vendor?.id) throw new Error('Vendor not found');

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();

    // Daily purchased leads
    const { count: dailyPurchased } = await supabase
      .from('lead_purchases')
      .select('*', { count: 'exact', head: true })
      .eq('vendor_id', vendor.id)
      .gte('purchase_date', today);

    // Weekly purchased leads
    const { count: weeklyPurchased } = await supabase
      .from('lead_purchases')
      .select('*', { count: 'exact', head: true })
      .eq('vendor_id', vendor.id)
      .gte('purchase_date', sevenDaysAgo);

    // Yearly purchased leads
    const { count: yearlyPurchased } = await supabase
      .from('lead_purchases')
      .select('*', { count: 'exact', head: true })
      .eq('vendor_id', vendor.id)
      .gte('purchase_date', oneYearAgo);

    // Total purchased
    const { count: totalPurchased, data: allPurchases } = await supabase
      .from('lead_purchases')
      .select('amount', { count: 'exact' })
      .eq('vendor_id', vendor.id);

    // Direct leads from buyer proposals
    const { count: directLeads } = await supabase
      .from('proposals')
      .select('*', { count: 'exact', head: true })
      .eq('vendor_id', vendor.id)
      .eq('status', 'SENT');

    // Total contacted
    const { count: totalContacted } = await supabase
      .from('lead_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('vendor_id', vendor.id);

    // Converted
    const { count: converted } = await supabase
      .from('lead_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('vendor_id', vendor.id)
      .eq('status', 'CONVERTED');

    // Calculate total purchase amount
    const totalAmount = (allPurchases || []).reduce((sum, p) => sum + (p.amount || 0), 0);

    // Get quota
    const { data: quota } = await supabase
      .from('vendor_lead_quota')
      .select('*')
      .eq('vendor_id', vendor.id)
      .maybeSingle();

    return {
      daily: dailyPurchased || 0,
      weekly: weeklyPurchased || 0,
      yearly: yearlyPurchased || 0,
      direct: directLeads || 0,
      totalPurchased: totalPurchased || 0,
      totalAmount: totalAmount || 0,
      totalContacted: totalContacted || 0,
      converted: converted || 0,
      conversionRate: totalPurchased ? ((converted || 0) / totalPurchased * 100).toFixed(2) : 0,
      quota: quota || null
    };
  }
};
