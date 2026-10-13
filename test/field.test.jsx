// Field and the split of an input's props between its Field and its
// control, on the DOM and on Skia: the mark apart from `required`, the
// message apart from `invalid`, and one list of the Field's props.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Label } from 'ren-core';
import { Rui, Stack, Field, TextInput, Checkbox, Select, BASE_THEME } from 'rui-core';
import { outerOf, fieldOf, invalidOf, FIELD_KEYS } from '../src/core/inputs/field.jsx';
import { fieldColors } from '../src/core/inputs/shared.js';
import { fontBelow } from '../src/theme/resolve.js';
import { both } from './harness.jsx';
import { items, same } from './inputs-harness.jsx';

const T = BASE_THEME;
const px = (/** @type {number} */ n) => `${n}px`;
/** A Label on the DOM by its text. @param {any} dom @param {string} text */
const labelOf = (dom, text) => dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === text);
/** The border of the i-th Edit's row on the DOM. @param {any} dom @param {number} i */
const borderOf = (dom, i) => dom.nodes('Edit')[i].parentElement.style.borderColor;

describe('Field: the mark and the requirement are separate', () => {
  const cases = /** @type {const} */ ([
    ['true', true, 'Nickname *'],
    ['a string', '(needed)', 'Nickname (needed)'],
    ['a node', <Label text="must" />, 'Nickname must'],
    ['false', false, 'Nickname'],
    ['absent', undefined, 'Nickname'],
  ]);
  for (const [name, asterisk, shown] of cases) {
    for (const required of [false, true]) {
      it(`asterisk ${name}, ${required ? 'required' : 'not required'}`, () => {
        const { dom, skia, dispose } = both(() => (
          <Rui>
            <TextInput label="Nickname" asterisk={asterisk} required={required} />
          </Rui>
        ));
        same(dom, skia, shown);
        assert.equal(dom.nodes('Edit')[0].getAttribute('aria-required'), required ? 'true' : null);
        // The mark is decoration: out of the accessibility tree.
        const mark = shown.slice('Nickname '.length);
        if (mark !== '') {
          const node = labelOf(dom, mark);
          assert.ok(node.closest('[aria-hidden="true"]') !== null, 'the mark is hidden from assistive tech');
        }
        dispose();
      });
    }
  }

  it('`required` alone shows no mark and says aria-required on the control', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <TextInput label="Nickname" required />
      </Rui>
    ));
    same(dom, skia, 'Nickname');
    assert.equal(dom.nodes('Edit')[0].getAttribute('aria-required'), 'true');
    dispose();
  });

  it('the combobox fields follow the same rules', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Stack>
          <Select label="Team" required data={['Red']} />
          <Select label="Role" asterisk invalid data={['Lead']} />
          <Select label="Shift" error data={['Early']} />
        </Stack>
      </Rui>
    ));
    same(dom, skia, 'Team Role * Shift');
    const boxes = dom.nodes('Action').filter((/** @type {any} */ n) => n.getAttribute('role') === 'combobox');
    assert.deepEqual(
      boxes.map((/** @type {any} */ n) => [n.getAttribute('aria-required'), n.getAttribute('aria-invalid')]),
      [['true', null], [null, 'true'], [null, null]],
    );
    dispose();
  });

  it('Field.Label alone takes `asterisk`, in the error color after the label', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Stack>
          <Field.Label asterisk>Nickname</Field.Label>
          <Field.Label asterisk="(optional)" required>
            Handle
          </Field.Label>
          <Field.Label required>Bio</Field.Label>
        </Stack>
      </Rui>
    ));
    same(dom, skia, 'Nickname * Handle (optional) Bio');
    const red = fieldColors(T, 'light', 'outline', { error: true, focused: false, disabled: false }).border;
    assert.equal(labelOf(dom, '*').style.color, red);
    assert.equal(labelOf(dom, '*').parentElement.style.gap, px(T.control.labelGap / 2));
    assert.equal(labelOf(dom, 'Nickname').style.fontWeight, String(T.weights.strong));
    dispose();
  });
});

