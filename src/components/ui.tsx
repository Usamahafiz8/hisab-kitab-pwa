'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// ── Bottom sheet (replaces RN <Modal animationType="slide">) ─────────────────

// Sheets can stack (detail → edit), so the body scroll lock is reference-counted.
let scrollLocks = 0;
function lockScroll(delta: number) {
  scrollLocks = Math.max(0, scrollLocks + delta);
  document.body.classList.toggle('no-scroll', scrollLocks > 0);
}

export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label?: string }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  // Mount immediately on open; slide out before unmounting on close
  if (open && !mounted) setMounted(true);
  if (!open && shown) setShown(false);

  useEffect(() => {
    if (open) {
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(r);
    }
    const t = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    lockScroll(1);
    return () => lockScroll(-1);
  }, [open]);

  if (!mounted) return null;
  return createPortal(
    <div className={`overlay ${shown ? 'shown' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="sheet-handle" />
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// ── Dialogs (replaces Alert.alert) + toasts ─────────────────────────────────

export interface DialogButton<T = string> { text: string; value: T; style?: 'cancel' | 'destructive' | 'primary' }
interface DialogReq { title: string; message?: string; buttons: DialogButton<unknown>[]; resolve: (v: unknown) => void }

interface DialogApi {
  choose: <T>(title: string, message: string | undefined, buttons: DialogButton<T>[]) => Promise<T | undefined>;
  alert: (title: string, message?: string, ok?: string) => Promise<void>;
  confirm: (title: string, message: string, okText: string, cancelText: string, destructive?: boolean) => Promise<boolean>;
  toast: (msg: string) => void;
}

const DialogCtx = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<DialogReq | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const choose = useCallback(<T,>(title: string, message: string | undefined, buttons: DialogButton<T>[]) =>
    new Promise<T | undefined>(resolve => setReq({ title, message, buttons: buttons as DialogButton<unknown>[], resolve: resolve as (v: unknown) => void })), []);

  const api: DialogApi = {
    choose,
    alert: async (title, message, ok = 'OK') => { await choose(title, message, [{ text: ok, value: true, style: 'primary' }]); },
    confirm: async (title, message, okText, cancelText, destructive = true) =>
      (await choose(title, message, [
        { text: cancelText, value: false, style: 'cancel' },
        { text: okText, value: true, style: destructive ? 'destructive' : 'primary' },
      ])) === true,
    toast: msg => {
      setToastMsg(msg);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
    },
  };

  const close = (v: unknown) => { req?.resolve(v); setReq(null); };

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(undefined); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <DialogCtx.Provider value={api}>
      {children}
      {req && createPortal(
        <div className="overlay shown center" onMouseDown={e => { if (e.target === e.currentTarget) close(undefined); }}>
          <div className="dialog" role="alertdialog" aria-modal="true" aria-label={req.title}>
            <div className="dialog-title fs-17">{req.title}</div>
            {req.message && <div className="dialog-msg fs-14">{req.message}</div>}
            <div className="dialog-btns">
              {req.buttons.map((b, i) => (
                <button key={i} className={`dialog-btn ${b.style ?? ''}`} onClick={() => close(b.value)} autoFocus={b.style === 'primary' || (i === req.buttons.length - 1 && b.style !== 'destructive')}>
                  {b.text}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
      {toastMsg && createPortal(<div className="toast fs-14" role="status">{toastMsg}</div>, document.body)}
    </DialogCtx.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogCtx);
  if (!ctx) throw new Error('useDialog must be used inside DialogProvider');
  return ctx;
}

// ── Long press (RN onLongPress) — also triggered by right-click on desktop ──

export function useLongPress<T>(onLongPress: (item: T) => void, onPress?: (item: T) => void, ms = 480) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  return useCallback((item: T) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(15);
        onLongPress(item);
      }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clearTimeout(timer.current);
    },
    onPointerUp: () => clearTimeout(timer.current),
    onPointerLeave: () => clearTimeout(timer.current),
    onPointerCancel: () => clearTimeout(timer.current),
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); clearTimeout(timer.current); fired.current = true; onLongPress(item); },
    onClick: () => { if (fired.current) { fired.current = false; return; } onPress?.(item); },
  }), [onLongPress, onPress, ms]);
}

// ── Toggle switch ────────────────────────────────────────────────────────────

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="switch-thumb" />
    </button>
  );
}

export function Spinner({ light }: { light?: boolean }) {
  return <span className={`spinner ${light ? 'light' : ''}`} aria-label="Loading" />;
}
