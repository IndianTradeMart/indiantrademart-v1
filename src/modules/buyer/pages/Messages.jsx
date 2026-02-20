
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { buyerApi } from '@/modules/buyer/services/buyerApi';
import { Card } from '@/shared/components/Card';
import { Loader2, MessageSquare, Send, Pencil, Trash2, Check, CheckCheck, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';
import { supabase } from '@/lib/customSupabaseClient';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useBuyerAuth } from '@/modules/buyer/context/AuthContext';

const safeDate = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString();
};

const deriveDisplayNameFromEmail = (value) => {
  const email = String(value || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return '';
  const localPart = email.split('@')[0] || '';
  const cleaned = localPart.replace(/[._-]+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const toDayKey = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatMessageTime = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDayLabel = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  const now = new Date();
  const dayStart = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayDiff = Math.round((todayStart - dayStart) / (24 * 60 * 60 * 1000));

  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  return parsed.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
};

const resolveVendorName = (row) =>
  row?.vendors?.owner_name ||
  row?.vendor_name ||
  row?.vendors?.company_name ||
  row?.vendor_company ||
  deriveDisplayNameFromEmail(row?.vendors?.email || row?.vendor_email) ||
  'Vendor';

const resolveVendorEmail = (row) =>
  row?.vendors?.email ||
  row?.vendor_email ||
  '';

const resolveVendorAvatar = (row) =>
  row?.vendors?.profile_image ||
  row?.vendor_profile_image ||
  '';

const resolveVendorCompany = (row) =>
  row?.vendors?.company_name ||
  row?.vendor_company ||
  row?.vendor_name ||
  '';

const resolveVendorVerificationLabel = (row) => {
  const badge = String(row?.vendors?.verification_badge || '').trim();
  if (badge) return badge;
  const kycStatus = String(row?.vendors?.kyc_status || '').trim().toUpperCase();
  if (row?.vendors?.is_verified === true || kycStatus === 'APPROVED') {
    return 'Verified';
  }
  return 'Unverified';
};

const isVendorVerified = (row) => {
  const badge = String(row?.vendors?.verification_badge || '').trim().toLowerCase();
  if (badge && badge !== 'unverified') return true;
  const kycStatus = String(row?.vendors?.kyc_status || '').trim().toUpperCase();
  return row?.vendors?.is_verified === true || kycStatus === 'APPROVED';
};

const maskEmail = (value) => {
  const email = String(value || '').trim();
  if (!email || !email.includes('@')) return '';
  const [localPartRaw, domainRaw] = email.split('@');
  const localPart = String(localPartRaw || '');
  const domain = String(domainRaw || '');
  const domainParts = domain.split('.');
  const domainName = String(domainParts[0] || '');
  const domainSuffix = domainParts.length > 1 ? `.${domainParts.slice(1).join('.')}` : '';

  const maskedLocal =
    localPart.length <= 2
      ? `${localPart.slice(0, 1)}*`
      : `${localPart.slice(0, 2)}${'*'.repeat(Math.max(localPart.length - 2, 3))}`;
  const maskedDomain =
    domainName.length <= 2
      ? `${domainName.slice(0, 1)}*`
      : `${domainName.slice(0, 2)}${'*'.repeat(Math.max(domainName.length - 2, 3))}`;
  return `${maskedLocal}@${maskedDomain}${domainSuffix}`;
};

const maskCompanyName = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= 2) return `${text.slice(0, 1)}*`;
  if (text.length <= 5) return `${text.slice(0, 2)}${'*'.repeat(text.length - 2)}`;
  return `${text.slice(0, 2)}${'*'.repeat(Math.max(text.length - 3, 3))}${text.slice(-1)}`;
};

const MESSAGE_MARKERS = {
  edited: /^::itm_edited::$/i,
  deliveredBuyer: /^::itm_delivered_buyer::(.+)$/i,
  deliveredVendor: /^::itm_delivered_vendor::(.+)$/i,
  readBuyer: /^::itm_read_buyer::(.+)$/i,
  readVendor: /^::itm_read_vendor::(.+)$/i,
};

