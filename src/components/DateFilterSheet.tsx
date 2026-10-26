'use client';

import { Calendar, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { Sheet } from './ui';
import { useT } from '@/context/AppContext';
import { localISO } from '@/lib/format';

export interface DateRange { from: string | null; to: string | null }

export function presetRange(preset: 'all' | 'month' | 'year'): DateRange {
  const now = new Date();
  if (preset === 'all') return { from: null, to: null };
  if (preset === 'month') return { from: localISO(new Date(now.getFullYear(), now.getMonth(), 1)), to: localISO(now) };
  return { from: localISO(new Date(now.getFullYear(), 0, 1)), to: localISO(now) };
}

export function DateFilterSheet({ open, onClose, range, onChange, info, actions }: {
  open: boolean;
  onClose: () => void;
  range: DateRange;
  onChange: (r: DateRange) => void;
  info?: string;
  actions: ReactNode;
}) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} label={t('Filter by date', 'تاریخ کے مطابق', 'د نیټې له مخې فلټر')}>
      <h2 className="sheet-title fs-20">{t('Filter by date', 'تاریخ کے مطابق', 'د نیټې له مخې فلټر')}</h2>
      {info && (
        <div className="scope-row fs-13"><Info size={16} color="var(--indigo)" /><span>{info}</span></div>
      )}
      <div className="preset-row">
        {([['all', t('All time', 'تمام', 'ټوله موده')], ['month', t('This month', 'یہ مہینہ', 'دا میاشت')], ['year', t('This year', 'یہ سال', 'سږ کال')]] as const).map(([key, lbl]) => (
          <button key={key} type="button" className="preset fs-13" onClick={() => onChange(presetRange(key))}>{lbl}</button>
        ))}
      </div>
      <div className="range-row">
        <label className="range-col">
          <span className="label fs-13">{t('From', 'سے', 'له')}</span>
          <span className="date-input">
            <Calendar size={16} color="var(--indigo)" />
            <input type="date" value={range.from ?? ''} max={range.to ?? undefined} onChange={e => onChange({ ...range, from: e.target.value || null })} className="fs-13" />
          </span>
        </label>
        <label className="range-col">
          <span className="label fs-13">{t('To', 'تک', 'تر')}</span>
          <span className="date-input">
            <Calendar size={16} color="var(--indigo)" />
            <input type="date" value={range.to ?? ''} min={range.from ?? undefined} onChange={e => onChange({ ...range, to: e.target.value || null })} className="fs-13" />
          </span>
        </label>
      </div>
      <div className="btn-row">{actions}</div>
    </Sheet>
  );
}
