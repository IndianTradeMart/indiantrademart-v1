import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "[admin function] Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
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
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  },
  body: JSON.stringify(body),
});

const ok = (b) => json(200, b);
const bad = (msg, details) => json(400, { success: false, error: msg, details });
const fail = (msg, details) => json(500, { success: false, error: msg, details });

function parseTail(eventPath) {
  const parts = String(eventPath || "").split("/").filter(Boolean);
  const fnIndex = parts.indexOf("admin");
  if (fnIndex >= 0) return parts.slice(fnIndex + 1);
  return parts;
}

async function readBody(event) {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch {
    return {};
  }
}

async function writeAudit({ user_id = null, action, entity_type, entity_id = null, details = {} }) {
  try {
    await supabase.from("audit_logs").insert([
      { user_id, action, entity_type, entity_id, details, created_at: new Date().toISOString() }
    ]);
  } catch {
    // ignore audit errors
  }
}

const nowIso = () => new Date().toISOString();
const normalizeEmail = (value = "") => String(value || "").trim().toLowerCase();
const normalizeIdentityEmail = (value) => normalizeEmail(value || "");

async function hashPassword(password) {
  if (!password) return "";
  return bcrypt.hash(String(password), 10);
}

const toTrimmedTextOrNull = (value, { upper = false } = {}) => {
  if (value === undefined) return undefined;
  const text = String(value ?? "").trim();
  if (!text) return null;
  return upper ? text.toUpperCase() : text;
};

async function resolveBuyerRecordForAdmin(buyerId) {
  const id = String(buyerId || "").trim();
  if (!id) return { data: null, error: null };

  const byId = await supabase.from("buyers").select("*").eq("id", id).maybeSingle();
  if (byId.error) return { data: null, error: byId.error };
  if (byId.data) return { data: byId.data, error: null };

  const byUserId = await supabase
    .from("buyers")
    .select("*")
    .eq("user_id", id)
    .maybeSingle();
  if (byUserId.error) return { data: null, error: byUserId.error };
  if (byUserId.data) return { data: byUserId.data, error: null };

  return { data: null, error: null };
}

async function fetchBuyerRoleIdentitySets() {
  const { data: users, error } = await supabase
    .from("users")
    .select("id, email")
    .eq("role", "BUYER");

  if (error) throw new Error(error.message || "Failed to fetch buyer role users");

  const buyerUserIds = new Set();
  const buyerEmails = new Set();

  (users || []).forEach((user) => {
    if (user?.id) buyerUserIds.add(String(user.id));
    const normalized = normalizeIdentityEmail(user?.email);
    if (normalized) buyerEmails.add(normalized);
  });

  return { buyerUserIds, buyerEmails };
}

function filterRowsToBuyerRole(rows = [], { buyerUserIds, buyerEmails }) {
  return (rows || []).filter((row) => {
    const rowUserId = String(row?.user_id || "").trim();
    const rowEmail = normalizeIdentityEmail(row?.email);
    if (rowUserId && buyerUserIds.has(rowUserId)) return true;
    if (rowEmail && buyerEmails.has(rowEmail)) return true;
    return false;
  });
}

function buildBuyerStatusUpdates(current, { isActive, reason = "" }) {
  const updates = { updated_at: nowIso() };

  if (typeof current?.is_active === "boolean" || "is_active" in (current || {})) {
    updates.is_active = !!isActive;
  }

  if (typeof current?.status === "string" || "status" in (current || {})) {
    updates.status = isActive ? "ACTIVE" : "TERMINATED";
  }

  if ("terminated_at" in (current || {})) {
    updates.terminated_at = isActive ? null : nowIso();
  }

  if ("terminated_reason" in (current || {})) {
    updates.terminated_reason = isActive ? null : (String(reason || "").trim() || null);
  }

  return updates;
}