const parseStoredMessage = (rawValue) => {
  const lines = String(rawValue || '').replace(/\r\n/g, '\n').split('\n');
  const contentLines = [];
  const meta = {
    edited: false,
    delivered_buyer_at: null,
    delivered_vendor_at: null,
    read_buyer_at: null,
    read_vendor_at: null,
  };

  for (const line of lines) {
    const trimmed = String(line || '').trim();

    if (MESSAGE_MARKERS.edited.test(trimmed)) {
      meta.edited = true;
      continue;
    }

    const deliveredBuyerMatch = trimmed.match(MESSAGE_MARKERS.deliveredBuyer);
    if (deliveredBuyerMatch) {
      meta.delivered_buyer_at = String(deliveredBuyerMatch[1] || '').trim() || null;
      continue;
    }

    const deliveredVendorMatch = trimmed.match(MESSAGE_MARKERS.deliveredVendor);
    if (deliveredVendorMatch) {
      meta.delivered_vendor_at = String(deliveredVendorMatch[1] || '').trim() || null;
      continue;
    }

    const readBuyerMatch = trimmed.match(MESSAGE_MARKERS.readBuyer);
    if (readBuyerMatch) {
      meta.read_buyer_at = String(readBuyerMatch[1] || '').trim() || null;
      continue;
    }

    const readVendorMatch = trimmed.match(MESSAGE_MARKERS.readVendor);
    if (readVendorMatch) {
      meta.read_vendor_at = String(readVendorMatch[1] || '').trim() || null;
      continue;
    }

    contentLines.push(line);
  }

  return {
    text: contentLines.join('\n').trimEnd(),
    meta,
  };
};

const normalizeMessageRow = (row = {}, actorUserId = '', actorRole = 'buyer') => {
  const rawMessage = String(row?.message || '');
  const parsed = parseStoredMessage(rawMessage);

  const incomingIsMe =
    typeof row?.is_me === 'boolean'
      ? row.is_me
      : actorUserId
        ? String(row?.sender_id || '').trim() === String(actorUserId).trim()
        : false;

  const recipientRole = actorRole === 'buyer' ? 'vendor' : 'buyer';
  const deliveredKey = recipientRole === 'vendor' ? 'delivered_vendor_at' : 'delivered_buyer_at';
  const readKey = recipientRole === 'vendor' ? 'read_vendor_at' : 'read_buyer_at';

  const parsedDeliveredAt = parsed.meta?.[deliveredKey] || null;
  const parsedReadAt = parsed.meta?.[readKey] || null;
  const deliveredAt = row?.delivered_at || parsedDeliveredAt || parsedReadAt || null;
  const readAt = row?.read_at || parsedReadAt || null;

  let computedState = 'sent';
  if (readAt) computedState = 'read';
  else if (deliveredAt) computedState = 'delivered';

  return {
    ...row,
    message: parsed.text,
    is_edited: typeof row?.is_edited === 'boolean' ? row.is_edited : Boolean(parsed.meta.edited),
    is_me: incomingIsMe,
    delivered_at: deliveredAt,
    read_at: readAt,
    delivery_state: row?.delivery_state || (incomingIsMe ? computedState : 'received'),
  };
};

const getAvatarInitials = (name, email) => {
  const raw = String(name || email || '').trim();
  if (!raw) return 'U';
  const words = raw.split(/\s+/).filter(Boolean);
  if (!words.length) return 'U';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
};

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

const resolvePresenceEntry = (presenceMap = {}, { userIds = [], emails = [] } = {}) => {
  const normalizedUserIds = Array.from(
    new Set((userIds || []).map((value) => String(value || '').trim()).filter(Boolean))
  );
  const normalizedEmails = Array.from(
    new Set((emails || []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))
  );

  for (const key of [...normalizedUserIds, ...normalizedEmails]) {
    if (presenceMap?.[key]) return presenceMap[key];
  }

  const entries = Object.values(presenceMap || {});
  for (const entry of entries) {
    const metaUserId = String(entry?.user_id || '').trim();
    const metaEmail = String(entry?.email || entry?.user_email || '').trim().toLowerCase();
    const aliasIds = Array.isArray(entry?.alias_user_ids)
      ? entry.alias_user_ids.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    const aliasEmails = Array.isArray(entry?.alias_emails)
      ? entry.alias_emails.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
      : [];

    if (normalizedUserIds.some((id) => id === metaUserId || aliasIds.includes(id))) {
      return entry;
    }
    if (normalizedEmails.some((email) => email === metaEmail || aliasEmails.includes(email))) {
      return entry;
    }
  }

  return null;
};

