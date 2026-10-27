// The inputs on the DOM and on Skia: the same text, the same results from
// the same typing, presses, keys and drags, and the same state on both.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write, $flush, $task } from 'rrx-core';
import { $active, View } from 'ren-core';
import {
  Rui, Clock, manualClock, Stack, Row, Field, BASE_COLORS, BASE_THEME, themeOf,
  Input, TextInput, Textarea, PasswordInput, NumberInput, CurrencyInput, currencyAffixes, currencyDecimals, PinInput, MaskInput, formatNumber, applyMask,
  Checkbox, Radio, Switch, Chip, SegmentedControl,
  Slider, AngleSlider, Rating, HueSlider, AlphaSlider, ColorPicker, parseColor, formatColor, FieldGroup, FileInput, Select,
} from 'rui-core';
import { tooltipColors, fontBelow } from '../src/theme/resolve.js';
import { optionPadOf, marksOf, marksCached, MARKS_KEPT, stepOn } from '../src/core/inputs/shared.js';
import { Window } from 'happy-dom';
import { mount } from 'ren-core/host';
import { Flow } from 'ren-canv';
import { $dom } from 'ren-dom';
import { both, fakeDocument, onDom, closeWindow } from './harness.jsx';
import { items, tap, values, type, typeHere, caretAt, carets, replace, key, blur, press, states, same, primitives, drag, boxOf } from './inputs-harness.jsx';

// ---------------------------------------------------------------------------

