// FileButton on the DOM and on Skia: a Button whose press opens one file
// dialog (a stand-in document here) and hands over the files as a list.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $write, $flush } from 'rrx-core';
import { $active } from 'ren-core';
import { Rui, FileButton, Button, BASE_THEME } from 'rui-core';
import { both, fakeDocument } from './harness.jsx';
import { items, KIND } from './scene.js';

/** Lets the dialog's promise settle, then flushes both sides. @param {any} dom @param {any} skia */
async function settle(dom, skia) {
  for (let i = 0; i < 3; i++) await Promise.resolve();
  $flush(dom.root);
  $flush(skia.root);
}

/**
 * Mounts one FileButton per side, each with its own stand-in document and
 * log of what `onFiles` got.
 * @param {Record<string, any>} props @param {string} [text]
 */
function mount(props, text = 'Attach') {
  /** @type {any[]} */
  const docs = [];
  /** @type {any[][]} */
  const logs = [];
  const sides = both(() => {
    const doc = fakeDocument();
    docs.push(doc);
    /** @type {any[]} */
    const log = [];
    logs.push(log);
    return (
      <Rui>
        <FileButton document={doc} onFiles={(/** @type {any[]} */ files) => log.push(files)} {...props}>
          {text}
        </FileButton>
      </Rui>
    );
  });
  return { ...sides, docs, logs };
}

describe('capture', () => {
  it('capture false sets no attribute, true an empty one, a string itself: through FileButton and pickFiles', async () => {
    const { chooseFiles } = await import('../src/core/buttons/file.jsx');
    const { pickFiles } = await import('rui-core/dropzone');
    /** A fake document whose one input records its attributes. */
    const fake = () => {
      /** @type {Record<string, string>} */
      const attrs = {};
      const input = { style: {}, setAttribute: (/** @type {string} */ k, /** @type {string} */ v) => void (attrs[k] = v), addEventListener() {}, click() {}, remove() {} };
      return { attrs, doc: { createElement: () => input, body: { appendChild() {} } } };
    };
    for (const [capture, want] of /** @type {[any, string | undefined][]} */ ([[false, undefined], [true, ''], ['user', 'user'], [undefined, undefined]])) {
      const a = fake();
      void chooseFiles({ capture, document: a.doc });
      assert.equal(a.attrs.capture, want, `chooseFiles, capture ${String(capture)}`);
      const b = fake();
      void pickFiles({ capture, document: /** @type {any} */ (b.doc) });
      assert.equal(b.attrs.capture, want, `pickFiles, capture ${String(capture)}`);
    }
  });
});

