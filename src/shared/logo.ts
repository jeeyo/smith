/**
 * Smith's mascot: a 24×24 pixel-art agent in a dark suit, narrow sunglasses and an earpiece,
 * on a mint tile. The one source for the in-app logo, the favicon and the app icons
 * (`npm run icons` regenerates the image files from it).
 */

export const LOGO_SIZE = 24;

export const LOGO_PALETTE: Record<string, string> = {
  B: '#C3E9D2', // tile (mint-200)
  H: '#2F2D2A', // hair
  h: '#57534B', // hair shine
  S: '#F6D7C3', // skin
  s: '#E8B99F', // skin shade
  n: '#E2AE93', // nose
  G: '#1F1E1C', // sunglasses
  g: '#7CC9A0', // a green glint in the lenses
  E: '#7D786F', // earpiece
  e: '#A29D93', // earpiece wire
  M: '#B9806B', // mouth
  K: '#3A3833', // suit
  k: '#57534B', // lapels
  W: '#FFFFFF', // shirt
  T: '#1F1E1C' // tie
};

/** The tile colour, painted first under everything else. */
export const LOGO_BACKGROUND = 'B';

// "." is transparent: it rounds the tile's corners.
export const LOGO_PIXELS: string[] = [
  '...BBBBBBBBBBBBBBBBBB...',
  '.BBBBBBBBBBBBBBBBBBBBBB.',
  'BBBBBBBBBBBBBBBBBBBBBBBB',
  'BBBBBBBHHHHHHHHHHBBBBBBB',
  'BBBBBBHHHHHHHHHHHHBBBBBB',
  'BBBBBHHHhhhHHHHHHHHBBBBB',
  'BBBBBHHHHHHHHHHHHHHBBBBB',
  'BBBBBHHSSSSSSSSSSHHBBBBB',
  'BBBBBHSSSSSSSSSSSSHBBBBB',
  'BBBBBBSGGGGGGGGGGSBBBBBB',
  'BBBBBSSGgGGSSGgGGSSBBBBB',
  'BBBBBESGGGGSSGGGGSSBBBBB',
  'BBBBBESSSSSnnSSSSSSBBBBB',
  'BBBBBeSSSSSSSSSSSSBBBBBB',
  'BBBBBeSSSSMMMMSSSSBBBBBB',
  'BBBBBeBsSSSSSSSSsBBBBBBB',
  'BBBBBeBBBssssssBBBBBBBBB',
  'BBBKKKKKKWWTTWWKKKKKKBBB',
  'BBKKKKKKKkWTTWkKKKKKKKBB',
  'BKKKKKKKKkkTTkkKKKKKKKKB',
  'BKKKKKKKKKkTTkKKKKKKKKKB',
  'BKKKKKKKKKKTTKKKKKKKKKKB',
  '.KKKKKKKKKKKKKKKKKKKKKK.',
  '...KKKKKKKKKKKKKKKKKK...'
];

export interface LogoLayer {
  /** The pixel symbol this layer draws; unique, unlike colours, which two symbols may share. */
  symbol: string;
  color: string;
  /** SVG path data: every pixel of this colour, as one shape. */
  d: string;
}

/**
 * The logo as one path per colour, in paint order.
 *
 * Drawing every pixel as its own rect leaves hairline seams when the logo is scaled by a
 * non-integer factor, which is the normal case on phones (device pixel ratios of 2.625, 3 and
 * so on): each rect is anti-aliased on its own, and the edges between neighbours never add up
 * to full coverage. Here, all pixels of one colour form a single path, so the rasteriser fills
 * them as one shape with no interior edges. The tile is painted first as one solid shape under
 * everything, and the other colours overlap their right and bottom neighbours by a hair, so no
 * gap can open between two colours either.
 */
export function logoLayers(
  pixels: string[] = LOGO_PIXELS,
  palette: Record<string, string> = LOGO_PALETTE,
  background: string = LOGO_BACKGROUND,
  overlap: number = 0.04
): LogoLayer[] {
  const parts = new Map<string, string[]>();
  const add = (ch: string, x: number, y: number, w: number, grow: number) => {
    if (!parts.has(ch)) parts.set(ch, []);
    parts.get(ch)!.push(`M${x} ${y}h${+(w + grow).toFixed(3)}v${+(1 + grow).toFixed(3)}h${-(w + grow).toFixed(3)}z`);
  };

  pixels.forEach((row, y) => {
    // The tile: every non-transparent pixel, so nothing above it can reveal the page behind.
    let x = 0;
    while (x < row.length) {
      if (row[x] === '.') {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < row.length && row[end] !== '.') end++;
      add(background, x, y, end - x, 0);
      x = end;
    }
    // Everything else, one horizontal run at a time.
    x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      if (ch !== '.' && ch !== background && palette[ch]) {
        const touchesEdge = end === row.length || y === pixels.length - 1;
        add(ch, x, y, end - x, touchesEdge ? 0 : overlap);
      }
      x = end;
    }
  });

  const order = [background, ...Object.keys(palette).filter(ch => ch !== background)];
  return order.filter(ch => parts.has(ch)).map(ch => ({ symbol: ch, color: palette[ch], d: parts.get(ch)!.join('') }));
}

export function logoSvg(sizePx: number = 256): string {
  const paths = logoLayers()
    .map(layer => `<path fill="${layer.color}" d="${layer.d}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 ${LOGO_SIZE} ${LOGO_SIZE}">${paths}</svg>\n`;
}
