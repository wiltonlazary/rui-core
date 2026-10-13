// rui-core/dropzone: the accept list, the file checks and the file
// dialog as units, then Dropzone on the DOM and on Skia with the same
// drops, rejections and state, its drag states on both, and
// Dropzone.Screen over the viewport while the page is dragged over.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { $flush } from 'rrx-core';
import { Rui, Text, BASE_THEME, pageColors, alpha } from 'rui-core';
import { Dropzone, mimeTypes, imageTypes, audioTypes, videoTypes, documentTypes, sheetTypes, slideTypes, archiveTypes, textTypes, acceptList, accepts, sortFiles, pickFiles, REJECT_LABELS } from 'rui-core/dropzone';
import { both, closeWindow, disposeAfter } from './harness.jsx';
import { primitives, allText } from './more-harness.jsx';

/** A file as the platform gives it. @param {string} name @param {string} type @param {number} [size] */
const file = (name, type, size = 100) => ({ name, type, size });

const png = file('a.png', 'image/png', 1000);
const big = file('big.png', 'image/png', 5000);
const pdf = file('doc.pdf', 'application/pdf', 200);

describe('dropzone files', () => {
  it('matches an accept list as the accept attribute: types, families and extensions in one list', () => {
    assert.equal(mimeTypes.png, 'image/png');
    // IANA types in eight kinds, alphabetical within each; each kind's list is the set in order.
    const kinds = [imageTypes, audioTypes, videoTypes, documentTypes, sheetTypes, slideTypes, archiveTypes, textTypes];
    assert.deepEqual(kinds.flat(), Object.values(mimeTypes), 'every type in exactly one kind, in the set\'s order');
    assert.deepEqual(kinds.map(k => k.length), [7, 4, 3, 5, 4, 2, 3, 7]);
    assert.equal(mimeTypes.jpg, 'image/jpeg');
    assert.equal(mimeTypes.tar, 'application/x-tar');
    assert.deepEqual(audioTypes, ['audio/flac', 'audio/mpeg', 'audio/ogg', 'audio/wav']);
    assert.ok(Object.isFrozen(mimeTypes) && Object.isFrozen(textTypes));
    assert.ok(imageTypes.includes('image/webp'));
    assert.deepEqual(acceptList(['image/png', '.png', 'application/pdf']), ['image/png', '.png', 'application/pdf']);
    assert.deepEqual(acceptList('.png'), ['.png'], 'a lone entry is a list of one');
    assert.deepEqual(acceptList(null), []);
    assert.ok(accepts(png, imageTypes));
    assert.ok(!accepts(pdf, imageTypes));
    assert.ok(accepts(pdf, ['image/*', '.PDF']), 'an extension, whatever its case');
    assert.ok(accepts(png, ['image/*']));
    assert.ok(accepts(pdf, []), 'an empty list accepts all');
    assert.ok(accepts(file('x.bin', ''), undefined));
  });

  it('reads a lone string as the attribute text: comma-separated, trimmed, blanks dropped', () => {
    assert.deepEqual(acceptList('image/*, .pdf ,,  '), ['image/*', '.pdf']);
    assert.deepEqual(acceptList([' .png ', '', 'image/gif,image/webp']), ['.png', 'image/gif', 'image/webp']);
    assert.deepEqual(acceptList(undefined), []);
    assert.deepEqual(acceptList(''), []);
  });

  it('matches extensions at the name\'s end, whatever the case, multi-dot ones included', () => {
    assert.ok(accepts(file('Photo.JPG', ''), ['.jpg']));
    assert.ok(accepts(file('photo.jpg', ''), ['.JPG']));
    assert.ok(!accepts(file('photo.jpeg', ''), ['.jpg']));
    assert.ok(!accepts(file('jpg', ''), ['.jpg']), 'the dot is part of the extension');
    assert.ok(accepts(file('a.tar.gz', ''), ['.tar.gz']));
    assert.ok(accepts(file('a.tar.gz', ''), ['.gz']), 'the last part alone also ends the name');
    assert.ok(!accepts(file('a.gz', ''), ['.tar.gz']));
    assert.ok(!accepts(file('.pdf', ''), ['.pdf']), 'a name that is only the extension has none');
    assert.ok(accepts(file('a.pdf', 'image/png'), ['.pdf']), 'the name alone decides for an extension');
  });

  it('matches whole MIME types without case or parameters', () => {
    assert.ok(accepts(file('a', 'IMAGE/PNG'), ['image/png']));
    assert.ok(accepts(file('a', 'image/png'), ['Image/Png']));
    assert.ok(accepts(file('a', 'text/plain; charset=utf-8'), ['text/plain']));
    assert.ok(accepts(file('a', 'text/plain'), ['text/plain;charset=utf-8']), 'a token\'s parameters are dropped too');
    assert.ok(!accepts(file('a', 'text/html'), ['text/plain']));
    assert.ok(!accepts(file('a', 'image/png'), ['image/pn']), 'the whole type, not a prefix');
  });

  it('matches families by the type\'s part before the slash', () => {
    assert.ok(accepts(file('a', 'audio/ogg'), ['audio/*']));
    assert.ok(accepts(file('a', 'Video/MP4'), ['video/*']));
    assert.ok(accepts(file('a', 'image/svg+xml'), ['IMAGE/*']));
    assert.ok(!accepts(file('a', 'application/image'), ['image/*']));
    assert.ok(!accepts(file('a', 'imagex/png'), ['image/*']));
  });

  it('matches a mixed list by any token, skips what is not a token, and reads a file with no type by its name only', () => {
    const mixed = ['image/*', 'application/pdf', '.md'];
    assert.ok(accepts(file('a.png', 'image/png'), mixed));
    assert.ok(accepts(file('a.pdf', 'application/pdf'), mixed));
    assert.ok(accepts(file('README.MD', ''), mixed));
    assert.ok(!accepts(file('a.zip', 'application/zip'), mixed));
    assert.ok(!accepts(file('a.png', ''), ['image/*', 'image/png']), 'no type: types and families cannot match');
    assert.ok(accepts(file('a.png', ''), ['image/*', '.png']));
    assert.ok(!accepts(file('a.zip', 'application/zip'), ['bogus', '.png']), 'an invalid token is skipped, the rest still decide');
    assert.ok(accepts(file('a.zip', 'application/zip'), ['bogus', '/', 'image/', '.']), 'no valid token: accepts all, as an empty list');
  });

  it('sorts files: type, size, then too many; the reasons as codes, worded by REJECT_LABELS', () => {
    const checks = { accept: imageTypes, maxSize: 2000 };
    const { accepted, rejected } = sortFiles([png, big, pdf], checks);
    assert.deepEqual(accepted, [png]);
    assert.deepEqual(rejected, [{ file: big, reasons: ['too-large'] }, { file: pdf, reasons: ['wrong-type'] }]);
    assert.equal(REJECT_LABELS['too-large'](checks), 'Over the 2000-byte limit');
    assert.match(REJECT_LABELS['wrong-type'](checks), /^Not an accepted type \(accepted: image\/avif, image\/bmp, /);
    assert.deepEqual(sortFiles([pdf], { accept: documentTypes, minSize: 500 }).rejected[0].reasons, ['too-small']);
    assert.equal(REJECT_LABELS['too-small']({ minSize: 500 }), 'Under the 500-byte minimum');
    assert.equal(REJECT_LABELS['wrong-type']({ accept: ['.png'] }), 'Not an accepted type (accepted: .png)');
    assert.deepEqual(sortFiles([file('big.pdf', 'application/pdf', 5000)], checks).rejected[0].reasons, ['wrong-type', 'too-large'], 'every reason, in order');
    assert.equal(REJECT_LABELS['too-many']({}), 'More files than this zone takes');
  });

  it('keeps the first files that fit the room and rejects each one past it as too many', () => {
    // One without multiple: the first kept, the rest too many.
    const one = sortFiles([png, big], { multiple: false });
    assert.deepEqual(one.accepted, [png]);
    assert.deepEqual(one.rejected, [{ file: big, reasons: ['too-many'] }]);
    // max: the first max kept, in order.
    const two = sortFiles([png, big, pdf], { max: 2 });
    assert.deepEqual(two.accepted, [png, big]);
    assert.deepEqual(two.rejected, [{ file: pdf, reasons: ['too-many'] }]);
    assert.deepEqual(sortFiles([png, big], { max: 2 }).accepted, [png, big], 'at the room: all kept');
    assert.deepEqual(sortFiles([png, big, pdf], { max: 0 }).accepted, [png, big, pdf], 'max 0: no limit');
    assert.deepEqual(sortFiles([png, big, pdf], {}).accepted, [png, big, pdf], 'no max: no limit');
    // A file rejected for its type or size takes no room, and keeps its own reasons.
    const gif = file('b.gif', 'image/gif', 300);
    const jpg = file('c.jpg', 'image/jpeg', 400);
    const mixed = sortFiles([pdf, png, big, gif, jpg], { accept: imageTypes, maxSize: 2000, max: 2 });
    assert.deepEqual(mixed.accepted, [png, gif]);
    assert.deepEqual(mixed.rejected, [
      { file: pdf, reasons: ['wrong-type'] },
      { file: big, reasons: ['too-large'] },
      { file: jpg, reasons: ['too-many'] },
    ], 'in the files\' order');
    const single = sortFiles([pdf, png, gif], { accept: imageTypes, multiple: false });
    assert.deepEqual([single.accepted, single.rejected.map(r => r.reasons)], [[png], [['wrong-type'], ['too-many']]]);
  });

  it('opens the platform file dialog where a document exists, inert elsewhere', { timeout: 10000 }, async t => {
    assert.deepEqual(await pickFiles({ accept: imageTypes }), [], 'no document here (node): none at once');
    const window = new Window();
    disposeAfter(t, () => window.happyDOM.close());
    const doc = window.document;
    /** @type {any[]} */
    const inputs = [];
    const make = doc.createElement.bind(doc);
    doc.createElement = (/** @type {string} */ tag) => {
      const el = make(tag);
      inputs.push(el);
      el.click = () => {};
      return el;
    };
    const picked = pickFiles({ accept: ['image/*', '.pdf'], multiple: true, document: doc });
    const input = inputs[0];
    assert.deepEqual([input.type, input.accept, input.multiple, input.isConnected], ['file', 'image/*,.pdf', true, true]);
    Object.defineProperty(input, 'files', { value: [png, pdf] });
    input.dispatchEvent(new window.Event('change'));
    assert.deepEqual(await picked, [png, pdf]);
    assert.equal(input.isConnected, false, 'the input goes once answered');
    const canceled = pickFiles({ document: doc });
    inputs[1].dispatchEvent(new window.Event('cancel'));
    assert.deepEqual(await canceled, []);
  });
});

/** Records per root: each renderer's root reports into its own list. */
function recorder() {
  /** @type {string[][]} */
  const logs = [];
  return {
    logs,
    /** A fresh log for a root's view. */
    next() {
      const log = /** @type {string[]} */ ([]);
      logs.push(log);
      return log;
    },
  };
}

/** A DOM drag event carrying files of these types (happy-dom's has no dataTransfer). @param {any} window @param {string} type @param {any} data */
function dragEvent(window, type, data) {
  const e = new window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: data });
  return e;
}

