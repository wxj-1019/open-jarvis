import { useEffect, type RefObject } from 'react';

/**
 * Generic click-outside hook.
 * Calls onDismiss when a mousedown event occurs outside both menuRef and buttonRef.
 */
export function useClickOutside(
  open: boolean,
  menuRef: RefObject<HTMLElement | null>,
  buttonRef: RefObject<HTMLElement | null> | undefined,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (buttonRef?.current?.contains(e.target as Node)) return;
      onDismiss();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, menuRef, buttonRef, onDismiss]);
}
