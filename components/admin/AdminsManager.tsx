"use client";

// =========================================================================
// ADMIN · ADMINS & ACCESS (master admins only)
// Add an admin (existing account or email invite), choose which sections
// they can open, change or remove access, and see the access audit log.
// The database enforces every rule (admin_grant_access / admin_revoke_access).
// =========================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Copy, Crown, History, Loader2, Pencil, ShieldCheck, Trash2, UserPlus, Users, X,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { cx, ui } from '@/lib/ui';
import { formatWat } from '@/lib/xlsx';
import { ReportTable, type ReportColumn } from './ReportTable';

const supabase = createClient();

export const ADMIN_MODULES = [
  { key: 'claims', label: 'Station claims', hint: 'Approve owners (CAC documents)' },
  { key: 'requests', label: 'Manager requests', hint: 'Grant Manager role' },
  { key: 'stations', label: 'Stations', hint: 'Directory, edit any station' },
  { key: 'prices', label: 'Price reviews', hint: 'Approve held prices' },
  { key: 'ads', label: 'Adverts', hint: 'Create and target ads' },
  { key: 'mailing', label: 'Mailing', hint: 'Subscribers and campaigns' },
  { key: 'rewards', label: 'Rewards', hint: 'People, ID checks, payouts' },
  { key: 'services', label: 'Auto services', hint: 'Service requests, vouchers' },
] as const;
export type ModuleKey = (typeof ADMIN_MODULES)[number]['key'];
const LABEL = Object.fromEntries(ADMIN_MODULES.map((m) => [m.key, m.label])) as Record<string, string>;

