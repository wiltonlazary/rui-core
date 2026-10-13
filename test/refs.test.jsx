// A `ref` is a function or a signal, as ren-core takes it: every export (and
// every part, inside its whole, opened) that hands a function ref its node
// hands a signal ref the node too, on the DOM and on Skia.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $active } from 'ren-core';
import { Rui } from 'rui-core';
import { onDom, both } from './harness.jsx';

const ENTRIES = ['rui-core', 'rui-core/form', 'rui-core/dates', 'rui-core/charts', 'rui-core/notifications', 'rui-core/launcher', 'rui-core/carousel', 'rui-core/dropzone', 'rui-core/modals', 'rui-core/snippet', 'rui-core/load-bar', 'rui-core/editor', 'rui-core/more'];

/**
 * The views to try: each export alone, and each part inside its whole,
 * opened (`defaultOpen`), with `ref` on the export or the part.
 * @returns {Promise<[string, (ref: any) => any][]>}
 */
async function views() {
  /** @type {[string, (ref: any) => any][]} */
  const out = [];
  for (const entry of ENTRIES) {
    for (const [name, Make] of Object.entries(await import(entry))) {
      if (typeof Make !== 'function' || !/^[A-Z]/.test(name) || name === 'Rui') continue;
      out.push([`${entry} ${name}`, ref => <Make ref={ref} />]);
      for (const [part, Part] of Object.entries(Make)) {
        if (typeof Part !== 'function' || !/^[A-Z]/.test(part) || Part === Make) continue;
        out.push([
          `${entry} ${name}.${part}`,
          ref => (
            <Make defaultOpen>
              <Part ref={ref} />
            </Make>
          ),
        ]);
      }
    }
  }
  // Parts shown only beside another part: a panel needs its trigger to anchor it.
  const ui = await import('rui-core');
  for (const [name, Whole] of /** @type {[string, any][]} */ ([['Popover', ui.Popover], ['HoverCard', ui.HoverCard], ['Menu', ui.Menu]]))
    out.push([
      `rui-core ${name}.Panel, beside its trigger`,
      ref => (
        <Whole defaultOpen>
          <Whole.Trigger>
            <ui.Button>Open</ui.Button>
          </Whole.Trigger>
          <Whole.Panel ref={ref}>
            <ui.Text>Inside</ui.Text>
          </Whole.Panel>
        </Whole>
      ),
    ]);
  return out;
}

/** Whether a view hands a function ref a node on the DOM (false when it takes none, or cannot render bare). @param {(ref: any) => any} make */
const takesRef = make => {
  /** @type {any} */
  let got = null;
  /** @type {any} */
  let v = null;
  try {
    v = onDom(() => <Rui>{make((/** @type {any} */ n) => n != null && (got = n))}</Rui>);
    v.text();
  } catch {
    return false;
  } finally {
    v?.dispose();
  }
  return got !== null;
};

describe('a signal ref gets the node wherever a function ref does', () => {
  it('every ref-taking export and part, on the DOM and on Skia', async () => {
    /** @type {string[]} */
    const bad = [];
    let checked = 0;
    for (const [name, make] of await views()) {
      if (!takesRef(make)) continue;
      checked++;
      /** @type {any[]} */
      const refs = [];
      /** @type {any} */
      let pair = null;
      try {
        pair = both(() => {
          const ref = $signal($active(), /** @type {any} */ (null));
          refs.push(ref);
          return <Rui>{make(ref)}</Rui>;
        });
        pair.dom.text();
        pair.skia.text();
        const got = refs.map(r => $read(r) != null);
        if (got.length !== 2 || got.includes(false)) bad.push(`${name}: the signal got ${got.map(g => (g ? 'a node' : 'nothing')).join(' and ')}`);
      } catch (e) {
        bad.push(`${name}: throws ${/** @type {Error} */ (e).message}`);
      } finally {
        pair?.dispose();
      }
    }
    assert.ok(checked > 20, `ref-taking views found: ${checked}`);
    assert.deepEqual(bad, []);
  });
});

describe('the charts and sliders take a ref alike', () => {
  it('Pie, Donut and Funnel charts, Heatmap, HueSlider and AlphaSlider hand it their node, as Bar, Line, Radar charts and Slider do', async () => {
    const ui = await import('rui-core');
    const charts = await import('rui-core/charts');
    const items = [{ label: 'a', value: 1 }];
    /** @type {[string, (ref: any) => any][]} */
    const cases = [
      ['BarChart', ref => <charts.BarChart ref={ref} data={[{ x: 'a', y: 1 }]} category="x" series={[{ name: 'y' }]} />],
      ['LineChart', ref => <charts.LineChart ref={ref} data={[{ x: 'a', y: 1 }]} category="x" series={[{ name: 'y' }]} />],
      ['RadarChart', ref => <charts.RadarChart ref={ref} data={[{ x: 'a', y: 1 }]} category="x" series={[{ name: 'y' }]} />],
      ['Slider', ref => <ui.Slider ref={ref} />],
      ['PieChart', ref => <charts.PieChart ref={ref} data={items} />],
      ['DonutChart', ref => <charts.DonutChart ref={ref} data={items} />],
      ['FunnelChart', ref => <charts.FunnelChart ref={ref} data={items} />],
      ['Heatmap', ref => <charts.Heatmap ref={ref} data={{}} />],
      ['HueSlider', ref => <ui.HueSlider ref={ref} />],
      ['AlphaSlider', ref => <ui.AlphaSlider ref={ref} />],
    ];
    /** @type {string[]} */
    const bad = [];
    for (const [name, make] of cases) {
      /** @type {any[]} */
      const refs = [];
      const pair = both(() => {
        const ref = $signal($active(), /** @type {any} */ (null));
        refs.push(ref);
        return <Rui>{make(ref)}</Rui>;
      });
      pair.dom.text();
      pair.skia.text();
      const got = refs.map(r => $read(r) != null);
      if (got.length !== 2 || got.includes(false)) bad.push(`${name}: ${got.map(g => (g ? 'a node' : 'nothing')).join(' and ')}`);
      pair.dispose();
    }
    assert.deepEqual(bad, []);
  });
});
