// Every component that measures its own box, where a caller's padding and
// border land, reads that box as the uninset one moved in by the insets:
// a press maps onto what it draws, and what it lays out or draws sits in
// its content box. Each case runs plain, with `p` and with a border; a
// component that measures a box its caller styles belongs here.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $flush, $signal, $read, $write } from 'rrx-core';
import { View, Action, $active } from 'ren-core';
import { Rui, Clock, manualClock, Text, Button, Rating, HueSlider, AlphaSlider, Panes, Collapse, OverflowList, Glider, Menu } from 'rui-core';
import { LineChart, BarChart, ScatterChart, BubbleChart, RadialBarChart, RadarChart, PieChart, FunnelChart, Heatmap, Sparkline } from 'rui-core/charts';
import { Compare, ContextMenu, Onboarding } from 'rui-core/more';
import { both, onDom } from './harness.jsx';
import { primitives, drag, mirror, action } from './more-harness.jsx';

/** The insets tried, and each one's size on every side. */
const INSETS = /** @type {[Record<string, any>, number, number][]} */ ([
  // [props, padding, border]
  [{}, 0, 0],
  [{ p: 20 }, 20, 0],
  [{ style: { border: 10 } }, 0, 10],
]);

/** Presses and lets go at a point on Skia. @param {any} skia @param {number} x @param {number} y */
const tap = (skia, x, y) => {
  skia.skia.press(x, y);
  skia.skia.release(x, y);
  $flush(skia.root);
};

/** A Skia item by its aria-label or label. @param {any} skia @param {string} name */
const named = (skia, name) => primitives(skia).find((/** @type {any} */ i) => i.other?.get?.('aria-label') === name || i.label === name);

/** Whether `n` is `root` or inside it. @param {any} root @param {any} n */
const inside = (root, n) => {
  for (let m = n; m != null; m = m.parent) if (m === root) return true;
  return false;
};