interface AdminRow {
  user_id: string;
  email: string;
  full_name: string | null;
  is_master: boolean;
  modules: string[];
  note: string | null;
  has_access_row: boolean;
  granted_by_email: string | null;
  updated_at: string | null;
  last_sign_in_at: string | null;
  is_me: boolean;
}
interface AuditRow {
  id: number;
  actor: string | null;
  action: string;
  target_user: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_TEXT: Record<string, string> = {
  admin_granted: 'Admin added', admin_access_changed: 'Access changed', admin_revoked: 'Admin removed',
};

export function AdminsManager() {
  const [view, setView] = useState<'admins' | 'log'>('admins');
  const [admins, setAdmins] = useState<AdminRow[] | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminRow | 'new' | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string; link?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_list_admins');
    if (err) { setError(err.message); setAdmins([]); } else setAdmins((data || []) as AdminRow[]);
    setLoadedAt(new Date());
  }, []);
  useEffect(() => { load(); }, [load]);

  const revoke = async (a: AdminRow) => {
    if (!window.confirm(`Remove admin access for ${a.email}? They keep their normal Qozob account.`)) return;
    setBusy(a.user_id);
    const { error: err } = await supabase.rpc('admin_revoke_access', { p_user: a.user_id });
    setBusy(null);
    if (err) return setNotice({ ok: false, text: err.message });
    setNotice({ ok: true, text: `${a.email} is no longer an admin.` });
    load();
  };

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-semibold text-fg mb-1">Admins &amp; access</h2>
          <p className="text-fg-muted text-xs sm:text-sm max-w-2xl">
            Add admins and choose which sections each one can open. Master admins can see everything and manage other admins.
          </p>
        </div>
        <button type="button" onClick={() => setEditing('new')} className={cx(ui.btn, ui.btnMd, ui.btnPrimary)}>
          <UserPlus className="w-4 h-4" aria-hidden /> Add admin
        </button>
      </div>

      <div role="tablist" aria-label="Admin views" className="flex gap-1 rounded-full bg-surface border border-line p-1 w-fit">
        {([['admins', `Admins${admins ? ` (${admins.length})` : ''}`, Users], ['log', 'Access log', History]] as const).map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
            className={cx('inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors',
              view === k ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg hover:bg-surface-2')}>
            <Icon className="w-4 h-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {notice && (
        <div className={cx(notice.ok ? ui.alertSuccess : ui.alertError, 'animate-in fade-in slide-in-from-top-1 duration-200')} role="status">
          {notice.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />}
          <div className="min-w-0 flex-1">
            <p>{notice.text}</p>
            {notice.link && (
              <div className="mt-2 flex items-center gap-2">
                <code className="text-xs bg-surface/70 border border-line rounded-lg px-2 py-1 truncate flex-1">{notice.link}</code>
                <button type="button" onClick={() => navigator.clipboard?.writeText(notice.link!)} className={cx(ui.btn, ui.btnSm, ui.btnSecondary)}>
                  <Copy className="w-3.5 h-3.5" aria-hidden /> Copy
                </button>
              </div>
            )}
          </div>
          <button type="button" onClick={() => setNotice(null)} className="p-1 rounded-md hover:bg-surface/50" aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}
      {error && (
        <div className={ui.alertWarning}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          <span>{/function|does not exist|schema cache/i.test(error) ? 'Run the 20261014 database update in Supabase to enable admin access levels.' : error}</span>
        </div>
      )}

      {view === 'log' ? (
        <AccessLog admins={admins || []} />
      ) : !admins ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" aria-label="Loading" /></div>
      ) : (
        <ul className="grid md:grid-cols-2 gap-3">
          {admins.map((a) => (
            <li key={a.user_id} className={cx(ui.card, 'p-4 sm:p-5 flex flex-col gap-3 animate-in fade-in duration-200')}>
              <div className="flex items-start gap-3">
                <span className={cx('w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm',
                  a.is_master ? 'bg-warning-soft text-on-warning-soft' : 'bg-accent-soft text-on-accent-soft')}>
                  {a.is_master ? <Crown className="w-5 h-5" aria-hidden /> : (a.full_name || a.email).slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-fg truncate">
                    {a.full_name || a.email} {a.is_me && <span className="text-xs font-semibold text-fg-subtle">(you)</span>}
                  </p>
                  <p className="text-xs text-fg-muted truncate">{a.email}</p>
                </div>
                <span className={cx('rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
                  a.is_master ? 'bg-warning-soft text-on-warning-soft border-warning-line' : 'bg-surface-2 text-fg-muted border-line')}>
                  {a.is_master ? 'Master admin' : `${a.modules.length} section${a.modules.length === 1 ? '' : 's'}`}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {a.is_master ? (
                  <span className="text-xs text-fg-muted">All sections, including managing admins.</span>
                ) : a.modules.length ? (
                  a.modules.map((m) => (
                    <span key={m} className="rounded-full bg-surface-2 border border-line px-2 py-0.5 text-xs font-medium text-fg">{LABEL[m] ?? m}</span>
                  ))
                ) : (
                  <span className="text-xs text-danger font-semibold">No sections yet: this admin can&rsquo;t open anything.</span>
                )}
              </div>

              <p className="text-xs text-fg-subtle">
                {a.note && <>{a.note} · </>}
                {a.granted_by_email ? `Set by ${a.granted_by_email}` : a.has_access_row ? 'Set at upgrade' : 'Not set'}
                {a.updated_at && <> · {formatWat(a.updated_at)}</>}
                {' '}· Last sign-in {a.last_sign_in_at ? formatWat(a.last_sign_in_at) : 'never'}
              </p>

              <div className="flex gap-2 mt-auto">
                <button type="button" onClick={() => setEditing(a)} disabled={a.is_me}
                  title={a.is_me ? 'Ask another master admin to change your own access' : undefined}
                  className={cx(ui.btn, ui.btnSm, ui.btnSoft)}>
                  <Pencil className="w-3.5 h-3.5" aria-hidden /> Edit access
                </button>
                {!a.is_me && (
                  <button type="button" onClick={() => revoke(a)} disabled={busy === a.user_id} className={cx(ui.btn, ui.btnSm, ui.btnDanger)}>
                    {busy === a.user_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Trash2 className="w-3.5 h-3.5" aria-hidden />} Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {loadedAt && view === 'admins' && <p className="text-xs text-fg-subtle">Data as of {formatWat(loadedAt)} WAT</p>}

      {editing && (
        <AccessDialog
          admin={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={(n) => { setEditing(null); setNotice(n); load(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function AccessDialog({
  admin, onClose, onDone,
}: { admin: AdminRow | null; onClose: () => void; onDone: (n: { ok: boolean; text: string; link?: string }) => void }) {
  const [email, setEmail] = useState(admin?.email ?? '');
  const [master, setMaster] = useState(admin?.is_master ?? false);
  const [mods, setMods] = useState<Set<string>>(new Set(admin && !admin.is_master ? admin.modules : []));
  const [note, setNote] = useState(admin?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (k: string) => setMods((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!master && mods.size === 0) return setErr('Choose at least one section.');
    setBusy(true);
    try {
      const res = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), is_master: master, modules: [...mods], note }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body.error || 'Could not save.'); return; }
      if (body.invited) {
        onDone(body.emailSent
          ? { ok: true, text: `Invitation sent to ${email.trim()}. They'll set a password and land in the admin panel.` }
          : { ok: true, text: `Access saved, but the invitation email could not be sent. Share this one-time link with ${email.trim()} securely:`, link: body.link });
      } else {
        onDone({ ok: true, text: admin ? `Access updated for ${email.trim()}.` : `${email.trim()} is now an admin. They'll see their sections next time they open the admin panel.` });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={ui.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={save} role="dialog" aria-modal="true" aria-label={admin ? 'Edit admin access' : 'Add admin'}
        className={cx(ui.modal, 'max-w-lg p-6 max-h-[92vh] overflow-y-auto')}>
        <button type="button" onClick={onClose} className={ui.modalClose} aria-label="Close"><X className="w-5 h-5" /></button>
        <p className={ui.eyebrow}>{admin ? 'Edit access' : 'Add admin'}</p>
        <h3 className="text-lg font-bold text-fg mt-0.5 pr-8">{admin ? admin.email : 'Who should help run Qozob?'}</h3>

        {!admin && (
          <div className="mt-4">
            <label htmlFor="adm-email" className={ui.label}>Email address</label>
            <input id="adm-email" type="email" required autoFocus className={cx(ui.input, 'h-11')} value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            <p className={ui.hint}>If they don&rsquo;t have a Qozob account yet, we&rsquo;ll email them an invitation to set a password.</p>
          </div>
        )}

        <fieldset className="mt-5">
          <legend className={ui.label}>Access level</legend>
          <div className="grid grid-cols-2 gap-2">
            {([[false, 'Selected sections', ShieldCheck], [true, 'Master admin', Crown]] as const).map(([v, label, Icon]) => (
              <button key={label} type="button" onClick={() => setMaster(v)} aria-pressed={master === v}
                className={cx('flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-all',
                  master === v ? 'border-primary bg-accent-soft text-fg ring-2 ring-primary/20' : 'border-line bg-surface text-fg-muted hover:bg-surface-2')}>
                <Icon className="w-4 h-4" aria-hidden /> {label}
              </button>
            ))}
          </div>
          {master && <p className={cx(ui.hint, 'mt-2')}>Master admins can open every section and add or remove other admins.</p>}
        </fieldset>

        {!master && (
          <fieldset className="mt-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <legend className={ui.label}>Sections they can open</legend>
              <button type="button" className="text-xs font-semibold text-primary hover:underline mb-1.5"
                onClick={() => setMods(mods.size === ADMIN_MODULES.length ? new Set() : new Set(ADMIN_MODULES.map((m) => m.key)))}>
                {mods.size === ADMIN_MODULES.length ? 'Clear' : 'Select all'}
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {ADMIN_MODULES.map((m) => (
                <label key={m.key} className={cx('flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition-colors',
                  mods.has(m.key) ? 'border-primary/60 bg-accent-soft/60' : 'border-line hover:bg-surface-2')}>
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={mods.has(m.key)} onChange={() => toggle(m.key)} />
                  <span>
                    <span className="block text-sm font-semibold text-fg">{m.label}</span>
                    <span className="block text-xs text-fg-muted">{m.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className={cx(ui.hint, 'mt-2')}>Everyone with admin access can see the Overview.</p>
          </fieldset>
        )}

        <div className="mt-4">
          <label htmlFor="adm-note" className={ui.label}>Note (optional)</label>
          <input id="adm-note" className={cx(ui.input, 'h-11')} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Rewards desk, Lagos" />
        </div>

        {err && <div className={cx(ui.alertError, 'mt-4')}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {err}</div>}

        <div className="flex gap-2 mt-6">
          <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnSecondary, ui.btnMd, 'flex-1')}>Cancel</button>
          <button type="submit" disabled={busy} className={cx(ui.btn, ui.btnPrimary, ui.btnMd, 'flex-1')}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} {admin ? 'Save access' : 'Add admin'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
function AccessLog({ admins }: { admins: AdminRow[] }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('admin_audit_log').select('*').order('created_at', { ascending: false }).limit(1000);
    setRows((data || []) as AuditRow[]);
    setLoadedAt(new Date());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const emailOf = useMemo(() => new Map(admins.map((a) => [a.user_id, a.email])), [admins]);
  const columns = useMemo<ReportColumn<AuditRow>[]>(() => [
    { key: 'when', header: 'When', get: (r) => r.created_at, type: 'datetime' },
    { key: 'action', header: 'Action', get: (r) => ACTION_TEXT[r.action] ?? r.action },
    { key: 'target', header: 'Admin', get: (r) => (r.details?.email as string) ?? (r.target_user ? emailOf.get(r.target_user) ?? r.target_user : null), width: 28 },
    {
      key: 'access', header: 'Access', width: 50,
      get: (r) => r.details?.is_master ? 'Master admin'
        : Array.isArray(r.details?.modules) ? (r.details!.modules as string[]).map((m) => LABEL[m] ?? m).join(', ')
        : (r.details?.new_role as string) ? `Back to ${r.details!.new_role as string}` : null,
    },
    { key: 'by', header: 'Done by', get: (r) => (r.actor ? emailOf.get(r.actor) ?? r.actor : 'System'), width: 28 },
    { key: 'note', header: 'Note', get: (r) => (r.details?.note as string) ?? null, defaultVisible: false },
  ], [emailOf]);

  return (
    <ReportTable id="admin-access-log" title="Admin access log" rows={rows} columns={columns} rowKey={(r) => String(r.id)}
      loading={loading} loadedAt={loadedAt} onRefresh={load} initialSort={{ key: 'when', dir: 'desc' }}
      emptyText="No admin access changes yet." />
  );
}
