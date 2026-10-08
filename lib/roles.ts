import type { SupabaseClient, User } from '@supabase/supabase-js';

// =========================================================================
// ROLES
// Trusted roles live in `app_metadata.role`. Only the database can set it
// (admin approval / SQL), never the user. `user_metadata.role` CAN be edited by any
// signed-in user, so it's treated purely as "what the user asked for" and is
// never used to grant access. The database enforces the real rules
// (see supabase/migrations/20261008_security_hardening.sql).
// =========================================================================

export type AppRole = 'Admin' | 'Manager' | 'User';

/** Verified role, set only by an admin or the database. */
export function getRole(user: User | null | undefined): AppRole {
  const raw = String(user?.app_metadata?.role || '').toLowerCase();
  if (raw === 'admin') return 'Admin';
  if (raw === 'manager') return 'Manager';
  return 'User';
}

/** True when the user chose "Station Owner/Manager" (at sign-up or in Settings) but isn't approved yet. */
export function hasRequestedManager(user: User | null | undefined): boolean {
  return getRole(user) === 'User' && user?.user_metadata?.role === 'Manager';
}

/**
 * Where a user should land after signing in: admins go to the admin dashboard, everyone else
 * (fuel buyers, station managers, pending managers) to the homepage map. Dashboards stay one tap
 * away in the account menu.
 */
export function homePathFor(user: User | null | undefined): string {
  return getRole(user) === 'Admin' ? '/admin' : '/';
}

/**
 * Validates a "return to" path from the URL (?next=...). Only same-site paths are allowed, so the
 * parameter can never be used to bounce people to another website (open-redirect protection).
 */
export function safeNext(raw: string | null | undefined, fallback = '/'): string {
  const v = String(raw || '').trim();
  if (!v || !v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return fallback;
  if (/^\/(auth|login|signup|welcome)(\/|\?|$)/.test(v)) return fallback; // avoid loops
  return v;
}

/** Final destination after sign-in / verification: an explicit ?next wins, otherwise the role's home. */
export function landingPathFor(user: User | null | undefined, next?: string | null): string {
  const target = safeNext(next, '');
  return target || homePathFor(user);
}

/** Turns a stored CAC document reference (old public URL or new storage path) into a storage path. */
export function cacDocumentPath(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const marker = '/cac_documents/';
  const idx = ref.indexOf(marker);
  if (idx >= 0) return decodeURIComponent(ref.slice(idx + marker.length).split('?')[0]);
  return /^https?:\/\//i.test(ref) ? null : ref;
}

/** Short-lived link to a private CAC document (admins only - storage policies enforce this). */
export async function signedCacUrl(supabase: SupabaseClient, ref: string | null | undefined): Promise<string | null> {
  const path = cacDocumentPath(ref);
  if (!path) return ref && /^https?:\/\//i.test(ref) ? ref : null;
  const { data, error } = await supabase.storage.from('cac_documents').createSignedUrl(path, 60 * 10);
  if (error) {
    console.warn('Could not create document link:', error.message);
    return null;
  }
  return data.signedUrl;
}

export type RoleRequest = {
  id: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  created_at: string;
  admin_notes: string | null;
};

/** The user's most recent Manager-access request, if any. */
export async function getLatestRoleRequest(supabase: SupabaseClient, userId: string): Promise<RoleRequest | null> {
  const { data, error } = await supabase
    .from('role_requests')
    .select('id, status, created_at, admin_notes')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('Could not load Manager access request:', error.message);
    return null;
  }
  return data as RoleRequest | null;
}

/**
 * Files a Manager-access request for an admin to review, and marks the account as
 * "requested Manager" (UI only). Safe to call repeatedly: it does nothing if a pending request exists.
 */
export async function requestManagerAccess(
  supabase: SupabaseClient,
  user: User,
  extra: { note?: string | null } = {}
): Promise<{ ok: boolean; alreadyPending?: boolean; error?: string }> {
  const latest = await getLatestRoleRequest(supabase, user.id);
  if (latest?.status === 'Pending') return { ok: true, alreadyPending: true };

  const meta = user.user_metadata || {};
  const fullName = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim() || meta.full_name || null;
  const { error } = await supabase.from('role_requests').insert({
    user_id: user.id,
    email: user.email,
    full_name: fullName,
    company_name: meta.company_name || null,
    phone: meta.full_phone || null,
    document_url: meta.cac_document_path || meta.cac_document_url || null,
    note: extra.note || null,
  });
  // 23505 = a pending request already exists (unique index) - treat as success
  if (error && error.code !== '23505') return { ok: false, error: error.message };

  if (meta.role !== 'Manager') {
    await supabase.auth.updateUser({ data: { role: 'Manager' } });
  }
  return { ok: true, alreadyPending: error?.code === '23505' };
}

/**
 * People who picked "Station Owner/Manager" at sign-up get their request filed automatically
 * the first time they're signed in (sign-up itself may not have a session yet).
 */
export async function ensureManagerRequestFiled(supabase: SupabaseClient, user: User): Promise<RoleRequest | null> {
  if (!hasRequestedManager(user)) return null;
  const latest = await getLatestRoleRequest(supabase, user.id);
  if (latest) return latest; // already filed (or reviewed) - never silently re-file after a rejection
  await requestManagerAccess(supabase, user);
  return getLatestRoleRequest(supabase, user.id);
}