describe('Field: the message and the state are separate', () => {
  it('an error message shows, an invalid flag only looks invalid, `true` and "" are no message', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Stack>
          <TextInput label="Nickname" error="Too short" />
          <TextInput label="Handle" invalid />
          <TextInput label="Bio" error />
          <TextInput label="Site" error="" />
          <TextInput label="City" />
        </Stack>
      </Rui>
    ));
    same(dom, skia, 'Nickname Too short Handle Bio Site City');
    const edits = dom.nodes('Edit');
    assert.deepEqual(
      edits.map((/** @type {any} */ n) => n.getAttribute('aria-invalid') === 'true'),
      [true, true, false, false, false],
    );
    assert.deepEqual(items(skia, 4).map((/** @type {any} */ n) => n.invalid), [true, true, false, false, false]);
    const plain = borderOf(dom, 4);
    assert.equal(borderOf(dom, 0), borderOf(dom, 1), 'a message and the flag give the same look');
    assert.notEqual(borderOf(dom, 0), plain);
    assert.equal(borderOf(dom, 2), plain, 'error={true} gives no invalid look');
    assert.equal(borderOf(dom, 3), plain);
    dispose();
  });

  it('invalidOf: the flag, or a message', () => {
    assert.equal(invalidOf('Too short', undefined), true);
    assert.equal(invalidOf(0, undefined), true, 'a number is a message');
    assert.equal(invalidOf({ node: true }, undefined), true, 'a node is a message');
    assert.equal(invalidOf(undefined, true), true);
    for (const none of [undefined, null, false, true, '']) assert.equal(invalidOf(none, undefined), false, String(none));
    assert.equal(invalidOf(undefined, 'yes'), false, 'only a true flag');
  });
});

describe('Field: one list splits an input between its Field and its control', () => {
  it('outerOf and fieldOf take the keys each side owns', () => {
    const ref = () => {};
    const outerRef = () => {};
    const onChange = () => {};
    const props = {
      label: 'Nickname', description: 'Shown on your profile', error: 'Too short', asterisk: true, size: 'md',
      outerRef, outerStyle: { padding: 4, color: 'red' }, style: { color: 'blue' }, fieldStyle: { opacity: 1 },
      m: 'md', mx: 1, my: 2, mt: 3, mb: 4, ml: 5, mr: 6, w: 200, maxWidth: 300, minWidth: 100, flex: 1,
      required: true, invalid: true, placeholder: 'Ada', value: 'x', onChange, ref, variant: 'soft',
    };
    const outer = outerOf(props);
    assert.deepEqual(Object.keys(outer).sort(), ['__named', 'asterisk', 'description', 'error', 'flex', 'label', 'm', 'maxWidth', 'mb', 'minWidth', 'ml', 'mr', 'mt', 'mx', 'my', 'ref', 'size', 'style', 'w'].sort());
    assert.equal(outer.__named, true);
    assert.equal(outer.ref, outerRef, 'outerRef is the Field\'s ref');
    assert.deepEqual(outer.style(), { padding: 4, color: 'blue' }, 'style over outerStyle, key by key');
    const control = fieldOf(props);
    assert.deepEqual(Object.keys(control).sort(), ['aria-label', 'error', 'invalid', 'onChange', 'placeholder', 'ref', 'required', 'size', 'style', 'value', 'variant'].sort());
    assert.equal(control['aria-label'](), 'Nickname', 'named by the label');
    assert.deepEqual(control.style, { opacity: 1 }, 'fieldStyle is the control\'s style');
    assert.equal(control.ref, ref);
    // Every Field key but the shared ones stays off the control (its `style` is fieldStyle).
    for (const k of FIELD_KEYS) if (k !== 'size' && k !== 'error' && k !== 'style') assert.ok(!(k in control), k);
  });

  it('a given aria-label wins; one style alone passes through; a node label names nothing', () => {
    assert.equal(fieldOf({ label: 'Nickname', 'aria-label': 'Nick' })['aria-label'], 'Nick');
    const style = { color: 'blue' };
    assert.equal(outerOf({ style }).style, style);
    assert.equal(outerOf({ outerStyle: style }).style, style);
    assert.equal(outerOf({}).style, undefined);
    assert.equal(fieldOf({ label: { node: true } })['aria-label'], undefined);
  });

  it('a TextInput puts its layout props and outerRef on the Field, not the Edit', () => {
    /** @type {any[]} */
    const held = [];
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <TextInput label="Nickname" m="md" w={200} outerRef={(/** @type {any} */ n) => held.push(n)} fieldStyle={{ minWidth: 50 }} />
      </Rui>
    ));
    same(dom, skia, 'Nickname');
    const edit = dom.nodes('Edit')[0];
    const row = edit.parentElement;
    const root = row.parentElement;
    assert.equal(root.style.width, '200px');
    assert.equal(root.style.marginTop, px(T.spacing.md));
    assert.equal(root.style.flexDirection, 'column');
    assert.notEqual(row.style.width, '200px');
    assert.equal(row.style.marginTop, '');
    assert.equal(row.style.minWidth, '50px', 'fieldStyle on the control');
    assert.ok(held.includes(root), 'outerRef holds the Field');
    const skiaEdit = items(skia, 4)[0];
    assert.equal(skiaEdit.parent.parent.getBoundingClientRect().width, 200, 'on Skia too');
    dispose();
  });
});

