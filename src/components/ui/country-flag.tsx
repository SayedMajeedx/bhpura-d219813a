import React, { useState } from "react";

interface CountryFlagProps {
  code: string;
  className?: string;
  alt?: string;
}

/**
 * World-Class Country Flag Component
 * Avoids Windows Segoe UI Emoji degradation (where flag emojis render as raw letters like "BH", "SA").
 * Provides zero-latency inline SVG for primary domestic market (Bahrain) and CDN vector SVGs for all other nations.
 */
export function CountryFlag({
  code,
  className = "w-5 h-3.5 object-cover rounded-xs border border-border-subtle shadow-xs inline-block shrink-0",
  alt,
}: CountryFlagProps) {
  const upper = (code || "").trim().toUpperCase();
  const lower = (code || "").trim().toLowerCase();
  const [hasError, setHasError] = useState(false);

  if (!upper) return null;

  // 1. Kingdom of Bahrain (Zero-latency official vector SVG)
  if (upper === "BH") {
    return (
      <svg
        viewBox="0 0 500 300"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
        aria-label={alt || "Bahrain Flag"}
      >
        <rect width="500" height="300" fill="#ce1126" />
        <path
          fill="#ffffff"
          d="M 0,0 L 140,0 L 200,30 L 140,60 L 200,90 L 140,120 L 200,150 L 140,180 L 200,210 L 140,240 L 200,270 L 140,300 L 0,300 Z"
        />
      </svg>
    );
  }

  // 2. Fallback if CDN image fails
  if (hasError) {
    return (
      <span
        className={`inline-flex items-center justify-center font-mono font-bold text-xs bg-muted text-muted-foreground uppercase px-1 rounded border border-border ${className}`}
        title={alt || upper}
      >
        {upper}
      </span>
    );
  }

  // 3. Vector SVG from FlagCDN
  return (
    <img
      src={`https://flagcdn.com/${lower}.svg`}
      alt={alt || upper}
      loading="lazy"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}
