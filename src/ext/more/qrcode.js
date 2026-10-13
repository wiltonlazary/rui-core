// A QR Code encoder written from ISO/IEC 18004: the input as one byte-mode
// segment (UTF-8 for text), padded to the data capacity of the smallest
// version that holds it, split into the standard's blocks, each followed by
// its Reed-Solomon codewords over GF(256), interleaved, and walked into the
// symbol beside the function patterns. The mask with the lowest penalty
// (the standard's four rules) is kept unless one is forced.

/** @typedef {'L' | 'M' | 'Q' | 'H'} Level */

/**
 * An encoded symbol.
 * @typedef {object} QrMatrix
 * @property {number} version 1 to 40
 * @property {Level} level
 * @property {number} mask 0 to 7
 * @property {number} size modules per side, 17 + 4 * version
 * @property {Uint8Array} modules size * size, row by row, 1 dark and 0 light
 * @property {Uint8Array} codewords the data and error correction codewords, interleaved, in placement order
 */

// ---------------------------------------------------------------------------
// GF(256) with the field polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D).

/** α^i for i in 0..509 (doubled so a sum of two logarithms needs no modulo). */
const EXP = new Uint8Array(510);
/** log_α(x) for x in 1..255. */
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = EXP[i + 255] = x;
    LOG[x] = i;
    x = x & 0x80 ? ((x << 1) ^ 0x11d) & 0xff : x << 1;
  }
}

/** @param {number} a @param {number} b */
const times = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

/** @type {Map<number, Uint8Array>} */
const generators = new Map();

/**
 * The generator polynomial of `degree` EC codewords, (x - α^0)(x - α^1)…,
 * as its coefficients below the leading 1, highest power first.
 * @param {number} degree
 */
function generator(degree) {
  let g = generators.get(degree);
  if (g) return g;
  // poly[0] is the leading coefficient; multiply by (x + α^k) one factor at a time.
  let poly = [1];
  for (let k = 0; k < degree; k++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let i = 0; i < poly.length; i++) {
      next[i] ^= poly[i];
      next[i + 1] ^= times(poly[i], EXP[k]);
    }
    poly = next;
  }
  g = Uint8Array.from(poly.slice(1));
  generators.set(degree, g);
  return g;
}

/**
 * The error correction codewords of a block: the remainder of
 * data(x) · x^degree divided by the generator polynomial.
 * @param {ArrayLike<number>} data @param {number} degree
 * @returns {Uint8Array}
 */
export function reedSolomon(data, degree) {
  const g = generator(degree);
  const rest = new Uint8Array(degree);
  for (let i = 0; i < data.length; i++) {
    const lead = (data[i] & 0xff) ^ rest[0];
    rest.copyWithin(0, 1);
    rest[degree - 1] = 0;
    if (lead) {
      const l = LOG[lead];
      for (let j = 0; j < degree; j++) if (g[j]) rest[j] ^= EXP[l + LOG[g[j]]];
    }
  }
  return rest;
}

// ---------------------------------------------------------------------------
// The standard's error correction table: per version, for L, M, Q and H,
// [EC codewords per block, blocks in group 1, data codewords each,
//  blocks in group 2, data codewords each].

