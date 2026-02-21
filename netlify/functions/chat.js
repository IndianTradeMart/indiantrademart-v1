const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const fallbackReply =
  'Please share your requirement in detail (service, city, and expected quantity).';

const createReply = (text = '') => {
  const q = String(text || '').trim().toLowerCase();
  if (!q) return 'Please type your question so I can help.';
  if (q.includes('hello') || q.includes('hi') || q.includes('namaste')) {
    return 'Hello. I can help with vendors, buyers, leads, pricing, and support.';
  }
  if (q.includes('vendor') || q.includes('supplier')) {
    return 'Vendor flow: Register -> complete profile -> add products/services -> submit KYC.';
  }
  if (q.includes('lead')) {
    return 'Lead flow: buyers post requirements, vendors purchase relevant leads and respond.';
  }
  if (q.includes('price') || q.includes('plan') || q.includes('membership')) {
    return 'Plans available: Diamond, Gold, Silver, Booster, Certified, Startup, and Trial.';
  }
  if (q.includes('support') || q.includes('help')) {
    return 'Share your issue type: login, OTP, payment, directory, or profile.';
  }
  if (q.includes('otp')) {
    return 'For OTP issues, check email credentials, spam folder, and Netlify environment variables.';
  }
  if (q.includes('payment') || q.includes('razorpay')) {
    return 'For payment issues, share order_id, payment_id, and current error message.';
  }
  return fallbackReply;
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ text: 'Method not allowed' }) };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const last = messages[messages.length - 1] || {};
    const userText = String(last.text || last.content || '').trim();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: createReply(userText) }),
    };
  } catch {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        text: 'Server error. Please try again.',
      }),
    };
  }
};
