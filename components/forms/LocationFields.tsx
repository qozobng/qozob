"use client";

// =========================================================================
// LOCATION FIELDS: country → state → LGA
// Dependent pick-lists:
//   • Country comes from Qozob's regions (Nigeria first).
//   • In Nigeria, State is a list of the 36 states + FCT, and LGA lists only
//     the LGAs of the chosen state (774 in total, the same boundaries as the
//     map) and stays locked until a state is chosen.
//   • Changing the country clears the state; changing the state clears the LGA.
//   • Other countries: state/region and local area are short text boxes for now
//     (their area name comes from the region, e.g. "District" in Ghana).
// =========================================================================
import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { cx, ui } from '@/lib/ui';
import { NIGERIAN_STATES, stateLabel, normaliseState } from '@/lib/nigeria';
import { lgasOf } from '@/lib/nigeriaLgas';
import { loadRegions, countryCodeFromName, NIGERIA_FALLBACK, type Region } from '@/lib/regions';

export interface LocationValue {
  /** Country name as stored on profiles (e.g. "Nigeria"); ignored when showCountry is false. */
  country: string;
  state: string;
  lga: string;
}

const cleanText = (s: string) => s.replace(/[^\p{L}\p{N} .,'/()-]/gu, '').replace(/\s{2,}/g, ' ').slice(0, 60);

export function LocationFields({
  value, onChange, idPrefix, showCountry = false, showLga = true, required = { state: true }, onCountryChange,
  className, labels, disabled,
}: {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
  idPrefix: string;
  showCountry?: boolean;
  showLga?: boolean;
  required?: { country?: boolean; state?: boolean; lga?: boolean };
  /** Called with the ISO code when the country changes (e.g. to switch the phone dial code). */
  onCountryChange?: (code: string | null) => void;
  className?: string;
  labels?: { state?: string; lga?: string };
  disabled?: boolean;
}) {
  const [regions, setRegions] = useState<Record<string, Region>>({ NG: NIGERIA_FALLBACK });
  useEffect(() => {
    if (!showCountry) return;
    loadRegions(createClient()).then(setRegions);
  }, [showCountry]);

  const code = showCountry ? countryCodeFromName(value.country, regions) : 'NG';
  const inNigeria = code === 'NG';
  const region = code ? regions[code] : undefined;
  const areaLabel = inNigeria ? 'LGA' : (region?.area_label || 'Local area');

  const countries = useMemo(() => Object.values(regions).sort((a, b) =>
    (a.country_code === 'NG' ? -1 : b.country_code === 'NG' ? 1 : a.name.localeCompare(b.name))), [regions]);

  const stateValue = inNigeria ? (normaliseState(value.state) ?? '') : value.state;
  const lgas = inNigeria ? lgasOf(stateValue) : [];
  // Keep an older free-typed LGA visible instead of silently dropping it
  const legacyLga = inNigeria && value.lga && !lgas.includes(value.lga) ? value.lga : '';

  const star = (on?: boolean) => (on ? ' *' : '');

  const setCountry = (name: string) => {
    onChange({ country: name, state: '', lga: '' });
    onCountryChange?.(countryCodeFromName(name, regions));
  };

  return (
    <div className={cx('grid grid-cols-1 sm:grid-cols-2 gap-3', className)}>
      {showCountry && (
        <div>
          <label className={ui.label} htmlFor={`${idPrefix}-country`}>Country{star(required.country)}</label>
          <select id={`${idPrefix}-country`} value={value.country} onChange={e => setCountry(e.target.value)} className={ui.select}
            required={required.country} disabled={disabled}>
            {!value.country && <option value="" disabled>Choose your country</option>}
            {/* A country typed before the list existed stays selectable */}
            {value.country && !countries.some(r => r.name === value.country) && <option value={value.country}>{value.country}</option>}
            {countries.map(r => <option key={r.country_code} value={r.name}>{r.name}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className={ui.label} htmlFor={`${idPrefix}-state`}>
          {labels?.state ?? (inNigeria ? 'State' : 'Region / state')}{star(required.state)}
        </label>
        {inNigeria ? (
          <select id={`${idPrefix}-state`} value={stateValue} onChange={e => onChange({ ...value, state: e.target.value, lga: '' })}
            className={ui.select} required={required.state} disabled={disabled}>
            <option value="" disabled={required.state}>Choose state</option>
            {NIGERIAN_STATES.map(s => <option key={s} value={s}>{stateLabel(s)}</option>)}
          </select>
        ) : (
          <input id={`${idPrefix}-state`} value={value.state} onChange={e => onChange({ ...value, state: cleanText(e.target.value), lga: '' })}
            className={ui.input} required={required.state} disabled={disabled} autoComplete="address-level1" maxLength={60} />
        )}
      </div>

      {showLga && (
        <div>
          <label className={ui.label} htmlFor={`${idPrefix}-lga`}>
            {labels?.lga ?? areaLabel}{star(required.lga)}{!required.lga && <span className="font-normal text-fg-subtle"> (optional)</span>}
          </label>
          {inNigeria ? (
            <select id={`${idPrefix}-lga`} value={value.lga} onChange={e => onChange({ ...value, lga: e.target.value })} className={ui.select}
              required={required.lga} disabled={disabled || !stateValue}>
              <option value="">{stateValue ? `Choose ${areaLabel}` : 'Choose a state first'}</option>
              {legacyLga && <option value={legacyLga}>{legacyLga}</option>}
              {lgas.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          ) : (
            <input id={`${idPrefix}-lga`} value={value.lga} onChange={e => onChange({ ...value, lga: cleanText(e.target.value) })}
              className={ui.input} required={required.lga} disabled={disabled} autoComplete="address-level2" maxLength={60} />
          )}
        </div>
      )}
    </div>
  );
}

