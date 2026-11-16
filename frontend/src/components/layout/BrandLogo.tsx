'use client';

import React from 'react';

/** The Smart Reply logo (icon + wordmark) used in the side rail and the sign-in pages. */
export default function BrandLogo({ idSuffix = '' }: { idSuffix?: string }) {
  return (
  <div className="logo" aria-label="Smart Reply by LUMI AI">
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`lgB${idSuffix}`} x1="4" y1="6" x2="44" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00A8E8" />
          <stop offset=".55" stopColor="#1B6FC4" />
          <stop offset="1" stopColor="#2E3192" />
        </linearGradient>
        <linearGradient id={`lgP${idSuffix}`} x1="12" y1="12" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#E6287A" />
          <stop offset="1" stopColor="#8E3FA0" />
        </linearGradient>
      </defs>
      <path
        d="M24 4.5c10.8 0 19.5 8.3 19.5 18.8S34.8 42 24 42c-2.9 0-5.7-.6-8.2-1.7L6 43.5l3-8.3A18.4 18.4 0 0 1 4.5 23.3C4.5 12.8 13.2 4.5 24 4.5z"
        stroke={`url(#lgB${idSuffix})`}
        strokeWidth="3.6"
        strokeLinejoin="round"
      />
      <path
        d="M24 34V15.5M24 25l-6-6v-2.6M24 28l6-6v-3.4M18 32v-4l-3.6-3.6M30 32v-3.5l3.6-3.6"
        stroke={`url(#lgP${idSuffix})`}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g stroke={`url(#lgP${idSuffix})`} strokeWidth="1.8" fill="#fff">
        <circle cx="24" cy="13.4" r="2.1" />
        <circle cx="18" cy="14.3" r="2.1" />
        <circle cx="30" cy="16.5" r="2.1" />
        <circle cx="13" cy="23" r="2.1" />
        <circle cx="35" cy="23.5" r="2.1" />
      </g>
    </svg>
    <div>
      <b>Smart<em>Reply</em></b>
      <span>by <i>LUMI</i> <u>AI</u></span>
    </div>
  </div>
  );
}