/** Drops files on both: the DOM's drop on the zone, Skia's on the canvas at the zone's middle. @param {any} dom @param {any} skia @param {any[]} files */
function dropBoth(dom, skia, files) {
  const zone = dom.nodes('View')[0];
  zone.dispatchEvent(dragEvent(dom.window, 'drop', { files }));
  $flush(dom.root);
  const r = primitives(skia)[0].getBoundingClientRect();
  assert.ok(skia.skia.dropFiles(r.left + r.width / 2, r.top + r.height / 2, files), 'dropped on an item on Skia');
  $flush(skia.root);
}

/** A Dropzone with its three states. @param {Record<string, any>} props */
const zone = props => (
  <Rui>
    <Dropzone {...props}>
      <Dropzone.Show when="idle">
        <Text>Photos go here</Text>
      </Dropzone.Show>
      <Dropzone.Show when="valid">
        <Text>Drop them</Text>
      </Dropzone.Show>
      <Dropzone.Show when="invalid">
        <Text>Not these</Text>
      </Dropzone.Show>
    </Dropzone>
  </Rui>
);

describe('Dropzone on the DOM and on Skia', () => {
  it('takes dropped files: the accepted to onDrop, the rejected to onReject, the same on both', () => {
    const rec = recorder();
    const { dom, skia, dispose } = both(() => {
      const log = rec.next();
      return zone({
        accept: imageTypes,
        maxSize: 2000,
        onDrop: (/** @type {any[]} */ files) => log.push(`drop ${files.map(f => f.name)}`),
        onReject: (/** @type {any[]} */ r) => log.push(`reject ${r.map(x => `${x.file.name}:${x.reasons[0]}`)}`),
        onFiles: (/** @type {{ accepted: any[], rejected: any[] }} */ f) => log.push(`any ${f.accepted.length} ${f.rejected.length}`),
      });
    });
    assert.equal(dom.text(), 'Photos go here');
    assert.equal(skia.text(), 'Photos go here');
    const style = dom.nodes('View')[0].getAttribute('style');
    assert.match(style, /border-style: dashed/);
    assert.equal(primitives(skia)[0].style.borderStyle, 1, 'dashed on Skia');
    dropBoth(dom, skia, [png, big, pdf]);
    const expected = ['any 1 2', 'drop a.png', 'reject big.png:too-large,doc.pdf:wrong-type'];
    assert.deepEqual(rec.logs, [expected, expected]);
    dispose();
  });

  it('shows the valid or the invalid state while files are dragged over it, idle again after, the same on both', () => {
    const { dom, skia, dispose } = both(() => zone({ accept: imageTypes, multiple: false }));
    const z = dom.nodes('View')[0];
    const drag = (/** @type {string} */ type, /** @type {string[]} */ types) => {
      z.dispatchEvent(dragEvent(dom.window, type, { items: types.map(t => ({ kind: 'file', type: t })), types: ['Files'] }));
      $flush(dom.root);
      return dom.text();
    };
    assert.equal(drag('dragenter', ['image/png']), 'Drop them');
    assert.match(z.getAttribute('style'), /border-color: #087c6a/, 'the outline variant: a teal.6 edge');
    assert.match(z.getAttribute('style'), /background: #ffffff/, 'on the raised ground');
    assert.equal(z.firstElementChild.style.pointerEvents, 'none', 'while files are over it, the zone takes the drag');
    assert.equal(drag('dragleave', []), 'Photos go here');
    assert.notEqual(z.firstElementChild.style.pointerEvents, 'none', 'idle: the content takes the pointer (interactive by default)');
    assert.equal(drag('dragenter', ['application/pdf']), 'Not these');
    assert.match(z.getAttribute('style'), /border-color: #a94a00/, 'invalid: an orange.6 edge');
    assert.equal(drag('dragleave', []), 'Photos go here');
    assert.equal(drag('dragenter', ['image/png', 'image/gif']), 'Not these', 'one file only');
    // A child's enter and leave keep the state (the count of enters).
    z.firstElementChild.dispatchEvent(dragEvent(dom.window, 'dragenter', { items: [{ kind: 'file', type: 'image/png' }, { kind: 'file', type: 'image/gif' }] }));
    z.firstElementChild.dispatchEvent(dragEvent(dom.window, 'dragleave', {}));
    $flush(dom.root);
    assert.equal(dom.text(), 'Not these');
    z.dispatchEvent(dragEvent(dom.window, 'drop', { files: [] }));
    $flush(dom.root);
    assert.equal(dom.text(), 'Photos go here', 'a drop ends the drag');
    // Skia: the canvas's drag hit-tested to the zone.
    const r = primitives(skia)[0].getBoundingClientRect();
    const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
    const idle = primitives(skia)[0].style.borderTopColor;
    const over = (/** @type {string[]} */ types) => {
      skia.skia.dragOver(x, y, types.length, types);
      $flush(skia.root);
      return skia.text();
    };
    const leave = () => {
      skia.skia.dragLeave();
      $flush(skia.root);
      return skia.text();
    };
    assert.equal(over(['image/png']), 'Drop them');
    assert.notEqual(primitives(skia)[0].style.borderTopColor, idle, 'the valid edge on Skia');
    assert.equal(over(['image/png']), 'Drop them', 'over again: the same');
    assert.equal(leave(), 'Photos go here');
    assert.equal(over(['application/pdf']), 'Not these');
    assert.equal(leave(), 'Photos go here');
    assert.equal(over(['image/png', 'image/gif']), 'Not these', 'one file only');
    skia.skia.dropFiles(x, y, []);
    $flush(skia.root);
    assert.equal(skia.text(), 'Photos go here', 'a drop ends the drag on Skia too');
    dispose();
  });

  it('opens the file dialog on a press and through its handle where a document exists; inert on a canvas off the page', async () => {
    const rec = recorder();
    /** @type {{ open: () => void }[]} */
    const handles = [];
    const { dom, skia, dispose } = both(() => {
      const log = rec.next();
      return zone({
        getHandle: (/** @type {{ open: () => void }} */ h) => handles.push(h),
        onPickerOpen: () => log.push('open'),
        onPickerCancel: () => log.push('cancel'),
        onDrop: (/** @type {any[]} */ files) => log.push(`drop ${files.map(f => f.name)}`),
      });
    });
    /** @type {any[]} */
    const inputs = [];
    const doc = dom.document;
    const make = doc.createElement.bind(doc);
    doc.createElement = (/** @type {string} */ tag) => {
      const el = make(tag);
      if (tag === 'input') {
        el.click = () => inputs.push(el);
      }
      return el;
    };
    dom.nodes('View')[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    $flush(dom.root);
    assert.equal(inputs.length, 1, 'the press showed the dialog');
    Object.defineProperty(inputs[0], 'files', { value: [png] });
    inputs[0].dispatchEvent(new dom.window.Event('change'));
    await Promise.resolve();
    handles[0].open();
    inputs[1].dispatchEvent(new dom.window.Event('cancel'));
    await Promise.resolve();
    assert.deepEqual(rec.logs[0], ['open', 'drop a.png', 'open', 'cancel']);
    // Skia in node: no document on the thread, so no dialog.
    const r = primitives(skia)[0].getBoundingClientRect();
    skia.skia.press(r.left + 5, r.top + 5);
    skia.skia.release(r.left + 5, r.top + 5);
    handles[1].open();
    assert.deepEqual(rec.logs[1], []);
    dispose();
  });

  it('takes nothing while disabled or loading, and shows a loader while loading', () => {
    const rec = recorder();
    const { dom, skia, dispose } = both(() => {
      const log = rec.next();
      return (
        <Rui>
          <Dropzone disabled onDrop={() => log.push('drop')} clickable>
            <Text>Off</Text>
          </Dropzone>
          <Dropzone loading onDrop={() => log.push('drop')}>
            <Text>Busy</Text>
          </Dropzone>
        </Rui>
      );
    });
    dropBoth(dom, skia, [png]);
    assert.deepEqual(rec.logs, [[], []]);
    assert.match(dom.nodes('View')[0].getAttribute('style'), /cursor: not-allowed/);
    const loaders = primitives(skia).filter(i => i.kind === 7);
    assert.ok(loaders.length >= 1, 'a loader on Skia');
    dispose();
  });
});

describe('Dropzone interactive', () => {
  it('lets the content take the pointer by default, and the zone take every press with interactive false', () => {
    for (const [interactive, blocked] of /** @type {const} */ ([[undefined, false], [false, true]])) {
      const { dom, dispose } = both(() => zone(interactive === undefined ? {} : { interactive }));
      assert.equal(dom.nodes('View')[0].firstElementChild.style.pointerEvents === 'none', blocked);
      dispose();
    }
  });
});

describe('Dropzone.Screen', () => {
  it('covers the viewport while the page is dragged over, takes the drop and hides', () => {
    const rec = recorder();
    // The Skia root lives "in a page": a document on the thread, as a canvas in the browser.
    const page = new Window();
    const had = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: page.document });
    try {
      const { dom, skia, dispose } = both(() => {
        const log = rec.next();
        return (
          <Rui>
            <Text>Page</Text>
            <Dropzone.Screen accept={imageTypes} onDrop={(/** @type {any[]} */ files) => log.push(`drop ${files.map(f => f.name)}`)}>
              <Text>Drop anywhere</Text>
            </Dropzone.Screen>
          </Rui>
        );
      });
      assert.equal(allText(dom), 'Page');
      assert.equal(skia.text(), 'Page');
      const enter = (/** @type {any} */ w, /** @type {any} */ d) => d.dispatchEvent(dragEvent(w, 'dragenter', { types: ['Files'], items: [] }));
      enter(dom.window, dom.document);
      enter(page, page.document);
      $flush(dom.root);
      $flush(skia.root);
      assert.equal(allText(dom), 'Page Drop anywhere');
      assert.equal(skia.text(), 'Page Drop anywhere');
      // The drop: on the DOM on the cover's zone, on Skia anywhere on the canvas.
      const cover = [...dom.document.body.querySelectorAll('[data-ren="View"]')].find(n => /position: fixed/.test(n.getAttribute('style') ?? ''));
      assert.ok(cover !== undefined, 'fixed over the viewport');
      assert.match(cover.getAttribute('style'), /width: 100%; height: 100%/);
      const ground = alpha(pageColors(BASE_THEME, 'light').body, BASE_THEME.opacity.muted);
      assert.match(cover.getAttribute('style'), new RegExp(`background: ${ground}`), 'the page showing through at the muted opacity');
      cover.firstElementChild.dispatchEvent(dragEvent(dom.window, 'drop', { files: [png] }));
      $flush(dom.root);
      assert.ok(skia.skia.dropFiles(400, 300, [png]), 'the cover takes a drop anywhere on the canvas');
      $flush(skia.root);
      assert.deepEqual(rec.logs, [['drop a.png'], ['drop a.png']]);
      assert.equal(allText(dom), 'Page');
      assert.equal(skia.text(), 'Page');
      // A drag leaving the page hides it too.
      enter(dom.window, dom.document);
      $flush(dom.root);
      assert.equal(allText(dom), 'Page Drop anywhere');
      dom.document.dispatchEvent(dragEvent(dom.window, 'dragleave', {}));
      $flush(dom.root);
      assert.equal(allText(dom), 'Page');
      dom.document.dispatchEvent(dragEvent(dom.window, 'dragenter', { types: ['text/plain'] }));
      $flush(dom.root);
      assert.equal(allText(dom), 'Page', 'a drag without files shows nothing');
      dispose();
    } finally {
      if (had === undefined) delete (/** @type {any} */ (globalThis)).document;
      else Object.defineProperty(globalThis, 'document', had);
      closeWindow(page);
    }
  });
});

