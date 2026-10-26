'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Bell, Briefcase, CalendarDays, ChevronRight, Download, KeyRound, LogOut, Moon, Palette, Pencil, PlusCircle,
  Smartphone, Sun, Trash2, Upload, X,
} from 'lucide-react';
import { useApp, useT } from '@/context/AppContext';
import { PinPad } from '@/components/PinPad';
import { Sheet, Spinner, Switch, useDialog } from '@/components/ui';
import type { Khata } from '@/lib/db';
import { createKhata, deleteKhata, updateKhata } from '@/lib/repo';
import { exportKhata, readBackupFile } from '@/lib/backup';
import { notificationsSupported, requestNotificationPermission, scheduleDailySummary } from '@/lib/notify';
import { checkPin, hasPin, savePin } from '@/lib/pin';
import { goBack } from '@/lib/nav';

interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export default function SettingsScreen() {
  const router = useRouter();
  const app = useApp();
  const { state, setLanguage, setTheme, setTextScale, setNotifications, setDailySummary, setGetColorRed, setActiveKhata, refreshKhatas, logout } = app;
  const { language, theme, khatas, activeKhata, textScale, notifications, dailySummary, getColorRed } = state;
  const t = useT();
  const dialog = useDialog();
  const isDark = theme === 'dark';

  const [bizModal, setBizModal] = useState<'add' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<Khata | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // PWA install prompt (Chromium) — shown as a Settings row when available
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const standalone = useSyncExternalStore(
    () => () => {},
    () => window.matchMedia('(display-mode: standalone)').matches,
    () => false,
  );
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e as BeforeInstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const handleToggleNotifications = async (on: boolean) => {
    if (on) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        dialog.alert(
          t('Permission needed', 'اجازت درکار ہے', 'اجازت پکار ده'),
          notificationsSupported()
            ? t('Please allow notifications for this site in your browser settings.', 'براہ کرم براؤزر سیٹنگز سے نوٹیفیکیشن کی اجازت دیں۔', 'مهرباني وکړئ په براوزر کې د خبرتیاوو اجازت ورکړئ.')
            : t('This browser does not support notifications. On iPhone, add the app to your Home Screen first.', 'یہ براؤزر نوٹیفیکیشن سپورٹ نہیں کرتا۔ آئی فون پر پہلے ایپ کو ہوم اسکرین پر شامل کریں۔', 'دا براوزر خبرتیاوې نه ملاتړ کوي. په آیفون کې لومړی اپلیکیشن کور سکرین ته زیات کړئ.'),
        );
        return;
      }
      setNotifications(true);
    } else {
      setNotifications(false);
      setDailySummary(false);
    }
  };

  const handleToggleDaily = async (on: boolean) => {
    if (on && !notifications) {
      if (!(await requestNotificationPermission())) return;
      setNotifications(true);
    }
    setDailySummary(on);
    if (on) await scheduleDailySummary(language);
  };

  // Keep the stored daily-summary text in the current language
  useEffect(() => { if (dailySummary) scheduleDailySummary(language); }, [language, dailySummary]);

  const openAdd = () => { setNewName(''); setNewPhone(''); setEditTarget(null); setBizModal('add'); };
  const openEdit = (k: Khata) => { setEditTarget(k); setNewName(k.name); setNewPhone(k.phone ?? ''); setBizModal('edit'); };

  const handleSaveBusiness = async () => {
    if (!newName.trim()) return;
    try {
      setSaving(true);
      if (bizModal === 'edit' && editTarget) await updateKhata(editTarget.id, { name: newName.trim(), phone: newPhone.trim() || undefined });
      else await createKhata({ name: newName.trim(), phone: newPhone.trim() || undefined });
      await refreshKhatas();
      setBizModal(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBusiness = async (k: Khata) => {
    const ok = await dialog.confirm(
      t('Delete Business', 'کاروبار حذف کریں', 'سوداګري ړنګ کړئ'),
      t(
        `Delete "${k.name}"?\n\nAll customers, suppliers, and transactions for this business will be permanently deleted.`,
        `"${k.name}" حذف کریں؟\n\nاس کاروبار کے تمام گاہک، سپلائر اور لین دین ہمیشہ کے لیے حذف ہو جائیں گے۔`,
        `"${k.name}" ړنګ کړئ؟\n\nد دې سوداګرۍ ټول پیرودونکي، عرضه کوونکي او معاملې به تل لپاره له منځه لاړ شي.`,
      ),
      t('Delete', 'حذف کریں', 'ړنګ کړئ'), t('Cancel', 'منسوخ', 'لغوه کړئ'),
    );
    if (ok) { await deleteKhata(k.id); await refreshKhatas(); }
  };

  const handleExport = async () => {
    if (!activeKhata) {
      dialog.alert(t('No Book Selected', 'کوئی کتاب منتخب نہیں', 'هیڅ کتاب غوره شوی نه دی'));
      return;
    }
    try {
      setExporting(true);
      const r = await exportKhata(activeKhata);
      if (r === 'downloaded') dialog.toast(t('Backup downloaded', 'بیک اپ ڈاؤن لوڈ ہو گیا', 'بیک اپ ډاونلوډ شو'));
    } catch (e) {
      dialog.alert(t('Export Failed', 'ایکسپورٹ ناکام', 'صادرول ناکام شول'), (e as Error)?.message ?? 'Could not export data.');
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    const ok = await dialog.confirm(
      t('Import Book', 'کتاب امپورٹ کریں', 'کتابه وارد کړئ'),
      t(
        `Import "${file.name}"?\n\nNew contacts and transactions will be added. Existing records will not be changed or duplicated.`,
        `"${file.name}" امپورٹ کریں؟\n\nنئے رابطے اور لین دین شامل ہوں گے۔ موجودہ ریکارڈ تبدیل یا دہرائے نہیں جائیں گے۔`,
        `"${file.name}" وارد کړئ؟\n\nنوې اړیکې او معاملې به زیاتې شي. موجود ریکارډونه به نه بدلیږي او نه تکرارېږي.`,
      ),
      t('Import', 'امپورٹ', 'وارد کړئ'), t('Cancel', 'منسوخ', 'لغوه کړئ'), false,
    );
    if (!ok) return;
    try {
      setImporting(true);
      const stats = await readBackupFile(file);
      await refreshKhatas();
      const summary = [
        stats.khatas ? `${stats.khatas} book(s)` : '',
        stats.accounts ? `${stats.accounts} contact(s)` : '',
        stats.transactions ? `${stats.transactions} transaction(s)` : '',
      ].filter(Boolean).join(', ');
      dialog.alert(
        t('Import Complete', 'امپورٹ مکمل', 'وارد بشپړ شو'),
        summary ? `Added: ${summary}` : t('No new records found — everything was already up to date.', 'کوئی نیا ریکارڈ نہیں ملا — سب کچھ پہلے سے موجود ہے۔', 'هیڅ نوی ریکارډ ونه موندل شو — هر څه دمخه شته.'),
      );
    } catch (e) {
      dialog.alert(t('Import Failed', 'امپورٹ ناکام', 'وارد ناکام شو'), (e as Error)?.message ?? 'Failed to import file.');
    } finally {
      setImporting(false);
    }
  };

  const handleLogout = async () => {
    const ok = await dialog.confirm(
      t('Logout', 'لاگ آوٹ', 'وتل'),
      t('Lock the app and return to PIN screen?', 'کیا آپ واقعی ایپ بند کرنا چاہتے ہیں؟', 'ایا تاسو واقعاً اپلیکیشن بندول غواړئ؟'),
      t('Logout', 'لاگ آوٹ', 'وتل'), t('Cancel', 'منسوخ', 'لغوه کړئ'),
    );
    if (ok) { router.replace('/'); logout(); }
  };

  const handleInstall = async () => {
    if (!installEvt) return;
    await installEvt.prompt();
    const { outcome } = await installEvt.userChoice;
    if (outcome === 'accepted') setInstallEvt(null);
  };

  const sizes = [
    [1.0, t('Small', 'چھوٹا', 'کوچنی')],
    [1.18, t('Default', 'عام', 'معیاري')],
    [1.34, t('Large', 'بڑا', 'لوی')],
    [1.5, t('X-Large', 'بہت بڑا', 'خورا لوی')],
  ] as const;

  return (
    <div className="screen fade-in">
      <header className="header bordered">
        <button type="button" className="icon-btn" onClick={() => goBack(router, '/')} aria-label="Back"><ArrowLeft size={24} /></button>
        <div className="header-mid">
          <h1 className="title fs-20">Settings</h1>
          <div className="subtitle fs-12" lang="ur">{t('ترتیبات', 'ترتیبات', 'ترتیبونه')}</div>
        </div>
      </header>

      <div className="settings">
        <SectionLabel title={t('Business Accounts', 'کاروباری کھاتے', 'کاروباري حسابونه')} />
        <div className="s-card">
          {khatas.map(k => {
            const active = activeKhata?.id === k.id;
            return (
              <div key={k.id} className="biz-row">
                <span className={`biz-icon ${active ? 'active' : ''}`}><Briefcase size={18} /></span>
                <button type="button" className="biz-info" onClick={() => setActiveKhata(k)}>
                  <span className="biz-name fs-15">{k.name}{active && <span className="active-badge">{t('Active', 'فعال', 'فعال')}</span>}</span>
                  {k.phone && <span className="biz-phone fs-12"><bdi dir="ltr">{k.phone}</bdi></span>}
                </button>
                <button type="button" className="icon-btn" onClick={() => openEdit(k)} aria-label={`Edit ${k.name}`}><Pencil size={18} /></button>
                <button type="button" className="icon-btn red" onClick={() => handleDeleteBusiness(k)} aria-label={`Delete ${k.name}`}><Trash2 size={18} /></button>
              </div>
            );
          })}
          <button type="button" className="add-biz fs-15" onClick={openAdd}>
            <PlusCircle size={20} /> {t('Add New Business Account', 'نیا کاروباری کھاتہ', 'نوی کاروباري حساب زیات کړئ')}
          </button>
        </div>

        <SectionLabel title={t('Data Management', 'ڈیٹا انتظام', 'د ډیټا مدیریت')} />
        <div className="s-card">
          <ActionRow icon={<Download size={20} />} color="var(--indigo)" loading={exporting} onClick={handleExport}
            label={t('Export Data', 'ڈیٹا ایکسپورٹ', 'ډیټا صادر کړئ')}
            sub={t(
              `Export "${activeKhata?.name ?? 'current business'}" as a .json backup`,
              `"${activeKhata?.name ?? 'موجودہ کاروبار'}" کا .json بیک اپ`,
              `"${activeKhata?.name ?? 'اوسنی سوداګري'}" د .json بیک اپ په توګه`,
            )} />
          <ActionRow icon={<Upload size={20} />} color="var(--gold)" loading={importing} onClick={() => fileRef.current?.click()}
            label={t('Import Data', 'ڈیٹا امپورٹ', 'ډیټا وارد کړئ')}
            sub={t('Merge new records from a .json backup — no duplicates', '.json بیک اپ سے نئے ریکارڈ شامل کریں', 'د .json بیک اپ نه نوي ثبتونه یوځای کړئ')} />
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => handleImportFile(e.target.files?.[0])} />
        </div>

        <SectionLabel title={t('Language', 'زبان / Language', 'ژبه / Language')} />
        <div className="s-card pad">
          <div className="seg-row tight">
            {(['en', 'ur', 'ps'] as const).map(l => (
              <button key={l} type="button" className={`lang-btn fs-13 ${language === l ? 'on' : ''}`} onClick={() => setLanguage(l)} lang={l}>
                {l === 'en' ? '🇬🇧 English' : l === 'ur' ? '🇵🇰 اردو' : '🇦🇫 پښتو'}
              </button>
            ))}
          </div>
        </div>

        <SectionLabel title={t('Appearance', 'ظاہری شکل', 'بڼه')} />
        <div className="s-card">
          <div className="switch-row">
            {isDark ? <Moon size={20} color="#818CF8" /> : <Sun size={20} color="var(--gold)" />}
            <span className="grow1 fs-15">{isDark ? t('Dark Mode', 'تاریک موڈ', 'تیاره حالت') : t('Light Mode', 'روشن موڈ', 'رڼا حالت')}</span>
            <Switch checked={isDark} onChange={v => setTheme(v ? 'dark' : 'light')} label={t('Dark Mode', 'تاریک موڈ', 'تیاره حالت')} />
          </div>
          <div className="switch-row">
            <Palette size={20} color="var(--indigo)" />
            <span className="grow1">
              <span className="block fs-15">{t('Balance colour', 'بیلنس رنگ', 'د بیلنس رنګ')}</span>
              <span className="block fs-11 muted">{t('"You Get" shows as…', '"لینا" کا رنگ', '"اخیستل" رنګ')}</span>
            </span>
            <button type="button" className={`color-pill red ${getColorRed ? 'on' : ''}`} onClick={() => setGetColorRed(true)} aria-label="Red" aria-pressed={getColorRed}>🔴</button>
            <button type="button" className={`color-pill green ${!getColorRed ? 'on' : ''}`} onClick={() => setGetColorRed(false)} aria-label="Green" aria-pressed={!getColorRed}>🟢</button>
          </div>
        </div>

        <SectionLabel title={t('Notifications', 'اطلاعات', 'خبرتیاوې')} />
        <div className="s-card">
          <div className="switch-row">
            <Bell size={20} color="var(--indigo)" />
            <span className="grow1">
              <span className="block fs-15">{t('Enable notifications', 'اطلاعات فعال کریں', 'خبرتیاوې فعاله کړئ')}</span>
              <span className="block fs-11 muted">{t('Payment reminders & confirmations', 'ادائیگی کی یاد دہانی اور تصدیق', 'د تادیې یادونه او تایید')}</span>
            </span>
            <Switch checked={notifications} onChange={handleToggleNotifications} label={t('Enable notifications', 'اطلاعات فعال کریں', 'خبرتیاوې فعاله کړئ')} />
          </div>
          <div className="switch-row">
            <CalendarDays size={20} color="var(--gold)" />
            <span className="grow1">
              <span className="block fs-15">{t('Daily summary', 'روزانہ خلاصہ', 'ورځنی لنډیز')}</span>
              <span className="block fs-11 muted">{t('Every day at 9:00 AM', 'ہر روز صبح 9 بجے', 'هره ورځ د سهار ۹ بجه')}</span>
            </span>
            <Switch checked={dailySummary} onChange={handleToggleDaily} label={t('Daily summary', 'روزانہ خلاصہ', 'ورځنی لنډیز')} />
          </div>
        </div>

        <SectionLabel title={t('Text Size', 'متن کا سائز', 'د متن اندازه')} />
        <div className="s-card">
          <div className="size-row">
            {sizes.map(([scale, lbl], i) => {
              const on = Math.abs(textScale - scale) < 0.02;
              return (
                <button key={scale} type="button" className={`size-btn ${on ? 'on' : ''}`} onClick={() => setTextScale(scale)} aria-pressed={on}>
                  <span style={{ fontSize: 12 + i * 4, fontWeight: 800 }}>A</span>
                  <span className="size-lbl">{lbl}</span>
                </button>
              );
            })}
          </div>
          <div className="size-preview fs-15">
            {t('Preview: Abdul Wali Kakar — Rs 12,345', 'نمونہ: عبدالولی کاکڑ — ۱۲٬۳۴۵ روپے', 'نمونه: عبدالولي کاکړ — ۱۲٬۳۴۵ روپۍ')}
          </div>
        </div>

        <SectionLabel title={t('Security', 'سیکیورٹی', 'امنیت')} />
        <div className="s-card">
          <ActionRow icon={<KeyRound size={20} />} color="var(--indigo)" onClick={() => setShowChangePin(true)}
            label={t('Change PIN', 'PIN تبدیل کریں', 'PIN بدل کړئ')}
            sub={t('Update your 4-digit security PIN', 'اپنا 4 ہندسے کا PIN تبدیل کریں', 'خپل ۴ عددي امنیتي PIN بدل کړئ')} />
          <ActionRow icon={<LogOut size={20} />} color="var(--red)" onClick={handleLogout}
            label={t('Logout', 'لاگ آوٹ', 'وتل')}
            sub={t('Lock the app and return to PIN screen', 'ایپ بند کریں اور PIN اسکرین پر واپس جائیں', 'اپلیکیشن بنده کړئ او PIN اسکرین ته بیرته لاړ شئ')} />
        </div>

        {(installEvt || !standalone) && (
          <>
            <SectionLabel title={t('App', 'ایپ', 'اپلیکیشن')} />
            <div className="s-card">
              {installEvt ? (
                <ActionRow icon={<Smartphone size={20} />} color="var(--green)" onClick={handleInstall}
                  label={t('Install app', 'ایپ انسٹال کریں', 'اپلیکیشن نصب کړئ')}
                  sub={t('Add Hisab Kitab to your home screen — works offline', 'حساب کتاب کو ہوم اسکرین پر شامل کریں — آف لائن چلتی ہے', 'حساب کتاب کور سکرین ته زیات کړئ — پرته له انټرنیټه کار کوي')} />
              ) : (
                <div className="info-row fs-13">
                  <Smartphone size={20} color="var(--green)" />
                  <span>{t(
                    'To install: open the browser menu and choose "Add to Home screen" (iPhone: Share → Add to Home Screen).',
                    'انسٹال کرنے کیلئے: براؤزر مینو میں "Add to Home screen" منتخب کریں (آئی فون: Share → Add to Home Screen)۔',
                    'د نصبولو لپاره: د براوزر مینو کې "Add to Home screen" وټاکئ (آیفون: Share → Add to Home Screen).',
                  )}</span>
                </div>
              )}
            </div>
          </>
        )}

        <SectionLabel title={t('About', 'بارے میں', 'د اپلیکیشن بارې')} />
        <div className="s-card pad">
          <div className="fs-17 strong">{t('Developed by:', 'تیار کردہ:', 'جوړوونکی:')}</div>
          <div className="fs-13 muted">Muhammad Osama Anwar</div>
          <div className="fs-13 muted">Contact: +92 332 6551460</div>
        </div>
        <div style={{ height: 80 }} />
      </div>

      <Sheet open={!!bizModal} onClose={() => setBizModal(null)} label={t('Business', 'کاروبار', 'سوداګري')}>
        <form onSubmit={e => { e.preventDefault(); handleSaveBusiness(); }}>
          <h2 className="sheet-title fs-20">
            {bizModal === 'edit' ? t('Edit Business Account', 'کاروباری کھاتہ ترمیم کریں', 'کاروباري حساب سمول') : t('Add Business Account', 'کاروباری کھاتہ شامل کریں', 'کاروباري حساب زیات کړئ')}
          </h2>
          <label className="label fs-13" htmlFor="b-name">{t('Business Name *', 'کاروبار کا نام *', 'د سوداګرۍ نوم *')}</label>
          <input id="b-name" className="input fs-15" value={newName} onChange={e => setNewName(e.target.value)} autoFocus
            placeholder={t('e.g. Rana General Store', 'مثلاً رانا جنرل اسٹور', 'د بیلګي: رانا جنرل سټور')} />
          <label className="label fs-13" htmlFor="b-phone">{t('Phone (optional)', 'فون (اختیاری)', 'تلیفون (اختیاري)')}</label>
          <input id="b-phone" className="input fs-15" value={newPhone} inputMode="tel" maxLength={11} placeholder="03001234567"
            onChange={e => setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} />
          <div className="btn-row">
            <button type="button" className="btn ghost fs-15" onClick={() => setBizModal(null)}>{t('Cancel', 'منسوخ', 'لغوه کړئ')}</button>
            <button type="submit" className="btn primary fs-15" disabled={saving || !newName.trim()}>{saving ? <Spinner light /> : t('Save', 'محفوظ کریں', 'خوندي کړئ')}</button>
          </div>
        </form>
      </Sheet>

      {showChangePin && <ChangePin onClose={() => setShowChangePin(false)} onDone={() => { setShowChangePin(false); dialog.alert(t('Success', 'کامیاب', 'بریا'), t('PIN changed successfully.', 'PIN کامیابی سے تبدیل ہو گیا۔', 'PIN بریالیتوب سره بدل شو.'), t('OK', 'ٹھیک ہے', 'سم')); }} />}
    </div>
  );
}

function ChangePin({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useT();
  const [step, setStep] = useState<'loading' | 'current' | 'new' | 'confirm'>('loading');
  const [had, setHad] = useState(true);
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { hasPin().then(h => { setHad(h); setStep(h ? 'current' : 'new'); }); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handle = async (pin: string) => {
    setError('');
    if (step === 'current') {
      if (await checkPin(pin)) { setStep('new'); return; }
      setError(t('Wrong PIN. Try again.', 'غلط PIN۔ دوبارہ کوشش کریں۔', 'غلط PIN. بیا هڅه وکړئ.'));
      return false;
    }
    if (step === 'new') { setNewPin(pin); setStep('confirm'); return; }
    if (pin === newPin) { await savePin(pin); onDone(); return; }
    setError(t("PINs don't match. Try again.", 'PINs مماثل نہیں۔ دوبارہ کوشش کریں۔', 'PINs سره سمون نه خوري. بیا هڅه وکړئ.'));
    setStep('new');
    setNewPin('');
    return false;
  };

  if (step === 'loading') return <div className="lock overlay-full" />;
  const steps = had ? (['current', 'new', 'confirm'] as const) : (['new', 'confirm'] as const);
  const subtitle = {
    current: t('Enter your current PIN', 'موجودہ PIN درج کریں', 'اوسنی PIN دننه کړئ'),
    new: t('Enter a new PIN', 'نیا PIN درج کریں', 'نوی PIN دننه کړئ'),
    confirm: t('Confirm new PIN', 'نیا PIN تصدیق کریں', 'نوی PIN تایید کړئ'),
  }[step];

  return (
    <div className="lock overlay-full slide-up" role="dialog" aria-modal="true" aria-label={t('Change PIN', 'PIN تبدیل کریں', 'PIN بدل کړئ')}>
      <button type="button" className="close-btn" onClick={onClose} aria-label="Close"><X size={26} /></button>
      <PinPad
        key={step}
        subtitle={subtitle}
        error={error}
        onComplete={handle}
        top={(
          <div className="brand">
            <div className="brand-title">{t('Change PIN', 'PIN تبدیل کریں', 'PIN بدل کړئ')}</div>
            <div className="steps">{steps.map(s => <span key={s} className={`step ${step === s ? 'on' : ''}`} />)}</div>
          </div>
        )}
      />
    </div>
  );
}

function SectionLabel({ title }: { title: string }) {
  return <div className="s-label">{title.toUpperCase()}</div>;
}

function ActionRow({ icon, color, label, sub, onClick, loading }: { icon: ReactNode; color: string; label: string; sub: string; onClick: () => void; loading?: boolean }) {
  return (
    <button type="button" className="action-row" onClick={onClick} disabled={loading}>
      <span className="action-icon" style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>{icon}</span>
      <span className="grow1">
        <span className="block fs-15 strong">{label}</span>
        <span className="block fs-12 muted">{sub}</span>
      </span>
      {loading ? <Spinner /> : <ChevronRight size={16} color="var(--muted)" />}
    </button>
  );
}
