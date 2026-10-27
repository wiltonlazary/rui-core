// Stepper on the DOM and on Skia: stage states, the closing view, which
// presses move it (reach, disabled, controlled or not), its look from the
// theme's tokens, and what it means.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $flush } from 'rrx-core';
import { $active } from 'ren-core';
import { $json } from 'ren-json';
import { Rui, Clock, manualClock, Stepper, BASE_THEME, themeOf } from 'rui-core';
import { both } from './harness.jsx';
import { items, KIND } from './scene.js';

const T = BASE_THEME;
/** A still clock, so a loading chip's Loader does not keep time running. */
const clock = manualClock();

/**
 * A trip in three stages, with a closing view unless `done` is false.
 * @param {Record<string, any>} [props] the Stepper's @param {{ done?: boolean, stage?: Record<string, any>[], theme?: any }} [opts]
 */
const trip = (props = {}, opts = {}) => () => (
  <Rui theme={opts.theme}>
    <Clock value={clock}>
    <Stepper {...props}>
      <Stepper.Stage label="Book" description="Reserve the seats" {...opts.stage?.[0]}>
        Pick the dates
      </Stepper.Stage>
      <Stepper.Stage label="Pack" description="Fold the bags" {...opts.stage?.[1]}>
        Choose the gear
      </Stepper.Stage>
      <Stepper.Stage label="Travel" description="Board the train" {...opts.stage?.[2]}>
        Enjoy the ride
      </Stepper.Stage>
      {opts.done === false ? null : <Stepper.Done>Trip ready</Stepper.Done>}
    </Stepper>
    </Clock>
  </Rui>
);

/** The Skia Label with this text. @param {any} skia @param {string} text */
const label = (skia, text) => {
  const found = items(skia, KIND.Label).find((/** @type {any} */ l) => l.text === text);
  if (found === undefined) throw new Error(`no "${text}" label on Skia`);
  return found;
};

/** A stage's box on Skia (the Action or View holding its chip and text), by its label. @param {any} skia @param {string} text */
const stageBox = (skia, text) => label(skia, text).parent.parent;

/** A stage's chip on Skia, by its label. @param {any} skia @param {string} text */
const chipOf = (skia, text) => stageBox(skia, text).first;

/** What a chip shows: its number, 'check', 'loader' or 'shape'. @param {any} chip */
const shows = chip => {
  for (let c = chip.first; c !== null; c = c.next) {
    if (c.kind === KIND.Label) return String(c.text);
    if (c.kind === KIND.Shape) return 'shape';
  }
  return '';
};

/** A chip's number Label. @param {any} chip */
const numberOf = chip => {
  for (let c = chip.first; c !== null; c = c.next) if (c.kind === KIND.Label) return c;
  throw new Error('no number in the chip');
};

/** The chips of the three stages. @param {any} skia */
const chips = skia => ['Book', 'Pack', 'Travel'].map(t => shows(chipOf(skia, t)));

/** Whether the stage's box is pressable (an Action). @param {any} skia @param {string} text */
const pressable = (skia, text) => stageBox(skia, text).kind === KIND.Action;

/** Presses a stage by its label on each side. @param {any} dom @param {any} skia @param {string} text */
function pressBoth(dom, skia, text) {
  const node = dom.nodes('Label').find((/** @type {any} */ n) => n.textContent.trim() === text);
  node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  $flush(dom.root);
  skia.press(text);
}

/** The DOM's buttons' names. @param {any} dom */
const buttons = dom => dom.nodes('Action').map((/** @type {any} */ n) => n.getAttribute('aria-label'));

/** The tracks (decorative Views holding a fill) on Skia, in order. @param {any} skia */
const tracks = skia => {
  const list = label(skia, 'Book').parent.parent.parent.parent;
  /** @type {any[]} */
  const out = [];
  for (let c = list.first; c !== null; c = c.next) if (c !== stageBox(skia, 'Book').parent && c.first !== null && c.first.first === null && c.first.next === null) out.push(c);
  return out;
};

