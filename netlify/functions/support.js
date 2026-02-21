import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[support function] Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CSRF-Token",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  },
  body: JSON.stringify(body),
});

const ok = (b) => json(200, b);
const bad = (msg, details) => json(400, { success: false, error: msg, details });
const fail = (msg, details) => json(500, { success: false, error: msg, details });
const SUPPORT_TICKET_SELECT =
  "*, vendors(company_name, email, owner_name, vendor_id), buyers(id, full_name, email, company_name)";

function parseTail(eventPath) {
  const parts = String(eventPath || "").split("/").filter(Boolean);
  const fnIndex = parts.indexOf("support");
  if (fnIndex >= 0) return parts.slice(fnIndex + 1);
  return parts;
}

const nowIso = () => new Date().toISOString();
const normalizeSenderType = (v) => String(v || "").trim().toUpperCase();

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

async function notifyRole(role, payload) {
  try {
    const r = String(role || "").trim().toUpperCase();
    if (!r) return [];
    const { data: employees, error } = await supabase
      .from("employees")
      .select("user_id, status, role")
      .eq("role", r);
    if (error || !employees?.length) return [];
    const activeIds = employees
      .filter((e) => !e.status || String(e.status).toUpperCase() === "ACTIVE")
      .map((e) => e.user_id)
      .filter(Boolean);
    if (!activeIds.length) return [];
    const rows = activeIds.map((id) => ({
      user_id: id,
      type: payload?.type || "INFO",
      title: payload?.title || "Notification",
      message: payload?.message || "",
      link: payload?.link || null,
      is_read: false,
      created_at: nowIso(),
    }));
    const { data } = await supabase.from("notifications").insert(rows).select();
    return data || [];
  } catch {
    return [];
  }
}

const notifyAdmins = async (payload) => {
  await notifyRole("ADMIN", payload);
  await notifyRole("SUPERADMIN", payload);
  await notifyRole("SUPPORT", payload);
};

async function getTicketUsers(ticket) {
  const vendorId = ticket?.vendor_id || null;
  const buyerId = ticket?.buyer_id || null;
  let vendorUserId = null;
  let buyerUserId = null;

  if (vendorId) {
    const { data } = await supabase
      .from("vendors")
      .select("user_id")
      .eq("id", vendorId)
      .maybeSingle();
    vendorUserId = data?.user_id || null;
  }

  if (buyerId) {
    const { data } = await supabase
      .from("buyers")
      .select("user_id")
      .eq("id", buyerId)
      .maybeSingle();
    buyerUserId = data?.user_id || null;
  }

  return { vendorUserId, buyerUserId };
}

