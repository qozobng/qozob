// Server helpers to identify the signed-in user (from the auth cookies) and check admin rights.
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';

export async function currentUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

/** Returns the admin user, or null if the caller is not a signed-in admin (checked by the database). */
export async function requireAdmin(): Promise<User | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: isAdmin, error } = await supabase.rpc('is_admin');
  if (error || isAdmin !== true) return null;
  return user;
}

