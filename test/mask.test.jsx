// applyMask's grammar on its own, and MaskInput on the DOM and on Skia: the
// same text, caret and callbacks from the same typing, pasting and deleting.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write, $flush } from 'rrx-core';
import { $active } from 'ren-core';
import { Rui, Stack, MaskInput, applyMask } from 'rui-core';
import { both } from './harness.jsx';

const PHONE = '+1 (###) ###-####';

// ---------------------------------------------------------------------------
// Driving both renderers the same way

/** The Edits on Skia, in tree order. @param {any} skia */
function edits(skia) {
  skia.skia.present();
  /** @type {any[]} */
  const out = [];
  const walk = (/** @type {any} */ n) => {
    for (let c = n.first; c !== null; c = c.next) {
      if (c.kind === 4) out.push(c);
      walk(c);
    }
  };
  walk(skia.skia.root);
  return out;
}

/** Focuses the i-th Edit on Skia with a press at its center. @param {any} skia @param {number} i */
function focus(skia, i) {
  const edit = edits(skia)[i];
  if (skia.skia.focused === edit) return edit;
  const r = edit.getBoundingClientRect();
  skia.skia.press(r.left + r.width / 2, r.top + r.height / 2);
  skia.skia.release(r.left + r.width / 2, r.top + r.height / 2);
  $flush(skia.root);
  return edit;
}

/** The i-th Edit's text on each renderer. @param {any} dom @param {any} skia @param {number} [i] */
const shown = (dom, skia, i = 0) => {
  $flush(dom.root);
  $flush(skia.root);
  return [dom.nodes('Edit')[i].value, edits(skia)[i].draft];
};

/** Types at the end of the i-th Edit on both. @param {any} dom @param {any} skia @param {string} text @param {number} [i] */
function type(dom, skia, text, i = 0) {
  const node = dom.nodes('Edit')[i];
  for (const ch of text) {
    node.value = node.value + ch;
    node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    $flush(dom.root);
  }
  focus(skia, i);
  skia.skia.key('End');
  for (const ch of text) skia.skia.key(ch);
  $flush(skia.root);
}

/** Types where each renderer's caret is. @param {any} dom @param {any} skia @param {string} text @param {number} [i] */
function typeHere(dom, skia, text, i = 0) {
  const node = dom.nodes('Edit')[i];
  for (const ch of text) {
    const [a, b] = [node.selectionStart, node.selectionEnd];
    node.value = node.value.slice(0, a) + ch + node.value.slice(b);
    node.setSelectionRange(a + 1, a + 1);
    node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    $flush(dom.root);
  }
  for (const ch of text) skia.skia.key(ch);
  $flush(skia.root);
}

/** Deletes the last character of the i-th Edit on both, `times` times. @param {any} dom @param {any} skia @param {number} [times] @param {number} [i] */
function backspace(dom, skia, times = 1, i = 0) {
  const node = dom.nodes('Edit')[i];
  for (let k = 0; k < times; k++) {
    node.value = node.value.slice(0, -1);
    node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    $flush(dom.root);
  }
  focus(skia, i);
  skia.skia.key('End');
  for (let k = 0; k < times; k++) skia.skia.key('Backspace');
  $flush(skia.root);
}

/** Replaces the i-th Edit's whole text on both (a paste over everything). @param {any} dom @param {any} skia @param {string} text @param {number} [i] */
function paste(dom, skia, text, i = 0) {
  const node = dom.nodes('Edit')[i];
  node.value = text;
  node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  $flush(dom.root);
  focus(skia, i);
  skia.skia.input(text, text.length, text.length);
  $flush(skia.root);
}

/** Puts the i-th Edit's caret at `at` on both. @param {any} dom @param {any} skia @param {number} at @param {number} [i] */
function caretAt(dom, skia, at, i = 0) {
  dom.nodes('Edit')[i].setSelectionRange(at, at);
  edits(skia)[i].setSelectionRange(at, at);
}

/** The i-th Edit's caret on each renderer. @param {any} dom @param {any} skia @param {number} [i] */
const carets = (dom, skia, i = 0) => [dom.nodes('Edit')[i].selectionStart, edits(skia)[i].selectionStart];

/** The same text on both, `expected` when given. @param {any} dom @param {any} skia @param {string} [expected] */
function same(dom, skia, expected) {
  const a = dom.text();
  assert.equal(a, skia.text(), 'the same text on the DOM and on Skia');
  if (expected !== undefined) assert.equal(a, expected);
  return a;
}

// ---------------------------------------------------------------------------

