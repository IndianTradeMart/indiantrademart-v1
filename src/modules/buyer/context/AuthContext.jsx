import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/customSupabaseClient";
import { fetchWithCsrf } from "@/lib/fetchWithCsrf";
import { apiUrl } from "@/lib/apiBase";

const BuyerAuthContext = createContext(null);

export const useBuyerAuth = () => {
  const context = useContext(BuyerAuthContext);
  if (!context) {
    throw new Error("useBuyerAuth must be used within a BuyerAuthProvider");
  }
  return context;
};

async function fetchBuyerRow({ userId, email }) {
  // 0) server-first profile (bypasses RLS + self-heals missing link/row)
  try {
    const res = await fetchWithCsrf(apiUrl("/api/auth/buyer/profile"));
    if (res.status === 401 || res.status === 403) {
      return null;
    }
    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      const buyerFromApi =
        json?.buyer ??
        json?.data?.buyer ??
        null;
      if (buyerFromApi && typeof buyerFromApi === "object") {
        return buyerFromApi;
      }
    }
  } catch {
    // continue with direct fallback queries
  }

  // 1) best: buyers.user_id == auth user.id
  if (userId) {
    const res1 = await supabase
      .from("buyers")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (!res1.error && res1.data) return res1.data;
  }

  // 2) fallback: buyers.id == userId
  if (userId) {
    const res2 = await supabase
      .from("buyers")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (!res2.error && res2.data) return res2.data;
  }

  // 3) fallback: buyers.email == email
  if (email) {
    const res3 = await supabase
      .from("buyers")
      .select("*")
      .ilike("email", String(email))
      .maybeSingle();

    if (!res3.error && res3.data) return res3.data;
  }

  return null;
}

async function resolvePresenceUserId({ userId, email }) {
  const primaryId = String(userId || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (primaryId) {
    const { data: byId, error: byIdError } = await supabase
      .from("users")
      .select("id")
      .eq("id", primaryId)
      .maybeSingle();
    if (!byIdError && byId?.id) return String(byId.id);
  }

  if (normalizedEmail) {
    const { data: byEmail, error: byEmailError } = await supabase
      .from("users")
      .select("id")
      .ilike("email", normalizedEmail)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!byEmailError && byEmail?.id) return String(byEmail.id);
  }

  return primaryId || "";
}

const mergePresenceMeta = (existing = null, incoming = {}) => {
  if (!existing) return { ...incoming };

  const existingAt = Date.parse(existing?.at || "") || 0;
  const incomingAt = Date.parse(incoming?.at || "") || 0;
  const base = incomingAt >= existingAt ? { ...existing, ...incoming } : { ...incoming, ...existing };

  const existingOnline = typeof existing?.online === "boolean" ? existing.online : null;
  const incomingOnline = typeof incoming?.online === "boolean" ? incoming.online : null;
  if (existingOnline === true || incomingOnline === true) {
    base.online = true;
  } else if (existingOnline === false || incomingOnline === false) {
    base.online = false;
  } else {
    delete base.online;
  }

  const existingTyping = typeof existing?.typing === "boolean" ? existing.typing : null;
  const incomingTyping = typeof incoming?.typing === "boolean" ? incoming.typing : null;
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
    const normalizedKey = String(key || "").trim();

    value.forEach((entry) => {
      const meta = entry || {};
      const keys = new Set();
      const metaUserId = String(meta?.user_id || "").trim();
      if (normalizedKey) keys.add(normalizedKey);
      if (metaUserId) keys.add(metaUserId);

      const metaEmail = String(meta?.email || meta?.user_email || "").trim().toLowerCase();
      if (metaEmail) keys.add(metaEmail);

      const aliasIds = Array.isArray(meta?.alias_user_ids)
        ? meta.alias_user_ids
        : meta?.alias_user_id
          ? [meta.alias_user_id]
          : [];
      aliasIds
        .map((id) => String(id || "").trim())
        .filter(Boolean)
        .forEach((id) => keys.add(id));

      const aliasEmails = Array.isArray(meta?.alias_emails)
        ? meta.alias_emails
        : meta?.alias_email
          ? [meta.alias_email]
          : [];
      aliasEmails
        .map((email) => String(email || "").trim().toLowerCase())
        .filter(Boolean)
        .forEach((email) => keys.add(email));

      keys.forEach((resolvedKey) => {
        mapped[resolvedKey] = mergePresenceMeta(mapped[resolvedKey], meta);
      });
    });
  });

  return mapped;
};

