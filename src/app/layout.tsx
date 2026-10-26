import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Naskh_Arabic } from 'next/font/google';
import AppShell from '@/components/AppShell';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-latin' });
const naskh = Noto_Naskh_Arabic({ subsets: ['arabic'], weight: ['400', '500', '600', '700'], variable: '--font-arabic' });

export const metadata: Metadata = {
  title: 'Hisab Kitab',
  description: 'Smart business ledger — track what customers and suppliers owe, in English, Urdu and Pashto.',
  applicationName: 'Hisab Kitab',
  appleWebApp: { capable: true, title: 'Hisab Kitab', statusBarStyle: 'default' },
  icons: { apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F4F5F8',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" className={`${inter.variable} ${naskh.variable}`} suppressHydrationWarning>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
