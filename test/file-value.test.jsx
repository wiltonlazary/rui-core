// FileInput's text for the files it holds and its clear, on the DOM and on
// Skia: one name, a count for several, null once cleared in every mode.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $flush } from 'rrx-core';
import { Label } from 'ren-core';
import { Rui, Stack, FileInput } from 'rui-core';
import { fileText, clearedFiles } from '../src/core/inputs/file-value.js';
import { both, fakeDocument } from './harness.jsx';
import { tap, findLabeled } from './inputs-harness.jsx';

/** The clear buttons shown on each renderer. @param {any} dom @param {any} skia */
const clears = (dom, skia) => {
  $flush(dom.root);
  $flush(skia.root);
  skia.skia.present();
  /** @type {any[]} */
  const found = [];
  const walk = (/** @type {any} */ n) => {
    for (let c = n.first; c !== null; c = c.next) {
      if (c.label === 'Clear') found.push(c);
      walk(c);
    }
  };
  walk(skia.skia.root);
  return [dom.document.querySelectorAll('[aria-label="Clear"]').length, found.length];
};

/** Presses the first clear button on both. @param {any} dom @param {any} skia */
const clear = (dom, skia) => {
  dom.document.querySelector('[aria-label="Clear"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  $flush(dom.root);
  tap(skia, findLabeled(skia.skia.root, 'Clear'));
};

describe('rui-core FileInput text', () => {
  it('shows one name, a count for several, and "file" for a nameless one', () => {
    assert.equal(fileText([{ name: 'cv.pdf' }]), 'cv.pdf');
    assert.equal(fileText([{ name: 'a.txt' }, { name: 'b.txt' }]), '2 files');
    assert.equal(fileText([{ name: 'a' }, {}, { name: 'c' }]), '3 files');
    assert.equal(fileText([{}]), 'file');
    assert.equal(fileText([{ name: '' }]), 'file');
    assert.equal(fileText([{ name: 'a' }, { name: 'b' }], n => `${n} Dateien`), '2 Dateien');
    assert.equal(fileText([]), '');
  });

  it('leaves null after a clear in both modes', () => {
    assert.equal(clearedFiles(false), null);
    assert.equal(clearedFiles(true), null);
  });
});

describe('rui-core FileInput value on the DOM and on Skia', () => {
  it('shows the name or the count, and `countText` replaces the count', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Stack>
          <FileInput placeholder="One" defaultValue={{ name: 'cv.pdf' }} />
          <FileInput placeholder="Two" multiple defaultValue={[{ name: 'a.txt' }, { name: 'b.txt' }]} />
          <FileInput placeholder="Three" multiple countText={(/** @type {number} */ n) => `${n} picked`} defaultValue={[{ name: 'a' }, { name: 'b' }, { name: 'c' }]} />
          <FileInput placeholder="Nameless" defaultValue={{}} />
        </Stack>
      </Rui>
    ));
    assert.equal(dom.text(), 'cv.pdf 2 files 3 picked file');
    assert.equal(skia.text(), dom.text());
    dispose();
  });

  it('clears to null in both modes: onChange(null), the placeholder back, the button gone', () => {
    /** @type {any[][]} */
    const heard = [];
    const { dom, skia, dispose } = both(() => {
      const log = /** @type {any[]} */ ([]);
      heard.push(log);
      return (
        <Rui>
          <Stack>
            <FileInput placeholder="Pick a file" clearable defaultValue={{ name: 'cv.pdf' }} onChange={(/** @type {any} */ v) => log.push(['one', v])} />
            <FileInput placeholder="Pick files" clearable multiple defaultValue={[{ name: 'a' }, { name: 'b' }]} onChange={(/** @type {any} */ v) => log.push(['many', v])} />
          </Stack>
        </Rui>
      );
    });
    assert.equal(dom.text(), 'cv.pdf 2 files');
    assert.deepEqual(clears(dom, skia), [2, 2]);
    clear(dom, skia);
    assert.equal(dom.text(), 'Pick a file 2 files');
    assert.equal(skia.text(), dom.text());
    assert.deepEqual(clears(dom, skia), [1, 1]);
    clear(dom, skia);
    assert.equal(dom.text(), 'Pick a file Pick files');
    assert.equal(skia.text(), dom.text());
    assert.deepEqual(clears(dom, skia), [0, 0], 'no clear button once empty');
    assert.deepEqual(heard, [[['one', null], ['many', null]], [['one', null], ['many', null]]]);
    dispose();
  });

  it('keeps a controlled value until the owner takes the null', () => {
    /** @type {any[]} */
    const heard = [];
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <FileInput placeholder="Pick" clearable multiple value={[{ name: 'a' }, { name: 'b' }]} onChange={(/** @type {any} */ v) => heard.push(v)} />
      </Rui>
    ));
    clear(dom, skia);
    assert.deepEqual(heard, [null, null]);
    assert.equal(dom.text(), '2 files');
    dispose();
  });

  it('shows no clear button while disabled or read-only', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Stack>
          <FileInput placeholder="Off" clearable disabled defaultValue={{ name: 'x.pdf' }} />
          <FileInput placeholder="Read" clearable readOnly defaultValue={{ name: 'y.pdf' }} />
        </Stack>
      </Rui>
    ));
    assert.equal(dom.text(), 'x.pdf y.pdf');
    assert.deepEqual(clears(dom, skia), [0, 0]);
    dispose();
  });

  it('lets `renderValue` replace the text, and a dialog closed empty changes nothing', async () => {
    /** @type {any[]} */
    const docs = [];
    /** @type {any[]} */
    const heard = [];
    const { dom, skia, dispose } = both(() => {
      const doc = fakeDocument();
      docs.push(doc);
      return (
        <Rui>
          <Stack>
            <FileInput placeholder="Own" multiple defaultValue={[{ name: 'a' }, { name: 'b' }]} renderValue={(/** @type {any} */ { value }) => <FileInputNames value={value} />} />
            <FileInput placeholder="Pick" picker={{ document: doc }} onChange={(/** @type {any} */ v) => heard.push(v)} />
          </Stack>
        </Rui>
      );
    });
    assert.equal(dom.text(), 'a + b Pick');
    assert.equal(skia.text(), dom.text());
    dom.press('Pick');
    skia.press('Pick');
    for (const doc of docs) doc.inputs[0].answer([]);
    await Promise.resolve();
    assert.deepEqual(heard, [], 'a cancel is no change');
    assert.equal(dom.text(), 'a + b Pick');
    dispose();
  });
});

/** A custom value: the names joined by ' + '. @param {{ value: any[] }} props */
function FileInputNames(props) {
  return <Label text={props.value.map(f => f.name).join(' + ')} />;
}
