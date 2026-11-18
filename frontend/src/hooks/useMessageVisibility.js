// Hook to track message bubble visibility using IntersectionObserver
// Emits visible message IDs to the backend via Socket.IO after a stability period.
import { useEffect, useRef, useState, useCallback } from 'react';

// Visibility threshold (percentage of bubble visible)
const VISIBILITY_THRESHOLD = 0.5; // 50%
// Time the bubble must stay visible before reporting (ms)
const STABILITY_MS = 200;

export const useMessageVisibility = (socket, selectedUserId) => {
  // Set of IDs currently considered visible and not yet reported
  const pendingIdsRef = useRef(new Set());
  // Timestamp when an ID became visible
  const visibleSinceRef = useRef({});

  // Debounced emitter
  const emitTimerRef = useRef(null);

  const scheduleEmit = useCallback(() => {
    if (emitTimerRef.current) return;
    emitTimerRef.current = setTimeout(() => {
      const ids = Array.from(pendingIdsRef.current);
      if (ids.length && socket && socket.connected) {
        socket.emit('mark_visible_messages', { messageIds: ids, partnerId: selectedUserId });
      }
      pendingIdsRef.current.clear();
      emitTimerRef.current = null;
    }, 500); // batch every 500ms
  }, [socket, selectedUserId]);

  const onVisibilityChange = useCallback((msgId, isVisible) => {
    if (!isVisible) return; // We only care about becoming visible
    const now = Date.now();
    visibleSinceRef.current[msgId] = now;
    // After stability period, add to pending
    setTimeout(() => {
      if (Date.now() - visibleSinceRef.current[msgId] >= STABILITY_MS) {
        pendingIdsRef.current.add(msgId);
        scheduleEmit();
      }
    }, STABILITY_MS);
  }, [scheduleEmit]);

  // Reset when conversation changes or visibility changes (tab hidden)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') {
        // clear pending when hidden to avoid sending stale IDs
        pendingIdsRef.current.clear();
        if (emitTimerRef.current) {
          clearTimeout(emitTimerRef.current);
          emitTimerRef.current = null;
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return { onVisibilityChange };
};
