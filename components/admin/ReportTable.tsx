"use client";

// =========================================================================
// REPORT TABLE
// One table for every admin data set: search, sort, paging, a column picker
// (remembered per table in localStorage) and an Excel download that uses the
// columns currently shown, over the filtered + sorted rows, stamped with the
// date/time it was generated and the data's "as of" time.
// =========================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Download,
  Loader2, RefreshCw, Search, X,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { downloadXlsx, formatWat, type XlsxColumnType, type XlsxValue } from '@/lib/xlsx';
import { cx, ui } from '@/lib/ui';

export interface ReportColumn<T> {
  key: string;
  header: string;
  /** Raw value used for export, sorting and search. */
  get: (row: T) => XlsxValue;
  type?: XlsxColumnType;
  /** Shown by default (true unless set to false). */
  defaultVisible?: boolean;
  /** Custom cell UI; falls back to a formatted get(). */
  render?: (row: T) => React.ReactNode;
  align?: 'left' | 'right';
  /** Export column width (characters). */
  width?: number;
  /** Extra classes for the body cell. */
  className?: string;
}

export interface ReportTableProps<T> {
  /** Stable id: remembers the column choice for this table. */
  id: string;
  /** Used for the Excel title, sheet and filename. */
  title: string;
  rows: T[];
  columns: ReportColumn<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  /** When the data was fetched (shown as "Data as of"). */
  loadedAt?: Date | null;
  onRefresh?: () => void;
  /** Extra lines written under the title in the Excel file (filters, period…). */
  meta?: string[];
  /** Buttons rendered in a trailing "Actions" column (not exported). */
  rowActions?: (row: T) => React.ReactNode;
  /** Extra filter controls placed beside the search box. */
  toolbar?: React.ReactNode;
  emptyText?: string;
  searchPlaceholder?: string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  defaultPageSize?: number;
  /** Hide the outer card (e.g. when already inside a modal). */
  bare?: boolean;
}

// ---- who is exporting (cached once per page load) ----
let exporterEmail: Promise<string | null> | null = null;
function getExporterEmail(): Promise<string | null> {
  if (!exporterEmail) {
    exporterEmail = createClient()
      .auth.getSession()
      .then(({ data }) => data.session?.user?.email ?? null)
      .catch(() => null);
  }
  return exporterEmail;
}

const PAGE_SIZES = [25, 50, 100, 0] as const; // 0 = all

