"use client";

import React, { useState } from 'react';

export interface BarItem {
  id?: string;
  label: string;
  value: number;
  formattedValue?: string;
  color?: string;
  secondaryLabel?: string;
}

interface BarChartProps {
  title?: string;
  subtitle?: string;
  data: BarItem[];
  layout?: 'horizontal' | 'vertical';
  height?: number;
  valuePrefix?: string;
  valueSuffix?: string;
  emptyMessage?: string;
}

export function BarChart({
  title,
  subtitle,
  data,
  layout = 'horizontal',
  valuePrefix = '',
  valueSuffix = '',
  emptyMessage = 'No data available to display.',
}: BarChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
        {title && <h4 className="text-base font-black text-indigo-950 mb-1">{title}</h4>}
        {subtitle && <p className="text-xs text-slate-500 mb-4">{subtitle}</p>}
        <div className="py-10 text-center text-slate-400 text-xs font-medium">
          {emptyMessage}
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between">
      {(title || subtitle) && (
        <div className="mb-5">
          {title && <h4 className="text-base font-black text-indigo-950">{title}</h4>}
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      )}

      {layout === 'horizontal' ? (
        <div className="flex flex-col gap-3.5">
          {data.map((item, idx) => {
            const percentage = Math.max(4, Math.round((item.value / maxValue) * 100));
            const isHovered = hoveredIdx === idx;
            const barColor = item.color || '#312e81';

            return (
              <div
                key={item.id || item.label || idx}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="group cursor-default"
              >
                <div className="flex justify-between items-baseline text-xs mb-1">
                  <div className="flex items-center gap-1.5 truncate max-w-[70%]">
                    <span className="font-bold text-slate-700 truncate">{item.label}</span>
                    {item.secondaryLabel && (
                      <span className="text-[10px] text-slate-400 font-normal">
                        ({item.secondaryLabel})
                      </span>
                    )}
                  </div>
                  <span className="font-black text-slate-900 shrink-0">
                    {item.formattedValue ?? `${valuePrefix}${item.value.toLocaleString()}${valueSuffix}`}
                  </span>
                </div>

                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden relative">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: barColor,
                      opacity: hoveredIdx !== null && !isHovered ? 0.6 : 1,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Vertical Column layout */
        <div className="flex items-end justify-between gap-2 h-48 pt-6 pb-2 px-1">
          {data.map((item, idx) => {
            const heightPercent = Math.max(8, Math.round((item.value / maxValue) * 100));
            const isHovered = hoveredIdx === idx;
            const barColor = item.color || '#312e81';

            return (
              <div
                key={item.id || item.label || idx}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="flex-1 flex flex-col items-center h-full justify-end group cursor-default relative"
              >
                {/* Floating tooltip on hover */}
                {isHovered && (
                  <div className="absolute -top-7 bg-indigo-950 text-white text-[10px] font-bold py-1 px-2 rounded-md shadow-md whitespace-nowrap z-10 pointer-events-none">
                    {item.formattedValue ?? `${valuePrefix}${item.value.toLocaleString()}${valueSuffix}`}
                  </div>
                )}

                <div className="w-full max-w-[36px] bg-slate-100 rounded-t-lg h-full flex items-end overflow-hidden">
                  <div
                    className="w-full rounded-t-lg transition-all duration-500 ease-out"
                    style={{
                      height: `${heightPercent}%`,
                      backgroundColor: barColor,
                      opacity: hoveredIdx !== null && !isHovered ? 0.6 : 1,
                    }}
                  />
                </div>
                <span className="text-[10px] font-bold text-slate-500 mt-2 truncate w-full text-center">
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

