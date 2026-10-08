"use client";

import React, { useState, memo } from 'react';
import Image from 'next/image';
import { getStationBrandInfo } from '@/lib/brands';

interface BrandLogoProps {
  name: string;
  customLogoUrl?: string | null;
  /** Rendered pixel size (square). Used by next/image to serve a right-sized file. */
  size: number;
  imgClassName?: string;
  textClassName?: string;
}

/**
 * Station logo with automatic initials fallback.
 * - Local brand logos go through next/image, so a 160KB PNG is served as a ~3KB WebP/AVIF at marker size.
 * - Custom (Supabase-hosted) logos are rendered unoptimised to avoid needing remotePatterns config.
 * - If an image fails to load (e.g. missing file), we fall back to coloured initials via React state
 *   instead of mutating the DOM.
 */
function BrandLogoBase({ name, customLogoUrl, size, imgClassName = "", textClassName = "" }: BrandLogoProps) {
  const { logoUrl, color, text } = getStationBrandInfo(name, customLogoUrl);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (logoUrl && failedSrc !== logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        unoptimized={!logoUrl.startsWith('/')}
        className={`w-full h-full object-contain ${imgClassName}`}
        onError={() => setFailedSrc(logoUrl)}
      />
    );
  }

  return (
    <div className="w-full h-full rounded-full flex items-center justify-center" style={{ backgroundColor: color }}>
      <span className={`text-white font-bold tracking-tight leading-none ${textClassName || 'text-xs'}`}>{text}</span>
    </div>
  );
}

export const BrandLogo = memo(BrandLogoBase);

