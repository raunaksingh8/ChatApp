import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  ArrowLeft,
  Clock,
  ShieldCheck,
  Wifi,
  WifiOff,
  UserPlus,
  Users,
  Inbox,
  UserX,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  X,
  Smile,
  CornerUpLeft,
  MoreVertical,
  Shield,
  Info,
  User,
  Download
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePWA } from '../context/PWAContext';
import { messageAPI, contactAPI, profileAPI, blockAPI } from '../services/api';
import { initSocket, getSocket } from '../services/socket';
import { setAppBadge } from '../services/appBadge';
import { ContactCache } from '../services/contactCache';
import { syncPushSubscriptionIfGranted } from '../services/pushNotifications';
import AddContactModal from '../components/AddContactModal';
import ProfileModal from '../components/ProfileModal';
import BlockedUsersModal from '../components/BlockedUsersModal';
import UserProfileModal from '../components/UserProfileModal';
import EmojiPicker from '../components/EmojiPicker';
import InAppToast from '../components/InAppToast';
import MessageBubbleItem from '../components/MessageBubbleItem';
import MessageActionPortal from '../components/MessageActionPortal';
import '../styles/Chat.css';
import '../styles/Contacts.css';
import '../styles/Profile.css';

export const Chat = () => {
  const { user, token } = useAuth();
  const { isOnline } = usePWA();

  // Contact & Conversation states
  const [contacts, setContacts] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searchContactQuery, setSearchContactQuery] = useState('');
  const [inputText, setInputText] = useState('');
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Stage 3: Profile & Block states
  const [myProfile, setMyProfile] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isBlockedUsersOpen, setIsBlockedUsersOpen] = useState(false);
  const [isContactInfoOpen, setIsContactInfoOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef(null);

  // Stage 3: Advanced Messaging states
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [typingContact, setTypingContact] = useState(null); // { userId, isTyping }
  const [unreadCounts, setUnreadCounts] = useState({}); // contactId -> count
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [contextMenuState, setContextMenuState] = useState(null); // { msg, rect }

  // Track pending optimistic messages by temp ID so we can reconcile
  const optimisticIdsRef = useRef(new Set());

  // UI state
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [incomingExpanded, setIncomingExpanded] = useState(true);
  // loadingContacts: true while the first API fetch is in-flight.
  // Starts false — set to false immediately when cached contacts are loaded,
  // so returning users see contacts instantly.
  const [loadingContacts, setLoadingContacts] = useState(false);
  // showSkeleton: true only when no cached contacts exist (first-time user).
  // Skeletons appear immediately and disappear when the first API response arrives.
  const [showSkeleton, setShowSkeleton] = useState(false);
  // Separate states for conversation operations (avoiding a single global loading state)
  const [initialLoadingMessages, setInitialLoadingMessages] = useState(false);
  const [isSyncingMessages, setIsSyncingMessages] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [requestActionLoading, setRequestActionLoading] = useState(null);

  const messagesEndRef = useRef(null);
  const selectedUserRef = useRef(null);
  selectedUserRef.current = selectedUser;
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const isFetchingContactsRef = useRef(false);
  const lastContactFetchTimeRef = useRef(0);
  const isSyncingMessagesRef = useRef(false);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);
  const sendingRef = useRef(false);

  // Restore focus to message composer without stealing focus if user clicked elsewhere
  const restoreComposerFocus = useCallback(() => {
    const active = document.activeElement;
    const isComposer = active === inputRef.current;
    const isBody = !active || active === document.body;
    const isSendBtn =
      active?.classList?.contains('btn-send-message') ||
      Boolean(active?.closest?.('.btn-send-message'));

    if (isComposer || isBody || isSendBtn) {
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus({ preventScroll: true });
        }
      });
    }
  }, []);

  const messagesContainerRef = useRef(null);

  // Auto-scroll helper: returns true if viewport is within threshold pixels of bottom
  const isNearBottom = useCallback((threshold = 120) => {
    const el = messagesContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  }, []);

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    if (messagesContainerRef.current) {
      if (behavior === 'auto') {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      } else {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }
  }, []);

  // ── Visibility-based message expiry & read receipts ───────────────────────
  const viewedMessageIdsRef = useRef(new Set());
  const pendingViewTimersRef = useRef(new Map());
  const batchQueueRef = useRef(new Set());
  const batchFlushTimerRef = useRef(null);

  const flushViewedBatch = useCallback(() => {
    if (batchQueueRef.current.size === 0) return;
    const idsToFlush = Array.from(batchQueueRef.current);
    batchQueueRef.current.clear();

    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('message_viewed', { message_ids: idsToFlush });
    }

    messageAPI.markMessagesViewed(idsToFlush).catch((err) => {
      console.warn('markMessagesViewed API warning:', err.message);
    });
  }, []);

  const queueMessageViewed = useCallback((msgId) => {
    if (!msgId || viewedMessageIdsRef.current.has(msgId)) return;
    viewedMessageIdsRef.current.add(msgId);

    const nowIso = new Date().toISOString();
    const expiresAtIso = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === msgId) {
          return {
            ...m,
            status: 'read',
            opened_at: m.opened_at || nowIso,
            expiry_started_at: m.expiry_started_at || nowIso,
            expires_at: m.expires_at || expiresAtIso
          };
        }
        return m;
      })
    );

    batchQueueRef.current.add(msgId);
    if (!batchFlushTimerRef.current) {
      batchFlushTimerRef.current = setTimeout(() => {
        batchFlushTimerRef.current = null;
        flushViewedBatch();
      }, 50);
    }
  }, [flushViewedBatch]);

  // Handle mobile visual viewport & virtual keyboard (WhatsApp-like behavior)
  useEffect(() => {
    const handleViewport = () => {
      const vv = window.visualViewport;
      const height = vv ? vv.height : window.innerHeight;
      document.documentElement.style.setProperty('--visual-viewport-height', `${height}px`);

      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    handleViewport();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewport);
      window.visualViewport.addEventListener('scroll', handleViewport);
    }
    window.addEventListener('resize', handleViewport);
    window.addEventListener('orientationchange', handleViewport);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewport);
        window.visualViewport.removeEventListener('scroll', handleViewport);
      }
      window.removeEventListener('resize', handleViewport);
      window.removeEventListener('orientationchange', handleViewport);
    };
  }, []);

  // Manage mobile-chat-open class on body
  useEffect(() => {
    if (selectedUser) {
      document.body.classList.add('mobile-chat-open');
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      document.body.classList.remove('mobile-chat-open');
    }
    return () => {
      document.body.classList.remove('mobile-chat-open');
    };
  }, [selectedUser?.id]);

  // Close user profile dropdown on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target)) {
        setUserDropdownOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Close message contextual menu on Escape
  useEffect(() => {
    if (!contextMenuState) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setContextMenuState(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenuState]);

  // Reply selection handler for swipe, long-press, or hover click
  const handleSelectReply = useCallback((msg) => {
    if (!msg) return;
    const isSentByMe = msg.sender_id === user?.id;
    const senderName = isSentByMe
      ? 'You'
      : (selectedUser?.display_name || selectedUser?.username || 'Contact');
    setReplyingTo({
      id: msg.id,
      sender_name: senderName,
      message_text: msg.message_text
    });
    inputRef.current?.focus();
  }, [user?.id, selectedUser]);

  // Scroll to original message when tapping quoted preview
  const scrollToOriginalMessage = useCallback((targetMessageId) => {
    if (!targetMessageId) return;
    const targetEl = document.getElementById(`msg-bubble-${targetMessageId}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.classList.remove('highlight-reply-target');
      void targetEl.offsetWidth; // trigger reflow for pulse animation
      targetEl.classList.add('highlight-reply-target');
      setTimeout(() => {
        targetEl.classList.remove('highlight-reply-target');
      }, 1600);
    }
  }, []);

  // Load current user's profile
  const fetchMyProfile = useCallback(async () => {
    try {
      const data = await profileAPI.getMe();
      if (data.success && data.profile) {
        setMyProfile(data.profile);
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  }, []);

  // Cache-first instant contact load on startup
  useEffect(() => {
    let isMounted = true;
    if (!user?.id) return;

    (async () => {
      try {
        const cached = await ContactCache.get(user.id);
        if (!isMounted) return;
        if (cached && Array.isArray(cached) && cached.length > 0) {
          // Immediately display previously cached contacts without waiting for backend
          setContacts(cached);
          setShowSkeleton(false);
          setLoadingContacts(false);
        } else {
          // First-time user with no cache: show skeleton until initial API response arrives
          setShowSkeleton(true);
          setLoadingContacts(true);
        }
      } catch (err) {
        if (!isMounted) return;
        setShowSkeleton(true);
        setLoadingContacts(true);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  // Load accepted contacts from backend and synchronize to IndexedDB cache
  const fetchContacts = useCallback(async (options = {}) => {
    const { force = false } = options;
    const now = Date.now();

    // Prevent duplicate concurrent requests or rapid duplicate calls (< 2 seconds) unless forced
    if (isFetchingContactsRef.current) return;
    if (!force && now - lastContactFetchTimeRef.current < 2000) return;

    isFetchingContactsRef.current = true;
    lastContactFetchTimeRef.current = now;

    try {
      const data = await contactAPI.getContacts();
      if (data.success && Array.isArray(data.contacts)) {
        // Backend already returns contacts ordered by last_activity_at DESC.
        // Apply the same client-side sort for consistency with real-time updates.
        const sorted = [...data.contacts].sort((a, b) => {
          const tA = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
          const tB = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
          return tB - tA;
        });
        setContacts(sorted);
        if (userRef.current?.id) {
          ContactCache.set(userRef.current.id, sorted);
        }
        if (selectedUserRef.current && !sorted.some((c) => c.id === selectedUserRef.current.id)) {
          setSelectedUser(null);
        }
      }
    } catch (err) {
      console.error('Failed to load contacts:', err);
      // On error (e.g. offline or cold start timeout), do NOT overwrite valid contacts
    } finally {
      isFetchingContactsRef.current = false;
      setLoadingContacts(false);
      setShowSkeleton(false);
    }
  }, []);

  // Load incoming pending contact requests
  const fetchIncomingRequests = useCallback(async () => {
    try {
      const data = await contactAPI.getIncoming();
      if (data.success && Array.isArray(data.requests)) {
        setIncomingRequests(data.requests);
      }
    } catch (err) {
      console.error('Failed to load incoming requests:', err);
    }
  }, []);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const data = await messageAPI.getUnreadCount();
      if (data.success) setTotalUnreadCount(data.count || 0);
    } catch (err) {
      console.error('Failed to refresh unread count:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchMyProfile();
    fetchContacts();
    fetchIncomingRequests();
    refreshUnreadCount();
    syncPushSubscriptionIfGranted();
  }, [fetchMyProfile, fetchContacts, fetchIncomingRequests, refreshUnreadCount]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('chat:notifications', { detail: { incoming: incomingRequests } }));
  }, [incomingRequests]);

  useEffect(() => {
    setAppBadge(totalUnreadCount);
  }, [totalUnreadCount]);

  // Open conversation when user taps a push notification (?user=<senderId>)
  useEffect(() => {
    if (!contacts || contacts.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const targetUserId = params.get('user');
    if (targetUserId) {
      const targetContact = contacts.find((c) => c.id === targetUserId);
      if (targetContact && selectedUserRef.current?.id !== targetContact.id) {
        setSelectedUser(targetContact);
        window.history.replaceState({}, '', '/chat');
      }
    }
  }, [contacts]);

  // Open conversation when user taps a push notification while app is already open in background
  useEffect(() => {
    const handleSWMessage = (event) => {
      if (event.data?.type === 'open_conversation' && event.data?.senderId) {
        const targetId = event.data.senderId;
        const targetContact = contacts.find((c) => c.id === targetId);
        if (targetContact) {
          setSelectedUser(targetContact);
        }
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
    }
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      }
    };
  }, [contacts]);

  // Background conversation synchronization when reconnecting or coming back online.
  // Preserves existing visible messages, deduplicates, and avoids disrupting scroll position.
  const syncConversation = useCallback(async (contactId) => {
    if (!contactId || isSyncingMessagesRef.current) return;
    isSyncingMessagesRef.current = true;
    setIsSyncingMessages(true);
    try {
      const data = await messageAPI.getConversation(contactId);
      if (data.success && Array.isArray(data.messages)) {
        const normalized = data.messages.map((m) => {
          if (m.sender_id === userRef.current?.id && m.status !== 'read') {
            return { ...m, status: 'sent' };
          }
          return m;
        });

        setMessages((prevMessages) => {
          if (!prevMessages || prevMessages.length === 0) {
            return normalized;
          }

          const msgMap = new Map();
          for (const m of prevMessages) {
            msgMap.set(m.id, m);
          }

          let hasDiff = false;
          for (const serverMsg of normalized) {
            const existing = msgMap.get(serverMsg.id);
            if (!existing) {
              msgMap.set(serverMsg.id, serverMsg);
              hasDiff = true;
            } else {
              if (
                existing.status !== serverMsg.status ||
                existing.expires_at !== serverMsg.expires_at ||
                JSON.stringify(existing.reactions || []) !== JSON.stringify(serverMsg.reactions || [])
              ) {
                msgMap.set(serverMsg.id, { ...existing, ...serverMsg });
                hasDiff = true;
              }
            }
          }

          const now = Date.now();
          for (const [id, m] of msgMap.entries()) {
            if (m.expires_at && new Date(m.expires_at).getTime() <= now) {
              msgMap.delete(id);
              hasDiff = true;
            }
          }

          // If content didn't change, preserve previous array reference to avoid re-renders & keep scroll
          if (!hasDiff && msgMap.size === prevMessages.length) {
            return prevMessages;
          }

          return Array.from(msgMap.values()).sort((a, b) => {
            const tA = new Date(a.created_at || a.delivered_at || 0).getTime();
            const tB = new Date(b.created_at || b.delivered_at || 0).getTime();
            return tA - tB;
          });
        });
      }
    } catch (err) {
      console.error('Failed to sync conversation:', err);
    } finally {
      isSyncingMessagesRef.current = false;
      setIsSyncingMessages(false);
    }
  }, []);

  useEffect(() => {
    const handleReconnect = () => {
      const socket = getSocket();
      if (socket && !socket.connected) {
        socket.connect();
      }
      fetchMyProfile();
      fetchContacts();
      fetchIncomingRequests();
      refreshUnreadCount();
      if (selectedUserRef.current) {
        syncConversation(selectedUserRef.current.id);
      }
    };

    window.addEventListener('online', handleReconnect);
    return () => window.removeEventListener('online', handleReconnect);
  }, [fetchMyProfile, fetchContacts, fetchIncomingRequests, syncConversation, refreshUnreadCount]);

  const selectedUserId = selectedUser?.id;

  // Fetch conversation ONLY when selected contact ID changes.
  // Ordinary online/offline presence changes or other user refreshes DO NOT trigger this effect.
  useEffect(() => {
    setSendError('');
    setReplyingTo(null);
    setIsEmojiPickerOpen(false);
    setHeaderMenuOpen(false);
    setTypingContact(null);

    // Reset visibility tracking for newly selected conversation
    viewedMessageIdsRef.current.clear();
    for (const [id, timerId] of pendingViewTimersRef.current.entries()) {
      clearTimeout(timerId);
    }
    pendingViewTimersRef.current.clear();

    if (!selectedUserId) {
      setMessages([]);
      // Notify backend conversation closed
      const socket = getSocket();
      if (socket && socket.connected) {
        socket.emit('conversation_closed');
      }
      return;
    }

    // Notify backend that this conversation is now open (delivers pending incoming messages)
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('conversation_opened', { partnerId: selectedUserId });
    }

    // Clear unread count for this contact
    setUnreadCounts((prev) => ({ ...prev, [selectedUserId]: 0 }));

    let isMounted = true;
    const fetchConversation = async () => {
      setInitialLoadingMessages(true);
      try {
        const data = await messageAPI.getConversation(selectedUserId);
        if (isMounted && data.success && Array.isArray(data.messages)) {
          const normalized = data.messages.map((m) => {
            if (m.sender_id === userRef.current?.id && m.status !== 'read') {
              return { ...m, status: 'sent' };
            }
            return m;
          });

          // Pre-populate viewed messages with already active/started expiry
          for (const m of normalized) {
            if (m.expiry_started_at || m.expires_at) {
              viewedMessageIdsRef.current.add(m.id);
            }
          }

          setMessages(normalized);

          // Scroll immediately to bottom on initial conversation load
          requestAnimationFrame(() => {
            scrollToBottom('auto');
          });

          refreshUnreadCount();
        }
      } catch (err) {
        console.error('Failed to fetch conversation:', err);
        if (isMounted) {
          const msg = err.response?.data?.message || 'Unable to load conversation.';
          setSendError(msg);
        }
      } finally {
        if (isMounted) setInitialLoadingMessages(false);
      }
    };

    fetchConversation();

    return () => {
      isMounted = false;
    };
  }, [selectedUserId, refreshUnreadCount, scrollToBottom]);

  // Socket.IO lifecycle and real-time listeners
  useEffect(() => {
    if (!token) return;

    const socket = initSocket(token);
    const reportVisibility = () => {
      if (!socket) return;
      const isForeground = document.visibilityState === 'visible';
      socket.emit('app_visibility', { isForeground });
      if (isForeground) {
        fetchContacts();
      }
    };

    if (socket) {
      setSocketConnected(socket.connected);

      reportVisibility();
      document.addEventListener('visibilitychange', reportVisibility);

      socket.on('connect', () => {
        setSocketConnected(true);
        reportVisibility();
        fetchContacts();
        fetchIncomingRequests();
        refreshUnreadCount();
        if (selectedUserRef.current) {
          syncConversation(selectedUserRef.current.id);
        }
      });

      socket.on('disconnect', () => {
        setSocketConnected(false);
      });

      // Real-time new message received
      socket.on('new_message', (newMsg) => {
        const activeContact = selectedUserRef.current;

        // If part of active chat
        if (
          activeContact &&
          (newMsg.sender_id === activeContact.id || newMsg.receiver_id === activeContact.id)
        ) {
          const wasNearBottom = isNearBottom(120);
          setMessages((prev) => {
            // Skip if already in list (real or optimistic that was reconciled)
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            // If this is confirming one of our optimistic sends (same sender, same text,
            // close timestamp), the reconcile() in the ack handler handles it.
            // Here we only add truly incoming messages OR our own from other tabs.
            return [...prev, newMsg];
          });

          // Auto-scroll to bottom only if user was already reading near bottom or it is user's own message
          if (wasNearBottom || newMsg.sender_id === userRef.current?.id) {
            requestAnimationFrame(() => {
              scrollToBottom('smooth');
            });
          }
          // Note: Message is NOT marked as read here!
          // Expiry and read receipt are only triggered when recipient actually views it for 500ms via IntersectionObserver.
        } else if (newMsg.sender_id !== user?.id) {
          // Increment unread count for the sender
          setUnreadCounts((prev) => ({
            ...prev,
            [newMsg.sender_id]: (prev[newMsg.sender_id] || 0) + 1
          }));

          // Trigger In-App Toast notification (Feature 9)
          setContacts((prevContacts) => {
            const sender = prevContacts.find((c) => c.id === newMsg.sender_id);
            const senderName = sender?.display_name || sender?.username || 'New message';

            setToasts((prevToasts) => [
              ...prevToasts.slice(-3),
              {
                id: `msg-${newMsg.id}-${Date.now()}`,
                type: 'message',
                senderId: newMsg.sender_id,
                title: senderName,
                body: newMsg.message_text,
                avatarUrl: sender?.avatar_url
              }
            ]);

            return prevContacts;
          });
        }

        // Update preview in contacts list AND bubble it to the top (sort by latest activity)
        setContacts((prevContacts) => {
          const partnerId = newMsg.sender_id === userRef.current?.id
            ? newMsg.receiver_id
            : newMsg.sender_id;
          const now = newMsg.created_at || new Date().toISOString();
          const updated = prevContacts.map((c) => {
            if (c.id === partnerId) {
              return {
                ...c,
                last_activity_at: now,
                lastMessagePreview: newMsg.message_text,
                lastMessageTime: new Date(now).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })
              };
            }
            return c;
          });
          // Sort: contacts with most recent activity first; contacts with no activity last
          return [...updated].sort((a, b) => {
            const tA = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
            const tB = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
            return tB - tA;
          });
        });
      });

      socket.on('unread_count_updated', ({ count }) => {
        setTotalUnreadCount(count || 0);
      });

      // Delivery receipt
      socket.on('message_delivered', (deliveredData) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === deliveredData.id) {
              return {
                ...m,
                status: deliveredData.status,
                delivered_at: deliveredData.delivered_at,
                expires_at: deliveredData.expires_at
              };
            }
            return m;
          })
        );
      });

      // Read receipt (Feature 4): Double sky-blue tick + starts active expiry countdown
      socket.on('message_read', ({ readerId, messageIds, message_id, messages: updatedMsgs, expires_at, expiry_started_at }) => {
        const idsToMark = messageIds || (message_id ? [message_id] : []);
        setMessages((prev) =>
          prev.map((m) => {
            const shouldMark = idsToMark.length === 0 || idsToMark.includes(m.id);
            if (shouldMark) {
              const matchingRow = updatedMsgs?.find((u) => u.id === m.id);
              const newExpiresAt = matchingRow?.expires_at || expires_at || m.expires_at;
              const newExpiryStartedAt = matchingRow?.expiry_started_at || expiry_started_at || m.expiry_started_at;
              return {
                ...m,
                status: 'read',
                expires_at: newExpiresAt,
                expiry_started_at: newExpiryStartedAt
              };
            }
            return m;
          })
        );
      });

      // Typing indicator event (Feature 3)
      socket.on('user_typing', ({ userId, is_typing }) => {
        const activeContact = selectedUserRef.current;
        if (activeContact && activeContact.id === userId) {
          setTypingContact(is_typing ? userId : null);
        }
      });

      // Server-side message expired
      socket.on('message_expired', ({ messageId }) => {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      });

      // User presence status changed
      socket.on('user_status_changed', ({ userId, is_online, last_seen }) => {
        setContacts((prevContacts) =>
          prevContacts.map((c) => {
            if (c.id === userId) {
              return { ...c, is_online, last_seen: last_seen || c.last_seen };
            }
            return c;
          })
        );

        if (selectedUserRef.current && selectedUserRef.current.id === userId) {
          setSelectedUser((prev) => {
            if (!prev || prev.id !== userId) return prev;
            if (prev.is_online === is_online && prev.last_seen === (last_seen || prev.last_seen)) {
              return prev;
            }
            return { ...prev, is_online, last_seen: last_seen || prev.last_seen };
          });
        }
      });

      // Real-time contact request events
      socket.on('contact_request_received', (data) => {
        fetchIncomingRequests();
        const requesterName = data?.requester?.display_name || data?.requester?.username || 'Someone';
        setToasts((prev) => [
          ...prev.slice(-3),
          {
            id: `req-${Date.now()}`,
            type: 'contact_request',
            title: 'Contact Request',
            body: `${requesterName} sent you a contact request.`,
            avatarUrl: data?.requester?.avatar_url
          }
        ]);
      });

      socket.on('contact_request_accepted', (data) => {
        fetchContacts();
        fetchIncomingRequests();
        const partnerName = data?.requester?.username === user?.username
          ? (data?.recipient?.display_name || data?.recipient?.username)
          : (data?.requester?.display_name || data?.requester?.username);
        setToasts((prev) => [
          ...prev.slice(-3),
          {
            id: `acc-${Date.now()}`,
            type: 'contact_accepted',
            title: 'Contact Accepted',
            body: `You and ${partnerName} are now connected!`,
            avatarUrl: data?.recipient?.avatar_url
          }
        ]);
      });

      socket.on('contact_request_rejected', () => {
        fetchIncomingRequests();
      });

      socket.on('contact_removed', ({ removedUserId }) => {
        fetchContacts();
        if (selectedUserRef.current && selectedUserRef.current.id === removedUserId) {
          setSelectedUser(null);
          setMessages([]);
        }
      });

      socket.on('user_blocked', ({ blockedUserId }) => {
        fetchContacts();
        if (selectedUserRef.current && selectedUserRef.current.id === blockedUserId) {
          setSelectedUser(null);
          setMessages([]);
        }
      });

      socket.on('user_unblocked', () => {
        fetchContacts();
      });

      // Real-time reaction updates
      socket.on('message_reaction_updated', ({ messageId, reactions }) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === messageId) return { ...m, reactions };
            return m;
          })
        );
      });
    }

    return () => {
      if (socket) {
        document.removeEventListener('visibilitychange', reportVisibility);
        socket.off('connect');
        socket.off('disconnect');
        socket.off('new_message');
        socket.off('unread_count_updated');
        socket.off('message_delivered');
        socket.off('message_read');
        socket.off('user_typing');
        socket.off('message_expired');
        socket.off('user_status_changed');
        socket.off('contact_request_received');
        socket.off('contact_request_accepted');
        socket.off('contact_request_rejected');
        socket.off('contact_removed');
        socket.off('user_blocked');
        socket.off('user_unblocked');
        socket.off('message_reaction_updated');
      }
    };
  }, [token, user?.id, fetchContacts, fetchIncomingRequests, refreshUnreadCount, syncConversation]);

  // Live timer tick every 1 second to update countdowns and clean expired messages
  useEffect(() => {
    const timerInterval = setInterval(() => {
      const now = Date.now();
      setCurrentTime(now);

      // Clean up expired messages whose expires_at has passed (only create new array if expired)
      setMessages((prev) => {
        const hasExpired = prev.some((m) => m.expires_at && new Date(m.expires_at).getTime() <= now);
        if (!hasExpired) return prev;
        return prev.filter((m) => !m.expires_at || new Date(m.expires_at).getTime() > now);
      });
    }, 1000);

    return () => clearInterval(timerInterval);
  }, []);

  // ── IntersectionObserver for Message Visibility-Based Expiry & Read Receipts ──
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || !selectedUserId || !user?.id) return;

    // Clear all pending timers on visibilitychange when app/tab becomes hidden
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        for (const [id, timerId] of pendingViewTimersRef.current.entries()) {
          clearTimeout(timerId);
        }
        pendingViewTimersRef.current.clear();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const observer = new IntersectionObserver(
      (entries) => {
        if (document.visibilityState !== 'visible') return;

        for (const entry of entries) {
          const row = entry.target;
          const msgId = row.dataset.messageId;
          const receiverId = row.dataset.receiverId;
          const expiryStarted = row.dataset.expiryStarted === 'true';

          if (!msgId || receiverId !== user.id || expiryStarted || viewedMessageIdsRef.current.has(msgId)) {
            continue;
          }

          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            // Message is >=50% visible in active viewport -> start 500ms timer
            if (!pendingViewTimersRef.current.has(msgId)) {
              const timerId = setTimeout(() => {
                pendingViewTimersRef.current.delete(msgId);
                // Confirm tab is still visible when 500ms elapses
                if (document.visibilityState === 'visible') {
                  queueMessageViewed(msgId);
                  observer.unobserve(row);
                }
              }, 500);
              pendingViewTimersRef.current.set(msgId, timerId);
            }
          } else {
            // Left viewport or ratio < 0.5 before 500ms elapsed -> cancel timer
            if (pendingViewTimersRef.current.has(msgId)) {
              clearTimeout(pendingViewTimersRef.current.get(msgId));
              pendingViewTimersRef.current.delete(msgId);
            }
          }
        }
      },
      {
        root: container,
        threshold: 0.5
      }
    );

    // Observe unviewed received message rows
    const rows = container.querySelectorAll('.message-row.received[data-message-id]');
    for (const row of rows) {
      const msgId = row.dataset.messageId;
      const expiryStarted = row.dataset.expiryStarted === 'true';
      if (!expiryStarted && !viewedMessageIdsRef.current.has(msgId)) {
        observer.observe(row);
      }
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      observer.disconnect();
      for (const [id, timerId] of pendingViewTimersRef.current.entries()) {
        clearTimeout(timerId);
      }
      pendingViewTimersRef.current.clear();
    };
  }, [selectedUserId, messages, user?.id, queueMessageViewed]);

  // Typing event handler with 2s debounce
  const handleInputChange = (e) => {
    const text = e.target.value;
    setInputText(text);

    if (inputRef.current) {
      inputRef.current.style.height = '44px';
      if (inputRef.current.scrollHeight > 44) {
        inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
        inputRef.current.style.overflowY = inputRef.current.scrollHeight > 120 ? 'auto' : 'hidden';
      } else {
        inputRef.current.style.overflowY = 'hidden';
      }
    }

    if (!selectedUser) return;
    const socket = getSocket();
    if (!socket || !socket.connected) return;

    // Emit typing_start
    socket.emit('typing_start', { receiver_id: selectedUser.id });

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set auto-stop timeout after 2 seconds
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing_stop', { receiver_id: selectedUser.id });
    }, 2000);
  };

  // Insert emoji at cursor position
  const handleSelectEmoji = (emoji) => {
    setInputText((prev) => prev + emoji);
    inputRef.current?.focus();
  };

  // Accept incoming contact request
  const handleAcceptRequest = async (requestId) => {
    setRequestActionLoading(requestId);
    setSendError('');
    try {
      const data = await contactAPI.acceptRequest(requestId);
      if (data.success) {
        fetchContacts();
        fetchIncomingRequests();
      }
    } catch (err) {
      console.error('Accept request error:', err);
    } finally {
      setRequestActionLoading(null);
    }
  };

  // Reject incoming contact request
  const handleRejectRequest = async (requestId) => {
    setRequestActionLoading(requestId);
    setSendError('');
    try {
      const data = await contactAPI.rejectRequest(requestId);
      if (data.success) {
        fetchIncomingRequests();
      }
    } catch (err) {
      console.error('Reject request error:', err);
    } finally {
      setRequestActionLoading(null);
    }
  };

  // Remove existing contact
  const handleRemoveContact = async (e, contact) => {
    e.stopPropagation();
    const confirmed = window.confirm(`Remove ${contact.display_name || contact.username} from your contacts?`);
    if (!confirmed) return;

    try {
      const data = await contactAPI.removeContact(contact.id);
      if (data.success) {
        if (selectedUser?.id === contact.id) {
          setSelectedUser(null);
          setMessages([]);
        }
        fetchContacts();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to remove contact.');
    }
  };

  // Block contact from conversation header menu
  const handleBlockUser = async (userId) => {
    try {
      const data = await blockAPI.blockUser(userId);
      if (data.success) {
        setIsContactInfoOpen(false);
        setHeaderMenuOpen(false);
        setSelectedUser(null);
        setMessages([]);
        fetchContacts();
        alert('User blocked successfully.');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to block user.');
    }
  };

  useEffect(() => {
    const handleNavigationAction = (event) => {
      const { type, requestId } = event.detail || {};
      if (type === 'accept-request') handleAcceptRequest(requestId);
      if (type === 'reject-request') handleRejectRequest(requestId);
      if (type === 'open-profile') setIsProfileOpen(true);
      if (type === 'open-blocked-users') setIsBlockedUsersOpen(true);
    };
    window.addEventListener('chat:navigation-action', handleNavigationAction);
    return () => window.removeEventListener('chat:navigation-action', handleNavigationAction);
  }, [incomingRequests]);

  // Send message handler with optimistic UI + replies + error handling
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!isOnline) {
      setSendError('You are currently offline. Internet access is required to send messages.');
      return;
    }
    const trimmed = inputText.trim();
    if (!trimmed || !selectedUser || sendingRef.current) return;

    sendingRef.current = true;
    setSending(true);
    setSendError('');
    setIsEmojiPickerOpen(false);

    const socket = getSocket();
    const replyId = replyingTo?.id || null;
    const replySnapshot = replyingTo ? { ...replyingTo } : null;

    // Stop typing indicator immediately
    if (socket && socket.connected) {
      socket.emit('typing_stop', { receiver_id: selectedUser.id });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    // ── Optimistic message ─────────────────────────────────────────────────
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticMsg = {
      id: tempId,
      _optimistic: true,
      sender_id: user?.id,
      receiver_id: selectedUser.id,
      message_text: trimmed,
      status: 'pending',
      created_at: new Date().toISOString(),
      reply_to_message_id: replyId,
      reply_sender_display_name: replySnapshot?.sender_name || null,
      reply_message_text: replySnapshot?.message_text || null,
      reactions: []
    };

    optimisticIdsRef.current.add(tempId);
    setMessages((prev) => [...prev, optimisticMsg]);
    requestAnimationFrame(() => {
      scrollToBottom('smooth');
    });

    // Clear composer immediately so the user can type the next message
    setInputText('');
    setReplyingTo(null);
    restoreComposerFocus();

    // ── Function to reconcile optimistic → real message ──────────────────
    const reconcile = (realMsg) => {
      optimisticIdsRef.current.delete(tempId);
      setMessages((prev) => {
        // Once backend confirms persistence, status is sent (single tick) or read (double tick)
        const updatedStatus = realMsg.status === 'read' ? 'read' : 'sent';
        const reconciledItem = {
          ...realMsg,
          status: updatedStatus,
          _optimistic: false,
          _failed: false
        };
        const hasReal = prev.some((m) => m.id === realMsg.id);
        if (hasReal) {
          return prev.map((m) => (m.id === realMsg.id ? reconciledItem : m)).filter((m) => m.id !== tempId);
        }
        return prev.map((m) => (m.id === tempId ? reconciledItem : m));
      });
    };

    const markFailed = () => {
      optimisticIdsRef.current.delete(tempId);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, _failed: true, _optimistic: false } : m))
      );
      setSendError('Failed to send message. Click the alert icon on the message to retry.');
    };

    try {
      if (socket && socket.connected) {
        socket.emit(
          'send_message',
          {
            receiver_id: selectedUser.id,
            message_text: trimmed,
            reply_to_message_id: replyId,
            client_temp_id: tempId
          },
          (ack) => {
            sendingRef.current = false;
            setSending(false);
            if (ack && ack.success && ack.message) {
              reconcile(ack.message);
              setSendError('');
            } else {
              markFailed();
            }
          }
        );
      } else {
        // Fallback to REST API
        const data = await messageAPI.sendMessage(selectedUser.id, trimmed, replyId);
        sendingRef.current = false;
        setSending(false);
        if (data.success && data.message) {
          reconcile(data.message);
          setSendError('');
        } else {
          markFailed();
        }
      }
    } catch (err) {
      console.error('Send message error:', err);
      sendingRef.current = false;
      setSending(false);
      markFailed();
    }
  };

  // Retry sending a failed message
  const handleRetrySend = useCallback((failedMsg) => {
    if (!failedMsg || !selectedUser) return;
    setMessages((prev) => prev.filter((m) => m.id !== failedMsg.id));
    setInputText(failedMsg.message_text);
    if (failedMsg.reply_to_message_id) {
      setReplyingTo({
        id: failedMsg.reply_to_message_id,
        sender_name: failedMsg.reply_sender_display_name || 'Contact',
        message_text: failedMsg.reply_message_text || ''
      });
    }
    inputRef.current?.focus();
  }, [selectedUserId]);

  // Format countdown remaining for delivered messages
  const formatExpiryCountdown = (expiresAt) => {
    if (!expiresAt) return null;
    const diffMs = new Date(expiresAt).getTime() - currentTime;
    const remainingSeconds = Math.max(0, Math.floor(diffMs / 1000));

    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  // Format message timestamp
  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Handle emoji reaction on a message via Socket.IO (optimistic update)
  const handleReact = useCallback(async (messageId, emoji) => {
    const myId = user?.id;

    // Optimistic UI update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const existing = Array.isArray(m.reactions) ? m.reactions : [];
        let hadReaction = false;

        const updated = existing.map((r) => {
          const hasMe = Array.isArray(r.users) && r.users.some((u) => u.id === myId);
          if (r.emoji === emoji && hasMe) {
            // Toggle off: remove user from this emoji
            hadReaction = true;
            const newUsers = r.users.filter((u) => u.id !== myId);
            return newUsers.length > 0 ? { ...r, count: r.count - 1, users: newUsers } : null;
          }
          if (hasMe) {
            // Switch emoji: remove from previous reaction
            const newUsers = r.users.filter((u) => u.id !== myId);
            return newUsers.length > 0 ? { ...r, count: r.count - 1, users: newUsers } : null;
          }
          return r;
        }).filter(Boolean);

        if (!hadReaction) {
          const meUser = { id: myId, username: user?.username, display_name: user?.display_name };
          const idx = updated.findIndex((r) => r.emoji === emoji);
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], count: updated[idx].count + 1, users: [...updated[idx].users, meUser] };
          } else {
            updated.push({ emoji, count: 1, users: [meUser] });
          }
        }
        return { ...m, reactions: updated };
      })
    );

    // Persist via Socket.IO
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('toggle_reaction', { message_id: messageId, emoji }, (ack) => {
        if (ack && ack.success && Array.isArray(ack.reactions)) {
          // Server is authoritative — replace optimistic with server state
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, reactions: ack.reactions } : m))
          );
        }
      });
    } else {
      // REST fallback when socket is unavailable
      try {
        const data = await messageAPI.toggleReaction(messageId, emoji);
        if (data && data.success && Array.isArray(data.reactions)) {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, reactions: data.reactions } : m))
          );
        }
      } catch (err) {
        console.error('Reaction REST error:', err);
      }
    }
  }, [user]);

  // Filter contacts locally by search query
  const filteredContacts = contacts.filter((c) => {
    const q = searchContactQuery.toLowerCase();
    return (
      c.username.toLowerCase().includes(q) ||
      (c.display_name && c.display_name.toLowerCase().includes(q))
    );
  });

  return (
    <div className={`chat-app-layout ${selectedUser ? 'mobile-conversation-active' : ''}`}>
      {/* ================= In-App Toast Notifications ================= */}
      <div className="toasts-wrapper">
        {toasts.map((toast) => (
          <InAppToast
            key={toast.id}
            notification={toast}
            onOpen={(t) => {
              if (t.senderId) {
                const contact = contacts.find((c) => c.id === t.senderId);
                if (contact) setSelectedUser(contact);
              } else if (t.type === 'contact_request') {
                setIncomingExpanded(true);
              }
            }}
            onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
          />
        ))}
      </div>

      {/* ================= Left Sidebar ================= */}
      <aside className="chat-sidebar">
        {/* Profile Header with Dropdown */}
        <div className="sidebar-header">
          <div className="user-profile-dropdown-wrapper" ref={userDropdownRef}>
            <div
              className="user-profile-summary clickable"
              onClick={() => setUserDropdownOpen((prev) => !prev)}
              title="Click for profile options"
              role="button"
              tabIndex={0}
              aria-haspopup="true"
              aria-expanded={userDropdownOpen}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setUserDropdownOpen((prev) => !prev);
                }
              }}
            >
              <div className="user-avatar-large">
                <div className="user-avatar-inner">
                  {myProfile?.avatar_url ? (
                    <img src={myProfile.avatar_url} alt={myProfile.username} className="avatar-img-cover" />
                  ) : (
                    <span>{(myProfile?.display_name || user?.username || 'U').charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <span className={`avatar-online-dot ${socketConnected ? '' : 'offline'}`} />
              </div>
              <div className="user-info-text">
                <span className="user-info-name">
                  {myProfile?.display_name || user?.username || 'You'}
                </span>
                <span className="user-info-status">
                  {socketConnected ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Wifi size={12} /> Online
                    </span>
                  ) : !isOnline ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-muted)' }}>
                      <WifiOff size={12} /> Offline (Cached)
                    </span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-muted)' }}>
                      <WifiOff size={12} /> Connecting...
                    </span>
                  )}
                </span>
              </div>
              <ChevronDown size={14} className={`user-dropdown-caret ${userDropdownOpen ? 'open' : ''}`} />
            </div>

            {userDropdownOpen && (
              <div className="user-profile-dropdown-menu">
                <button
                  type="button"
                  className="user-dropdown-item"
                  onClick={() => {
                    setUserDropdownOpen(false);
                    setIsProfileOpen(true);
                  }}
                >
                  <User size={15} />
                  <span>About / My Profile</span>
                </button>
                <button
                  type="button"
                  className="user-dropdown-item"
                  onClick={() => {
                    setUserDropdownOpen(false);
                    setIsBlockedUsersOpen(true);
                  }}
                >
                  <Shield size={15} />
                  <span>Blocked Users</span>
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Visible + Add Contact Button */}
        <button
          type="button"
          className="sidebar-add-contact-btn"
          onClick={() => setIsAddContactOpen(true)}
          title="Find and add a new contact by username"
        >
          <UserPlus size={16} />
          <span>+ Add Contact</span>
        </button>

        {/* Incoming Requests Section (if any pending) */}
        {incomingRequests.length > 0 && (
          <div className="incoming-requests-section">
            <div
              className="incoming-section-header"
              onClick={() => setIncomingExpanded((prev) => !prev)}
            >
              <span className="incoming-section-title">
                <Inbox size={14} />
                <span>Incoming Requests</span>
                <span className="incoming-count-badge">{incomingRequests.length}</span>
              </span>
              {incomingExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>

            {incomingExpanded && (
              <div className="incoming-requests-list">
                {incomingRequests.map((req) => (
                  <div key={req.id} className="incoming-request-item">
                    <div className="incoming-avatar">
                      {req.requester_avatar_url ? (
                        <img src={req.requester_avatar_url} alt={req.requester_username} className="avatar-img-cover" />
                      ) : (
                        <span>{(req.requester_display_name || req.requester_username).charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="incoming-info">
                      <div className="incoming-username">
                        {req.requester_display_name || req.requester_username}
                      </div>
                      <div className="incoming-handle">@{req.requester_username}</div>
                      <div className="incoming-time">{formatTime(req.created_at)}</div>
                    </div>
                    <div className="incoming-actions">
                      <button
                        className="btn-action btn-accept"
                        onClick={() => handleAcceptRequest(req.id)}
                        disabled={requestActionLoading === req.id}
                        title="Accept contact request"
                      >
                        Accept
                      </button>
                      <button
                        className="btn-action btn-reject"
                        onClick={() => handleRejectRequest(req.id)}
                        disabled={requestActionLoading === req.id}
                        title="Reject contact request"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Filter Contacts Input */}
        <div className="sidebar-search-box">
          <div className="search-input-wrapper">
            <Search className="search-icon" size={17} />
            <input
              type="text"
              className="search-input"
              placeholder="Search contacts..."
              value={searchContactQuery}
              onChange={(e) => setSearchContactQuery(e.target.value)}
            />
          </div>
        </div>

        {/* My Contacts List */}
        <div className="conversation-list-container">
          {/* inner scroll wrapper so footer stays pinned */}
          <div className="contacts-scroll-area">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '0.25rem' }}>
            <span className="conversation-list-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Users size={14} /> My Contacts ({contacts.length})
              {!isOnline && (
                <span className="offline-cached-badge" title="Showing cached contacts offline">
                  <WifiOff size={11} /> Offline
                </span>
              )}
            </span>
          </div>

          {showSkeleton ? (
            <div className="contact-skeleton-list" aria-label="Loading contacts">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="conversation-item skeleton-item">
                  <div className="conversation-avatar-wrap">
                    <div className="contact-avatar skeleton-pulse skeleton-avatar" />
                  </div>
                  <div className="contact-info" style={{ flex: 1, minWidth: 0, paddingRight: '0.5rem' }}>
                    <div className="skeleton-pulse skeleton-line skeleton-name" />
                    <div className="skeleton-pulse skeleton-line skeleton-status" />
                  </div>
                </div>
              ))}
            </div>
          ) : contacts.length === 0 ? (
            <div className="empty-user-list">
              <p style={{ fontWeight: 600, marginBottom: '0.35rem' }}>No contacts yet.</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Click "+ Add Contact" above to search and connect with other users.
              </p>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="empty-user-list">
              No contacts matching "{searchContactQuery}".
            </div>
          ) : (
            filteredContacts.map((contact) => {
              const isSelected = selectedUser?.id === contact.id;
              const isContactOnline = Boolean(contact.is_online);
              const unread = unreadCounts[contact.id] || 0;

              return (
                <div
                  key={contact.id}
                  onClick={() => setSelectedUser(contact)}
                  className={`conversation-item ${isSelected ? 'active' : ''}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedUser(contact)}
                >
                  <div className="conversation-avatar-wrap">
                    <div className="contact-avatar">
                      {contact.avatar_url ? (
                        <img src={contact.avatar_url} alt={contact.username} className="avatar-img-cover" />
                      ) : (
                        <span>{(contact.display_name || contact.username).charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <span
                      className={`contact-status-dot ${isContactOnline ? 'online' : 'offline'}`}
                      title={isContactOnline ? 'Online' : 'Offline'}
                    />
                  </div>

                  <div className="conversation-content">
                    <div className="conversation-top-row">
                      <span className="contact-name">
                        {contact.display_name || contact.username}
                      </span>
                      <span className="conversation-time">
                        {contact.lastMessageTime || (isContactOnline ? 'Online' : 'Offline')}
                      </span>
                    </div>
                    <div className="conversation-bottom-row">
                      <span className="conversation-preview">
                        {contact.lastMessagePreview || (isContactOnline ? 'Click to chat' : 'Offline')}
                      </span>
                      {unread > 0 && (
                        <span className="conversation-unread-badge">{unread}</span>
                      )}
                      <button
                        type="button"
                        className="btn-action btn-remove-contact"
                        onClick={(e) => handleRemoveContact(e, contact)}
                        title={`Remove ${contact.display_name || contact.username} from contacts`}
                        aria-label={`Remove ${contact.display_name || contact.username}`}
                      >
                        <UserX size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          </div>{/* end contacts-scroll-area */}

          {/* Developer credit – desktop sidebar only. Mobile drawer has its own copy in Navbar.jsx */}
          <div className="sidebar-developer-credit">
            Developed and Maintained by Raunak Singh
          </div>
        </div>
      </aside>

      {/* ================= Main Chat Area ================= */}
      <main className="chat-main-area">
        {selectedUser ? (
          <>
            {/* Chat Top Header */}
            <div className="chat-header">
              <div
                className="chat-header-user clickable"
                onClick={() => setIsContactInfoOpen(true)}
                title="Click to view contact profile"
              >
                <button
                  type="button"
                  className="btn-mobile-back"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedUser(null);
                  }}
                  aria-label="Back to contacts"
                  title="Back to contacts"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="chat-header-avatar">
                  {selectedUser.avatar_url ? (
                    <img src={selectedUser.avatar_url} alt={selectedUser.username} className="avatar-img-cover" />
                  ) : (
                    <span>{(selectedUser.display_name || selectedUser.username).charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="chat-header-info">
                  <span className="chat-header-username">
                    {selectedUser.display_name || selectedUser.username}
                  </span>
                  {typingContact === selectedUser.id ? (
                    <span className="chat-header-typing">typing...</span>
                  ) : (
                    <span
                      className={`chat-header-status ${selectedUser.is_online ? 'online' : 'offline'}`}
                    >
                      ● {selectedUser.is_online ? 'Online' : 'Offline'}
                    </span>
                  )}
                </div>
              </div>

              <div className="chat-header-badges">
                <button
                  type="button"
                  className="btn-close-chat"
                  onClick={() => setSelectedUser(null)}
                  title="Close conversation"
                  aria-label="Close conversation"
                >
                  <X size={15} />
                  <span>Close Chat</span>
                </button>

                {/* More Options Dropdown */}
                <div className="header-menu-container">
                  <button
                    type="button"
                    className="sidebar-action-btn"
                    onClick={() => setHeaderMenuOpen((prev) => !prev)}
                    title="Conversation options"
                  >
                    <MoreVertical size={18} />
                  </button>

                  {headerMenuOpen && (
                    <div className="header-dropdown-menu">
                      <button
                        type="button"
                        className="header-dropdown-item"
                        onClick={() => {
                          setHeaderMenuOpen(false);
                          setIsContactInfoOpen(true);
                        }}
                      >
                        <Info size={15} />
                        <span>View Profile</span>
                      </button>
                      <button
                        type="button"
                        className="header-dropdown-item danger"
                        onClick={() => {
                          setHeaderMenuOpen(false);
                          handleBlockUser(selectedUser.id);
                        }}
                      >
                        <Shield size={15} />
                        <span>Block Contact</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Messages Scroll Area */}
            <div className="chat-messages-container" ref={messagesContainerRef}>
              <div className="chat-ephemeral-banner">
                <ShieldCheck size={15} style={{ color: 'var(--accent-primary)' }} />
                <span>One-to-one encrypted session.</span>
              </div>

              {initialLoadingMessages && messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', margin: 'auto' }}>
                  Loading conversation...
                </div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', margin: 'auto', fontSize: '0.9rem' }}>
                  No messages yet. Start the conversation!
                </div>
              ) : (
                messages.map((msg) => (
                  <MessageBubbleItem
                    key={msg.id}
                    msg={msg}
                    isSentByMe={msg.sender_id === user?.id}
                    isPending={msg.status === 'pending'}
                    isRead={msg.status === 'read'}
                    countdown={formatExpiryCountdown(msg.expires_at)}
                    formatTime={formatTime}
                    onReply={handleSelectReply}
                    onScrollToOriginal={scrollToOriginalMessage}
                    onOpenContextMenu={(m, rect) => setContextMenuState({ msg: m, rect })}
                    onReact={handleReact}
                    onRetrySend={handleRetrySend}
                    currentUserId={user?.id}
                  />
                ))
              )}

              {/* Typing indicator bubble */}
              {typingContact === selectedUser.id && (
                <div className="typing-bubble-row">
                  <div className="typing-dots">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Message Action Portal (long-press / hover context menu) */}
            <MessageActionPortal
              isOpen={!!contextMenuState}
              msg={contextMenuState?.msg || null}
              rect={contextMenuState?.rect || null}
              isSentByMe={contextMenuState?.msg?.sender_id === user?.id}
              onReact={handleReact}
              onReply={handleSelectReply}
              onClose={() => setContextMenuState(null)}
              currentUserId={user?.id}
            />

            {/* Send Error Alert */}
            {sendError && (
              <div style={{
                margin: '0.5rem 1.25rem 0',
                padding: '0.6rem 0.85rem',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                color: '#EF4444',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertCircle size={16} />
                  <span>{sendError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSendError('')}
                  style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Reply Composer Banner (Feature 6) */}
            {replyingTo && (
              <div className="reply-composer-banner">
                <div className="reply-composer-content">
                  <span className="reply-composer-title">Replying to {replyingTo.sender_name}</span>
                  <span className="reply-composer-text">{replyingTo.message_text}</span>
                </div>
                <button
                  type="button"
                  className="btn-cancel-reply"
                  onClick={() => setReplyingTo(null)}
                  title="Cancel reply"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Message Input Bar with Emoji Picker (Feature 5) */}
            <div className="chat-input-area" style={{ position: 'relative' }}>
              <EmojiPicker
                isOpen={isEmojiPickerOpen}
                onSelectEmoji={handleSelectEmoji}
                onClose={() => setIsEmojiPickerOpen(false)}
              />

              <form onSubmit={handleSendMessage} className="chat-input-form">
                <button
                  type="button"
                  className="btn-composer-tool"
                  onClick={() => setIsEmojiPickerOpen((prev) => !prev)}
                  title="Insert emoji"
                >
                  <Smile size={20} />
                </button>

                <textarea
                  ref={inputRef}
                  className="message-input"
                  placeholder={!isOnline ? 'You are offline. Reconnect to send messages...' : 'Type message...'}
                  value={inputText}
                  disabled={!isOnline}
                  onChange={handleInputChange}
                  onFocus={() => {
                    if (window.scrollY !== 0) {
                      window.scrollTo(0, 0);
                    }
                    setTimeout(() => {
                      if (window.scrollY !== 0) {
                        window.scrollTo(0, 0);
                      }
                      scrollToBottom();
                    }, 150);
                  }}
                  onBlur={() => {
                    if (window.scrollY !== 0) {
                      window.scrollTo(0, 0);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                  rows={1}
                />

                <button
                  type="submit"
                  className="btn-send-message"
                  disabled={!inputText.trim() || sending || !isOnline}
                  title={!isOnline ? 'You are offline' : 'Send message'}
                  aria-label="Send message"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </>
        ) : (
          /* Empty State when no contact selected */
          <div className="chat-empty-state">
            <div className="empty-state-card">
              <div className="empty-state-brand-badge">
                <MessageSquare size={14} />
                <span>LetUsChat</span>
              </div>
              <div className="empty-state-icon">
                <MessageSquare size={32} />
              </div>
              <h2 className="empty-state-title">Private conversations, without the noise.</h2>
              <p className="empty-state-description">
                Your conversations stay yours. Choose an accepted contact or add someone you trust to begin.
              </p>
              <div className="empty-state-features">
                <div className="empty-feature-item">
                  <span className="feature-bullet">●</span>
                  <span>Chat only with accepted contacts</span>
                </div>
                <div className="empty-feature-item">
                  <span className="feature-bullet">●</span>
                  <span>Private one-to-one conversations</span>
                </div>
                <div className="empty-feature-item">
                  <span className="feature-bullet">●</span>
                  <span>Messages disappear five minutes after delivery</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Add Contact Modal */}
      <AddContactModal
        isOpen={isAddContactOpen}
        onClose={() => setIsAddContactOpen(false)}
        onContactAdded={() => {
          fetchContacts();
          fetchIncomingRequests();
        }}
        onOpenChat={(contact) => {
          fetchContacts();
          setSelectedUser(contact);
        }}
      />

      {/* Profile Modal */}
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        onProfileUpdated={(updatedProfile) => {
          setMyProfile(updatedProfile);
        }}
        onOpenBlockedUsers={() => setIsBlockedUsersOpen(true)}
      />

      {/* Blocked Users Modal */}
      <BlockedUsersModal
        isOpen={isBlockedUsersOpen}
        onClose={() => setIsBlockedUsersOpen(false)}
        onUserUnblocked={() => {
          fetchContacts();
        }}
      />

      {/* Contact Info / View Modal */}
      <UserProfileModal
        isOpen={isContactInfoOpen}
        user={selectedUser}
        onClose={() => setIsContactInfoOpen(false)}
        onBlockUser={handleBlockUser}
      />
    </div>
  );
};

export default Chat;
