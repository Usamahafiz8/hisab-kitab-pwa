'use client';

import { useEffect, useState } from 'react';
import { PinPad } from './PinPad';
import { useDialog } from './ui';
import { checkPin, clearPin, hasPin, savePin } from '@/lib/pin';

type Mode = 'loading' | 'setup' | 'confirm' | 'enter';

export default function LockScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const dialog = useDialog();
  const [mode, setMode] = useState<Mode>('loading');
  const [setupPin, setSetupPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    hasPin().then(has => setMode(has ? 'enter' : 'setup'));
  }, []);

  const handleComplete = async (entered: string) => {
    setError('');
    if (mode === 'setup') {
      setSetupPin(entered);
      setMode('confirm');
      return;
    }
    if (mode === 'confirm') {
      if (entered === setupPin) {
        await savePin(entered);
        onAuthenticated();
        return;
      }
      setError("PINs don't match. Try again.");
      setMode('setup');
      setSetupPin('');
      return false;
    }
    if (await checkPin(entered)) {
      onAuthenticated();
      return;
    }
    setError('Wrong PIN. Try again.');
    return false;
  };

  const handleForgot = async () => {
    if (await dialog.confirm('Reset PIN', 'This will clear your PIN. Continue?', 'Reset', 'Cancel')) {
      await clearPin();
      setError('');
      setMode('setup');
    }
  };

  if (mode === 'loading') return <div className="lock" />;

  const subtitle = { setup: 'Set a PIN to secure your data', confirm: 'Confirm your PIN', enter: 'Enter PIN to continue' }[mode];

  return (
    <div className="lock fade-in">
      <PinPad
        key={mode}
        subtitle={subtitle}
        error={error}
        onComplete={handleComplete}
        top={(
          <div className="brand">
            <div className="brand-title">Hisab Kitab</div>
            <div className="brand-urdu" lang="ur">حساب کتاب</div>
            <div className="brand-tag">Smart Business Ledger</div>
          </div>
        )}
        bottom={(
          <div className="lock-foot">
            {mode === 'enter' && <button type="button" className="link-btn" onClick={handleForgot}>Forgot PIN?</button>}
            <div className="lock-credit">Develop by Zedro Labs</div>
          </div>
        )}
      />
    </div>
  );
}
