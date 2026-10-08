"use client";

import React, { useState } from 'react';

export interface DonutSegment {
  id?: string;
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  title?: string;
  subtitle?: string;
  data: DonutSegment[];
  centerLabel?: string;
  centerSub?: string;
  emptyMessage?: string;
}

export function DonutChart({
  title,
  subtitle,
  data,
  centerLabel,
  centerSub,
  emptyMessage = 'No distribution data available.',
}: DonutChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const total = data.reduce((acc, d) => acc + d.value, 0);

  if (!data || data.length === 0 || total === 0) {
    return (
      <div className="bg-surface rounded-xl p-6 border border-line shadow-xs">
        {title && <h4 className="text-base font-semibold text-fg mb-1">{title}</h4>}
        {subtitle && <p className="text-xs text-fg-muted mb-4">{subtitle}</p>}
        <div className="py-10 text-center text-fg-subtle text-xs font-medium">
          {emptyMessage}
        </div>
      </div>
    );
  }

  // Calculate SVG stroke-dasharray arcs
  // Radius = 60, circumference = 2 * PI * 60 ≈ 376.99
  const radius = 60;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;

  let cumulativeOffset = 0;
  const segments = data.map((item, idx) => {
    const fraction = item.value / total;
    const strokeDash = fraction * circumference;
    const offset = cumulativeOffset;
    cumulativeOffset += strokeDash;
    const percentage = Math.round(fraction * 100);

    return {
      ...item,
      percentage,
      strokeDash,
      offset,
    };
  });

  return (
    <div className="bg-surface rounded-xl p-6 border border-line shadow-xs flex flex-col justify-between">
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h4 className="text-base font-semibold text-fg">{title}</h4>}
          {subtitle && <p className="text-xs text-fg-muted mt-0.5">{subtitle}</p>}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-center gap-6 my-auto py-2">
        {/* SVG Donut */}
        <div className="relative w-40 h-40 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
            {/* Background ring */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="transparent"
              style={{ stroke: 'var(--chart-track)' }}
              strokeWidth={strokeWidth}
            />

            {/* Segment arcs */}
            {segments.map((seg, idx) => {
              const isHovered = hoveredIdx === idx;
              return (
                <circle
                  key={seg.id || seg.label || idx}
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="transparent"
                  strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={`${seg.strokeDash} ${circumference - seg.strokeDash}`}
                  strokeDashoffset={-seg.offset}
                  className="transition-all duration-300 cursor-pointer"
                  style={{
                    stroke: seg.color,
                    opacity: hoveredIdx !== null && !isHovered ? 0.5 : 1,
                  }}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              );
            })}
          </svg>

          {/* Centered Stat Label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none p-2">
            <span className="text-xl sm:text-2xl font-semibold text-fg leading-none">
              {hoveredIdx !== null
                ? segments[hoveredIdx].value.toLocaleString()
                : centerLabel ?? total.toLocaleString()}
            </span>
            <span className="text-xs font-semibold text-fg-subtle uppercase tracking-wider mt-1 truncate max-w-[90px]">
              {hoveredIdx !== null ? segments[hoveredIdx].label : centerSub ?? 'Total'}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-2.5 w-full sm:w-auto min-w-[150px]">
          {segments.map((seg, idx) => {
            const isHovered = hoveredIdx === idx;
            return (
              <div
                key={seg.id || seg.label || idx}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className={`flex items-center justify-between gap-3 text-xs p-1.5 rounded-lg transition-colors cursor-default ${
                  isHovered ? 'bg-surface-2 font-semibold' : ''
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="text-fg truncate">{seg.label}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-semibold text-fg">{seg.value.toLocaleString()}</span>
                  <span className="text-xs text-fg-subtle font-medium">({seg.percentage}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