function sortValue(v: XlsxValue, type: XlsxColumnType | undefined): number | string | null {
  if (v === null || v === undefined || v === '') return null;
  if (type === 'date' || type === 'datetime') {
    const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(String(v));
    return Number.isNaN(t) ? null : t;
  }
  if (type === 'number' || type === 'integer' || type === 'money') {
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[,₦\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (type === 'boolean') return v === true || v === 'true' ? 1 : 0;
  return String(v).toLowerCase();
}

export function formatCell(v: XlsxValue, type: XlsxColumnType | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  switch (type) {
    case 'datetime':
      return formatWat(v as string | Date | number) || String(v);
    case 'date':
      return formatWat(v as string | Date | number, false) || String(v);
    case 'money': {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? `₦${n.toLocaleString('en-NG', { maximumFractionDigits: 2 })}` : String(v);
    }
    case 'integer':
    case 'number': {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n.toLocaleString('en-NG', { maximumFractionDigits: 6 }) : String(v);
    }
    case 'boolean':
      return v === true || v === 'true' ? 'Yes' : v === false || v === 'false' ? 'No' : String(v);
    default:
      return v instanceof Date ? formatWat(v) : String(v);
  }
}

function storageKey(id: string) {
  return `qz-report-cols:${id}`;
}

export function ReportTable<T>({
  id, title, rows, columns, rowKey, loading, loadedAt, onRefresh, meta, rowActions, toolbar,
  emptyText = 'Nothing to show yet.', searchPlaceholder = 'Search…', initialSort, defaultPageSize = 25, bare,
}: ReportTableProps<T>) {
  const defaultKeys = useMemo(() => columns.filter((c) => c.defaultVisible !== false).map((c) => c.key), [columns]);

  const [visible, setVisible] = useState<string[]>(() => {
    if (typeof window === 'undefined') return defaultKeys;
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey(id)) || 'null');
      if (Array.isArray(saved)) {
        const valid = saved.filter((k: unknown) => typeof k === 'string' && columns.some((c) => c.key === k));
        if (valid.length) return valid;
      }
    } catch { /* ignore bad storage */ }
    return defaultKeys;
  });
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);
  const [pageSize, setPageSize] = useState<number>(defaultPageSize);
  const [page, setPage] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Persist column choice
  useEffect(() => {
    try { window.localStorage.setItem(storageKey(id), JSON.stringify(visible)); } catch { /* quota / private mode */ }
  }, [id, visible]);

  // Close picker on outside click / Escape
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPickerOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  // Keep column order as defined, not click order
  const shownColumns = useMemo(() => columns.filter((c) => visible.includes(c.key)), [columns, visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      shownColumns.some((c) => {
        const v = c.get(r);
        return v !== null && v !== undefined && formatCell(v, c.type).toLowerCase().includes(q);
      }),
    );
  }, [rows, query, shownColumns]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = sortValue(col.get(a), col.type);
      const vb = sortValue(col.get(b), col.type);
      if (va === null && vb === null) return 0;
      if (va === null) return 1; // blanks last
      if (vb === null) return -1;
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [filtered, sort, columns]);

  const pageCount = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = pageSize ? sorted.slice(safePage * pageSize, safePage * pageSize + pageSize) : sorted;

  useEffect(() => { setPage(0); }, [query, pageSize, rows]);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));

  const toggleColumn = (key: string) =>
    setVisible((v) => (v.includes(key) ? (v.length > 1 ? v.filter((k) => k !== key) : v) : [...v, key]));

  const handleExport = async (allColumns = false) => {
    setExporting(true);
    try {
      const cols = allColumns ? columns : shownColumns;
      const email = await getExporterEmail();
      const lines = [
        loadedAt ? `Data as of: ${formatWat(loadedAt)} WAT` : '',
        query.trim() ? `Search: "${query.trim()}"` : '',
        sort ? `Sorted by: ${columns.find((c) => c.key === sort.key)?.header ?? sort.key} (${sort.dir === 'asc' ? 'ascending' : 'descending'})` : '',
        ...(meta || []),
        `Rows: ${sorted.length.toLocaleString()}${sorted.length !== rows.length ? ` of ${rows.length.toLocaleString()}` : ''}`,
      ].filter(Boolean);
      downloadXlsx(`qozob-${title}`, [
        {
          name: title,
          title: `Qozob · ${title}`,
          meta: lines,
          columns: cols.map((c) => ({ header: c.header, type: c.type, width: c.width })),
          rows: sorted.map((r) => cols.map((c) => c.get(r))),
        },
      ], { generatedBy: email });
    } finally {
      setExporting(false);
    }
  };

  const from = sorted.length === 0 ? 0 : pageSize ? safePage * pageSize + 1 : 1;
  const to = pageSize ? Math.min(sorted.length, (safePage + 1) * pageSize) : sorted.length;

  return (
    <div className={cx(!bare && ui.card, 'overflow-hidden')}>
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-2.5 p-3 sm:p-4 border-b border-line">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-fg-subtle absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={`Search ${title}`}
            className={cx(ui.input, 'h-10 pl-10 bg-surface-2 border-line')}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {toolbar}

          {/* Column picker */}
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              aria-expanded={pickerOpen}
              className={cx(ui.btn, ui.btnSoft, 'h-10 px-3.5')}
            >
              <Columns3 className="w-4 h-4" aria-hidden />
              <span>Columns</span>
              <span className="text-xs text-fg-subtle tabular">{shownColumns.length}/{columns.length}</span>
            </button>
            {pickerOpen && (
              <div
                role="dialog"
                aria-label="Choose columns"
                className="absolute right-0 mt-2 w-64 max-h-[60vh] overflow-auto z-30 bg-surface border border-line rounded-2xl shadow-xl p-2 animate-in fade-in zoom-in-95 duration-150 origin-top-right"
              >
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className={ui.eyebrow}>Show columns</span>
                  <div className="flex gap-2 text-xs font-semibold">
                    <button type="button" className="text-primary hover:underline" onClick={() => setVisible(columns.map((c) => c.key))}>All</button>
                    <button type="button" className="text-fg-muted hover:underline" onClick={() => setVisible(defaultKeys)}>Reset</button>
                  </div>
                </div>
                <ul className="flex flex-col">
                  {columns.map((c) => (
                    <li key={c.key}>
                      <label className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-2 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-primary"
                          checked={visible.includes(c.key)}
                          onChange={() => toggleColumn(c.key)}
                        />
                        <span className="truncate">{c.header}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-line mt-1.5 pt-1.5 px-2 pb-1">
                  <p className="text-xs text-fg-subtle leading-snug mb-1.5">Excel download uses the columns ticked above.</p>
                  <button
                    type="button"
                    onClick={() => { setPickerOpen(false); handleExport(true); }}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Download with all {columns.length} columns
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleExport(false)}
            disabled={exporting || loading}
            className={cx(ui.btn, ui.btnPrimary, 'h-10 px-4')}
            title="Download the rows and columns shown as an Excel file"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Download className="w-4 h-4" aria-hidden />}
            <span>Excel</span>
            <span className="text-xs opacity-80 tabular">({sorted.length.toLocaleString()})</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-2 text-fg-muted font-semibold uppercase tracking-wider border-b border-line">
            <tr>
              {shownColumns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={cx('px-4 py-3 whitespace-nowrap', c.align === 'right' && 'text-right')}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={cx('inline-flex items-center gap-1 uppercase tracking-wider hover:text-fg transition-colors', active && 'text-fg')}
                    >
                      {c.header}
                      {active ? (
                        sort!.dir === 'asc' ? <ArrowUp className="w-3 h-3" aria-hidden /> : <ArrowDown className="w-3 h-3" aria-hidden />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-30" aria-hidden />
                      )}
                    </button>
                  </th>
                );
              })}
              {rowActions && <th scope="col" className="px-4 py-3 text-right whitespace-nowrap">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={shownColumns.length + (rowActions ? 1 : 0)} className="px-4 py-14 text-center text-fg-subtle">
                  <Loader2 className="w-5 h-5 animate-spin inline-block mr-2 align-middle" aria-hidden />
                  Loading…
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={shownColumns.length + (rowActions ? 1 : 0)} className="px-4 py-14 text-center text-fg-subtle">
                  {query ? 'No rows match your search.' : emptyText}
                </td>
              </tr>
            ) : (
              pageRows.map((r) => (
                <tr key={rowKey(r)} className="hover:bg-surface-2 transition-colors">
                  {shownColumns.map((c) => (
                    <td
                      key={c.key}
                      className={cx(
                        'px-4 py-3 align-top text-fg',
                        c.align === 'right' && 'text-right tabular',
                        (c.type === 'money' || c.type === 'number' || c.type === 'integer') && 'tabular',
                        c.className,
                      )}
                    >
                      {c.render ? c.render(r) : formatCell(c.get(r), c.type)}
                    </td>
                  ))}
                  {rowActions && <td className="px-4 py-3 text-right align-top whitespace-nowrap">{rowActions(r)}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-t border-line bg-surface-2/60 text-xs text-fg-muted">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="tabular">
            {from.toLocaleString()}–{to.toLocaleString()} of {sorted.length.toLocaleString()}
            {sorted.length !== rows.length && ` (filtered from ${rows.length.toLocaleString()})`}
          </span>
          {loadedAt && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-fg-subtle" aria-hidden />
              Data as of {formatWat(loadedAt)} WAT
            </span>
          )}
          {onRefresh && (
            <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline disabled:opacity-60">
              <RefreshCw className={cx('w-3 h-3', loading && 'animate-spin')} aria-hidden /> Refresh
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5">
            <span>Rows</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-7 px-2 rounded-lg bg-surface border border-line text-fg text-xs"
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n === 0 ? 'All' : n}</option>)}
            </select>
          </label>
          {pageSize > 0 && pageCount > 1 && (
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="p-1 rounded-md hover:bg-surface-3 disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="tabular">{safePage + 1}/{pageCount}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
                className="p-1 rounded-md hover:bg-surface-3 disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// DRILL-DOWN MODAL: a large dialog to hold a ReportTable behind a KPI card.
// =========================================================================
export function DrillDownModal({
  open, onClose, title, subtitle, children,
}: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={cx(ui.overlay, 'items-end sm:items-center p-0 sm:p-4')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(ui.modal, 'max-w-6xl max-h-[92vh] flex flex-col rounded-b-none sm:rounded-3xl')}
      >
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-3 border-b border-line">
          <div className="min-w-0">
            <h3 className={ui.h2}>{title}</h3>
            {subtitle && <p className="text-sm text-fg-muted mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-auto p-3 sm:p-5">{children}</div>
      </div>
    </div>
  );
}
