import { useState, useEffect } from 'react';
import type { ChatListItem, SessionConfirmationBlock } from '../stores/chat-types';
import { findLatestInputSessionConfirmation } from '../utils/input-helpers';

/**
 * Manages the session confirmation lifecycle:
 * - Shows the confirmation when a pending one appears
 * - Marks it as exiting when it gets resolved
 * - Cleans up after the exit animation
 */
export function useSessionConfirmation(
  currentSessionItems: ChatListItem[] | undefined,
  pendingSessionConfirmation: SessionConfirmationBlock | null,
) {
  const [visibleSessionConfirmation, setVisibleSessionConfirmation] = useState<SessionConfirmationBlock | null>(null);
  const [sessionConfirmationExiting, setSessionConfirmationExiting] = useState(false);

  useEffect(() => {
    if (pendingSessionConfirmation) {
      setVisibleSessionConfirmation(pendingSessionConfirmation);
      setSessionConfirmationExiting(false);
      return;
    }
    if (!visibleSessionConfirmation || sessionConfirmationExiting) return;

    const resolved = findLatestInputSessionConfirmation(currentSessionItems, visibleSessionConfirmation.confirmId);
    setVisibleSessionConfirmation(resolved || visibleSessionConfirmation);
    setSessionConfirmationExiting(true);
  }, [currentSessionItems, pendingSessionConfirmation, sessionConfirmationExiting, visibleSessionConfirmation]);

  useEffect(() => {
    if (!sessionConfirmationExiting) return;
    const timer = window.setTimeout(() => {
      setVisibleSessionConfirmation(null);
      setSessionConfirmationExiting(false);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [sessionConfirmationExiting]);

  return { visibleSessionConfirmation, sessionConfirmationExiting };
}
