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
import AddContactModal from '../components/AddContactModal';
import ProfileModal from '../components/ProfileModal';
import BlockedUsersModal from '../components/BlockedUsersModal';
import UserProfileModal from '../components/UserProfileModal';
import EmojiPicker from '../components/EmojiPicker';
import InAppToast from '../components/InAppToast';
import MessageBubbleItem from '../components/MessageBubbleItem';
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
  const [activeContextMenuId, setActiveContextMenuId] = useState(null);

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
  const [loadingMessages, setLoadingMessages] = useState(false);
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

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
  }, [selectedUser]);

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

  // Close message contextual menu on outside click, touch, or Escape
  useEffect(() => {
    if (!activeContextMenuId) return;
    const handleOutside = () => setActiveContextMenuId(null);
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setActiveContextMenuId(null);
    };
    window.addEventListener('click', handleOutside);
    window.addEventListener('touchstart', handleOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleOutside);
      window.removeEventListener('touchstart', handleOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeContextMenuId]);

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
        setContacts(data.contacts);
        if (userRef.current?.id) {
          ContactCache.set(userRef.current.id, data.contacts);
        }
        if (selectedUserRef.current && !data.contacts.some((c) => c.id === selectedUserRef.current.id)) {
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
  }, [fetchMyProfile, fetchContacts, fetchIncomingRequests, refreshUnreadCount]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('chat:notifications', { detail: { incoming: incomingRequests } }));
  }, [incomingRequests]);

  useEffect(() => {
    setAppBadge(totalUnreadCount);
  }, [totalUnreadCount]);

  // Automatic reconnection and data refresh when internet connectivity returns
  const loadConversation = useCallback(async (contactId) => {
    if (!contactId) return;
    try {
      const data = await messageAPI.getConversation(contactId);
      if (data.success && Array.isArray(data.messages)) {
        setMessages(data.messages);
        const socket = getSocket();
        if (socket && socket.connected) {
          socket.emit('mark_message_read', { sender_id: contactId });
        }
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
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
        loadConversation(selectedUserRef.current.id);
      }
    };

    window.addEventListener('online', handleReconnect);
    return () => window.removeEventListener('online', handleReconnect);
  }, [fetchMyProfile, fetchContacts, fetchIncomingRequests, loadConversation, refreshUnreadCount]);

  // Fetch conversation when selected contact changes
  useEffect(() => {
    setSendError('');
    setReplyingTo(null);
    setIsEmojiPickerOpen(false);
    setHeaderMenuOpen(false);
    setTypingContact(null);

    if (!selectedUser) {
      setMessages([]);
      return;
    }

    // Clear unread count for this contact
    setUnreadCounts((prev) => ({ ...prev, [selectedUser.id]: 0 }));

    let isMounted = true;
    const fetchConversation = async () => {
      setLoadingMessages(true);
      try {
        const data = await messageAPI.getConversation(selectedUser.id);
        if (isMounted && data.success && Array.isArray(data.messages)) {
          setMessages(data.messages);
          // Mark conversation as read
          const socket = getSocket();
          if (socket && socket.connected) {
            socket.emit('mark_message_read', { sender_id: selectedUser.id });
          }
          refreshUnreadCount();
        }
      } catch (err) {
        console.error('Failed to fetch conversation:', err);
        if (isMounted) {
          const msg = err.response?.data?.message || 'Unable to load conversation.';
          setSendError(msg);
        }
      } finally {
        if (isMounted) setLoadingMessages(false);
      }
    };

    fetchConversation();

    return () => {
      isMounted = false;
    };
  }, [selectedUser]);

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
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) {
              return prev;
            }
            return [...prev, newMsg];
          });

          // If received from active contact, automatically acknowledge as read
          if (newMsg.sender_id === activeContact.id) {
            socket.emit('mark_message_read', { sender_id: activeContact.id });
          }
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

        // Update preview in contacts list
        setContacts((prevContacts) =>
          prevContacts.map((c) => {
            if (c.id === newMsg.sender_id || c.id === newMsg.receiver_id) {
              return {
                ...c,
                lastMessagePreview: newMsg.message_text,
                lastMessageTime: new Date(newMsg.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })
              };
            }
            return c;
          })
        );
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

      // Read receipt (Feature 4): Double sky-blue tick
      socket.on('message_read', ({ readerId, messageIds, message_id }) => {
        const idsToMark = messageIds || (message_id ? [message_id] : []);
        setMessages((prev) =>
          prev.map((m) => {
            if (idsToMark.length === 0 || idsToMark.includes(m.id)) {
              if (m.status === 'delivered') {
                return { ...m, status: 'read' };
              }
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
          setSelectedUser((prev) =>
            prev ? { ...prev, is_online, last_seen: last_seen || prev.last_seen } : null
          );
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
      }
    };
  }, [token, user, fetchContacts, fetchIncomingRequests, refreshUnreadCount]);

  // Live timer tick every 1 second to update countdowns and clean expired messages
  useEffect(() => {
    const timerInterval = setInterval(() => {
      const now = Date.now();
      setCurrentTime(now);

      // Clean up expired messages whose expires_at has passed
      setMessages((prev) =>
        prev.filter((m) => {
          if (!m.expires_at) return true;
          return new Date(m.expires_at).getTime() > now;
        })
      );
    }, 1000);

    return () => clearInterval(timerInterval);
  }, []);

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

  // Send message handler with replies & error handling
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

    // Stop typing indicator immediately
    if (socket && socket.connected) {
      socket.emit('typing_stop', { receiver_id: selectedUser.id });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    try {
      if (socket && socket.connected) {
        // Send via Socket.IO
        socket.emit(
          'send_message',
          {
            receiver_id: selectedUser.id,
            message_text: trimmed,
            reply_to_message_id: replyId
          },
          (ack) => {
            sendingRef.current = false;
            setSending(false);
            if (ack && ack.success && ack.message) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === ack.message.id)) return prev;
                return [...prev, ack.message];
              });
              setInputText('');
              setReplyingTo(null);
              setSendError('');
              restoreComposerFocus();
            } else {
              const errorMsg = ack?.message || 'Failed to send message.';
              setSendError(errorMsg);
              restoreComposerFocus();
            }
          }
        );
      } else {
        // Fallback to REST API
        const data = await messageAPI.sendMessage(selectedUser.id, trimmed, replyId);
        sendingRef.current = false;
        setSending(false);
        if (data.success && data.message) {
          setMessages((prev) => [...prev, data.message]);
          setInputText('');
          setReplyingTo(null);
          setSendError('');
          restoreComposerFocus();
        } else {
          setSendError(data.message || 'Unable to deliver message.');
          restoreComposerFocus();
        }
      }
    } catch (err) {
      console.error('Send message error:', err);
      sendingRef.current = false;
      setSending(false);
      const errMsg = err.response?.data?.message || err.message || 'Unable to deliver message.';
      setSendError(errMsg);
      restoreComposerFocus();
    }
  };

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
            <div className="chat-messages-container">
              <div className="chat-ephemeral-banner">
                <ShieldCheck size={15} style={{ color: 'var(--accent-primary)' }} />
                <span>One-to-one encrypted session.</span>
              </div>

              {loadingMessages ? (
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
                    isContextMenuOpen={activeContextMenuId === msg.id}
                    onOpenContextMenu={(id) => setActiveContextMenuId(id)}
                    onCloseContextMenu={() => setActiveContextMenuId(null)}
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