describe('applyMask', () => {
  it('reads the examples of its contract', () => {
    assert.deepEqual(applyMask('5551234567', PHONE), { raw: '5551234567', shown: '+1 (555) 123-4567', complete: true });
    assert.deepEqual(applyMask('+1 (55', PHONE), { raw: '55', shown: '+1 (55', complete: false });
    assert.equal(applyMask('ab12', '^^-##').shown, 'AB-12');
    assert.equal(applyMask('7', '{#}#').shown, '#7');
    assert.deepEqual(applyMask('12', '##[-##]'), { raw: '12', shown: '12', complete: true });
    assert.equal(applyMask('1234', '##[-##]').shown, '12-34');
  });

  it('shows nothing for nothing, and drops what is past the mask', () => {
    assert.deepEqual(applyMask('', PHONE), { raw: '', shown: '', complete: false });
    assert.deepEqual(applyMask('55512345679999', PHONE), { raw: '5551234567', shown: '+1 (555) 123-4567', complete: true });
    // Literals after the last taken slot are not shown.
    assert.equal(applyMask('555', PHONE).shown, '+1 (555');
  });

  it('reads a formatted value back to the same text', () => {
    assert.equal(applyMask('+1 (555) 123-4567', PHONE).shown, '+1 (555) 123-4567');
    assert.equal(applyMask('(555) 123 4567', PHONE).shown, '+1 (555) 123-4567');
  });

  it('takes each slot kind and drops what a slot refuses', () => {
    assert.deepEqual(applyMask('1a2', '###'), { raw: '12', shown: '12', complete: false });
    assert.equal(applyMask('é1жb', '@@@').shown, 'éжb', 'letters of any script');
    assert.equal(applyMask('éx', '^^').shown, 'ÉX', 'upper-cased');
    assert.equal(applyMask('Ab', '^^').raw, 'AB');
    assert.equal(applyMask('a-1_b', '&&&').shown, 'a1b');
    // Only the built-ins are slots: `slots` adds one (a hex digit), and without it the letter is a literal.
    const hex = { h: /[0-9a-f]/i };
    assert.equal(applyMask('3g-Fz9', 'hhh', hex).shown, '3F9');
    assert.equal(applyMask('xA', 'h', hex).shown, 'A');
    assert.equal(applyMask('5', 'h#').shown, 'h5', 'a literal without `slots`');
  });

  it('takes slot characters from `slots`, added or replacing', () => {
    // An added slot character.
    assert.deepEqual(applyMask('xAz3', 'HH', { H: /[0-9a-f]/i }), { raw: 'A3', shown: 'A3', complete: true });
    // A replaced one.
    assert.equal(applyMask('1989', '####', { '#': /[0-7]/ }).shown, '1');
    // Without `slots`, H is a literal.
    assert.equal(applyMask('5', 'H#').shown, 'H5');
    // A pattern with the global flag tests every character afresh.
    assert.equal(applyMask('aaa', 'XXX', { X: /a/g }).shown, 'aaa');
  });

  it('reads braces as literal text', () => {
    assert.equal(applyMask('12', '{##}-#').shown, '##-1');
    assert.equal(applyMask('A5', '{ID}^#').shown, 'IDA5');
    // An unclosed brace makes the rest literal.
    assert.deepEqual(applyMask('12', '#{a#'), { raw: '1', shown: '1', complete: true });
    // The literal typed as itself steps past it.
    assert.equal(applyMask('#7', '{#}#').shown, '#7');
  });

  it('leaves the bracketed tail optional', () => {
    assert.equal(applyMask('1', '##[-##]').complete, false);
    assert.deepEqual(applyMask('123', '##[-##]'), { raw: '123', shown: '12-3', complete: true });
    // An unclosed bracket makes the rest optional.
    assert.deepEqual(applyMask('12', '##[.##'), { raw: '12', shown: '12', complete: true });
    assert.equal(applyMask('1234', '##[.##').shown, '12.34');
  });

  it('maps each typed character through `transform` first', () => {
    assert.equal(applyMask('ab-cd', '@@@@', undefined, ch => ch.toUpperCase()).shown, 'ABCD');
    assert.equal(applyMask('1 2 3', '###', undefined, ch => (ch === ' ' ? '' : ch)).shown, '123');
    assert.equal(applyMask('o1', '##', undefined, ch => (ch === 'o' ? '0' : ch)).shown, '01');
  });
});