describe('FileButton', () => {
  it('is a Button with its children as its content, on both renderers', () => {
    const { dom, skia, dispose } = mount({}, 'Attach files');
    assert.equal(dom.text(), 'Attach files');
    assert.equal(skia.text(), 'Attach files');
    assert.equal(dom.nodes('Action').length, 1);
    assert.equal(items(skia, KIND.Action).length, 1);
    dispose();
  });

  it('a press opens one dialog with the accept list; one file comes as a list of one', async () => {
    const { dom, skia, docs, logs, dispose } = mount({ accept: 'image/png, image/jpeg' });
    dom.press('Attach');
    skia.press('Attach');
    for (const doc of docs) {
      assert.equal(doc.inputs.length, 1, 'one dialog');
      const [input] = doc.inputs;
      assert.deepEqual([input.type, input.accept, input.multiple, input.clicked], ['file', 'image/png,image/jpeg', false, 1]);
    }
    const file = { name: 'a.png' };
    for (const doc of docs) doc.inputs[0].answer([file]);
    await settle(dom, skia);
    assert.deepEqual(logs, [[[file]], [[file]]]);
    // Each press is a fresh dialog.
    dom.press('Attach');
    skia.press('Attach');
    assert.deepEqual(docs.map(d => d.inputs.length), [2, 2]);
    dispose();
  });

  it('multiple: two files come as a list of two; a cancel calls nothing', async () => {
    const { dom, skia, docs, logs, dispose } = mount({ multiple: true });
    dom.press('Attach');
    skia.press('Attach');
    const [a, b] = [{ name: 'a.txt' }, { name: 'b.txt' }];
    for (const doc of docs) {
      assert.equal(doc.inputs[0].multiple, true);
      doc.inputs[0].answer([a, b]);
    }
    await settle(dom, skia);
    assert.deepEqual(logs, [[[a, b]], [[a, b]]]);
    dom.press('Attach');
    skia.press('Attach');
    for (const doc of docs) doc.inputs[1].answer([]);
    await settle(dom, skia);
    assert.deepEqual(logs.map(l => l.length), [1, 1], 'a cancel calls nothing');
    dispose();
  });

  it('disabled and loading open nothing', () => {
    for (const props of [{ disabled: true }, { loading: true }]) {
      const { dom, skia, docs, dispose } = mount(props);
      dom.press('Attach');
      skia.press('Attach');
      assert.deepEqual(docs.map(d => d.inputs.length), [0, 0], JSON.stringify(props));
      dispose();
    }
  });

  it('capture sets the input\'s capture; a list of accept types is joined', () => {
    const { dom, skia, docs, dispose } = mount({ capture: 'user', accept: ['.pdf', 'image/*'] });
    dom.press('Attach');
    skia.press('Attach');
    for (const doc of docs) {
      const [input] = doc.inputs;
      assert.equal(input.attrs.capture ?? input.capture, 'user');
      assert.equal(input.accept, '.pdf,image/*');
    }
    dispose();
  });

  it('reads accessors at press time', () => {
    /** @type {any[]} */
    const flags = [];
    /** @type {any[]} */
    const docs = [];
    const { dom, skia, dispose } = both(() => {
      const R = $active();
      const off = $signal(R, true);
      const many = $signal(R, false);
      flags.push({ off, many });
      const doc = fakeDocument();
      docs.push(doc);
      return (
        <Rui>
          <FileButton document={doc} disabled={off} multiple={many} accept={() => 'text/plain'} capture={() => 'environment'}>
            Attach
          </FileButton>
        </Rui>
      );
    });
    dom.press('Attach');
    skia.press('Attach');
    assert.deepEqual(docs.map(d => d.inputs.length), [0, 0], 'disabled at first');
    for (const f of flags) {
      $write(f.off, false);
      $write(f.many, true);
    }
    $flush(dom.root);
    $flush(skia.root);
    dom.press('Attach');
    skia.press('Attach');
    for (const doc of docs) {
      const [input] = doc.inputs;
      assert.deepEqual([input.accept, input.multiple, input.attrs.capture ?? input.capture], ['text/plain', true, 'environment']);
    }
    dispose();
  });

  it('on the DOM without a document, the dialog opens in the pressed node\'s document', () => {
    const { dom, dispose } = both(() => (
      <Rui>
        <FileButton onFiles={() => {}}>Attach</FileButton>
      </Rui>
    ));
    /** @type {any[]} */
    const made = [];
    const create = dom.document.createElement.bind(dom.document);
    dom.document.createElement = (/** @type {string} */ tag, /** @type {any} */ o) => {
      const node = create(tag, o);
      if (tag === 'input') {
        made.push(node);
        node.click = () => made.push('clicked');
      }
      return node;
    };
    dom.press('Attach');
    assert.equal(made.length, 2, 'one input made and clicked in the page\'s document');
    assert.equal(made[0].type, 'file');
    assert.equal(made[1], 'clicked');
    dispose();
  });

  it('passes Button props through', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <FileButton variant="outline" size="lg" onFiles={() => {}}>Attach</FileButton>
        <Button variant="outline" size="lg">Attach</Button>
      </Rui>
    ));
    const [file, button] = dom.nodes('Action');
    for (const key of ['height', 'background', 'borderColor', 'color', 'fontSize', 'padding']) assert.equal(file.style[key], button.style[key], key);
    assert.equal(file.style.height, `${BASE_THEME.sizes.control.lg}px`);
    const [a, b] = items(skia, KIND.Action).map(n => n.getBoundingClientRect());
    assert.deepEqual([a.width, a.height], [b.width, b.height]);
    dispose();
  });
});
