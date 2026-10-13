// A Field's label names the control inside it, whatever the control: each
// one inside <Field label="F"> is named "F" (read through ren-json), and the
// naming holds nested, without a label, with a Field.Label's own id and with
// two labels.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $json } from 'ren-json';
import * as ui from 'rui-core';
import * as dates from 'rui-core/dates';
import { Editor } from 'rui-core/editor';
import { disposeAfter } from './harness.jsx';

const { Rui, Field } = ui;

/** Every node, depth first. @param {any[]} nodes @param {any[]} [out] */
const all = (nodes, out = []) => {
  for (const n of nodes) {
    if (typeof n === 'string') continue;
    out.push(n);
    if (n.children) all(n.children, out);
  }
  return out;
};
/** The nodes of a view in a Rui. @param {() => any} view */
const nodes = async view => all(await $json(() => <Rui>{view()}</Rui>));

const opts = ['Alpha', 'Beta'];
/** Each control, and the role its name goes on. @type {[string, string, () => any][]} */
const CONTROLS = [
  ['Input', 'textbox', () => <ui.Input placeholder="ph" />],
  ['TextInput', 'textbox', () => <ui.TextInput placeholder="ph" />],
  ['Textarea', 'textbox', () => <ui.Textarea placeholder="ph" />],
  ['PasswordInput', 'textbox', () => <ui.PasswordInput placeholder="ph" />],
  ['NumberInput', 'spinbutton', () => <ui.NumberInput placeholder="ph" />],
  ['PinInput', 'group', () => <ui.PinInput length={3} />],
  ['MaskInput', 'textbox', () => <ui.MaskInput mask="99-99" placeholder="ph" />],
  ['JsonArea', 'textbox', () => <ui.JsonArea placeholder="ph" />],
  ['Select', 'combobox', () => <ui.Select data={opts} placeholder="ph" />],
  ['PlainSelect', 'combobox', () => <ui.PlainSelect data={opts} placeholder="ph" />],
  ['Autocomplete', 'combobox', () => <ui.Autocomplete data={opts} placeholder="ph" />],
  ['MultiSelect', 'combobox', () => <ui.MultiSelect data={opts} placeholder="ph" />],
  ['TagInput', 'combobox', () => <ui.TagInput placeholder="ph" />],
  ['TreeSelect', 'combobox', () => <ui.TreeSelect data={[{ value: 'a', label: 'A' }]} placeholder="ph" />],
  ['Cascader', 'combobox', () => <ui.Cascader data={[{ value: 'a', label: 'A' }]} placeholder="ph" />],
  ['ColorInput', 'textbox', () => <ui.ColorInput placeholder="ph" />],
  ['FileInput', 'button', () => <ui.FileInput placeholder="ph" />],
  ['DateInput', 'textbox', () => <dates.DateInput placeholder="ph" />],
  ['DateSelect', 'button', () => <dates.DateSelect placeholder="ph" />],
  ['TimeInput', 'textbox', () => <dates.TimeInput />],
  ['Slider', 'slider', () => <ui.Slider />],
  ['Editor.Content', 'textbox', () => (
    <Editor>
      <Editor.Content />
    </Editor>
  )],
  [
    'Switch.Group',
    'group',
    () => (
      <ui.Switch.Group>
        <ui.Switch value="a" label="A" />
      </ui.Switch.Group>
    ),
  ],
  ['RangeSlider', 'group', () => <ui.RangeSlider />],
  ['AngleSlider', 'slider', () => <ui.AngleSlider />],
  ['HueSlider', 'slider', () => <ui.HueSlider />],
  ['AlphaSlider', 'slider', () => <ui.AlphaSlider />],
  ['ColorPicker', 'group', () => <ui.ColorPicker />],
  ['DateTimeSelect', 'button', () => <dates.DateTimeSelect placeholder="ph" />],
  ['MonthSelect', 'button', () => <dates.MonthSelect placeholder="ph" />],
  ['YearSelect', 'button', () => <dates.YearSelect placeholder="ph" />],
  ['TimePicker', 'group', () => <dates.TimePicker />],
  ['Rating', 'slider', () => <ui.Rating />],
  ['SegmentedControl', 'radiogroup', () => <ui.SegmentedControl data={opts} />],
  ['Switch', 'switch', () => <ui.Switch />],
  ['Checkbox', 'checkbox', () => <ui.Checkbox />],
  [
    'Checkbox.Group',
    'group',
    () => (
      <ui.Checkbox.Group>
        <ui.Checkbox value="a" label="A" />
        <ui.Checkbox value="b" label="B" />
      </ui.Checkbox.Group>
    ),
  ],
  [
    'Radio.Group',
    'radiogroup',
    () => (
      <ui.Radio.Group>
        <ui.Radio value="a" label="A" />
        <ui.Radio value="b" label="B" />
      </ui.Radio.Group>
    ),
  ],
];