const Messages = () => {
  const { portalPresenceByUserId } = useBuyerAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [actorMessageUserId, setActorMessageUserId] = useState('');
  const [participantUserId, setParticipantUserId] = useState('');
  const [presenceByUserId, setPresenceByUserId] = useState({});
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [savingMessageId, setSavingMessageId] = useState(null);
  const [deletingMessageId, setDeletingMessageId] = useState(null);
  const [deletingConversationId, setDeletingConversationId] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const messageListRef = useRef(null);
  const syncInFlightRef = useRef(false);
  const presenceChannelRef = useRef(null);
  const typingTimerRef = useRef(null);
  const typingStateRef = useRef(false);

  const selectedChat = useMemo(
    () => conversations.find((chat) => chat.id === selectedChatId) || null,
    [conversations, selectedChatId]
  );
  const vendorName = resolveVendorName(selectedChat);
  const vendorEmail = resolveVendorEmail(selectedChat);
  const vendorAvatar = resolveVendorAvatar(selectedChat);
  const vendorCompany = resolveVendorCompany(selectedChat);
  const vendorEmailMasked = maskEmail(vendorEmail);
  const vendorCompanyMasked = maskCompanyName(vendorCompany);
  const vendorVerificationLabel = resolveVendorVerificationLabel(selectedChat);
  const vendorVerified = isVendorVerified(selectedChat);
  const resolvedActorUserId = actorMessageUserId || actorUserId;

  const participantFromMessages = useMemo(() => {
    if (!resolvedActorUserId) return '';
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const senderId = String(messages[index]?.sender_id || '').trim();
      if (senderId && senderId !== resolvedActorUserId) return senderId;
    }
    return '';
  }, [messages, resolvedActorUserId]);

  const counterpartPresenceIdentity = useMemo(
    () => ({
      userIds: [
        String(participantUserId || '').trim(),
        String(participantFromMessages || '').trim(),
        String(selectedChat?.vendors?.user_id || '').trim(),
        String(selectedChat?.vendors?.id || '').trim(),
        String(selectedChat?.vendor_id || '').trim(),
      ],
      emails: [String(vendorEmail || '').trim().toLowerCase()],
    }),
    [
      participantUserId,
      participantFromMessages,
      selectedChat?.vendors?.user_id,
      selectedChat?.vendors?.id,
      selectedChat?.vendor_id,
      vendorEmail,
    ]
  );

  const participantPresence = useMemo(
    () => resolvePresenceEntry(presenceByUserId, counterpartPresenceIdentity),
    [presenceByUserId, counterpartPresenceIdentity]
  );
  const globalParticipantPresence = useMemo(
    () => resolvePresenceEntry(portalPresenceByUserId, counterpartPresenceIdentity),
    [portalPresenceByUserId, counterpartPresenceIdentity]
  );
  const isParticipantTyping = Boolean(participantPresence?.typing);
  const localParticipantOnline = typeof participantPresence?.online === 'boolean' ? participantPresence.online : null;
  const globalParticipantOnline = typeof globalParticipantPresence?.online === 'boolean' ? globalParticipantPresence.online : null;
  const hasLocalParticipantPresence = Boolean(participantPresence);
  const hasGlobalParticipantPresence = Boolean(globalParticipantPresence);
  const isParticipantOnline = Boolean(
    (counterpartPresenceIdentity.userIds.some(Boolean) || counterpartPresenceIdentity.emails.some(Boolean)) &&
    (
      localParticipantOnline === true ||
      globalParticipantOnline === true ||
      hasLocalParticipantPresence ||
      hasGlobalParticipantPresence ||
      (localParticipantOnline === null && globalParticipantOnline === null && isParticipantTyping)
    )
  );
  const participantStatusText = isParticipantTyping ? 'Typing...' : (isParticipantOnline ? 'Online' : 'Offline');
  const selectedAvatarDotClass = isParticipantOnline ? 'bg-emerald-500' : 'bg-gray-300';

  const messageItems = useMemo(() => {
    const items = [];
    let previousDayKey = '';

    for (const row of messages) {
      const timeValue = row?.created_at || row?.updated_at || null;
      const dayKey = toDayKey(timeValue);
      if (dayKey && dayKey !== previousDayKey) {
        items.push({
          type: 'day-separator',
          id: `day-${dayKey}`,
          label: formatDayLabel(timeValue),
        });
        previousDayKey = dayKey;
      }

      items.push({
        type: 'message',
        id: `message-${row?.id || `idx-${items.length}`}`,
        value: row,
      });
    }

    return items;
  }, [messages]);

  const scrollMessagesToBottom = useCallback((behavior = 'smooth') => {
    const el = messageListRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const openImagePreview = useCallback((src, alt = 'Profile image') => {
    const normalizedSrc = String(src || '').trim();
    if (!normalizedSrc) return;
    setImagePreview({
      src: normalizedSrc,
      alt: String(alt || 'Profile image'),
    });
  }, []);

  const closeImagePreview = useCallback(() => {
    setImagePreview(null);
  }, []);

  const trackTypingPresence = useCallback(
    async (typing) => {
      const channel = presenceChannelRef.current;
      const userId = String(resolvedActorUserId || '').trim();
      if (!channel || !userId) return;
      if (typingStateRef.current === typing) return;
      typingStateRef.current = typing;
      try {
        await channel.track({
          user_id: userId,
          role: 'buyer',
          typing,
          at: new Date().toISOString(),
        });
      } catch (error) {
        console.warn('Failed to track typing presence:', error);
      }
    },
    [resolvedActorUserId]
  );

  const handleMessageInputChange = useCallback(
    (event) => {
      const value = event.target.value;
      setNewMessage(value);

      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }

      if (!value.trim()) {
        trackTypingPresence(false);
        return;
      }

      trackTypingPresence(true);
      typingTimerRef.current = setTimeout(() => {
        trackTypingPresence(false);
      }, 1200);
    },
    [trackTypingPresence]
  );

  const contextMenuStyle = useMemo(() => {
    if (!contextMenu) return null;
    const padding = 8;
    const menuWidth = 170;
    const menuHeight = contextMenu?.type === 'conversation' ? 54 : 96;
    let left = Number(contextMenu.x || 0);
    let top = Number(contextMenu.y || 0);

    if (typeof window !== 'undefined') {
      if (left + menuWidth > window.innerWidth - padding) {
        left = window.innerWidth - menuWidth - padding;
      }
      if (top + menuHeight > window.innerHeight - padding) {
        top = window.innerHeight - menuHeight - padding;
      }
    }

    return {
      left: `${Math.max(padding, left)}px`,
      top: `${Math.max(padding, top)}px`,
    };
  }, [contextMenu]);

  const acknowledgeDelivered = useCallback(async (proposalIds = []) => {
    const ids = Array.from(new Set((proposalIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
    if (!ids.length) return;

    try {
      await fetchWithCsrf(apiUrl('/api/quotation/messages/ack-delivered'), {
        method: 'POST',
        body: JSON.stringify({ proposal_ids: ids }),
      });
    } catch (error) {
      console.warn('Delivery ack failed:', error);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setActorUserId(String(data?.user?.id || ''));
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setEditingMessageId(null);
    setEditingText('');
    setSavingMessageId(null);
    setDeletingMessageId(null);
    setContextMenu(null);
  }, [selectedChatId]);

  useEffect(() => () => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!contextMenu) return undefined;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (target?.closest?.('[data-message-context-menu="true"]')) return;
      setContextMenu(null);
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setContextMenu(null);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!imagePreview) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setImagePreview(null);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [imagePreview]);

  useEffect(() => {
    if (!selectedChatId) return;
    scrollMessagesToBottom('auto');
  }, [selectedChatId, scrollMessagesToBottom]);

  useEffect(() => {
    if (!selectedChatId) return;
    scrollMessagesToBottom('smooth');
  }, [messages.length, selectedChatId, scrollMessagesToBottom]);

  const fetchConversations = async () => {
    try {
      setLoadingConversations(true);
      const proposals = await buyerApi.getProposals();
      const sorted = (Array.isArray(proposals) ? proposals : []).sort(
        (a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
      );
      setConversations(sorted);
      setSelectedChatId((prev) => {
        if (prev && sorted.some((item) => item.id === prev)) return prev;
        return sorted[0]?.id || null;
      });
      acknowledgeDelivered(sorted.map((item) => item.id));
    } catch (error) {
      console.error('Error fetching chats:', error);
      setConversations([]);
      setSelectedChatId(null);
    } finally {
      setLoadingConversations(false);
    }
  };

  const fetchMessages = useCallback(async (proposalId, { silent = false } = {}) => {
    if (!proposalId) {
      setMessages([]);
      return;
    }

    if (!silent) setLoadingMessages(true);
    try {
      const res = await fetchWithCsrf(apiUrl(`/api/quotation/${proposalId}/messages`), {
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to load messages');
      const responseActorId = String(json?.actor_user_id || '').trim();
      if (responseActorId) {
        setActorMessageUserId(responseActorId);
      }
      setParticipantUserId(String(json?.participants?.vendor_user_id || '').trim());
      const incoming = Array.isArray(json?.messages) ? json.messages : [];
      const actorId = responseActorId || resolvedActorUserId;
      setMessages(incoming.map((row) => normalizeMessageRow(row, actorId, 'buyer')));
    } catch (error) {
      console.error('Error loading messages:', error);
      if (!silent) setMessages([]);
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }, [resolvedActorUserId]);

  useEffect(() => {
    if (!selectedChatId) {
      setMessages([]);
      setParticipantUserId('');
      setPresenceByUserId({});
      return;
    }

    let active = true;
    let fallbackPollId = null;
    const presenceKey =
      String(resolvedActorUserId || '').trim() ||
      `buyer-${selectedChatId}-${Date.now()}`;
    const syncMessages = async () => {
      if (!active || syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      try {
        await fetchMessages(selectedChatId, { silent: true });
      } finally {
        syncInFlightRef.current = false;
      }
    };

    const backgroundSyncId = setInterval(() => {
      syncMessages();
    }, 1200);

    fetchMessages(selectedChatId);

    const channel = supabase
      .channel(`proposal-chat-${selectedChatId}`, {
        config: { presence: { key: presenceKey } },
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'proposal_messages',
          filter: `proposal_id=eq.${selectedChatId}`,
        },
        (payload) => {
          if (!active) return;
          const row = payload?.new;
          if (!row?.id) return;
          const normalized = normalizeMessageRow(row, resolvedActorUserId, 'buyer');
          setMessages((prev) => {
            if (prev.some((item) => item.id === row.id)) return prev;
            return [...prev, normalized];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'proposal_messages',
          filter: `proposal_id=eq.${selectedChatId}`,
        },
        (payload) => {
          if (!active) return;
          const row = payload?.new;
          if (!row?.id) return;
          const normalized = normalizeMessageRow(row, resolvedActorUserId, 'buyer');
          setMessages((prev) => {
            const idx = prev.findIndex((item) => item.id === row.id);
            if (idx === -1) return [...prev, normalized];
            const next = [...prev];
            next[idx] = normalized;
            return next;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'proposal_messages',
          filter: `proposal_id=eq.${selectedChatId}`,
        },
        (payload) => {
          if (!active) return;
          const deletedId = payload?.old?.id || payload?.new?.id;
          if (!deletedId) return;
          setMessages((prev) => prev.filter((item) => item.id !== deletedId));
        }
      )
      .on('presence', { event: 'sync' }, () => {
        if (!active) return;
        const state = channel.presenceState();
        const mapped = mapPresenceStateWithAliases(state);
        setPresenceByUserId(mapped);
      })
      .subscribe((status) => {
        if (!active) return;
        if (status === 'SUBSCRIBED') {
          presenceChannelRef.current = channel;
          typingStateRef.current = false;
          if (resolvedActorUserId) {
            channel.track({
              user_id: resolvedActorUserId,
              role: 'buyer',
              typing: false,
              at: new Date().toISOString(),
            }).catch(() => {});
          }
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (!fallbackPollId) {
            fallbackPollId = setInterval(() => {
              syncMessages();
            }, 2500);
          }
        }
        if (status === 'SUBSCRIBED' && fallbackPollId) {
          clearInterval(fallbackPollId);
          fallbackPollId = null;
        }
      });

    return () => {
      active = false;
      presenceChannelRef.current = null;
      typingStateRef.current = false;
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      setPresenceByUserId({});
      clearInterval(backgroundSyncId);
      if (fallbackPollId) clearInterval(fallbackPollId);
      supabase.removeChannel(channel);
    };
  }, [selectedChatId, fetchMessages, resolvedActorUserId]);

  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text || !selectedChatId || sending) return;

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    trackTypingPresence(false);

    setSending(true);
    try {
      const res = await fetchWithCsrf(apiUrl(`/api/quotation/${selectedChatId}/messages`), {
        method: 'POST',
        body: JSON.stringify({ message: text }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to send message');

      if (json?.message?.id) {
        const normalized = normalizeMessageRow(json.message, resolvedActorUserId, 'buyer');
        setMessages((prev) => {
          if (prev.some((item) => item.id === normalized.id)) return prev;
          return [...prev, normalized];
        });
      } else {
        await fetchMessages(selectedChatId, { silent: true });
      }

      setNewMessage('');
    } catch (error) {
      console.error('Failed to send:', error);
    } finally {
      setSending(false);
    }
  };

  const startEditing = (msg) => {
    if (!msg?.id || !msg?.is_me) return;
    setEditingMessageId(msg.id);
    setEditingText(String(msg?.message || ''));
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditingText('');
    setSavingMessageId(null);
  };

  const handleEditMessage = async () => {
    const messageId = String(editingMessageId || '').trim();
    const proposalId = String(selectedChatId || '').trim();
    const updatedText = editingText.trim();
    if (!proposalId || !messageId || !updatedText) return;

    setSavingMessageId(messageId);
    try {
      const res = await fetchWithCsrf(apiUrl(`/api/quotation/${proposalId}/messages/${messageId}`), {
        method: 'PATCH',
        body: JSON.stringify({ message: updatedText }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to edit message');

      if (json?.message?.id) {
        const normalized = normalizeMessageRow(json.message, resolvedActorUserId, 'buyer');
        setMessages((prev) => prev.map((item) => (item.id === normalized.id ? normalized : item)));
      } else {
        await fetchMessages(proposalId, { silent: true });
      }
      cancelEditing();
    } catch (error) {
      console.error('Failed to edit message:', error);
      setSavingMessageId(null);
    }
  };

  const handleDeleteMessage = async (messageId, proposalIdInput = selectedChatId) => {
    const proposalId = String(proposalIdInput || '').trim();
    const targetMessageId = String(messageId || '').trim();
    if (!proposalId || !targetMessageId || deletingMessageId) return;

    setDeletingMessageId(targetMessageId);
    try {
      const res = await fetchWithCsrf(apiUrl(`/api/quotation/${proposalId}/messages/${targetMessageId}`), {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to delete message');

      setMessages((prev) => prev.filter((item) => item.id !== targetMessageId));
      if (editingMessageId === targetMessageId) {
        cancelEditing();
      }
    } catch (error) {
      console.error('Failed to delete message:', error);
    } finally {
      setDeletingMessageId(null);
    }
  };

  const handleDeleteConversation = async (proposalIdInput) => {
    const proposalId = String(proposalIdInput || '').trim();
    if (!proposalId || deletingConversationId) return;

    setDeletingConversationId(proposalId);
    try {
      const res = await fetchWithCsrf(apiUrl(`/api/quotation/${proposalId}/messages`), {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to delete chat');

      if (String(selectedChatId || '').trim() === proposalId) {
        setMessages([]);
        cancelEditing();
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    } finally {
      setDeletingConversationId(null);
    }
  };

  const requestDeleteMessage = useCallback((messageId, proposalIdInput = selectedChatId) => {
    const proposalId = String(proposalIdInput || '').trim();
    const targetMessageId = String(messageId || '').trim();
    if (!proposalId || !targetMessageId || deletingMessageId) return;
    setConfirmDialog({
      type: 'message',
      proposalId,
      messageId: targetMessageId,
    });
  }, [selectedChatId, deletingMessageId]);

  const requestDeleteConversation = useCallback((proposalIdInput) => {
    const proposalId = String(proposalIdInput || '').trim();
    if (!proposalId || deletingConversationId) return;
    setConfirmDialog({
      type: 'conversation',
      proposalId,
    });
  }, [deletingConversationId]);

  const handleConfirmDialogAction = async () => {
    const pending = confirmDialog;
    if (!pending) return;

    if (pending.type === 'conversation') {
      await handleDeleteConversation(pending.proposalId);
    } else if (pending.type === 'message') {
      await handleDeleteMessage(pending.messageId, pending.proposalId);
    }

    setConfirmDialog(null);
  };

  const isConfirmBusy = confirmDialog?.type === 'conversation'
    ? deletingConversationId === String(confirmDialog?.proposalId || '').trim()
    : confirmDialog?.type === 'message'
      ? deletingMessageId === String(confirmDialog?.messageId || '').trim()
      : false;

  const confirmTitle = confirmDialog?.type === 'conversation' ? 'Delete chat?' : 'Delete message?';
  const confirmDescription = confirmDialog?.type === 'conversation'
    ? 'All chats in this conversation will be permanently deleted and cannot be recovered. Do you want to continue?'
    : 'This message will be permanently deleted and cannot be recovered. Do you want to continue?';

  return (
    <div className="h-[calc(100vh-140px)] flex gap-6">
      {/* Sidebar List */}
      <Card className="w-1/3 flex flex-col overflow-hidden border-gray-200">
        <div className="p-4 border-b bg-gray-50">
          <h2 className="font-bold text-gray-800">Conversations</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingConversations ? (
             <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-gray-400" /></div>
          ) : conversations.length === 0 ? (
             <div className="p-6 text-center text-gray-500">No active proposals</div>
          ) : (
              conversations.map(chat => (
                <button
                  key={chat.id} 
                  type="button"
                  onClick={() => setSelectedChatId(chat.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setSelectedChatId(chat.id);
                    setContextMenu({
                      type: 'conversation',
                      proposalId: String(chat?.id || '').trim(),
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                   className={`w-full p-4 border-b text-left cursor-pointer hover:bg-blue-50 transition-colors ${selectedChat?.id === chat.id ? 'bg-blue-50 border-l-4 border-l-[#003D82]' : ''}`}
                 >
                  {(() => {
                    const conversationName = resolveVendorName(chat);
                    const conversationEmail = resolveVendorEmail(chat);
                    const conversationAvatar = resolveVendorAvatar(chat);
                    const conversationPresenceIdentity = {
                      userIds: [
                        String(chat?.vendors?.user_id || '').trim(),
                        String(chat?.vendors?.id || '').trim(),
                        String(chat?.vendor_id || '').trim(),
                      ],
                      emails: [String(conversationEmail || '').trim().toLowerCase()],
                    };
                    const isSelectedConversation = selectedChat?.id === chat.id;
                    const conversationPresence = resolvePresenceEntry(presenceByUserId, conversationPresenceIdentity);
                    const conversationGlobalPresence = resolvePresenceEntry(portalPresenceByUserId, conversationPresenceIdentity);
                    const conversationLocalOnline =
                      typeof conversationPresence?.online === 'boolean' ? conversationPresence.online : null;
                    const conversationGlobalOnline =
                      typeof conversationGlobalPresence?.online === 'boolean' ? conversationGlobalPresence.online : null;
                    const conversationHasLocalPresence = Boolean(conversationPresence);
                    const conversationHasGlobalPresence = Boolean(conversationGlobalPresence);
                    const conversationIsOnline = isSelectedConversation
                      ? isParticipantOnline
                      : Boolean(
                        (conversationPresenceIdentity.userIds.some(Boolean) || conversationPresenceIdentity.emails.some(Boolean)) &&
                        (
                          conversationLocalOnline === true ||
                          conversationGlobalOnline === true ||
                          conversationHasLocalPresence ||
                          conversationHasGlobalPresence
                        )
                      );
                    const conversationDotClass = conversationIsOnline ? 'bg-emerald-500' : 'bg-gray-300';

                    return (
                      <div className="flex items-start gap-3">
                        <div className="relative shrink-0">
                          <Avatar
                            className={`h-10 w-10 border border-gray-200 ${conversationAvatar ? 'cursor-zoom-in' : ''}`}
                            onClick={() => {
                              if (!conversationAvatar) return;
                              setSelectedChatId(chat.id);
                              openImagePreview(conversationAvatar, conversationName);
                            }}
                          >
                            {conversationAvatar ? <AvatarImage src={conversationAvatar} alt={conversationName} /> : null}
                            <AvatarFallback className="bg-blue-50 text-[#003D82]">
                              {getAvatarInitials(conversationName, conversationEmail)}
                            </AvatarFallback>
                          </Avatar>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${conversationDotClass}`}
                            aria-hidden="true"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-2 mb-1">
                            <span className="font-semibold text-gray-900 text-sm truncate">{conversationName}</span>
                            <span className="text-[10px] text-gray-400 shrink-0">{safeDate(chat?.created_at)}</span>
                          </div>
                          <p className="text-xs text-gray-500 truncate">{chat?.product_name || chat?.title || 'Proposal conversation'}</p>
                        </div>
                      </div>
                    );
                  })()}
                </button>
             ))
          )}
        </div>
      </Card>

      {/* Chat Area */}
      <Card className="flex-1 flex flex-col overflow-hidden border-gray-200 shadow-sm">
        {selectedChat ? (
          <>
            <div className="p-4 border-b bg-white flex items-start justify-between gap-3 shadow-sm z-10">
              <div className="min-w-0 flex items-start gap-3 flex-1">
                <div className="relative shrink-0">
                  <Avatar
                    className={`h-11 w-11 border border-gray-200 ${vendorAvatar ? 'cursor-zoom-in' : ''}`}
                    onClick={() => openImagePreview(vendorAvatar, vendorName)}
                  >
                    {vendorAvatar ? <AvatarImage src={vendorAvatar} alt={vendorName} /> : null}
                    <AvatarFallback className="bg-blue-50 text-[#003D82]">
                      {getAvatarInitials(vendorName, vendorEmail)}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${selectedAvatarDotClass}`}
                    aria-hidden="true"
                  />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-gray-900 truncate">{vendorName}</h3>
                  <p className="text-xs text-gray-500 truncate">{vendorEmailMasked || 'No email available'}</p>
                  <p className="text-xs text-gray-500 truncate">{vendorCompanyMasked || 'No company available'}</p>
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    vendorVerified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {vendorVerificationLabel}
                </span>
                <p className={`text-xs ${isParticipantTyping ? 'text-[#003D82]' : 'text-gray-500'}`}>
                  {participantStatusText}
                </p>
              </div>
            </div>

            <div ref={messageListRef} className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-3">
              {loadingMessages ? (
                <div className="h-full flex items-center justify-center text-gray-400">
                  <Loader2 className="animate-spin mr-2 h-4 w-4" />
                  Loading messages...
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-gray-400 mt-10">Start the conversation...</div>
              ) : (
                messageItems.map((entry) => {
                  if (entry.type === 'day-separator') {
                    return (
                      <div key={entry.id} className="flex justify-center py-1">
                        <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] text-gray-500">
                          {entry.label}
                        </span>
                      </div>
                    );
                  }

                  const msg = entry.value;
                  const isMe = !!msg?.is_me;
                  const isEditing = editingMessageId === msg.id;
                  const isSavingThis = savingMessageId === msg.id;
                  const tickState = String(msg?.delivery_state || 'sent').toLowerCase();
                  const TickIcon = tickState === 'sent' ? Check : CheckCheck;
                  const tickTitle = tickState === 'read' ? 'Read' : tickState === 'delivered' ? 'Delivered' : 'Sent';
                  const tickClass = tickState === 'read' ? 'text-sky-300' : 'text-blue-100';
                  const messageTime = formatMessageTime(msg?.created_at || msg?.updated_at);
                  const canOpenContextMenu = isMe && !isEditing;

                  return (
                    <div key={entry.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div
                        onContextMenu={(event) => {
                          if (!canOpenContextMenu) return;
                          event.preventDefault();
                          setContextMenu({
                            type: 'message',
                            messageId: msg.id,
                            x: event.clientX,
                            y: event.clientY,
                          });
                        }}
                        className={`max-w-[70%] px-4 py-2 rounded-xl text-sm ${
                          isMe ? 'bg-[#003D82] text-white rounded-tr-none' : 'bg-white border text-gray-800 rounded-tl-none'
                        }`}
                      >
                        {isEditing ? (
                          <div className="space-y-2">
                            <Input
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEditMessage();
                                if (e.key === 'Escape') cancelEditing();
                              }}
                              className="h-9 bg-white text-gray-900"
                              autoFocus
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={cancelEditing}
                                className="inline-flex items-center gap-1 text-xs font-medium text-blue-100 hover:text-white"
                                disabled={isSavingThis}
                              >
                                <X className="h-3.5 w-3.5" />
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleEditMessage}
                                className="inline-flex items-center gap-1 text-xs font-medium text-blue-100 hover:text-white disabled:opacity-60"
                                disabled={isSavingThis || !editingText.trim()}
                              >
                                {isSavingThis ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                            <div className={`mt-1 flex items-center gap-2 text-[11px] ${isMe ? 'justify-end text-blue-100' : 'text-gray-500'}`}>
                              {messageTime ? <span>{messageTime}</span> : null}
                              {msg?.is_edited ? <span>edited</span> : null}
                              {isMe ? (
                                <span className={`inline-flex items-center ${tickClass}`} title={tickTitle}>
                                  <TickIcon className="h-3.5 w-3.5" />
                                </span>
                              ) : null}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 bg-white border-t flex gap-2">
              <Input 
                value={newMessage} 
                onChange={handleMessageInputChange}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Type a message..." 
                className="flex-1"
              />
              <Button onClick={handleSend} size="icon" className="bg-[#003D82]" disabled={sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>

            {contextMenu && contextMenuStyle ? (
              <div
                data-message-context-menu="true"
                className="fixed z-50 min-w-[170px] rounded-lg border border-gray-200 bg-white p-1.5 shadow-xl"
                style={contextMenuStyle}
              >
                {contextMenu.type === 'conversation' ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
                    onClick={async () => {
                      const proposalId = String(contextMenu?.proposalId || '').trim();
                      setContextMenu(null);
                      requestDeleteConversation(proposalId);
                    }}
                    disabled={deletingConversationId === String(contextMenu?.proposalId || '').trim()}
                  >
                    {deletingConversationId === String(contextMenu?.proposalId || '').trim() ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Delete Chat
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => {
                        const selectedMessage = messages.find((item) => item.id === contextMenu.messageId);
                        if (selectedMessage) {
                          startEditing(selectedMessage);
                        }
                        setContextMenu(null);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                      onClick={() => {
                        requestDeleteMessage(contextMenu.messageId, selectedChatId);
                        setContextMenu(null);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
             <MessageSquare className="h-16 w-16 mb-4 opacity-20" />
             <p>Select a conversation to view messages</p>
          </div>
        )}
      </Card>
      {imagePreview ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          onClick={closeImagePreview}
        >
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${imagePreview.src})` }}
            aria-hidden="true"
          />
          <div className="absolute inset-0 bg-black/45 backdrop-blur-md" aria-hidden="true" />
          <button
            type="button"
            onClick={closeImagePreview}
            className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/30 z-10"
            aria-label="Close image preview"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="relative z-10 w-full max-w-sm rounded-xl bg-white p-3 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={imagePreview.src}
              alt={imagePreview.alt}
              className="w-full max-h-[320px] rounded-lg object-contain bg-slate-50"
            />
            <p className="mt-2 text-sm font-semibold text-slate-900 text-center truncate">
              {imagePreview.alt || 'Profile image'}
            </p>
          </div>
        </div>
      ) : null}
      <AlertDialog
        open={Boolean(confirmDialog)}
        onOpenChange={(open) => {
          if (!open && !isConfirmBusy) setConfirmDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isConfirmBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={isConfirmBusy}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDialogAction();
              }}
            >
              {isConfirmBusy ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </span>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Messages;
