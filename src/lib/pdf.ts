import type { Account, Transaction } from './db';
import type { AccountPeriodSummary } from './repo';
import { formatDate, formatPKR, todayISO, tl, type Lang } from './format';
import { saveOrShareFile } from './share';

// Same statements as the mobile app (react-native-html-to-pdf), rendered in the
// browser with html2pdf.js. All styles are scoped under .hk-rpt so they don't
// leak into the app while the report is being rasterised.

function drCr(lang: Lang, isDr: boolean): string {
  return isDr ? tl(lang, 'Dr', 'لینا', 'اخیستل') : tl(lang, 'Cr', 'دینا', 'ورکول');
}

function esc(s: string | undefined | null): string {
  return (s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Dates and phone numbers stay left-to-right inside Urdu/Pashto text. */
function ltr(s: string): string {
  return `<bdi dir="ltr">${s}</bdi>`;
}

function signedLabel(n: number, lang: Lang): string {
  return `${formatPKR(Math.abs(n))} <span style="font-size:0.72em;opacity:.8">${drCr(lang, n >= 0)}</span>`;
}

/** Fit a number on ONE line: shrink the font proportionally when the string is too long for its cell. */
function numFont(numText: string, base: number, capChars: number, min = 7): string {
  const len = numText.length;
  const size = len <= capChars ? base : Math.max(min, Math.round((base * capChars / len) * 10) / 10);
  return `font-size:${size}px`;
}

function signedColor(n: number): string {
  return n >= 0 ? '#C0392B' : '#1E8449';
}

function baseStyles(rtl: boolean): string {
  const start = rtl ? 'right' : 'left';
  const R = '.hk-rpt';
  return `
    ${R}, ${R} * { box-sizing: border-box; margin: 0; padding: 0; }
    ${R} { width: 794px; background: #fff; font-family: Arial, var(--font-arabic), 'Noto Naskh Arabic', sans-serif; font-size: 12px; color: #1A2A3A; padding: 22px; direction: ${rtl ? 'rtl' : 'ltr'}; }
    ${R} .r-header h1, ${R} td .r-desc { word-break: break-word; overflow-wrap: anywhere; }
    ${R} .r-num, ${R} .r-card .v { white-space: nowrap; overflow: hidden; }
    ${R} .r-header { background: linear-gradient(135deg,#4F46E5,#7C3AED); color: #fff; padding: 18px 20px; border-radius: 10px; margin-bottom: 16px; }
    ${R} .r-header h1 { font-size: 20px; font-weight: 800; }
    ${R} .r-header .sub { opacity: .85; font-size: 12px; margin-top: 4px; }
    ${R} .r-header .gen { opacity: .6; font-size: 10px; margin-top: 2px; }
    ${R} .r-meta { display: flex; gap: 10px; margin-bottom: 14px; }
    ${R} .r-box { flex: 1; min-width: 0; padding: 12px 14px; background: #F5F3FF; border: 1px solid #E5E1FB; border-radius: 8px; }
    ${R} .r-box .l { font-size: 10px; color: #6B7280; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 3px; }
    ${R} .r-box .v { font-size: 14px; font-weight: 700; }
    ${R} .r-cards { display: flex; gap: 10px; margin-bottom: 14px; }
    ${R} .r-card { flex: 1; min-width: 0; padding: 11px 10px; border-radius: 8px; text-align: center; border: 1px solid #E5E7EB; }
    ${R} .r-card .l { font-size: 10px; color: #6B7280; } ${R} .r-card .v { font-size: 15px; font-weight: 800; margin-top: 4px; }
    ${R} table { width: 100%; border-collapse: collapse; margin-bottom: 14px; table-layout: fixed; }
    ${R} tr { page-break-inside: avoid; break-inside: avoid; }
    ${R} th { background: #4F46E5; color: #fff; padding: 9px 8px; text-align: ${start}; font-size: 11px; letter-spacing: .3px; }
    ${R} td { padding: 8px; border-bottom: 1px solid #ECECF3; font-size: 12px; vertical-align: top; text-align: ${start}; }
    ${R} tr:nth-child(even) td { background: #FAFAFE; }
    ${R} .r-closing { display:flex; justify-content:space-between; align-items:center; padding:16px; background:#F5F3FF; border:1px solid #E5E1FB; border-radius:8px; margin-bottom:14px; gap:12px; }
    ${R} .r-closing .l { font-size:14px; font-weight:700; color:#4B5563; white-space:nowrap; }
    ${R} .r-closing .v { font-size:22px; font-weight:800; flex:1; min-width:0; text-align:${rtl ? 'left' : 'right'}; white-space:nowrap; overflow:hidden; }
    ${R} .r-sign { border-top:2px solid #4F46E5; margin-top:50px; padding-top:6px; width:200px; text-align:center; font-size:11px; color:#6B7280; }
    ${R} .r-foot { text-align:center; color:#9AA1AC; font-size:10px; margin-top:16px; }
    ${rtl ? `${R} * { letter-spacing: 0 !important; }` : ''}
  `;
}

async function renderPdf(styles: string, body: string, rtl: boolean, lang: Lang, fileName: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const html2pdf = (await import('html2pdf.js')).default;
  const host = document.createElement('div');
  // Rendered off-screen (not display:none, which html2canvas can't capture)
  host.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;';
  host.innerHTML = `<style>${styles}</style><div class="hk-rpt" dir="${rtl ? 'rtl' : 'ltr'}" lang="${lang}">${body}</div>`;
  document.body.appendChild(host);
  try {
    // Make sure the Urdu/Pashto web font is loaded before the page is rasterised
    const arabic = getComputedStyle(document.documentElement).getPropertyValue('--font-arabic').trim();
    if (rtl && arabic) await document.fonts.load(`16px ${arabic}`, 'حساب کتاب').catch(() => {});
    await document.fonts?.ready;
    const el = host.querySelector('.hk-rpt') as HTMLElement;
    const options = {
      margin: [6, 0, 6, 0],
      filename: `${fileName}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 794 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: 'tr' },
    };
    // pagebreak is supported at runtime but missing from the bundled typings
    const blob: Blob = await html2pdf()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(options as any)
      .from(el)
      .outputPdf('blob');
    return saveOrShareFile(blob, `${fileName}.pdf`, 'Share Report');
  } finally {
    host.remove();
  }
}

// ── Contact statement (individual account ledger) ───────────────────────────

export interface LedgerReportOptions {
  account: Account;
  transactions: Transaction[];
  periodOpening: number;
  periodClosing: number;
  rangeDr: number;
  rangeCr: number;
  fromDate?: string | null;
  toDate?: string | null;
  businessName?: string;
  businessPhone?: string;
  lang?: Lang;
}

export async function generateLedgerReport(opts: LedgerReportOptions) {
  const { account, transactions, periodOpening, periodClosing, rangeDr, rangeCr, fromDate, toDate, businessName, businessPhone, lang = 'en' } = opts;
  const rtl = lang !== 'en';
  const today = todayISO();
  const periodLabel = (fromDate || toDate)
    ? ltr(`${fromDate ? formatDate(fromDate) : '—'} → ${toDate ? formatDate(toDate) : '—'}`)
    : tl(lang, 'All time', 'تمام عرصہ', 'ټوله موده');
  const openColor = signedColor(periodOpening);
  const closingColor = signedColor(periodClosing);

  const rows = transactions.map(t => {
    const rb = t.running_balance ?? 0;
    return `
      <tr>
        <td class="r-num" style="white-space:nowrap">${ltr(formatDate(t.date))}</td>
        <td><div class="r-desc">${esc(t.description)}</div></td>
        <td class="r-num" style="color:#C0392B;text-align:right;font-weight:600;${numFont(t.debit > 0 ? formatPKR(t.debit) : '', 12, 14)}">${t.debit > 0 ? formatPKR(t.debit) : ''}</td>
        <td class="r-num" style="color:#1E8449;text-align:right;font-weight:600;${numFont(t.credit > 0 ? formatPKR(t.credit) : '', 12, 14)}">${t.credit > 0 ? formatPKR(t.credit) : ''}</td>
        <td class="r-num" style="text-align:right;font-weight:700;color:${signedColor(rb)};${numFont(formatPKR(Math.abs(rb)), 12, 13)}">
          ${formatPKR(Math.abs(rb))} <span style="font-size:0.8em">${drCr(lang, rb >= 0)}</span>
        </td>
      </tr>`;
  }).join('');

  const body = `
    <div class="r-header">
      <h1>${esc(businessName) || tl(lang, 'Hisab Kitab', 'حساب کتاب', 'حساب کتاب')}</h1>
      ${businessPhone ? `<p class="sub">${ltr(esc(businessPhone))}</p>` : ''}
      <p class="sub">${tl(lang, 'Account Statement', 'کھاتہ گوشوارہ', 'د حساب بیان')}</p>
      <p class="gen">${tl(lang, 'Generated', 'تیار شدہ', 'تیار شوی')}: ${ltr(formatDate(today))}</p>
    </div>
    <div class="r-meta">
      <div class="r-box">
        <div class="l">${tl(lang, 'Contact', 'رابطہ', 'اړیکه')}</div>
        <div class="v">${esc(account.name)}</div>
        ${account.phone ? `<div style="font-size:12px;color:#6B7280;margin-top:3px">${ltr(esc(account.phone))}</div>` : ''}
        ${account.address ? `<div style="font-size:11px;color:#6B7280;margin-top:2px">${esc(account.address)}</div>` : ''}
      </div>
      <div class="r-box" style="max-width:150px">
        <div class="l">${tl(lang, 'Period', 'عرصہ', 'موده')}</div>
        <div class="v" style="font-size:13px;font-weight:700;line-height:1.5">${periodLabel.replace(' → ', '</bdi><br>→<br><bdi dir="ltr">')}</div>
      </div>
      <div class="r-box" style="max-width:150px;text-align:center;background:${periodClosing >= 0 ? '#FEF2F2' : '#F0FDF4'};border-color:${periodClosing >= 0 ? '#FECACA' : '#86EFAC'}">
        <div class="l">${tl(lang, 'Closing Balance', 'اختتامی بیلنس', 'پای بیلانس')}</div>
        <div class="r-num" style="${numFont(formatPKR(Math.abs(periodClosing)), 20, 11)};font-weight:800;color:${closingColor};margin-top:8px;line-height:1.2">${formatPKR(Math.abs(periodClosing))}</div>
        <div style="font-size:12px;font-weight:700;color:${closingColor};margin-top:4px">${drCr(lang, periodClosing >= 0)}</div>
      </div>
    </div>
    <div class="r-cards">
      <div class="r-card">
        <div class="l">${tl(lang, 'Opening Balance', 'ابتدائی بیلنس', 'پیل بیلانس')}</div>
        <div class="v" style="color:${openColor};${numFont(formatPKR(Math.abs(periodOpening)), 15, 20)}">${signedLabel(periodOpening, lang)}</div>
      </div>
      <div class="r-card">
        <div class="l">${tl(lang, 'You Gave', 'آپ نے دیا', 'تاسو ورکړل')}</div>
        <div class="v" style="color:#C0392B;${numFont(formatPKR(rangeDr), 15, 24)}">${formatPKR(rangeDr)}</div>
      </div>
      <div class="r-card">
        <div class="l">${tl(lang, 'You Got', 'آپ کو ملا', 'تاسو ترلاسه کړل')}</div>
        <div class="v" style="color:#1E8449;${numFont(formatPKR(rangeCr), 15, 24)}">${formatPKR(rangeCr)}</div>
      </div>
    </div>
    <table>
      <thead><tr>
        <th style="width:18%">${tl(lang, 'Date', 'تاریخ', 'نیټه')}</th>
        <th style="width:30%">${tl(lang, 'Details', 'تفصیل', 'توضیحات')}</th>
        <th style="width:17%;text-align:right">${tl(lang, 'You Gave', 'دیا', 'ورکړل')}</th>
        <th style="width:17%;text-align:right">${tl(lang, 'You Got', 'لیا', 'واخیستل')}</th>
        <th style="width:18%;text-align:right">${tl(lang, 'Balance', 'بقیہ', 'بیلانس')}</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="5" style="text-align:center;padding:20px;color:#9AA1AC">${tl(lang, 'No entries', 'کوئی اندراج نہیں', 'هیڅ ثبت نشته')}</td></tr>`}</tbody>
    </table>
    <div class="r-closing">
      <div class="l">${tl(lang, 'Closing Balance', 'اختتامی بیلنس', 'پای بیلانس')}</div>
      <div class="v" style="color:${closingColor};${numFont(formatPKR(Math.abs(periodClosing)), 22, 34)}">${signedLabel(periodClosing, lang)}</div>
    </div>
    <div class="r-sign">${tl(lang, 'Authorized Signature', 'مجاز دستخط', 'مجاز لاسلیک')}</div>
    <div class="r-foot">${tl(lang, 'Hisab Kitab', 'حساب کتاب', 'حساب کتاب')} — ${tl(lang, 'Business Ledger', 'کاروباری کھاتہ', 'سوداګریز کهاته')}</div>`;

  const safeName = (account.name || 'statement').replace(/[^a-zA-Z0-9]/g, '_');
  return renderPdf(baseStyles(rtl), body, rtl, lang, `${safeName}_statement_${today}`);
}

// ── Book summary report (all contacts filtered by type + date) ──────────────

export interface SummaryReportOptions {
  accounts: AccountPeriodSummary[];
  fromDate: string | null;
  toDate: string | null;
  typeFilter: 'all' | 'customer' | 'supplier';
  businessName?: string;
  businessPhone?: string;
  lang?: Lang;
}

export async function generateLedgerSummaryReport(opts: SummaryReportOptions) {
  const { accounts, fromDate, toDate, typeFilter, businessName, businessPhone, lang = 'en' } = opts;
  const rtl = lang !== 'en';
  const today = todayISO();
  const periodLabel = (fromDate || toDate)
    ? ltr(`${fromDate ? formatDate(fromDate) : '—'} → ${toDate ? formatDate(toDate) : '—'}`)
    : tl(lang, 'All time', 'تمام عرصہ', 'ټوله موده');
  const typeLabel = typeFilter === 'customer' ? tl(lang, 'Customers', 'گاہکان', 'پیرودونکي')
    : typeFilter === 'supplier' ? tl(lang, 'Suppliers', 'سپلائرز', 'عرضه کوونکي')
    : tl(lang, 'All Contacts', 'تمام رابطے', 'ټول اړیکي');

  const customers = accounts.filter(a => a.type === 'customer');
  const suppliers = accounts.filter(a => a.type === 'supplier');
  const totalReceivable = accounts.reduce((s, a) => s + Math.max(0, a.period_closing), 0);
  const totalPayable = accounts.reduce((s, a) => s + Math.max(0, -a.period_closing), 0);
  const netBalance = totalReceivable - totalPayable;

  const makeRows = (list: AccountPeriodSummary[]) => list.map(a => {
    const receivable = Math.max(0, a.period_closing);
    const payable = Math.max(0, -a.period_closing);
    const settled = Math.abs(a.period_closing) < 0.01;
    const closingColor = settled ? '#6B7280' : signedColor(a.period_closing);
    const ob = a.period_opening;
    return `
      <tr>
        <td><div class="r-desc"><strong>${esc(a.name)}</strong></div>${a.phone ? `<div class="r-desc" style="font-size:10px;color:#6B7280">${ltr(esc(a.phone))}</div>` : ''}${a.address ? `<div class="r-desc" style="font-size:10px;color:#9CA3AF">${esc(a.address)}</div>` : ''}</td>
        <td class="r-num" style="color:${signedColor(ob)};text-align:right;font-weight:600;${numFont(formatPKR(Math.abs(ob)), 12, 13)}">${signedLabel(ob, lang)}</td>
        <td class="r-num" style="color:#C0392B;text-align:right;font-weight:600;${numFont(a.period_dr > 0 ? formatPKR(a.period_dr) : '—', 12, 14)}">${a.period_dr > 0 ? formatPKR(a.period_dr) : '—'}</td>
        <td class="r-num" style="color:#1E8449;text-align:right;font-weight:600;${numFont(a.period_cr > 0 ? formatPKR(a.period_cr) : '—', 12, 14)}">${a.period_cr > 0 ? formatPKR(a.period_cr) : '—'}</td>
        <td class="r-num" style="text-align:right;font-weight:700;color:${closingColor};${numFont(formatPKR(receivable > 0 ? receivable : payable), 12, 12)}">
          ${settled ? `<span style="color:#6B7280">${tl(lang, 'Settled', 'برابر', 'برابر')}</span>` : `${formatPKR(receivable > 0 ? receivable : payable)} <span style="font-size:0.8em">${drCr(lang, receivable > 0)}</span>`}
        </td>
      </tr>`;
  }).join('');

  const tableHead = `
      <thead><tr>
        <th style="width:34%">${tl(lang, 'Name', 'نام', 'نوم')}</th>
        <th style="width:18%;text-align:right">${tl(lang, 'Opening', 'ابتدائی', 'پیل')}</th>
        <th style="width:15%;text-align:right">${tl(lang, 'You Gave', 'دیا', 'ورکړل')}</th>
        <th style="width:15%;text-align:right">${tl(lang, 'You Got', 'لیا', 'واخیستل')}</th>
        <th style="width:18%;text-align:right">${tl(lang, 'Net Balance', 'بقیہ', 'خالص بیلانس')}</th>
      </tr></thead>`;

  const body = `
    <div class="r-header">
      <h1>${esc(businessName) || tl(lang, 'Hisab Kitab', 'حساب کتاب', 'حساب کتاب')}</h1>
      ${businessPhone ? `<p class="sub">${ltr(esc(businessPhone))}</p>` : ''}
      <p class="sub">${typeLabel}</p>
      <p class="gen">${tl(lang, 'Period', 'عرصہ', 'موده')}: ${periodLabel} &nbsp;|&nbsp; ${tl(lang, 'Generated', 'تیار شدہ', 'تیار شوی')}: ${ltr(formatDate(today))}</p>
    </div>
    <div class="r-cards">
      <div class="r-card">
        <div class="l">${tl(lang, 'To Receive', 'لینا', 'اخیستل')}</div>
        <div class="v" style="color:#C0392B;${numFont(formatPKR(totalReceivable), 15, 24)}">${formatPKR(totalReceivable)}</div>
      </div>
      <div class="r-card">
        <div class="l">${tl(lang, 'To Pay', 'دینا', 'ورکول')}</div>
        <div class="v" style="color:#1E8449;${numFont(formatPKR(totalPayable), 15, 24)}">${formatPKR(totalPayable)}</div>
      </div>
      <div class="r-card">
        <div class="l">${tl(lang, 'Net', 'خالص', 'خالص')}</div>
        <div class="v" style="color:${netBalance >= 0 ? '#C0392B' : '#1E8449'};${numFont(formatPKR(Math.abs(netBalance)), 15, 24)}">${formatPKR(Math.abs(netBalance))}</div>
      </div>
    </div>
    ${(typeFilter === 'all' || typeFilter === 'customer') && customers.length > 0 ? `
    <div style="font-weight:700;font-size:12px;color:#4F46E5;margin-bottom:6px;letter-spacing:.5px">
      ${tl(lang, 'CUSTOMERS', 'گاہکان', 'پیرودونکي')} (${customers.length})
    </div>
    <table>${tableHead}<tbody>${makeRows(customers)}</tbody></table>` : ''}
    ${(typeFilter === 'all' || typeFilter === 'supplier') && suppliers.length > 0 ? `
    <div style="font-weight:700;font-size:12px;color:#D97706;margin-bottom:6px;letter-spacing:.5px;${typeFilter === 'all' ? 'margin-top:14px' : ''}">
      ${tl(lang, 'SUPPLIERS', 'سپلائرز', 'عرضه کوونکي')} (${suppliers.length})
    </div>
    <table>${tableHead}<tbody>${makeRows(suppliers)}</tbody></table>` : ''}
    ${accounts.length === 0 ? `
    <div style="text-align:center;padding:40px;color:#9AA1AC;border:1px solid #E5E7EB;border-radius:8px">
      ${tl(lang, 'No contacts found', 'کوئی رابطہ نہیں', 'هیڅ اړیکه ونه موندل شوه')}
    </div>` : ''}
    <div class="r-sign">${tl(lang, 'Authorized Signature', 'مجاز دستخط', 'مجاز لاسلیک')}</div>
    <div class="r-foot">${tl(lang, 'Hisab Kitab', 'حساب کتاب', 'حساب کتاب')} — ${tl(lang, 'Business Ledger', 'کاروباری کھاتہ', 'سوداګریز کهاته')}</div>`;

  const safeName = (businessName ?? 'ledger').replace(/[^a-zA-Z0-9]/g, '_');
  return renderPdf(baseStyles(rtl), body, rtl, lang, `${safeName}_report_${today}`);
}
