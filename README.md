# hisab-kitab-pwa

**Hisab Kitab (حساب کتاب)** — a smart business ledger as an installable Progressive Web App.
A full Next.js port of the Hisab Kitab React Native app: track what customers owe you and what you
owe suppliers, in English, Urdu and Pashto. Works offline; all data stays on the device.

## Features

- **PIN lock** — 4-digit PIN on launch (stored as a salted SHA-256 hash), change PIN, forgot-PIN reset, logout
- **Books (khata)** — multiple businesses, each with its own contacts; create / edit / delete (long-press or right-click)
- **Ledger** — customers & suppliers with You Gave (Dr) / You Got (Cr) / balance totals, tabs, search, date-range filter
- **Contact ledger** — entries with running balance, built-in calculator (+ − × ÷, keyboard supported), date & time,
  notes, due-date reminders, entry details, edit / delete
- **PDF reports** — contact statement and book summary report (bilingual, RTL for Urdu/Pashto); shared via the
  phone's share sheet or downloaded on desktop
- **Backup** — export a book as `{book}_hisab.json` and import/merge it (no duplicates). Same format as the
  mobile app, so backups move between the phone app and the PWA
- **Notifications** — entry confirmations, due-date reminders and a 9 AM daily summary
- **Settings** — language, dark / light theme, "You Get" colour (red/green), text size, install app

## How it works

- Next.js 16 App Router, exported as a static site (`output: 'export'`) — no server needed
- Data in IndexedDB (`src/lib/db.ts`, `src/lib/repo.ts`) — a port of the app's SQLite schema
- `public/sw.js` — offline cache for the app shell and the reminder checker. Reminders fire while the app is open,
  and in the background on Chromium-based browsers via Periodic Background Sync (installed app only)
- PDFs are rendered in the browser with `html2pdf.js`

## Development

```bash
npm install
npm run dev        # http://localhost:3000 (service worker disabled in dev)
npm run build      # static site in ./out
npm run preview    # serve ./out on http://localhost:3100
```

Deploy the `out/` folder to any static host (Vercel, Netlify, GitHub Pages, Cloudflare Pages, nginx…).
It must be served over HTTPS (or localhost) for install, offline mode and notifications to work.
