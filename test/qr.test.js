// rui-core/more, the QR encoder: known-good symbols by digest (every mask
// forced, and the mask the penalty picks), and a round trip through a small
// reader of its own (format from the second copy, the unmasked walk, the
// blocks' syndromes, the byte segment back).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { encodeQr, byteCapacity } from 'rui-core/more';

const vectors = JSON.parse(readFileSync(new URL('./qr.vectors.json', import.meta.url), 'utf8'));

/** @param {Uint8Array} bytes */
const digest = bytes => createHash('sha256').update(Buffer.from(bytes)).digest('hex').slice(0, 32);

/** @param {string | { repeat: string, times: number }} text */
const textOf = text => (typeof text === 'string' ? text : text.repeat.repeat(text.times));

describe('QR encoder, known-good symbols', () => {
  for (const d of vectors.digests) {
    const text = textOf(d.text);
    it(`${JSON.stringify(text).slice(0, 24)} at ${d.level}`, () => {
      const q = encodeQr(text, { level: d.level });
      assert.equal(q.version, d.version, 'version');
      assert.equal(q.size, 17 + 4 * d.version);
      assert.equal(digest(q.codewords), d.codewords, 'codewords');
      assert.equal(q.mask, d.mask, 'the mask the penalty picks');
      assert.equal(digest(q.modules), d.modules, 'modules');
      d.masks.forEach((/** @type {string} */ want, /** @type {number} */ mask) => assert.equal(digest(encodeQr(text, { level: d.level, mask }).modules), want, `mask ${mask} forced`));
    });
  }

  it('draws the whole symbol of "rui" at M, mask 2', () => {
    const f = vectors.full;
    const q = encodeQr(f.text, { level: f.level, mask: f.mask });
    const rows = [];
    for (let y = 0; y < q.size; y++) rows.push(Array.from(q.modules.subarray(y * q.size, (y + 1) * q.size), m => (m ? '#' : '.')).join(''));
    assert.deepEqual(rows, f.rows);
  });
});

// ---------------------------------------------------------------------------
// A reader written for this test.

const FIELD = { exp: new Uint8Array(512), log: new Uint8Array(256) };
for (let i = 0, x = 1; i < 255; i++, x = (x << 1) ^ (x & 0x80 ? 0x11d : 0)) {
  FIELD.exp[i] = FIELD.exp[i + 255] = x;
  FIELD.log[x] = i;
}
/** @param {number} a @param {number} b */
const mul = (a, b) => (a && b ? FIELD.exp[FIELD.log[a] + FIELD.log[b]] : 0);

/** Horner at α^i for i < ecc: zero for every i when the block is a codeword. @param {number[]} block @param {number} ecc */
const syndromesZero = (block, ecc) => {
  for (let i = 0; i < ecc; i++) {
    let s = 0;
    for (const c of block) s = mul(s, FIELD.exp[i]) ^ c;
    if (s) return false;
  }
  return true;
};

/** The standard's BCH codeword of `data` over `poly` with `check` bits. @param {number} data @param {number} poly @param {number} check */
function bch(data, poly, check) {
  let r = data << check;
  const deg = poly.toString(2).length - 1;
  while (r.toString(2).length - 1 >= deg) r ^= poly << (r.toString(2).length - 1 - deg);
  return (data << check) | r;
}

/** @param {number} a @param {number} b */
const distance = (a, b) => (a ^ b).toString(2).replace(/0/g, '').length;

/** Annex E, for the versions read here. */
const CENTERS = /** @type {Record<number, number[]>} */ ({ 1: [], 3: [6, 22], 5: [6, 30], 7: [6, 22, 38], 8: [6, 24, 42], 14: [6, 26, 46, 66], 27: [6, 34, 62, 90, 118] });

/** The standard's blocks for those versions: EC per block and [blocks, data codewords] groups. */
const LAYOUT = /** @type {Record<string, [number, [number, number][]]>} */ ({
  '1L': [7, [[1, 19]]],
  '1H': [17, [[1, 9]]],
  '3Q': [18, [[2, 17]]],
  '5H': [22, [[2, 11], [2, 12]]],
  '7M': [18, [[4, 31]]],
  '8Q': [22, [[4, 18], [2, 19]]],
  '14H': [24, [[11, 12], [5, 13]]],
  '27L': [30, [[8, 122], [4, 123]]],
});