/** @type {number[][][]} */
const BLOCKS = [
  /*  1 */ [[7, 1, 19], [10, 1, 16], [13, 1, 13], [17, 1, 9]],
  /*  2 */ [[10, 1, 34], [16, 1, 28], [22, 1, 22], [28, 1, 16]],
  /*  3 */ [[15, 1, 55], [26, 1, 44], [18, 2, 17], [22, 2, 13]],
  /*  4 */ [[20, 1, 80], [18, 2, 32], [26, 2, 24], [16, 4, 9]],
  /*  5 */ [[26, 1, 108], [24, 2, 43], [18, 2, 15, 2, 16], [22, 2, 11, 2, 12]],
  /*  6 */ [[18, 2, 68], [16, 4, 27], [24, 4, 19], [28, 4, 15]],
  /*  7 */ [[20, 2, 78], [18, 4, 31], [18, 2, 14, 4, 15], [26, 4, 13, 1, 14]],
  /*  8 */ [[24, 2, 97], [22, 2, 38, 2, 39], [22, 4, 18, 2, 19], [26, 4, 14, 2, 15]],
  /*  9 */ [[30, 2, 116], [22, 3, 36, 2, 37], [20, 4, 16, 4, 17], [24, 4, 12, 4, 13]],
  /* 10 */ [[18, 2, 68, 2, 69], [26, 4, 43, 1, 44], [24, 6, 19, 2, 20], [28, 6, 15, 2, 16]],
  /* 11 */ [[20, 4, 81], [30, 1, 50, 4, 51], [28, 4, 22, 4, 23], [24, 3, 12, 8, 13]],
  /* 12 */ [[24, 2, 92, 2, 93], [22, 6, 36, 2, 37], [26, 4, 20, 6, 21], [28, 7, 14, 4, 15]],
  /* 13 */ [[26, 4, 107], [22, 8, 37, 1, 38], [24, 8, 20, 4, 21], [22, 12, 11, 4, 12]],
  /* 14 */ [[30, 3, 115, 1, 116], [24, 4, 40, 5, 41], [20, 11, 16, 5, 17], [24, 11, 12, 5, 13]],
  /* 15 */ [[22, 5, 87, 1, 88], [24, 5, 41, 5, 42], [30, 5, 24, 7, 25], [24, 11, 12, 7, 13]],
  /* 16 */ [[24, 5, 98, 1, 99], [28, 7, 45, 3, 46], [24, 15, 19, 2, 20], [30, 3, 15, 13, 16]],
  /* 17 */ [[28, 1, 107, 5, 108], [28, 10, 46, 1, 47], [28, 1, 22, 15, 23], [28, 2, 14, 17, 15]],
  /* 18 */ [[30, 5, 120, 1, 121], [26, 9, 43, 4, 44], [28, 17, 22, 1, 23], [28, 2, 14, 19, 15]],
  /* 19 */ [[28, 3, 113, 4, 114], [26, 3, 44, 11, 45], [26, 17, 21, 4, 22], [26, 9, 13, 16, 14]],
  /* 20 */ [[28, 3, 107, 5, 108], [26, 3, 41, 13, 42], [30, 15, 24, 5, 25], [28, 15, 15, 10, 16]],
  /* 21 */ [[28, 4, 116, 4, 117], [26, 17, 42], [28, 17, 22, 6, 23], [30, 19, 16, 6, 17]],
  /* 22 */ [[28, 2, 111, 7, 112], [28, 17, 46], [30, 7, 24, 16, 25], [24, 34, 13]],
  /* 23 */ [[30, 4, 121, 5, 122], [28, 4, 47, 14, 48], [30, 11, 24, 14, 25], [30, 16, 15, 14, 16]],
  /* 24 */ [[30, 6, 117, 4, 118], [28, 6, 45, 14, 46], [30, 11, 24, 16, 25], [30, 30, 16, 2, 17]],
  /* 25 */ [[26, 8, 106, 4, 107], [28, 8, 47, 13, 48], [30, 7, 24, 22, 25], [30, 22, 15, 13, 16]],
  /* 26 */ [[28, 10, 114, 2, 115], [28, 19, 46, 4, 47], [28, 28, 22, 6, 23], [30, 33, 16, 4, 17]],
  /* 27 */ [[30, 8, 122, 4, 123], [28, 22, 45, 3, 46], [30, 8, 23, 26, 24], [30, 12, 15, 28, 16]],
  /* 28 */ [[30, 3, 117, 10, 118], [28, 3, 45, 23, 46], [30, 4, 24, 31, 25], [30, 11, 15, 31, 16]],
  /* 29 */ [[30, 7, 116, 7, 117], [28, 21, 45, 7, 46], [30, 1, 23, 37, 24], [30, 19, 15, 26, 16]],
  /* 30 */ [[30, 5, 115, 10, 116], [28, 19, 47, 10, 48], [30, 15, 24, 25, 25], [30, 23, 15, 25, 16]],
  /* 31 */ [[30, 13, 115, 3, 116], [28, 2, 46, 29, 47], [30, 42, 24, 1, 25], [30, 23, 15, 28, 16]],
  /* 32 */ [[30, 17, 115], [28, 10, 46, 23, 47], [30, 10, 24, 35, 25], [30, 19, 15, 35, 16]],
  /* 33 */ [[30, 17, 115, 1, 116], [28, 14, 46, 21, 47], [30, 29, 24, 19, 25], [30, 11, 15, 46, 16]],
  /* 34 */ [[30, 13, 115, 6, 116], [28, 14, 46, 23, 47], [30, 44, 24, 7, 25], [30, 59, 16, 1, 17]],
  /* 35 */ [[30, 12, 121, 7, 122], [28, 12, 47, 26, 48], [30, 39, 24, 14, 25], [30, 22, 15, 41, 16]],
  /* 36 */ [[30, 6, 121, 14, 122], [28, 6, 47, 34, 48], [30, 46, 24, 10, 25], [30, 2, 15, 64, 16]],
  /* 37 */ [[30, 17, 122, 4, 123], [28, 29, 46, 14, 47], [30, 49, 24, 10, 25], [30, 24, 15, 46, 16]],
  /* 38 */ [[30, 4, 122, 18, 123], [28, 13, 46, 32, 47], [30, 48, 24, 14, 25], [30, 42, 15, 32, 16]],
  /* 39 */ [[30, 20, 117, 4, 118], [28, 40, 47, 7, 48], [30, 43, 24, 22, 25], [30, 10, 15, 67, 16]],
  /* 40 */ [[30, 19, 118, 6, 119], [28, 18, 47, 31, 48], [30, 34, 24, 34, 25], [30, 20, 15, 61, 16]],
];

