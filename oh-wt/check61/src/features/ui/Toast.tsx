'use client';

import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastOptions = {
  /** Optional action button, e.g. "Undo" or "View". */
  action?: { label: string; onClick: () => void };
  /** Milliseconds before it hides; default 4000. */
  duration?: number;
};

type ToastItem = ToastOptions & { id: number; message: string };
type ToastApi = { show: (message: string, options?: ToastOptions) => void };

const ToastContext = createContext<ToastApi | null>(null);

/** Toast host. AppShell mounts one; anything inside it can call useToast().show(). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback((message: string, options: ToastOptions = {}) => {
    const id = nextId.current++;
    setItems((all) => [...all.slice(-2), { id, message, ...options }]);
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[72px] z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6 md:left-6 md:right-auto md:items-start md:px-0"
      >
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), item.duration ?? 4000);
    return () => clearTimeout(timer);
  }, [item.id, item.duration, onDismiss]);
  return (
    <div className="pointer-events-auto flex w-full max-w-[360px] animate-toast-in items-center gap-3 rounded-card bg-fb-surface px-4 py-3 shadow-popover">
      <p className="min-w-0 flex-1 text-[15px] text-fb-text">{item.message}</p>
      {item.action && (
        <button
          type="button"
          className="text-[15px] font-semibold text-fb-blue hover:underline"
          onClick={() => {
            item.action!.onClick();
            onDismiss(item.id);
          }}
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        className="rounded-full p-1 text-fb-text-2 hover:bg-fb-hover"
        onClick={() => onDismiss(item.id)}
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}

/** Show a toast. Outside a ToastProvider it does nothing (so components still render in tests). */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? { show: () => {} };
}
