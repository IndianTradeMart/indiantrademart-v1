import { supabase } from '@/lib/customSupabaseClient';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export const isAlreadyRegisteredError = (error) => {
  const msg = String(error?.message || error || '').toLowerCase();
  if (!msg) return false;
  return msg.includes('already') && (msg.includes('register') || msg.includes('exist'));
};

export const getAuthUserOrThrow = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error('Not authenticated');
  return user;
};

const fetchBuyerFromApi = async () => {
  try {
    const res = await fetchWithCsrf(apiUrl('/api/auth/buyer/profile'));
    if (!res.ok) return null;
    const json = await res.json().catch(() => ({}));
    return json?.buyer || null;
  } catch {
    return null;
  }
};

const fetchBuyerFromAuthMe = async () => {
  try {
    const res = await fetchWithCsrf(apiUrl('/api/auth/me'));
    if (!res.ok) return null;
    const json = await res.json().catch(() => ({}));
    return json?.buyer || null;
  } catch {
    return null;
  }
};

const fetchBuyerFromSupabase = async (user) => {
  if (!user?.id && !user?.email) return null;

  if (user?.id) {
    const { data } = await supabase
      .from('buyers')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) return data;
  }

  if (user?.id) {
    const { data } = await supabase
      .from('buyers')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (data) return data;
  }

  const email = normalizeEmail(user?.email);
  if (email) {
    const { data } = await supabase
      .from('buyers')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    if (data) return data;
  }

  return null;
};

export const resolveBuyerProfile = async ({ required = false } = {}) => {
  const user = await getAuthUserOrThrow();

  let buyer = await fetchBuyerFromApi();
  if (!buyer) buyer = await fetchBuyerFromAuthMe();
  if (!buyer) buyer = await fetchBuyerFromSupabase(user);

  if (!buyer && required) {
    throw new Error('Buyer profile not found');
  }

  return buyer || null;
};

export const resolveBuyerId = async ({ required = true } = {}) => {
  const buyer = await resolveBuyerProfile({ required });
  const buyerId = buyer?.id || null;

  if (!buyerId && required) {
    throw new Error('Buyer profile not found');
  }

  return buyerId;
};
