"use client";

// =========================================================================
// VEHICLE FIELDS: vehicle type → make → model, year, colour
// Pick-lists instead of free typing (fewer mistakes, cleaner data). They depend
// on each other:
//   • choosing a type narrows the makes and models (e.g. Bus → Toyota Hiace)
//   • the model list only shows the chosen make's models (and is locked until
//     a make is picked)
//   • choosing a model fills in the type if it was empty
// A car that isn't listed can still be added with "Other (not listed)".
// =========================================================================
import React, { useState } from 'react';
import { cx, ui } from '@/lib/ui';
import {
  VEHICLE_TYPES, VEHICLE_COLOURS, POPULAR_MAKES, OTHER, type VehicleType,
  isKnownMake, makesFor, modelsFor, typeOfModel, vehicleYears,
} from '@/lib/vehicles';

export interface VehicleValue {
  type: VehicleType | '';
  make: string;
  model: string;
  year: string;
  colour: string;
}

export const EMPTY_VEHICLE: VehicleValue = { type: '', make: '', model: '', year: '', colour: '' };

export type VehicleField = 'type' | 'make' | 'model' | 'year' | 'colour';

const YEARS = vehicleYears();
const clean = (s: string) => s.replace(/[^\p{L}\p{N} .&/()-]/gu, '').replace(/\s{2,}/g, ' ').slice(0, 40);

/** Matches saved/free text ("toyota", "Corolla ") to the lists so selects show it. */
export function normaliseVehicle(v: Partial<VehicleValue>): VehicleValue {
  const makeIn = (v.make || '').trim();
  const make = makesFor('').find(mk => mk.toLowerCase() === makeIn.toLowerCase()) ?? makeIn;
  const modelIn = (v.model || '').trim();
  const model = isKnownMake(make) ? (modelsFor(make).find(md => md.toLowerCase() === modelIn.toLowerCase()) ?? modelIn) : modelIn;
  const type = (v.type || (isKnownMake(make) ? typeOfModel(make, model) : null) || '') as VehicleType | '';
  const year = /^\d{4}$/.test(String(v.year || '').trim()) ? String(v.year).trim() : '';
  const colour = VEHICLE_COLOURS.find(c => c.toLowerCase() === String(v.colour || '').trim().toLowerCase()) ?? (v.colour ? 'Other' : '');
  return { type, make, model, year, colour };
}

