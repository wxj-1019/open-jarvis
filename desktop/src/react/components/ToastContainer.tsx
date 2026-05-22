import { useEffect, useRef } from 'react';
import { X } from '@phosphor-icons/react';
import { useStore } from '../stores';
import { PhosphorIcon } from '../ui/PhosphorIcon';
import type { Toast } from '../stores/toast-slice';

export function ToastContainer() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => ref.current?.classList.add('show'));
  }, []);

  function dismiss() {
    const el = ref.current;
    if (!el) return;
    el.classList.remove('show');
    setTimeout(() => useStore.getState().removeToast(toast.id), 300);
  }

  return (
    <div ref={ref} className={`hana-toast ${toast.type}`}>
      <span>{toast.text}</span>
      <div className="hana-toast-actions">
        {toast.action && (
          <button className="hana-toast-action" onClick={() => { toast.action!.onClick(); dismiss(); }}>
            {toast.action.label}
          </button>
        )}
        <button className="hana-toast-close" onClick={dismiss}>
          <PhosphorIcon icon={X} />
        </button>
      </div>
    </div>
  );
}