describe('a caller\'s padding and border move a measured box in, no more', () => {
  it('pointer: a press maps onto what is drawn (Rating, HueSlider, AlphaSlider, Compare, ContextMenu)', () => {
    for (const [extra, pad, border] of INSETS) {
      const inset = pad + border;
      const tag = JSON.stringify(extra);
      // Rating: its stars fill its content box; just past 60% across is the fourth star (the box with its insets would say the third).
      {
        /** @type {number[]} */
        const got = [];
        const { skia, dispose } = both(() => (
          <Rui>
            <Rating {...extra} onChange={(/** @type {number} */ v) => got.push(v)} />
          </Rui>
        ));
        skia.text();
        const r = named(skia, 'Rating').getBoundingClientRect();
        tap(skia, r.left + inset + (r.width - 2 * inset) * 0.605, r.top + r.height / 2);
        assert.equal(got.at(-1), 4, `Rating ${tag}`);
        dispose();
      }
      // Hue and alpha: the ramp fills the padding box (inside the border); a quarter across is a quarter of the range.
      for (const [Slider, name, quarter] of /** @type {[any, string, number][]} */ ([[HueSlider, 'Hue', 90], [AlphaSlider, 'Alpha', 0.25]])) {
        /** @type {number[]} */
        const got = [];
        const { skia, dispose } = both(() => (
          <Rui>
            <View style={{ width: 300 }}>
              <Slider {...extra} onChange={(/** @type {number} */ v) => got.push(v)} />
            </View>
          </Rui>
        ));
        skia.text();
        // The slider's box: its thumb's parent.
        const r = named(skia, name).parent.getBoundingClientRect();
        tap(skia, r.left + border + (r.width - 2 * border) / 4, r.top + r.height / 2);
        assert.equal(got.at(-1), quarter, `${name}Slider ${tag}`);
        dispose();
      }
      // Compare: its sections sit inside its border; a quarter across is 25.
      {
        /** @type {number[]} */
        const got = [];
        const { dom, skia, dispose } = both(
          () => (
            <Rui>
              <Compare w={400} h={200} {...extra} before={<Text>Before</Text>} after={<Text>After</Text>} onChange={(/** @type {number} */ v) => got.push(v)} />
            </Rui>
          ),
          { width: 480, height: 300 },
        );
        mirror(dom, skia);
        drag(dom, skia, [[border + (400 - 2 * border) / 4, 100]]);
        assert.equal(Math.round(got.at(-1) ?? NaN), 25, `Compare ${tag}`);
        dispose();
      }
      // ContextMenu: its trigger sits where the pointer pressed.
      {
        const clock = manualClock();
        const { dom, skia, dispose } = both(() => (
          <Clock value={clock}>
            <Rui>
              <ContextMenu style={{ width: 300, height: 200, ...(extra.style ?? null) }} p={extra.p} menu={[<Menu.Item onPress={() => {}}>Copy</Menu.Item>]}>
                <Text>Here</Text>
              </ContextMenu>
            </Rui>
          </Clock>
        ));
        skia.text();
        drag(dom, skia, [[120, 80]], { button: 2 });
        clock.advance(200);
        skia.text();
        const t = primitives(skia)
          .find((/** @type {any} */ i) => {
            const b = i.getBoundingClientRect();
            return b.width === 1 && b.height === 1;
          })
          .getBoundingClientRect();
        assert.deepEqual([Math.round(t.left), Math.round(t.top)], [120, 80], `ContextMenu ${tag}`);
        dispose();
      }
    }
  });

  it('layout: what is measured sits in the content box (Panes, Collapse, OverflowList, Compare, Onboarding, Glider)', () => {
    /** @type {string[]} */
    const panes = [];
    for (const [extra, pad, border] of INSETS) {
      const inset = pad + border;
      const tag = JSON.stringify(extra);
      // Panes: a drag moves the same share of the room, whatever the insets (the box grown by them).
      {
        /** @type {any[]} */
        const changes = [];
        const { dom, skia, dispose } = both(
          () => (
            <Rui>
              <Panes w={408 + 2 * inset} h={100} {...extra} defaultSizes={['30%', '30%']} onSizesChange={(/** @type {any} */ s) => changes.push(s)}>
                <Panes.Pane>
                  <Text>a</Text>
                </Panes.Pane>
                <Panes.Pane>
                  <Text>b</Text>
                </Panes.Pane>
              </Panes>
            </Rui>
          ),
          { width: 520, height: 300 },
        );
        mirror(dom, skia);
        const { node, item } = action(dom, skia, 'Resize pane 1');
        const b = item.getBoundingClientRect();
        drag(dom, skia, [[b.x + b.width / 2, b.y + b.height / 2], [b.x + b.width / 2 + 40, b.y + b.height / 2]], { node });
        panes.push(JSON.stringify(changes.at(-1)));
        dispose();
      }
      // Collapse: opened, it is its content and its insets, above and below.
      {
        const clock = manualClock();
        /** @type {any} */
        let open = null;
        const { skia, dispose } = both(() => {
          open = $signal($active(), false);
          return (
            <Clock value={clock}>
              <Rui>
                <Collapse open={open} duration={160} aria-label="Fold" {...extra}>
                  <Text>one</Text>
                </Collapse>
              </Rui>
            </Clock>
          );
        });
        skia.text();
        $write(open, true);
        $flush(skia.root);
        for (let i = 0; i < 20; i++) clock.advance(16);
        skia.text();
        const line = primitives(skia).find((/** @type {any} */ i) => i.kind === 3 && i.caption === 'one').getBoundingClientRect();
        const root = named(skia, 'Fold').getBoundingClientRect();
        assert.equal(Math.round(root.height), Math.round(line.height + 2 * inset), `Collapse ${tag}`);
        dispose();
      }
      // OverflowList: two 32 px items and a 12 gap need 76; a box of 76 and its insets fits them, one less does not.
      for (const [room, fits] of /** @type {[number, boolean][]} */ ([[76, true], [75, false]])) {
        const clock = manualClock();
        const dom = onDom(() => (
          <Clock value={clock}>
            <Rui>
              <OverflowList data={['aaaa', 'bbbb']} gap={12} renderItem={(/** @type {string} */ n) => <Text>{n}</Text>} {...extra} />
            </Rui>
          </Clock>
        ));
        dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
          const w = this.style.overflow === 'hidden' ? room + 2 * inset : this.textContent.length * 8;
          return { x: 0, y: 0, left: 0, top: 0, width: w, height: 20, right: w, bottom: 20 };
        };
        for (let i = 0; i < 4; i++) {
          clock.advance(16);
          $flush(dom.root);
          dom.text();
        }
        assert.equal(dom.text() === 'aaaa bbbb', fits, `OverflowList ${tag} in ${room}`);
        dom.dispose();
      }
      // Compare, vertical: its first section is as high as the second.
      {
        const { skia, dispose } = both(
          () => (
            <Rui>
              <Compare orientation="vertical" w={400} h={200} {...extra} before={<Text>Before</Text>} after={<Text>After</Text>} />
            </Rui>
          ),
          { width: 480, height: 300 },
        );
        skia.text();
        const box = (/** @type {string} */ cap) => {
          let n = primitives(skia).find((/** @type {any} */ i) => i.kind === 3 && i.caption === cap);
          while (n.parent && n.parent.style.overflow !== 1) n = n.parent;
          return n.getBoundingClientRect();
        };
        assert.equal(box('Before').height, box('After').height, `Compare vertical ${tag}`);
        dispose();
      }
      // Onboarding: its ring sits a cutout around the spot.
      {
        const clock = manualClock();
        const { dom, skia, dispose } = both(
          () => (
            <Clock value={clock}>
              <Rui>
                <Onboarding steps={[{ spot: 'save', title: 'Save', content: 'Keeps' }]} started cutout={8} style={{ width: 460, height: 320, ...(extra.style ?? null) }} p={extra.p}>
                  <Onboarding.Spot id="save">
                    <Button label="Save doc">Save doc</Button>
                  </Onboarding.Spot>
                </Onboarding>
              </Rui>
            </Clock>
          ),
          { width: 480, height: 360 },
        );
        mirror(dom, skia);
        clock.advance(16);
        $flush(skia.root);
        const ring = primitives(skia).find((/** @type {any} */ i) => i.kind === 0 && i.style.borderTop === 2).getBoundingClientRect();
        const save = action(dom, skia, 'Save doc').item.getBoundingClientRect();
        assert.deepEqual([ring.left, ring.top], [save.left - 8, save.top - 8], `Onboarding ${tag}`);
        dispose();
      }
      // Glider: over its element, inside a box of the caller's insets.
      {
        const clock = manualClock();
        const { skia, dispose } = both(() => {
          const R = $active();
          const parent = $signal(R, null);
          const a = $signal(R, null);
          return (
            <Clock value={clock}>
              <Rui>
                <View ref={parent} style={{ direction: 'row', gap: 10, padding: pad, border }}>
                  <Action ref={a} text="First" style={{ width: 100 }} />
                  <Glider to={() => $read(a)} within={parent} />
                </View>
              </Rui>
            </Clock>
          );
        });
        clock.advance(32);
        $flush(skia.root);
        skia.text();
        const first = primitives(skia).find((/** @type {any} */ i) => i.kind === 5 && i.text === 'First');
        const glider = primitives(skia).filter((/** @type {any} */ i) => i.parent === first.parent).at(-1);
        const g = glider.getBoundingClientRect();
        const f = first.getBoundingClientRect();
        assert.deepEqual([Math.round(g.x), Math.round(g.y)], [Math.round(f.x), Math.round(f.y)], `Glider ${tag}`);
        dispose();
      }
    }
    assert.equal(new Set(panes).size, 1, `Panes: the same drag, the same sizes: ${panes}`);
  });

  it('tooltips: a chart\'s tooltip sits where it would unpadded, beside the pointer (BarChart, ScatterChart)', () => {
    const cups = [{ day: 'Mon', a: 1 }, { day: 'Tue', a: 3 }, { day: 'Wed', a: 2 }];
    /** @type {[string, (x: Record<string, any>) => any][]} */
    const CHARTS = [
      ['BarChart', x => <BarChart data={cups} category="day" series={[{ key: 'a' }]} {...x} />],
      ['ScatterChart', x => <ScatterChart data={[{ label: 'G', points: [{ hours: 1, score: 10 }, { hours: 2, score: 60 }, { hours: 3, score: 70 }] }]} category={{ x: 'hours', y: 'score' }} {...x} />],
    ];
    for (const [name, make] of CHARTS) {
      /** @type {string[]} */
      const seen = [];
      for (const [extra, pad, border] of INSETS) {
        const inset = pad + border;
        const { skia, dispose } = both(() => (
          <Rui>
            <View style={{ width: 400 + 2 * inset }}>{make({ ...extra, h: 200 + 2 * inset, 'aria-label': 'Chart' })}</View>
          </Rui>
        ));
        skia.text();
        const root = named(skia, 'Chart');
        const r = root.getBoundingClientRect();
        /** The tooltip: the raised box inside the chart. */
        const tip = () => primitives(skia).find((/** @type {any} */ i) => i.style?.zIndex === 2 && inside(root, i));
        // The same content box on each (the box grown by the insets), and the same place in it: the first, scanning across and down, that shows a tooltip.
        let found = null;
        for (let y = 20; y < 190 && found === null; y += 10)
          for (let x = 20; x < 390 && found === null; x += 10) {
            skia.skia.move(r.x + inset + x, r.y + inset + y);
            $flush(skia.root);
            skia.text();
            if (tip() !== undefined) found = [x, y];
          }
        assert.ok(found !== null, `${name} ${JSON.stringify(extra)}: a tooltip`);
        const [x, y] = /** @type {number[]} */ (found);
        const t = tip().getBoundingClientRect();
        const px = r.x + inset + x;
        const py = r.y + inset + y;
        assert.ok(!(px >= t.x && px <= t.x + t.width && py >= t.y && py <= t.y + t.height), `${name} ${JSON.stringify(extra)}: not over the pointer`);
        seen.push(JSON.stringify([x, y, Math.round(t.x - px), Math.round(t.y - py)]));
        dispose();
      }
      assert.equal(new Set(seen).size, 1, `${name}: the tooltip beside the pointer as unpadded: ${seen}`);
    }
  });

  it('drawing: every chart draws in its content box', () => {
    const cups = [{ day: 'Mon', a: 1 }, { day: 'Tue', a: 3 }];
    const slices = [{ name: 'A', value: 1 }, { name: 'B', value: 2 }];
    /** @type {[string, (x: Record<string, any>) => any][]} */
    const CHARTS = [
      ['LineChart', x => <LineChart h={200} data={cups} category="day" series={[{ key: 'a' }]} {...x} />],
      ['BarChart', x => <BarChart h={200} data={cups} category="day" series={[{ key: 'a' }]} {...x} />],
      ['ScatterChart', x => <ScatterChart h={200} data={[{ label: 'G', points: [{ hours: 2, score: 60 }, { hours: 3, score: 70 }] }]} category={{ x: 'hours', y: 'score' }} {...x} />],
      ['BubbleChart', x => <BubbleChart h={200} data={[{ label: 'P', ships: 12 }, { label: 'Q', ships: 30 }]} valueKey="ships" label="Ships" {...x} />],
      ['RadialBarChart', x => <RadialBarChart h={200} data={slices} valueKey="value" {...x} />],
      ['RadarChart', x => <RadarChart h={200} data={[{ s: 'A', v: 1 }, { s: 'B', v: 2 }, { s: 'C', v: 3 }]} category="s" series={[{ key: 'v' }]} {...x} />],
      ['PieChart', x => <PieChart data={slices} {...x} />],
      ['FunnelChart', x => <FunnelChart w={200} h={160} data={slices} {...x} />],
      ['Heatmap', x => <Heatmap data={{ '2026-01-01': 2 }} from="2026-01-01" to="2026-01-14" {...x} />],
      ['Sparkline', x => <Sparkline data={[1, 3, 2]} {...x} />],
    ];
    for (const [extra, pad, border] of INSETS) {
      const inset = pad + border;
      for (const [name, make] of CHARTS) {
        const clock = manualClock();
        const { skia, dispose } = both(() => (
          <Clock value={clock}>
            <Rui>
              <View style={{ width: 400 }}>{make({ ...extra, 'aria-label': 'Chart' })}</View>
            </Rui>
          </Clock>
        ));
        clock.advance(32);
        $flush(skia.root);
        skia.text();
        const root = named(skia, 'Chart');
        const r = root.getBoundingClientRect();
        for (const n of primitives(skia).filter((/** @type {any} */ i) => i.kind === 7 && inside(root, i))) {
          const b = n.getBoundingClientRect();
          const where = `${name} ${JSON.stringify(extra)}: ${JSON.stringify([b.x, b.y, b.width, b.height])} in ${JSON.stringify([r.x, r.y, r.width, r.height])}`;
          assert.ok(b.x >= r.x + inset - 0.5 && b.y >= r.y + inset - 0.5 && b.x + b.width <= r.x + r.width - inset + 0.5 && b.y + b.height <= r.y + r.height - inset + 0.5, where);
        }
        dispose();
      }
    }
  });
});
