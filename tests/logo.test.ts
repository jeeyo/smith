import { describe, it, expect } from 'vitest';
import { LOGO_BACKGROUND, LOGO_PALETTE, LOGO_PIXELS, LOGO_SIZE, logoLayers, logoSvg } from '../src/shared/logo.ts';

describe('logo', () => {
  it('is a square grid that only uses colours from its palette', () => {
    expect(LOGO_PIXELS).toHaveLength(LOGO_SIZE);
    for (const row of LOGO_PIXELS) {
      expect(row).toHaveLength(LOGO_SIZE);
      for (const ch of row) expect(ch === '.' || ch in LOGO_PALETTE).toBe(true);
    }
  });

  it('paints the tile first, under every pixel, with one path per colour', () => {
    const layers = logoLayers();
    expect(layers[0].color).toBe(LOGO_PALETTE[LOGO_BACKGROUND]);
    expect(new Set(layers.map(l => l.symbol)).size).toBe(layers.length);
    const opaque = LOGO_PIXELS.join('').replace(/\./g, '').length;
    const tileArea = layers[0].d.match(/h(\d+(?:\.\d+)?)/g)!.reduce((sum, h) => sum + Number(h.slice(1)), 0);
    expect(tileArea).toBe(opaque);
  });

  it('never draws past the edge of the grid', () => {
    for (const { d } of logoLayers()) {
      for (const [, x, y, w, h] of d.matchAll(/M(\d+) (\d+)h([\d.]+)v([\d.]+)/g)) {
        expect(Number(x) + Number(w)).toBeLessThanOrEqual(LOGO_SIZE + 1e-9);
        expect(Number(y) + Number(h)).toBeLessThanOrEqual(LOGO_SIZE + 1e-9);
      }
    }
    expect(logoSvg(64)).toContain(`viewBox="0 0 ${LOGO_SIZE} ${LOGO_SIZE}"`);
  });
});
