"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { DEFAULT_REWARD_SETTINGS, type RewardSettings } from '@/lib/rewards';

/** Live programme settings (prize, limits). Falls back to the defaults if rewards are not set up yet. */
export function useRewardSettings() {
  const [settings, setSettings] = useState<RewardSettings>(DEFAULT_REWARD_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    createClient().from('reward_settings').select('*').maybeSingle().then(({ data }) => {
      if (!alive) return;
      if (data) setSettings({ ...DEFAULT_REWARD_SETTINGS, ...(data as Partial<RewardSettings>) });
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);
  return { settings, loaded };
}

export interface LgaOption { id: number; name: string; state: string }

/** Areas (id, name, state) of one country for pickers — Nigeria's 774 LGAs by default. Empty until boundaries are imported. */
export function useLgaList(country: string = 'NG') {
  const [lgas, setLgas] = useState<LgaOption[]>([]);
  useEffect(() => {
    let alive = true;
    const base = () => createClient().from('lgas').select('id,name,state').order('state').order('name').limit(1000);
    base().eq('country_code', country).then(async ({ data, error }) => {
      // Database update 20261105 not run yet (no country column): every area is Nigerian
      if (error && country === 'NG') ({ data } = await base());
      if (alive && data) setLgas(data as LgaOption[]);
    });
    return () => { alive = false; };
  }, [country]);
  return lgas;
}

