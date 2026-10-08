"use client";

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { DIAL_CODES } from '@/lib/nigeria';
import { cx } from '@/lib/ui';

/**
 * Country code + number as ONE joined control (same height, border and focus ring as other inputs).
 * The code picker sizes to its content and the number takes the remaining width, so it never
 * squashes on desktop grids or overflows on small phones.
 */
export function PhoneField({
  id,
  code,
  onCodeChange,
  value,
  onChange,
  required,
  placeholder = '803 123 4567',
  className,
}: {
  id: string;
  code: string;
  onCodeChange: (code: string) => void;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'flex h-12 w-full min-w-0 items-stretch overflow-hidden rounded-xl border border-line-strong bg-surface transition-colors',
        'focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/20',
        className,
      )}
    >
      <div className="relative shrink-0 border-r border-line bg-surface-2">
        <select
          aria-label="Country code"
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          className="h-full appearance-none bg-transparent pl-3 pr-8 text-sm font-semibold text-fg outline-none cursor-pointer"
        >
          {DIAL_CODES.map((d) => (
            <option key={d.code} value={d.code}>{d.label} {d.code}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" aria-hidden />
      </div>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d\s-]/g, ''))}
        className="h-full min-w-0 flex-1 bg-transparent px-3.5 text-sm text-fg placeholder:text-fg-subtle outline-none tabular"
        placeholder={placeholder}
        maxLength={16}
      />
    </div>
  );
}