describe('rui-core text inputs on the DOM and on Skia', () => {
  it("Field, the combobox fields, FileInput and Checkbox share the field geometry of the theme's tokens", () => {
    const T = BASE_THEME;
    const dom = onDom(
      () => (
        <Rui>
          <Stack>
            <TextInput label="Name" description="Who" error="Needed" disabled />
            <Select label="Pick" description="One" data={['a']} disabled />
            <FileInput label="File" disabled />
            <Checkbox label="Box" description="Tick" />
          </Stack>
        </Rui>
      ),
      { width: 480, height: 480 },
    );
    const px = (/** @type {number} */ n) => `${n}px`;
    const label = (/** @type {string} */ text) => dom.nodes('Label').find(n => n.textContent === text);
    // The labels in the strong weight (on the label or its row).
    for (const text of ['Name', 'Pick']) {
      const node = label(text);
      assert.equal(node.style.fontWeight || node.parentElement.style.fontWeight, String(T.weights.strong), text);
    }
    // The notes a type step below the field's text (sm: 13), at the tight leading.
    for (const text of ['Who', 'Needed', 'One', 'Tick']) {
      assert.equal(label(text).style.fontSize, px(fontBelow(T, T.fontSizes.sm)), text);
      assert.equal(label(text).style.lineHeight, String(T.lineHeights.xs), text);
    }
    // Label, notes and field `control.labelGap` apart.
    const columns = dom.nodes('View').filter(n => n.style.flexDirection === 'column' && n.style.gap === px(T.control.labelGap));
    assert.ok(columns.length >= 3, 'Field, the Select and the FileInput stack at the label gap');
    // The text `ratios.inset` of the height (sm: 30) in from the start; disabled at `opacity.disabled`.
    const edit = dom.nodes('Edit')[0];
    assert.equal(edit.style.paddingLeft, px(Math.round(T.ratios.inset * 30)));
    const dimmed = dom.nodes('View').filter(n => n.style.opacity === String(T.opacity.disabled));
    assert.equal(dimmed.length, 3, 'the three disabled fields');
    dom.dispose();
    // An option's padding: control.optionPad at md, scaled with the text elsewhere.
    assert.deepEqual(optionPadOf(T, 'md'), T.control.optionPad);
    assert.deepEqual(optionPadOf(T, 'xl'), T.control.optionPad.map(v => Math.round((v * T.fontSizes.xl) / T.fontSizes.md)));
  });

  it('TextInput: its height from the theme\'s sizes.control, on both renderers', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui theme={themeOf({ sizes: { control: { md: 40 } } })}>
        <TextInput size="md" defaultValue="hi" />
      </Rui>
    ));
    const box = dom.nodes('Edit')[0].parentElement;
    assert.equal(box.style.height, '40px');
    const edit = items(skia, 4)[0];
    assert.equal(edit.parent.getBoundingClientRect().height, 40, 'on Skia too');
    dispose();
  });

  it('TextInput: label, asterisk, description, error, typing, controlled and uncontrolled', () => {
    const s = states();
    const seen = /** @type {string[]} */ ([]);
    const view = () => {
      const v = s.make('');
      return (
        <Rui>
          <Stack>
            <TextInput label="Name" description="Your name" required asterisk placeholder="Jane" value={v} onChange={(/** @type {string} */ x) => $write(v, x)} />
            <TextInput label="City" error="Required" defaultValue="Rome" onChange={(/** @type {string} */ x) => seen.push(x)} />
            <TextInput label="Off" disabled value="fixed" />
            <TextInput label="Read" readOnly defaultValue="kept" />
            <TextInput label="Needed" required />
          </Stack>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    same(dom, skia, 'Name * Your name Jane City Rome Required Off fixed Read kept Needed');
    // `required` alone shows no mark: the Edit says it is required.
    assert.equal(dom.nodes('Edit')[4].getAttribute('aria-required'), 'true');
    assert.equal(dom.nodes('Edit')[1].getAttribute('aria-required'), null);
    // Disabled and read-only are the Edit's own states.
    assert.equal(dom.nodes('Edit')[2].disabled, true);
    assert.equal(dom.nodes('Edit')[3].readOnly, true);
    const [off, kept] = [items(skia, 4)[2], items(skia, 4)[3]];
    tap(skia, off);
    assert.notEqual(skia.skia.focused, off, 'a disabled field takes no focus');
    tap(skia, kept);
    assert.equal(skia.skia.focused, kept, 'a read-only field takes focus');
    skia.skia.key('x');
    $flush(skia.root);
    assert.equal(kept.draft, 'kept', 'and no edits');
    type(dom, skia, 0, 'Ann');
    assert.deepEqual(s.get(), ['Ann', 'Ann']);
    assert.deepEqual(values(dom, skia, 0), ['Ann', 'Ann']);
    type(dom, skia, 1, 'e');
    assert.deepEqual(values(dom, skia, 1), ['Romee', 'Romee'], 'uncontrolled keeps its own value');
    assert.deepEqual(seen, ['Romee', 'Romee']);
    same(dom, skia, 'Name * Your name Ann City Romee Required Off fixed Read kept Needed');
    // A controlled value that refuses an edit stays as it was: an input event on 'fixed' (no onChange) is put back.
    const fixed = dom.nodes('Edit')[2];
    fixed.value = 'fixedx';
    fixed.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    $flush(dom.root);
    assert.equal(fixed.value, 'fixed');
    dispose();
  });

  it('Input holds a controlled value that ignores edits', () => {
    const view = () => (
      <Rui>
        <Input value="same" onChange={() => {}} start={<Stack />} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    type(dom, skia, 0, 'x');
    assert.deepEqual(values(dom, skia), ['same', 'same']);
    dispose();
  });

  it('placeholders in the placeholder color, the error color on error', () => {
    const view = () => (
      <Rui>
        <Stack>
          <TextInput placeholder="Jane" />
          <TextInput placeholder="Bad" invalid />
        </Stack>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    // The page's placeholder (gray.6 in light) and the error color (red.6).
    const [gray6, red6] = [BASE_COLORS.gray[6], BASE_COLORS.red[6]];
    assert.deepEqual(dom.nodes('Edit').map(n => n.style.getPropertyValue('--ren-placeholder')), [gray6, red6]);
    skia.text();
    const painted = (/** @type {string} */ t) => skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === t)[5];
    assert.deepEqual([painted('Jane'), painted('Bad')], [`#ff${gray6.slice(1)}`, `#ff${red6.slice(1)}`]);
    dispose();
  });

  it('Textarea autosize grows with its wrapped lines between minRows and maxRows', () => {
    const view = () => (
      <Rui>
        <Textarea label="Notes" autosize minRows={2} maxRows={4} defaultValue="a" />
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    const high = () => items(skia, 4)[0].getBoundingClientRect().height;
    const two = high();
    // The DOM grows it in the browser (CSS field-sizing) between the same bounds.
    const node = dom.nodes('Edit')[0];
    assert.equal(node.style.getPropertyValue('field-sizing'), 'content');
    assert.equal(parseFloat(node.style.minHeight), two, 'minRows: the same height');
    replace(dom, skia, 0, 'a\nb\nc');
    const three = high();
    assert.ok(three > two, 'three lines are higher than two');
    replace(dom, skia, 0, 'word '.repeat(80).trim());
    assert.ok(high() > two, 'lines wrapped by width grow it too');
    replace(dom, skia, 0, 'a\nb\nc\nd\ne\nf');
    const most = high();
    assert.equal(parseFloat(node.style.maxHeight), most, 'maxRows: the same height');
    replace(dom, skia, 0, 'a\nb\nc\nd\ne');
    assert.equal(high(), most, 'no higher than maxRows');
    replace(dom, skia, 0, 'a\nb\nc\nd');
    assert.ok(Math.abs(high() - most) < 1, `four rows: maxRows (${high()} vs ${most}, three ${three}, two ${two})`);
    assert.deepEqual(values(dom, skia), ['a\nb\nc\nd', 'a\nb\nc\nd']);
    dispose();
  });

  it('PasswordInput hides its value and shows it on the toggle', () => {
    const s = states();
    const view = () => {
      const v = s.make('');
      return (
        <Rui>
          <PasswordInput label="Password" value={v} onChange={(/** @type {string} */ x) => $write(v, x)} />
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    type(dom, skia, 0, 'abc');
    assert.deepEqual(s.get(), ['abc', 'abc'], 'the real value');
    assert.deepEqual(values(dom, skia), ['abc', 'abc'], 'the Edit holds it');
    // A secret Edit: a password input on the DOM, bullets drawn on Skia.
    const node = dom.nodes('Edit')[0];
    assert.equal(node.type, 'password');
    assert.equal(skia.text(), 'Password •••');
    node.value = 'ab';
    node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    skia.skia.key('Backspace');
    assert.deepEqual(s.get(), ['ab', 'ab']);
    // The toggle is the field's one Action, a plain button named for what a press does.
    const labels = () => [dom.nodes('Action')[0].getAttribute('aria-label'), items(skia, 5)[0].label];
    assert.deepEqual(labels(), ['Show password', 'Show password']);
    assert.equal(dom.nodes('Action')[0].getAttribute('aria-pressed'), null);
    dom.nodes('Action')[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    tap(skia, items(skia, 5)[0]);
    assert.deepEqual(values(dom, skia), ['ab', 'ab'], 'shown');
    assert.equal(node.type, 'text');
    assert.deepEqual(labels(), ['Hide password', 'Hide password']);
    same(dom, skia, 'Password ab');
    type(dom, skia, 0, 'z');
    assert.deepEqual(s.get(), ['abz', 'abz']);
    dispose();
  });

  it('PasswordInput: defaultShown, controlled shown with onShownChange, revealable={false}', () => {
    const s = states();
    const seen = /** @type {boolean[]} */ ([]);
    const view = () => {
      const on = s.make(false);
      return (
        <Rui>
          <Stack>
            <PasswordInput label="Open" defaultShown defaultValue="pw" />
            <PasswordInput label="Held" defaultValue="pw" shown={on} onShownChange={(/** @type {boolean} */ x) => (seen.push(x), $write(on, x))} />
            <PasswordInput label="Fixed" defaultValue="pw" revealable={false} />
          </Stack>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    const edits = dom.nodes('Edit');
    assert.equal(edits[0].type, 'text', 'defaultShown starts shown');
    assert.equal(edits[1].type, 'password');
    assert.equal(edits[2].type, 'password');
    // Two toggles: revealable={false} has none.
    assert.equal(dom.nodes('Action').length, 2);
    assert.equal(items(skia, 5).length, 2);
    assert.deepEqual([items(skia, 5)[0].label, items(skia, 5)[1].label], ['Hide password', 'Show password']);
    const press = () => {
      dom.nodes('Action')[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      $flush(dom.root);
      tap(skia, items(skia, 5)[1]);
    };
    press();
    assert.deepEqual(s.get(), [true, true]);
    assert.equal(edits[1].type, 'text');
    press();
    assert.deepEqual(seen, [true, true, false, false], 'true then false on each renderer');
    assert.equal(edits[1].type, 'password');
    dispose();
  });

  it('keeps the number marks of the latest 64 locales only', () => {
    for (let i = 0; i < 500; i++) marksOf(`x-${i}`);
    assert.equal(marksCached(), MARKS_KEPT, 'bounded');
    assert.equal(MARKS_KEPT, 64);
    assert.deepEqual(marksOf('de'), marksOf('de'), 'a tag asked again still answers');
    assert.deepEqual(marksOf('de').decimal, ',');
  });

  it('formatNumber writes plain digits, never an exponent', () => {
    const o = { locale: 'en', decimalMark: '.' };
    for (const [value, opts, want] of /** @type {[number, Record<string, any>, string][]} */ ([
      [1e-7, {}, '0.0000001'],
      [-1.5e-7, {}, '-0.00000015'],
      [1.234e-10, {}, '0.0000000001234'],
      [1e21, {}, '1000000000000000000000'],
      [-2.5e22, {}, '-25000000000000000000000'],
      [1e21, { groupMark: ',' }, '1,000,000,000,000,000,000,000'],
      [1e21, { decimals: 2, fixedDecimals: true }, '1000000000000000000000.00'],
      [1e21, { decimals: 2 }, '1000000000000000000000'],
      [1e-7, { decimals: 2 }, '0'],
      [1e-7, { decimals: 2, fixedDecimals: true }, '0.00'],
      [-1e-7, { decimals: 2, fixedDecimals: true }, '0.00'],
      [3e-7, { decimals: 7 }, '0.0000003'],
      [-1e21, { negative: false }, '1000000000000000000000'],
      [123.456, {}, '123.456'],
      [0, {}, '0'],
      [12.5, { decimals: -1 }, '13'],
      [12.5, { decimals: -3, fixedDecimals: true }, '13'],
      [0.25, { decimals: 1000, fixedDecimals: true }, `0.25${'0'.repeat(98)}`],
      [2e21, { decimals: 200, fixedDecimals: true }, `2000000000000000000000.${'0'.repeat(100)}`],
      [0.25, { decimals: Infinity }, '0.25'],
    ])) assert.equal(formatNumber(value, { ...o, ...opts }), want, `${value} ${JSON.stringify(opts)}`);
    assert.equal(stepOn(1.5, 1, 0, 1, 101), 2, "NumberInput's step with decimals past 100");
  });

  it('NumberInput: parses, rejects letters, clamps on blur, steps with keys and controls, formats', () => {
    assert.equal(formatNumber(1234567.5, { locale: 'en', groupMark: true, prefix: '~', decimals: 2, fixedDecimals: true }), '~1,234,567.50');
    assert.equal(formatNumber(-3, { suffix: ' kg' }), '-3 kg');
    assert.equal(formatNumber(1234.5, { groupMark: true, locale: 'en_US!' }), '1,234.5', 'a malformed locale: the plain marks');
    const empty = marksOf('');
    assert.notEqual(marksOf(undefined), empty, "the platform's marks are cached apart from ''s");
    assert.deepEqual(marksOf(undefined), marksOf(new Intl.NumberFormat().resolvedOptions().locale), "no locale: the platform's");
    const s = states();
    const view = () => {
      const v = s.make(/** @type {number | string} */ (5));
      return (
        <Rui>
          <Stack>
            <NumberInput label="Count" min={0} max={10} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />
            <NumberInput label="Weight" prefix="~" locale="en" groupMark defaultValue={1500} controls={false} />
          </Stack>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    same(dom, skia, 'Count 5 Weight ~1,500');
    type(dom, skia, 0, 'x');
    assert.deepEqual(values(dom, skia), ['5', '5'], 'a letter is refused');
    type(dom, skia, 0, '0');
    assert.deepEqual(s.get(), [50, 50]);
    blur(dom, skia, 0);
    assert.deepEqual(s.get(), [10, 10], 'clamped to max on blur');
    assert.deepEqual(values(dom, skia), ['10', '10']);
    const node = dom.nodes('Edit')[0];
    const edit = items(skia, 4)[0];
    node.focus();
    edit.focus();
    key(dom, node, skia, 'ArrowDown');
    key(dom, node, skia, 'ArrowDown');
    assert.deepEqual(s.get(), [8, 8], 'ArrowDown steps down');
    // The controls: increment, decrement.
    dom.nodes('Action')[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    tap(skia, items(skia, 5)[0]);
    assert.deepEqual(s.get(), [9, 9]);
    type(dom, skia, 1, '2');
    assert.deepEqual(values(dom, skia, 1), ['~15,002', '~15,002'], 'reformatted as typed');
    // Typed mid-text, the caret stays after the same digits.
    caretAt(dom, skia, 1, 3);
    typeHere(dom, skia, 1, '9');
    assert.deepEqual(values(dom, skia, 1), ['~159,002', '~159,002']);
    assert.deepEqual(carets(dom, skia, 1), [4, 4]);
    typeHere(dom, skia, 1, '1');
    assert.deepEqual(values(dom, skia, 1), ['~1,591,002', '~1,591,002']);
    assert.deepEqual(carets(dom, skia, 1), [6, 6], 'past the new separator');
    typeHere(dom, skia, 1, 'x');
    assert.deepEqual(values(dom, skia, 1), ['~1,591,002', '~1,591,002'], 'a letter is refused');
    assert.deepEqual(carets(dom, skia, 1), [6, 6], 'the caret where it was');
    dispose();
  });

  it('NumberInput places the caret after a rewritten keystroke at once, whatever task is pending elsewhere', () => {
    /** @type {((outcome: any) => void)[]} */
    const ends = [];
    const view = () => {
      // An unrelated task, pending until the test ends it.
      $task($active(), () => 1, (/** @type {any} */ _, /** @type {(outcome: any) => void} */ complete) => {
        ends.push(complete);
        return () => {};
      });
      return (
        <Rui>
          <NumberInput label="Weight" locale="en" groupMark defaultValue={159002} controls={false} />
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    dom.nodes('Edit')[0].focus();
    items(skia, 4)[0].focus();
    caretAt(dom, skia, 0, 1);
    typeHere(dom, skia, 0, '1');
    assert.deepEqual(values(dom, skia, 0), ['1,159,002', '1,159,002']);
    assert.deepEqual(carets(dom, skia, 0), [3, 3], 'past the new separator, with the task still pending');
    typeHere(dom, skia, 0, 'x');
    assert.deepEqual(carets(dom, skia, 0), [3, 3], 'a refused letter leaves the caret where it was');
    // The user moves the caret; the task ending later moves nothing.
    caretAt(dom, skia, 0, 0);
    for (const end of ends) end({ ok: true, value: 1 });
    $flush(dom.root);
    $flush(skia.root);
    assert.deepEqual(carets(dom, skia, 0), [0, 0], 'the caret stays where the user put it');
    dispose();
  });

  it('NumberInput: the locale\'s marks, and clamp on Enter', () => {
    const s = states();
    const view = () => {
      const v = s.make(/** @type {number | string} */ (1500.5));
      return (
        <Rui>
          <Stack>
            <NumberInput label="Amount" locale="de" groupMark value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />
            <NumberInput label="Seats" max={12} defaultValue={4} />
          </Stack>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    assert.deepEqual(values(dom, skia, 0), ['1.500,5', '1.500,5'], 'German marks: a dot between thousands, a comma before decimals');
    type(dom, skia, 0, '2');
    assert.deepEqual(s.get(), [1500.52, 1500.52], 'typed after the decimal mark');
    type(dom, skia, 1, '0');
    assert.deepEqual(values(dom, skia, 1), ['40', '40'], 'not clamped while typing');
    const node = dom.nodes('Edit')[1];
    node.focus();
    items(skia, 4)[1].focus();
    key(dom, node, skia, 'Enter');
    assert.deepEqual(values(dom, skia, 1), ['12', '12'], 'clamp \'commit\': Enter clamps');
    dispose();
  });

  it('PinInput moves focus as cells fill and completes', () => {
    const s = states();
    /** @type {string[]} */
    const done = [];
    const view = () => {
      const v = s.make('');
      return (
        <Rui>
          <PinInput length={4} accept="digits" value={v} onChange={(/** @type {string} */ x) => $write(v, x)} onComplete={(/** @type {string} */ x) => done.push(x)} />
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    same(dom, skia, '· · · ·');
    const typeAt = (/** @type {number} */ i, /** @type {string} */ ch) => {
      const node = dom.nodes('Edit')[i];
      node.value = ch;
      node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      $flush(dom.root);
      skia.skia.key(ch);
      $flush(skia.root);
    };
    tap(skia, items(skia, 4)[0]);
    typeAt(0, '1');
    assert.equal(dom.document.activeElement, dom.nodes('Edit')[1], 'the DOM moves to the next cell');
    assert.equal(skia.skia.focused, items(skia, 4)[1], 'Skia moves to the next cell');
    typeAt(1, 'a');
    assert.deepEqual(s.get(), ['1', '1'], 'a letter is refused in a number pin');
    typeAt(1, '2');
    typeAt(2, '3');
    typeAt(3, '4');
    assert.deepEqual(s.get(), ['1234', '1234']);
    assert.deepEqual(done, ['1234', '1234']);
    same(dom, skia, '1 2 3 4');
    dispose();
  });

  it('PinInput defaults: six cells, digits only', () => {
    const s = states();
    const view = () => {
      const v = s.make('');
      return (
        <Rui>
          <PinInput value={v} onChange={(/** @type {string} */ x) => $write(v, x)} />
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    same(dom, skia, '· · · · · ·');
    const node = dom.nodes('Edit')[0];
    node.value = 'a7';
    node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    $flush(dom.root);
    assert.equal($read(s.list[0]), '7', 'the letter refused, the digit kept');
    dispose();
  });
});

describe('rui-core choices on the DOM and on Skia', () => {
  it('Checkbox and Checkbox.Group toggle on presses', () => {
    const s = states();
    const view = () => {
      const g = s.make(/** @type {string[]} */ (['apple']));
      return (
        <Rui>
          <Stack>
            <Checkbox label="Accept" description="Terms" />
            <Checkbox label="Half" indeterminate />
            <Checkbox.Group label="Fruits" value={g} onChange={(/** @type {string[]} */ x) => $write(g, x)}>
              <Row>
                <Checkbox value="apple" label="Apple" />
                <Checkbox value="banana" label="Banana" />
                <Checkbox value="cherry" label="Cherry" disabled />
              </Row>
            </Checkbox.Group>
          </Stack>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    same(dom, skia, 'Accept Terms Half Fruits Apple Banana Cherry');
    press(dom, skia, 'Banana');
    press(dom, skia, 'Apple');
    press(dom, skia, 'Cherry');
    assert.deepEqual(s.get(), [['banana'], ['banana']]);
    press(dom, skia, 'Accept');
    const checked = () => [dom.nodes('Action')[0].getAttribute('aria-checked'), items(skia, 5)[0].selected];
    assert.deepEqual(checked(), ['true', true]);
    dispose();
  });

  it('a Switch thumb slides over its duration at any frame rate', () => {
    /** A clock whose frames come every `frame` ms. @param {number} frame */
    const clockOf = frame => {
      let now = 0;
      /** @type {Set<(now: number) => void>} */
      let waiting = new Set();
      return {
        now: () => now,
        pending: () => waiting.size,
        /** @param {(now: number) => void} cb */
        frame(cb) {
          waiting.add(cb);
          return () => void waiting.delete(cb);
        },
        /** @param {number} ms */
        advance(ms) {
          const end = now + ms;
          while (now < end) {
            now = Math.min(end, now + frame);
            const due = waiting;
            waiting = new Set();
            for (const c of due) c(now);
          }
        },
      };
    };
    /** @type {number[]} */
    const took = [];
    for (const frame of [8, 16, 33]) {
      const clock = clockOf(frame);
      const { dom, skia, dispose } = both(() => (
        <Clock value={/** @type {any} */ (clock)}>
          <Rui>
            <Switch label="Slide" duration={160} />
          </Rui>
        </Clock>
      ));
      const left = () => parseFloat(dom.nodes('View').find((/** @type {any} */ n) => n.style.position === 'absolute').style.left);
      const start = left();
      press(dom, skia, 'Slide');
      let t = 0;
      let end = start;
      // Until it stops moving: the time it took to get there.
      for (let last = NaN; t < 2000 && end !== last; ) {
        last = end;
        clock.advance(frame);
        t += frame;
        end = left();
      }
      took.push(t - frame);
      dispose();
    }
    for (const [i, frame] of [8, 16, 33].entries()) assert.ok(Math.abs(took[i] - 160) <= frame, `${frame} ms frames: the slide took ${took[i]} ms, not its 160`);
  });

  it('Radio.Group keeps one value; Switch and Switch.Group toggle', () => {
    const s = states();
    const view = () => {
      const r = s.make(/** @type {string | null} */ (null));
      const sw = s.make(/** @type {string[]} */ ([]));
      return (
        <Rui>
          <Stack>
            <Radio.Group label="Pick" value={r} onChange={(/** @type {any} */ x) => $write(r, x)}>
              <Radio value="x" label="Ex" />
              <Radio value="y" label="Why" />
            </Radio.Group>
            <Switch label="Wifi" labels={{ on: 'yes', off: 'no' }} />
            <Switch.Group value={sw} onChange={(/** @type {any} */ x) => $write(sw, x)}>
              <Switch value="bt" label="Bluetooth" />
            </Switch.Group>
          </Stack>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    same(dom, skia, 'Pick Ex Why no Wifi Bluetooth');
    press(dom, skia, 'Why');
    press(dom, skia, 'Ex');
    press(dom, skia, 'Wifi');
    press(dom, skia, 'Bluetooth');
    const all = s.get();
    // Two states per root: the DOM's, then Skia's.
    assert.deepEqual(all.slice(0, 2), ['x', ['bt']]);
    assert.deepEqual(all.slice(2), all.slice(0, 2));
    same(dom, skia, 'Pick Ex Why yes Wifi Bluetooth');
    dispose();
  });

  it('Switch and Slider take their geometry from the control scale of Checkbox and Radio', () => {
    const view = () => (
      <Rui>
        <Switch label="s" />
        <Slider defaultValue={50} marks={[{ value: 25 }, { value: 75 }]} />
      </Rui>
    );
    const { dom, dispose } = both(view);
    const views = dom.nodes('View');
    const box = (/** @type {any} */ n) => [parseFloat(n.style.width), parseFloat(n.style.height)];
    // A Switch is sm by default: an 18 px box; 18 high and 32 wide, its thumb 12 (2 px inside its border).
    const track = views.find((/** @type {any} */ n) => n.style.width === '32px');
    assert.deepEqual(box(track), [32, 18]);
    const knob = views.find((/** @type {any} */ n) => n.style.position === 'absolute' && n.style.width === '12px');
    assert.deepEqual([...box(knob), knob.style.top], [12, 12, '2px']);
    // The slider's thumb: 18 (the box less 4) with a 2 px ring; its marks solid dots `ratios.mark` (0.3) of it (5).
    const thumb = dom.nodes('Action').find((/** @type {any} */ n) => n.getAttribute('role') === 'slider');
    assert.deepEqual([...box(thumb), thumb.style.borderTopWidth], [18, 18, '2px']);
    const dots = views.filter((/** @type {any} */ n) => n.style.width === '5px' && n.style.height === '5px');
    assert.equal(dots.length, 2, 'two marks');
    assert.notEqual(dots[0].style.background, dots[1].style.background, 'the passed mark in the tone, the other in the rule color');
    dispose();
  });

  it('Switch slides its thumb on the Clock', () => {
    const clock = manualClock();
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Switch label="Slide" />
        </Rui>
      </Clock>
    );
    const { dom, skia, dispose } = both(view);
    const left = () => [parseFloat(dom.nodes('View').find((/** @type {any} */ n) => n.style.position === 'absolute').style.left), items(skia, 0).find(n => n.style.position === 1).getBoundingClientRect().left - items(skia, 5)[0].getBoundingClientRect().left];
    const [d0] = left();
    press(dom, skia, 'Slide');
    clock.advance(64);
    const [d1] = left();
    assert.ok(d1 > d0, 'moving');
    clock.advance(300);
    const [d2, s2] = left();
    assert.ok(d2 > d1);
    assert.ok(Math.abs(s2 - d2 - 1) <= 1, 'the same place on Skia (its border inside the track)');
    dispose();
  });

  it('SegmentedControl selects a segment and slides its indicator', () => {
    const clock = manualClock();
    const s = states();
    const view = () => {
      const v = s.make('apple');
      return (
        <Clock value={clock}>
          <Rui>
            <SegmentedControl data={['apple', 'banana', { value: 'cherry', label: 'Cherry', disabled: true }]} value={v} onChange={(/** @type {string} */ x) => $write(v, x)} />
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view);
    same(dom, skia, 'apple banana Cherry');
    press(dom, skia, 'banana');
    press(dom, skia, 'Cherry');
    assert.deepEqual(s.get(), ['banana', 'banana']);
    const indicator = () => dom.nodes('View').find((/** @type {any} */ n) => n.style.position === 'absolute').style.left;
    assert.equal(indicator(), '0%');
    clock.advance(400);
    assert.equal(parseFloat(indicator()).toFixed(3), (100 / 3).toFixed(3), 'slid to the second third');
    dispose();
  });

  it('Switch and SegmentedControl slide when their value is written from a timer, outside any handler', async () => {
    const clock = manualClock();
    const on = states();
    const pick = states();
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Switch label="Slide" checked={on.make(false)} />
          <SegmentedControl data={['apple', 'banana']} value={pick.make('apple')} />
        </Rui>
      </Clock>
    );
    const { dom, skia, dispose } = both(view);
    const absolute = () => dom.nodes('View').filter((/** @type {any} */ n) => n.style.position === 'absolute');
    const [thumb0] = absolute().map((/** @type {any} */ n) => parseFloat(n.style.left));
    const skiaThumb = () => items(skia, 0).find(n => n.style.position === 1).getBoundingClientRect().left;
    const s0 = skiaThumb();
    // A timer's write flushes with no view being built: the slides start from the value's Watch.
    await new Promise((resolve, reject) =>
      // timer: feature, the write under test comes from a timer, outside any handler
      setTimeout(() => {
        try {
          for (const s of [...on.list, ...pick.list]) $write(s, $read(s) === false ? true : 'banana');
          $flush(dom.root);
          $flush(skia.root);
          resolve(undefined);
        } catch (error) {
          reject(error);
        }
      }),
    );
    clock.advance(400);
    const [thumb1, indicator] = absolute().map((/** @type {any} */ n) => n.style.left);
    assert.ok(parseFloat(thumb1) > thumb0, 'the thumb slid on the DOM');
    assert.ok(skiaThumb() > s0, 'and on Skia');
    assert.equal(indicator, '50%', 'the indicator slid to the second half');
    assert.equal(clock.pending(), 0, 'no frames once there');
    dispose();
  });

  it('SegmentedControl is one Tab stop; the arrows, Home and End check and focus a segment, wrapping past disabled ones', async () => {
    const { focusables } = await import('ren-core/host');
    const clock = manualClock();
    const s = states();
    const view = () => {
      const v = s.make(null);
      return (
        <Clock value={clock}>
          <Rui>
            <SegmentedControl aria-label="View" data={['List', 'Board', { value: 'Cal', label: 'Cal', disabled: true }, 'Time']} value={v} onChange={(/** @type {string} */ x) => $write(v, x)} />
            <Checkbox label="After" />
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view);
    const stops = () => focusables(dom.host).map((/** @type {any} */ n) => n.getAttribute('role') === 'radio' ? n.textContent : n.getAttribute('role'));
    assert.deepEqual(stops(), ['List', 'checkbox'], 'the DOM: the first segment (no value) and the checkbox');
    dom.host.querySelector('[role="radio"][aria-checked="true"]').focus();
    skia.press('List');
    assert.equal(skia.skia.focused?.label, 'List', 'Skia: the press focuses the checked segment');
    /** @param {string} name */
    const both2 = name => {
      dom.document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
      $flush(dom.root);
      skia.skia.key(name);
      $flush(skia.root);
      return [dom.document.activeElement?.textContent, skia.skia.focused?.label, ...s.get()];
    };
    assert.deepEqual(both2('ArrowRight'), ['Board', 'Board', 'Board', 'Board'], 'the next checked and focused');
    assert.deepEqual(stops(), ['Board', 'checkbox'], 'still one stop: the checked segment');
    assert.deepEqual(both2('ArrowRight'), ['Time', 'Time', 'Time', 'Time'], 'past the disabled one');
    assert.deepEqual(both2('ArrowDown'), ['List', 'List', 'List', 'List'], 'wrapping');
    assert.deepEqual(both2('ArrowLeft'), ['Time', 'Time', 'Time', 'Time'], 'back, wrapping');
    assert.deepEqual(both2('ArrowUp'), ['Board', 'Board', 'Board', 'Board']);
    assert.deepEqual(both2('Home'), ['List', 'List', 'List', 'List']);
    assert.deepEqual(both2('End'), ['Time', 'Time', 'Time', 'Time']);
    skia.skia.key('Tab');
    $flush(skia.root);
    assert.equal(skia.skia.focused?.label, 'After', 'Skia: Tab leaves the group at once');
    press(dom, skia, 'Board');
    assert.deepEqual(s.get(), ['Board', 'Board'], 'a press still checks an unchecked segment');
    dispose();
  });

  it('SegmentedControl: every segment an Action, the checked one in the Tab order (tabIndex 0), the others -1; Tab and Shift+Tab reach the checked one', () => {
    const clock = manualClock();
    const s = states();
    const view = () => {
      const v = s.make('Board');
      return (
        <Clock value={clock}>
          <Rui>
            <Checkbox label="Before" />
            <SegmentedControl aria-label="View" data={['List', 'Board', 'Time']} value={v} onChange={(/** @type {string} */ x) => $write(v, x)} />
            <Checkbox label="After" />
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view);
    const radios = () => [...dom.host.querySelectorAll('[role="radio"]')].map((/** @type {any} */ n) => [n.textContent, n.getAttribute('data-ren'), n.getAttribute('tabindex'), n.getAttribute('aria-checked')]);
    assert.deepEqual(radios(), [['List', 'Action', '-1', 'false'], ['Board', 'Action', '0', 'true'], ['Time', 'Action', '-1', 'false']]);
    skia.text();
    const segments = items(skia, 5).filter((/** @type {any} */ i) => i.get('role') === 'radio');
    assert.deepEqual(segments.map((/** @type {any} */ i) => [i.kind, i.tabIndex, i.get('aria-checked')]), [[5, -1, 'false'], [5, 0, 'true'], [5, -1, 'false']], 'Skia: Actions, one in the Tab order');
    // Tab from before the group: the checked segment, with the keyboard's focus ring; Tab again leaves it.
    skia.press('Before');
    skia.skia.key('Tab');
    $flush(skia.root);
    assert.equal(skia.skia.focused?.label, 'Board');
    assert.equal(skia.skia.ring, true, 'Skia: the keyboard focus rings it');
    skia.skia.key('Tab');
    $flush(skia.root);
    assert.equal(skia.skia.focused?.label, 'After');
    skia.skia.key('Tab', true);
    $flush(skia.root);
    assert.equal(skia.skia.focused?.label, 'Board', 'Shift+Tab comes back to the checked segment');
    // The arrows move the stop.
    skia.skia.key('ArrowRight');
    $flush(skia.root);
    dom.host.querySelector('[role="radio"][aria-checked="true"]').focus();
    dom.document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    $flush(dom.root);
    assert.deepEqual(s.get(), ['Time', 'Time']);
    assert.deepEqual(radios().map(r => r[2]), ['-1', '-1', '0']);
    assert.deepEqual(segments.map((/** @type {any} */ i) => i.tabIndex), [-1, -1, 0]);
    assert.equal(skia.skia.focused?.label, 'Time');
    dispose();
  });

  it('SegmentedControl: a pointer press gives the focus to the segment it checks, as an outside change does while the focus is inside', () => {
    const clock = manualClock();
    const s = states();
    const view = () => {
      const v = s.make('List');
      return (
        <Clock value={clock}>
          <Rui>
            <SegmentedControl aria-label="View" data={['List', 'Board', { value: 'Cal', label: 'Cal', disabled: true }, 'Time']} value={v} onChange={(/** @type {string} */ x) => $write(v, x)} />
            <Checkbox label="After" />
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view);
    const focused = () => [dom.document.activeElement?.textContent ?? null, skia.skia.focused?.label ?? null];
    dom.host.querySelector('[role="radio"][aria-checked="true"]').focus();
    skia.press('List');
    assert.deepEqual(focused(), ['List', 'List']);
    // A browser's mousedown on a View (no focus of its own) takes the focus to the body; Skia's press does the same.
    dom.document.activeElement.blur();
    press(dom, skia, 'Board');
    assert.deepEqual(s.get(), ['Board', 'Board']);
    assert.deepEqual(focused(), ['Board', 'Board'], 'the segment the press checked has the focus');
    dom.document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    $flush(dom.root);
    skia.skia.key('ArrowRight');
    $flush(skia.root);
    assert.deepEqual([...focused(), ...s.get()], ['Time', 'Time', 'Time', 'Time'], 'so the arrows go on from it');
    // A controlled value changed from outside while the focus is on the checked segment: the focus follows.
    for (const v of s.list) $write(v, 'List');
    $flush(dom.root);
    $flush(skia.root);
    assert.deepEqual(focused(), ['List', 'List'], 'an outside change moves the focus with the checked segment');
    // While the focus is elsewhere, an outside change leaves it there.
    dom.host.querySelector('[role="checkbox"]').focus();
    skia.press('After');
    for (const v of s.list) $write(v, 'Board');
    $flush(dom.root);
    $flush(skia.root);
    assert.equal(dom.document.activeElement.getAttribute('role'), 'checkbox', 'the DOM: the focus stays on the checkbox');
    assert.equal(skia.skia.focused?.label, 'After', 'Skia: on the checkbox');
    dispose();
  });

  it('SegmentedControl at a narrow width: equal segments, the indicator over the checked one, the labels cut with an ellipsis', () => {
    const clock = manualClock();
    const data = ['DOM', 'three.js overlay', 'three.js panel'];
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <View style={{ width: 150 }}>
            <SegmentedControl stretch data={data} defaultValue="three.js overlay" />
          </View>
        </Rui>
      </Clock>
    );
    const { dom, skia, dispose } = both(view, { width: 150, height: 120 });
    clock.advance(400);
    const views = items(skia, 0);
    const grid = views.find((/** @type {any} */ v) => v.other?.get?.('role') === 'radiogroup').first.first.next;
    /** @type {any[]} */
    const segments = [];
    for (let c = grid.first; c !== null; c = c.next) if (c.other?.get?.('role') === 'radio' || c.role === 'radio') segments.push(c);
    assert.equal(segments.length, 3);
    const box = (/** @type {any} */ n) => {
      const r = n.getBoundingClientRect();
      return [r.x, r.width].map(Math.round);
    };
    const widths = segments.map(c => box(c)[1]);
    assert.ok(Math.max(...widths) - Math.min(...widths) <= 1, `Skia: equal segments (${widths})`);
    assert.ok(box(grid)[1] <= 150, 'inside the narrow parent');
    const indicator = grid.parent.first;
    for (const [a, b] of box(indicator).map((v, k) => [v, box(segments[1])[k]])) assert.ok(Math.abs(a - b) <= 1, `Skia: the indicator over the checked segment (${box(indicator)} vs ${box(segments[1])})`);
    // The DOM: the same equal tracks and ellipsis Labels, which the browser lays out as Skia does.
    const tracks = dom.nodes('View').find((/** @type {any} */ n) => n.style.display === 'grid');
    assert.equal(tracks.style.gridTemplateColumns, 'repeat(3, minmax(0, 1fr))');
    const cut = dom.nodes('Label').filter((/** @type {any} */ n) => n.style.textOverflow === 'ellipsis').map((/** @type {any} */ n) => n.textContent);
    assert.deepEqual(cut, data, 'every segment\'s label ends with an ellipsis where it does not fit');
    dispose();
  });

  for (const orientation of /** @type {const} */ (['horizontal', 'vertical'])) {
    it(`SegmentedControl ${orientation}, not stretched, with labels longer than its room: each label cut inside its segment`, () => {
      const clock = manualClock();
      const room = orientation === 'horizontal' ? 300 : 200;
      const data = ['Everything in the archive', 'Only the unread conversations', 'Starred'];
      const view = () => (
        <Clock value={clock}>
          <Rui>
            <View style={{ width: room }}>
              <SegmentedControl orientation={orientation} data={data} defaultValue="Starred" />
            </View>
          </Rui>
        </Clock>
      );
      const { dom, skia, dispose } = both(view, { width: 360, height: 200 });
      clock.advance(400);
      const group = items(skia, 0).find((/** @type {any} */ v) => v.other?.get?.('role') === 'radiogroup');
      const grid = group.first.first.next;
      /** @type {any[]} */
      const segments = [];
      for (let c = grid.first; c !== null; c = c.next) if (c.other?.get?.('role') === 'radio' || c.role === 'radio') segments.push(c);
      assert.equal(segments.length, 3);
      const rect = (/** @type {any} */ n) => n.getBoundingClientRect();
      // Either way the group stays inside its room: a horizontal one is a grid of flexible tracks fitted to it.
      assert.ok(rect(group).right <= room + 0.5, `Skia: the group inside its room (${rect(group).right})`);
      const across = segments.map(s => Math.round(orientation === 'horizontal' ? rect(s).width : rect(s).height));
      assert.ok(Math.max(...across) - Math.min(...across) <= 1, `Skia: equal segments (${across})`);
      for (const s of segments) {
        let label = s;
        while (label.kind !== 3) label = label.first; // a Label (ren-canv's kind)
        assert.ok(rect(label).left >= rect(s).left - 0.5 && rect(label).right <= rect(s).right + 0.5, `Skia: "${label.text}" inside its segment (${rect(label).left}-${rect(label).right} in ${rect(s).left}-${rect(s).right})`);
      }
      // The DOM: the label's row stretched across its segment (a centered one is as wide as its text), the Label free
      // to shrink below its text, so its ellipsis shows.
      const labels = dom.nodes('Label').filter((/** @type {any} */ n) => n.style.textOverflow === 'ellipsis');
      assert.deepEqual(labels.map((/** @type {any} */ n) => [n.textContent, n.style.minWidth, n.parentElement.style.alignSelf]), data.map(t => [t, '0px', 'stretch']));
      dispose();
    });
  }

  it('Switch and SegmentedControl take MOTION presets; the marks and paddings come from theme ratios', () => {
    const clock = manualClock();
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Switch label="Quick" />
          <Switch label="Calm" duration="calm" />
          <SegmentedControl data={['one', 'two']} duration="quick" />
          <Checkbox label="Box" defaultChecked />
          <Radio label="Dot" defaultChecked />
          <Chip>Off</Chip>
          <Chip defaultChecked>On</Chip>
        </Rui>
      </Clock>
    );
    const { dom, skia, dispose } = both(view);
    const thumbs = () => dom.nodes('View').filter((/** @type {any} */ n) => n.style.position === 'absolute' && n.style.width === '12px');
    press(dom, skia, 'Quick');
    press(dom, skia, 'Calm');
    press(dom, skia, 'two');
    clock.advance(16 * 8);
    const [quick, calm] = thumbs().map((/** @type {any} */ n) => parseFloat(n.style.left));
    assert.ok(calm < quick, 'calm (300 ms) is still on its way when quick (110 ms, the default) has arrived');
    assert.deepEqual(thumbs().map((/** @type {any} */ n) => n.style.borderTopWidth), ['0px', '0px'], 'a checked thumb: no hairline, the filled track frames it');
    const indicator = dom.nodes('View').find((/** @type {any} */ n) => n.style.position === 'absolute' && n.style.left.endsWith('%'));
    assert.equal(indicator.style.left, '50%', 'the quick preset: there within 128 ms');
    // An 18 px box: the check `ratios.icon` of it (11), the radio's dot `ratios.mark` (5).
    const shapes = dom.nodes('Shape').map((/** @type {any} */ n) => [n.style.width, n.style.height]);
    assert.ok(shapes.some(([w, h]) => w === '11px' && h === '11px'), 'the check mark');
    assert.ok(dom.nodes('View').some((/** @type {any} */ n) => n.style.width === '5px' && n.style.height === '5px' && n.style.borderTopLeftRadius === '2.5px'), 'the dot');
    // Chip sm: control.pad (12) at rest, control.densePad (6) checked; the check `ratios.glyph` of its 26 px (11).
    const [off, on] = dom.nodes('Action').filter((/** @type {any} */ n) => n.textContent === 'Off' || n.textContent === 'On');
    assert.deepEqual([off.style.paddingLeft, off.style.paddingRight, on.style.paddingLeft, on.style.paddingRight], ['12px', '12px', '6px', '6px']);
    dispose();
  });
});


describe('rui-core sliders on the DOM and on Skia', () => {
  it('Slider: a drag with pointer capture, marks, keys', () => {
    const s = states();
    /** @type {number[]} */
    const ends = [];
    const view = () => {
      const v = s.make(20);
      return (
        <Rui>
          <Stack p="xl">
            <Slider value={v} onChange={(/** @type {number} */ x) => $write(v, x)} onCommit={(/** @type {number} */ x) => ends.push(x)} marks={[{ value: 0, label: '0%' }, { value: 50, label: '50%' }, { value: 100, label: '100%' }]} />
          </Stack>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    same(dom, skia, '0% 50% 100%');
    // The track area: the first View with pointer handlers.
    const area = boxOf(skia, n => n.pointers);
    const y = area.top + area.height / 2;
    drag(dom, skia, [[area.left + area.width * 0.2, y], [area.left + area.width * 0.6, y], [area.left + area.width * 0.75, y]]);
    assert.deepEqual(s.get(), [75, 75]);
    assert.deepEqual(ends, [75, 75]);
    drag(dom, skia, [[area.left + area.width * 0.5, y], [area.right + 100, y]]);
    assert.deepEqual(s.get(), [100, 100], 'captured past the track: the max');
    const thumbDom = dom.nodes('Action')[0];
    const thumbSkia = items(skia, 5)[0];
    thumbDom.focus();
    thumbSkia.focus();
    key(dom, thumbDom, skia, 'ArrowLeft');
    key(dom, thumbDom, skia, 'ArrowLeft');
    assert.deepEqual(s.get(), [98, 98]);
    key(dom, thumbDom, skia, 'Home');
    assert.deepEqual(s.get(), [0, 0]);
    dispose();
  });

  it('AngleSlider: 0 at the top, clockwise, keys', () => {
    const s = states();
    const view = () => {
      const v = s.make(0);
      return (
        <Rui>
          <Stack p="xl">
            <AngleSlider value={v} onChange={(/** @type {number} */ x) => $write(v, x)} step={5} />
          </Stack>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    same(dom, skia, '0°');
    const r = items(skia, 5)[0].getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    drag(dom, skia, [[cx + 20, cy]]);
    assert.deepEqual(s.get(), [90, 90], 'right is 90');
    drag(dom, skia, [[cx, cy + 20], [cx - 20, cy]]);
    assert.deepEqual(s.get(), [270, 270], 'left is 270');
    same(dom, skia, '270°');
    const node = dom.nodes('Action')[0];
    node.focus();
    items(skia, 5)[0].focus();
    key(dom, node, skia, 'ArrowRight');
    assert.deepEqual(s.get(), [275, 275]);
    dispose();
  });

  it('Rating maps a press onto its stars, inside its padding and border (Skia)', () => {
    for (const extra of [{}, { p: 20 }, { style: { border: 8 } }]) {
      /** @type {number[]} */
      const got = [];
      const { skia, dispose } = both(() => (
        <Rui>
          <Rating {...extra} onChange={(/** @type {number} */ v) => got.push(v)} />
        </Rui>
      ));
      skia.text();
      const act = primitives(skia).find((/** @type {any} */ i) => i.label === 'Rating');
      const r = act.getBoundingClientRect();
      const inset = 'p' in extra ? 20 : 'style' in extra ? 8 : 0;
      const stars = r.width - 2 * inset;
      // A little into the last star, and a little into the first.
      for (const [x, want] of [[r.left + inset + (stars / 5) * 4 + 3, 5], [r.left + inset + 3, 1]]) {
        skia.skia.press(x, r.top + r.height / 2);
        skia.skia.release(x, r.top + r.height / 2);
        $flush(skia.root);
        assert.equal(got.at(-1), want, `${JSON.stringify(extra)}: star ${want}`);
      }
      dispose();
    }
  });

  it('Rating: divisions, a hover preview, readOnly', () => {
    /** @type {any[]} */
    const hovers = [];
    const s = states();
    const view = () => {
      const v = s.make(0);
      return (
        <Rui>
          <Stack p="xl">
            <Rating value={v} onChange={(/** @type {number} */ x) => $write(v, x)} divisions={2} onHover={(/** @type {any} */ x) => hovers.push(x)} />
            <Rating value={3} readOnly size="xs" />
          </Stack>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    const r = items(skia, 5)[0].getBoundingClientRect();
    // Each star a square of the theme's sizes.rating (md 24, xs 16), side by side.
    assert.deepEqual([r.width, r.height], [5 * BASE_THEME.sizes.rating.md, BASE_THEME.sizes.rating.md]);
    assert.equal(items(skia, 5)[1].getBoundingClientRect().width, 5 * BASE_THEME.sizes.rating.xs);
    const y = r.top + r.height / 2;
    // 5 stars: 0.33 of the width is the second star's first half: 1.5 stars at halves.
    drag(dom, skia, [[r.left + r.width * 0.33, y]]);
    assert.deepEqual(s.get(), [2, 2], 'ceil to the half: 1.65 stars is 2');
    drag(dom, skia, [[r.left + r.width * 0.25, y]]);
    assert.deepEqual(s.get(), [1.5, 1.5]);
    const fills = () => [
      dom.nodes('View').filter((/** @type {any} */ n) => n.style.overflow === 'hidden').map((/** @type {any} */ n) => n.style.width).slice(0, 5).join(' '),
      primitives(skia).filter(n => n.style.overflow === 1).map(n => Math.round((n.getBoundingClientRect().width / r.width) * 5 * 100) + '%').slice(0, 5).join(' '),
    ];
    assert.deepEqual(fills(), ['100% 50% 0% 0% 0%', '100% 50% 0% 0% 0%']);
    const ro = items(skia, 5)[1].getBoundingClientRect();
    drag(dom, skia, [[ro.left + 2, ro.top + ro.height / 2]]);
    assert.deepEqual(s.get(), [1.5, 1.5], 'the read-only rating did not reach the first');
    // The pointer over the stars previews a value; leaving them says null.
    skia.skia.move(r.left + r.width * 0.7, y);
    skia.skia.leave();
    $flush(skia.root);
    assert.deepEqual(hovers, [3.5, null], 'onHover: the value under the pointer, then null as it leaves');
    dispose();
  });
});

describe('number and slider stepping', () => {
  it('NumberInput commits a value typed with trailing zeros, showing the text as typed; a draft stays a draft', () => {
    const s = states();
    const view = () => {
      const v = s.make(/** @type {any} */ (2.05));
      return (
        <Rui>
          <NumberInput label="A" value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    replace(dom, skia, 0, '2.0');
    assert.deepEqual(s.get(), [2, 2], '"2.0" commits 2');
    assert.deepEqual(values(dom, skia, 0), ['2.0', '2.0'], 'and shows as typed');
    replace(dom, skia, 0, '3.50');
    assert.deepEqual(s.get(), [3.5, 3.5], '"3.50" commits 3.5');
    replace(dom, skia, 0, '4.');
    assert.deepEqual(s.get(), [3.5, 3.5], 'a trailing mark is a draft');
    replace(dom, skia, 0, '-');
    assert.deepEqual(s.get(), [3.5, 3.5], 'a lone minus is a draft');
    dispose();
  });

  it('NumberInput with clamp always shows the clamped value, not a typed "5.0" past max', () => {
    const s = states();
    const view = () => {
      const v = s.make(/** @type {any} */ (1));
      return (
        <Rui>
          <NumberInput label="C" max={3} clamp="always" value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    replace(dom, skia, 0, '5.0');
    assert.deepEqual(s.get(), [3, 3], 'clamped to max');
    assert.deepEqual(values(dom, skia, 0), ['3', '3'], 'and shows what it committed');
    replace(dom, skia, 0, '2.50');
    assert.deepEqual(values(dom, skia, 0), ['2.50', '2.50'], 'within bounds, the text as typed');
    dispose();
  });

  it('a step not above 0 steps by the default 1, as a browser reads it; a step of 1e-7 moves', () => {
    const s = states();
    const view = () => {
      const a = s.make(/** @type {any} */ (5));
      const b = s.make(/** @type {any} */ (5));
      const c = s.make(/** @type {any} */ (0));
      const d = s.make(5);
      const e = s.make(5);
      const f = s.make(0);
      return (
        <Rui>
          <NumberInput label="Zero" step={0} value={a} onChange={(/** @type {any} */ x) => $write(a, x)} />
          <NumberInput label="Negative" step={-1} value={b} onChange={(/** @type {any} */ x) => $write(b, x)} />
          <NumberInput label="Tiny" step={1e-7} value={c} onChange={(/** @type {any} */ x) => $write(c, x)} />
          <Slider step={0} value={d} onChange={(/** @type {number} */ x) => $write(d, x)} />
          <Slider step={-1} value={e} onChange={(/** @type {number} */ x) => $write(e, x)} />
          <Slider max={1} step={1e-7} value={f} onChange={(/** @type {number} */ x) => $write(f, x)} />
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    const at = (/** @type {number} */ i) => $read(s.list[i]);
    for (const i of [0, 1, 2]) {
      const node = dom.nodes('Edit')[i];
      node.focus();
      items(skia, 4)[i].focus();
      key(dom, node, skia, 'ArrowUp');
    }
    assert.deepEqual([at(0), at(1), at(2)], [6, 6, 1e-7], 'NumberInput: 0 and -1 step by 1 upward; 1e-7 moves');
    for (const i of [0, 1, 2]) {
      const n = dom.nodes('Action').filter((/** @type {any} */ x) => x.getAttribute('role') === 'slider')[i];
      n.focus();
      items(skia, 5)[i].focus();
      key(dom, n, skia, 'ArrowRight');
    }
    assert.deepEqual([at(3), at(4), at(5)], [6, 6, 1e-7], 'Slider: the same');
    dispose();
  });

  it('AngleSlider keys: with snap, mark to mark around the dial; else onto the step grid, End the last below 360', () => {
    const s = states();
    const view = () => {
      const a = s.make(60);
      const b = s.make(0);
      return (
        <Rui>
          <AngleSlider snap marks={Array.from({ length: 12 }, (_, i) => ({ value: i * 30 }))} value={a} onChange={(/** @type {number} */ x) => $write(a, x)} />
          <AngleSlider step={15} value={b} onChange={(/** @type {number} */ x) => $write(b, x)} />
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    const dials = () => dom.nodes('Action').filter((/** @type {any} */ n) => n.getAttribute('role') === 'slider');
    const k = (/** @type {number} */ i, /** @type {string} */ name) => {
      const n = dials()[i];
      n.focus();
      n.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
      $flush(dom.root);
      return $read(s.list[i]);
    };
    assert.equal(k(0, 'ArrowRight'), 90, 'snap: the next mark');
    assert.equal(k(0, 'Home'), 0, 'snap: Home, the first mark');
    assert.equal(k(0, 'ArrowLeft'), 330, 'snap: back past 0 wraps to the last mark');
    assert.equal(k(0, 'End'), 330, 'snap: End, the last mark');
    assert.equal(k(1, 'End'), 345, 'step 15: End is the last grid value below 360');
    assert.equal(k(1, 'ArrowRight'), 0, 'and on round to 0');
    for (const x of s.list) $write(x, 7);
    assert.equal(k(1, 'ArrowRight'), 15, 'off the grid: onto it, that way');
    dispose();
  });

  it('Rating keys stay on the divisions grid: thirds land exactly on 2 and 3', () => {
    const s = states();
    const view = () => {
      const v = s.make(0);
      return (
        <Rui>
          <Rating divisions={3} value={v} onChange={(/** @type {number} */ x) => $write(v, x)} />
        </Rui>
      );
    };
    const { dom, dispose } = both(view);
    const n = dom.nodes('Action').find((/** @type {any} */ x) => x.getAttribute('role') === 'slider');
    n.focus();
    const press = (/** @type {string} */ k, /** @type {number} */ times) => {
      for (let i = 0; i < times; i++) {
        n.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
        $flush(dom.root);
      }
      return $read(s.list[0]);
    };
    assert.equal(press('ArrowRight', 6), 2, 'six thirds up are 2, not 1.9999999999999998');
    for (const x of s.list) $write(x, 5);
    assert.equal(press('ArrowLeft', 6), 3, 'six thirds down from 5 are 3, not 3.0000000000000004');
    dispose();
  });

  it('NumberInput with negative false never steps below 0', () => {
    const s = states();
    const view = () => {
      const v = s.make(/** @type {any} */ (0));
      return (
        <Rui>
          <NumberInput label="Count" negative={false} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    const node = dom.nodes('Edit')[0];
    node.focus();
    items(skia, 4)[0].focus();
    key(dom, node, skia, 'ArrowDown');
    assert.deepEqual(s.get(), [0, 0]);
    dispose();
  });

  it('NumberInput steps onto its grid in the direction of travel: 1.25 goes to 2 up and 1 down', () => {
    const s = states();
    const view = () => {
      const v = s.make(/** @type {any} */ (1.25));
      return (
        <Rui>
          <NumberInput label="B" value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    const node = dom.nodes('Edit')[0];
    node.focus();
    items(skia, 4)[0].focus();
    key(dom, node, skia, 'ArrowUp');
    assert.deepEqual(s.get(), [2, 2]);
    for (const x of s.list) $write(x, 1.25);
    key(dom, node, skia, 'ArrowDown');
    assert.deepEqual(s.get(), [1, 1]);
    key(dom, node, skia, 'ArrowDown');
    assert.deepEqual(s.get(), [0, 0], 'on the grid: one whole step');
    dispose();
  });

  it('Slider steps on its own grid: an off-grid min, the direction of travel, and Home and End to the marks with snap', () => {
    const s = states();
    const view = () => {
      const a = s.make(0.5);
      const b = s.make(10);
      const c = s.make(50);
      return (
        <Rui>
          <Slider min={0.5} max={10.5} step={1} value={a} onChange={(/** @type {number} */ x) => $write(a, x)} />
          <Slider min={0} max={10} step={3} value={b} onChange={(/** @type {number} */ x) => $write(b, x)} />
          <Slider marks={[{ value: 20 }, { value: 50 }, { value: 80 }]} snap value={c} onChange={(/** @type {number} */ x) => $write(c, x)} />
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    const k = (/** @type {number} */ i, /** @type {string} */ name) => {
      const n = dom.nodes('Action')[i];
      n.focus();
      items(skia, 5)[i].focus();
      key(dom, n, skia, name);
    };
    const at = (/** @type {number} */ i) => [$read(s.list[i]), $read(s.list[i + 3])];
    k(0, 'ArrowUp');
    assert.deepEqual(at(0), [1.5, 1.5], 'min .5, step 1: .5 goes to 1.5');
    k(0, 'ArrowUp');
    assert.deepEqual(at(0), [2.5, 2.5]);
    k(1, 'ArrowDown');
    assert.deepEqual(at(1), [9, 9], 'max 10, step 3: from 10 down to 9, on the grid');
    k(2, 'Home');
    assert.deepEqual(at(2), [20, 20], 'snap: Home is the first mark');
    k(2, 'End');
    assert.deepEqual(at(2), [80, 80], 'snap: End is the last mark');
    dispose();
  });
});

describe('rui-core colors and field groups on the DOM and on Skia', () => {
  it('converts between hex, rgb(a) and hsl(a)', () => {
    const c = parseColor('#2d83db');
    assert.ok(c !== null);
    assert.equal(formatColor(/** @type {any} */ (c), 'hex'), '#2d83db');
    assert.equal(formatColor(/** @type {any} */ (parseColor('rgba(255, 0, 0, 0.5)')), 'rgb', true), 'rgba(255, 0, 0, 0.5)');
    assert.equal(formatColor(/** @type {any} */ (parseColor('hsl(120, 100%, 50%)')), 'hex'), '#00ff00');
    assert.equal(formatColor({ h: 0, s: 100, v: 100, a: 1 }, 'hsl', true), 'hsla(0, 100%, 50%, 1)');
    assert.equal(parseColor('nope'), null);
  });

  it('reads CSS percentages as fractions and clamps what is out of range', () => {
    const alpha = (/** @type {string} */ t) => /** @type {any} */ (parseColor(t)).a;
    const hex = (/** @type {string} */ t) => formatColor(/** @type {any} */ (parseColor(t)), 'hex');
    assert.equal(alpha('rgba(0,0,0,50%)'), 0.5, 'a percent alpha, comma form');
    assert.equal(alpha('rgb(0 0 0 / 50%)'), 0.5, 'a percent alpha, slash form');
    assert.equal(hex('rgb(100%,0%,0%)'), '#ff0000', 'percent channels of 255');
    assert.equal(hex('rgb(300,0,0)'), '#ff0000', 'a channel clamped to 255');
    assert.equal(alpha('hsla(0,100%,50%,2)'), 1, 'alpha clamped to 1');
    for (const hue of ['180', '180deg', '200grad', `${Math.PI}rad`, '0.5turn']) assert.equal(hex(`hsl(${hue} 100% 50%)`), '#00ffff', `a hue of ${hue} is 180 degrees`);
    assert.equal(formatColor(/** @type {any} */ (parseColor('#0080007f')), 'hex', true), '#0080007f', 'an 8-digit hex keeps its alpha exactly');
    assert.equal(formatColor(/** @type {any} */ (parseColor('hsl(0,150%,50%)')), 'rgb'), 'rgb(255, 0, 0)', 'saturation clamped to 100%');
    assert.equal(formatColor(/** @type {any} */ (parseColor('hsl(0,100%,150%)')), 'rgb'), 'rgb(255, 255, 255)', 'lightness clamped to 100%');
    assert.equal(/** @type {any} */ (parseColor('hsl(400,100%,50%)')).h, 40, 'hue 400 turns to 40');
    assert.equal(/** @type {any} */ (parseColor('hsl(-30,100%,50%)')).h, 330, 'hue -30 turns to 330');
  });

  it('HueSlider and AlphaSlider drag to their values', () => {
    const s = states();
    const view = () => {
      const h = s.make(0);
      const a = s.make(1);
      return (
        <Rui>
          <Stack p="xl" w={300}>
            <HueSlider value={h} onChange={(/** @type {number} */ x) => $write(h, x)} />
            <AlphaSlider color="#2d83db" value={a} onChange={(/** @type {number} */ x) => $write(a, x)} />
          </Stack>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    const [hue, alpha] = primitives(skia).filter(n => n.pointers).map(n => n.getBoundingClientRect());
    drag(dom, skia, [[hue.left + hue.width / 2, hue.top + hue.height / 2]]);
    drag(dom, skia, [[alpha.left + alpha.width / 4, alpha.top + alpha.height / 2]]);
    assert.deepEqual(s.get(), [180, 0.25, 180, 0.25]);
    // Anywhere along it: an alpha of two decimals, as its keys give (0.57, not 0.5700000000000001).
    for (let i = 0; i <= 100; i++) {
      drag(dom, skia, [[alpha.left + (alpha.width * i) / 100, alpha.top + alpha.height / 2]]);
      const [, d, , k] = s.get();
      assert.deepEqual([d, k], [Math.round(d * 100) / 100, Math.round(k * 100) / 100], `at ${i}%`);
    }
    dispose();
  });

  it('ColorPicker: swatches choose in the format', () => {
    const s = states();
    const view = () => {
      const v = s.make('#ff0000');
      return (
        <Rui>
          <Stack p="xl">
            <ColorPicker format="rgb" alpha value={v} onChange={(/** @type {string} */ x) => $write(v, x)} swatches={['#2d83db', '#42b453']} />
          </Stack>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    // A swatch: the one Action labeled with its color.
    const swatchDom = dom.nodes('Action').find((/** @type {any} */ n) => n.getAttribute('aria-label') === '#42b453');
    swatchDom.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    const swatchSkia = items(skia, 5).find(n => n.label === '#42b453');
    tap(skia, swatchSkia);
    assert.deepEqual(s.get(), ['rgba(66, 180, 83, 1)', 'rgba(66, 180, 83, 1)']);
    dispose();
  });

  it('ColorPicker: thumbs as discs of their color in a white ring, the preview leading the sliders, sizes from the theme', () => {
    const T = BASE_THEME;
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Stack p="xl" align="start">
          <ColorPicker alpha defaultValue="#ff000080" swatches={['#2d83db', '#42b453']} />
        </Stack>
      </Rui>
    ));
    const side = T.sizes.colorThumb.md;
    const ring = Math.ceil((side * T.ratios.mark) / 2);
    const sliders = dom.nodes('Action').filter((/** @type {any} */ n) => n.getAttribute('role') === 'slider');
    assert.deepEqual(sliders.map((/** @type {any} */ n) => n.getAttribute('aria-label')), ['Saturation', 'Hue', 'Alpha']);
    for (const n of sliders) {
      assert.deepEqual([n.style.width, n.style.borderTopWidth, n.style.borderTopColor || n.style.borderColor, n.style.borderTopLeftRadius], [`${side}px`, `${ring}px`, T.white, '9999px'], 'a white ring, half a mark\'s share of the side');
      assert.ok(n.style.boxShadow.startsWith(`${T.shadows.sm.x}px ${T.shadows.sm.y}px ${T.shadows.sm.blur}px`), 'lifted by shadow sm');
    }
    const bg = (/** @type {any} */ n) => n.style.backgroundColor || n.style.background;
    assert.deepEqual(sliders.map(bg), ['#ff0000', '#ff0000', '#ff000080'], 'each a disc of the color it points at');
    // The panel: sizes.picker md; the row under it led by a round preview as high as both sliders and their gap.
    const panel = sliders[0].parentElement;
    assert.deepEqual([panel.style.height, panel.parentElement.style.width], [`${T.sizes.picker.md.h}px`, `${T.sizes.picker.md.w}px`]);
    const row = panel.nextElementSibling;
    const preview = row.firstElementChild;
    assert.deepEqual([preview.style.width, preview.style.borderTopLeftRadius], [`${side * 2 + T.control.labelGap}px`, '9999px'], 'the preview leads, a disc');
    // The swatches: square, half the label gap apart, their height sharing the width with those gaps.
    const swatch = dom.nodes('Action').find((/** @type {any} */ n) => n.getAttribute('aria-label') === '#2d83db');
    const gap = T.control.labelGap / 2;
    assert.equal(swatch.parentElement.style.gap || swatch.parentElement.style.columnGap, `${gap}px`);
    assert.equal(swatch.style.height, `${Math.floor((T.sizes.picker.md.w - 7 * gap) / 8)}px`, 'the same gap in the square\'s sum');
    assert.equal(items(skia, 5).filter(n => n.label === 'Hue')[0].getBoundingClientRect().width, side, 'the thumb on Skia too');
    dispose();
  });

  it('ColorPicker paints its ramps as gradients, and its hue slider picks by the pointer\'s place', () => {
    const s = states();
    const view = () => {
      const v = s.make('#ff0000');
      return (
        <Rui>
          <Stack p="xl">
            <ColorPicker format="rgb" alpha value={v} onChange={(/** @type {string} */ x) => $write(v, x)} />
          </Stack>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    const hues = '#ff0000 0%, #ffff00 16.667%, #00ff00 33.333%, #00ffff 50%, #0000ff 66.667%, #ff00ff 83.333%, #ff0000 100%';
    const expected = [
      'linear-gradient(90deg, #ffffff 0%, #ff0000 100%)',
      'linear-gradient(180deg, #00000000 0%, #000000 100%)',
      `linear-gradient(90deg, ${hues})`,
      'linear-gradient(90deg, #ff000000 0%, #ff0000 100%)',
    ];
    const css = dom.nodes('View').map(n => n.style.background).filter(b => /gradient\(/.test(b));
    assert.deepEqual(css, expected, 'the panel, its shade, the hue and the alpha: one gradient each');
    assert.deepEqual(items(skia, 0).filter(n => n.style.background?.angle !== undefined).map(n => [n.style.background.angle, n.style.background.stops.length / 2]), [[90, 2], [180, 2], [90, 7], [90, 2]], 'the same on Skia');
    const [, hue] = primitives(skia).filter(n => n.pointers).map(n => n.getBoundingClientRect());
    drag(dom, skia, [[hue.left + hue.width / 3, hue.top + hue.height / 2]]);
    assert.deepEqual(s.get(), ['rgba(0, 255, 0, 1)', 'rgba(0, 255, 0, 1)']);
    dispose();
  });

  it('FieldGroup shows its legend and holds fields', () => {
    const view = () => (
      <Rui>
        <Stack p="xl">
          <FieldGroup legend="Delivery">
            <TextInput label="Street" placeholder="12 Harbour Lane" />
          </FieldGroup>
          <FieldGroup legend="Filled" variant="soft">
            <Checkbox label="Agree" />
          </FieldGroup>
        </Stack>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    same(dom, skia, 'Delivery Street 12 Harbour Lane Filled Agree');
    const item = primitives(skia).find(n => n.style.position === 1);
    const legend = item.getBoundingClientRect();
    const set = item.parent.getBoundingClientRect();
    assert.ok(legend.top < set.top && legend.bottom > set.top, 'the legend sits on the top border');
    dispose();
  });
});

describe('rui-core inputs in the dark scheme and every size', () => {
  it('render the same on both, restyled in place', () => {
    const schemes = /** @type {any[]} */ ([]);
    const view = () => {
      const scheme = $signal($active(), 'light');
      schemes.push(scheme);
      return (
        <Rui scheme={scheme}>
          <Stack>
            {['xs', 'sm', 'md', 'lg', 'xl'].map(size => (
              <Row>
                <TextInput size={size} variant="soft" placeholder={size} />
                <Checkbox size={size} defaultChecked label="c" />
                <Radio size={size} defaultChecked label="r" />
                <Switch size={size} defaultChecked label="s" />
                <Chip size={size} defaultChecked>h</Chip>
              </Row>
            ))}
            <Slider defaultValue={40} readout />
            <Rating defaultValue={2} />
            <ColorPicker format="hsl" alpha defaultValue="hsla(200, 50%, 50%, 0.5)" />
          </Stack>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view, { width: 900, height: 900 });
    const shown = same(dom, skia);
    assert.ok(shown.startsWith('xs c r s h sm c r s h'), shown);
    const before = dom.nodes('Edit')[0].parentElement.style.background;
    for (const s of schemes) $write(s, 'dark');
    assert.notEqual(dom.nodes('Edit')[0].parentElement.style.background, before, 'the dark field');
    same(dom, skia, shown);
    dispose();
  });

  it("Slider's readout wears Tooltip's colors in both schemes", () => {
    const schemes = /** @type {any[]} */ ([]);
    const view = () => {
      const scheme = $signal($active(), 'light');
      schemes.push(scheme);
      return (
        <Rui scheme={scheme}>
          <Slider defaultValue={40} readout />
        </Rui>
      );
    };
    const { dom, dispose } = both(view);
    const tip = () => dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === '40').parentElement.style;
    for (const scheme of /** @type {const} */ (['light', 'dark'])) {
      for (const s of schemes) $write(s, scheme);
      $flush(dom.root);
      const c = tooltipColors(BASE_THEME, scheme);
      assert.deepEqual([tip().background, tip().color].map(v => String(v).toLowerCase()), [c.background, c.text].map(v => v.toLowerCase()), scheme);
    }
    dispose();
  });

  it('puts `style` on the wrapper, takes Chip.Group\'s disabled, and keeps disabled color sliders from keys', async () => {
    const { TextInput, Chip, HueSlider } = await import('rui-core');
    /** @type {any[]} */
    const chips = [];
    /** @type {any[]} */
    const hues = [];
    const { dom, skia, dispose } = both(() => {
      const chip = $signal($active(), null);
      const hue = $signal($active(), 120);
      chips.push(chip);
      hues.push(hue);
      return (
        <Rui>
          <TextInput label="Styled" style={{ background: '#ff0000' }} />
          <Chip.Group value={chip} disabled><Chip value="a">A</Chip></Chip.Group>
          <HueSlider value={hue} disabled />
        </Rui>
      );
    });
    const wrapper = dom.nodes('View').find(n => n.style.background === 'rgb(255, 0, 0)' || n.style.background === '#ff0000' || n.style.backgroundColor === 'rgb(255, 0, 0)');
    assert.ok(wrapper !== undefined, 'the wrapper takes `style`');
    dom.press('A');
    skia.press('A');
    assert.deepEqual(chips.map(c => $read(c)), [null, null], 'a disabled group keeps its chips');
    const thumb = dom.nodes('Action').find(n => n.getAttribute('aria-label') !== null && /hue/i.test(n.getAttribute('aria-label')));
    if (thumb !== undefined) thumb.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal($read(hues[0]), 120, 'no key moves a disabled slider');
    dispose();
  });
});


describe('rui-core FileInput on the DOM and on Skia', () => {
  it('says it is required and invalid, as every field does', () => {
    const { dom, dispose } = both(() => (
      <Rui>
        <Stack>
          <FileInput placeholder="Needed" required />
          <FileInput placeholder="Wrong" error="Pick a PDF" />
          <FileInput placeholder="Free" />
        </Stack>
      </Rui>
    ));
    const press = (/** @type {string} */ t) => dom.nodes('Action').find((/** @type {any} */ n) => n.getAttribute('aria-label') === t);
    assert.equal(press('Needed').getAttribute('aria-required'), 'true');
    assert.equal(press('Wrong').getAttribute('aria-invalid'), 'true');
    assert.equal(press('Free').getAttribute('aria-required'), null);
    assert.equal(press('Free').getAttribute('aria-invalid'), null);
    dispose();
  });

  it('picks files through the dialog, the same on both', async () => {
    /** @type {any[]} */
    const docs = [];
    /** @type {any[]} */
    const heard = [];
    const { dom, skia, dispose } = both(() => {
      const doc = fakeDocument();
      docs.push(doc);
      const log = /** @type {any[]} */ ([]);
      heard.push(log);
      return (
        <Rui>
          <Stack>
            <FileInput label="Resume" placeholder="Pick a file" clearable accept="application/pdf" picker={{ document: doc }} onChange={(/** @type {any} */ f) => log.push(f?.name ?? null)} />
            <FileInput placeholder="Pick files" multiple picker={{ document: doc }} />
            <FileInput placeholder="Off" disabled picker={{ document: doc }} />
          </Stack>
        </Rui>
      );
    });
    assert.equal(dom.text(), 'Resume Pick a file Pick files Off');
    assert.equal(skia.text(), dom.text());
    for (const side of [dom, skia]) {
      side.press('Pick a file');
      side.press('Pick files');
      side.press('Off');
    }
    for (const doc of docs) {
      assert.deepEqual(doc.inputs.map((/** @type {any} */ i) => [i.accept, i.multiple, i.clicked]), [['application/pdf', false, 1], ['', true, 1]], 'none while disabled');
      doc.inputs[0].answer([{ name: 'cv.pdf' }]);
      doc.inputs[1].answer([{ name: 'a.txt' }, { name: 'b.txt' }]);
    }
    await Promise.resolve();
    $flush(dom.root);
    $flush(skia.root);
    assert.equal(skia.text(), dom.text());
    assert.deepEqual(heard, [['cv.pdf'], ['cv.pdf']]);
    dispose();
  });
});

describe('a choice in a narrow container', () => {
  const LABEL = 'New users may create accounts';
  const NOTE = 'Uma conta nova aguarda um administrador confirmá-la em Cadastros.';
  /** A choice with a label and a long description in a Stack 360 wide. @param {(p: Record<string, any>) => any} make */
  const view = make => () => (
    <Rui>
      <Stack style={{ width: 360 }}>{make({ label: LABEL, description: NOTE })}</Stack>
    </Rui>
  );
  /** A text measure 0.6 of the font size wide per character. */
  const mono = {
    width: (/** @type {string} */ text, /** @type {number} */ size) => text.length * size * 0.6,
    metrics: (/** @type {number} */ size) => ({ ascent: size * 0.8, descent: size * 0.2 }),
    close() {},
  };
  const kinds = /** @type {const} */ ([
    ['Switch', (/** @type {any} */ p) => <Switch {...p} />],
    ['Checkbox', (/** @type {any} */ p) => <Checkbox {...p} />],
    ['Radio', (/** @type {any} */ p) => <Radio value="a" {...p} />],
  ]);
  for (const [name, make] of kinds) {
    it(`${name}: its label and description wrap within 360 px on the DOM (laid out by the Flow), in the CSS and on Skia`, () => {
      const window = new Window({ url: 'http://localhost/' });
      const host = window.document.createElement('main');
      Object.defineProperty(host, 'clientWidth', { value: 480 });
      window.document.body.appendChild(host);
      const flow = new Flow(mono);
      const stop = mount($dom(window.document, { layout: flow }), view(make), host);
      // Each element's right edge in the host, from its placed boxes up the tree.
      const right = (/** @type {any} */ el) => {
        let x = parseFloat(el.style.width);
        for (let n = el; n !== host && n !== null; n = n.parentElement) x += parseFloat(n.style.left) || 0;
        return x;
      };
      const note = /** @type {any} */ ([...host.querySelectorAll('[data-ren="Label"]')].find(n => n.textContent === NOTE));
      assert.ok(right(note) <= 360.5, `the description within 360: ${right(note)}`);
      assert.ok(parseFloat(note.style.height) > BASE_THEME.fontSizes.xs * 1.9, `on two lines or more: ${note.style.height}`);
      stop();
      flow.close();
      closeWindow(window);

      // The browser's layout: the texts wrap, and their column shrinks below them.
      const dom = onDom(view(make), { width: 480, height: 300 });
      const labels = [...dom.host.querySelectorAll('[data-ren="Label"]')].filter((/** @type {any} */ n) => n.textContent === NOTE || n.textContent === LABEL);
      assert.deepEqual(labels.map((/** @type {any} */ n) => n.style.whiteSpace), ['pre-wrap', 'pre-wrap']);
      const column = /** @type {any} */ (labels.at(-1)).parentElement;
      assert.deepEqual([column.style.minWidth, column.style.flexShrink], ['0px', '1']);
      dom.dispose();

      const { skia, dispose } = both(view(make), { width: 480, height: 300 });
      skia.text();
      const drawn = items(skia, 3).find((/** @type {any} */ i) => i.text === NOTE).getBoundingClientRect();
      assert.ok(drawn.right <= 360.5, `within 360 on Skia: ${drawn.right}`);
      dispose();
    });
  }
});

describe('CurrencyInput', () => {
  it('writes the currency as the language does, before or after the number, in the display asked for, with its decimals', () => {
    const nb = (/** @type {string} */ t) => t.replace(/[\u00a0\u202f]/g, ' ');
    const at = (/** @type {any[]} */ args) => {
      const a = currencyAffixes(.../** @type {[string, string, any, number]} */ (args));
      return [nb(a.prefix), nb(a.suffix)];
    };
    assert.deepEqual(at(['BRL', 'pt-BR', 'symbol', 12.5]), ['R$ ', '']);
    assert.deepEqual(at(['BRL', 'pt-BR', 'code', 1]), ['BRL ', '']);
    assert.deepEqual(at(['EUR', 'de', 'symbol', 2]), ['', ' €'], 'after the number where the language writes it so');
    assert.deepEqual(at(['USD', 'en', 'symbol', 2]), ['$', '']);
    assert.deepEqual(at(['BRL', 'pt-BR', 'name', 1]), ['', ' Real brasileiro'], 'a name follows the amount');
    assert.deepEqual(at(['BRL', 'pt-BR', 'name', 2]), ['', ' Reais brasileiros']);
    assert.deepEqual(at(['BRL', 'pt-BR', 'none', 2]), ['', '']);
    assert.equal(currencyDecimals('BRL'), 2);
    assert.equal(currencyDecimals('JPY'), 0);
  });

  it('shows its amount with the currency and all its decimals on both renderers; none shows the number alone', () => {
    const view = () => (
      <Rui>
        <Stack>
          <CurrencyInput label="Paid" currency="BRL" locale="pt-BR" defaultValue={12.5} controls={false} />
          <CurrencyInput label="Rate" currency="EUR" locale="de" defaultValue={3} controls={false} />
          <CurrencyInput label="Plain" currency="BRL" locale="pt-BR" display="none" defaultValue={7} controls={false} />
          <CurrencyInput label="Yen" currency="JPY" locale="en" display="code" defaultValue={1200} controls={false} />
          <CurrencyInput label="Loose" currency="BRL" locale="pt-BR" defaultValue={12.5} fixedDecimals={false} controls={false} />
        </Stack>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    const shown = (/** @type {number} */ i) => values(dom, skia, i).map((/** @type {string} */ v) => v.replace(/[\u00a0\u202f]/g, ' '));
    assert.deepEqual(shown(0), ['R$ 12,50', 'R$ 12,50']);
    assert.deepEqual(shown(1), ['3,00 €', '3,00 €'], 'after the number in German');
    assert.deepEqual(shown(2), ['7,00', '7,00'], 'none: the number alone');
    assert.deepEqual(shown(3), ['JPY 1200', 'JPY 1200'], 'the code; no decimals for the yen');
    assert.deepEqual(shown(4), ['R$ 12,5', 'R$ 12,5'], 'fixedDecimals false: as the number is');
    dispose();
  });

  /** One CurrencyInput with its value in a state per root, focused on both. @param {Record<string, any>} props */
  const focused = props => {
    const s = states();
    const view = () => {
      const v = s.make(/** @type {number | string} */ (props.value ?? ''));
      return (
        <Rui>
          <CurrencyInput label="Paid" {...props} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    dom.nodes('Edit')[0].focus();
    items(skia, 4)[0].focus();
    const shown = () => values(dom, skia, 0).map((/** @type {string} */ v) => v.replace(/[\u00a0\u202f]/g, ' '));
    /** Each key typed at the caret on both, and the text after it. @param {string} text */
    const keys = text => [...text].map(ch => {
      typeHere(dom, skia, 0, ch);
      return shown()[0];
    });
    return { s, dom, skia, dispose, shown, keys };
  };

  it('keeps the text as typed while focused, writes out the decimals on blur and on a step, and empties', () => {
    const { s, dom, skia, dispose, shown, keys } = focused({ currency: 'USD', locale: 'en' });
    assert.deepEqual(keys('12.5'), ['$1', '$12', '$12.', '$12.5'], 'no padding while typing');
    assert.deepEqual(shown(), ['$12.5', '$12.5']);
    assert.deepEqual(s.get(), [12.5, 12.5]);
    blur(dom, skia, 0);
    assert.deepEqual(shown(), ['$12.50', '$12.50'], 'all its decimals at rest');
    assert.deepEqual(s.get(), [12.5, 12.5]);
    // The step buttons: up, then down, each shown with its decimals.
    dom.nodes('Action')[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    tap(skia, items(skia, 5)[0]);
    assert.deepEqual(s.get(), [13, 13]);
    assert.deepEqual(shown(), ['$13.00', '$13.00']);
    dom.nodes('Action')[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    tap(skia, items(skia, 5)[1]);
    assert.deepEqual(s.get(), [12, 12]);
    // Emptied, it is empty, and stays so on blur.
    replace(dom, skia, 0, '');
    assert.deepEqual(s.get(), ['', '']);
    assert.deepEqual(shown(), ['', '']);
    blur(dom, skia, 0);
    assert.deepEqual(shown(), ['', '']);
    dispose();
  });

  it("keeps the text as typed with the locale's decimal mark; a currency without decimals takes no mark", () => {
    const brl = focused({ currency: 'BRL', locale: 'pt-BR', controls: false });
    assert.deepEqual(brl.keys('120,5'), ['R$ 1', 'R$ 12', 'R$ 120', 'R$ 120,', 'R$ 120,5']);
    assert.deepEqual(brl.s.get(), [120.5, 120.5]);
    blur(brl.dom, brl.skia, 0);
    assert.deepEqual(brl.shown(), ['R$ 120,50', 'R$ 120,50']);
    brl.dispose();
    const yen = focused({ currency: 'JPY', locale: 'en', controls: false });
    assert.deepEqual(yen.keys('12.5'), ['¥1', '¥12', '¥12', '¥125'], 'the decimal mark refused');
    assert.deepEqual(yen.s.get(), [125, 125]);
    blur(yen.dom, yen.skia, 0);
    assert.deepEqual(yen.shown(), ['¥125', '¥125']);
    yen.dispose();
  });

  it('keeps the text Backspace leaves, and what is typed after it', () => {
    const { s, dom, skia, dispose, shown, keys } = focused({ currency: 'USD', locale: 'en', value: 100, controls: false });
    assert.deepEqual(shown(), ['$100.00', '$100.00']);
    caretAt(dom, skia, 0, 7);
    const node = dom.nodes('Edit')[0];
    const back = () => {
      const at = node.selectionStart;
      node.value = node.value.slice(0, at - 1) + node.value.slice(at);
      node.setSelectionRange(at - 1, at - 1);
      node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      $flush(dom.root);
      skia.skia.key('Backspace');
      $flush(skia.root);
      return shown()[0];
    };
    assert.deepEqual([back(), back(), back()], ['$100.0', '$100.', '$100']);
    assert.deepEqual(shown(), ['$100', '$100']);
    assert.deepEqual(keys('5'), ['$1005']);
    assert.deepEqual(s.get(), [1005, 1005]);
    assert.deepEqual(keys('.5'), ['$1005.', '$1005.5']);
    assert.deepEqual(s.get(), [1005.5, 1005.5]);
    blur(dom, skia, 0);
    assert.deepEqual(shown(), ['$1005.50', '$1005.50']);
    dispose();
  });

  it('shows the name for the amount typed so far, and takes every key: 150 in Portuguese', () => {
    const nb = (/** @type {string} */ t) => t.replace(/[  ]/g, ' ');
    const { s, dom, skia, dispose, keys, shown } = focused({ currency: 'BRL', locale: 'pt-BR', display: 'name', controls: false });
    assert.deepEqual(keys('150').map(nb), ['1 Real brasileiro', '15 Reais brasileiros', '150 Reais brasileiros']);
    assert.deepEqual(s.get(), [150, 150]);
    blur(dom, skia, 0);
    assert.deepEqual(shown().map(nb), ['150,00 Reais brasileiros', '150,00 Reais brasileiros']);
    dispose();
  });
});