async function syncPublicUserPassword(employee, authUserId, password) {
  const email = normalizeEmail(employee?.email);
  if (!authUserId && !email) {
    throw new Error("Missing employee identity for password sync");
  }

  const password_hash = await hashPassword(password);
  const updates = {
    password_hash,
    updated_at: nowIso(),
  };

  let publicUser = null;

  if (authUserId) {
    const { data } = await supabase
      .from("users")
      .update(updates)
      .eq("id", authUserId)
      .select("*")
      .maybeSingle();
    publicUser = data || null;
  }

  if (!publicUser && email) {
    const { data } = await supabase
      .from("users")
      .update(updates)
      .eq("email", email)
      .select("*")
      .maybeSingle();
    publicUser = data || null;
  }

  // Fallback for mixed-case legacy emails.
  if (!publicUser && email) {
    const { data: existingByEmail } = await supabase
      .from("users")
      .select("*")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();

    if (existingByEmail?.id) {
      const { data } = await supabase
        .from("users")
        .update(updates)
        .eq("id", existingByEmail.id)
        .select("*")
        .maybeSingle();
      publicUser = data || null;
    }
  }

  if (!publicUser) {
    const full_name =
      String(employee?.full_name || "").trim() ||
      (email ? email.split("@")[0] : "Employee");
    const role = String(employee?.role || "DATA_ENTRY").trim().toUpperCase();

    const payload = {
      id: authUserId,
      email: email || null,
      full_name,
      role,
      password_hash,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    const { data, error } = await supabase
      .from("users")
      .upsert([payload], { onConflict: "id" })
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message || "Failed to sync public user");
    publicUser = data || payload;
  }

  if (publicUser?.id && employee?.id && publicUser.id !== employee.user_id) {
    await supabase
      .from("employees")
      .update({ user_id: publicUser.id })
      .eq("id", employee.id);
  }

  return publicUser;
}

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

function isActiveSub(s) {
  const st = String(s?.status || "").toUpperCase();
  if (st !== "ACTIVE") return false;
  const end = s?.end_date ? new Date(s.end_date).getTime() : null;
  if (!end) return true;
  return end > Date.now();
}

async function findAuthUserByEmail(email) {
  const target = String(email || "").trim().toLowerCase();
  if (!target) return null;

  if (supabase?.auth?.admin?.getUserByEmail) {
    const { data, error } = await supabase.auth.admin.getUserByEmail(target);
    if (error) return null;
    return data?.user || null;
  }

  const perPage = 100;
  const maxPages = 50;
  for (let page = 1; page <= maxPages; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const users = data?.users || [];
    const match = users.find(
      (u) => String(u?.email || "").trim().toLowerCase() === target
    );
    if (match) return match;
    if (users.length < perPage) break;
  }
  return null;
}

async function getAuthUserById(userId) {
  if (!userId) return null;
  if (!supabase?.auth?.admin?.getUserById) return null;
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) return null;
  return data?.user || null;
}

async function resolveEmployeeAuthUser(employee) {
  if (!employee) return null;
  const email = String(employee?.email || "").trim().toLowerCase();
  let authUser = null;

  if (employee.user_id) {
    authUser = await getAuthUserById(employee.user_id);
  }

  if (authUser && email) {
    const authEmail = String(authUser?.email || "").trim().toLowerCase();
    if (authEmail && authEmail !== email) {
      authUser = null;
    }
  }

  if (!authUser && email) {
    authUser = await findAuthUserByEmail(email);
  }

  if (authUser && authUser.id && authUser.id !== employee.user_id) {
    await supabase
      .from("employees")
      .update({ user_id: authUser.id })
      .eq("id", employee.id);
  }

  return authUser;
}

async function ensureEmployeeAuthUser(employee, password) {
  if (!employee) return null;
  const email = String(employee?.email || "").trim().toLowerCase();
  if (!email) return null;

  let authUser = await resolveEmployeeAuthUser(employee);

  if (!authUser) {
    const fullName = String(employee?.full_name || "").trim();
    const role = String(employee?.role || "DATA_ENTRY").trim().toUpperCase();
    const department = String(employee?.department || "").trim() || "Operations";
    const phone = String(employee?.phone || "").trim() || null;

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role, phone, department },
      app_metadata: { role },
    });

    if (error || !data?.user) {
      const err = new Error(error?.message || "Failed to create employee auth user");
      err.statusCode = 500;
      throw err;
    }

    authUser = data.user;
  }

  if (authUser?.id && authUser.id !== employee.user_id) {
    await supabase.from("employees").update({ user_id: authUser.id }).eq("id", employee.id);
  }

  return authUser;
}

