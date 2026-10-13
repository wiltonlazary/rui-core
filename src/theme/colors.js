// The default palette: 13 hues in color-wheel order (red to magenta), then
// two neutrals (gray, and night for the dark scheme), ten shades each from
// lightest (0) to darkest (9). Every hue is drawn in OKLCH on one lightness
// curve and one chroma curve, each shade gamut-mapped to sRGB by lowering
// its chroma, so the same shade reads alike across hues: white text on
// shade 6 passes WCAG AA for every hue. Also the small color arithmetic the
// variants need. Colors stay CSS hex strings: the portable style reads them
// on every renderer, and `#rrggbbaa` carries an alpha.

/** @typedef {readonly [string, string, string, string, string, string, string, string, string, string]} Tuple */

/** @type {Record<string, Tuple>} */
export const BASE_COLORS = {
  red: ['#fff4f3', '#fee2df', '#fec6c0', '#ffa098', '#f07b74', '#d75954', '#b63636', '#992728', '#7a1b1d', '#590f11'],
  orange: ['#fef5f0', '#fee3d6', '#ffc8ad', '#fda578', '#eb844b', '#d2631a', '#a94a00', '#8b3c00', '#6e2e01', '#4f1f00'],
  amber: ['#fff5ea', '#fde5c9', '#f9cd98', '#edb161', '#da921f', '#b87808', '#915e04', '#774c03', '#5e3b01', '#432900'],
  yellow: ['#faf7ea', '#f3eac8', '#e7d695', '#d6bd5c', '#c0a10b', '#a08601', '#7e6903', '#675503', '#514302', '#392e02'],
  lime: ['#f3f9ed', '#e1f0d0', '#c6e1a5', '#a7cd77', '#89b448', '#6b990c', '#537801', '#436202', '#344d01', '#233601'],
  green: ['#effaf0', '#d5f3da', '#aee6b9', '#83d494', '#56bc71', '#22a150', '#05803a', '#03692e', '#005322', '#013a16'],
  teal: ['#ebfbf7', '#cbf4e9', '#96e9d6', '#55d7be', '#05bda3', '#079e88', '#087c6a', '#066557', '#025044', '#02382f'],
  cyan: ['#eafbfd', '#c8f3f9', '#90e6f3', '#46d3e6', '#10b7ca', '#0a99a9', '#067885', '#01626d', '#004d56', '#02363c'],
  blue: ['#f1f8ff', '#dbebfe', '#b8d9ff', '#8dc2fe', '#59a7fa', '#2f8ae4', '#006bc1', '#00579f', '#02447e', '#002f5b'],
  indigo: ['#f4f7fe', '#e2e9fe', '#c8d4fe', '#a7baff', '#849bfd', '#677ee7', '#4b5ec8', '#3c4ba9', '#2d3a88', '#1e2763'],
  violet: ['#f7f5fe', '#eae6fe', '#d8ceff', '#c1b0fe', '#a98ff4', '#8f70dd', '#7251be', '#5e3fa0', '#4a3081', '#34205e'],
  purple: ['#fcf3ff', '#f7e1fe', '#eec5fb', '#dea5f0', '#c884dd', '#af64c5', '#9044a7', '#78348b', '#5f266f', '#441950'],
  magenta: ['#fff3f8', '#ffe0ee', '#fec1df', '#f79dcb', '#e47bb3', '#ca5998', '#aa377b', '#8e2865', '#721d50', '#521138'],
  gray: ['#f2f7fe', '#e4eaf2', '#d1d6de', '#b9bec6', '#9ea4ab', '#83888f', '#666b71', '#52575d', '#3f444a', '#2b2f35'],
  night: ['#ccd1dc', '#adb1bc', '#888c96', '#686c75', '#4c5059', '#393d46', '#2a2e36', '#1f232b', '#161921', '#0d1018'],
};

/**
 * The red, green and blue of a hex color (`#rgb`, `#rrggbb`, with or
 * without alpha); null for anything else.
 * @param {string} hex
 * @returns {[number, number, number, number] | null} r, g, b (0 to 255) and alpha (0 to 1)
 */
export function channels(hex) {
  if (typeof hex !== 'string' || hex[0] !== '#') return null;
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
  // Hex digits only: parseInt alone would read '#ff00zz' as '#ff00'.
  if ((h.length !== 6 && h.length !== 8) || !/^[0-9a-f]+$/i.test(h)) return null;
  const n = parseInt(h, 16);
  const a = h.length === 8 ? (n & 0xff) / 255 : 1;
  const rgb = h.length === 8 ? n >>> 8 : n;
  return [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff, a];
}

/** Two hex digits. @param {number} v 0 to 255 */
const hex2 = v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');

/**
 * A color with an alpha (0 to 1), as `#rrggbbaa`. Any existing alpha is
 * multiplied.
 * @param {string} color @param {number} alpha
 */
export function alpha(color, alpha) {
  const c = channels(color);
  if (c === null) return color;
  return `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}${hex2(c[3] * alpha * 255)}`;
}

/**
 * Mixes a color toward black (a positive amount) or white (a negative one),
 * 0 to 1.
 * @param {string} color @param {number} amount
 */
export function shade(color, amount) {
  const c = channels(color);
  if (c === null) return color;
  const to = amount >= 0 ? 0 : 255;
  const k = Math.abs(amount);
  const mix = (/** @type {number} */ v) => v + (to - v) * k;
  const a = c[3] === 1 ? '' : hex2(c[3] * 255);
  return `#${hex2(mix(c[0]))}${hex2(mix(c[1]))}${hex2(mix(c[2]))}${a}`;
}

/**
 * The relative luminance of a color (WCAG), 0 (black) to 1 (white).
 * @param {string} color
 */
export function luminance(color) {
  const c = channels(color);
  if (c === null) return 0;
  const lin = (/** @type {number} */ v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

/**
 * Whether text on `color` reads best in black (a light background): its
 * luminance past `threshold` (the theme's `contrastThreshold`, 0.179: where
 * black and white text have equal contrast).
 * @param {string} color @param {number} [threshold]
 */
export const isLight = (color, threshold = 0.179) => luminance(color) > threshold;