describe('Field and its parts', () => {
  it('stacks label, description, control and error, the size reaching the parts', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Stack>
          <Field label="Nickname" description="Shown on your profile" error="Too short" size="lg">
            <TextInput placeholder="Ada" />
          </Field>
          <Field.Description>Letters only</Field.Description>
          <Field size="lg">
            <Field.Error size="xs">Taken</Field.Error>
          </Field>
        </Stack>
      </Rui>
    ));
    same(dom, skia, 'Nickname Shown on your profile Ada Too short Letters only Taken');
    const lg = T.fontSizes.lg;
    assert.equal(labelOf(dom, 'Nickname').style.fontSize, px(lg));
    assert.equal(labelOf(dom, 'Shown on your profile').style.fontSize, px(fontBelow(T, lg)));
    assert.equal(labelOf(dom, 'Too short').style.fontSize, px(fontBelow(T, lg)));
    assert.equal(labelOf(dom, 'Letters only').style.fontSize, px(fontBelow(T, T.fontSizes.sm)), 'sm outside a Field');
    assert.equal(labelOf(dom, 'Taken').style.fontSize, px(fontBelow(T, T.fontSizes.xs)), 'a part\'s own size wins');
    const root = labelOf(dom, 'Nickname').parentElement.parentElement;
    assert.equal(root.style.gap, px(T.control.labelGap));
    // Not named by a control inside it: the label is shown to assistive tech.
    assert.equal(labelOf(dom, 'Nickname').closest('[aria-hidden="true"]'), null);
    dispose();
  });

  it('a group puts its role and aria-* on the Field; its label is decoration', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Checkbox.Group label="Toppings" asterisk required defaultValue={[]}>
          <Checkbox value="olives" label="Olives" />
        </Checkbox.Group>
      </Rui>
    ));
    same(dom, skia, 'Toppings * Olives');
    const group = dom.host.querySelector('[role="group"]');
    assert.equal(group.getAttribute('aria-label'), 'Toppings');
    assert.equal(group.getAttribute('aria-required'), 'true');
    assert.ok(labelOf(dom, 'Toppings').closest('[aria-hidden="true"]') !== null);
    dispose();
  });
});
