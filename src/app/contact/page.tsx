'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlarmClock, ArrowDownCircle, ArrowLeft, ArrowUpCircle, BarChart3, Calendar, Clock, CloudOff, FileText, Pencil,
  Receipt, Share2, Trash2, XCircle,
} from 'lucide-react';
import { useApp, useBalanceColor, useT } from '@/context/AppContext';
import { Sheet, Spinner, Switch, useDialog, useLongPress } from '@/components/ui';
import { DateFilterSheet, presetRange, type DateRange } from '@/components/DateFilterSheet';
import type { Account, Transaction } from '@/lib/db';
import {
  addTransaction, deleteTransaction, getAccountById, getTransactionsWithRunningBalance, updateTransaction,
} from '@/lib/repo';
import { calcPeriod } from '@/lib/ledgerMath';
import { applyCalcKey, evalExpr } from '@/lib/calc';
import {
  fitFont, formatDate, formatPKR, formatTime, initials, localHM, localISO, parseLocalDate, parseTimestamp, shortDate,
} from '@/lib/format';
import { generateLedgerReport } from '@/lib/pdf';
import { cancelReminder, notifyEntryAdded, scheduleDueReminder } from '@/lib/notify';
import { goBack } from '@/lib/nav';

async function fetchLedger(accountId: number) {
  const acct = await getAccountById(accountId);
  const list = acct ? await getTransactionsWithRunningBalance(accountId, acct.opening_balance, acct.opening_balance_type) : [];
  return { acct, list };
}

const CALC_ROWS =[['C', '⌫', '÷', '×'], ['7', '8', '9', '−'], ['4', '5', '6', '+'], ['1', '2', '3', '=']];

export default function ContactPage() {
  return <Suspense fallback={<div className="screen center"><Spinner /></div>}><ContactLedgerScreen /></Suspense>;
}

