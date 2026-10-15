// The words components show of their own come from Rui's `labels` over
// BASE_LABELS: under other words, no English is left on the DOM or on Skia,
// in text or in names; a component's own prop still wins; a change of the
// words reaches what is shown.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $write, $flush } from 'rrx-core';
import { $active, View } from 'ren-core';
import { Rui, Clock, manualClock, BASE_LABELS, PasswordInput, Select, MultiSelect, ColorInput, CloseButton, Pagination, Loader } from 'rui-core';
import { DateInput } from 'rui-core/dates';
import { Notifications, $notifications } from 'rui-core/notifications';
import { LoadBar, $loadBar } from 'rui-core/load-bar';
import { both } from './harness.jsx';

/** Other words: each label as its key in marks, a function's with its arguments. */
const OTHER = Object.fromEntries(
  Object.entries(BASE_LABELS).map(([key, v]) => [key, typeof v === 'function' ? (/** @type {any[]} */ ...a) => `«${[key, ...a].join(' ')}»` : `«${key}»`]),
);

/** The English words: each string label, and the start of each function's. */
const ENGLISH = Object.values(BASE_LABELS).filter(v => typeof v === 'string');
const STARTS = ['Remove ', 'Saturation ', 'Step ', 'Resize pane ', 'Select row ', 'Expand ', 'Collapse ', 'Copy '];

/** Whether a text is one of the English words. @param {string} text */
const english = text => ENGLISH.includes(text) || STARTS.some(s => text.startsWith(s)) || /^\d+ files$/.test(text);

/** The names read on a DOM element and a canvas item. */
const NAMES = ['aria-label', 'aria-valuetext', 'aria-roledescription', 'placeholder', 'title'];

/** Every text and name the DOM shows, the portal layer's too. @param {any} document */
function domTexts(document) {
  /** @type {string[]} */
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    for (const name of NAMES) {
      const v = el.getAttribute(name);
      if (v != null && v !== '') out.push(v);
    }
    const role = el.getAttribute('data-ren');
    if ((role === 'Label' || role === 'Action') && el.querySelector('[data-ren]') === null && el.textContent !== '') out.push(el.textContent);
    if (role === 'Edit' && el.value !== '') out.push(el.value);
  }
  return out;
}

/** Every text and name the Skia scene holds, the overlay's too. @param {any} skia */
function skiaTexts(skia) {
  skia.present();
  /** @type {string[]} */
  const out = [];
  const walk = (/** @type {any} */ n) => {
    for (let c = n.first; c !== null; c = c.next) {
      for (const v of [c.label, c.text, c.draft]) if (typeof v === 'string' && v !== '') out.push(v);
      if (c.other !== null) for (const name of NAMES) if (typeof c.other.get(name) === 'string' && c.other.get(name) !== '') out.push(c.other.get(name));
      walk(c);
    }
  };
  walk(skia.root);
  walk(skia.overlay);
  return out;
}

/** A page of components with words of their own, under `labels`. @param {any} labels @param {any} clock */
const page = (labels, clock) => () => {
  const Start = () => {
    $notifications().show({ title: 'Saved', message: 'All good' });
    $loadBar().run();
    return null;
  };
  return (
    <Clock value={clock}>
      <Rui labels={labels}>
        <LoadBar>
          <Notifications>
            <View style={{ padding: 8, gap: 8, width: 440 }}>
              <Start />
              <PasswordInput label="Pin" defaultValue="1234" />
              <Select clearable data={['Apple', 'Pear']} defaultValue="Apple" />
              <MultiSelect data={['Apple', 'Pear']} defaultValue={['Apple']} />
              <DateInput clearable defaultValue="2024-05-01" />
              <ColorInput defaultValue="#3a7bd5" defaultOpen alpha swatches={['#e8590c']} />
              <CloseButton />
              <Pagination total={5} />
              <Loader />
            </View>
          </Notifications>
        </LoadBar>
      </Rui>
    </Clock>
  );
};

describe('built-in texts in any language', () => {
  it('under other words, no English is left on the DOM or on Skia; English by default', () => {
    for (const [labels, words] of /** @type {const} */ ([[OTHER, 'other'], [undefined, 'English']])) {
      const clock = manualClock();
      const { dom, skia, dispose } = both(page(labels, clock), { width: 480, height: 900 });
      clock.advance(400);
      $flush(dom.root);
      $flush(skia.root);
      const texts = { dom: domTexts(dom.document), skia: skiaTexts(skia.skia) };
      for (const [where, list] of Object.entries(texts)) {
        if (words === 'other') {
          assert.deepEqual(list.filter(english), [], `no English on ${where}`);
          for (const w of ['«showPassword»', '«clear»', '«remove Apple»', '«hue»', '«alpha»', '«saturation»', '«notifications»', '«close»', '«pageLoading»', '«nextPage»', '«loading»']) {
            assert.ok(list.includes(w), `${w} on ${where}: ${list.filter(t => t.startsWith('«')).join(' ')}`);
          }
          assert.ok(list.some(t => t.startsWith('«saturationValue ')), `the saturation panel's value on ${where}`);
        } else {
          for (const w of ['Show password', 'Clear', 'Remove Apple', 'Hue', 'Notifications', 'Close', 'Page loading']) assert.ok(list.includes(w), `${w} on ${where}`);
        }
      }
      dispose();
    }
  });

  it("a component's own prop wins; a change of the words reaches what is shown; an inner Rui's words go over the outer's", () => {
    /** @type {any[]} */
    const words = [];
    const view = () => {
      const w = $signal($active(), /** @type {Record<string, any>} */ ({ close: 'Fechar' }));
      words.push(w);
      return (
        <Rui labels={w}>
          <View style={{ padding: 8, gap: 8 }}>
            <CloseButton />
            <CloseButton label="Dismiss" />
            <Rui labels={{ clear: 'Limpar' }}>
              <CloseButton />
              <Select clearable data={['Apple']} defaultValue="Apple" />
            </Rui>
          </View>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    const names = () => {
      $flush(dom.root);
      $flush(skia.root);
      const d = [...dom.document.body.querySelectorAll('[aria-label]')].map(n => n.getAttribute('aria-label')).filter(n => ['Fechar', 'Dismiss', 'Limpar', 'Close', 'Clear', 'Cerrar'].includes(n));
      const s = skiaTexts(skia.skia).filter(n => ['Fechar', 'Dismiss', 'Limpar', 'Close', 'Clear', 'Cerrar'].includes(n));
      assert.deepEqual(d, s, 'the DOM and Skia name the same');
      return d;
    };
    assert.deepEqual(names(), ['Fechar', 'Dismiss', 'Fechar', 'Limpar']);
    for (const w of words) $write(w, { close: 'Cerrar' });
    assert.deepEqual(names(), ['Cerrar', 'Dismiss', 'Cerrar', 'Limpar']);
    dispose();
  });
});
