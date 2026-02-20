import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';
import { leadsMarketplaceApi } from '@/modules/vendor/services/leadsMarketplaceApi';

let razorpayScriptPromise = null;

const parseJsonSafe = async (response) => {
  const contentType = String(response?.headers?.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }
  const text = await response.text().catch(() => '');
  return { error: text || '' };
};

const raiseHttpError = async (response, fallbackMessage) => {
  const payload = await parseJsonSafe(response);
  const message = payload?.error || payload?.message || fallbackMessage || `Request failed (${response.status})`;
  const error = new Error(message);
  error.status = response.status;
  throw error;
};

const normalizeLeadPrice = (lead) => {
  const n = Number(lead?.price);
  if (Number.isFinite(n)) return Math.max(0, n);
  return 50;
};

const ensureRazorpayLoaded = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Payment is available only in browser'));
  }

  if (window.Razorpay) return Promise.resolve();
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load payment gateway'));
    document.body.appendChild(script);
  }).finally(() => {
    razorpayScriptPromise = null;
  });

  return razorpayScriptPromise;
};

const emitLeadPurchasedEvent = (detail = {}) => {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('itm:lead_purchased', { detail }));
  } catch (error) {
    console.warn('Failed to dispatch lead purchase event:', error);
  }
};

const openCheckoutAndVerify = async ({ order, keyId, leadId }) =>
  new Promise((resolve, reject) => {
    const options = {
      key: keyId,
      amount: order.amount,
      currency: order.currency || 'INR',
      name: 'Indian Trade Mart',
      description: `Lead Purchase: ${order.lead_title || 'Lead'}`,
      order_id: order.id,
      prefill: {
        email: order.vendor_email || '',
      },
      handler: async (response) => {
        try {
          const verifyRes = await fetchWithCsrf(apiUrl('/api/payment/lead/verify'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order_id: order.id,
              payment_id: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              lead_id: leadId,
            }),
          });

          if (!verifyRes.ok) {
            await raiseHttpError(verifyRes, 'Lead payment verification failed');
          }

          const payload = await parseJsonSafe(verifyRes);
          resolve(payload);
        } catch (error) {
          reject(error);
        }
      },
      modal: {
        ondismiss: () => {
          const error = new Error('Payment cancelled');
          error.code = 'PAYMENT_CANCELLED';
          reject(error);
        },
      },
    };

    try {
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (event) => {
        const reason = event?.error?.description || event?.error?.reason || 'Payment failed';
        reject(new Error(reason));
      });
      rzp.open();
    } catch (error) {
      reject(error);
    }
  });

export const leadPaymentApi = {
  purchaseLead: async (lead) => {
    const leadId = String(lead?.id || '').trim();
    if (!leadId) throw new Error('Lead not found');

    const leadPrice = normalizeLeadPrice(lead);

    // Free lead path: keep existing purchase flow (no payment popup).
    if (leadPrice <= 0) {
      const purchase = await leadsMarketplaceApi.purchaseLead(leadId, lead);
      const payload = { success: true, purchase, payment_skipped: true };
      emitLeadPurchasedEvent({ lead_id: leadId, purchase: payload?.purchase || null });
      return payload;
    }

    const initRes = await fetchWithCsrf(apiUrl('/api/payment/lead/initiate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId }),
    });

    if (!initRes.ok) {
      await raiseHttpError(initRes, 'Failed to initiate lead payment');
    }

    const initPayload = await parseJsonSafe(initRes);
    const order = initPayload?.order;
    const keyId = initPayload?.key_id || import.meta.env.VITE_RAZORPAY_KEY_ID;

    if (!order?.id) throw new Error('Invalid payment order');
    if (!keyId) throw new Error('Razorpay key is missing');

    await ensureRazorpayLoaded();
    const payload = await openCheckoutAndVerify({ order, keyId, leadId });
    emitLeadPurchasedEvent({ lead_id: leadId, purchase: payload?.purchase || null });
    return payload;
  },
};