/** The levels in the table's order, and their two-bit indicators in the format information. */
const LEVELS = /** @type {const} */ (['L', 'M', 'Q', 'H']);
const LEVEL_BITS = [0b01, 0b00, 0b11, 0b10];

/** @param {unknown} level @returns {number} the level's column in BLOCKS */
function levelIndex(level) {
  const at = LEVELS.indexOf(/** @type {any} */ (String(level).toUpperCase()));
  if (at < 0) throw new Error(`RUI: unknown QR error correction level ${String(level)}`);
  return at;
}

/**
 * One version and level's blocks: the EC codewords per block and each
 * block's data codeword count, group 1 first.
 * @param {number} version @param {number} li
 */
function blocksOf(version, li) {
  const [ec, n1, d1, n2 = 0, d2 = 0] = BLOCKS[version - 1][li];
  /** @type {number[]} */
  const sizes = [];
  for (let i = 0; i < n1; i++) sizes.push(d1);
  for (let i = 0; i < n2; i++) sizes.push(d2);
  return { ec, sizes, data: n1 * d1 + n2 * d2 };
}

/** Bits of the byte-mode character count: 8 up to version 9, 16 from 10. @param {number} version */
const countBits = version => (version < 10 ? 8 : 16);

/**
 * The bytes a byte-mode segment holds in a version and level.
 * @param {number} version @param {Level} level
 */
export function byteCapacity(version, level) {
  const { data } = blocksOf(version, levelIndex(level));
  return Math.floor((data * 8 - 4 - countBits(version)) / 8);
}

// ---------------------------------------------------------------------------
// Format and version information: BCH codes.

/**
 * The remainder of `value` · x^(bits of the check) divided by `poly`.
 * @param {number} value @param {number} poly @param {number} checkBits
 */
function bchCheck(value, poly, checkBits) {
  let r = value << checkBits;
  const top = 31 - Math.clz32(poly);
  for (let bit = 31 - Math.clz32(r); bit >= top; bit--) if ((r >>> bit) & 1) r ^= poly << (bit - top);
  return r;
}

