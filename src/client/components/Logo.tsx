import React from 'react';
import { LOGO_SIZE, logoLayers } from '../../shared/logo.ts';

const LAYERS = logoLayers();

/**
 * The pixel-art mascot as SVG. One path per colour keeps it free of hairline seams at any
 * size, including the fractional scales phones use.
 */
export const Logo: React.FC<{ size?: number; className?: string; title?: string }> = ({ size = 28, className = '', title = 'Smith' }) => (
  <svg width={size} height={size} viewBox={`0 0 ${LOGO_SIZE} ${LOGO_SIZE}`} className={`flex-shrink-0 ${className}`} role="img" aria-label={title}>
    {LAYERS.map(layer => (
      <path key={layer.symbol} fill={layer.color} d={layer.d} />
    ))}
  </svg>
);
