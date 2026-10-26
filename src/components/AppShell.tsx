'use client';

import type { ReactNode } from 'react';
import { AppProvider, useApp } from '@/context/AppContext';
import { DialogProvider, Spinner } from './ui';
import LockScreen from './LockScreen';

function Gate({ children }: { children: ReactNode }) {
  const { state, login } = useApp();
  if (state.isLoading) return <div className="screen center"><Spinner /></div>;
  if (!state.isAuthenticated) return <LockScreen onAuthenticated={login} />;
  return <>{children}</>;
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <DialogProvider>
        <Gate>{children}</Gate>
      </DialogProvider>
    </AppProvider>
  );
}