/** Reads a symbol back to its level, mask, version and bytes, checking each block. @param {{ size: number, modules: Uint8Array }} q */
function decode(q) {
  const n = q.size;
  const version = (n - 17) / 4;
  const get = (/** @type {number} */ row, /** @type {number} */ col) => q.modules[row * n + col];
  // Format information from its second copy, the nearest of the 32 codewords.
  let raw = 0;
  for (let i = 0; i < 8; i++) raw |= get(8, n - 1 - i) << i;
  for (let i = 8; i < 15; i++) raw |= get(n - 15 + i, 8) << i;
  let info = 0;
  for (let d = 1; d < 32; d++) if (distance(bch(d, 0x537, 10) ^ 0x5412, raw) < distance(bch(info, 0x537, 10) ^ 0x5412, raw)) info = d;
  const level = /** @type {const} */ (['M', 'L', 'H', 'Q'])[info >> 3];
  const mask = info & 7;
  // Version information from its lower-left copy.
  if (version >= 7) {
    let vbits = 0;
    for (let i = 0; i < 18; i++) vbits |= get(n - 11 + (i % 3), Math.floor(i / 3)) << i;
    assert.equal(vbits, bch(version, 0x1f25, 12), 'version information');
  }
  // What the data walk steps over.
  const reserved = Array.from({ length: n }, () => new Array(n).fill(false));
  const box = (/** @type {number} */ r0, /** @type {number} */ c0, /** @type {number} */ h, /** @type {number} */ w) => {
    for (let r = Math.max(0, r0); r < Math.min(n, r0 + h); r++) for (let c = Math.max(0, c0); c < Math.min(n, c0 + w); c++) reserved[r][c] = true;
  };
  box(0, 0, 9, 9);
  box(0, n - 8, 9, 8);
  box(n - 8, 0, 8, 9);
  box(6, 0, 1, n);
  box(0, 6, n, 1);
  const centers = CENTERS[version];
  const nearFinder = (/** @type {number} */ r, /** @type {number} */ c) => (r < 9 && (c < 9 || c >= n - 8)) || (r >= n - 8 && c < 9);
  for (const r of centers) for (const c of centers) if (!nearFinder(r, c)) box(r - 2, c - 2, 5, 5);
  if (version >= 7) {
    box(0, n - 11, 6, 3);
    box(n - 11, 0, 3, 6);
  }
  const flip = [
    (/** @type {number} */ r, /** @type {number} */ c) => (r + c) % 2 === 0,
    (/** @type {number} */ r) => r % 2 === 0,
    (/** @type {number} */ _, /** @type {number} */ c) => c % 3 === 0,
    (/** @type {number} */ r, /** @type {number} */ c) => (r + c) % 3 === 0,
    (/** @type {number} */ r, /** @type {number} */ c) => ((r >> 1) + Math.floor(c / 3)) % 2 === 0,
    (/** @type {number} */ r, /** @type {number} */ c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (/** @type {number} */ r, /** @type {number} */ c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (/** @type {number} */ r, /** @type {number} */ c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ][mask];
  /** @type {number[]} */
  const bits = [];
  let pair = 0;
  for (let col = n - 1; col > 0; col -= 2, pair++) {
    if (col === 6) col--;
    for (let step = 0; step < n; step++) {
      const row = pair % 2 === 0 ? n - 1 - step : step;
      for (const c of [col, col - 1]) if (!reserved[row][c]) bits.push(get(row, c) ^ (flip(row, c) ? 1 : 0));
    }
  }
  const words = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) words.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  // De-interleave and check each block.
  const [ecc, groups] = LAYOUT[`${version}${level}`];
  const sizes = groups.flatMap(([count, data]) => new Array(count).fill(data));
  const total = sizes.reduce((a, b) => a + b, 0) + ecc * sizes.length;
  assert.ok(words.length === total, `the walk holds ${total} codewords`);
  assert.ok(bits.length - total * 8 < 8, 'fewer than 8 remainder bits');
  const blocks = sizes.map(() => /** @type {number[]} */ ([]));
  let k = 0;
  for (let i = 0; i < Math.max(...sizes); i++) blocks.forEach((b, j) => i < sizes[j] && b.push(words[k++]));
  for (let i = 0; i < ecc; i++) blocks.forEach(b => b.push(words[k++]));
  blocks.forEach((b, j) => assert.ok(syndromesZero(b, ecc), `block ${j} is a Reed-Solomon codeword`));
  // The segment: mode, count, bytes, terminator, pad codewords.
  const stream = blocks.flatMap(b => b.slice(0, b.length - ecc)).map(w => w.toString(2).padStart(8, '0')).join('');
  let at = 0;
  const take = (/** @type {number} */ w) => parseInt(stream.slice(at, (at += w)), 2);
  assert.equal(take(4), 0b0100, 'byte mode');
  const count = take(version < 10 ? 8 : 16);
  const bytes = Uint8Array.from({ length: count }, () => take(8));
  const rest = stream.slice(at);
  const terminator = Math.min(4, rest.length);
  assert.equal(rest.slice(0, terminator), '0'.repeat(terminator), 'terminator');
  const padFrom = Math.ceil((at + terminator) / 8);
  const dataWords = stream.length / 8;
  for (let i = padFrom; i < dataWords; i++) assert.equal(parseInt(stream.slice(i * 8, i * 8 + 8), 2), (i - padFrom) % 2 ? 0x11 : 0xec, 'pad codewords');
  return { version, level, mask, bytes };
}

describe('QR encoder, read back by an independent reader', () => {
  /** @type {[string | Uint8Array, 'L' | 'M' | 'Q' | 'H', number][]} */
  const cases = [
    ['', 'L', 1],
    ['QR', 'L', 1],
    ['ren draws once, reads anywhere', 'Q', 3],
    ['héllo wörld ', 'H', 5],
    ['rui '.repeat(25), 'M', 7],
    [Uint8Array.from({ length: 80 }, (_, i) => (i * 37) & 0xff), 'Q', 8],
    ['0123456789abcdef'.repeat(12), 'H', 14],
    ['a symbol with many blocks — '.repeat(40), 'L', 27],
  ];
  for (const [input, level, version] of cases) {
    it(`${typeof input === 'string' ? JSON.stringify(input.slice(0, 16)) : 'bytes'} at ${version}-${level}`, () => {
      const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
      assert.ok(bytes.length <= byteCapacity(version, level));
      for (const mask of [undefined, 0, 1, 2, 3, 4, 5, 6, 7]) {
        const q = encodeQr(input, { level, versions: [version, version], mask });
        const out = decode(q);
        assert.equal(out.version, version);
        assert.equal(out.level, level);
        assert.equal(out.mask, q.mask);
        if (mask !== undefined) assert.equal(q.mask, mask);
        assert.deepEqual([...out.bytes], [...bytes]);
      }
    });
  }

  it('takes levels in any case, raises the level with raise, and keeps to the versions', () => {
    assert.equal(encodeQr('hi', { level: /** @type {any} */ ('q') }).level, 'Q');
    const raised = encodeQr('hi', { level: 'L', raise: true });
    assert.equal(raised.version, 1);
    assert.equal(raised.level, 'H', 'two bytes fit 1-H');
    assert.equal(decode(raised).level, 'H');
    const text = 'a'.repeat(12);
    assert.equal(encodeQr(text, { level: 'L', raise: true }).level, 'M', '12 bytes fit 1-M, not 1-Q');
    assert.equal(encodeQr(text, { level: 'L' }).level, 'L');
    assert.throws(() => encodeQr('a'.repeat(15), { level: 'Q', versions: [1, 1] }), /^Error: RUI: .*do not fit/);
    assert.throws(() => encodeQr('a', { level: /** @type {any} */ ('Z') }), /^Error: RUI: .*level/);
    assert.equal(encodeQr('a', { versions: [3, 40] }).version, 3);
  });
});
