import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[kyc function] Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(
  SUPABASE_URL || "",
  SUPABASE_SERVICE_ROLE_KEY || ""
);

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  },
  body: JSON.stringify(body),
});

const ok = (b) => json(200, b);
const bad = (msg, details) => json(400, { success: false, error: msg, details });
const fail = (msg, details) => json(500, { success: false, error: msg, details });

function parseTail(eventPath) {
  // event.path examples:
  // "/.netlify/functions/kyc/vendors/:id/documents"
  // "/.netlify/functions/kyc/vendors"
  const parts = String(eventPath || "")
    .split("/")
    .filter(Boolean);

  const fnIndex = parts.indexOf("kyc"); // function name
  if (fnIndex >= 0) return parts.slice(fnIndex + 1); // after "kyc"
  return parts;
}

const looksLikePdf = (v = "") => String(v || "").toLowerCase().includes(".pdf");

const normalizeDoc = (d) => {
  const url = d?.url || d?.document_url || d?.file_path || d?.path || d?.public_url || "";
  return {
    id: d?.id,
    document_type: d?.document_type || d?.type || "document",
    url,
    status: d?.verification_status || d?.status || "PENDING",
    created_at: d?.created_at || d?.uploaded_at || null,
    is_pdf: looksLikePdf(url),
    original_name: d?.original_name || null,
  };
};

const nowIso = () => new Date().toISOString();

async function notifyUser({ user_id, type, title, message, link }) {
  try {
    if (!user_id) return null;
    const { data, error } = await supabase
      .from("notifications")
      .insert([{
        user_id,
        type: type || "INFO",
        title: title || "Notification",
        message: message || "",
        link: link || null,
        is_read: false,
        created_at: nowIso(),
      }])
      .select()
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

export async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") return ok({ ok: true });

    const tail = parseTail(event.path);

    // must start with vendors
    if (tail[0] !== "vendors") return json(404, { success: false, error: "Not found" });

    // -------------------------
    // GET /vendors?status=ALL|PENDING|SUBMITTED|APPROVED|REJECTED
    // -------------------------
    if (event.httpMethod === "GET" && tail.length === 1) {
      const status = String(event.queryStringParameters?.status || "ALL").toUpperCase();

      let q = supabase.from("vendors").select("*").order("created_at", { ascending: false });
      if (status !== "ALL") q = q.eq("kyc_status", status);

      const { data, error } = await q;
      if (error) return fail("Failed to fetch vendors", error.message);

      return ok({ success: true, vendors: data || [] });
    }

    const vendorId = tail[1];
    const action = tail[2];

    if (!vendorId) return bad("vendorId missing");

    // -------------------------
    // GET /vendors/:vendorId/documents
    // -------------------------
    if (event.httpMethod === "GET" && action === "documents") {
      const { data: vendor, error: vErr } = await supabase
        .from("vendors")
        .select("*")
        .eq("id", vendorId)
        .maybeSingle();

      if (vErr) return fail("Failed to fetch vendor", vErr.message);

      const { data: docs, error: dErr } = await supabase
        .from("vendor_documents")
        .select("*")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false });

      if (dErr) return fail("Failed to fetch documents", dErr.message);

      const documents = (docs || []).map(normalizeDoc);

      return ok({
        success: true,
        vendor: vendor || null,
        documents,
      });
    }

    // -------------------------
    // POST /vendors/:vendorId/approve
    // -------------------------
    if (event.httpMethod === "POST" && action === "approve") {
      const { data, error } = await supabase
        .from("vendors")
        .update({
          kyc_status: "APPROVED",
          is_verified: true,
          verification_badge: true,
          verified_at: new Date().toISOString(),
        })
        .eq("id", vendorId)
        .select("*")
        .maybeSingle();

      if (error) return fail("Approve failed", error.message);

      if (data?.user_id) {
        await notifyUser({
          user_id: data.user_id,
          type: "KYC_APPROVED",
          title: "KYC Approved",
          message: "Your KYC has been approved. Your account is now verified.",
          link: "/vendor/profile?tab=kyc",
        });
      }

      return ok({ success: true, vendor: data || null });
    }

    // -------------------------
    // POST /vendors/:vendorId/reject
    // -------------------------
    if (event.httpMethod === "POST" && action === "reject") {
      let body = {};
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        body = {};
      }

      const remarks = String(body?.remarks || "").trim() || null;

      const { data, error } = await supabase
        .from("vendors")
        .update({
          kyc_status: "REJECTED",
          is_verified: false,
          verification_badge: false,
          rejection_reason: remarks,
        })
        .eq("id", vendorId)
        .select("*")
        .maybeSingle();

      if (error) return fail("Reject failed", error.message);

      if (data?.user_id) {
        await notifyUser({
          user_id: data.user_id,
          type: "KYC_REJECTED",
          title: "KYC Rejected",
          message: remarks || "Your KYC was rejected. Please re-upload the correct documents.",
          link: "/vendor/profile?tab=kyc",
        });
      }

      return ok({ success: true, vendor: data || null });
    }

    return json(404, { success: false, error: "Not found" });
  } catch (e) {
    return fail("Unhandled error", e?.message || String(e));
  }
}
