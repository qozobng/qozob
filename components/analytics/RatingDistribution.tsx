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
  title = "Pump Integrity & Calibration",
  subtitle = "Community verified meter accuracy ratings",
}: RatingDistributionProps) {
  const safeAvg = Math.max(0, Math.min(5, Number(averageRating) || 0));
  const stars = [5, 4, 3, 2, 1];

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between">
      <div>
        <h4 className="text-base font-black text-indigo-950">{title}</h4>
        <p className="text-xs text-slate-500 mt-0.5 mb-5">{subtitle}</p>

        <div className="flex items-center gap-6 pb-4 border-b border-slate-100 mb-4">
          <div className="text-center">
            <span className="text-4xl font-black text-indigo-950 block leading-none">
              {safeAvg.toFixed(1)}
            </span>
            <div className="flex items-center justify-center gap-0.5 text-amber-400 mt-1.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-3.5 h-3.5 ${
                    s <= Math.round(safeAvg) ? 'fill-amber-400 text-amber-400' : 'text-slate-200 fill-slate-200'
                  }`}
                />
              ))}
            </div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1 block">
              {totalVotes.toLocaleString()} {totalVotes === 1 ? 'vote' : 'votes'}
            </span>
          </div>

          <div className="flex-1 flex flex-col gap-1.5">
            {stars.map((s) => {
              const count = distribution[s] || 0;
              const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
              return (
                <div key={s} className="flex items-center gap-2 text-xs">
                  <span className="w-4 font-bold text-slate-500 text-right">{s}★</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        s >= 4 ? 'bg-emerald-500' : s === 3 ? 'bg-amber-400' : 'bg-rose-400'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="w-8 text-[11px] text-slate-400 text-right">{percent}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100 flex items-center justify-between text-xs text-emerald-800">
        <span className="font-bold">Trust Benchmark</span>
        <span className="font-extrabold">
          {safeAvg >= 4.0 ? 'High Accuracy (Trusted)' : safeAvg >= 3.0 ? 'Fair Accuracy' : 'Calibration Warning'}
        </span>
      </div>
    </div>
  );
}

