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
    iconBg: 'bg-accent-soft text-on-accent-soft border-accent-line',
    border: 'border-line hover:border-accent-line',
    accent: 'text-fg',
  },
  emerald: {
    iconBg: 'bg-success-soft text-on-success-soft border-success-line',
    border: 'border-line hover:border-success-line',
    accent: 'text-success',
  },
  amber: {
    iconBg: 'bg-warning-soft text-on-warning-soft border-warning-line',
    border: 'border-line hover:border-warning-line',
    accent: 'text-warning',
  },
  blue: {
    iconBg: 'bg-info-soft text-on-info-soft border-info-line',
    border: 'border-line hover:border-info-line',
    accent: 'text-info',
  },
  rose: {
    iconBg: 'bg-danger-soft text-on-danger-soft border-danger-line',
    border: 'border-line hover:border-danger-line',
    accent: 'text-danger',
  },
  purple: {
    iconBg: 'bg-accent-soft text-on-accent-soft border-accent-line',
    border: 'border-line hover:border-accent-line',
    accent: 'text-accent',
  },
};

const BADGE_VARIANTS = {
  positive: 'bg-success-soft text-on-success-soft border-success-line',
  negative: 'bg-danger-soft text-on-danger-soft border-danger-line',
  warning: 'bg-warning-soft text-on-warning-soft border-warning-line',
  neutral: 'bg-surface-2 text-fg border-line',
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
      {...(isClickable
        ? {
            role: 'button',
            tabIndex: 0,
            title: 'View details',
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); }
            },
          }
        : {})}
      className={`bg-surface rounded-xl p-5 border ${theme.border} shadow-xs transition-all duration-200 ${
        isClickable ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 outline-none focus-visible:ring-4 focus-visible:ring-primary/25' : ''
      } flex flex-col justify-between`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider line-clamp-1">
          {title}
        </span>
        <div className={`p-2.5 rounded-lg border ${theme.iconBg} shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      <div>
        <div className="flex items-baseline gap-2 mb-1 flex-wrap">
          <span className={`text-2xl sm:text-[28px] font-semibold tracking-tight tabular ${theme.accent}`}>
            {value}
          </span>
          {badge && (
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${
                BADGE_VARIANTS[badge.variant || 'neutral']
              }`}
            >
              {badge.text}
            </span>
          )}
        </div>
        {subtitle && <p className="text-xs text-fg-muted line-clamp-1">{subtitle}</p>}
      </div>
    </div>
  );
}