/**
 * The 15 format bits of a level and mask: BCH(15,5), then XOR 0x5412.
 * @param {Level} level @param {number} mask
 */
export function formatBits(level, mask) {
  const data = (LEVEL_BITS[levelIndex(level)] << 3) | (mask & 7);
  return ((data << 10) | bchCheck(data, 0x537, 10)) ^ 0x5412;
}

/** The 18 version bits (BCH(18,6)), for versions 7 and up. @param {number} version */
export function versionBits(version) {
  return (version << 12) | bchCheck(version, 0x1f25, 12);
}

/**
 * The alignment pattern centers of a version, per row and per column
 * (Annex E): from 6 to 4·version + 10, with the steps between the later
 * ones even and equal; version 32 is the one whose step the annex sets
 * below that rule (26).
 * @param {number} version
 * @returns {number[]}
 */
export function alignmentPositions(version) {
  if (version < 2) return [];
  const count = Math.floor(version / 7) + 2;
  const last = 4 * version + 10;
  const step = version === 32 ? 26 : 2 * Math.ceil((last - 6) / (count - 1) / 2);
  const out = [6];
  for (let i = count - 2; i >= 0; i--) out.push(last - i * step);
  return out;
}

// ---------------------------------------------------------------------------
// The symbol: function patterns in a reserved plane, then the data walk.

/**
 * A symbol with its function patterns drawn, the format areas reserved
 * (light until a mask is chosen), and version information from version 7.
 * @param {number} version
 */
function frame(version) {
  const size = 17 + 4 * version;
  const dark = new Uint8Array(size * size);
  const fixed = new Uint8Array(size * size);
  /** @param {number} x @param {number} y @param {boolean | number} on */
  const put = (x, y, on) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    dark[y * size + x] = on ? 1 : 0;
    fixed[y * size + x] = 1;
  };
  // Finders with their light separators: rings at distance 0..4 from the center.
  for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        put(ox + dx, oy + dy, ring !== 2 && ring !== 4);
      }
    }
  }
  // Timing: row 6 and column 6 between the finders, dark on even indices.
  for (let i = 8; i < size - 8; i++) {
    put(i, 6, i % 2 === 0);
    put(6, i, i % 2 === 0);
  }
  // Alignment patterns, except the three that would land on a finder.
  const centers = alignmentPositions(version);
  const end = centers.length - 1;
  centers.forEach((cy, j) => {
    centers.forEach((cx, i) => {
      if ((i === 0 && j === 0) || (i === 0 && j === end) || (i === end && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) put(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    });
  });
  // Format areas (both copies, around the timing modules at index 6), then
  // the dark module at (8, 4V + 9).
  for (let i = 0; i <= 8; i++) {
    if (i === 6) continue;
    put(8, i, 0);
    put(i, 8, 0);
  }
  for (let i = 0; i < 8; i++) {
    put(size - 1 - i, 8, 0);
    put(8, size - 1 - i, 0);
  }
  put(8, 4 * version + 9, 1);
  if (version >= 7) {
    const bits = versionBits(version);
    // Bit 3·b + c at column size - 11 + c, row b (left of the upper-right
    // finder), and transposed (above the lower-left finder).
    for (let b = 0; b < 6; b++) {
      for (let c = 0; c < 3; c++) {
        const on = (bits >>> (3 * b + c)) & 1;
        put(size - 11 + c, b, on);
        put(b, size - 11 + c, on);
      }
    }
  }
  return { size, dark, fixed };
}

/**
 * The encoding region in placement order: two-module columns from the
 * right edge, upward then downward in turn, the right module of each pair
 * first, stepping over the vertical timing column.
 * @param {number} size @param {Uint8Array} fixed
 * @returns {number[]} module indices
 */
function walk(size, fixed) {
  /** @type {number[]} */
  const out = [];
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;
    for (let k = 0; k < size; k++) {
      const y = upward ? size - 1 - k : k;
      for (const x of [right, right - 1]) if (!fixed[y * size + x]) out.push(y * size + x);
    }
    upward = !upward;
  }
  return out;
}