export async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") return ok({ ok: true });

    const tail = parseTail(event.path);

    // -------------------------
    // STAFF MANAGEMENT
    // GET /staff
    // POST /staff
    // DELETE /staff/:employeeId
    // PUT /staff/:employeeId/password
    // PUT /staff/password (fallback)
    // -------------------------
    if (tail[0] === "staff") {
      // GET /staff
      if (event.httpMethod === "GET" && tail.length === 1) {
        const { data, error } = await supabase
          .from("employees")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) return fail("Failed to fetch staff", error.message);

        const employees = (data || []).map((r) => ({
          ...r,
          full_name: r.full_name || r.name || r.employee_name || "",
          email: r.email || "",
          role: r.role || "",
          department: r.department || r.dept || "",
          status: r.status || "ACTIVE",
          created_at: r.created_at || r.joined || r.createdAt || new Date().toISOString(),
        }));

        return ok({ success: true, employees });
      }

      // POST /staff
      if (event.httpMethod === "POST" && tail.length === 1) {
        const body = await readBody(event);
        const full_name = String(body?.full_name || "").trim();
        const email = String(body?.email || "").trim().toLowerCase();
        const password = String(body?.password || "").trim();
        const phone = String(body?.phone || "").trim();
        const role = String(body?.role || "DATA_ENTRY").trim().toUpperCase();
        const department = String(body?.department || "Operations").trim();

        if (!full_name || !email || !password) return bad("full_name, email and password are required");

        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name, role, phone, department },
        });

        if (authError || !authData?.user) return fail("Failed to create auth user", authError?.message);

        const userId = authData.user.id;

        // best-effort upsert into public.users
        await supabase.from("users").upsert(
          [
            {
              id: userId,
              email,
              full_name,
              role,
              phone: phone || null,
              created_at: new Date().toISOString(),
            },
          ],
          { onConflict: "id" }
        );

        const empPayload = {
          user_id: userId,
          full_name,
          email,
          phone: phone || null,
          role,
          department,
          status: "ACTIVE",
          created_at: new Date().toISOString(),
        };

        const { data: emp, error: empErr } = await supabase
          .from("employees")
          .upsert([empPayload], { onConflict: "user_id" })
          .select("*")
          .maybeSingle();

        if (empErr) {
          try {
            await supabase.auth.admin.deleteUser(userId);
          } catch {
            // ignore
          }
          return fail("Failed to create employee", empErr.message);
        }

        await writeAudit({
          action: "STAFF_CREATE",
          entity_type: "employees",
          entity_id: emp?.id || null,
          details: { user_id: userId, email, role, department },
        });

        await notifyUser({
          user_id: userId,
          type: "WELCOME",
          title: "Welcome to the Admin Team",
          message: "Your staff account has been created. Please log in to continue.",
          link: "/employee/login",
        });

        return ok({ success: true, employee: emp || empPayload });
      }

      // PUT /staff/:employeeId/password
      if (event.httpMethod === "PUT" && tail.length === 3 && tail[2] === "password") {
        const employeeId = tail[1];
        const body = await readBody(event);
        const password = String(body?.password || "").trim();

        if (!employeeId) return bad("employeeId missing");
        if (!password || password.length < 6) return bad("Password must be at least 6 characters");

        const { data: emp, error: empErr } = await supabase
          .from("employees")
          .select("id,user_id,email,full_name")
          .eq("id", employeeId)
          .maybeSingle();

        if (empErr) return fail("Failed to fetch employee", empErr.message);
        let authUser = await resolveEmployeeAuthUser(emp);
        if (!authUser?.id) {
          try {
            authUser = await ensureEmployeeAuthUser(emp, password);
          } catch (err) {
            const statusCode = err?.statusCode || 500;
            return json(statusCode, { success: false, error: err?.message || "Auth user create failed" });
          }
        }

        const { error: updErr } = await supabase.auth.admin.updateUserById(authUser.id, { password });
        if (updErr) return fail("Failed to update password", updErr.message);

        let publicUser = null;
        try {
          publicUser = await syncPublicUserPassword(emp, authUser.id, password);
        } catch (syncErr) {
          return fail("Failed to sync public user password", syncErr?.message || String(syncErr));
        }

        await writeAudit({
          action: "STAFF_PASSWORD_CHANGE",
          entity_type: "employees",
          entity_id: employeeId,
          details: { user_id: authUser.id, public_user_id: publicUser?.id || null, email: emp.email },
        });

        return ok({ success: true });
      }

      // PUT /staff/password (fallback)
      if (event.httpMethod === "PUT" && tail.length === 2 && tail[1] === "password") {
        const body = await readBody(event);
        const employeeId = String(body?.employeeId || body?.id || "").trim();
        const password = String(body?.password || "").trim();

        if (!employeeId) return bad("employeeId missing");
        if (!password || password.length < 6) return bad("Password must be at least 6 characters");

        const { data: emp, error: empErr } = await supabase
          .from("employees")
          .select("id,user_id,email,full_name")
          .eq("id", employeeId)
          .maybeSingle();

        if (empErr) return fail("Failed to fetch employee", empErr.message);
        let authUser = await resolveEmployeeAuthUser(emp);
        if (!authUser?.id) {
          try {
            authUser = await ensureEmployeeAuthUser(emp, password);
          } catch (err) {
            const statusCode = err?.statusCode || 500;
            return json(statusCode, { success: false, error: err?.message || "Auth user create failed" });
          }
        }

        const { error: updErr } = await supabase.auth.admin.updateUserById(authUser.id, { password });
        if (updErr) return fail("Failed to update password", updErr.message);

        let publicUser = null;
        try {
          publicUser = await syncPublicUserPassword(emp, authUser.id, password);
        } catch (syncErr) {
          return fail("Failed to sync public user password", syncErr?.message || String(syncErr));
        }

        await writeAudit({
          action: "STAFF_PASSWORD_CHANGE",
          entity_type: "employees",
          entity_id: employeeId,
          details: { user_id: authUser.id, public_user_id: publicUser?.id || null, email: emp.email },
        });

        return ok({ success: true });
      }

      // DELETE /staff/:employeeId
      if (event.httpMethod === "DELETE" && tail.length === 2) {
        const employeeId = tail[1];
        if (!employeeId) return bad("employeeId missing");

        const { data: emp, error: empFetchErr } = await supabase
          .from("employees")
          .select("*")
          .eq("id", employeeId)
          .maybeSingle();

        if (empFetchErr) return fail("Failed to fetch employee", empFetchErr.message);

        const userId = emp?.user_id || null;

        const { error: delEmpErr } = await supabase.from("employees").delete().eq("id", employeeId);
        if (delEmpErr) return fail("Failed to delete employee", delEmpErr.message);

        if (userId) {
          await supabase.from("users").delete().eq("id", userId);
          try {
            await supabase.auth.admin.deleteUser(userId);
          } catch {
            // ignore
          }
        }

        await writeAudit({
          action: "STAFF_DELETE",
          entity_type: "employees",
          entity_id: employeeId,
          details: { user_id: userId || null },
        });

        return ok({ success: true });
      }

      return bad("Unsupported staff route");
    }

    // -------------------------
    // DASHBOARD DATA (ADMIN)
    // GET /dashboard/counts
    // GET /dashboard/recent-lead-purchases
    // GET /dashboard/data-entry-performance
    // -------------------------
    if (tail[0] === "dashboard") {
      if (event.httpMethod === "GET" && tail[1] === "counts") {
        const [buyersRes, productsRes, pendingKycRes] = await Promise.all([
          supabase.from("buyers").select("*", { count: "exact", head: true }),
          supabase.from("products").select("*", { count: "exact", head: true }),
          supabase
            .from("vendors")
            .select("*", { count: "exact", head: true })
            .eq("kyc_status", "SUBMITTED"),
        ]);

        if (buyersRes.error) return fail("Failed to fetch buyers count", buyersRes.error.message);
        if (productsRes.error) return fail("Failed to fetch products count", productsRes.error.message);
        if (pendingKycRes.error) return fail("Failed to fetch pending KYC count", pendingKycRes.error.message);

        return ok({
          success: true,
          counts: {
            totalBuyers: buyersRes.count || 0,
            totalProducts: productsRes.count || 0,
            pendingKyc: pendingKycRes.count || 0,
          },
        });
      }

      if (event.httpMethod === "GET" && tail[1] === "recent-lead-purchases") {
        const limit = Math.min(Number(event.queryStringParameters?.limit || 10), 50);
        const { data, error } = await supabase
          .from("lead_purchases")
          .select("id, vendor_id, amount, payment_status, purchase_date, created_at, vendor:vendors(company_name)")
          .order("purchase_date", { ascending: false })
          .limit(limit);

        if (error) return fail("Failed to fetch lead purchases", error.message);
        return ok({ success: true, orders: data || [] });
      }

      if (event.httpMethod === "GET" && tail[1] === "data-entry-performance") {
        const { data: employees, error } = await supabase
          .from("employees")
          .select("id, full_name, email, user_id, role")
          .in("role", ["DATA_ENTRY", "DATAENTRY"]);

        if (error) return fail("Failed to fetch employees", error.message);

        const performance = await Promise.all(
          (employees || []).map(async (emp) => {
            const displayName = emp.full_name || emp.email || "Data Entry";
            const authUser = await resolveEmployeeAuthUser(emp);
            const userId = authUser?.id || emp.user_id;

            if (!userId) {
              return {
                id: emp.id,
                name: displayName,
                vendorsCreated: 0,
                productsListed: 0,
                hasUserId: false,
              };
            }

            const vendorFilter = `created_by_user_id.eq.${userId},assigned_to.eq.${userId},user_id.eq.${userId}`;
            const { count: vendorCount } = await supabase
              .from("vendors")
              .select("*", { count: "exact", head: true })
              .or(vendorFilter);

            const { data: vendors } = await supabase
              .from("vendors")
              .select("id")
              .or(vendorFilter);

            let productCount = 0;
            if (vendors && vendors.length > 0) {
              const vendorIds = vendors.map((v) => v.id);
              const { count: pCount } = await supabase
                .from("products")
                .select("*", { count: "exact", head: true })
                .in("vendor_id", vendorIds);
              productCount = pCount || 0;
            } else {
              const { count: pCount, error: pErr } = await supabase
                .from("products")
                .select("*", { count: "exact", head: true })
                .eq("created_by", userId);
              if (!pErr) productCount = pCount || 0;
            }

            return {
              id: userId,
              name: displayName,
              vendorsCreated: vendorCount || 0,
              productsListed: productCount,
              hasUserId: true,
            };
          })
        );

        return ok({ success: true, performance });
      }
    }

    // -------------------------
    // BUYERS
    // GET /buyers
    // GET /buyers/list
    // PUT/PATCH /buyers/:buyerId
    // POST /buyers/:buyerId/update
    // POST /buyers/:buyerId/terminate
    // POST /buyers/:buyerId/activate
    // -------------------------
    if (tail[0] === "buyers") {
      if (
        event.httpMethod === "GET" &&
        (tail.length === 1 || (tail.length === 2 && tail[1] === "list"))
      ) {
        const parsedLimit = Number(event.queryStringParameters?.limit || 0);
        const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
          ? Math.min(parsedLimit, 2000)
          : null;

        let query = supabase
          .from("buyers")
          .select("*")
          .order("created_at", { ascending: false });

        if (safeLimit) query = query.limit(safeLimit);

        const { data, error } = await query;
        if (error) return fail("Failed to fetch buyers", error.message);

        let roleFilteredBuyers = data || [];
        try {
          const roleIdentitySets = await fetchBuyerRoleIdentitySets();
          roleFilteredBuyers = filterRowsToBuyerRole(roleFilteredBuyers, roleIdentitySets);
        } catch (roleErr) {
          return fail("Failed to filter buyers by role", roleErr?.message || String(roleErr));
        }

        return ok({ success: true, buyers: roleFilteredBuyers });
      }

      const isBuyerUpdateRoute =
        (event.httpMethod === "PUT" || event.httpMethod === "PATCH") && tail.length === 2;
      const isBuyerPostUpdateRoute =
        event.httpMethod === "POST" && tail.length === 3 && tail[2] === "update";

      if (isBuyerUpdateRoute || isBuyerPostUpdateRoute) {
        const buyerId = tail[1];
        if (!buyerId) return bad("buyerId missing");

        const { data: existing, error: findErr } = await resolveBuyerRecordForAdmin(buyerId);
        if (findErr) return fail("Failed to fetch buyer", findErr.message);
        if (!existing) return json(404, { success: false, error: "Buyer not found" });

        const body = await readBody(event);
        const rawUpdates = {
          full_name: toTrimmedTextOrNull(body?.full_name ?? body?.fullName),
          phone: toTrimmedTextOrNull(body?.phone),
          company_name: toTrimmedTextOrNull(body?.company_name ?? body?.companyName),
          address: toTrimmedTextOrNull(body?.address),
          city: toTrimmedTextOrNull(body?.city),
          state: toTrimmedTextOrNull(body?.state),
          pincode: toTrimmedTextOrNull(body?.pincode),
          pan_card: toTrimmedTextOrNull(body?.pan_card ?? body?.panCard, { upper: true }),
          gst_number: toTrimmedTextOrNull(body?.gst_number ?? body?.gstNumber, { upper: true }),
          updated_at: nowIso(),
        };
        const updates = Object.fromEntries(
          Object.entries(rawUpdates).filter(([, value]) => value !== undefined)
        );

        const { data: updated, error: updErr } = await supabase
          .from("buyers")
          .update(updates)
          .eq("id", existing.id)
          .select("*")
          .maybeSingle();

        if (updErr) return fail("Failed to update buyer", updErr.message);

        await writeAudit({
          action: "BUYER_UPDATE",
          entity_type: "buyers",
          entity_id: existing.id,
          details: { fields: Object.keys(updates) },
        });

        return ok({ success: true, buyer: updated || { ...existing, ...updates } });
      }

      if (event.httpMethod === "POST" && tail.length === 3 && tail[2] === "terminate") {
        const buyerId = tail[1];
        if (!buyerId) return bad("buyerId missing");

        const { data: existing, error: findErr } = await resolveBuyerRecordForAdmin(buyerId);
        if (findErr) return fail("Failed to fetch buyer", findErr.message);
        if (!existing) return json(404, { success: false, error: "Buyer not found" });

        const body = await readBody(event);
        const reason = String(body?.reason || "").trim();
        const updates = buildBuyerStatusUpdates(existing, { isActive: false, reason });

        const { data, error } = await supabase
          .from("buyers")
          .update(updates)
          .eq("id", existing.id)
          .select("*")
          .maybeSingle();

        if (error) return fail("Failed to terminate buyer", error.message);

        const updatedBuyer = data || { ...existing, ...updates };

        await writeAudit({
          action: "BUYER_TERMINATE",
          entity_type: "buyers",
          entity_id: existing.id,
          details: { reason: reason || null },
        });

        if (updatedBuyer?.user_id) {
          await notifyUser({
            user_id: updatedBuyer.user_id,
            type: "ACCOUNT_SUSPENDED",
            title: "Account suspended",
            message: reason || "Your buyer account has been suspended by admin.",
            link: "/buyer/tickets",
          });
        }

        return ok({ success: true, buyer: updatedBuyer });
      }

      if (event.httpMethod === "POST" && tail.length === 3 && tail[2] === "activate") {
        const buyerId = tail[1];
        if (!buyerId) return bad("buyerId missing");

        const { data: existing, error: findErr } = await resolveBuyerRecordForAdmin(buyerId);
        if (findErr) return fail("Failed to fetch buyer", findErr.message);
        if (!existing) return json(404, { success: false, error: "Buyer not found" });

        const updates = buildBuyerStatusUpdates(existing, { isActive: true });

        const { data, error } = await supabase
          .from("buyers")
          .update(updates)
          .eq("id", existing.id)
          .select("*")
          .maybeSingle();

        if (error) return fail("Failed to activate buyer", error.message);

        const updatedBuyer = data || { ...existing, ...updates };

        await writeAudit({
          action: "BUYER_ACTIVATE",
          entity_type: "buyers",
          entity_id: existing.id,
          details: {},
        });

        if (updatedBuyer?.user_id) {
          await notifyUser({
            user_id: updatedBuyer.user_id,
            type: "ACCOUNT_ACTIVATED",
            title: "Account re-activated",
            message: "Your buyer account has been activated by admin.",
            link: "/buyer/dashboard",
          });
        }

        return ok({ success: true, buyer: updatedBuyer });
      }

      return bad("Unsupported buyers route");
    }

    // -------------------------
    // GET /vendors  (with product_count + plan)
    // -------------------------
    if (event.httpMethod === "GET" && tail[0] === "vendors" && tail.length === 1) {
      const { data: vendors, error: vErr } = await supabase
        .from("vendors")
        .select("id, vendor_id, company_name, owner_name, email, phone, kyc_status, created_at, is_active")
        .order("created_at", { ascending: false });

      if (vErr) return fail("Failed to fetch vendors", vErr.message);

      // product counts
      const { data: pRows } = await supabase.from("products").select("vendor_id");
      const countMap = {};
      (pRows || []).forEach((r) => {
        if (!r.vendor_id) return;
        countMap[r.vendor_id] = (countMap[r.vendor_id] || 0) + 1;
      });

      // subscriptions + plans
      const { data: subs } = await supabase
        .from("vendor_plan_subscriptions")
        .select("vendor_id, plan_id, status, start_date, end_date")
        .order("start_date", { ascending: false });

      const activeSubByVendor = {};
      (subs || []).forEach((s) => {
        if (!s.vendor_id) return;
        if (activeSubByVendor[s.vendor_id]) return;
        if (isActiveSub(s)) activeSubByVendor[s.vendor_id] = s;
      });

      const planIds = Array.from(
        new Set(Object.values(activeSubByVendor).map((x) => x.plan_id).filter(Boolean))
      );

      let planMap = {};
      if (planIds.length) {
        const { data: plans } = await supabase
          .from("vendor_plans")
          .select("id, name, price")
          .in("id", planIds);

        (plans || []).forEach((p) => {
          planMap[p.id] = p;
        });
      }

      const result = (vendors || []).map((v) => {
        const sub = activeSubByVendor[v.id] || null;
        const plan = sub?.plan_id ? planMap[sub.plan_id] : null;
        return {
          ...v,
          product_count: countMap[v.id] || 0,
          package: plan
            ? { plan_id: plan.id, plan_name: plan.name, price: plan.price, end_date: sub?.end_date || null }
            : { plan_id: null, plan_name: "FREE", price: 0, end_date: null },
        };
      });

      return ok({ success: true, vendors: result });
    }

    // -------------------------
    // POST /vendors/:vendorId/terminate
    // -------------------------
    if (event.httpMethod === "POST" && tail[0] === "vendors" && tail[2] === "terminate") {
      const vendorId = tail[1];
      if (!vendorId) return bad("vendorId missing");
      const body = await readBody(event);
      const reason = String(body?.reason || "").trim();

      const { data, error } = await supabase
        .from("vendors")
        .update({ is_active: false })
        .eq("id", vendorId)
        .select("id, user_id, company_name, is_active")
        .maybeSingle();

      if (error) return fail("Terminate failed", error.message);

      await writeAudit({
        action: "VENDOR_TERMINATE",
        entity_type: "vendors",
        entity_id: vendorId,
        details: { reason: reason || null },
      });

      if (data?.user_id) {
        await notifyUser({
          user_id: data.user_id,
          type: "ACCOUNT_SUSPENDED",
          title: "Account suspended",
          message: reason || "Your vendor account has been suspended by admin.",
          link: "/vendor/support",
        });
      }

      return ok({ success: true, vendor: data });
    }

    // -------------------------
    // POST /vendors/:vendorId/activate
    // -------------------------
    if (event.httpMethod === "POST" && tail[0] === "vendors" && tail[2] === "activate") {
      const vendorId = tail[1];
      if (!vendorId) return bad("vendorId missing");

      const { data, error } = await supabase
        .from("vendors")
        .update({ is_active: true })
        .eq("id", vendorId)
        .select("id, user_id, company_name, is_active")
        .maybeSingle();

      if (error) return fail("Activate failed", error.message);

      await writeAudit({
        action: "VENDOR_ACTIVATE",
        entity_type: "vendors",
        entity_id: vendorId,
        details: {},
      });

      if (data?.user_id) {
        await notifyUser({
          user_id: data.user_id,
          type: "ACCOUNT_ACTIVATED",
          title: "Account re-activated",
          message: "Your vendor account has been activated by admin.",
          link: "/vendor/dashboard",
        });
      }

      return ok({ success: true, vendor: data });
    }

    // -------------------------
    // GET /vendors/:vendorId/products
    // -------------------------
    if (event.httpMethod === "GET" && tail[0] === "vendors" && tail[2] === "products") {
      const vendorId = tail[1];
      if (!vendorId) return bad("vendorId missing");

      const { data: vendor, error: vErr } = await supabase
        .from("vendors")
        .select("id, vendor_id, company_name, owner_name, email, phone, kyc_status, is_active")
        .eq("id", vendorId)
        .maybeSingle();

      if (vErr) return fail("Failed to fetch vendor", vErr.message);

      const { data: products, error: pErr } = await supabase
        .from("products")
        .select("*")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false });

      if (pErr) return fail("Failed to fetch products", pErr.message);

      const ids = (products || []).map((p) => p.id);
      let imagesByProduct = {};
      if (ids.length) {
        const { data: imgs } = await supabase
          .from("product_images")
          .select("*")
          .in("product_id", ids);
        (imgs || []).forEach((img) => {
          imagesByProduct[img.product_id] = imagesByProduct[img.product_id] || [];
          imagesByProduct[img.product_id].push(img);
        });
      }

      const out = (products || []).map((p) => ({
        ...p,
        product_images: imagesByProduct[p.id] || [],
      }));

      return ok({ success: true, vendor, products: out });
    }

    // -------------------------
    // PUT /products/:productId
    // -------------------------
    if (event.httpMethod === "PUT" && tail[0] === "products" && tail[1]) {
      const productId = tail[1];
      const body = await readBody(event);

      const allowed = [
        "name",
        "description",
        "price",
        "status",
        "moq",
        "stock",
        "is_service",
        "video_url",
        "pdf_url",
        "price_unit",
        "min_order_qty",
        "qty_unit",
        "category_path",
        "category_other",
        "head_category_id",
        "sub_category_id",
        "micro_category_id",
        "extra_micro_categories",
        "target_locations",
        "specifications",
        "images",
      ];

      const payload = {};
      allowed.forEach((k) => {
        if (body[k] !== undefined) payload[k] = body[k];
      });

      if (Object.keys(payload).length === 0) return bad("No fields to update");

      const { data, error } = await supabase
        .from("products")
        .update(payload)
        .eq("id", productId)
        .select("*")
        .maybeSingle();

      if (error) return fail("Update failed", error.message);

      await writeAudit({
        action: "PRODUCT_UPDATE",
        entity_type: "products",
        entity_id: productId,
        details: { payload },
      });

      return ok({ success: true, product: data });
    }

    // -------------------------
    // DELETE /products/:productId
    // -------------------------
    if (event.httpMethod === "DELETE" && tail[0] === "products" && tail[1]) {
      const productId = tail[1];

      // delete images rows first
      await supabase.from("product_images").delete().eq("product_id", productId);

      const { error } = await supabase.from("products").delete().eq("id", productId);
      if (error) return fail("Delete failed", error.message);

      await writeAudit({
        action: "PRODUCT_DELETE",
        entity_type: "products",
        entity_id: productId,
        details: {},
      });

      return ok({ success: true });
    }

    return json(404, { success: false, error: "Not found" });
  } catch (e) {
    return fail("Unhandled error", e?.message || String(e));
  }
}
