// The placement solver: a table of trigger, panel and options against a
// 400 by 300 viewport, then a Popover flipping and sliding on the DOM and
// on Skia, and a Menu in a DOM root nested in a short frame.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $flush } from 'rrx-core';
import { Root } from 'ren-core';
import { Rui, Clock, manualClock, Button, Menu } from 'rui-core';
import { collide } from '../src/core/overlays/collide.js';
import { onDom } from './harness.jsx';
import { css, styledBy, placeOf, viewport, lend } from './overlay-harness.jsx';

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

  // happy-dom lays nothing out: the page is lent a 480 by 800 viewport, the
  // portal layer's box (the page's, or the nested root's host: a frame 120
  // px high near the page's bottom), the trigger near that bottom and the
  // panel's size. The canvases have no nested root: the tests above are
  // their placement.
  it('a Menu in a nested DOM root opens above inside its short host; at the page root, below', () => {
    /** @param {boolean} nested */
    const sideIn = nested => {
      const clock = manualClock();
      const menu = () => (
        <Clock value={clock}>
          <Rui>
            <Menu offset={8}>
              <Menu.Trigger>
                <Button>Open</Button>
              </Menu.Trigger>
              <Menu.Panel>
                <Menu.Item>Copy</Menu.Item>
              </Menu.Panel>
            </Menu>
          </Rui>
        </Clock>
      );
      const dom = onDom(nested ? () => <Root id="frame">{menu}</Root> : menu, { width: 480, height: 800 });
      // The nested root runs its own graph.
      const flush = () => {
        $flush(dom.root);
        if (nested) $flush(Root('frame'));
      };
      const boxes = lend(dom, { width: 480, height: 800 });
      /** @param {{ x: number, y: number, width: number, height: number }} r */
      const at = r => ({ getBoundingClientRect: () => r });
      const trigger = [...dom.document.querySelectorAll('[data-ren="Action"]')].find(n => n.textContent.trim() === 'Open');
      boxes.set(trigger.parentElement, at({ x: 20, y: 690, width: 80, height: 20 }));
      // Pressed as a browser sends it.
      const w = dom.window;
      const down = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1 };
      trigger.dispatchEvent(new w.PointerEvent('pointerdown', down));
      trigger.dispatchEvent(new w.PointerEvent('pointerup', { ...down, buttons: 0 }));
      trigger.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
      flush();
      clock.advance(200);
      flush();
      const item = [...dom.document.querySelectorAll('[data-ren]')].find(n => n.textContent.trim() === 'Copy' && n.querySelector('[data-ren]') === null);
      // The portal layer: the page's body, or the nested root's host.
      const host = nested ? dom.document.querySelector('[data-ren-root="frame"]') : dom.document.body;
      const room = [...host.children].find(n => {
        const c = css(n);
        return c.position === 'absolute' && c.top === '0px' && c.bottom === '0px' && c['pointer-events'] === 'none';
      });
      if (room !== undefined) boxes.set(room, at(nested ? { x: 0, y: 600, width: 480, height: 120 } : { x: 0, y: 0, width: 480, height: 800 }));
      boxes.set(styledBy(item, 'pointer-events'), at({ x: 0, y: 0, width: 120, height: 60 }));
      dom.document.dispatchEvent(new dom.window.Event('scroll'));
      clock.advance(200);
      flush();
      const place = css(placeOf(item));
      dom.dispose();
      return place.bottom === '100%' ? 'top' : place.top === '100%' ? 'bottom' : 'none';
    };
    assert.equal(sideIn(false), 'bottom', 'room below in the viewport: below at the page root');
    assert.equal(sideIn(true), 'top', 'no room below in its host: above inside it');
  });
});