export function VehicleFields({
  value, onChange, idPrefix, fields = ['type', 'make', 'model', 'year'], required = [], className, disabled,
}: {
  value: VehicleValue;
  onChange: (v: VehicleValue) => void;
  idPrefix: string;
  fields?: VehicleField[];
  required?: VehicleField[];
  className?: string;
  disabled?: boolean;
}) {
  const [makeOther, setMakeOther] = useState(false);
  const [modelOther, setModelOther] = useState(false);
  const has = (f: VehicleField) => fields.includes(f);
  const req = (f: VehicleField) => required.includes(f);
  const star = (f: VehicleField) => (req(f) ? ' *' : '');

  const type = has('type') ? value.type : '';
  const knownMake = isKnownMake(value.make);
  const makeIsText = (makeOther && !knownMake) || (!!value.make && !knownMake);
  const models = knownMake ? modelsFor(value.make, type) : [];
  const knownModel = knownMake && modelsFor(value.make).includes(value.model);
  const modelIsText = makeIsText || (knownMake && ((modelOther && !knownModel) || (!!value.model && !knownModel)));

  const makes = makesFor(type);
  const popular = POPULAR_MAKES.filter(mk => makes.includes(mk));
  const rest = makes.filter(mk => !popular.includes(mk));

  const setType = (t: VehicleType | '') => {
    const next = { ...value, type: t };
    if (t && knownMake && !makesFor(t).includes(value.make)) { next.make = ''; next.model = ''; }
    else if (t && knownModel && typeOfModel(value.make, value.model) !== t) next.model = '';
    onChange(next);
  };
  const setMake = (mk: string) => {
    if (mk === OTHER) { setMakeOther(true); setModelOther(true); onChange({ ...value, make: '', model: '' }); return; }
    setMakeOther(false); setModelOther(false);
    onChange({ ...value, make: mk, model: '' });
  };
  const setModel = (md: string) => {
    if (md === OTHER) { setModelOther(true); onChange({ ...value, model: '' }); return; }
    setModelOther(false);
    const ty = typeOfModel(value.make, md);
    onChange({ ...value, model: md, type: has('type') ? (value.type || ty || '') : value.type });
  };

  return (
    <div className={cx('grid grid-cols-1 sm:grid-cols-2 gap-3', className)}>
      {has('type') && (
        <div>
          <label className={ui.label} htmlFor={`${idPrefix}-type`}>Vehicle type{star('type')}</label>
          <select id={`${idPrefix}-type`} value={value.type} onChange={e => setType(e.target.value as VehicleType | '')} className={ui.select} required={req('type')} disabled={disabled}>
            <option value="">{req('type') ? 'Select type' : 'Any type'}</option>
            {VEHICLE_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
      )}

      {has('make') && (
        <div>
          <label className={ui.label} htmlFor={`${idPrefix}-make`}>Make{star('make')}</label>
          <select id={`${idPrefix}-make`} value={makeIsText ? OTHER : value.make} onChange={e => setMake(e.target.value)} className={ui.select} required={req('make')} disabled={disabled}>
            <option value="" disabled={req('make')}>Select make</option>
            {popular.length > 0 && (
              <optgroup label="Popular">
                {popular.map(mk => <option key={`p-${mk}`} value={mk}>{mk}</option>)}
              </optgroup>
            )}
            <optgroup label={popular.length ? 'All makes' : 'Makes'}>
              {rest.map(mk => <option key={mk} value={mk}>{mk}</option>)}
            </optgroup>
            <option value={OTHER}>Other (not listed)</option>
          </select>
          {makeIsText && (
            <input aria-label="Make (not listed)" value={value.make} onChange={e => onChange({ ...value, make: clean(e.target.value) })}
              className={cx(ui.input, 'mt-2 h-10')} placeholder="Type the make" required={req('make')} disabled={disabled} autoFocus />
          )}
        </div>
      )}

      {has('model') && (
        <div>
          <label className={ui.label} htmlFor={`${idPrefix}-model`}>Model{star('model')}</label>
          {makeIsText ? (
            <input id={`${idPrefix}-model`} value={value.model} onChange={e => onChange({ ...value, model: clean(e.target.value) })}
              className={ui.input} placeholder="Type the model" required={req('model')} disabled={disabled} />
          ) : (
            <>
              <select id={`${idPrefix}-model`} value={modelIsText ? OTHER : value.model} onChange={e => setModel(e.target.value)} className={ui.select}
                required={req('model')} disabled={disabled || !value.make}>
                <option value="" disabled={req('model')}>{value.make ? 'Select model' : 'Choose a make first'}</option>
                {models.map(md => <option key={md} value={md}>{md}</option>)}
                {value.make && <option value={OTHER}>Other (not listed)</option>}
              </select>
              {modelIsText && (
                <input aria-label="Model (not listed)" value={value.model} onChange={e => onChange({ ...value, model: clean(e.target.value) })}
                  className={cx(ui.input, 'mt-2 h-10')} placeholder="Type the model" required={req('model')} disabled={disabled} autoFocus />
              )}
            </>
          )}
        </div>
      )}

      {has('year') && (
        <div>
          <label className={ui.label} htmlFor={`${idPrefix}-year`}>Year{star('year')}</label>
          <select id={`${idPrefix}-year`} value={value.year} onChange={e => onChange({ ...value, year: e.target.value })} className={ui.select} required={req('year')} disabled={disabled}>
            <option value="" disabled={req('year')}>Select year</option>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}

      {has('colour') && (
        <div>
          <label className={ui.label} htmlFor={`${idPrefix}-colour`}>Colour{star('colour')}</label>
          <select id={`${idPrefix}-colour`} value={value.colour} onChange={e => onChange({ ...value, colour: e.target.value })} className={ui.select} required={req('colour')} disabled={disabled}>
            <option value="" disabled={req('colour')}>Select colour</option>
            {VEHICLE_COLOURS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