export const BuyerAuthProvider = ({ children }) => {
  const { user, logout: baseLogout } = useAuth();
  const navigate = useNavigate();

  const [buyer, setBuyer] = useState(null);
  const [buyerLoading, setBuyerLoading] = useState(true);
  const [presenceIdentity, setPresenceIdentity] = useState({
    key: "",
    userId: "",
    aliases: [],
    email: "",
  });
  const [portalPresenceByUserId, setPortalPresenceByUserId] = useState({});

  const inFlightRef = useRef(false);
  const lastKeyRef = useRef("");
  const onlinePresenceChannelRef = useRef(null);

  /**
   * ✅ refreshBuyer supports silent mode:
   * - silent=true => NO loading blink
   * - silent=false => show loading (only initial / forced situations)
   */
  const refreshBuyer = useCallback(
    async ({ force = false, silent = false } = {}) => {
      const userId = user?.id || "";
      const email = user?.email || "";
      const key = `${userId}|${email}`;

      if (!userId && !email) {
        lastKeyRef.current = "";
        setBuyer(null);
        setBuyerLoading(false);
        return;
      }

      // already fresh, avoid extra queries
      if (!force && lastKeyRef.current === key && buyer) {
        if (!silent) setBuyerLoading(false);
        return;
      }

      if (inFlightRef.current) return;
      inFlightRef.current = true;

      // IMPORTANT: no UI blink in silent mode
      if (!silent) setBuyerLoading(true);

      try {
        const buyerRow = await fetchBuyerRow({ userId, email });

        // debug
        // eslint-disable-next-line no-console
        console.log("[BuyerAuth] refresh key:", key, "silent:", silent);
        // eslint-disable-next-line no-console
        console.log("[BuyerAuth] buyerRow:", buyerRow);

        setBuyer(buyerRow);
        lastKeyRef.current = key;
      } catch (e) {
        console.error("[BuyerAuth] refreshBuyer error:", e);
      } finally {
        inFlightRef.current = false;
        if (!silent) setBuyerLoading(false);
      }
    },
    [user?.id, user?.email, buyer]
  );

  // ✅ Initial load / user identity change (show loader once)
  useEffect(() => {
    setBuyerLoading(true);
    refreshBuyer({ force: true, silent: false }).finally(() => setBuyerLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.email]);

  // ✅ REALTIME: status change push (best case)
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`buyer-status-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "buyers",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload?.new) {
            // eslint-disable-next-line no-console
            console.log("[BuyerAuth] realtime payload:", payload);
            setBuyer(payload.new);
          } else {
            refreshBuyer({ force: true, silent: true });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, refreshBuyer]);

  // ✅ SILENT POLLING fallback (NO blink) so terminate/activate reflects quickly
  useEffect(() => {
    if (!user?.id) return;

    const interval = setInterval(() => {
      // silent refresh so UI doesn't blink
      refreshBuyer({ force: true, silent: true });
    }, 8000); // 8 sec (you can set 5000-10000)

    return () => clearInterval(interval);
  }, [user?.id, refreshBuyer]);

  useEffect(() => {
    let active = true;
    const userId = String(user?.id || "").trim();
    const authLinkedUserId = String(user?.user_id || "").trim();
    const buyerUserId = String(buyer?.user_id || "").trim();
    const buyerRowId = String(buyer?.id || "").trim();
    const email = String(user?.email || "").trim();
    const normalizedEmail = email.toLowerCase();

    if (!userId && !authLinkedUserId && !buyerUserId && !buyerRowId && !email) {
      setPresenceIdentity({ key: "", userId: "", aliases: [], email: "" });
      return () => {
        active = false;
      };
    }

    resolvePresenceUserId({ userId: userId || authLinkedUserId || buyerUserId || buyerRowId, email })
      .then((resolvedId) => {
        if (!active) return;
        const resolved = String(resolvedId || "").trim();
        const canonicalUserId = resolved || userId || authLinkedUserId || buyerUserId || buyerRowId || "";
        const primary = canonicalUserId || normalizedEmail;
        const aliases = [userId, authLinkedUserId, buyerUserId, buyerRowId, resolved]
          .map((id) => String(id || "").trim())
          .filter(Boolean)
          .filter((id) => id !== canonicalUserId);
        setPresenceIdentity({
          key: String(primary || "").trim(),
          userId: String(canonicalUserId || "").trim(),
          aliases: Array.from(new Set(aliases.map((id) => String(id || "").trim()).filter(Boolean))),
          email: normalizedEmail,
        });
      })
      .catch(() => {
        if (!active) return;
        const fallbackCanonicalUserId = userId || authLinkedUserId || buyerUserId || buyerRowId || "";
        const aliases = [userId, authLinkedUserId, buyerUserId, buyerRowId]
          .map((id) => String(id || "").trim())
          .filter(Boolean)
          .filter((id) => id !== fallbackCanonicalUserId);
        setPresenceIdentity({
          key: String(fallbackCanonicalUserId || normalizedEmail || "").trim(),
          userId: String(fallbackCanonicalUserId || "").trim(),
          aliases: Array.from(new Set(aliases)),
          email: normalizedEmail,
        });
      });

    return () => {
      active = false;
    };
  }, [user?.id, user?.user_id, user?.email, buyer?.id, buyer?.user_id]);

  // Global portal presence: keep buyer online across the whole buyer dashboard session.
  useEffect(() => {
    const presenceKey = String(presenceIdentity?.key || "").trim();
    const metaUserId = String(presenceIdentity?.userId || "").trim();
    const normalizedEmail = String(presenceIdentity?.email || "").trim().toLowerCase();
    const aliasUserIds = Array.from(
      new Set((presenceIdentity?.aliases || []).map((id) => String(id || "").trim()).filter(Boolean))
    );
    if (!presenceKey) {
      setPortalPresenceByUserId({});
      return undefined;
    }

    const buildPayload = (online) => ({
      user_id: metaUserId || null,
      email: normalizedEmail || null,
      role: "buyer",
      online,
      alias_user_ids: aliasUserIds,
      alias_emails: normalizedEmail ? [normalizedEmail] : [],
      at: new Date().toISOString(),
    });

    const channel = supabase.channel("portal-online-status", {
      config: { presence: { key: presenceKey } },
    });
    onlinePresenceChannelRef.current = channel;

    let heartbeatId = null;
    const syncPresenceState = () => {
      const mapped = mapPresenceStateWithAliases(channel.presenceState());
      setPortalPresenceByUserId(mapped);
    };

    channel
      .on("presence", { event: "sync" }, syncPresenceState)
      .on("presence", { event: "join" }, syncPresenceState)
      .on("presence", { event: "leave" }, syncPresenceState)
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
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
    (presenceIdentity?.aliases || []).join("|"),
  ]);

  const deriveBuyerActiveFromRow = useCallback((buyerRow) => {
    if (!buyerRow) return null;

    const normalizedStatus = String(buyerRow.status || "").trim().toUpperCase();

    if (buyerRow.terminated_at) return false;
    if (normalizedStatus === "TERMINATED" || normalizedStatus === "SUSPENDED" || normalizedStatus === "INACTIVE") {
      return false;
    }
    if (typeof buyerRow.is_active === "boolean") return buyerRow.is_active;
    if (normalizedStatus === "ACTIVE") return true;

    return true;
  }, []);

  const isBuyerActive = useMemo(() => {
    // buyer row is the source of truth for suspension.
    // this prevents stale token/account_status from keeping user stuck on suspended page.
    const activeFromBuyer = deriveBuyerActiveFromRow(buyer);
    if (activeFromBuyer !== null) return activeFromBuyer;

    const accountStatus = String(user?.account_status || "").trim().toUpperCase();
    if (accountStatus === "SUSPENDED" || accountStatus === "TERMINATED") return false;
    if (user?.is_active === false) return false;

    // no buyer row available yet -> do not hard-fail to suspended screen
    return true;
  }, [buyer, deriveBuyerActiveFromRow, user?.account_status, user?.is_active]);

  const logout = useCallback(async () => {
    try {
      await baseLogout();
      navigate("/buyer/login", { replace: true });
    } catch (error) {
      console.error("Logout failed", error);
    }
  }, [baseLogout, navigate]);

  const value = {
    user,
    isAuthenticated: !!user,

    buyer,
    buyerLoading,

    isBuyerActive,
    isBuyerSuspended: !isBuyerActive,

    refreshBuyer,
    logout,
    portalPresenceByUserId,
  };

  return (
    <BuyerAuthContext.Provider value={value}>
      {children}
    </BuyerAuthContext.Provider>
  );
};
