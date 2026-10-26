import { getSetting, setSetting } from './repo';

// The PIN is stored as a salted SHA-256 hash rather than plain text.
async function hash(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`hisab-kitab:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hasPin(): Promise<boolean> {
  return !!(await getSetting('appPin'));
}

export async function savePin(pin: string): Promise<void> {
  await setSetting('appPin', await hash(pin));
}

export async function clearPin(): Promise<void> {
  await setSetting('appPin', '');
}

export async function checkPin(pin: string): Promise<boolean> {
  const saved = await getSetting('appPin');
  return !!saved && saved === (await hash(pin));
}