/** The eight data mask conditions on row i and column j. @type {((i: number, j: number) => boolean)[]} */
const MASKS = [
  (i, j) => (i + j) % 2 === 0,
  i => i % 2 === 0,
  (_, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => ((i >> 1) + (j % 6 < 3 ? 0 : 1)) % 2 === 0, // ⌊i/2⌋ + ⌊j/3⌋ even
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

/**
 * Writes the 15 format bits into both copies.
 * @param {Uint8Array} dark @param {number} size @param {number} bits
 */
function writeFormat(dark, size, bits) {
  // Copy 1 around the top-left finder: up column 8 (skipping the timing
  // row), then left along row 8 (skipping the timing column).
  const first = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  first.forEach(([x, y], i) => (dark[y * size + x] = (bits >>> i) & 1));
  // Copy 2: bits 0-7 along row 8 from the right edge, 8-14 down column 8 at the bottom.
  for (let i = 0; i < 8; i++) dark[8 * size + size - 1 - i] = (bits >>> i) & 1;
  for (let i = 8; i < 15; i++) dark[(size - 15 + i) * size + 8] = (bits >>> i) & 1;
}

// ---------------------------------------------------------------------------
// The penalty of a masked symbol (the four rules of the standard).

/** The N3 pattern as 11 modules, dark 1: the 1:1:3:1:1 core with four light modules after it, or before it. */
const CORE_THEN_LIGHT = 0b10111010000;
const LIGHT_THEN_CORE = 0b00001011101;

/**
 * N1 and N3 over one line of modules read through `at(k)`: 3 + (run - 5)
 * for each run of five or more of one color, and 40 for each place the
 * 11-module finder-like pattern appears within the symbol.
 * @param {(k: number) => number} at @param {number} size
 */
function linePenalty(at, size) {
  let score = 0;
  let run = 0;
  let window = 0;
  for (let k = 0; k < size; k++) {
    const c = at(k);
    if (k > 0 && c !== at(k - 1)) {
      if (run >= 5) score += 3 + (run - 5);
      run = 0;
    }
    run++;
    window = ((window << 1) | c) & 0x7ff;
    if (k >= 10 && (window === CORE_THEN_LIGHT || window === LIGHT_THEN_CORE)) score += 40;
  }
  if (run >= 5) score += 3 + (run - 5);
  return score;
}

/** @param {Uint8Array} dark @param {number} size */
function penalty(dark, size) {
  let score = 0;
  for (let y = 0; y < size; y++) score += linePenalty(k => dark[y * size + k], size);
  for (let x = 0; x < size; x++) score += linePenalty(k => dark[k * size + x], size);
  // N2: every 2×2 block of one color.
  for (let y = 0; y + 1 < size; y++) {
    for (let x = 0; x + 1 < size; x++) {
      const c = dark[y * size + x];
      if (c === dark[y * size + x + 1] && c === dark[(y + 1) * size + x] && c === dark[(y + 1) * size + x + 1]) score += 3;
    }
  }
  // N4: 10 for each full 5 % step of the dark share away from 50 %.
  let count = 0;
  for (let i = 0; i < dark.length; i++) count += dark[i];
  const total = dark.length;
  score += 10 * Math.floor(Math.abs(count * 20 - total * 10) / total);
  return score;
}

// ---------------------------------------------------------------------------
// The codewords: one byte-mode segment, padded, blocked, corrected, interleaved.

/**
 * The data codewords of `bytes` for a version with `capacity` data codewords.
 * @param {Uint8Array} bytes @param {number} version @param {number} capacity
 */
function dataCodewords(bytes, version, capacity) {
  const out = new Uint8Array(capacity);
  let bit = 0;
  /** @param {number} value @param {number} width */
  const write = (value, width) => {
    for (let i = width - 1; i >= 0; i--, bit++) if ((value >>> i) & 1) out[bit >> 3] |= 0x80 >> (bit & 7);
  };
  write(0b0100, 4);
  write(bytes.length, countBits(version));
  for (const b of bytes) write(b, 8);
  // The terminator (up to four zero bits) and the zero bits up to a byte
  // are already zero; the rest alternates the two pad codewords.
  let at = Math.ceil(Math.min(bit + 4, capacity * 8) / 8);
  for (let pad = 0xec; at < capacity; at++, pad ^= 0xec ^ 0x11) out[at] = pad;
  return out;
}

/**
 * The blocks with their EC codewords, interleaved: the i-th data codeword
 * of every block in turn, then the i-th EC codeword of every block.
 * @param {Uint8Array} data @param {{ ec: number, sizes: number[] }} layout
 */
function interleave(data, { ec, sizes }) {
  /** @type {Uint8Array[]} */
  const blocks = [];
  /** @type {Uint8Array[]} */
  const checks = [];
  let from = 0;
  for (const n of sizes) {
    const block = data.subarray(from, from + n);
    blocks.push(block);
    checks.push(reedSolomon(block, ec));
    from += n;
  }
  const out = new Uint8Array(data.length + ec * sizes.length);
  let k = 0;
  const longest = Math.max(...sizes);
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.length) out[k++] = b[i];
  for (let i = 0; i < ec; i++) for (const c of checks) out[k++] = c[i];
  return out;
}

/**
 * Encodes text (as UTF-8) or bytes into a QR symbol, byte mode.
 * `level` ('M') is case-insensitive; the version is the smallest in
 * `versions` ([min, max], each within 1 to 40: [1, 40]) that holds the
 * data; `mask` forces one, otherwise the lowest penalty wins (the first on
 * a tie); `raise` lifts the level while the chosen version still holds
 * the data.
 * @param {string | ArrayLike<number>} input
 * @param {{ level?: Level, versions?: readonly [number, number], mask?: number, raise?: boolean }} [options]
 * @returns {QrMatrix}
 */
export function encodeQr(input, options = {}) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : Uint8Array.from(input, b => b & 0xff);
  let li = levelIndex(options.level ?? 'M');
  const lo = Math.max(1, Math.floor(options.versions?.[0] ?? 1));
  const hi = Math.min(40, Math.floor(options.versions?.[1] ?? 40));
  let version = 0;
  for (let v = lo; v <= hi; v++) {
    if (bytes.length <= byteCapacity(v, LEVELS[li])) {
      version = v;
      break;
    }
  }
  if (!version) throw new Error(`RUI: ${bytes.length} bytes do not fit a QR code at level ${LEVELS[li]} up to version ${hi}`);
  if (options.raise) while (li < 3 && bytes.length <= byteCapacity(version, LEVELS[li + 1])) li++;
  const level = LEVELS[li];

  const layout = blocksOf(version, li);
  const codewords = interleave(dataCodewords(bytes, version, layout.data), layout);
  const { size, dark, fixed } = frame(version);
  const order = walk(size, fixed);
  // Remainder modules past the last codeword stay light.
  for (let k = 0; k < order.length && k < codewords.length * 8; k++) dark[order[k]] = (codewords[k >> 3] >>> (7 - (k & 7))) & 1;

  /** @param {number} m */
  const masked = m => {
    const out = dark.slice();
    const cond = MASKS[m];
    for (const at of order) if (cond(Math.floor(at / size), at % size)) out[at] ^= 1;
    writeFormat(out, size, formatBits(level, m));
    return out;
  };
  let mask = options.mask;
  let modules;
  if (mask !== undefined && mask !== null) {
    mask = Math.floor(mask) & 7;
    modules = masked(mask);
  } else {
    let best = Infinity;
    for (let m = 0; m < 8; m++) {
      const trial = masked(m);
      const score = penalty(trial, size);
      if (score < best) {
        best = score;
        mask = m;
        modules = trial;
      }
    }
  }
  return { version, level, mask: /** @type {number} */ (mask), size, modules: /** @type {Uint8Array} */ (modules), codewords };
}