describe('a Field names every control inside it', () => {
  for (const [name, role, make] of CONTROLS) {
    it(`${name}: its ${role} is named by the Field's label`, async () => {
      const found = (await nodes(() => <Field label="F">{make()}</Field>)).filter(n => n.role === role);
      assert.ok(found.length > 0, `a ${role}`);
      assert.equal(found[0].label, 'F');
    });
  }

  it('every exported control with a field role is in the list above, or named elsewhere for a reason', async () => {
    // A control role an export shows inside a Field; each export showing one is a Field control (CONTROLS) or here.
    const ROLES = new Set(['slider', 'spinbutton', 'textbox', 'searchbox', 'combobox', 'checkbox', 'switch', 'radio', 'radiogroup', 'listbox', 'tree', 'grid', 'group']);
    /** @type {Record<string, string>} */
    const ELSEWHERE = {
      Chip: 'an option named by its own text',
      Radio: 'named by its label, inside a Radio.Group the Field names',
      Calendar: 'a grid named by the period it shows',
      DatePanel: 'a grid named by the period it shows',
      MonthPanel: 'a grid named by the period it shows',
      YearPanel: 'a grid named by the period it shows',
      DigitRoll: 'a readout, not a control',
      Compare: 'a comparison slider named by what it compares',
      Gantt: 'a chart, not a control',
      JsonTree: 'a data view, not a control',
      'Chip.Group': 'no element of its own: each chip is named by its text',
      'Carousel.Slide': 'a slide, named by its place among the slides',
    };
    const listed = new Set(CONTROLS.map(([name]) => name));
    /** The field roles a view shows inside a Field, by count; null when it cannot render bare. @param {() => any} make */
    const rolesOf = async make => {
      try {
        /** @type {Map<string, number>} */
        const out = new Map();
        for (const n of await nodes(() => <Field label="F">{make()}</Field>)) if (ROLES.has(n.role)) out.set(n.role, (out.get(n.role) ?? 0) + 1);
        return out;
      } catch {
        return null; // it needs props to render at all
      }
    };
    /** @type {string[]} */
    const missed = [];
    for (const entry of ['rui-core', 'rui-core/form', 'rui-core/dates', 'rui-core/charts', 'rui-core/notifications', 'rui-core/launcher', 'rui-core/carousel', 'rui-core/dropzone', 'rui-core/modals', 'rui-core/snippet', 'rui-core/load-bar', 'rui-core/editor', 'rui-core/more']) {
      for (const [name, Make] of Object.entries(await import(entry))) {
        if (typeof Make !== 'function' || !/^[A-Z]/.test(name) || name === 'Field' || name === 'Rui') continue;
        const own = await rolesOf(() => <Make />);
        if (own !== null && own.size > 0 && !listed.has(name) && !(name in ELSEWHERE)) missed.push(`${entry} ${name}: ${[...own.keys()].join(', ')}`);
        // Its parts (Editor.Content, Checkbox.Group, Tabs.List): each inside its whole, else alone; what the part adds counts.
        for (const [part, Part] of Object.entries(Make)) {
          const full = `${name}.${part}`;
          if (typeof Part !== 'function' || !/^[A-Z]/.test(part) || Part === Make || listed.has(full) || full in ELSEWHERE) continue;
          const inside = await rolesOf(() => (
            <Make>
              <Part />
            </Make>
          ));
          const roles = inside ?? (await rolesOf(() => <Part />));
          if (roles === null) continue;
          const base = inside === null ? new Map() : (own ?? new Map());
          const added = [...roles].filter(([role, n]) => n > (base.get(role) ?? 0)).map(([role]) => role);
          if (added.length > 0) missed.push(`${entry} ${full}: ${added.join(', ')}`);
        }
      }
    }
    assert.deepEqual(missed, [], 'a control not checked for its Field name');
  });

  it("a Slider's own aria-label names it, not the Field", async () => {
    const found = (await nodes(() => <Field label="F"><ui.Slider aria-label="V" /></Field>)).filter(n => n.role === 'slider');
    assert.deepEqual(found.map(n => n.label), ['V']);
  });

  it('TimePicker: its segments are a group named by its label, each picker by its own', async () => {
    const out = await nodes(() => (
      <>
        <dates.TimePicker label="Start" />
        <dates.TimePicker label="End" />
        <Field label="F">
          <dates.TimePicker />
        </Field>
      </>
    ));
    assert.deepEqual(out.filter(n => n.role === 'group').map(n => n.label), ['Start', 'End', 'F']);
  });

  it('nested, label-less, with a Field.Label of its own id, and with two labels', async () => {
    const textboxes = async (/** @type {() => any} */ view) => (await nodes(view)).filter(n => n.role === 'textbox').map(n => n.label);
    assert.deepEqual(
      await textboxes(() => (
        <Field label="Outer">
          <ui.TextInput placeholder="ph" />
        </Field>
      )),
      ['Outer'],
      "a TextInput's own Field passes the outer name through",
    );
    assert.deepEqual(
      await textboxes(() => (
        <Field label="Outer">
          <Field description="no label">
            <ui.Input placeholder="ph" />
          </Field>
        </Field>
      )),
      ['Outer'],
      'an inner Field without a label keeps the outer name',
    );
    const lone = (await nodes(() => (
      <Field>
        <ui.Input placeholder="ph" />
      </Field>
    ))).find(n => n.role === 'textbox');
    assert.equal(lone.label, 'ph', 'a Field without a label names nothing: the placeholder still does');
    assert.deepEqual(
      await textboxes(() => (
        <Field>
          <Field.Label id="mine">Own id</Field.Label>
          <ui.Input placeholder="ph" />
        </Field>
      )),
      ['Own id'],
      "a Field.Label's own id is the one the control points at",
    );
    assert.deepEqual(
      await textboxes(() => (
        <Field label="First">
          <Field.Label>Second</Field.Label>
          <ui.Input placeholder="ph" />
        </Field>
      )),
      ['First'],
      'two labels: the Field label names it, with no duplicate id',
    );
  });
});