function ContactLedgerScreen() {
  const router = useRouter();
  const accountId = Number(useSearchParams().get('id')) || null;
  const { state } = useApp();
  const { language, activeKhata, notifications } = state;
  const t = useT();
  const dialog = useDialog();
  const balColor = useBalanceColor();

  const [account, setAccount] = useState<Account | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [filterModal, setFilterModal] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Entry sheet
  const [modal, setModal] = useState(false);
  const [entryType, setEntryType] = useState<'gave' | 'got'>('gave');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date());
  const [saving, setSaving] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [detailTxn, setDetailTxn] = useState<Transaction | null>(null);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderDate, setReminderDate] = useState<string>('');

  // Bumping `version` re-fetches after any change
  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion(v => v + 1), []);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    fetchLedger(accountId)
      .then(result => {
        if (cancelled) return;
        setAccount(result.acct);
        setTxns(result.list);
        setLoadError(false);
      })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accountId, version]);

  const backToLedger = () => goBack(router, account ? `/ledger/?k=${account.khata_id}` : '/');

  // ── Period figures (single source of truth: full chronological list) ──
  const filterActive = !!(range.from || range.to);
  const { periodOpening, totalDebit: rangeDr, totalCredit: rangeCr, periodClosing } = account
    ? calcPeriod(txns, account.opening_balance, account.opening_balance_type, range.from, range.to)
    : { periodOpening: 0, totalDebit: 0, totalCredit: 0, periodClosing: 0 };
  const filteredTxns = txns.filter(x => (!range.from || x.date >= range.from) && (!range.to || x.date <= range.to));
  const closingColor = balColor(periodClosing);

  const rangeLabel = filterActive
    ? `${range.from ? shortDate(range.from) : '…'} → ${range.to ? shortDate(range.to) : '…'}`
    : t('All time', 'تمام عرصہ', 'ټوله موده');

  const handleDownload = async () => {
    if (!account) return;
    try {
      setDownloading(true);
      const result = await generateLedgerReport({
        account, transactions: filteredTxns, periodOpening, periodClosing, rangeDr, rangeCr,
        fromDate: range.from, toDate: range.to,
        businessName: activeKhata?.name, businessPhone: activeKhata?.phone, lang: language,
      });
      if (result === 'downloaded') dialog.toast(t('Statement downloaded', 'گوشوارہ ڈاؤن لوڈ ہو گیا', 'بیان ډاونلوډ شو'));
    } catch (e) {
      dialog.alert(t('Error', 'خرابی', 'ستونزه'), (e as Error)?.message ?? 'Could not generate report.');
    } finally {
      setDownloading(false);
    }
  };

  // ── Entry sheet ──
  const openEntry = (type: 'gave' | 'got') => {
    setEditingTxn(null);
    setEntryType(type);
    setAmount(''); setNote(''); setDate(new Date());
    setReminderOn(false); setReminderDate('');
    setModal(true);
  };

  const openEditTxn = useCallback((x: Transaction) => {
    setEditingTxn(x);
    setEntryType(x.debit > 0 ? 'gave' : 'got');
    setAmount(String(x.debit > 0 ? x.debit : x.credit));
    setNote(x.description ?? '');
    // Ledger date, with the time of day restored from created_at
    const d = parseLocalDate(x.date);
    const saved = parseTimestamp(x.created_at);
    if (saved) d.setHours(saved.getHours(), saved.getMinutes(), 0, 0);
    setDate(d);
    setReminderOn(!!x.due_date);
    setReminderDate(x.due_date ?? '');
    setModal(true);
  }, []);

  const closeEntry = () => { setModal(false); setEditingTxn(null); };
  const pressKey = (k: string) => setAmount(a => applyCalcKey(a, k));

  // Desktop keyboard: type amounts straight into the calculator while the entry sheet is open
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
      const map: Record<string, string> = { '*': '×', '/': '÷', '-': '−', '+': '+', '=': '=', Backspace: '⌫', Delete: 'C', '.': '.' };
      if (/^[0-9]$/.test(e.key)) pressKey(e.key);
      else if (map[e.key]) { e.preventDefault(); pressKey(map[e.key]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

  const handleSave = async () => {
    const computed = evalExpr(amount);
    const amt = computed != null ? computed : parseFloat(amount.replace(/,/g, ''));
    if (amt == null || isNaN(amt) || amt <= 0) {
      dialog.alert(t('Enter amount', 'رقم درج کریں', 'مقدار دننه کړئ'), t('Please enter a valid amount.', 'درست رقم درج کریں۔', 'مهرباني وکړئ سم مقدار دننه کړئ.'));
      return;
    }
    if (reminderOn && !reminderDate) {
      dialog.alert(t('Pick due date', 'تاریخ منتخب کریں', 'د تادیې نیټه وټاکئ'));
      return;
    }
    if (!accountId) return;
    try {
      setSaving(true);
      const dueStr = reminderOn && reminderDate ? reminderDate : undefined;
      const data = {
        date: localISO(date),
        created_at: date.toISOString(),
        description: note.trim() || undefined,
        debit: entryType === 'gave' ? amt : 0,
        credit: entryType === 'got' ? amt : 0,
        due_date: dueStr,
      };
      let txnId: number;
      if (editingTxn) {
        txnId = editingTxn.id;
        await updateTransaction(txnId, data);
        if (!dueStr) await cancelReminder(`due_${txnId}`);
      } else {
        txnId = await addTransaction({ account_id: accountId, ...data });
        if (notifications) notifyEntryAdded(account?.name ?? '', entryType, amt, language).catch(() => {});
      }
      if (dueStr && notifications && (!editingTxn || editingTxn.due_date !== dueStr || editingTxn.debit + editingTxn.credit !== amt)) {
        scheduleDueReminder(`due_${txnId}`, account?.name ?? '', amt, dueStr, language).catch(() => {});
      }
      closeEntry();
      load();
    } catch (e) {
      dialog.alert(t('Error', 'خرابی', 'ستونزه'), (e as Error)?.message ?? t('Could not save entry.', 'اندراج محفوظ نہ ہو سکا', 'ثبت خوندي نشو'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (x: Transaction) => {
    const ok = await dialog.confirm(
      t('Delete entry?', 'حذف کریں؟', 'ثبت ړنګ کړئ؟'),
      t('This entry will be permanently deleted.', 'یہ اندراج مستقل حذف ہو جائے گا۔', 'دا ثبت به د تل لپاره ړنګ شي.'),
      t('Delete', 'حذف', 'ړنګ کړئ'), t('Cancel', 'منسوخ', 'لغوه کړئ'),
    );
    if (ok) { await deleteTransaction(x.id); load(); }
  };

  const handleLongPress = useCallback(async (x: Transaction) => {
    const choice = await dialog.choose(t('Entry', 'اندراج', 'ثبت'), t('What would you like to do?', 'کیا کرنا ہے؟', 'څه غواړئ وکړئ؟'), [
      { text: t('Cancel', 'منسوخ', 'لغوه کړئ'), value: 'cancel', style: 'cancel' },
      { text: t('Delete', 'حذف', 'ړنګ کړئ'), value: 'delete', style: 'destructive' },
      { text: t('Edit', 'ترمیم', 'سمول'), value: 'edit', style: 'primary' },
    ]);
    if (choice === 'edit') openEditTxn(x);
    else if (choice === 'delete') { await deleteTransaction(x.id); load(); }
  }, [dialog, t, openEditTxn, load]);

  const press = useLongPress<Transaction>(handleLongPress, setDetailTxn);

  if (loading && accountId) return <div className="screen center"><Spinner /></div>;

  if (loadError || !account) {
    return (
      <div className="screen center gap">
        <CloudOff size={48} color="var(--muted)" />
        <div className="empty-title fs-15">{loadError ? t('Could not load data', 'ڈیٹا لوڈ نہ ہو سکا', 'ډیټا لوډ نشو') : t('Contact not found', 'رابطہ نہیں ملا', 'اړیکه ونه موندل شوه')}</div>
        {loadError
          ? <button type="button" className="btn primary narrow" onClick={() => { setLoading(true); load(); }}>{t('Retry', 'دوبارہ کوشش', 'بیا هڅه')}</button>
          : <button type="button" className="btn primary narrow" onClick={() => router.replace('/')}>{t('Go to books', 'کتابوں پر جائیں', 'کتابونو ته لاړ شئ')}</button>}
      </div>
    );
  }

  const dot = account.type === 'customer' ? 'var(--indigo)' : 'var(--gold)';
  const accent = entryType === 'gave' ? 'var(--red)' : 'var(--green)';
  const reversed = [...filteredTxns].reverse();

  return (
    <div className="screen fade-in">
      <header className="header">
        <button type="button" className="icon-btn" onClick={backToLedger} aria-label="Back"><ArrowLeft size={24} /></button>
        <span className="avatar" style={{ color: dot, background: `color-mix(in srgb, ${dot} 12%, transparent)` }}>{initials(account.name) || '؟'}</span>
        <div className="header-mid">
          <h1 className="title fs-17 clamp2">{account.name}</h1>
          <div className="subtitle fs-11">
            {account.type === 'customer' ? t('Customer', 'گاہک', 'پیرودونکی') : t('Supplier', 'سپلائر', 'عرضه کوونکی')}
            {account.phone ? <>  ·  <bdi dir="ltr">{account.phone}</bdi></> : null}
          </div>
        </div>
        <button type="button" className="icon-btn indigo" onClick={handleDownload} disabled={downloading} aria-label={t('Share', 'شیئر رپورٹ', 'شریکول')}>
          {downloading ? <Spinner /> : <Share2 size={22} />}
        </button>
      </header>

      <div className="filter-bar">
        <div className={`filter-chip ${filterActive ? 'active' : ''}`}>
          <button type="button" className="filter-open fs-13" onClick={() => setFilterModal(true)}>
            <Calendar size={15} /> <span>{rangeLabel}</span>
          </button>
          {filterActive && (
            <button type="button" className="chip-clear" onClick={() => setRange(presetRange('all'))} aria-label="Clear date filter"><XCircle size={15} /></button>
          )}
        </div>
        <button type="button" className="report-btn fs-13" onClick={handleDownload} disabled={downloading}>
          <Share2 size={15} /> {t('Share', 'شیئر رپورٹ', 'شریکول')}
        </button>
      </div>

      <div className="bal-card">
        <div className="bal-col">
          <div className="bal-label caps">{t('YOU GAVE', 'کل دیا', 'ټول ورکړل')}</div>
          <div className="bal-amt" style={{ color: 'var(--red)', fontSize: fitFont(formatPKR(rangeDr), 16, 9) }}>{formatPKR(rangeDr)}</div>
          <span className="bal-pill" style={{ color: 'var(--red)' }}>Dr</span>
        </div>
        <div className="bal-divider" />
        <div className="bal-col">
          <div className="bal-label caps">{t('YOU GOT', 'کل لیا', 'ټول واخیستل')}</div>
          <div className="bal-amt" style={{ color: 'var(--green)', fontSize: fitFont(formatPKR(rangeCr), 16, 9) }}>{formatPKR(rangeCr)}</div>
          <span className="bal-pill" style={{ color: 'var(--green)' }}>Cr</span>
        </div>
        <div className="bal-divider" />
        <div className="bal-col">
          <div className="bal-label caps">{t('BALANCE', 'بیلنس', 'بیلانس')}</div>
          <div className="bal-amt" style={{ color: closingColor, fontSize: fitFont(formatPKR(Math.abs(periodClosing)), 16, 9) }}>{formatPKR(Math.abs(periodClosing))}</div>
          <span className="bal-pill" style={{ color: closingColor }}>
            {Math.abs(periodClosing) < 0.005 ? t('Clear', 'برابر', 'برابر') : periodClosing > 0 ? t('Dr', 'لینا', 'اخیستل') : t('Cr', 'دینا', 'ورکول')}
          </span>
        </div>
      </div>

      {filteredTxns.length === 0 ? (
        <div className="empty grow">
          <Receipt size={50} color="var(--muted)" />
          <div className="empty-title fs-15">
            {filterActive ? t('No entries in this range', 'اس عرصے میں کوئی اندراج نہیں', 'په دې موده کې هیڅ ثبت نشته') : t('No entries yet', 'کوئی لین دین نہیں', 'لا هیڅ ثبت نشته')}
          </div>
          <div className="empty-sub fs-13">{t('Add a gave / got entry below', 'نیچے سے اندراج کریں', 'لاندې د ورکړل/واخیستل ثبت اضافه کړئ')}</div>
        </div>
      ) : (
        <div className="list pad-actions">
          <div className="list-head fs-11">
            <span className="caps-label">{t('ENTRIES', 'لین دین', 'ثبتونه')} · {filteredTxns.length}</span>
            <span className="hint">{t('long-press to delete', 'حذف کیلئے دبائیں', 'د ړنګولو لپاره ټینګ ونیسئ')}</span>
          </div>
          <div className="col-hdr fs-11">
            <span className="col-left wide">{t('Details · Date', 'تفصیل · تاریخ', 'توضیحات · نیټه')}</span>
            <span className="col-amt flex">{t('You Gave', 'دیا (Dr)', 'ورکړل')}</span>
            <span className="col-amt flex">{t('You Got', 'لیا (Cr)', 'واخیستل')}</span>
          </div>
          {reversed.map(x => {
            const gave = x.debit > 0;
            const rb = x.running_balance ?? 0;
            return (
              <button key={x.id} type="button" className="txn" {...press(x)}>
                <span className="txn-info">
                  <span className="txn-date">{formatDate(x.date)}{x.created_at ? <span className="txn-time"> · {formatTime(x.created_at)}</span> : null}</span>
                  {x.description ? <span className="txn-note fs-13">{x.description}</span> : null}
                  <span className="txn-bal fs-11" style={{ color: balColor(rb) }}>
                    {formatPKR(Math.abs(rb))}
                    {x.due_date ? <AlarmClock size={11} className="txn-alarm" aria-label={t('Reminder', 'یاد دہانی', 'یادونه')} /> : null}
                  </span>
                </span>
                <span className="txn-amt">
                  {gave ? <span style={{ color: 'var(--red)', fontSize: fitFont(formatPKR(x.debit), 15, 9) }}>{formatPKR(x.debit)}</span> : <span className="dash">—</span>}
                </span>
                <span className="txn-amt">
                  {!gave ? <span style={{ color: 'var(--green)', fontSize: fitFont(formatPKR(x.credit), 15, 9) }}>{formatPKR(x.credit)}</span> : <span className="dash">—</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="action-bar">
        <button type="button" className="action-btn gave fs-15" onClick={() => openEntry('gave')}>
          <ArrowUpCircle size={20} /> {t('You Gave', 'میں نے دیا', 'ما ورکړل')}
        </button>
        <button type="button" className="action-btn got fs-15" onClick={() => openEntry('got')}>
          <ArrowDownCircle size={20} /> {t('You Got', 'میں نے لیا', 'ما واخیستل')}
        </button>
      </div>

      {/* Entry sheet */}
      <Sheet open={modal} onClose={closeEntry} label={t('Entry', 'اندراج', 'ثبت')}>
        <form onSubmit={e => { e.preventDefault(); handleSave(); }}>
          <h2 className="sheet-title fs-20" style={{ color: accent }}>
            {editingTxn ? t('Edit Entry', 'اندراج میں ترمیم', 'ثبت سمول') : entryType === 'gave' ? t('You Gave', 'میں نے دیا', 'ما ورکړل') : t('You Got', 'میں نے لیا', 'ما واخیستل')}
          </h2>
          {editingTxn && (
            <div className="seg-row">
              {(['gave', 'got'] as const).map(ty => (
                <button key={ty} type="button" className={`seg fs-13 ${entryType === ty ? 'on' : ''}`}
                  style={{ '--seg': ty === 'gave' ? 'var(--red)' : 'var(--green)' } as React.CSSProperties} onClick={() => setEntryType(ty)}>
                  {ty === 'gave' ? t('You Gave', 'میں نے دیا', 'ما ورکړل') : t('You Got', 'میں نے لیا', 'ما واخیستل')}
                </button>
              ))}
            </div>
          )}

          <div className="label fs-13">{t('Amount *', 'رقم *', 'مقدار *')}</div>
          <div className="amount-display" style={{ color: accent }} aria-live="polite">
            <span style={{ fontSize: fitFont(amount || '0', 30, 12, 16) }}>{amount || '0'}</span>
          </div>
          <div className="calc">
            {CALC_ROWS.map((row, ri) => (
              <div key={ri} className="calc-row">
                {row.map(k => {
                  const op = ['÷', '×', '−', '+'].includes(k);
                  const eq = k === '=';
                  const clr = k === 'C' || k === '⌫';
                  return (
                    <button key={k} type="button" className={`calc-key ${eq ? 'eq' : ''}`} onClick={() => pressKey(k)}
                      style={eq ? { background: accent, color: '#fff' } : { color: op ? accent : clr ? 'var(--red)' : 'var(--text)' }}>
                      {k}
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="calc-row">
              <button type="button" className="calc-key span2" onClick={() => pressKey('0')}>0</button>
              <button type="button" className="calc-key" onClick={() => pressKey('00')}>00</button>
              <button type="button" className="calc-key" onClick={() => pressKey('.')}>.</button>
            </div>
          </div>

          <label className="label fs-13" htmlFor="e-note">{t('Note (optional)', 'تفصیل (اختیاری)', 'یادداشت (اختیاري)')}</label>
          <input id="e-note" className="input fs-15" value={note} onChange={e => setNote(e.target.value)}
            placeholder={t('e.g. Goods purchase', 'مثلاً مال کی خریداری', 'د بیلګې: د مالونو پیرود')} />

          <div className="label fs-13 strong">{t('Date & Time', 'تاریخ اور وقت', 'نیټه او وخت')}</div>
          <div className="dt-row">
            <span className="date-input grow1">
              <Calendar size={16} color="var(--indigo)" />
              <input type="date" className="fs-13" value={localISO(date)} aria-label={t('Date', 'تاریخ', 'نیټه')}
                onChange={e => {
                  if (!e.target.value) return;
                  const n = parseLocalDate(e.target.value);
                  n.setHours(date.getHours(), date.getMinutes(), 0, 0);
                  setDate(n);
                }} />
            </span>
            <span className="date-input time">
              <Clock size={16} color="var(--indigo)" />
              <input type="time" className="fs-13" value={localHM(date)} aria-label={t('Time', 'وقت', 'وخت')}
                onChange={e => {
                  if (!e.target.value) return;
                  const [h, m] = e.target.value.split(':').map(Number);
                  const n = new Date(date);
                  n.setHours(h, m, 0, 0);
                  setDate(n);
                }} />
            </span>
          </div>

          <div className="reminder-row">
            <AlarmClock size={18} color="var(--indigo)" />
            <div className="grow1">
              <div className="fs-15 strong">{t('Set reminder', 'یاد دہانی لگائیں', 'یادونه کېږدئ')}</div>
              <div className="fs-11 muted">
                {notifications
                  ? t('Notify on a due date', 'ادائیگی کی تاریخ پر اطلاع', 'د تادیې په نیټه خبرتیا')
                  : t('Saved as due date — turn on notifications in Settings to get alerts', 'واجبی تاریخ محفوظ ہوگی — اطلاع کیلئے سیٹنگز میں نوٹیفیکیشن آن کریں', 'د تادیې نیټه خوندي کیږي — د خبرتیا لپاره په ترتیباتو کې خبرتیاوې فعالې کړئ')}
              </div>
            </div>
            <Switch checked={reminderOn} onChange={setReminderOn} label={t('Set reminder', 'یاد دہانی لگائیں', 'یادونه کېږدئ')} />
          </div>
          {reminderOn && (
            <span className="date-input block">
              <Calendar size={18} color="var(--indigo)" />
              <input type="date" className="fs-15" value={reminderDate} onChange={e => setReminderDate(e.target.value)} aria-label={t('Pick due date', 'تاریخ منتخب کریں', 'د تادیې نیټه وټاکئ')} />
            </span>
          )}

          <div className="btn-row">
            <button type="button" className="btn ghost fs-15" onClick={closeEntry}>{t('Cancel', 'منسوخ', 'لغوه کړئ')}</button>
            <button type="submit" className="btn fs-15" style={{ background: accent, color: '#fff' }} disabled={saving}>
              {saving ? <Spinner light /> : t('Save', 'محفوظ کریں', 'خوندي کړئ')}
            </button>
          </div>
        </form>
      </Sheet>

      {/* Transaction detail */}
      <Sheet open={!!detailTxn} onClose={() => setDetailTxn(null)} label={t('Entry details', 'اندراج کی تفصیل', 'د ثبت توضیحات')}>
        {detailTxn && (() => {
          const dt = detailTxn;
          const gave = dt.debit > 0;
          const rb = dt.running_balance ?? 0;
          const amtColor = gave ? (state.getColorRed ? 'var(--green)' : 'var(--red)') : (state.getColorRed ? 'var(--red)' : 'var(--green)');
          return (
            <>
              <div className="detail-amt" style={{ color: amtColor }}>{gave ? '↑' : '↓'} {formatPKR(gave ? dt.debit : dt.credit)}</div>
              <div className="detail-amt-lbl" style={{ color: amtColor }}>
                {gave ? t('You Gave (Dr)', 'آپ نے دیا', 'ما ورکړل (Dr)') : t('You Got (Cr)', 'آپ نے لیا', 'ما واخیستل (Cr)')}
              </div>
              <div className="sep" />
              <div className="detail-date">
                <Calendar size={18} color="var(--indigo)" />
                <div className="grow1">
                  <div className="split"><span className="detail-lbl indigo">{t('Date', 'تاریخ', 'نیټه')}</span><span className="fs-17 strong">{formatDate(dt.date)}</span></div>
                  {dt.created_at && <div className="split muted fs-11"><span>{t('Time', 'وقت', 'وخت')}</span><span>{formatTime(dt.created_at)}</span></div>}
                </div>
              </div>
              <div className="detail-row">
                <BarChart3 size={16} color="var(--muted)" />
                <span className="detail-lbl">{t('Balance after', 'بیلنس', 'وروسته بیلانس')}</span>
                <span className="detail-val" style={{ color: balColor(rb), fontWeight: 800 }}>{formatPKR(Math.abs(rb))}</span>
              </div>
              {dt.description && (
                <div className="detail-desc"><FileText size={15} color="var(--muted)" /><span>{dt.description}</span></div>
              )}
              {dt.due_date && (
                <div className="detail-row">
                  <AlarmClock size={16} color="var(--muted)" />
                  <span className="detail-lbl">{t('Due date', 'واجبی تاریخ', 'د تادیې نیټه')}</span>
                  <span className="detail-val">{formatDate(dt.due_date)}</span>
                </div>
              )}
              <div className="sep" />
              <div className="btn-row">
                <button type="button" className="btn ghost indigo-text" onClick={() => { setDetailTxn(null); openEditTxn(dt); }}>
                  <Pencil size={18} /> {t('Edit', 'ترمیم', 'سمول')}
                </button>
                <button type="button" className="btn danger-soft" onClick={() => { setDetailTxn(null); confirmDelete(dt); }}>
                  <Trash2 size={18} /> {t('Delete', 'حذف', 'ړنګ کړئ')}
                </button>
              </div>
              <button type="button" className="btn ghost full mt" onClick={() => setDetailTxn(null)}>{t('Close', 'بند کریں', 'بندول')}</button>
            </>
          );
        })()}
      </Sheet>

      <DateFilterSheet
        open={filterModal}
        onClose={() => setFilterModal(false)}
        range={range}
        onChange={setRange}
        actions={<button type="button" className="btn primary fs-15" onClick={() => setFilterModal(false)}>{t('Apply', 'لاگو کریں', 'پلي کړئ')}</button>}
      />
    </div>
  );
}
