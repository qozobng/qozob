"use client";

import React, { useState, useId } from 'react';

export interface AreaDataPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

interface AreaChartProps {
  title?: string;
  subtitle?: string;
  data: AreaDataPoint[];
  valuePrefix?: string;
  valueSuffix?: string;
  color?: string;
  averageLine?: boolean;
  emptyMessage?: string;
}

export function AreaChart({
  title,
  subtitle,
  data,
  valuePrefix = '',
  valueSuffix = '',
  color = 'var(--chart-pos)',
  averageLine = true,
  emptyMessage = 'No trend data recorded yet.',
}: AreaChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const gradientId = `area-grad-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  if (!data || data.length === 0) {
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

  const values = data.map(d => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = Math.max(maxVal - minVal, 1);
  const average = Math.round(values.reduce((a, b) => a + b, 0) / values.length);

  // SVG dimensions
  const width = 500;
  const height = 180;
  const paddingX = 30;
  const paddingY = 24;
  const chartW = width - paddingX * 2;
  const chartH = height - paddingY * 2;

  // Calculate coordinates for each point
  const points = data.map((d, i) => {
    const x = paddingX + (i / Math.max(data.length - 1, 1)) * chartW;
    const y = paddingY + chartH - ((d.value - minVal) / range) * chartH;
    return { x, y, ...d };
  });

  // Build SVG path
  const pathD = points.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x} ${pt.y}`;
    const prev = points[i - 1];
    const cX1 = prev.x + (pt.x - prev.x) / 2;
    const cY1 = prev.y;
    const cX2 = prev.x + (pt.x - prev.x) / 2;
    const cY2 = pt.y;
    return `${acc} C ${cX1} ${cY1}, ${cX2} ${cY2}, ${pt.x} ${pt.y}`;
  }, '');

  // Fill area under path
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;

  // Average line Y
  const avgY = paddingY + chartH - ((average - minVal) / range) * chartH;

  return (
    <div className="bg-surface rounded-xl p-6 border border-line shadow-xs flex flex-col justify-between">
      {(title || subtitle) && (
        <div className="flex items-start justify-between mb-4">
          <div>
            {title && <h4 className="text-base font-semibold text-fg">{title}</h4>}
            {subtitle && <p className="text-xs text-fg-muted mt-0.5">{subtitle}</p>}
          </div>
          {averageLine && (
            <div className="text-right">
              <span className="text-xs uppercase tracking-wider font-semibold text-fg-subtle">Average</span>
              <p className="text-sm font-semibold text-fg">
                {valuePrefix}{average.toLocaleString()}{valueSuffix}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="relative w-full overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.22 }} />
              <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line
            x1={paddingX}
            y1={paddingY}
            x2={width - paddingX}
            y2={paddingY}
            style={{ stroke: 'var(--chart-track)' }}
            strokeDasharray="4 4"
          />
          <line
            x1={paddingX}
            y1={height - paddingY}
            x2={width - paddingX}
            y2={height - paddingY}
            style={{ stroke: 'var(--line)' }}
          />

          {/* Average benchmark line */}
          {averageLine && (
            <line
              x1={paddingX}
              y1={avgY}
              x2={width - paddingX}
              y2={avgY}
              style={{ stroke: 'var(--chart-neutral)' }}
              strokeDasharray="3 3"
              strokeWidth="1.5"
            />
          )}

          {/* Shaded Area */}
          <path d={areaD} fill={`url(#${gradientId})`} />

          {/* Main Trend Line */}
          <path d={pathD} fill="none" style={{ stroke: color }} strokeWidth="2.5" strokeLinecap="round" />

          {/* Interactive Data Points */}
          {points.map((pt, i) => {
            const isHovered = hoveredIdx === i;
            return (
              <g key={i}>
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 6 : 3.5}
                  style={{ fill: 'var(--surface)', stroke: color }}
                  strokeWidth={isHovered ? 3 : 2}
                  className="transition-all duration-200 cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip */}
        {hoveredIdx !== null && (
          <div
            className="absolute bg-brand text-on-brand text-xs font-semibold py-1 px-2.5 rounded-lg shadow-lg pointer-events-none -translate-x-1/2 -translate-y-full"
            style={{
              left: `${(points[hoveredIdx].x / width) * 100}%`,
              top: `${(points[hoveredIdx].y / height) * 100 - 8}%`,
            }}
          >
            <span>{points[hoveredIdx].label}: </span>
            <span className="text-brand-accent">
              {valuePrefix}{points[hoveredIdx].value.toLocaleString()}{valueSuffix}
            </span>
          </div>
        )}
      </div>

      {/* X-Axis Labels */}
      <div className="flex justify-between items-center text-xs font-semibold text-fg-subtle mt-2 px-2">
        <span>{data[0]?.label}</span>
        {data.length > 2 && <span>{data[Math.floor(data.length / 2)]?.label}</span>}
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

