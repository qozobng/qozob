"use client";

import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  badge?: {
    text: string;
    variant?: 'positive' | 'negative' | 'neutral' | 'warning';
  };
  colorTheme?: 'indigo' | 'emerald' | 'amber' | 'blue' | 'rose' | 'purple';
  onClick?: () => void;
}

const THEMES = {
  indigo: {
    iconBg: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    border: 'border-slate-200/80 hover:border-indigo-300',
    accent: 'text-indigo-950',
  },
  emerald: {
    iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    border: 'border-slate-200/80 hover:border-emerald-300',
    accent: 'text-emerald-950',
  },
  amber: {
    iconBg: 'bg-amber-50 text-amber-600 border-amber-100',
    border: 'border-slate-200/80 hover:border-amber-300',
    accent: 'text-amber-950',
  },
  blue: {
    iconBg: 'bg-blue-50 text-blue-600 border-blue-100',
    border: 'border-slate-200/80 hover:border-blue-300',
    accent: 'text-blue-950',
  },
  rose: {
    iconBg: 'bg-rose-50 text-rose-600 border-rose-100',
    border: 'border-slate-200/80 hover:border-rose-300',
    accent: 'text-rose-950',
  },
  purple: {
    iconBg: 'bg-purple-50 text-purple-600 border-purple-100',
    border: 'border-slate-200/80 hover:border-purple-300',
    accent: 'text-purple-950',
  },
};

const BADGE_VARIANTS = {
  positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  negative: 'bg-rose-50 text-rose-700 border-rose-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  badge,
  colorTheme = 'indigo',
  onClick,
}: StatCardProps) {
  const theme = THEMES[colorTheme] || THEMES.indigo;
  const isClickable = Boolean(onClick);

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl p-5 border ${theme.border} shadow-xs transition-all duration-200 ${
        isClickable ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''
      } flex flex-col justify-between`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider line-clamp-1">
          {title}
        </span>
        <div className={`p-2.5 rounded-xl border ${theme.iconBg} shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      <div>
        <div className="flex items-baseline gap-2 mb-1 flex-wrap">
          <span className={`text-2xl sm:text-3xl font-black tracking-tight ${theme.accent}`}>
            {value}
          </span>
          {badge && (
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                BADGE_VARIANTS[badge.variant || 'neutral']
              }`}
            >
              {badge.text}
            </span>
          )}
        </div>
        {subtitle && <p className="text-xs text-slate-500 line-clamp-1">{subtitle}</p>}
      </div>
    </div>
  );
}

