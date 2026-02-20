import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { vendorApi } from '@/modules/vendor/services/vendorApi';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

const canonicalizeRole = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  if (raw === 'AUTHENTICATED' || raw === 'ANON' || raw === 'ANONYMOUS' || raw === 'USER') return '';
  if (raw === 'DATAENTRY') return 'DATA_ENTRY';
  return raw;
};

async function resolvePresenceUserId({ userId, email }) {
  const primaryId = String(userId || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (primaryId) {
    const { data: byId, error: byIdError } = await supabase
      .from('users')
      .select('id')
      .eq('id', primaryId)
      .maybeSingle();
    if (!byIdError && byId?.id) return String(byId.id);
  }

  if (normalizedEmail) {
    const { data: byEmail, error: byEmailError } = await supabase
      .from('users')
      .select('id')
      .ilike('email', normalizedEmail)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!byEmailError && byEmail?.id) return String(byEmail.id);
  }

  return primaryId || '';
}

const mergePresenceMeta = (existing = null, incoming = {}) => {
  if (!existing) return { ...incoming };

  const existingAt = Date.parse(existing?.at || '') || 0;
  const incomingAt = Date.parse(incoming?.at || '') || 0;
  const base = incomingAt >= existingAt ? { ...existing, ...incoming } : { ...incoming, ...existing };

  const existingOnline = typeof existing?.online === 'boolean' ? existing.online : null;
  const incomingOnline = typeof incoming?.online === 'boolean' ? incoming.online : null;
  if (existingOnline === true || incomingOnline === true) {
    base.online = true;
  } else if (existingOnline === false || incomingOnline === false) {
    base.online = false;
  } else {
    delete base.online;
  }

  const existingTyping = typeof existing?.typing === 'boolean' ? existing.typing : null;
  const incomingTyping = typeof incoming?.typing === 'boolean' ? incoming.typing : null;
  if (existingTyping === true || incomingTyping === true) {
    base.typing = true;
  } else if (existingTyping === false || incomingTyping === false) {
    base.typing = false;
  } else {
    delete base.typing;
  }

  return base;
};

