'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Delete } from 'lucide-react';

export const PIN_LENGTH = 4;
const KEYS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', '⌫']];

/**
 * 4-digit PIN entry used by the lock screen and Change PIN.
 * onComplete returns false to shake + clear (wrong PIN), anything else just clears.
 */
export function PinPad({ subtitle, error, onComplete, top, bottom }: {
  subtitle: string;
  error?: string;
  onComplete: (pin: string) => Promise<boolean | void> | boolean | void;
  top?: ReactNode;
  bottom?: ReactNode;
}) {
  const [pin, setPinState] = useState('');
  const pinRef = useRef('');
  const [shake, setShake] = useState(false);
  const busy = useRef(false);

  const setPin = (p: string) => { pinRef.current = p; setPinState(p); };

  const press = useCallback((key: string) => {
    if (!key || busy.current) return;
    const cur = pinRef.current;
    if (key === '⌫') { setPin(cur.slice(0, -1)); return; }
    if (cur.length >= PIN_LENGTH) return;
    const next = cur + key;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      busy.current = true;
      setTimeout(async () => {
        const ok = await onComplete(next);
        if (ok === false) {
          navigator.vibrate?.(300);
          setShake(true);
          setTimeout(() => setShake(false), 260);
        }
        setPin('');
        busy.current = false;
      }, 150);
    }
  }, [onComplete]);

  // Physical keyboard support on desktop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('⌫');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  return (
    <div className="pin-screen">
      {top}
      <div className={`pin-section ${shake ? 'shake' : ''}`}>
        <div className="pin-label fs-15">{subtitle}</div>
        <div className="pin-dots" aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => <span key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''}`} />)}
        </div>
        <div className="pin-error fs-12" role="alert">{error ?? ''}</div>
      </div>
      <div className="keypad">
        {KEYS.map((row, ri) => (
          <div key={ri} className="keypad-row">
            {row.map((k, ki) => k === ''
              ? <span key={ki} className="key ghost" />
              : (
                <button key={ki} type="button" className="key" onClick={() => press(k)} aria-label={k === '⌫' ? 'Backspace' : k}>
                  {k === '⌫' ? <Delete size={22} /> : k}
                </button>
              ))}
          </div>
        ))}
      </div>
      {bottom}
    </div>
  );
}
