// JsonArea on the DOM and on Skia: checked when left, re-checked while it
// is known bad, tidied with `pretty`, and its message, look and data.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $write } from 'rrx-core';
import { Rui, Stack, JsonArea } from 'rui-core';
import { both } from './harness.jsx';
import { values, type, replace, blur, states } from './inputs-harness.jsx';

const SAMPLE = '{"theme":"dark","size":3}';

/** Whether each renderer's text shows `message`. @param {any} dom @param {any} skia @param {string} message */
const showing = (dom, skia, message) => [dom.text().includes(message), skia.text().includes(message)];

/** Whether the i-th Edit says `aria-invalid` on the DOM. @param {any} dom @param {number} [i] */
const flagged = (dom, i = 0) => dom.nodes('Edit')[i].getAttribute('aria-invalid') === 'true';

describe('JsonArea on the DOM and on Skia', () => {
  it('pretty tidies valid text when left: 2 spaces, indent={4}, indent="\\t"', () => {
    const view = () => (
      <Rui>
        <Stack>
          <JsonArea label="Two" pretty defaultValue={SAMPLE} />
          <JsonArea label="Four" pretty indent={4} defaultValue={SAMPLE} />
          <JsonArea label="Tab" pretty indent={'\t'} defaultValue={SAMPLE} />
          <JsonArea label="Plain" defaultValue={SAMPLE} />
        </Stack>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    for (let i = 0; i < 4; i++) blur(dom, skia, i);
    const want = (/** @type {string | number} */ indent) => JSON.stringify(JSON.parse(SAMPLE), null, indent);
    assert.deepEqual(values(dom, skia, 0), [want(2), want(2)]);
    assert.deepEqual(values(dom, skia, 1), [want(4), want(4)]);
    assert.deepEqual(values(dom, skia, 2), [want('\t'), want('\t')]);
    assert.deepEqual(values(dom, skia, 3), [SAMPLE, SAMPLE], 'without pretty the text is kept');
    dispose();
  });

  it('custom parse and print', () => {
    // A reader that takes trailing commas, a printer that writes compact text.
    const parse = (/** @type {string} */ t) => JSON.parse(t.replace(/,\s*([}\]])/g, '$1'));
    const print = (/** @type {unknown} */ v) => JSON.stringify(v);
    const got = /** @type {unknown[]} */ ([]);
    const view = () => (
      <Rui>
        <JsonArea label="Loose" pretty parse={parse} print={print} onParse={(/** @type {unknown} */ v) => got.push(v)} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    replace(dom, skia, 0, '{ "size": 3, }');
    blur(dom, skia, 0);
    assert.deepEqual(values(dom, skia), ['{"size":3}', '{"size":3}']);
    assert.deepEqual(got, [{ size: 3 }, { size: 3 }]);
    assert.deepEqual(showing(dom, skia, 'Not valid JSON'), [false, false]);
    dispose();
  });

  it('invalid text shows its message when left, and clears it while fixed', () => {
    const view = () => (
      <Rui>
        <JsonArea label="Config" />
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    // While typing, a valid text is not checked, nor is a bad one before it is left.
    replace(dom, skia, 0, '{"size":3');
    assert.deepEqual(showing(dom, skia, 'Not valid JSON'), [false, false], 'not checked while typing');
    assert.equal(flagged(dom), false);
    blur(dom, skia, 0);
    assert.deepEqual(showing(dom, skia, 'Not valid JSON'), [true, true]);
    assert.equal(flagged(dom), true);
    // Known bad: each edit checks again; the fix clears the message at once.
    type(dom, skia, 0, '}');
    assert.deepEqual(showing(dom, skia, 'Not valid JSON'), [false, false], 'cleared while typing');
    assert.equal(flagged(dom), false);
    // Broken again: nothing until the next blur.
    type(dom, skia, 0, 'x');
    assert.deepEqual(showing(dom, skia, 'Not valid JSON'), [false, false], 'back only on the next blur');
    blur(dom, skia, 0);
    assert.deepEqual(showing(dom, skia, 'Not valid JSON'), [true, true]);
    dispose();
  });

  it('parseError: a custom message, or false for none with the invalid look kept', () => {
    const view = () => (
      <Rui>
        <Stack>
          <JsonArea label="Own" parseError="Check the braces" defaultValue="{" />
          <JsonArea label="Quiet" parseError={false} defaultValue="[" />
        </Stack>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    blur(dom, skia, 0);
    blur(dom, skia, 1);
    assert.deepEqual(showing(dom, skia, 'Check the braces'), [true, true]);
    assert.deepEqual(showing(dom, skia, 'Not valid JSON'), [false, false]);
    assert.equal(flagged(dom, 0), true);
    assert.equal(flagged(dom, 1), true, 'no message, still invalid');
    dispose();
  });

  it('a given error wins over the parse message; invalid alone gives the look', () => {
    const view = () => (
      <Rui>
        <Stack>
          <JsonArea label="Given" error="Server said no" defaultValue="{" />
          <JsonArea label="Flag" invalid defaultValue="{}" />
        </Stack>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    blur(dom, skia, 0);
    assert.deepEqual(showing(dom, skia, 'Server said no'), [true, true]);
    assert.deepEqual(showing(dom, skia, 'Not valid JSON'), [false, false]);
    assert.equal(flagged(dom, 0), true);
    assert.equal(flagged(dom, 1), true);
    dispose();
  });

  it('empty is not an error: whitespace becomes "" when left, and onParse is not called', () => {
    const s = states();
    const got = /** @type {unknown[]} */ ([]);
    const view = () => {
      const v = s.make('');
      return (
        <Rui>
          <JsonArea label="Blank" value={v} onChange={(/** @type {string} */ x) => $write(v, x)} onParse={(/** @type {unknown} */ x) => got.push(x)} />
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    replace(dom, skia, 0, '   \n ');
    blur(dom, skia, 0);
    assert.deepEqual(s.get(), ['', '']);
    assert.deepEqual(values(dom, skia), ['', '']);
    assert.deepEqual(showing(dom, skia, 'Not valid JSON'), [false, false]);
    assert.equal(flagged(dom), false);
    assert.deepEqual(got, []);
    dispose();
  });

  it('onParse gets the value; controlled and uncontrolled; one onChange for a tidy', () => {
    const s = states();
    const got = /** @type {unknown[]} */ ([]);
    const changes = /** @type {string[]} */ ([]);
    const view = () => {
      const v = s.make(SAMPLE);
      return (
        <Rui>
          <Stack>
            <JsonArea label="Held" pretty value={v} onChange={(/** @type {string} */ x) => $write(v, x)} onParse={(/** @type {unknown} */ x) => got.push(x)} />
            <JsonArea label="Own" pretty defaultValue="[1,2]" onChange={(/** @type {string} */ x) => changes.push(x)} />
          </Stack>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    blur(dom, skia, 0);
    const tidy = JSON.stringify(JSON.parse(SAMPLE), null, 2);
    assert.deepEqual(s.get(), [tidy, tidy], 'the controlled value is rewritten through onChange');
    assert.deepEqual(got, [JSON.parse(SAMPLE), JSON.parse(SAMPLE)]);
    blur(dom, skia, 1);
    assert.deepEqual(values(dom, skia, 1), ['[\n  1,\n  2\n]', '[\n  1,\n  2\n]'], 'uncontrolled keeps its own text');
    assert.deepEqual(changes, ['[\n  1,\n  2\n]', '[\n  1,\n  2\n]'], 'one onChange per renderer');
    // Tidy text left again changes nothing.
    blur(dom, skia, 1);
    assert.equal(changes.length, 2);
    dispose();
  });
});
