'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Calendar, Search, Settings, Share2, Store, User, Users, Plus, Trash2, XCircle } from 'lucide-react';
import { useApp, useBalanceColor, useT } from '@/context/AppContext';
import { Sheet, Spinner, useDialog, useLongPress } from '@/components/ui';
import { DateFilterSheet, presetRange, type DateRange } from '@/components/DateFilterSheet';
import {
  createAccount, deleteAccount, getAccountsWithPeriodBalance, updateAccount, type AccountPeriodSummary,
} from '@/lib/repo';
import { fitFont, formatPKR, shortDate } from '@/lib/format';
import { generateLedgerSummaryReport } from '@/lib/pdf';
import { goBack, navTo } from '@/lib/nav';

type TabKey = 'all' | 'customer' | 'supplier';

export default function LedgerPage() {
  return <Suspense fallback={<div className="screen center"><Spinner /></div>}><LedgerScreen /></Suspense>;
}

function LedgerScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { state, setActiveKhata } = useApp();
  const { activeKhata, khatas, language } = state;
  const t = useT();
  const dialog = useDialog();
  const balColor = useBalanceColor();

  // The URL decides which book is open; keep the app's active book in sync with it
  const paramId = Number(params.get('k')) || null;
  const khata = (paramId ? khatas.find(k => k.id === paramId) : null) ?? activeKhata;
  const khataId = khata?.id ?? null;
  useEffect(() => {
    if (khata && khata.id !== activeKhata?.id) setActiveKhata(khata);
  }, [khata, activeKhata?.id, setActiveKhata]);

  const [tab, setTab] = useState<TabKey>('all');
  const [all, setAll] = useState<AccountPeriodSummary[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [filterModal, setFilterModal] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Create / edit contact sheet
  const [modal, setModal] = useState(false);
  const [editTarget, setEditTarget] = useState<AccountPeriodSummary | null>(null);
  const [formType, setFormType] = useState<'customer' | 'supplier'>('customer');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [opening, setOpening] = useState('');
  const [openingDir, setOpeningDir] = useState<'get' | 'give'>('get');
  const [saving, setSaving] = useState(false);

  const filterActive = !!(range.from || range.to);

  const load = useCallback(async () => {
    if (!khataId) return; // redirected to the books list below
    try {
      setAll(await getAccountsWithPeriodBalance(khataId, null, range.from, range.to));
    } finally {
      setLoading(false);
    }
  }, [khataId, range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  // No book at all (e.g. deleted elsewhere) → back to the books list
  useEffect(() => {
    if (!state.isLoading && !khata) router.replace('/');
  }, [state.isLoading, khata, router]);

  const customers = useMemo(() => all.filter(a => a.type === 'customer'), [all]);
  const suppliers = useMemo(() => all.filter(a => a.type === 'supplier'), [all]);
  const activeAccounts = tab === 'customer' ? customers : tab === 'supplier' ? suppliers : all;

  const list = activeAccounts.filter(a => {
    if (!query) return true;
    const q = query.toLowerCase();
    return a.name.toLowerCase().includes(q) || (a.phone ?? '').includes(q);
  });

  const totalDr = activeAccounts.reduce((s, a) => s + a.period_dr, 0);
  const totalCr = activeAccounts.reduce((s, a) => s + a.period_cr, 0);
  const netBalance = activeAccounts.reduce((s, a) => s + a.period_closing, 0);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'customer', label: t('Customers', 'گاہک', 'پیرودونکي'), count: customers.length },
    { key: 'supplier', label: t('Suppliers', 'سپلائر', 'عرضه کوونکي'), count: suppliers.length },
    { key: 'all', label: t('All', 'سب', 'ټول'), count: all.length },
  ];

  const rangeLabel = filterActive
    ? `${range.from ? shortDate(range.from) : '…'} → ${range.to ? shortDate(range.to) : '…'}`
    : t('All time', 'تمام عرصہ', 'ټوله موده');

  const openCreate = () => {
    setEditTarget(null);
    setFormType(tab === 'supplier' ? 'supplier' : 'customer');
    setName(''); setPhone(''); setAddress(''); setOpening(''); setOpeningDir('get');
    setModal(true);
  };

  const openEdit = useCallback((a: AccountPeriodSummary) => {
    setEditTarget(a);
    setFormType(a.type);
    setName(a.name);
    setPhone(a.phone ?? '');
    setAddress(a.address ?? '');
    setOpening(a.opening_balance ? String(a.opening_balance) : '');
    setOpeningDir(a.opening_balance_type === 'dr' ? 'get' : 'give');
    setModal(true);
  }, []);

  const handleSave = async () => {
    if (!name.trim() || !khataId) return;
    try {
      setSaving(true);
      const data = {
        khata_id: khataId,
        type: formType,
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        opening_balance: parseFloat(opening.replace(/,/g, '')) || 0,
        opening_balance_type: (openingDir === 'get' ? 'dr' : 'cr') as 'dr' | 'cr',
      };
      if (editTarget) await updateAccount(editTarget.id, data);
      else await createAccount(data);
      setModal(false);
      await load();
    } catch (e) {
      dialog.alert(t('Error', 'خرابی', 'ستونزه'), (e as Error)?.message ?? 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (a: AccountPeriodSummary) => {
    const ok = await dialog.confirm(
      t('Delete', 'حذف کریں', 'ړنګ کړئ'),
      `${t('Delete', 'حذف کریں', 'ړنګ کړئ')} "${a.name}"? ${t('All transactions will be lost.', 'تمام لین دین ختم ہو جائیں گے۔', 'ټولې معاملې به له منځه لاړ شي.')}`,
      t('Delete', 'حذف', 'ړنګ کړئ'), t('Cancel', 'منسوخ', 'لغوه کړئ'),
    );
    if (ok) { await deleteAccount(a.id); await load(); }
  };

  const handleReport = async () => {
    if (!khataId) return;
    try {
      setDownloading(true);
      const accounts = await getAccountsWithPeriodBalance(khataId, tab === 'all' ? null : tab, range.from, range.to);
      const result = await generateLedgerSummaryReport({
        accounts, fromDate: range.from, toDate: range.to, typeFilter: tab,
        businessName: khata?.name, businessPhone: khata?.phone, lang: language,
      });
      if (result === 'downloaded') dialog.toast(t('Report downloaded', 'رپورٹ ڈاؤن لوڈ ہو گئی', 'راپور ډاونلوډ شو'));
    } catch (e) {
      dialog.alert(t('Error', 'خرابی', 'ستونزه'), (e as Error)?.message ?? 'Could not generate report.');
    } finally {
      setDownloading(false);
    }
  };

  const openContact = useCallback((a: AccountPeriodSummary) => navTo(router, `/contact/?id=${a.id}`), [router]);
  const press = useLongPress<AccountPeriodSummary>(openEdit, openContact);

  return (
    <div className="screen fade-in">
      <header className="header">
        <button type="button" className="icon-btn" onClick={() => goBack(router, '/')} aria-label="Back"><ArrowLeft size={24} /></button>
        <div className="header-mid">
          <h1 className="title fs-17 clamp2">{khata?.name ?? 'Ledger'}</h1>
          <div className="subtitle fs-11">{t('Ledger', 'کھاتہ', 'کهاته')}</div>
        </div>
        <button type="button" className="icon-btn indigo" onClick={handleReport} disabled={downloading} aria-label={t('Share Report', 'رپورٹ شیئر', 'راپور شریک کړئ')}>
          {downloading ? <Spinner /> : <Share2 size={22} />}
        </button>
        <button type="button" className="icon-btn" onClick={() => navTo(router, '/settings/')} aria-label="Settings"><Settings size={21} /></button>
      </header>

      {/* Balance card */}
      <div className="bal-card">
        <div className="bal-col">
          <div className="bal-label fs-11">{t('You Gave', 'کل دیا', 'ټول ورکړل')}</div>
          <div className="bal-amt" style={{ color: 'var(--red)', fontSize: fitFont(formatPKR(totalDr), 17, 9) }}>{formatPKR(totalDr)}</div>
          <div className="bal-tag" style={{ color: 'var(--red)' }}>Dr</div>
        </div>
        <div className="bal-divider" />
        <div className="bal-col">
          <div className="bal-label fs-11">{t('You Got', 'کل لیا', 'ټول واخیستل')}</div>
          <div className="bal-amt" style={{ color: 'var(--green)', fontSize: fitFont(formatPKR(totalCr), 17, 9) }}>{formatPKR(totalCr)}</div>
          <div className="bal-tag" style={{ color: 'var(--green)' }}>Cr</div>
        </div>
        <div className="bal-divider" />
        <div className="bal-col">
          <div className="bal-label fs-11">{t('Balance', 'بیلنس', 'بیلانس')}</div>
          <div className="bal-amt" style={{ color: balColor(netBalance), fontSize: fitFont(formatPKR(Math.abs(netBalance)), 17, 9) }}>{formatPKR(Math.abs(netBalance))}</div>
          <div className="bal-tag" style={{ color: balColor(netBalance) }}>
            {Math.abs(netBalance) < 0.005 ? t('Settled', 'برابر', 'برابر') : netBalance > 0 ? 'Dr' : 'Cr'}
          </div>
        </div>
      </div>

      {/* Date filter bar */}
      <div className="filter-bar">
        <div className={`filter-chip ${filterActive ? 'active' : ''}`}>
          <button type="button" className="filter-open fs-13" onClick={() => setFilterModal(true)}>
            <Calendar size={15} /> <span>{rangeLabel}</span>
          </button>
          {filterActive && (
            <button type="button" className="chip-clear" onClick={() => setRange(presetRange('all'))} aria-label="Clear date filter"><XCircle size={15} /></button>
          )}
        </div>
        <button type="button" className="report-btn fs-13" onClick={handleReport} disabled={downloading}>
          {downloading ? <Spinner /> : <Share2 size={15} />} {t('Share Report', 'رپورٹ شیئر', 'راپور شریک کړئ')}
        </button>
      </div>

      {/* Tabs */}
      <div className="tab-bar" role="tablist">
        {tabs.map(tb => (
          <button key={tb.key} type="button" role="tab" aria-selected={tab === tb.key} className={`tab fs-13 ${tab === tb.key ? 'active' : ''}`} onClick={() => setTab(tb.key)}>
            {tb.label} <span className="tab-badge">{tb.count}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="search">
        <Search size={17} color="var(--muted)" />
        <input className="fs-15" value={query} onChange={e => setQuery(e.target.value)} type="search"
          placeholder={t('Search name or phone...', 'تلاش کریں...', 'د نوم یا تلیفون لټون...')} aria-label="Search" />
        {query && <button type="button" className="chip-clear" onClick={() => setQuery('')} aria-label="Clear search"><XCircle size={17} /></button>}
      </div>

      {loading ? (
        <div className="center grow"><Spinner /></div>
      ) : list.length === 0 ? (
        <div className="empty grow">
          <Users size={52} color="var(--muted)" />
          <div className="empty-sub fs-13">{t('Tap + below to add', 'نیچے + دبائیں', 'د زیاتولو لپاره لاندې + کېکاږئ')}</div>
        </div>
      ) : (
        <div className="list pad-fab">
          <div className="col-hdr fs-11">
            <span className="col-left">{t('Details', 'تفصیل', 'توضیحات')}</span>
            <span className="col-amt">{t('You Gave · Dr', 'دیا · Dr', 'ورکړل · Dr')}</span>
            <span className="col-amt">{t('You Got · Cr', 'لیا · Cr', 'واخیستل · Cr')}</span>
          </div>
          {list.map(item => {
            const closingAbs = Math.abs(item.period_closing);
            return (
              <button key={`${item.type}-${item.id}`} type="button" className="card row" {...press(item)}>
                <span className="row-info">
                  <span className="row-name fs-15 clamp2">{item.name}</span>
                  <span className="row-meta fs-11">
                    <span className="type-dot" style={{ background: item.type === 'customer' ? 'var(--indigo)' : 'var(--gold)' }} />
                    {item.type === 'customer' ? t('Customer', 'گاہک', 'پیرودونکی') : t('Supplier', 'سپلائر', 'عرضه کوونکی')}
                    {item.phone ? <>  ·  <bdi dir="ltr">{item.phone}</bdi></> : null}
                  </span>
                  <span className="row-closing fs-11" style={{ color: balColor(item.period_closing) }}>
                    {closingAbs < 0.005
                      ? t('Settled', 'برابر', 'برابر')
                      : `${formatPKR(closingAbs)} ${item.period_closing > 0 ? t('Dr', 'لینا', 'اخیستل') : t('Cr', 'دینا', 'ورکول')}`}
                  </span>
                </span>
                <span className="row-amt">
                  {item.period_dr > 0
                    ? <span style={{ color: 'var(--red)', fontSize: fitFont(formatPKR(item.period_dr), 12, 10) }}>{formatPKR(item.period_dr)}</span>
                    : <span className="dash">—</span>}
                </span>
                <span className="row-amt">
                  {item.period_cr > 0
                    ? <span style={{ color: 'var(--green)', fontSize: fitFont(formatPKR(item.period_cr), 12, 10) }}>{formatPKR(item.period_cr)}</span>
                    : <span className="dash">—</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <button type="button" className="fab pop-in" onClick={openCreate}>
        <Plus size={24} /> <span className="fs-15">{tab === 'supplier' ? t('Supplier', 'سپلائر', 'عرضه کوونکی') : t('Customer', 'گاہک', 'پیرودونکی')}</span>
      </button>

      <DateFilterSheet
        open={filterModal}
        onClose={() => setFilterModal(false)}
        range={range}
        onChange={setRange}
        info={t(
          `Report includes: ${tab === 'customer' ? 'Customers' : tab === 'supplier' ? 'Suppliers' : 'All contacts'}`,
          `رپورٹ میں شامل: ${tab === 'customer' ? 'گاہک' : tab === 'supplier' ? 'سپلائر' : 'سب'}`,
          `په راپور کې شامل: ${tab === 'customer' ? 'پیرودونکي' : tab === 'supplier' ? 'عرضه کوونکي' : 'ټول اړیکي'}`,
        )}
        actions={(
          <>
            <button type="button" className="btn ghost fs-15" onClick={() => setFilterModal(false)}>{t('Apply filter', 'لاگو کریں', 'فلټر پلي کړئ')}</button>
            <button type="button" className="btn primary fs-15" disabled={downloading} onClick={() => { setFilterModal(false); handleReport(); }}>
              {downloading ? <Spinner light /> : t('Share Report', 'رپورٹ شیئر', 'راپور شریک کړئ')}
            </button>
          </>
        )}
      />

      <Sheet open={modal} onClose={() => setModal(false)} label={t('Contact', 'رابطہ', 'اړیکه')}>
        <form onSubmit={e => { e.preventDefault(); handleSave(); }}>
          <h2 className="sheet-title fs-20">{editTarget ? t('Edit', 'ترمیم', 'سمول') : t('New Contact', 'نیا رابطہ', 'نوې اړیکه')}</h2>
          <div className="seg-row">
            {(['customer', 'supplier'] as const).map(tt => {
              const c = tt === 'customer' ? 'var(--indigo)' : 'var(--gold)';
              const on = formType === tt;
              return (
                <button key={tt} type="button" className={`seg fs-13 ${on ? 'on' : ''}`} style={{ '--seg': c } as React.CSSProperties} onClick={() => setFormType(tt)}>
                  {tt === 'customer' ? <User size={16} /> : <Store size={16} />}
                  {tt === 'customer' ? t('Customer', 'گاہک', 'پیرودونکی') : t('Supplier', 'سپلائر', 'عرضه کوونکی')}
                </button>
              );
            })}
          </div>
          <label className="label fs-13" htmlFor="c-name">{t('Name *', 'نام *', 'نوم *')}</label>
          <input id="c-name" className="input fs-15" value={name} onChange={e => setName(e.target.value)} autoFocus
            placeholder={t('e.g. Aslam Khan', 'مثلاً اسلم خان', 'د بیلګې: اسلم خان')} />
          <label className="label fs-13" htmlFor="c-phone">{t('Phone (optional)', 'فون (اختیاری)', 'تلیفون (اختیاري)')}</label>
          <input id="c-phone" className="input fs-15" value={phone} inputMode="tel" maxLength={11} placeholder="03001234567"
            onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} />
          <label className="label fs-13" htmlFor="c-addr">{t('Address (optional)', 'پتہ (اختیاری)', 'پته (اختیاري)')}</label>
          <textarea id="c-addr" className="input fs-15" rows={2} value={address} onChange={e => setAddress(e.target.value)}
            placeholder={t('e.g. Lahore, Pakistan', 'مثلاً لاہور، پاکستان', 'د بیلګې: لاهور، پاکستان')} />
          <label className="label fs-13" htmlFor="c-open">{t('Opening balance (optional)', 'ابتدائی بیلنس (اختیاری)', 'پیل بیلانس (اختیاري)')}</label>
          <input id="c-open" className="input fs-15" value={opening} inputMode="decimal" placeholder="0"
            onChange={e => setOpening(e.target.value.replace(/[^\d.,]/g, ''))} />
          <div className="seg-row">
            {(['get', 'give'] as const).map(d => (
              <button key={d} type="button" className={`seg fs-13 ${openingDir === d ? 'on' : ''}`}
                style={{ '--seg': d === 'get' ? 'var(--green)' : 'var(--red)' } as React.CSSProperties} onClick={() => setOpeningDir(d)}>
                {d === 'get' ? t('You get', 'مجھے لینا ہے', 'زه اخلم') : t('You give', 'مجھے دینا ہے', 'زه ورکوم')}
              </button>
            ))}
          </div>
          <div className="btn-row">
            <button type="button" className="btn ghost fs-15" onClick={() => setModal(false)}>{t('Cancel', 'منسوخ', 'لغوه کړئ')}</button>
            <button type="submit" className="btn primary fs-15" disabled={saving || !name.trim()}>
              {saving ? <Spinner light /> : t('Save', 'محفوظ کریں', 'خوندي کړئ')}
            </button>
          </div>
          {editTarget && (
            <button type="button" className="delete-link fs-13" onClick={() => { setModal(false); setTimeout(() => handleDelete(editTarget), 250); }}>
              <Trash2 size={16} /> {t('Delete this contact', 'یہ رابطہ حذف کریں', 'دا اړیکه ړنګ کړئ')}
            </button>
          )}
        </form>
      </Sheet>
    </div>
  );
}
