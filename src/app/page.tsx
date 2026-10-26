'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, ChevronRight, Plus, Settings, Trash2 } from 'lucide-react';
import { useApp, useBalanceColor, useT } from '@/context/AppContext';
import { Sheet, Spinner, useDialog, useLongPress } from '@/components/ui';
import type { Khata } from '@/lib/db';
import { createKhata, deleteKhata, getKhataSummaries, updateKhata, type KhataSummary } from '@/lib/repo';
import { formatPKR, initials } from '@/lib/format';
import { navTo } from '@/lib/nav';

const ACCENTS = ['var(--indigo)', 'var(--gold)', 'var(--green)'];

export default function BooksScreen() {
  const router = useRouter();
  const { state, setActiveKhata, refreshKhatas, setLanguage } = useApp();
  const { khatas, language } = state;
  const t = useT();
  const dialog = useDialog();
  const balColor = useBalanceColor();

  const [summaries, setSummaries] = useState<Record<number, KhataSummary>>({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Khata | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      await refreshKhatas();
      setSummaries(await getKhataSummaries());
    } finally {
      setLoading(false);
    }
  }, [refreshKhatas]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditTarget(null); setName(''); setPhone(''); setModal(true); };
  const openEdit = useCallback((k: Khata) => { setEditTarget(k); setName(k.name); setPhone(k.phone ?? ''); setModal(true); }, []);

  // Auto-open the create sheet for first-time users (no books at all)
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!loading && !autoOpened.current && khatas.length === 0) {
      autoOpened.current = true;
      openCreate();
    }
  }, [loading, khatas.length]);

  const handleSave = async () => {
    if (!name.trim()) return;
    try {
      setSaving(true);
      if (editTarget) await updateKhata(editTarget.id, { name: name.trim(), phone: phone.trim() || undefined });
      else await createKhata({ name: name.trim(), phone: phone.trim() || undefined });
      setModal(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (k: Khata) => {
    const ok = await dialog.confirm(
      t('Delete Book', 'کتاب حذف کریں', 'کتابه ړنګ کړئ'),
      `${t('Delete', 'حذف کریں', 'ړنګ کړئ')} "${k.name}"? ${t('All its customers, suppliers and transactions will be lost.', 'تمام گاہک، سپلائر اور لین دین ختم ہو جائیں گے۔', 'ټول پیرودونکي، عرضه کوونکي او معاملې به له منځه لاړ شي.')}`,
      t('Delete', 'حذف', 'ړنګ کړئ'), t('Cancel', 'منسوخ', 'لغوه کړئ'),
    );
    if (ok) { await deleteKhata(k.id); await load(); }
  };

  const openBook = useCallback((k: Khata) => {
    setActiveKhata(k);
    navTo(router, `/ledger/?k=${k.id}`);
  }, [router, setActiveKhata]);

  const cycleLang = () => setLanguage(language === 'en' ? 'ur' : language === 'ur' ? 'ps' : 'en');
  const press = useLongPress<Khata>(openEdit, openBook);

  return (
    <div className="screen fade-in">
      <header className="header">
        <div className="header-mid">
          <h1 className="title fs-20">{t('Hisab Kitab', 'حساب کتاب', 'حساب کتاب')}</h1>
          <div className="subtitle fs-12">{t('Your Books', 'آپ کی کتابیں', 'ستاسو کتابونه')}</div>
        </div>
        <button type="button" className="lang-pill" onClick={cycleLang} aria-label="Change language">
          <span className={language === 'en' ? 'on' : ''}>EN</span> · <span className={language === 'ur' ? 'on' : ''} lang="ur">اردو</span> · <span className={language === 'ps' ? 'on' : ''} lang="ps">پښتو</span>
        </button>
        <button type="button" className="icon-btn" onClick={() => navTo(router, '/settings/')} aria-label={t('Settings', 'ترتیبات', 'ترتیبونه')}>
          <Settings size={21} />
        </button>
      </header>

      {loading ? (
        <div className="center grow"><Spinner /></div>
      ) : (
        <div className="list pad-fab">
          {khatas.length > 0 ? (
            <div className="section-label fs-11">
              {t('YOUR BOOKS', 'آپ کی کتابیں', 'ستاسو کتابونه')} · {khatas.length}
              <span className="hint">{t('long-press to edit', 'ترمیم کیلئے دبائیں', 'د سمون لپاره ټینګ ونیسئ')}</span>
            </div>
          ) : (
            <div className="empty">
              <BookOpen size={56} color="var(--muted)" />
              <div className="empty-title fs-15">{t('No books yet', 'کوئی کتاب نہیں', 'کومه کتابه نشته')}</div>
              <div className="empty-sub fs-13">{t('Create your first book below', 'نیچے سے نئی کتاب بنائیں', 'لاندې لومړۍ کتابه جوړ کړئ')}</div>
            </div>
          )}
          {khatas.map((k, i) => {
            const s = summaries[k.id];
            const net = s?.net ?? 0;
            const contacts = s?.contacts ?? 0;
            const accent = ACCENTS[i % 3];
            return (
              <button key={k.id} type="button" className="card book" {...press(k)}>
                <span className="book-icon" style={{ color: accent, background: `color-mix(in srgb, ${accent} 12%, transparent)` }}>{initials(k.name) || '؟'}</span>
                <span className="book-mid">
                  <span className="book-name fs-15">{k.name}</span>
                  <span className="book-meta fs-11">
                    <bdi>{contacts}</bdi> {t(contacts === 1 ? 'contact' : 'contacts', 'رابطے', 'اړیکې')}{k.phone ? <>  ·  <bdi dir="ltr">{k.phone}</bdi></> : null}
                  </span>
                </span>
                <span className="book-end">
                  <span className="book-net" style={{ color: balColor(net) }}>{net < 0 ? '− ' : ''}{formatPKR(Math.abs(net))}</span>
                  <span className="book-net-label fs-11">
                    {Math.abs(net) < 0.005 ? t('settled', 'برابر', 'برابر') : net > 0 ? t('you get', 'لینا', 'اخیستل') : t('you owe', 'دینا', 'ورکول')}
                  </span>
                </span>
                <ChevronRight size={16} color="var(--muted)" />
              </button>
            );
          })}
        </div>
      )}

      <button type="button" className="fab pop-in" onClick={openCreate}>
        <Plus size={24} /> <span className="fs-15">{t('New Book', 'نئی کتاب', 'نوي کتاب')}</span>
      </button>

      <Sheet open={modal} onClose={() => setModal(false)} label={t('Book', 'کتاب', 'کتابه')}>
        <form onSubmit={e => { e.preventDefault(); handleSave(); }}>
          <h2 className="sheet-title fs-20">
            {editTarget ? t('Edit Book', 'کتاب میں ترمیم', 'کتابه سمول') : t('Step 1: Create your store', 'پہلا قدم: اپنا کاروبار بنائیں', 'لومړی ګام: خپله سوداګري جوړ کړئ')}
          </h2>
          {!editTarget && (
            <p className="sheet-hint fs-13">{t('One book = one business. You can add more later.', 'ایک کتاب = ایک کاروبار۔ بعد میں مزید شامل کر سکتے ہیں۔', 'یوه کتابه = یوه سوداګري. وروسته نور هم زیاتولای شئ.')}</p>
          )}
          <label className="label fs-13" htmlFor="book-name">{t('Business name *', 'کاروبار کا نام *', 'د سوداګرۍ نوم *')}</label>
          <input id="book-name" className="input fs-15" value={name} onChange={e => setName(e.target.value)} autoFocus
            placeholder={t('e.g. Rana General Store', 'مثلاً رانا جنرل اسٹور', 'د بیلګي: رانا جنرل سټور')} />
          <label className="label fs-13" htmlFor="book-phone">{t('Phone (optional)', 'فون (اختیاری)', 'تلیفون (اختیاري)')}</label>
          <input id="book-phone" className="input fs-15" value={phone} inputMode="tel" maxLength={11} placeholder="03001234567"
            onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} />
          <div className="btn-row">
            <button type="button" className="btn ghost fs-15" onClick={() => setModal(false)}>{t('Cancel', 'منسوخ', 'لغوه کړئ')}</button>
            <button type="submit" className="btn primary fs-15" disabled={saving || !name.trim()}>
              {saving ? <Spinner light /> : editTarget ? t('Save', 'محفوظ کریں', 'خوندي کړئ') : t('Get Started', 'شروع کریں', 'پیل کړئ')}
            </button>
          </div>
          {editTarget && (
            <button type="button" className="delete-link fs-13" onClick={() => { setModal(false); setTimeout(() => handleDelete(editTarget), 250); }}>
              <Trash2 size={16} /> {t('Delete this book', 'یہ کتاب حذف کریں', 'دا کتابه ړنګ کړئ')}
            </button>
          )}
        </form>
      </Sheet>
    </div>
  );
}