export async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") return ok({ ok: true });

    const tail = parseTail(event.path);
    const [root, id, action] = tail;

    // -------------------------
    // GET /tickets
    // -------------------------
    if (event.httpMethod === "GET" && root === "tickets" && tail.length === 1) {
      const { status, priority, search, scope = "ALL", page = 1, pageSize = 100 } = event.queryStringParameters || {};
      let query = supabase
        .from("support_tickets")
        .select(SUPPORT_TICKET_SELECT, { count: "exact" })
        .order("created_at", { ascending: false });

      if (status && status !== "ALL") query = query.eq("status", status);
      if (priority && priority !== "ALL") query = query.eq("priority", priority);
      if (search && String(search).trim()) {
        const term = String(search).toLowerCase();
        query = query.or(
          `subject.ilike.%${term}%,description.ilike.%${term}%,ticket_display_id.ilike.%${term}%`
        );
      }

      const scopeValue = String(scope || "").toUpperCase();
      if (scopeValue === "VENDOR") {
        query = query.not("vendor_id", "is", null);
      } else if (scopeValue === "BUYER") {
        query = query.not("buyer_id", "is", null);
      }

      const offset = (Number(page) - 1) * Number(pageSize);
      query = query.range(offset, offset + Number(pageSize) - 1);

      const { data, error, count } = await query;
      if (error) return fail("Failed to fetch tickets", error.message);

      return ok({
        success: true,
        tickets: data || [],
        total: count || 0,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil((count || 0) / Number(pageSize)),
      });
    }

    // -------------------------
    // GET /tickets/:id
    // -------------------------
    if (event.httpMethod === "GET" && root === "tickets" && id && tail.length === 2) {
      const { data, error } = await supabase
        .from("support_tickets")
        .select(SUPPORT_TICKET_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (error || !data) return json(404, { error: "Ticket not found" });
      return ok({ success: true, ticket: data });
    }

    // -------------------------
    // GET /tickets/:id/messages
    // -------------------------
    if (event.httpMethod === "GET" && root === "tickets" && id && action === "messages") {
      const { data, error } = await supabase
        .from("ticket_messages")
        .select("*")
        .eq("ticket_id", id)
        .order("created_at", { ascending: true });
      if (error) return fail("Failed to fetch messages", error.message);
      return ok({ success: true, messages: data || [] });
    }

    // -------------------------
    // POST /tickets/:id/messages
    // -------------------------
    if (event.httpMethod === "POST" && root === "tickets" && id && action === "messages") {
      let body = {};
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        body = {};
      }

      const message = String(body?.message || "").trim();
      if (!message) return bad("Message is required");

      const senderType = normalizeSenderType(body?.sender_type) || "SUPPORT";
      const senderId = body?.sender_id || null;

      const { data: ticket, error: tErr } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (tErr || !ticket) return json(404, { error: "Ticket not found" });

      await supabase
        .from("support_tickets")
        .update({ last_reply_at: nowIso(), updated_at: nowIso() })
        .eq("id", id);

      const { data, error } = await supabase
        .from("ticket_messages")
        .insert([{
          ticket_id: id,
          sender_id: senderId,
          sender_type: senderType,
          message,
          created_at: nowIso(),
        }])
        .select()
        .single();

      if (error) return fail("Failed to send message", error.message);

      const { vendorUserId, buyerUserId } = await getTicketUsers(ticket);
      const title = `Support ticket update: ${ticket.ticket_display_id || ticket.id}`;
      const linkBase = ticket.vendor_id ? "/vendor/support" : "/buyer/tickets";

      if (["SUPPORT", "ADMIN", "STAFF"].includes(senderType)) {
        if (vendorUserId) {
          await notifyUser({
            user_id: vendorUserId,
            type: "SUPPORT_MESSAGE",
            title,
            message,
            link: linkBase,
          });
        }
        if (buyerUserId) {
          await notifyUser({
            user_id: buyerUserId,
            type: "SUPPORT_MESSAGE",
            title,
            message,
            link: linkBase,
          });
        }
      } else {
        await notifyAdmins({
          type: "SUPPORT_MESSAGE",
          title,
          message,
          link: "/admin/tickets",
        });
      }

      return ok({ success: true, message: data });
    }

    // -------------------------
    // POST /tickets
    // -------------------------
    if (event.httpMethod === "POST" && root === "tickets" && tail.length === 1) {
      let body = {};
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        body = {};
      }

      const subject = String(body?.subject || "").trim();
      const description = String(body?.description || "").trim();
      if (!subject || !description) return bad("Missing required fields: subject and description");

      const ticketNumber = `TKT-${Date.now()}`;
      const payload = {
        subject,
        description,
        category: body?.category || "General",
        priority: String(body?.priority || "MEDIUM").toUpperCase(),
        status: String(body?.status || "OPEN").toUpperCase(),
        vendor_id: body?.vendor_id || null,
        buyer_id: body?.buyer_id || null,
        ticket_display_id: ticketNumber,
        attachments: JSON.stringify(body?.attachments || []),
        created_at: nowIso(),
      };

      const { data, error } = await supabase
        .from("support_tickets")
        .insert([payload])
        .select()
        .single();
      if (error) return fail("Failed to create ticket", error.message);

      await notifyAdmins({
        type: "SUPPORT_TICKET",
        title: `New support ticket: ${ticketNumber}`,
        message: subject,
        link: "/admin/tickets",
      });

      return json(201, { success: true, message: "Ticket created successfully", ticket: data });
    }

    // -------------------------
    // PATCH /tickets/:id
    // -------------------------
    if (event.httpMethod === "PATCH" && root === "tickets" && id && tail.length === 2) {
      let body = {};
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        body = {};
      }

      const allowed = ["status", "priority", "category", "attachments"];
      const updates = {};
      Object.keys(body || {}).forEach((k) => {
        if (allowed.includes(k)) updates[k] = body[k];
      });
      if (!Object.keys(updates).length) return bad("No valid fields to update");

      const { data, error } = await supabase
        .from("support_tickets")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) return fail("Failed to update ticket", error.message);
      return ok({ success: true, message: "Ticket updated successfully", ticket: data });
    }

    // -------------------------
    // PUT /tickets/:id/status
    // -------------------------
    if (event.httpMethod === "PUT" && root === "tickets" && id && action === "status") {
      let body = {};
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        body = {};
      }
      const status = String(body?.status || "").toUpperCase();
      if (!status) return bad("Status is required");

      const validStatuses = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "CANCELLED"];
      if (!validStatuses.includes(status)) {
        return bad(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
      }

      const updatePayload = { status };
      if (["RESOLVED", "CLOSED"].includes(status)) updatePayload.resolved_at = nowIso();

      const { data, error } = await supabase
        .from("support_tickets")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();
      if (error) return fail("Failed to update ticket status", error.message);

      if (data) {
        const { vendorUserId, buyerUserId } = await getTicketUsers(data);
        const title = `Ticket status updated: ${data.ticket_display_id || data.id}`;
        const message = `Status changed to ${status}`;
        if (vendorUserId) {
          await notifyUser({ user_id: vendorUserId, type: "SUPPORT_STATUS", title, message, link: "/vendor/support" });
        }
        if (buyerUserId) {
          await notifyUser({ user_id: buyerUserId, type: "SUPPORT_STATUS", title, message, link: "/buyer/tickets" });
        }
      }

      return ok({ success: true, message: "Ticket status updated successfully", ticket: data });
    }

    // -------------------------
    // POST /tickets/:id/notify-customer
    // -------------------------
    if (event.httpMethod === "POST" && root === "tickets" && id && action === "notify-customer") {
      let body = {};
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        body = {};
      }

      const rawMessage = String(body?.message || "").trim();

      const { data: ticket, error: ticketError } = await supabase
        .from("support_tickets")
        .select("id, ticket_display_id, subject, description, category, vendor_id, buyer_id")
        .eq("id", id)
        .maybeSingle();

      if (ticketError || !ticket) {
        return json(404, { error: "Ticket not found" });
      }

      const { vendorUserId, buyerUserId } = await getTicketUsers(ticket);
      if (!vendorUserId && !buyerUserId) {
        return bad("No linked vendor or buyer found for this ticket");
      }

      const message = rawMessage || ticket.description || ticket.subject || "Support update available";
      const title = ticket.subject
        ? `Support update: ${ticket.subject}`
        : `Support update: ${ticket.ticket_display_id || ticket.id}`;

      let sent = 0;
      if (vendorUserId) {
        const vendorLink = String(ticket.category || "").toUpperCase().includes("KYC")
          ? "/vendor/profile?tab=kyc"
          : "/vendor/support";
        await notifyUser({
          user_id: vendorUserId,
          type: "SUPPORT_ALERT",
          title,
          message,
          link: vendorLink,
        });
        sent += 1;
      }
      if (buyerUserId) {
        await notifyUser({
          user_id: buyerUserId,
          type: "SUPPORT_ALERT",
          title,
          message,
          link: "/buyer/tickets",
        });
        sent += 1;
      }

      return ok({ success: true, notified: sent });
    }

    // -------------------------
    // GET /stats
    // -------------------------
    if (event.httpMethod === "GET" && root === "stats") {
      const { data: tickets, error } = await supabase
        .from("support_tickets")
        .select("status, priority");
      if (error) return fail("Failed to fetch statistics", error.message);

      const stats = {
        totalTickets: tickets?.length || 0,
        openTickets: 0,
        inProgressTickets: 0,
        resolvedTickets: 0,
        closedTickets: 0,
        highPriorityTickets: 0,
        mediumPriorityTickets: 0,
        lowPriorityTickets: 0,
        resolutionRate: 0,
      };

      (tickets || []).forEach((ticket) => {
        switch (ticket.status) {
          case "OPEN": stats.openTickets++; break;
          case "IN_PROGRESS": stats.inProgressTickets++; break;
          case "RESOLVED": stats.resolvedTickets++; break;
          case "CLOSED": stats.closedTickets++; break;
          default: break;
        }
        switch (ticket.priority) {
          case "HIGH":
          case "URGENT": stats.highPriorityTickets++; break;
          case "MEDIUM": stats.mediumPriorityTickets++; break;
          case "LOW": stats.lowPriorityTickets++; break;
          default: break;
        }
      });

      const resolved = stats.resolvedTickets + stats.closedTickets;
      stats.resolutionRate = stats.totalTickets > 0
        ? Math.round((resolved / stats.totalTickets) * 100)
        : 0;

      return ok({ success: true, stats });
    }

    // -------------------------
    // GET /vendor/:vendorId
    // -------------------------
    if (event.httpMethod === "GET" && root === "vendor" && id) {
      const { status, priority } = event.queryStringParameters || {};
      let query = supabase
        .from("support_tickets")
        .select("*")
        .eq("vendor_id", id)
        .order("created_at", { ascending: false });

      if (status && status !== "ALL") query = query.eq("status", status);
      if (priority && priority !== "ALL") query = query.eq("priority", priority);

      const { data, error } = await query;
      if (error) return fail("Failed to fetch vendor tickets", error.message);

      return ok({ success: true, tickets: data || [], total: data?.length || 0 });
    }

    // -------------------------
    // GET /buyer/:buyerId
    // -------------------------
    if (event.httpMethod === "GET" && root === "buyer" && id) {
      const { status, priority } = event.queryStringParameters || {};
      let query = supabase
        .from("support_tickets")
        .select("*")
        .eq("buyer_id", id)
        .order("created_at", { ascending: false });

      if (status && status !== "ALL") query = query.eq("status", status);
      if (priority && priority !== "ALL") query = query.eq("priority", priority);

      const { data, error } = await query;
      if (error) return fail("Failed to fetch buyer tickets", error.message);

      return ok({ success: true, tickets: data || [], total: data?.length || 0 });
    }

    return json(404, { success: false, error: "Not found" });
  } catch (e) {
    return fail("Unhandled error", e?.message || String(e));
  }
}