describe('Stepper', () => {
  it('states: done stages show a check, the current and idle their numbers, the current content below', () => {
    const { dom, skia, dispose } = both(trip({ value: 1 }));
    assert.deepEqual(chips(skia), ['shape', '2', '3']);
    const text = 'Book Reserve the seats 2 Pack Fold the bags 3 Travel Board the train Choose the gear';
    assert.equal(skia.text(), text);
    assert.equal(dom.text(), text);
    dispose();
  });

  it('past the last stage: Done shows and every chip is a check; without Done nothing; below 0 all idle', () => {
    const past = both(trip({ value: 3 }));
    assert.deepEqual(chips(past.skia), ['shape', 'shape', 'shape']);
    assert.equal(past.dom.text(), 'Book Reserve the seats Pack Fold the bags Travel Board the train Trip ready');
    assert.equal(past.skia.text(), past.dom.text());
    past.dispose();
    const far = both(trip({ value: 7 }, { done: false }));
    assert.equal(far.dom.text(), 'Book Reserve the seats Pack Fold the bags Travel Board the train');
    assert.equal(far.skia.text(), far.dom.text());
    far.dispose();
    const before = both(trip({ value: -1 }));
    assert.deepEqual(chips(before.skia), ['1', '2', '3']);
    assert.equal(before.dom.text(), '1 Book Reserve the seats 2 Pack Fold the bags 3 Travel Board the train');
    assert.equal(before.skia.text(), before.dom.text());
    before.dispose();
    const floored = both(trip({ value: 1.7 }));
    assert.match(floored.dom.text(), /Choose the gear$/, 'the value is floored');
    floored.dispose();
  });

  it("reach 'back' (default): a done stage moves back, a later one does nothing", () => {
    /** @type {number[]} */
    const calls = [];
    const { dom, skia, dispose } = both(trip({ value: 1, onChange: (/** @type {number} */ i) => calls.push(i) }));
    assert.deepEqual([pressable(skia, 'Book'), pressable(skia, 'Pack'), pressable(skia, 'Travel')], [true, false, false]);
    pressBoth(dom, skia, 'Travel');
    pressBoth(dom, skia, 'Pack');
    assert.deepEqual(calls, []);
    pressBoth(dom, skia, 'Book');
    assert.deepEqual(calls, [0, 0]);
    // Enter and Space press a focused stage, as any Action.
    stageBox(skia, 'Book').focus();
    skia.skia.key('Enter');
    skia.skia.key(' ');
    $flush(skia.root);
    assert.deepEqual(calls, [0, 0, 0, 0]);
    dispose();
  });

  it("reach 'any' lets a later stage press; 'none' presses nothing and holds no buttons", () => {
    /** @type {number[]} */
    const calls = [];
    const any = both(trip({ value: 1, reach: 'any', onChange: (/** @type {number} */ i) => calls.push(i) }));
    assert.deepEqual(buttons(any.dom), ['Book', 'Travel']);
    pressBoth(any.dom, any.skia, 'Travel');
    assert.deepEqual(calls, [2, 2]);
    any.dispose();
    const none = both(trip({ defaultValue: 1, reach: 'none', onChange: (/** @type {number} */ i) => calls.push(i) }));
    assert.deepEqual(buttons(none.dom), []);
    assert.deepEqual(items(none.skia, KIND.Action), []);
    pressBoth(none.dom, none.skia, 'Book');
    assert.deepEqual(calls, [2, 2]);
    none.dispose();
  });

  it('defaultValue moves on its own; a fixed value without onChange is not pressable; a signal is written back', () => {
    /** @type {number[]} */
    const calls = [];
    const own = both(trip({ defaultValue: 2, onChange: (/** @type {number} */ i) => calls.push(i) }));
    pressBoth(own.dom, own.skia, 'Book');
    assert.deepEqual(calls, [0, 0]);
    assert.match(own.dom.text(), /Pick the dates$/);
    assert.match(own.skia.text(), /Pick the dates$/);
    assert.deepEqual(chips(own.skia), ['1', '2', '3']);
    own.dispose();
    const fixed = both(trip({ value: 2 }));
    assert.deepEqual(buttons(fixed.dom), []);
    pressBoth(fixed.dom, fixed.skia, 'Book');
    assert.match(fixed.dom.text(), /Enjoy the ride$/);
    fixed.dispose();
    /** @type {any[]} */
    const steps = [];
    const shared = both(() => {
      const step = $signal($active(), 2);
      steps.push(step);
      return trip({ value: step })();
    });
    pressBoth(shared.dom, shared.skia, 'Pack');
    assert.deepEqual(steps.map(s => $read(s)), [1, 1], 'each root\'s signal written back');
    assert.match(shared.dom.text(), /Choose the gear$/);
    assert.match(shared.skia.text(), /Choose the gear$/);
    shared.dispose();
  });

  it('a disabled stage: not pressable, dimmed, aria-disabled', () => {
    /** @type {number[]} */
    const calls = [];
    const { dom, skia, dispose } = both(trip({ value: 2, onChange: (/** @type {number} */ i) => calls.push(i) }, { stage: [{ disabled: true }] }));
    assert.equal(pressable(skia, 'Book'), false);
    pressBoth(dom, skia, 'Book');
    assert.deepEqual(calls, []);
    assert.equal(chipOf(skia, 'Book').style.opacity, T.opacity.disabled);
    assert.equal(label(skia, 'Book').parent.style.opacity, T.opacity.disabled);
    assert.notEqual(chipOf(skia, 'Pack').style.opacity, T.opacity.disabled);
    const items = dom.host.querySelectorAll('[role="listitem"]');
    assert.equal(items[0].getAttribute('aria-disabled'), 'true');
    assert.equal(items[1].getAttribute('aria-disabled'), null);
    dispose();
  });

  it('loading shows a Loader; icon replaces the number; doneIcon on the stepper and on a stage', () => {
    const icons = both(trip({ value: 1, doneIcon: 'ok' }, { stage: [{}, { loading: true }, { icon: 'T' }] }));
    assert.deepEqual(chips(icons.skia), ['ok', 'shape', 'T']);
    assert.equal(icons.dom.nodes('Shape')[0].getAttribute('aria-label'), 'Loading');
    icons.dispose();
    const own = both(trip({ value: 3, doneIcon: 'ok' }, { stage: [{ doneIcon: 'yes' }] }));
    assert.deepEqual(chips(own.skia), ['yes', 'ok', 'ok']);
    own.dispose();
  });

  it('look: chips, numbers, labels and tracks from the tokens', () => {
    const { skia, dispose } = both(trip({ value: 1 }), { width: 900 });
    const side = T.sizes.step.md;
    const chip = chipOf(skia, 'Pack');
    const r = chip.getBoundingClientRect();
    assert.deepEqual([r.width, r.height], [side, side], 'a sizes.step square');
    assert.equal(chip.style.borderTop, 0, 'no border');
    assert.equal(chip.style.radiusTopLeft, Math.min(side / 2, T.radius[T.corner]), "rounded by the theme's corner");
    const number = numberOf(chip);
    assert.equal(number.style.fontSize, Math.round(side * T.ratios.glyph));
    assert.equal(number.style.fontWeight, T.weights.bold);
    assert.equal(label(skia, 'Pack').style.fontWeight, T.weights.strong);
    assert.equal(label(skia, 'Pack').style.fontSize, T.fontSizes.md);
    assert.ok(label(skia, 'Fold the bags').style.fontSize < T.fontSizes.md, 'the description a step below');
    const [first, second] = tracks(skia);
    assert.equal(Math.round(first.getBoundingClientRect().height), T.sizes.progress.md, 'sizes.progress thick');
    assert.deepEqual([first.style.marginLeft, first.style.marginRight], [T.control.iconGap, T.control.iconGap]);
    assert.ok(first.getBoundingClientRect().width >= T.spacing.md);
    assert.equal(Math.round(first.first.getBoundingClientRect().width), Math.round(first.getBoundingClientRect().width), 'after a done stage: full');
    assert.equal(second.first.getBoundingClientRect().width, 0, 'after the current stage: empty');
    dispose();
    const sized = both(trip({ value: 0, size: 'lg', chipSize: 50, radius: 'xs' }));
    const big = chipOf(sized.skia, 'Book');
    assert.equal(big.getBoundingClientRect().width, 50, 'chipSize wins');
    assert.equal(big.style.radiusTopLeft, T.radius.xs);
    assert.equal(numberOf(big).style.fontSize, Math.round(50 * T.ratios.glyph));
    sized.dispose();
    const lg = both(trip({ value: 0, size: 'lg' }));
    assert.equal(chipOf(lg.skia, 'Book').getBoundingClientRect().width, T.sizes.step.lg);
    lg.dispose();
    const column = both(trip({ value: 1, orientation: 'vertical' }));
    const [down] = tracks(column.skia);
    const d = down.getBoundingClientRect();
    assert.equal(Math.round(d.width), T.sizes.progress.md);
    assert.ok(d.height >= T.spacing.lg);
    assert.equal(Math.round(d.x - chipOf(column.skia, 'Book').getBoundingClientRect().x), (side - T.sizes.progress.md) / 2, 'centered under the chip');
    assert.deepEqual([down.style.marginTop, down.style.marginBottom], [T.control.labelGap, T.control.labelGap]);
    column.dispose();
  });

  it('gap sets the content distance; wrap wraps the row', () => {
    const below = (/** @type {Record<string, any>} */ props) => {
      const { skia, dispose } = both(trip({ value: 0, ...props }), { width: 900 });
      const content = label(skia, 'Pick the dates').getBoundingClientRect().y;
      const row = stageBox(skia, 'Book').parent.parent.getBoundingClientRect();
      const out = Math.round(content - (row.y + row.height));
      dispose();
      return out;
    };
    assert.equal(below({}), T.spacing.lg);
    assert.equal(below({ gap: 'xs' }), T.spacing.xs);
    const narrow = (/** @type {boolean} */ wrap) => {
      const { skia, dispose } = both(trip({ value: 0, wrap }), { width: 200 });
      const y = [chipOf(skia, 'Book'), chipOf(skia, 'Travel')].map(c => c.getBoundingClientRect().y);
      dispose();
      return y[1] > y[0];
    };
    assert.equal(narrow(false), false);
    assert.equal(narrow(true), true);
  });

  it('wraps a long description within the room, on both', () => {
    const NOTE = 'Reserve the seats on the night train before they sell out';
    for (const orientation of ['vertical', 'horizontal']) {
      const { dom, skia, dispose } = both(trip({ orientation }, { stage: [{ description: NOTE }] }), { width: 240, height: 600 });
      skia.text();
      const lines = skia.skia.commands().filter((/** @type {any[]} */ c) => c[0] === 'text' && NOTE.includes(String(c[1]).trim())).map((/** @type {any[]} */ c) => c[1]);
      assert.ok(lines.length > 1, `${orientation}: in lines on Skia: ${lines}`);
      const box = items(skia, KIND.Label).find(i => i.text === NOTE).getBoundingClientRect();
      assert.ok(box.x >= 0 && box.x + box.width <= 240.5, `${orientation}: within the room on Skia: ${box.x}..${box.x + box.width}`);
      const label = /** @type {any} */ ([...dom.host.querySelectorAll('[data-ren="Label"]')].find(n => n.textContent === NOTE));
      assert.equal(label.style.whiteSpace, 'pre-wrap', `${orientation}: on the DOM`);
      dispose();
    }
  });

  it('means a list of listitems, the current aria-current step, buttons only where pressable', async () => {
    const out = await $json(() => (
      <Rui>
        <Stepper defaultValue={1}>
          <Stepper.Stage label="Book" />
          <Stepper.Stage label="Pack" />
          <Stepper.Stage label={<Rui>{null}</Rui>} />
        </Stepper>
      </Rui>
    ));
    /** @param {any} node @param {string} role @returns {any[]} */
    const byRole = (node, role) => {
      if (Array.isArray(node)) return node.flatMap(n => byRole(n, role));
      if (node === null || typeof node !== 'object') return [];
      return [...(node.role === role ? [node] : []), ...byRole(node.children ?? [], role)];
    };
    const [list] = byRole(out, 'list');
    assert.deepEqual(list.children.map((/** @type {any} */ n) => n.role), ['listitem', 'listitem', 'listitem']);
    assert.deepEqual(list.children.map((/** @type {any} */ n) => n.current), [undefined, 'step', undefined]);
    assert.deepEqual(byRole(out, 'button').map(b => b.label), ['Book']);
    assert.equal(list.children[2].label, 'Step 3 of 3');
    const { dom, dispose } = both(trip({ defaultValue: 1, reach: 'any' }, { stage: [{}, {}, { label: <Rui>{null}</Rui> }] }));
    assert.deepEqual(buttons(dom), ['Book', 'Step 3 of 3']);
    assert.equal(dom.host.querySelector('[role="list"]').children.length, 5, 'three stages, two tracks');
    assert.ok(dom.host.querySelectorAll('[aria-hidden="true"]').length >= 5, 'chips and tracks are decoration');
    dispose();
  });

  it('a theme override of sizes.step.md sets the chip side', () => {
    const theme = themeOf({ sizes: { step: { md: 40 } } });
    const { skia, dispose } = both(trip({ value: 0 }, { theme }));
    assert.equal(chipOf(skia, 'Book').getBoundingClientRect().width, 40);
    dispose();
  });
});
