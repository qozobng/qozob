"use client";

import React from 'react';
import { Star } from 'lucide-react';

interface RatingDistributionProps {
  averageRating: number;
  totalVotes: number;
  distribution?: { [stars: number]: number }; // e.g. { 5: 42, 4: 18, 3: 5, 2: 2, 1: 1 }
  title?: string;
  subtitle?: string;
}

export function RatingDistribution({
  averageRating,
  totalVotes,
  distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  title = "Pump accuracy",
  subtitle = "Ratings from drivers who bought fuel here",
}: RatingDistributionProps) {
  const safeAvg = Math.max(0, Math.min(5, Number(averageRating) || 0));
  const stars = [5, 4, 3, 2, 1];

  return (
    <div className="bg-surface rounded-xl p-6 border border-line shadow-xs flex flex-col justify-between">
      <div>
        <h4 className="text-base font-semibold text-fg">{title}</h4>
        <p className="text-xs text-fg-muted mt-0.5 mb-5">{subtitle}</p>

        <div className="flex items-center gap-6 pb-4 border-b border-line mb-4">
          <div className="text-center">
            <span className="text-4xl font-semibold tabular text-fg block leading-none">
              {safeAvg.toFixed(1)}
            </span>
            <div className="flex items-center justify-center gap-0.5 text-star mt-1.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-3.5 h-3.5 ${
                    s <= Math.round(safeAvg) ? 'fill-star text-star' : 'text-line-strong'
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-fg-subtle font-semibold uppercase tracking-wider mt-1 block">
              {totalVotes.toLocaleString()} {totalVotes === 1 ? 'vote' : 'votes'}
            </span>
          </div>

          <div className="flex-1 flex flex-col gap-1.5">
            {stars.map((s) => {
              const count = distribution[s] || 0;
              const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
              return (
                <div key={s} className="flex items-center gap-2 text-xs">
                  <span className="w-4 font-semibold text-fg-muted text-right">{s}★</span>
                  <div className="flex-1 bg-surface-2 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        s >= 4 ? 'bg-success' : s === 3 ? 'bg-warning' : 'bg-danger'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="w-8 text-xs text-fg-subtle text-right">{percent}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className={`rounded-lg p-3 border flex items-center justify-between text-xs ${
        totalVotes === 0 ? 'bg-surface-2 border-line text-fg-muted'
          : safeAvg >= 4.0 ? 'bg-success-soft border-success-line text-on-success-soft'
          : safeAvg >= 3.0 ? 'bg-warning-soft border-warning-line text-on-warning-soft'
          : 'bg-danger-soft border-danger-line text-on-danger-soft'
      }`}>
        <span className="font-medium">Overall</span>
        <span className="font-semibold">
          {totalVotes === 0 ? 'No ratings yet' : safeAvg >= 4.0 ? 'Accurate' : safeAvg >= 3.0 ? 'Fair' : 'Needs attention'}
        </span>
      </div>
    </div>
  );
}

