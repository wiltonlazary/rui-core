// Every id a control points at is there, once: after rendering each export
// (inside a Field), and after opening, typing into and moving through the
// controls that point at ids as they change (aria-activedescendant,
// aria-labelledby, aria-describedby, aria-controls), no reference dangles
// and no id is given twice.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write, $active, Show } from 'ren-core';
import * as ui from 'rui-core';
import * as dates from 'rui-core/dates';
import { pair, app } from './overlay-harness.jsx';
import { disposeAfter } from './harness.jsx';

const REFS = ['aria-activedescendant', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-errormessage', 'aria-details', 'for'];

/**
 * What is wrong with a document's ids: an id given twice, a reference to
 * an id nothing has. @param {any} doc @returns {string[]}
 */
const faults = doc => {
  /** @type {string[]} */
  const out = [];
  /** @type {Map<string, number>} */
  const ids = new Map();
  for (const el of doc.querySelectorAll('[id]')) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) out.push(`id ${id} given ${n} times`);
  for (const el of doc.querySelectorAll('*'))
    for (const name of REFS) {
      const v = el.getAttribute(name);
      if (v == null) continue;
      for (const id of v.split(/\s+/).filter(Boolean)) if (!ids.has(id)) out.push(`${name}="${id}" on ${el.getAttribute('role') ?? el.tagName} points at nothing`);
    }
  return out;
};

/** A view on both renderers, on a manual clock, with `settle` to let it run. @param {() => any} content @param {any} t */
const open = (content, t) => {
  const clock = ui.manualClock();
  const p = pair(app(clock, content));
  disposeAfter(t, () => p.dispose());
  const settle = () => {
    for (let i = 0; i < 4; i++) {
      clock.advance(300);
      p.flush();
    }
  };
  settle();
  /** Asserts the ids are sound now. @param {string} when */
  const sound = when => assert.deepEqual(faults(p.dom.document), [], when);
  return { p, settle, sound };
};