describe('a Field.Label that goes takes its name back', () => {
  it('shown, hidden, shown: the control never points at a missing id (DOM)', async t => {
    const { onDom } = await import('./harness.jsx');
    const { $signal, $read, $write, $active, $flush, Show } = await import('ren-core');
    /** @type {any} */
    let on = null;
    const v = onDom(() => {
      on = $signal($active(), true);
      return (
        <Rui>
          <Field label="Outer">
            <Field>
              <Show when={() => $read(on)}>
                <Field.Label>Inner</Field.Label>
              </Show>
              <ui.Input placeholder="ph" />
            </Field>
          </Field>
        </Rui>
      );
    });
    disposeAfter(t, () => v.dispose());
    /** The input's name: the text of what its aria-labelledby points at, or 'MISSING'. */
    const name = () => {
      v.text();
      const id = v.document.querySelector('input').getAttribute('aria-labelledby');
      return id === null ? null : (v.document.getElementById(id)?.textContent.trim() ?? 'MISSING');
    };
    const set = (/** @type {boolean} */ x) => {
      $write(on, x);
      $flush(v.root);
    };
    assert.equal(name(), 'Inner', 'shown');
    set(false);
    assert.equal(name(), 'Outer', 'hidden: the outer Field names it again');
    set(true);
    assert.equal(name(), 'Inner', 'shown again');
  });
});