const mapPresenceStateWithAliases = (state = {}) => {
  const mapped = {};
  Object.entries(state || {}).forEach(([key, value]) => {
    if (!Array.isArray(value) || !value.length) return;
    const normalizedKey = String(key || '').trim();

    value.forEach((entry) => {
      const meta = entry || {};
      const keys = new Set();
      const metaUserId = String(meta?.user_id || '').trim();
      if (normalizedKey) keys.add(normalizedKey);
      if (metaUserId) keys.add(metaUserId);

      const metaEmail = String(meta?.email || meta?.user_email || '').trim().toLowerCase();
      if (metaEmail) keys.add(metaEmail);

      const aliasIds = Array.isArray(meta?.alias_user_ids)
        ? meta.alias_user_ids
        : meta?.alias_user_id
          ? [meta.alias_user_id]
          : [];
      aliasIds
        .map((id) => String(id || '').trim())
        .filter(Boolean)
        .forEach((id) => keys.add(id));

      const aliasEmails = Array.isArray(meta?.alias_emails)
        ? meta.alias_emails
        : meta?.alias_email
          ? [meta.alias_email]
          : [];
      aliasEmails
        .map((email) => String(email || '').trim().toLowerCase())
        .filter(Boolean)
        .forEach((email) => keys.add(email));

      keys.forEach((resolvedKey) => {
        mapped[resolvedKey] = mergePresenceMeta(mapped[resolvedKey], meta);
      });
    });
  });

  return mapped;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // ✅ combined auth user + vendor profile
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [presenceIdentity, setPresenceIdentity] = useState({
    key: '',
    userId: '',
    aliases: [],
    email: '',
  });
  const [portalPresenceByUserId, setPortalPresenceByUserId] = useState({});
  const onlinePresenceChannelRef = useRef(null);

  // ✅ Refresh user (auth + vendor profile)
  const refreshUser = useCallback(async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (!session?.user) {
        setUser(null);
        setIsAuthenticated(false);
        return null;
      }

      const role = canonicalizeRole(
        session.user?.role ||
        session.user?.user_metadata?.role ||
        session.user?.app_metadata?.role
      );

      // Strict single-session portal behavior:
      // only VENDOR role can remain authenticated in vendor context.
      if (role !== 'VENDOR') {
        setUser(null);
        setIsAuthenticated(false);
        return null;
      }

      // vendorApi.auth.me() already merges vendors table info
      let me = null;
      try {
        me = await vendorApi.auth.me();
      } catch {
        me = null;
      }

      if (!me) {
        setUser(null);
        setIsAuthenticated(false);
        return null;
      }

      const finalUser = { ...me, role: 'VENDOR' };

      setUser(finalUser);
      setIsAuthenticated(true);
      return finalUser;
    } catch (err) {
      console.error('refreshUser failed:', err);
      setUser(null);
      setIsAuthenticated(false);
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      setUser(null);
      setIsAuthenticated(false);
    }
  }, []);

  // ✅ Boot + Auth change listener
  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      try {
        if (!mounted) return;
        await refreshUser();
      } finally {
        if (mounted) setLoading(false);
      }
    };

    boot();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;

      if (session?.user) {
        await refreshUser();
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe?.();
    };
  }, [refreshUser]);

  // ✅ Profile update event (Profile page save/upload ke baad header refresh)
  useEffect(() => {
    const onProfileUpdated = () => refreshUser();
    window.addEventListener('vendor_profile_updated', onProfileUpdated);
    return () => window.removeEventListener('vendor_profile_updated', onProfileUpdated);
  }, [refreshUser]);

  useEffect(() => {
    let active = true;
    const userId = String(user?.user_id || user?.id || '').trim();
    const authUserId = String(user?.id || '').trim();
    const vendorUserId = String(user?.user_id || '').trim();
    const vendorRowId = String(user?.vendor_id || user?.id || '').trim();
    const email = String(user?.email || '').trim();
    const normalizedEmail = email.toLowerCase();

    if (!userId && !authUserId && !vendorUserId && !vendorRowId && !email) {
      setPresenceIdentity({ key: '', userId: '', aliases: [], email: '' });
      return () => {
        active = false;
      };
    }

    resolvePresenceUserId({ userId: userId || authUserId || vendorUserId || vendorRowId, email })
      .then((resolvedId) => {
        if (!active) return;
        const resolved = String(resolvedId || '').trim();
        const canonicalUserId = resolved || userId || authUserId || vendorUserId || vendorRowId || '';
        const primary = canonicalUserId || normalizedEmail;
        const aliases = [userId, authUserId, vendorUserId, vendorRowId, resolved]
          .map((id) => String(id || '').trim())
          .filter(Boolean)
          .filter((id) => id !== canonicalUserId);
        setPresenceIdentity({
          key: String(primary || '').trim(),
          userId: String(canonicalUserId || '').trim(),
          aliases: Array.from(new Set(aliases.map((id) => String(id || '').trim()).filter(Boolean))),
          email: normalizedEmail,
        });
      })
      .catch(() => {
        if (!active) return;
        const fallbackCanonicalUserId = userId || authUserId || vendorUserId || vendorRowId || '';
        const aliases = [userId, authUserId, vendorUserId, vendorRowId]
          .map((id) => String(id || '').trim())
          .filter(Boolean)
          .filter((id) => id !== fallbackCanonicalUserId);
        setPresenceIdentity({
          key: String(fallbackCanonicalUserId || normalizedEmail || '').trim(),
          userId: String(fallbackCanonicalUserId || '').trim(),
          aliases: Array.from(new Set(aliases)),
          email: normalizedEmail,
        });
      });

    return () => {
      active = false;
    };
  }, [user?.id, user?.user_id, user?.vendor_id, user?.email]);

  // Global portal presence: keep vendor online across full vendor session.
  useEffect(() => {
    const presenceKey = String(presenceIdentity?.key || '').trim();
    const metaUserId = String(presenceIdentity?.userId || '').trim();
    const normalizedEmail = String(presenceIdentity?.email || '').trim().toLowerCase();
    const aliasUserIds = Array.from(
      new Set((presenceIdentity?.aliases || []).map((id) => String(id || '').trim()).filter(Boolean))
    );
    if (!presenceKey) {
      setPortalPresenceByUserId({});
      return undefined;
    }

    const buildPayload = (online) => ({
      user_id: metaUserId || null,
      email: normalizedEmail || null,
      role: 'vendor',
      online,
      alias_user_ids: aliasUserIds,
      alias_emails: normalizedEmail ? [normalizedEmail] : [],
      at: new Date().toISOString(),
    });

    const channel = supabase.channel('portal-online-status', {
      config: { presence: { key: presenceKey } },
    });
    onlinePresenceChannelRef.current = channel;

    let heartbeatId = null;
    const syncPresenceState = () => {
      const mapped = mapPresenceStateWithAliases(channel.presenceState());
      setPortalPresenceByUserId(mapped);
    };

    channel
      .on('presence', { event: 'sync' }, syncPresenceState)
      .on('presence', { event: 'join' }, syncPresenceState)
      .on('presence', { event: 'leave' }, syncPresenceState)
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        syncPresenceState();
        channel.track(buildPayload(true)).catch(() => {});
        heartbeatId = window.setInterval(() => {
          channel.track(buildPayload(true)).catch(() => {});
        }, 20000);
      });

    return () => {
      if (heartbeatId) {
        window.clearInterval(heartbeatId);
      }
      setPortalPresenceByUserId({});
      supabase.removeChannel(channel);
      if (onlinePresenceChannelRef.current === channel) {
        onlinePresenceChannelRef.current = null;
      }
    };
  }, [
    presenceIdentity?.key,
    presenceIdentity?.userId,
    presenceIdentity?.email,
    (presenceIdentity?.aliases || []).join('|'),
  ]);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, isAuthenticated, refreshUser, logout, portalPresenceByUserId }}>
      {children}
    </AuthContext.Provider>
  );
};
