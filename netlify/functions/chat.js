exports.handler = async (event) => {
  // CORS (safe defaults)
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ text: "Method not allowed" }),
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const messages = Array.isArray(body.messages) ? body.messages : [];

    const last = messages[messages.length - 1] || {};
    const userText = String(last.text || last.content || "").trim();
    const q = userText.toLowerCase();

    // Simple FAQ rules (edit as per your needs)
    let reply =
      "समझ गया ✅ कृपया अपना सवाल थोड़ा detail में बताएं (service / city / requirement).";

    if (!userText) {
      reply = "कृपया अपना सवाल लिखें 🙂";
    } else if (q.includes("hello") || q.includes("hi") || q.includes("namaste")) {
      reply =
        "नमस्ते! 👋 बताइए आपको Vendor, Buyer, Leads, या Directory में किस चीज़ की मदद चाहिए?";
    } else if (q.includes("vendor") || q.includes("supplier")) {
      reply =
        "Vendor बनने के लिए: Register → Profile complete → Products/Services add → KYC (optional). आपको registration में help चाहिए?";
    } else if (q.includes("lead") || q.includes("leads")) {
      reply =
        "Leads के लिए आप Buyer proposal/requirement डाल सकते हैं, और Vendors lead purchase कर सकते हैं. किस city/service की lead चाहिए?";
    } else if (q.includes("price") || q.includes("plan") || q.includes("membership")) {
      reply =
        "Plans: Diamond > Gold > Silver > Booster > Certified > Startup > Trial. आपको कौनसा plan चाहिए और किस category में?";
    } else if (q.includes("support") || q.includes("help")) {
      reply =
        "मैं मदद कर दूँगा ✅ अपना issue बताइए: login / otp / payment / directory / profile ?";
    } else if (q.includes("otp")) {
      reply =
        "OTP issue के लिए: email settings + env keys + spam folder check करें. बताइए OTP किस module में नहीं आ रहा?";
    } else if (q.includes("payment") || q.includes("razorpay")) {
      reply =
        "Payment issue में: order_id / payment_id / webhook verify जरूरी है. आपको कौनसा error आ रहा है?";
    }

    // DeepChat expects: { text: "..." }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: reply }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        text: "Server error हुआ 😅 कृपया दोबारा try करें.",
      }),
    };
  }
};
