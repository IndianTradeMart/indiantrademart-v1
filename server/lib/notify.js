import { supabase } from "./supabaseClient.js";

const nowIso = () => new Date().toISOString();

const normalizeRole = (role) => String(role || "").trim().toUpperCase();

const buildNotification = ({ user_id, type, title, message, link }) => ({
  user_id,
  type: type || "INFO",
  title: title || "Notification",
  message: message || "",
  link: link || null,
  is_read: false,
  created_at: nowIso(),
});

export async function notifyUser(payload) {
  try {
    const userId = payload?.user_id;
    if (!userId) return null;
    const { data, error } = await supabase
      .from("notifications")
      .insert([buildNotification(payload)])
      .select()
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

export async function notifyUsers(userIds = [], payload) {
  try {
    const ids = Array.from(new Set((userIds || []).filter(Boolean)));
    if (!ids.length) return [];
    const rows = ids.map((id) => buildNotification({ ...payload, user_id: id }));
    const { data, error } = await supabase
      .from("notifications")
      .insert(rows)
      .select();
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

export async function notifyRole(role, payload) {
  try {
    const r = normalizeRole(role);
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
    return notifyUsers(activeIds, payload);
  } catch {
    return [];
  }
}