describe('MaskInput on the DOM and on Skia', () => {
  it('shows the mask as its placeholder unless one is given', () => {
    const view = () => (
      <Rui>
        <Stack>
          <MaskInput label="Phone" mask={PHONE} />
          <MaskInput label="Code" mask="{#}##[-##]" />
          <MaskInput label="Given" mask="##" placeholder="two digits" />
        </Stack>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    same(dom, skia, 'Phone +1 (___) ___-____ Code #__-__ Given two digits');
    dispose();
  });

  it('types, pastes and deletes back across a literal, with the callbacks', () => {
    /** @type {{ changes: string[], raws: string[], done: string[] }[]} */
    const logs = [];
    const view = () => {
      const log = { changes: /** @type {string[]} */ ([]), raws: /** @type {string[]} */ ([]), done: /** @type {string[]} */ ([]) };
      logs.push(log);
      return (
        <Rui>
          <MaskInput
            label="Phone"
            mask={PHONE}
            onChange={(/** @type {string} */ v) => log.changes.push(v)}
            onRawChange={(/** @type {string} */ v) => log.raws.push(v)}
            onComplete={(/** @type {string} */ v) => log.done.push(v)}
          />
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    type(dom, skia, '5551');
    assert.deepEqual(shown(dom, skia), ['+1 (555) 1', '+1 (555) 1']);
    // A refused character changes nothing.
    type(dom, skia, 'x');
    assert.deepEqual(shown(dom, skia), ['+1 (555) 1', '+1 (555) 1']);
    for (const log of logs) {
      assert.deepEqual(log.changes, ['+1 (5', '+1 (55', '+1 (555', '+1 (555) 1']);
      assert.deepEqual(log.raws, ['5', '55', '555', '5551']);
      assert.deepEqual(log.done, []);
    }
    // Deleting the digit after ') ' drops the literals with it.
    backspace(dom, skia);
    assert.deepEqual(shown(dom, skia), ['+1 (555', '+1 (555']);
    backspace(dom, skia);
    assert.deepEqual(shown(dom, skia), ['+1 (55', '+1 (55']);
    type(dom, skia, '5123456');
    assert.deepEqual(shown(dom, skia), ['+1 (555) 123-456', '+1 (555) 123-456']);
    type(dom, skia, '7');
    for (const log of logs) {
      assert.deepEqual(log.done, ['+1 (555) 123-4567'], 'complete once');
      assert.equal(log.raws.at(-1), '5551234567');
    }
    // More typing past the end changes nothing.
    type(dom, skia, '8');
    assert.deepEqual(shown(dom, skia), ['+1 (555) 123-4567', '+1 (555) 123-4567']);
    // Incomplete, then complete again: onComplete a second time.
    backspace(dom, skia);
    paste(dom, skia, '(212) 555 0100');
    assert.deepEqual(shown(dom, skia), ['+1 (212) 555-0100', '+1 (212) 555-0100']);
    for (const log of logs) {
      assert.deepEqual(log.done, ['+1 (555) 123-4567', '+1 (212) 555-0100']);
      assert.equal(log.changes.at(-1), '+1 (212) 555-0100');
      assert.equal(log.raws.at(-1), '2125550100');
    }
    dispose();
  });

  it('keeps the caret after the character typed mid-text', () => {
    const view = () => (
      <Rui>
        <MaskInput label="Phone" mask={PHONE} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    type(dom, skia, '555123');
    caretAt(dom, skia, 5);
    typeHere(dom, skia, '9');
    assert.deepEqual(shown(dom, skia), ['+1 (595) 512-3', '+1 (595) 512-3']);
    assert.deepEqual(carets(dom, skia), [6, 6]);
    // Typed before the ')', the digit moves past it and the caret follows.
    caretAt(dom, skia, 7);
    typeHere(dom, skia, '0');
    assert.deepEqual(shown(dom, skia), ['+1 (595) 051-23', '+1 (595) 051-23']);
    assert.deepEqual(carets(dom, skia), [10, 10]);
    dispose();
  });

  it('follows a controlled value, formatting it, with slots, transform and upper case', () => {
    /** @type {any[]} */
    const list = [];
    const view = () => {
      const v = $signal($active(), 'ab');
      list.push(v);
      return (
        <Rui>
          <Stack>
            <MaskInput label="Plate" mask="^^^-####" value={v} onChange={(/** @type {string} */ x) => $write(v, x)} />
            <MaskInput label="Hex" mask="{0x}HH" slots={{ H: /[0-9a-f]/ }} transform={(/** @type {string} */ ch) => ch.toLowerCase()} />
          </Stack>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    assert.deepEqual(shown(dom, skia), ['AB', 'AB'], 'the value read through the mask');
    type(dom, skia, 'c12');
    assert.deepEqual(list.map(s => $read(s)), ['ABC-12', 'ABC-12']);
    type(dom, skia, 'FZ', 1);
    assert.deepEqual(shown(dom, skia, 1), ['0xf', '0xf']);
    type(dom, skia, 'A', 1);
    assert.deepEqual(shown(dom, skia, 1), ['0xfa', '0xfa']);
    dispose();
  });
});
