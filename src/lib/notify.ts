import { formatPKR, tl, type Lang } from './format';
import { deleteReminder, putReminder, setSetting } from './repo';

// Browser stand-in for the mobile app's notifee notifications.
// - Instant notifications go through the service worker (required on Android Chrome).
// - Scheduled ones (due-date reminders, the 9 AM daily summary) are stored in
//   IndexedDB; the service worker checks them whenever the app is open, and in
//   the background via Periodic Background Sync where the browser supports it.

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

async function show(title: string, body: string, tag?: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.getRegistration();
  const options: NotificationOptions = { body, icon: '/icon-192.png', badge: '/icon-192.png', tag };
  if (reg) await reg.showNotification(title, options);
  else new Notification(title, options);
}

/** Immediate confirmation when a gave/got entry is recorded. */
export async function notifyEntryAdded(contactName: string, type: 'gave' | 'got', amount: number, lang: Lang) {
  const title = type === 'gave'
    ? tl(lang, 'You Gave', 'رقم دی گئی', 'تاسو ورکړل')
    : tl(lang, 'You Got', 'رقم لی گئی', 'تاسو واخیستل');
  const body = tl(lang,
    `${contactName} — ${formatPKR(amount)} recorded`,
    `${contactName} — ${formatPKR(amount)} درج ہو گیا`,
    `${contactName} — ${formatPKR(amount)} ثبت شو`);
  await show(title, body);
}

/** One-off due reminder at ~10 AM on the due date (or a minute from now if that's already past). */
export async function scheduleDueReminder(id: string, contactName: string, amount: number, dueDateISO: string, lang: Lang) {
  const [y, m, d] = dueDateISO.split('-').map(Number);
  const when = new Date(y, m - 1, d, 10, 0, 0).getTime();
  await putReminder({
    id,
    fire_at: when > Date.now() ? when : Date.now() + 60_000,
    title: tl(lang, 'Payment reminder', 'ادائیگی کی یاد دہانی', 'د تادیې یادونه'),
    body: tl(lang,
      `${formatPKR(amount)} due from ${contactName}`,
      `${contactName} سے ${formatPKR(amount)} وصول کرنا ہے`,
      `له ${contactName} څخه د ${formatPKR(amount)} اخیستل پاتې دي`),
    fired: false,
  });
  pokeServiceWorker();
}

export async function cancelReminder(id: string) {
  await deleteReminder(id);
}

/** The daily summary text is stored so the service worker can show it in the right language. */
export async function scheduleDailySummary(lang: Lang) {
  await setSetting('dailySummaryTitle', tl(lang, 'Daily Summary', 'آج کا خلاصہ', 'د ورځې لنډیز'));
  await setSetting('dailySummaryBody', tl(lang, 'Tap to review your accounts', 'اپنا حساب کتاب دیکھیں', 'خپل حسابونه وګورئ'));
  // Don't fire immediately for a day that's already past 9 AM when turning it on
  const now = new Date();
  if (now.getHours() >= 9) {
    const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    await setSetting('dailySummaryLast', d);
  }
  await registerPeriodicSync();
}

/** Ask the service worker to check for due reminders now. */
export function pokeServiceWorker() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage({ type: 'check-reminders' });
}

/** Background checks for installed PWAs (Chromium); silently unavailable elsewhere. */
export async function registerPeriodicSync() {
  try {
    const reg = await navigator.serviceWorker.ready;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ps = (reg as any).periodicSync;
    if (!ps) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' as any });
    if (status.state !== 'granted') return;
    await ps.register('hk-reminders', { minInterval: 60 * 60 * 1000 });
  } catch {
    // Not supported — reminders still fire whenever the app is opened
  }
}
