'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import type { Khata } from '@/lib/db';
import type { Lang } from '@/lib/format';
import { getAllKhatas, getSetting, setSetting } from '@/lib/repo';
import { pokeServiceWorker, registerPeriodicSync } from '@/lib/notify';

export type Language = Lang;
export type Theme = 'light' | 'dark';

interface AppState {
  language: Language;
  theme: Theme;
  textScale: number;
  notifications: boolean;
  dailySummary: boolean;
  getColorRed: boolean;
  khatas: Khata[];
  activeKhata: Khata | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

type AppAction =
  | { type: 'INIT'; payload: Partial<AppState> }
  | { type: 'SET'; payload: Partial<AppState> }
  | { type: 'REFRESH_KHATAS'; payload: Khata[] };

const initialState: AppState = {
  language: 'en',
  theme: 'light',
  textScale: 1.18,
  notifications: false,
  dailySummary: false,
  getColorRed: true,
  khatas: [],
  activeKhata: null,
  isLoading: true,
  isAuthenticated: false,
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'INIT':
    case 'SET':
      return { ...state, ...action.payload };
    case 'REFRESH_KHATAS': {
      // Update the list and reset activeKhata if the current one was deleted
      const khatas = action.payload;
      const current = khatas.find(k => k.id === state.activeKhata?.id);
      return { ...state, khatas, activeKhata: current ?? khatas[0] ?? null };
    }
    default:
      return state;
  }
}

interface AppContextType {
  state: AppState;
  setLanguage: (lang: Language) => void;
  setTheme: (theme: Theme) => void;
  setTextScale: (scale: number) => void;
  setNotifications: (on: boolean) => void;
  setDailySummary: (on: boolean) => void;
  setGetColorRed: (on: boolean) => void;
  setActiveKhata: (khata: Khata) => void;
  refreshKhatas: () => Promise<Khata[]>;
  login: () => void;
  logout: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const refreshKhatas = useCallback(async () => {
    const khatas = await getAllKhatas();
    dispatch({ type: 'REFRESH_KHATAS', payload: khatas });
    return khatas;
  }, []);

  const api = useMemo<Omit<AppContextType, 'state' | 'refreshKhatas'>>(() => ({
    setLanguage: lang => { dispatch({ type: 'SET', payload: { language: lang } }); setSetting('language', lang); },
    setTheme: theme => { dispatch({ type: 'SET', payload: { theme } }); setSetting('theme', theme); },
    setTextScale: scale => { dispatch({ type: 'SET', payload: { textScale: scale } }); setSetting('textScale', String(scale)); },
    setNotifications: on => { dispatch({ type: 'SET', payload: { notifications: on } }); setSetting('notifications', on ? 'on' : 'off'); },
    setDailySummary: on => { dispatch({ type: 'SET', payload: { dailySummary: on } }); setSetting('dailySummary', on ? 'on' : 'off'); },
    setGetColorRed: on => { dispatch({ type: 'SET', payload: { getColorRed: on } }); setSetting('getColorRed', on ? 'on' : 'off'); },
    setActiveKhata: khata => { dispatch({ type: 'SET', payload: { activeKhata: khata } }); setSetting('activeKhataId', String(khata.id)).catch(() => {}); },
    login: () => dispatch({ type: 'SET', payload: { isAuthenticated: true } }),
    logout: () => dispatch({ type: 'SET', payload: { isAuthenticated: false } }),
  }), []);

  // Load persisted settings + books once
  useEffect(() => {
    (async () => {
      const payload: Partial<AppState> = {};
      try {
        const [lang, theme, textScale, notif, daily, getColorRedVal, khatas, activeKhataId] = await Promise.all([
          getSetting('language'), getSetting('theme'), getSetting('textScale'), getSetting('notifications'),
          getSetting('dailySummary'), getSetting('getColorRed'), getAllKhatas(), getSetting('activeKhataId'),
        ]);
        if (lang === 'en' || lang === 'ur' || lang === 'ps') payload.language = lang;
        if (theme === 'light' || theme === 'dark') payload.theme = theme;
        else if (window.matchMedia('(prefers-color-scheme: dark)').matches) payload.theme = 'dark';
        if (textScale) payload.textScale = parseFloat(textScale) || 1.18;
        // Browsers only allow the permission prompt after a user gesture, so unlike the
        // mobile app it isn't requested on first launch — it's switched on in Settings.
        payload.notifications = notif === 'on' && typeof Notification !== 'undefined' && Notification.permission === 'granted';
        payload.dailySummary = daily === 'on';
        payload.getColorRed = getColorRedVal !== 'off';
        payload.khatas = khatas;
        payload.activeKhata = khatas.find(k => k.id === Number(activeKhataId)) ?? khatas[0] ?? null;
      } catch (e) {
        console.error('init error', e);
      } finally {
        dispatch({ type: 'INIT', payload: { ...payload, isLoading: false } });
      }
    })();
  }, []);

  // Reflect theme / language / text size on <html> so CSS can use them
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.theme = state.theme;
    html.lang = state.language;
    html.classList.toggle('rtl-script', state.language !== 'en');
    html.style.setProperty('--ts', String(state.textScale));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', state.theme === 'dark' ? '#1a0533' : '#F4F5F8');
  }, [state.theme, state.language, state.textScale]);

  // Service worker: offline cache + reminders. Poke it periodically while open.
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(() => registerPeriodicSync())
      .catch(err => console.warn('SW registration failed', err));
    const onReady = () => pokeServiceWorker();
    navigator.serviceWorker.addEventListener('controllerchange', onReady);
    const timer = setInterval(pokeServiceWorker, 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') pokeServiceWorker(); };
    document.addEventListener('visibilitychange', onVisible);
    setTimeout(pokeServiceWorker, 2000);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker.removeEventListener('controllerchange', onReady);
    };
  }, []);

  return (
    <AppContext.Provider value={{ state, refreshKhatas, ...api }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

/** tl() bound to the current language. */
export function useT() {
  const { state } = useApp();
  const lang = state.language;
  return useCallback((en: string, ur: string, ps: string) => (lang === 'ur' ? ur : lang === 'ps' ? ps : en), [lang]);
}

/** Colour for a signed balance, honouring the "You Get shows as red/green" setting. */
export function useBalanceColor() {
  const { state } = useApp();
  const red = state.getColorRed;
  return useCallback((n: number) => (Math.abs(n) < 0.005 ? 'var(--muted)' : n > 0 ? (red ? 'var(--red)' : 'var(--green)') : (red ? 'var(--green)' : 'var(--red)')), [red]);
}
