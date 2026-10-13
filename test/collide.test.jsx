// The placement solver: a table of trigger, panel and options against a
// 400 by 300 viewport, then a Popover flipping and sliding on the DOM and
// on Skia.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collide } from '../src/core/overlays/collide.js';
import { css, styledBy, placeOf, viewport } from './overlay-harness.jsx';

const screen = { x: 0, y: 0, width: 400, height: 300 };

/**
 * One solve against the screen, 8 px off the trigger and 8 px clear.
 * @param {{ x: number, y?: number, width: number, height?: number }} t @param {{ width: number, height: number }} panel @param {Record<string, any>} [o]
 */
const solve = (t, panel, o) => collide({ y: 100, height: 30, ...t }, panel, screen, /** @type {any} */ ({ side: 'bottom', align: 'start', offset: 8, clear: 8, ...o }));

/** @type {[string, any, any, Record<string, any>, Record<string, number | string>][]} */
const cases = [
  ['stays on the asked side when it fits', { x: 100, y: 50, width: 80 }, { width: 120, height: 60 }, {}, { side: 'bottom', shift: 0, length: 120, center: 40 }],
  ['flips when only the opposite side fits', { x: 100, y: 240, width: 80 }, { width: 120, height: 60 }, {}, { side: 'top', shift: 0 }],
  ['neither fits: the roomier side', { x: 100, y: 120, width: 80, height: 100 }, { width: 120, height: 150 }, {}, { side: 'top' }],
  ['neither fits, a tie: the asked side', { x: 100, y: 100, width: 80, height: 100 }, { width: 120, height: 150 }, {}, { side: 'bottom' }],
  ['flip: false keeps the asked side', { x: 100, y: 240, width: 80 }, { width: 120, height: 60 }, { flip: false }, { side: 'bottom' }],
  ['right flips left, its cross axis vertical', { x: 300, width: 40 }, { width: 80, height: 50 }, { side: 'right' }, { side: 'left', shift: 0, length: 50, center: 15 }],
  ['left stays left, sliding down off the top', { x: 200, y: 0, width: 40, height: 20 }, { width: 80, height: 50 }, { side: 'left', align: 'center' }, { side: 'left', shift: 23, center: 2 }],
  ['start alignment, no overflow', { x: 150, width: 100 }, { width: 60, height: 40 }, { align: 'start' }, { shift: 0, center: 50 }],
  ['center alignment, no overflow', { x: 150, width: 100 }, { width: 60, height: 40 }, { align: 'center' }, { shift: 0, center: 30 }],
  ['end alignment, no overflow', { x: 150, width: 100 }, { width: 60, height: 40 }, { align: 'end' }, { shift: 0, center: 10 }],
  ['slides back inside the band at the start', { x: 10, width: 40 }, { width: 100, height: 40 }, { align: 'center' }, { shift: 28, center: 22 }],
  ['slides back inside the band at the end', { x: 350, width: 40 }, { width: 100, height: 40 }, { align: 'center' }, { shift: -28, center: 78 }],
  ['longer than the band: its start at the clear edge', { x: 150, width: 100 }, { width: 390, height: 40 }, { align: 'center' }, { shift: 3, length: 390 }],
  ['as wide as a trigger inside the band: no move', { x: 100, width: 120 }, { width: 120, height: 40 }, { align: 'center' }, { shift: 0, center: 60 }],
  ['a trigger past the start edge: stops at half facing', { x: -30, width: 40 }, { width: 100, height: 40 }, {}, { shift: 20, center: 0 }],
  ['a trigger past the end edge: stops at half facing', { x: 390, width: 40 }, { width: 100, height: 40 }, { align: 'end' }, { shift: -20, center: 100 }],
  ['slide: false stays aligned', { x: 10, width: 40 }, { width: 100, height: 40 }, { align: 'center', slide: false }, { shift: 0, center: 50 }],
  ['less than a pixel over is ignored', { x: 7.4, width: 40 }, { width: 60, height: 40 }, {}, { shift: 0 }],
  ['a pixel and more over slides', { x: 6.4, width: 40 }, { width: 60, height: 40 }, {}, { shift: 2 }],
  ["the trigger's middle off the panel: the nearest point of the overlap", { x: 0, width: 300 }, { width: 60, height: 40 }, {}, { shift: 8, center: 60 }],
];

describe('collide', () => {
  for (const [name, t, panel, o, want] of cases)
    it(name, () => {
      const fit = solve(t, panel, o);
      for (const [key, value] of Object.entries(want)) assert.equal(/** @type {any} */ (fit)[key], value, `${key} of ${JSON.stringify(fit)}`);
    });

  it('answers whole px, the aim inside the panel', () => {
    for (const [, t, panel, o] of cases) {
      const fit = solve(t, panel, o);
      for (const key of /** @type {const} */ (['shift', 'center', 'length'])) assert.ok(Number.isInteger(fit[key]), `${key} of ${JSON.stringify(fit)}`);
      assert.ok(fit.center >= 0 && fit.center <= fit.length, JSON.stringify(fit));
    }
    const odd = collide({ x: 33.3, y: 10.7, width: 41.1, height: 20 }, { width: 77.7, height: 33.3 }, screen, { side: 'bottom', align: 'center', offset: 8, clear: 8 });
    assert.ok(Number.isInteger(odd.shift) && Number.isInteger(odd.center) && Number.isInteger(odd.length));
  });
});

describe('collide on the DOM and on Skia', () => {
  it('a Popover low in the page opens above; flip: false keeps it below', () => {
    {
      const { d, drop, trigger, dispose } = viewport({ at: 'bottom-start' }, [300, 0, 0, 20]);
      assert.ok(drop().y + drop().height <= trigger().y, 'above its trigger on Skia');
      assert.equal(css(placeOf(d.find('Drop'))).bottom, '100%', 'above on the DOM');
      dispose();
    }
    {
      const { d, drop, trigger, dispose } = viewport({ at: 'bottom-start', collision: { flip: false } }, [300, 0, 0, 20]);
      assert.ok(drop().y >= trigger().y + trigger().height, 'below its trigger on Skia');
      assert.equal(css(placeOf(d.find('Drop'))).top, '100%', 'below on the DOM');
      dispose();
    }
  });

  it('a wide panel near the right edge ends clear of it; slide: false passes the edge', () => {
    {
      const { d, drop, trigger, dispose } = viewport({ at: 'bottom-start' }, [20, 0, 0, 380], 200);
      assert.equal(Math.round(drop().x + drop().width), 480 - 8, 'spacing.xs from the edge on Skia');
      const shift = Math.round(drop().x - trigger().x);
      assert.ok(shift < 0);
      assert.equal(css(styledBy(d.find('Drop'), 'pointer-events')).left, `${shift}px`, 'the same slide on the DOM');
      dispose();
    }
    {
      const { d, drop, dispose } = viewport({ at: 'bottom-start', collision: { slide: false } }, [20, 0, 0, 380], 200);
      assert.ok(drop().x + drop().width > 480, 'past the edge on Skia');
      assert.equal(css(styledBy(d.find('Drop'), 'pointer-events')).left, undefined, 'not slid on the DOM');
      dispose();
    }
  });
});
