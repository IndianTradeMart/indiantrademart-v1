import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/modules/vendor/context/AuthContext';
import {
  CheckCircle2,
  Zap,
  ShoppingCart,
  ShieldCheck,
  Rocket,
  Crown,
  Gem,
  Star,
  BarChart3,
  Headphones,
  MapPin,
  BadgeCheck,
} from 'lucide-react';

// ✅ shadcn dialog (if you have it)
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter as DialogFooterUI,
} from '@/components/ui/dialog';

const cx = (...arr) => arr.filter(Boolean).join(' ');

const formatINR = (v) => {
  const n = Number(v || 0);
  return n.toLocaleString('en-IN');
};

const badgeStyle = (variant) => {
  switch ((variant || '').toLowerCase()) {
    case 'green':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'blue':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'purple':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'gold':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'diamond':
      return 'bg-slate-50 text-slate-800 border-slate-200';
    case 'slate':
      return 'bg-slate-50 text-slate-700 border-slate-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
};

const planIcon = (name) => {
  const n = (name || '').toLowerCase();
  if (n.includes('trial')) return <Star className="w-5 h-5" />;
  if (n.includes('starter')) return <Zap className="w-5 h-5" />;
  if (n.includes('verified')) return <ShieldCheck className="w-5 h-5" />;
  if (n.includes('boost')) return <Rocket className="w-5 h-5" />;
  if (n.includes('silver')) return <BadgeCheck className="w-5 h-5" />;
  if (n.includes('gold')) return <Crown className="w-5 h-5" />;
  if (n.includes('dimond') || n.includes('diamond')) return <Gem className="w-5 h-5" />;
  return <Star className="w-5 h-5" />;
};

const Services = () => {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [currentSub, setCurrentSub] = useState(null);
  const [quota, setQuota] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState(null);
  const [vendorId, setVendorId] = useState(null);
  const [couponCode, setCouponCode] = useState('');
  const TRIAL_PLAN_ID = '7fee24d0-de18-44d3-a357-be7b40492a1a'; // Trial plan UUID
  const TRIAL_DURATION_DAYS = 30;

  // ✅ dialog state
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);

  // ✅ API base
  // Dev: Vite proxy can forward `/api/*` -> http://localhost:3001
  // Prod (Netlify): call same-origin `/api/*` and let `public/_redirects`
  // forward to `/.netlify/functions/*`.
  // NOTE: If someone accidentally sets VITE_API_URL="http://localhost:3001" in
  // Netlify environment vars, production will break with ERR_CONNECTION_REFUSED.
  // So we intentionally ignore localhost API_BASE unless we are on localhost.
  const API_BASE = useMemo(() => {
    const raw = (import.meta.env.VITE_API_URL || '').trim();
    if (!raw) return '';

    const isBrowser = typeof window !== 'undefined';
    const hostname = isBrowser ? window.location.hostname : '';
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

    const rawLower = raw.toLowerCase();
    const pointsToLocalhost = rawLower.includes('localhost') || rawLower.includes('127.0.0.1');

    if (!isLocalHost && pointsToLocalhost) {
      // ✅ Safe fallback for Netlify/prod: use same-origin relative calls.
      return '';
    }

    return raw.replace(/\/+$/, '');
  }, []);

  const apiUrl = (path) => {
    const p = path.startsWith('/') ? path : `/${path}`;
    return API_BASE ? `${API_BASE}${p}` : p;
  };

  const mostPopularPlanId = useMemo(() => {
    if (!plans?.length) return null;
    const paid = plans
      .filter((p) => Number(p.price || 0) > 0)
      .sort((a, b) => Number(a.price) - Number(b.price));
    if (paid.length >= 2) return paid[Math.max(0, paid.length - 2)].id;
    if (paid.length === 1) return paid[0].id;
    return plans[0].id;
  }, [plans]);

  const parsePlanMeta = (plan) => {
    const f = plan?.features;

    if (Array.isArray(f)) {
      return {
        badge: { label: plan.name, variant: 'neutral' },
        highlights: f.map(String),
        visibility: [],
        leads: [],
        support: [],
        analytics: [],
        coverage: [],
      };
    }

    if (!f || typeof f !== 'object') {
      return {
        badge: { label: plan.name, variant: 'neutral' },
        highlights: [],
        visibility: [],
        leads: [],
        support: [],
        analytics: [],
        coverage: [],
      };
    }

    const badge = f.badge || { label: plan.name, variant: 'neutral' };
    const visibility = [];
    const leads = [];
    const support = [];
    const analytics = [];
    const coverage = [];

    // Coverage
    if (typeof f.states_limit === 'number') coverage.push(`Up to ${f.states_limit} states`);
    if (typeof f.cities_limit === 'number') coverage.push(`Up to ${f.cities_limit} cities`);

    // Visibility
    if (f.listing?.highlight) visibility.push('Highlighted listing');
    if (f.listing?.featured) visibility.push('Featured listing');
    if (f.listing?.homepage_featured) visibility.push('Homepage featured');
    if (f.listing?.category_top_ranking) visibility.push('Category top ranking');
    if (f.listing?.home_category_boost) visibility.push('Category boost');
    if (typeof f.listing?.top_slots === 'number' && f.listing.top_slots > 0) {
      visibility.push(`${f.listing.top_slots} top slots`);
    }
    if (f.verification?.trust_seal) visibility.push('Trust seal');
    if (f.listing?.profile_verified_tick) visibility.push('Verified tick on profile');

    // Leads
    if (f.leads?.priority_leads) leads.push('Priority leads');
    if (f.leads?.exclusive_leads) leads.push('Exclusive leads');
    if (f.leads?.early_access_leads) leads.push('Early access leads');
    if (f.leads?.rfq_access) leads.push('RFQ access');
    if (f.leads?.direct_call_whatsapp) leads.push('Direct call/WhatsApp');

    // Support
    if (f.support?.level) support.push(`${String(f.support.level).toUpperCase()} support`);
    if (f.support?.response_sla_hours) support.push(`SLA ${f.support.response_sla_hours} hrs`);
    if (f.support?.account_manager) support.push('Dedicated account manager');

    // Analytics
    if (f.analytics?.enabled) analytics.push('Analytics dashboard');
    if (f.analytics?.export_csv) analytics.push('Export reports (CSV)');
    if (f.analytics?.campaign_insights) analytics.push('Campaign insights');
    if (f.analytics?.competitor_insights) analytics.push('Competitor insights');

    const highlights = [];
    if (badge?.label) highlights.push(`Badge: ${badge.label}`);
    if (f.verification?.kyc_required) highlights.push('KYC required');

    return { badge, highlights, visibility, leads, support, analytics, coverage };
  };

  useEffect(() => {
    const fetchVendorId = async () => {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        if (!authUser) {
          setLoading(false);
          return;
        }

        const { data: vendor, error } = await supabase
          .from('vendors')
          .select('id')
          .eq('user_id', authUser.id)
          .maybeSingle();

        if (error) throw error;
        setVendorId(vendor?.id || null);
        if (!vendor?.id) setLoading(false);
      } catch (e) {
        console.error('Error fetching vendor ID:', e);
        setLoading(false);
      }
    };

    if (user && !vendorId) fetchVendorId();
  }, [user, vendorId]);

  useEffect(() => {
    if (vendorId) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  const ensureTrialActive = async () => {
    try {
      const { data: active, error: actErr } = await supabase
        .from('vendor_plan_subscriptions')
        .select('*')
        .eq('vendor_id', vendorId)
        .eq('status', 'ACTIVE')
        .maybeSingle();
      if (!actErr && active) return active;

      // Activate trial automatically
      const start = new Date();
      const end = new Date(start.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
      const { data: trial, error: trialErr } = await supabase
        .from('vendor_plan_subscriptions')
        .insert([{
          vendor_id: vendorId,
          plan_id: TRIAL_PLAN_ID,
          start_date: start.toISOString(),
          end_date: end.toISOString(),
          status: 'ACTIVE',
          plan_duration_days: TRIAL_DURATION_DAYS,
          auto_renewal_enabled: false,
          renewal_notification_sent: false
        }])
        .select()
        .single();
      if (trialErr) throw trialErr;
      toast({ title: 'Trial Activated', description: 'Free trial plan started automatically.' });
      return trial;
    } catch (e) {
      console.error('Trial activation failed', e);
      setFatalError(e?.message || 'Trial activation failed');
      return null;
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Force fresh data from Supabase (no cache)
      const { data: plansData, error: plansErr } = await supabase
        .from('vendor_plans')
        .select('*')
        .eq('is_active', true)
        .order('price', { ascending: true });

      if (plansErr) throw plansErr;
      setPlans(plansData || []);

      // Query for ACTIVE subscription - this will get the latest one
      const { data: subs, error: subsErr } = await supabase
        .from('vendor_plan_subscriptions')
        .select('*, plan:vendor_plans(*)')
        .eq('vendor_id', vendorId)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false })
        .limit(1);

      if (subsErr) throw subsErr;
      // Get the first (most recent) active subscription
      let currentActive = subs && subs.length > 0 ? subs[0] : null;
      if (!currentActive) {
        currentActive = await ensureTrialActive();
      }
      setCurrentSub(currentActive);

      const { data: q, error: qErr } = await supabase
        .from('vendor_lead_quota')
        .select('*')
        .eq('vendor_id', vendorId)
        .maybeSingle();

      if (qErr) throw qErr;
      setQuota(q);
    } catch (e) {
      console.error('Error loading subscription data:', e);
      setFatalError(e?.message || 'Failed to load subscription data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (plan, couponOverride = couponCode) => {
    if (!vendorId) {
      toast({ title: 'Error', description: 'Vendor ID not found', variant: 'destructive' });
      return;
    }

    // Check if plan is free
    if (!plan.price || Number(plan.price) === 0) {
      // Free plan - activate directly without payment
      toast({ title: 'Processing...', description: `Subscribing to ${plan.name}` });
      try {
        if (currentSub && currentSub.id) {
          await supabase
            .from('vendor_plan_subscriptions')
            .update({ status: 'INACTIVE' })
            .eq('id', currentSub.id);
        }

        const startDate = new Date();
        const endDate = new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);

        await supabase.from('vendor_plan_subscriptions').insert({
          vendor_id: vendorId,
          plan_id: plan.id,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          status: 'ACTIVE',
          plan_duration_days: 365,
          auto_renewal_enabled: false,
          renewal_notification_sent: false
        });

        toast({ title: 'Success!', description: 'Plan activated.' });
        setDetailsOpen(false);
        setTimeout(() => {
          loadData();
        }, 500);
      } catch (e) {
        console.error('Subscription error:', e);
        toast({ title: 'Error', description: e.message, variant: 'destructive' });
        setTimeout(() => loadData(), 500);
      }
      return;
    }

    // Paid plan - initiate Razorpay payment
    initiateRazorpayPayment(plan, couponOverride);
  };
  const initiateRazorpayPayment = async (plan, couponOverride = couponCode) => {
    try {
      toast({ title: 'Processing...', description: `Initiating payment for ${plan.name}` });
      setDetailsOpen(false);
      const appliedCoupon = couponOverride?.trim ? couponOverride.trim().toUpperCase() : '';

      const response = await fetchWithCsrf(apiUrl('/api/payment/initiate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_id: vendorId,
          plan_id: plan.id,
          coupon_code: appliedCoupon || undefined,
        }),
      });

      if (!response.ok) {
        const ct = response.headers.get('content-type') || '';
        const txt = await response.text().catch(() => '');
        const looksHtml = ct.includes('text/html') || /^\s*</.test(txt);
        throw new Error(
          looksHtml
            ? `Payment API error (${response.status})`
            : (txt || `Payment API error (${response.status})`)
        );
      }
      const data = await response.json();
      const orderData = data.order;
      const keyId = data.key_id || import.meta.env.VITE_RAZORPAY_KEY_ID;

      if (!keyId) {
        toast({
          title: 'Payment Config Missing',
          description: 'Razorpay Key ID missing. Add VITE_RAZORPAY_KEY_ID in .env.local (frontend) or RAZORPAY_KEY_ID in server .env.',
          variant: 'destructive',
        });
        return;
      }

      // Load Razorpay script dynamically if not loaded
      if (!window.Razorpay) {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        script.onload = () => openRazorpayCheckout(orderData, plan, keyId, appliedCoupon);
        script.onerror = () => {
          toast({ 
            title: 'Warning', 
            description: 'Razorpay script failed to load. Retrying...', 
            variant: 'default' 
          });
          // Retry loading script after 2 seconds
          setTimeout(() => {
            const retryScript = document.createElement('script');
            retryScript.src = 'https://checkout.razorpay.com/v1/checkout.js';
            retryScript.async = true;
            retryScript.onload = () => openRazorpayCheckout(orderData, plan, keyId, appliedCoupon);
            retryScript.onerror = () => {
              toast({ 
                title: 'Error', 
                description: 'Failed to load payment system. Please try again.', 
                variant: 'destructive' 
              });
            };
            document.body.appendChild(retryScript);
          }, 2000);
        };
        document.body.appendChild(script);
      } else {
        openRazorpayCheckout(orderData, plan, keyId, appliedCoupon);
      }
    } catch (err) {
      toast({ title: 'Error', description: err?.message || 'Failed to initiate payment', variant: 'destructive' });
      console.error(err);
    }
  };

  const openRazorpayCheckout = (orderData, plan, keyId, appliedCoupon = couponCode) => {
    const options = {
      key: keyId,
      amount: orderData.amount,
      currency: orderData.currency,
      name: 'Indian Trade Mart',
      description: `Subscription: ${plan.name}`,
      order_id: orderData.id,
      prefill: {
        email: orderData.vendor_email,
      },
      handler: async (response) => {
        try {
          const verifyResponse = await fetchWithCsrf(apiUrl('/api/payment/verify'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order_id: orderData.id,
              payment_id: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              vendor_id: vendorId,
              plan_id: plan.id,
              coupon_code: appliedCoupon?.trim ? appliedCoupon.trim().toUpperCase() : undefined,
            }),
          });

          if (!verifyResponse.ok) {
            const ct = verifyResponse.headers.get('content-type') || '';
            const txt = await verifyResponse.text().catch(() => '');
            const looksHtml = ct.includes('text/html') || /^\s*</.test(txt);
            throw new Error(
              looksHtml
                ? `Payment verification failed (${verifyResponse.status})`
                : (txt || `Payment verification failed (${verifyResponse.status})`)
            );
          }
          await verifyResponse.json();

          toast({ title: 'Success!', description: 'Subscription activated! Invoice sent to your email.' });
          setTimeout(() => {
            loadData();
          }, 500);
        } catch (err) {
          toast({ title: 'Error', description: err?.message || 'Payment verification failed', variant: 'destructive' });
          console.error(err);
        }
      },
      modal: {
        ondismiss: () => {
          toast({ title: 'Payment Cancelled', description: 'Your payment was cancelled.', variant: 'destructive' });
        },
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  // Check if subscription is active and not expired
  const isSubscriptionActive = (sub) => {
    if (!sub) return false;
    if (sub.status !== 'ACTIVE') return false;
    const endDate = new Date(sub.end_date);
    return endDate > new Date();
  };

  // Calculate days remaining
  const getDaysRemaining = (sub) => {
    if (!sub?.end_date) return 0;
    const end = new Date(sub.end_date);
    const now = new Date();
    const daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return Math.max(0, daysLeft);
  };

  const buyLeads = async () => {
    if (!vendorId) {
      toast({ title: 'Error', description: 'Vendor ID not found', variant: 'destructive' });
      return;
    }

    // ✅ Check if subscription is active and not expired
    if (!isSubscriptionActive(currentSub)) {
      toast({
        title: 'No Active Subscription',
        description: 'Please subscribe to a plan to purchase additional leads.',
        variant: 'destructive'
      });
      return;
    }

    if (window.confirm('Buy 10 additional leads for ₹1500?')) {
      try {
        await supabase.from('vendor_additional_leads').insert({
          vendor_id: vendorId,
          leads_purchased: 10,
          leads_remaining: 10,
          amount_paid: 1500,
        });
        toast({ title: 'Leads Purchased', description: '10 leads added to your account.' });
        loadData();
      } catch (e) {
        toast({ title: 'Error', description: e.message, variant: 'destructive' });
      }
    }
  };

  const openPlanDetails = (plan) => {
    setSelectedPlan(plan);
    setCouponCode('');
    setDetailsOpen(true);
  };

  const fetchPaymentHistory = async () => {
    if (!vendorId) return;
    try {
      setLoadingHistory(true);
      const response = await fetchWithCsrf(apiUrl(`/api/payment/history/${vendorId}`));
      if (response.ok) {
        const data = await response.json();
        setPaymentHistory(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching payment history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleOpenPaymentHistory = async () => {
    setShowPaymentHistory(true);
    if (paymentHistory.length === 0) {
      await fetchPaymentHistory();
    }
  };

  const buildGroups = (plan) => {
    const meta = parsePlanMeta(plan);

    const groups = [
      { title: 'Visibility', icon: <Star className="w-4 h-4" />, items: meta.visibility },
      { title: 'Leads', icon: <Rocket className="w-4 h-4" />, items: meta.leads },
      { title: 'Support', icon: <Headphones className="w-4 h-4" />, items: meta.support },
      { title: 'Analytics', icon: <BarChart3 className="w-4 h-4" />, items: meta.analytics },
      { title: 'Coverage', icon: <MapPin className="w-4 h-4" />, items: meta.coverage },
    ].filter((g) => (g.items || []).length > 0);

    // ✅ small card key points (mix)
    const keyBenefits = groups.flatMap((g) => g.items.map((it) => ({ group: g.title, text: it })));

    return { meta, groups, keyBenefits };
  };

  useEffect(() => {
    const handler = (event) => {
      setFatalError(event?.error?.message || event?.message || 'Unexpected error');
      setLoading(false);
    };
    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[420px]">
        <div className="text-center">
          <Zap className="w-12 h-12 text-slate-300 mx-auto mb-2 animate-pulse" />
          <p className="text-slate-500">Loading subscription plans...</p>
          {fatalError && <p className="text-red-600 text-sm mt-2">{fatalError}</p>}
        </div>
      </div>
    );
  }

  if (!vendorId) {
    return (
      <div className="flex items-center justify-center min-h-[420px]">
        <div className="text-center text-slate-600">
          <p className="text-lg font-semibold">Vendor profile not found</p>
          <p className="text-sm text-slate-500 mt-1">Please log in as a vendor to view subscriptions.</p>
          {fatalError && <p className="text-red-600 text-sm mt-2">{fatalError}</p>}
        </div>
      </div>
    );
  }

  if (fatalError) {
    return (
      <div className="flex items-center justify-center min-h-[420px]">
        <div className="text-center text-red-600">
          <p className="text-lg font-semibold">Error loading subscriptions</p>
          <p className="text-sm mt-1">{fatalError}</p>
        </div>
      </div>
    );
  }

  const selected = selectedPlan ? buildGroups(selectedPlan) : null;
  const selectedIsCurrent = selectedPlan && currentSub?.plan_id === selectedPlan.id;
  const selectedIsPopular = selectedPlan && selectedPlan.id === mostPopularPlanId;

  if (!plans.length && !loading && !fatalError) {
    return (
      <div className="flex items-center justify-center min-h-[420px]">
        <div className="text-center text-slate-600">
          <p className="text-lg font-semibold">No subscription plans loaded</p>
          <p className="text-sm text-slate-500 mt-1">vendorId: {vendorId || 'N/A'} | currentSub: {currentSub?.plan_id || 'none'}</p>
          <p className="text-xs text-slate-400 mt-2">This is a debug fallback; if you see this, plans fetch returned empty.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="rounded-2xl border bg-white p-6 md:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Subscription Plans</h1>
            <p className="text-slate-600 mt-1">Choose a plan to get more visibility, more leads, and premium support.</p>
          </div>

          <div className="flex gap-2 items-center flex-col sm:flex-row">
            {/* ✅ Subscription Status */}
            {currentSub && (
              <div className={cx(
                'px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 whitespace-nowrap',
                isSubscriptionActive(currentSub)
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              )}>
                <Crown className="w-4 h-4" />
                {isSubscriptionActive(currentSub) ? (
                  <span>{getDaysRemaining(currentSub)} days left</span>
                ) : (
                  <span>Plan Expired</span>
                )}
              </div>
            )}

            <Button
              variant="outline"
              onClick={buyLeads}
              disabled={!isSubscriptionActive(currentSub)}
              className={cx(
                'bg-white',
                !isSubscriptionActive(currentSub) && 'opacity-50 cursor-not-allowed'
              )}
              title={!isSubscriptionActive(currentSub) ? 'Please subscribe to a plan first' : ''}
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              Buy Leads
            </Button>
            <div className="bg-slate-50 text-slate-700 text-xs border border-dashed rounded-lg px-3 py-2 w-full sm:w-auto text-center sm:text-left">
              Coupon? Tap <span className="font-semibold">Upgrade</span> on a plan to add it during checkout.
            </div>

            <Button
              variant="outline"
              onClick={handleOpenPaymentHistory}
              className="bg-white"
            >
              📄 Invoice History
            </Button>
          </div>
        </div>

        {/* Quota */}
        {quota && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { label: 'Daily', used: quota.daily_used, limit: quota.daily_limit },
              { label: 'Weekly', used: quota.weekly_used, limit: quota.weekly_limit },
              { label: 'Yearly', used: quota.yearly_used, limit: quota.yearly_limit },
            ].map((x) => (
              <div key={x.label} className="rounded-xl border bg-gradient-to-b from-slate-50 to-white p-4">
                <div className="text-xs text-slate-500 uppercase">{x.label} Usage</div>
                <div className="mt-1 text-xl font-bold text-slate-900">
                  {x.used} <span className="text-slate-400 text-sm">/ {x.limit}</span>
                </div>
                <div className="mt-2 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-900/80"
                    style={{ width: `${Math.min(100, (Number(x.used || 0) / Math.max(1, Number(x.limit || 0))) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cards (COMPACT) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {plans.map((plan) => {
          const isCurrent = currentSub?.plan_id === plan.id;
          const isPopular = plan.id === mostPopularPlanId;

          const { meta, keyBenefits } = buildGroups(plan);
          const badge = meta.badge || {};
          const badgeLabel = badge.label || plan.name;
          const badgeVariant = badge.variant || 'neutral';

          const compactBenefits = keyBenefits.slice(0, 3);
          const moreCount = Math.max(0, keyBenefits.length - compactBenefits.length);

          return (
            <Card
              key={plan.id}
              role="button"
              tabIndex={0}
              onClick={() => openPlanDetails(plan)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') openPlanDetails(plan);
              }}
              className={cx(
                'relative overflow-hidden rounded-2xl transition-all cursor-pointer outline-none',
                'bg-white border shadow-sm hover:shadow-md hover:-translate-y-[1px]',
                isPopular && !isCurrent ? 'border-blue-300 ring-1 ring-blue-100' : '',
                isCurrent ? 'border-emerald-300 ring-2 ring-emerald-200 shadow-md' : ''
              )}
            >
              {/* Top ribbon */}
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200" />
              {isPopular && !isCurrent && (
                <div className="absolute top-3 right-3 text-[11px] px-2.5 py-1 rounded-full border bg-blue-50 text-blue-700 border-blue-200 font-semibold">
                  MOST POPULAR
                </div>
              )}
              {isCurrent && (
                <div className="absolute top-3 right-3 text-[11px] px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold">
                  CURRENT PLAN
                </div>
              )}

              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl border bg-slate-50 flex items-center justify-center text-slate-900">
                      {planIcon(plan.name)}
                    </div>
                    <div>
                      <CardTitle className="text-base">{plan.name}</CardTitle>
                      <div
                        className={cx(
                          'mt-1 inline-flex items-center gap-2 text-[11px] px-2 py-1 rounded-full border font-medium',
                          badgeStyle(badgeVariant)
                        )}
                      >
                        {badgeLabel}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-extrabold text-slate-900">
                      ₹{formatINR(plan.price)}
                      <span className="text-xs font-medium text-slate-500">/year</span>
                    </div>
                    <div className="text-[12px] text-slate-500 mt-1">Tap card to view full details</div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Lead Limits compact */}
                <div className="rounded-xl border bg-slate-50 px-3 py-3">
                  <div className="text-[11px] font-semibold text-slate-700 mb-2">Lead Limits</div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-white border px-2 py-2">
                      <div className="text-[10px] text-slate-500">Daily</div>
                      <div className="text-sm font-bold text-slate-900">{plan.daily_limit}</div>
                    </div>
                    <div className="rounded-lg bg-white border px-2 py-2">
                      <div className="text-[10px] text-slate-500">Weekly</div>
                      <div className="text-sm font-bold text-slate-900">{plan.weekly_limit}</div>
                    </div>
                    <div className="rounded-lg bg-white border px-2 py-2">
                      <div className="text-[10px] text-slate-500">Yearly</div>
                      <div className="text-sm font-bold text-slate-900">{plan.yearly_limit}</div>
                    </div>
                  </div>
                </div>

                {/* Highlights compact */}
                <div className="rounded-xl border bg-white p-3">
                  <div className="text-[11px] font-semibold text-slate-700 mb-2">Top Benefits</div>
                  <div className="space-y-1.5">
                    {compactBenefits.map((b, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-[12px] text-slate-700">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-[1px]" />
                        <span>{b.text}</span>
                      </div>
                    ))}
                    {moreCount > 0 && (
                      <div className="text-[12px] text-slate-500 pl-6">
                        +{moreCount} more benefits (tap to view)
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>

              <CardFooter className="pt-1">
                <Button
                  className={cx(
                    'w-full rounded-xl h-10 font-semibold',
                    isCurrent ? 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-50' : ''
                  )}
                  variant={isCurrent ? 'outline' : 'default'}
                  disabled={isCurrent}
                  onClick={(e) => {
                    // ✅ button click pe card modal open na ho
                    e.stopPropagation();
                    if (!isCurrent) openPlanDetails(plan);
                  }}
                >
                  {isCurrent ? 'Active Plan' : 'Upgrade'}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* ✅ Plan Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="w-full sm:w-[86vw] md:w-[76vw] lg:w-[66vw] max-w-2xl md:max-w-[1100px] overflow-hidden p-0 pb-1 mx-auto">
          {!selectedPlan ? null : (
            <>
              <DialogHeader className="pb-1 px-3 pt-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl border bg-slate-50 flex items-center justify-center text-slate-900">
                      {planIcon(selectedPlan.name)}
                    </div>
                    <div>
                      <DialogTitle className="text-xl">{selectedPlan.name}</DialogTitle>
                      <DialogDescription className="mt-1">
                        Full plan details • Price & benefits
                      </DialogDescription>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {selectedIsPopular && !selectedIsCurrent && (
                      <div className="text-[11px] px-2.5 py-1 rounded-full border bg-blue-50 text-blue-700 border-blue-200 font-semibold">
                        MOST POPULAR
                      </div>
                    )}
                    {selectedIsCurrent && (
                      <div className="text-[11px] px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold">
                        CURRENT PLAN
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-2.5">
                  <div className="rounded-xl border bg-gradient-to-r from-blue-600 via-indigo-600 to-slate-800 text-white px-4 py-2.5 flex items-center justify-between gap-3 shadow-md">
                    <div>
                      <div className="text-xs uppercase tracking-[0.15em] text-white/70 font-semibold">
                        Annual Billing
                      </div>
                      <div className="text-3xl font-extrabold leading-tight">
                        ₹{formatINR(selectedPlan.price)}
                        <span className="text-sm font-medium text-white/80"> / year</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <span className="px-3 py-1 rounded-full border border-white/30 bg-white/10 font-semibold text-xs">
                          {selectedPlan.duration_days || 365} days
                        </span>
                      {selectedIsPopular && (
                        <span className="px-3 py-1 rounded-full bg-white text-blue-700 font-semibold shadow-sm">
                          Recommended
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <div className="mt-2 px-3 pb-1 space-y-1.5">
                {/* lead limits */}
                <div className="rounded-2xl border bg-slate-50 p-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Lead Limits</div>
                    <div className="text-[11px] text-slate-500">Per subscription year</div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    {[
                      { label: 'Daily', value: selectedPlan.daily_limit },
                      { label: 'Weekly', value: selectedPlan.weekly_limit },
                      { label: 'Yearly', value: selectedPlan.yearly_limit },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-lg bg-white border shadow-sm px-2 py-2">
                        <div className="text-[10px] text-slate-500">{stat.label}</div>
                        <div className="text-base font-extrabold text-slate-900">{stat.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* highlights full */}
                {selected?.meta?.highlights?.length > 0 && (
                  <div className="rounded-2xl border bg-white p-2 shadow-sm">
                    <div className="text-sm font-semibold text-slate-900 mb-1.5 flex items-center gap-2">
                      <Star className="w-4 h-4 text-amber-500" />
                      Highlights
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selected.meta.highlights.map((t, idx) => (
                        <span key={idx} className="text-[11px] px-2.5 py-1 rounded-full border bg-amber-50 text-amber-800 border-amber-100">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* groups full */}
                <div className="space-y-1.5">
                  {selected?.groups?.map((g) => (
                    <div key={g.title} className="rounded-2xl border bg-white p-2 shadow-sm">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <span className="text-slate-600">{g.icon}</span>
                        {g.title}
                      </div>
                      <div className="mt-3 space-y-2">
                        {g.items.map((line, i) => (
                          <div key={i} className="flex gap-2 text-sm text-slate-700">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-[2px]" />
                            <span>{line}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooterUI className="mt-2 flex flex-col gap-2 px-3 pb-3">
                <div className="w-full rounded-2xl border bg-gradient-to-br from-slate-50 via-white to-slate-50 p-3 space-y-2.5 shadow-sm">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 items-stretch">
                    <div className="rounded-2xl bg-white border px-3.5 py-3 shadow-inner space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[12px] font-semibold text-slate-800 uppercase tracking-wide">Coupon</div>
                          <div className="text-sm text-slate-500">Optional • Apply before payment</div>
                        </div>
                        {couponCode.trim() && (
                          <button
                            type="button"
                            onClick={() => setCouponCode('')}
                            className="text-[11px] text-slate-500 hover:text-slate-700 underline"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter coupon code"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value)}
                          className="w-full h-11 text-sm"
                        />
                        <Button
                          variant="secondary"
                          className="h-11 whitespace-nowrap px-3 text-sm font-semibold"
                          onClick={() => {
                            if (!couponCode.trim()) {
                              toast({ title: 'Coupon', description: 'Enter a code first' });
                              return;
                            }
                            const val = couponCode.trim().toUpperCase();
                            setCouponCode(val);
                            toast({ title: 'Coupon noted', description: `${val} will be applied before payment.` });
                          }}
                        >
                          Apply
                        </Button>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        If you don&apos;t have a coupon, leave this blank and continue.
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white border px-3.5 py-3 shadow-[inset_0_1px_10px_rgba(15,23,42,0.05)] space-y-2">
                      <div className="flex justify-between text-sm text-slate-700 leading-tight">
                        <span>Plan price</span>
                        <span className="font-semibold text-slate-800">₹{formatINR(selectedPlan.price)}</span>
                      </div>
                      {couponCode.trim() ? (
                        <div className="flex justify-between text-sm text-amber-700 font-semibold">
                          <span>Coupon {couponCode.trim().toUpperCase()}</span>
                          <span>- to be applied</span>
                        </div>
                      ) : (
                        <div className="flex justify-between text-sm text-slate-500">
                          <span>Coupon</span>
                          <span>Not applied</span>
                        </div>
                      )}
                      <div className="border-t pt-2.5 flex justify-between text-base font-bold text-slate-900">
                        <span>Payable now</span>
                        <span>₹{formatINR(selectedPlan.price)}</span>
                      </div>
                      {couponCode.trim() && (
                        <div className="text-[11px] text-amber-700 text-right">Final amount updates after validation</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full">
                  <Button
                    className={cx(
                      'w-full rounded-xl h-12 font-semibold text-base',
                      selectedIsCurrent ? 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-50' : ''
                    )}
                    variant={selectedIsCurrent ? 'outline' : 'default'}
                    disabled={selectedIsCurrent}
                    onClick={() => handleSubscribe(selectedPlan)}
                  >
                    {selectedIsCurrent
                      ? 'Active Plan'
                      : couponCode.trim()
                        ? 'Apply & Proceed'
                        : 'Proceed to Pay'}
                  </Button>
                  {!selectedIsCurrent && couponCode.trim() && (
                    <Button
                      variant="ghost"
                      className="w-full h-12 border border-dashed border-slate-200"
                      onClick={() => handleSubscribe(selectedPlan, '')}
                    >
                      Proceed without coupon
                    </Button>
                  )}
                </div>
              </DialogFooterUI>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment History Dialog */}
      <Dialog open={showPaymentHistory} onOpenChange={setShowPaymentHistory}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payment & Invoice History</DialogTitle>
            <DialogDescription>View your past payments and download invoices</DialogDescription>
          </DialogHeader>

          <div className="mt-4 max-h-[60vh] overflow-y-auto space-y-3">
            {loadingHistory ? (
              <div className="flex items-center justify-center py-8">
                <Zap className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : paymentHistory.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p>No payment history found</p>
              </div>
            ) : (
              paymentHistory.map((payment) => {
                const discountValue = Number(payment.discount_amount || 0);
                const netAmount = Number(payment.net_amount ?? payment.amount ?? 0);
                const baseAmount = Number(payment.amount ?? 0);

                return (
                  <div
                    key={payment.id}
                    onClick={() => setSelectedPayment(selectedPayment?.id === payment.id ? null : payment)}
                    className="rounded-xl border p-4 cursor-pointer hover:bg-slate-50 transition"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-semibold text-slate-900">{payment.description}</div>
                        <div className="text-sm text-slate-500 mt-1">
                          {new Date(payment.payment_date).toLocaleDateString('en-IN')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-slate-900">₹{baseAmount.toFixed(2)}</div>
                        <div
                          className={cx(
                            'text-[11px] font-semibold mt-1 px-2 py-1 rounded-full',
                            payment.status === 'COMPLETED'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-yellow-50 text-yellow-700'
                          )}
                        >
                          {payment.status}
                        </div>
                      </div>
                    </div>

                    {selectedPayment?.id === payment.id && (
                      <div className="mt-4 pt-4 border-t space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                            <span className="text-slate-600">Plan price</span>
                            <span className="font-semibold text-slate-900">₹{baseAmount.toFixed(2)}</span>
                          </div>
                          {(discountValue > 0 || payment.coupon_code) && (
                            <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-amber-800 font-semibold">
                              <span>Coupon {payment.coupon_code || ''}</span>
                              <span>-₹{discountValue.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 sm:col-span-2">
                            <span className="text-emerald-800 font-semibold">Paid (net)</span>
                            <span className="font-bold text-emerald-900">₹{netAmount.toFixed(2)}</span>
                          </div>
                        </div>

                        {payment.transaction_id && (
                          <div className="text-sm">
                            <span className="text-slate-600">Transaction ID: </span>
                            <span className="font-mono text-slate-900">{payment.transaction_id}</span>
                          </div>
                        )}
                        {payment.invoice_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              const link = document.createElement('a');
                              link.href = payment.invoice_url;
                              link.download = `invoice-${payment.transaction_id}.pdf`;
                              link.click();
                            }}
                            className="w-full"
                          >
                            📄 Download Invoice
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Services;
