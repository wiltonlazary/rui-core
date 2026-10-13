// rui-core/more, drawn goodies: the QR encoder against known values and an
// independent reading of its symbols; QrCode, Led, Spinner, Rings
// and AnalogClock on the DOM and on Skia, the same figures frame by frame on a
// manual clock.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $flush, $signal, $write, $read } from 'rrx-core';
import { $active, Show } from 'ren-core';
import { Rui, Clock as Time, manualClock, themeOf } from 'rui-core';
import { QrCode, Led, Spinner, Rings, AnalogClock, encodeQr, reedSolomon, formatBits, versionBits, byteCapacity, alignmentPositions } from 'rui-core/more';
import { both } from './harness.jsx';
import { primitives } from './more-harness.jsx';

// ---------------------------------------------------------------------------
// An independent reader of a symbol: function patterns from the standard's
// tables, the zigzag, the mask, and the Reed-Solomon syndromes.

/** GF(256) product (x^8 + x^4 + x^3 + x^2 + 1) by logarithms. */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const gmul = (/** @type {number} */ a, /** @type {number} */ b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** The syndromes of a codeword block (all zero when it is a valid RS codeword). @param {number[]} block @param {number} ecc */
function syndromes(block, ecc) {
  const out = [];
  for (let i = 0; i < ecc; i++) {
    let s = 0;
    for (const c of block) s = gmul(s, EXP[i]) ^ c;
    out.push(s);
  }
  return out;
}

/** Alignment centers from ISO 18004's Annex E, for the versions tested. */
const ANNEX_E = /** @type {Record<number, number[]>} */ ({ 1: [], 2: [6, 18], 5: [6, 30], 7: [6, 22, 38], 10: [6, 28, 50], 14: [6, 26, 46, 66], 25: [6, 32, 58, 84, 110], 32: [6, 34, 60, 86, 112, 138], 40: [6, 30, 58, 86, 114, 142, 170] });

/** Reads a symbol back: its format, its unmasked codewords in placement order. @param {ReturnType<typeof encodeQr>} q */
function readBack(q) {
  const s = q.size;
  const v = (s - 17) / 4;
  const fn = new Uint8Array(s * s);
  const mark = (/** @type {number} */ x, /** @type {number} */ y) => x >= 0 && y >= 0 && x < s && y < s && (fn[y * s + x] = 1);
  for (const [cx, cy] of [[0, 0], [s - 8, 0], [0, s - 8]]) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) mark(cx + x, cy + y);
  for (let i = 0; i < s; i++) (mark(6, i), mark(i, 6));
  for (let i = 0; i < 9; i++) (mark(8, i), mark(i, 8));
  for (let i = 0; i < 8; i++) (mark(s - 1 - i, 8), mark(8, s - 1 - i));
  const a = ANNEX_E[v];
  for (const x of a) for (const y of a) {
    if ((x === 6 && y === 6) || (x === 6 && y === a[a.length - 1]) || (x === a[a.length - 1] && y === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(x + dx, y + dy);
  }
  if (v >= 7) for (let i = 0; i < 18; i++) (mark(s - 11 + (i % 3), Math.floor(i / 3)), mark(Math.floor(i / 3), s - 11 + (i % 3)));
  // Format: the first copy, bits 0..14 around the top-left finder.
  let format = 0;
  const bitAt = (/** @type {number} */ x, /** @type {number} */ y) => q.modules[y * s + x];
  const spots = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  spots.forEach(([x, y], i) => (format |= bitAt(x, y) << i));
  const mask = ((format ^ 0x5412) >>> 10) & 7;
  const flip = [
    (/** @type {number} */ x, /** @type {number} */ y) => (x + y) % 2 === 0,
    (/** @type {number} */ x, /** @type {number} */ y) => y % 2 === 0,
    (/** @type {number} */ x) => x % 3 === 0,
    (/** @type {number} */ x, /** @type {number} */ y) => (x + y) % 3 === 0,
    (/** @type {number} */ x, /** @type {number} */ y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
    (/** @type {number} */ x, /** @type {number} */ y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (/** @type {number} */ x, /** @type {number} */ y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (/** @type {number} */ x, /** @type {number} */ y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ][mask];
  /** @type {number[]} */
  const bits = [];
  for (let right = s - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let k = 0; k < s; k++) {
      const up = ((right + 1) & 2) === 0;
      const y = up ? s - 1 - k : k;
      for (const x of [right, right - 1]) if (!fn[y * s + x]) bits.push(bitAt(x, y) ^ (flip(x, y) ? 1 : 0));
    }
  }
  const words = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) words.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0));
  return { format, mask, words };
}

/** De-interleaves codewords into blocks: `groups` of [count, data] and `ecc` per block. @param {number[]} words @param {[number, number][]} groups @param {number} ecc */
function blocksOf(words, groups, ecc) {
  const sizes = groups.flatMap(([n, d]) => Array(n).fill(d));
  const blocks = sizes.map(() => /** @type {number[]} */ ([]));
  let k = 0;
  for (let i = 0; i < Math.max(...sizes); i++) sizes.forEach((d, b) => i < d && blocks[b].push(words[k++]));
  for (let i = 0; i < ecc; i++) blocks.forEach(b => b.push(words[k++]));
  return blocks;
}

describe('QR encoder', () => {
  it('computes Reed-Solomon codewords as the standard example (1-M, HELLO WORLD)', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    assert.deepEqual([...reedSolomon(data, 10)], [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('gives the standard format and version bits', () => {
    const bin = (/** @type {number} */ n, /** @type {number} */ w) => n.toString(2).padStart(w, '0');
    assert.equal(bin(formatBits('L', 0), 15), '111011111000100');
    assert.equal(bin(formatBits('M', 0), 15), '101010000010010');
    assert.equal(bin(formatBits('Q', 0), 15), '011010101011111');
    assert.equal(bin(formatBits('H', 0), 15), '001011010001001');
    assert.equal(bin(formatBits('M', 5), 15), '100000011001110');
    assert.equal(bin(versionBits(7), 18), '000111110010010100');
    assert.equal(bin(versionBits(40), 18), '101000110001101001');
  });

  it('holds the standard byte capacities, and places alignment patterns as Annex E', () => {
    const table = { '1L': 17, '1M': 14, '1Q': 11, '1H': 7, '10M': 213, '25Q': 715, '40L': 2953, '40H': 1273 };
    for (const [key, bytes] of Object.entries(table)) assert.equal(byteCapacity(Number(key.slice(0, -1)), /** @type {any} */ (key.slice(-1))), bytes, key);
    for (const [v, list] of Object.entries(ANNEX_E)) assert.deepEqual(alignmentPositions(Number(v)), list, `version ${v}`);
  });

  it('picks the smallest version for the text and level, and says when it does not fit', () => {
    assert.equal(encodeQr('a'.repeat(17), { level: 'L' }).version, 1);
    assert.equal(encodeQr('a'.repeat(18), { level: 'L' }).version, 2);
    assert.equal(encodeQr('a'.repeat(7), { level: 'H' }).version, 1);
    assert.equal(encodeQr('a'.repeat(8), { level: 'H' }).version, 2);
    assert.equal(encodeQr('é', { level: 'L' }).codewords[1] >> 4, 2, 'UTF-8: two bytes counted');
    assert.throws(() => encodeQr('a'.repeat(2954), { level: 'L' }), /do not fit/);
    assert.throws(() => encodeQr('a', { level: /** @type {any} */ ('X') }), /level/);
  });

  it('writes symbols a reader decodes: the format, the mask, valid RS blocks, the text in byte mode', () => {
    // [text, level, version expected, blocks as [count, data words], ecc per block]
    /** @type {[string, any, number, [number, number][], number][]} */
    const cases = [
      ['HELLO', 'M', 1, [[1, 16]], 10],
      ['https://example.dev', 'M', 2, [[1, 28]], 16],
      ['rui '.repeat(12), 'Q', 5, [[2, 15], [2, 16]], 18],
      ['portable QR '.repeat(9), 'H', 10, [[6, 15], [2, 16]], 28],
    ];
    for (const [text, level, version, groups, ecc] of cases) {
      for (const mask of [undefined, 0, 3, 7]) {
        const q = encodeQr(text, { level, mask });
        assert.equal(q.version, version, text);
        const read = readBack(q);
        assert.equal(read.format, formatBits(level, q.mask), 'format bits');
        assert.equal(read.mask, q.mask);
        if (mask !== undefined) assert.equal(q.mask, mask, 'a forced mask');
        const blocks = blocksOf(read.words, groups, ecc);
        for (const b of blocks) assert.ok(syndromes(b, ecc).every(x => x === 0), `valid RS block (${text.slice(0, 8)}, mask ${q.mask})`);
        const data = blocks.flatMap(b => b.slice(0, b.length - ecc));
        const bytes = new TextEncoder().encode(text);
        const wide = version >= 10;
        assert.equal(data[0] >> 4, 0b0100, 'byte mode');
        const count = wide ? (((data[0] & 15) << 12) | (data[1] << 4) | (data[2] >> 4)) : (((data[0] & 15) << 4) | (data[1] >> 4));
        assert.equal(count, bytes.length);
        const out = [];
        for (let i = 0; i < count; i++) {
          const bit = 4 + (wide ? 16 : 8) + i * 8;
          const at = bit >> 3;
          out.push(((data[at] << 4) | (data[at + 1] >> 4)) & 0xff);
        }
        assert.equal(new TextDecoder().decode(new Uint8Array(out)), text);
      }
    }
  });

  it('draws version information from version 7, and a symbol of 40', () => {
    const q = encodeQr('x'.repeat(2000), { level: 'L' });
    assert.equal(q.size, 17 + 4 * q.version);
    assert.ok(q.version >= 7);
    const bits = versionBits(q.version);
    for (let i = 0; i < 18; i++) {
      const a = q.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      assert.equal(q.modules[b * q.size + a], (bits >>> i) & 1);
      assert.equal(q.modules[a * q.size + b], (bits >>> i) & 1);
    }
    assert.equal(encodeQr('y'.repeat(2953), { level: 'L' }).version, 40);
  });
});

// ---------------------------------------------------------------------------
// On the renderers

/** The figures of every Shape: Skia's items and the DOM's SVG children count. @param {any} dom @param {any} skia */
function figures(dom, skia) {
  $flush(dom.root);
  const skiaList = primitives(skia).filter(i => i.kind === 7).map(i => i.shapes);
  const domCounts = dom.nodes('Shape').map((/** @type {any} */ n) => n.children.length);
  assert.deepEqual(skiaList.map(l => l.length), domCounts, 'the same figures on both');
  return skiaList;
}

describe('drawn goodies on the DOM and on Skia', () => {
  it('QrCode draws its dark modules as rects in whole pixels', () => {
    /** @type {any[]} */
    const seen = [];
    const view = () => (
      <Rui>
        <QrCode value="https://example.dev" level="Q" size={116} onEncode={(/** @type {any} */ q) => seen.push(q)} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    const [list] = figures(dom, skia);
    const q = seen[0];
    let dark = 0;
    for (const m of q.modules) dark += m;
    const area = list.reduce((acc, f) => acc + (f.right - f.x) * (f.bottom - f.y), 0);
    const scale = Math.floor(116 / (q.size + 8));
    assert.equal(area, dark * scale * scale, 'every dark module drawn once');
    assert.equal(list[0].x, 4 * scale, 'after the quiet zone');
    assert.deepEqual(seen.map(x => x.level), ['Q', 'Q'], 'one per root');
    dispose();
  });

  it('QrCode keeps to its `versions` and lifts its level with `raise`', () => {
    /** @type {any[]} */
    const seen = [];
    const view = () => (
      <Rui>
        <QrCode value="rui" level="L" versions={[4, 40]} raise mask={5} onEncode={(/** @type {any} */ q) => seen.push(q)} />
      </Rui>
    );
    const { dispose } = both(view);
    // Three bytes fit every level at version 4; raise lifts L up to H.
    assert.deepEqual(seen.map(q => [q.version, q.level, q.mask]), Array(2).fill([4, 'H', 5]));
    dispose();
  });

  it("Spinner's named sizes are the theme's sizes.loader", () => {
    const theme = themeOf({ sizes: { loader: { lg: 50 } } });
    const view = () => (
      <Rui theme={theme}>
        <Spinner size="lg" />
        <Spinner />
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    $flush(skia.root);
    const sides = primitives(skia).filter(i => i.kind === 7).map(i => i.getBoundingClientRect().width);
    assert.deepEqual(sides, [50, theme.sizes.loader.md]);
    assert.deepEqual(dom.nodes('Shape').map((/** @type {any} */ n) => parseFloat(n.style.width)), sides);
    dispose();
  });

  it("Rings' and AnalogClock's default sides are the theme's sizes.box", () => {
    const theme = themeOf({ sizes: { box: { ring: 90, clock: 150 }, progress: { lg: 8 } } });
    const view = () => (
      <Rui theme={theme}>
        <Rings rings={[{ value: 40, color: 'red' }]} label="ring" />
        <AnalogClock value={0} />
      </Rui>
    );
    const { skia, dispose } = both(view);
    $flush(skia.root);
    const sides = primitives(skia).filter(i => i.kind === 7).map(i => i.getBoundingClientRect().width);
    assert.deepEqual(sides, [90, 150]);
    dispose();
  });

  it('Led lights, dims and pulses on the clock; Spinner turns; Rings draws each ring', () => {
    const clock = manualClock();
    const view = () => (
      <Time value={clock}>
        <Rui>
          <Led value={true} color="teal" label="Online" />
          <Led value={false} label="Offline" />
          <Led animate duration={1000} />
          <Spinner segments={8} speed={800} />
          <Spinner kind="dots" segments={6} />
          <Rings rings={[{ value: 40, color: 'red' }, { value: 70, color: 'green' }, { value: 0, color: 'blue' }]} label="3 rings" />
        </Rui>
      </Time>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), 'Online Offline 3 rings');
    assert.equal(skia.text(), dom.text());
    let [on, off, pulse, spin, dots, rings] = figures(dom, skia);
    assert.equal(on.length, 3, 'halo, lens, highlight');
    assert.equal(on[0].right, 16, 'an unset size is md: 16 px');
    assert.equal(off.length, 2, 'no halo when off');
    assert.equal(spin.filter((/** @type {any} */ f) => f.kind === 'line').length, 8);
    assert.equal(dots.filter((/** @type {any} */ f) => f.kind === 'oval').length, 6);
    // Each ring: its track, and an arc with two caps unless empty.
    assert.equal(rings.length, 3 + 2 * 3);
    assert.deepEqual([rings[0].x, rings[0].right, rings[0].stroke], [5, 107, 10], 'the outer track: 112 across, 10 thick');
    const lead = (/** @type {any[]} */ l) => l.findIndex(f => f.color.length === 7 || f.color.endsWith('ff'));
    const before = lead(spin);
    // The lens: the one before the highlight (the halo comes and goes).
    const lens = (/** @type {any[]} */ l) => l[l.length - 2].color;
    const glow = lens(pulse);
    assert.equal(pulse.length, 3, 'lit: its halo shows');
    clock.advance(500);
    [on, off, pulse, spin] = figures(dom, skia);
    assert.notEqual(lens(pulse), glow, 'the pulse dims half a period on');
    assert.equal(pulse.length, 2, 'dark: no halo');
    assert.notEqual(lead(spin), before, 'the lead spoke moved');
    assert.deepEqual(figures(dom, skia)[2], pulse);
    dispose();
  });

  it('AnalogClock shows its start time and runs on the clock, per root', () => {
    const clock = manualClock();
    const start = Date.UTC(2026, 0, 1, 3, 0, 0);
    /** @type {number[]} */
    const ticks = [];
    const view = () => (
      <Time value={clock}>
        <Rui>
          <AnalogClock defaultValue={start} utc size={200} onChange={(/** @type {number} */ t) => ticks.push(t)} />
        </Rui>
      </Time>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), '12 1 2 3 4 5 6 7 8 9 10 11');
    assert.equal(skia.text(), dom.text());
    const hands = (/** @type {any[]} */ l) => l.slice(-4, -1);
    let [face] = figures(dom, skia);
    const [hour, minute, second] = hands(face);
    // 3:00:00 — the hour hand to the right, the minute and second hands up.
    assert.ok(hour.right > 100 + 40 && Math.abs(hour.bottom - 100) < 1, 'hour at 3');
    assert.ok(Math.abs(minute.right - 100) < 1 && minute.bottom < 50, 'minute at 12');
    assert.ok(Math.abs(second.right - 100) < 1, 'second at 12');
    clock.advance(15000);
    [face] = figures(dom, skia);
    const [, , s15] = hands(face);
    assert.ok(s15.right > 170 && Math.abs(s15.bottom - 100) < 1, `second at 15 s: ${s15.right}, ${s15.bottom}`);
    assert.equal(ticks[ticks.length - 1], start + 15000);
    assert.equal(ticks.filter(t => t === start + 15000).length, 2, 'each root ticks');
    dispose();
  });

  it('AnalogClock follows running: stops where it is, goes on from there, and starts when built stopped', () => {
    const clock = manualClock();
    const start = Date.UTC(2026, 0, 1, 3, 0, 0);
    /** @type {any[]} */
    const runs = [];
    /** @type {number[]} */
    const a = [];
    /** @type {number[]} */
    const b = [];
    const view = () => {
      const on = $signal($active(), true);
      const off = $signal($active(), false);
      runs.push([on, off]);
      return (
        <Time value={clock}>
          <Rui>
            <AnalogClock defaultValue={start} utc running={on} onChange={(/** @type {number} */ t) => a.push(t)} />
            <AnalogClock defaultValue={start} utc running={off} onChange={(/** @type {number} */ t) => b.push(t)} />
          </Rui>
        </Time>
      );
    };
    const { dom, skia, dispose } = both(view);
    const set = (/** @type {0 | 1} */ which, /** @type {boolean} */ v) => {
      for (const r of runs) $write(r[which], v);
      $flush(dom.root);
      $flush(skia.root);
    };
    const last = (/** @type {number[]} */ l) => l[l.length - 1] - start;
    clock.advance(3000);
    assert.equal(last(a), 3000, 'on: it runs');
    assert.equal(b.length, 0, 'built stopped: it stands');
    set(0, false);
    clock.advance(5000);
    assert.equal(last(a), 3000, 'off: it stops where it is');
    set(0, true);
    clock.advance(2000);
    assert.equal(last(a), 5000, 'on again: it goes on from where it stopped');
    set(1, true);
    clock.advance(4000);
    assert.equal(last(b), 4000, 'the one built stopped starts from its start');
    assert.equal(last(a), 9000);
    dispose();
  });

  it('AnalogClock removed by its own onChange leaves no frame loop behind', () => {
    const clock = manualClock();
    let calls = 0;
    const view = () => {
      const show = $signal($active(), true);
      return (
        <Time value={clock}>
          <Rui>
            <Show when={() => $read(show)}>
              <AnalogClock
                defaultValue={0}
                utc
                onChange={(/** @type {number} */ t) => {
                  calls++;
                  if (t >= 2000) $write(show, false);
                }}
              />
            </Show>
          </Rui>
        </Time>
      );
    };
    const { dispose } = both(view);
    clock.advance(3000);
    const at = calls;
    clock.advance(5000);
    assert.equal(clock.pending(), 0, 'no frame loop left');
    assert.equal(calls, at, 'and no second passes after it went');
    dispose();
  });

  it('AnalogClock shows a controlled value and does not run', () => {
    const clock = manualClock();
    const view = () => (
      <Time value={clock}>
        <Rui>
          <AnalogClock value={Date.UTC(2026, 0, 1, 6, 30, 0)} utc numerals={false} seconds={false} size={100} />
        </Rui>
      </Time>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), '');
    const [face] = figures(dom, skia);
    const minute = face[face.length - 2];
    assert.ok(Math.abs(minute.right - 50) < 1 && minute.bottom > 80, 'minute at 30');
    assert.equal(clock.pending(), 0, 'no frames asked for');
    dispose();
  });
});
