// Server helpers to identify the signed-in user (from the auth cookies) and check admin rights.
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';

export type AdminModule = 'claims' | 'requests' | 'stations' | 'prices' | 'ads' | 'mailing' | 'rewards' | 'services';

export async function currentUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

const isMissingFn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function/i.test(e.message || ''));

/**
 * Returns the admin user, or null if the caller is not a signed-in admin (checked by the database).
 * Pass a module to require access to that admin section (sub-admins only see the sections a master
 * admin gave them). Falls back to the plain admin check if the 20261014 database update is not run yet.
 */
export async function requireAdmin(module?: AdminModule): Promise<User | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  if (module) {
    const { data: ok, error } = await supabase.rpc('admin_can', { p_module: module });
    if (!error) return ok === true ? user : null;
    if (!isMissingFn(error)) return null;
  }
  const { data: isAdmin, error } = await supabase.rpc('is_admin');
  if (error || isAdmin !== true) return null;
  return user;
}

/** Master admins can add/remove admins and choose which sections they see. */
export async function requireMasterAdmin(): Promise<User | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: ok, error } = await supabase.rpc('admin_is_master');
  if (error || ok !== true) return null;
  return user;
}