describe('every id reference resolves to one element', () => {
  it('each export, alone inside a Field', async () => {
    /** @type {string[]} */
    const bad = [];
    for (const entry of ['rui-core', 'rui-core/form', 'rui-core/dates', 'rui-core/charts', 'rui-core/notifications', 'rui-core/launcher', 'rui-core/carousel', 'rui-core/dropzone', 'rui-core/modals', 'rui-core/snippet', 'rui-core/load-bar', 'rui-core/editor', 'rui-core/more']) {
      for (const [name, Make] of Object.entries(await import(entry))) {
        if (typeof Make !== 'function' || !/^[A-Z]/.test(name) || name === 'Rui') continue;
        /** @type {any} */
        let p = null;
        try {
          const clock = ui.manualClock();
          p = pair(app(clock, () => (
            <ui.Field label="F">
              <Make />
            </ui.Field>
          )));
          clock.advance(300);
          p.flush();
        } catch {
          p?.dispose();
          continue; // it needs props to render at all
        }
        for (const f of faults(p.dom.document)) bad.push(`${entry} ${name}: ${f}`);
        p.dispose();
      }
    }
    assert.deepEqual(bad, []);
  });

  it('open composites: tabs, tooltips over triggers, menus, a menubar, an accordion, a dialog', t => {
    const { sound } = open(
      () => (
        <>
          <ui.Tabs defaultValue="b c" persistent>
            <ui.Tabs.List>
              <ui.Tabs.Tab value="a">A</ui.Tabs.Tab>
              <ui.Tabs.Tab value="b c">B</ui.Tabs.Tab>
              <ui.Tabs.Tab value="b_20c">C</ui.Tabs.Tab>
            </ui.Tabs.List>
            <ui.Tabs.Panel value="a">1</ui.Tabs.Panel>
            <ui.Tabs.Panel value="b c">2</ui.Tabs.Panel>
            <ui.Tabs.Panel value="b_20c">3</ui.Tabs.Panel>
          </ui.Tabs>
          <ui.Tooltip label="Outer" defaultOpen>
            <ui.Tooltip label="Inner" defaultOpen>
              <ui.Button>Hover</ui.Button>
            </ui.Tooltip>
          </ui.Tooltip>
          <ui.Tooltip label="Tip" defaultOpen>
            <ui.Menu defaultOpen>
              <ui.Menu.Trigger>
                <ui.Button>More</ui.Button>
              </ui.Menu.Trigger>
              <ui.Menu.Panel>
                <ui.Menu.Item>One</ui.Menu.Item>
              </ui.Menu.Panel>
            </ui.Menu>
          </ui.Tooltip>
          <ui.Menubar aria-label="Main">
            <ui.Menu>
              <ui.Menu.Trigger>
                <ui.Button>File</ui.Button>
              </ui.Menu.Trigger>
              <ui.Menu.Panel>
                <ui.Menu.Item>New</ui.Menu.Item>
              </ui.Menu.Panel>
            </ui.Menu>
          </ui.Menubar>
          <ui.Accordion defaultValue="a">
            <ui.Accordion.Item value="a">
              <ui.Accordion.Trigger>Shipping</ui.Accordion.Trigger>
              <ui.Accordion.Panel>Two days</ui.Accordion.Panel>
            </ui.Accordion.Item>
            <ui.Accordion.Item value="b">
              <ui.Accordion.Trigger>Returns</ui.Accordion.Trigger>
              <ui.Accordion.Panel id="returns-panel">Thirty days</ui.Accordion.Panel>
            </ui.Accordion.Item>
            <ui.Accordion.Item value="c">
              <ui.Accordion.Trigger id="care-trigger">Care</ui.Accordion.Trigger>
              <ui.Accordion.Panel>Wash cold</ui.Accordion.Panel>
            </ui.Accordion.Item>
          </ui.Accordion>
          <ui.Modal defaultOpen title="Hello" motion={0}>
            <ui.TextInput label="Name" description="Yours" error="Needed" />
          </ui.Modal>
        </>
      ),
      t,
    );
    sound('all shown');
  });

  it('comboboxes as they open, filter and move', t => {
    const tree = [
      { value: 'fruit', label: 'Fruit', children: [{ value: 'apple', label: 'Apple' }] },
      { value: 'veg', label: 'Veg', children: [{ value: 'leek', label: 'Leek' }] },
    ];
    for (const make of [
      () => <ui.Select searchable label="Pick" data={['Beta', 'Alpha', 'Gamma']} />,
      () => <ui.MultiSelect searchable label="Pick" data={['Beta', 'Alpha', 'Gamma']} />,
      () => <ui.Autocomplete label="Pick" data={['Beta', 'Alpha', 'Gamma']} />,
      () => <ui.TagInput label="Pick" data={['Beta', 'Alpha', 'Gamma']} />,
      () => <ui.TreeSelect searchable label="Food" data={tree} />,
      () => <ui.Cascader searchable label="Food" data={tree} />,
    ]) {
      const { p, settle, sound } = open(make, t);
      p.dom.document.querySelector('[role="combobox"]').focus();
      for (const [what, act] of /** @type {[string, () => void][]} */ ([
        ['down', () => p.d.key('ArrowDown')],
        ['down again', () => p.d.key('ArrowDown')],
        ['typed a', () => p.d.type('a')],
        ['typed m', () => p.d.type('m')],
        ['down', () => p.d.key('ArrowDown')],
        ['Escape', () => p.d.key('Escape')],
      ])) {
        act();
        settle();
        sound(what);
      }
    }
  });

  it('a Field.Label and a Field label that come and go', t => {
    /** @type {any[]} */
    const shown = [];
    /** @type {any[]} */
    const labels = [];
    const { p, sound } = open(() => {
      const s = $signal($active(), true);
      const l = $signal($active(), 'L');
      shown.push(s);
      labels.push(l);
      return (
        <>
          <ui.Field>
            <Show when={() => $read(s)}>
              <ui.Field.Label>Gone</ui.Field.Label>
            </Show>
            <ui.Input />
          </ui.Field>
          <ui.Field label={() => $read(l)}>
            <ui.Input />
          </ui.Field>
          <dates.TimePicker label="At" />
        </>
      );
    }, t);
    sound('shown');
    for (const [s, l, what] of /** @type {[boolean, string, string][]} */ ([
      [false, '', 'gone'],
      [true, 'L2', 'back'],
    ])) {
      for (const x of shown) $write(x, s);
      for (const x of labels) $write(x, l);
      p.flush();
      sound(what);
    }
  });
});
