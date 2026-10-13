// One view on two renderers: the DOM (ren-dom on happy-dom) and Skia
// (ren-skia on headless CanvasKit, laid out by Taffy). A component is
// portable when both show the same text and answer the same presses.

import { afterEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setFlagsFromString } from 'node:v8';
import { Window } from 'happy-dom';
import { $root, $dispose, $flush } from 'rrx-core';
import { render as renderDom } from 'ren-dom';
import { $skia, render, loadLayout } from 'ren-skia';

// Each WebAssembly memory reserves its whole range up front; 1 GB each fits the address cap.
setFlagsFromString('--wasm-max-mem-pages=16384');
await loadLayout();

const font = readFileSync(fileURLToPath(import.meta.resolve('ren-skia/font.ttf')));
const CanvasKitInit = (await import('canvaskit-wasm')).default;
const kit = await CanvasKitInit();

/** Windows closing: happy-dom frees a window once its close settles, which takes turns of the event loop. @type {Set<Promise<void>>} */
const closing = new Set();

/**
 * Closes a happy-dom window (its `window.close()` closes only a window a
 * script opened, so it does nothing here), and tracks the close.
 * @param {any} window
 */
export function closeWindow(window) {
  const done = window.happyDOM.close().finally(() => closing.delete(done));
  closing.add(done);
}

/** Resolves once every window closed so far is freed. */
export const closed = () => Promise.all(closing).then(() => {});

/**
 * Runs `dispose` after the test `t`, from a slot the hook clears once run:
 * node:test keeps every test's hooks to the end of the run, so a hook that
 * held a window would keep it in memory.
 * @param {{ after: (fn: () => any) => void }} t @param {() => any} dispose
 */
export function disposeAfter(t, dispose) {
  /** @type {{ dispose: (() => any) | null }} */
  const slot = { dispose };
  t.after(() => {
    const run = slot.dispose;
    slot.dispose = null;
    return run?.();
  });
}

/** The views not disposed yet (each view's disposer, run once). @type {Set<() => void>} */
const live = new Set();

/** How many views are open (a DOM view or a canvas; a pair counts two). */
export const openViews = () => live.size;

/**
 * A disposer run once, and tracked until it runs: a test that fails before
 * its own dispose still has its window and canvas closed after it.
 * @param {() => void} dispose @returns {() => void}
 */
const tracked = dispose => {
  const once = () => {
    if (!live.delete(once)) return;
    dispose();
  };
  live.add(once);
  return once;
};

// After each test of a file using this harness: dispose what it left open,
// then wait for every window closed to be freed.
afterEach(async () => {
  /** @type {unknown[]} */
  const errors = [];
  for (const dispose of [...live]) {
    try {
      dispose();
    } catch (error) {
      errors.push(error);
    }
  }
  await closed();
  if (errors.length > 0) throw errors[0];
});

/** Collapses whitespace. @param {string[]} parts */
const normalize = parts => parts.join(' ').replace(/\s+/g, ' ').trim();

/** True when the node or an ancestor below the host is not displayed. @param {any} node @param {any} host */
function hidden(node, host) {
  for (let n = node; n != null && n !== host; n = n.parentElement) if (n.style?.display === 'none') return true;
  return false;
}

/**
 * Gives a window a ResizeObserver that reports, as happy-dom's never does:
 * each observed element's border box as its `getBoundingClientRect()` gives
 * it (happy-dom lays nothing out, so a test gives the boxes), once observed
 * and after each change, as a browser's after a layout. A report comes when
 * the returned `report()` asks, for each element whose box differs from the
 * last one reported (at first 0 × 0, as a browser's); the handlers' changes
 * are flushed and reported again, until none changes.
 * @param {any} window @param {any} root @returns {() => void} report
 */
function observeSizes(window, root) {
  /** @type {Set<{ fn: (entries: any[], observer: any) => void, seen: Map<any, { width: number, height: number }>, self: any }>} */
  const observers = new Set();
  window.ResizeObserver = class ResizeObserver {
    /** @param {(entries: any[], observer: any) => void} fn */
    constructor(fn) {
      this.own = { fn, seen: new Map(), self: this };
      observers.add(this.own);
    }
    /** @param {any} node */
    observe(node) {
      if (!this.own.seen.has(node)) this.own.seen.set(node, { width: 0, height: 0 });
    }
    /** @param {any} node */
    unobserve(node) {
      this.own.seen.delete(node);
    }
    disconnect() {
      this.own.seen.clear();
      observers.delete(this.own);
    }
  };
  return () => {
    // A browser stops after a few rounds of handlers that keep resizing what they observe; so does this.
    for (let round = 0; round < 16; round++) {
      let any = false;
      for (const o of [...observers]) {
        /** @type {any[]} */
        const entries = [];
        for (const [node, last] of o.seen) {
          const r = node.getBoundingClientRect();
          if (r.width === last.width && r.height === last.height) continue;
          o.seen.set(node, { width: r.width, height: r.height });
          entries.push({ target: node, contentRect: r, borderBoxSize: [{ inlineSize: r.width, blockSize: r.height }] });
        }
        if (entries.length === 0) continue;
        any = true;
        o.fn(entries, o.self);
      }
      $flush(root);
      if (!any) return;
    }
  };
}

/**
 * The view on the DOM, in a window of `size` (1024 × 768 by default; its
 * viewport is the root's, `$viewport`). Its window's ResizeObserver
 * reports the boxes a test gives (`report()`).
 * @param {() => any} view @param {{ width?: number, height?: number }} [size]
 */
export function onDom(view, size = {}) {
  const window = new Window({ url: 'http://localhost/', width: size.width ?? 1024, height: size.height ?? 768 });
  const document = window.document;
  const host = document.createElement('main');
  document.body.appendChild(host);
  const root = $root('dom');
  const report = observeSizes(window, root);
  const stop = renderDom(view, host, { root });
  const nodes = (/** @type {string} */ role) => /** @type {any[]} */ ([...host.querySelectorAll(`[data-ren="${role}"]`)]).filter(n => !hidden(n, host));
  return {
    window,
    document,
    host,
    root,
    /** The Labels, Actions and Edits shown, in document order. */
    text() {
      $flush(root);
      /** @type {string[]} */
      const out = [];
      for (const node of host.querySelectorAll('[data-ren]')) {
        const role = node.getAttribute('data-ren');
        if ((role !== 'Label' && role !== 'Action' && role !== 'Edit') || hidden(node, host)) continue;
        // An Action holding primitives shows theirs.
        if (role === 'Action' && node.querySelector('[data-ren]') !== null) continue;
        out.push(role === 'Edit' ? node.value || node.placeholder || '' : node.textContent);
      }
      return normalize(out);
    },
    nodes,
    /**
     * Reports the elements' boxes a ResizeObserver watches, as a browser
     * after a layout: those whose `getBoundingClientRect()` changed.
     */
    report,
    /** Resizes the window (its viewport). @param {number} width @param {number} height */
    resize(width, height) {
      /** @type {any} */ (window).happyDOM.setViewport({ width, height });
      $flush(root);
    },
    /** Clicks the first Action or View whose text is `text`. @param {string} text */
    press(text) {
      const node = [...nodes('Action'), ...nodes('View')].find(n => n.textContent.trim() === text);
      if (node === undefined) throw new Error(`no "${text}" to press on the DOM in: ${this.text()}`);
      node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      $flush(root);
    },
    dispose: tracked(() => (stop(), $dispose(root), closeWindow(window))),
  };
}

/**
 * The view on a Skia canvas.
 * @param {() => any} view @param {{ width?: number, height?: number }} [size]
 */
export function onSkia(view, size = {}) {
  const skia = /** @type {any} */ ($skia(kit, { font, width: size.width ?? 480, height: size.height ?? 360 }));
  const root = $root('skia');
  const stop = render(view, skia, { root });
  return {
    skia,
    root,
    /** Resizes the canvas (its viewport). @param {number} width @param {number} height */
    resize(width, height) {
      skia.resize(width, height);
      $flush(root);
    },
    /** The text painted, in paint order. */
    text() {
      $flush(root);
      skia.present();
      /** @type {string[]} */
      const out = [];
      for (const command of skia.commands()) if (command[0] === 'text') out.push(String(command[1]));
      return normalize(out);
    },
    /** Presses (down and up) where the text `text` was painted. @param {string} text */
    press(text) {
      $flush(root);
      skia.present();
      const at = skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && String(c[1]).trim() === text);
      if (at === undefined) throw new Error(`no "${text}" painted on Skia in: ${this.text()}`);
      const [x, y] = [at[2] + 2, at[3] - 3];
      skia.press(x, y);
      skia.release(x, y);
      $flush(root);
    },
    dispose: tracked(() => {
      stop();
      $dispose(root);
      skia.close();
    }),
  };
}

/**
 * The view on both renderers: the canvas and the DOM's window `size`.
 * @param {() => any} view @param {{ width?: number, height?: number }} [size]
 */
export function both(view, size) {
  const dom = onDom(view, { width: size?.width ?? 480, height: size?.height ?? 360 });
  const skia = onSkia(view, size);
  return { dom, skia, dispose: () => (dom.dispose(), skia.dispose()) };
}

/**
 * A stand-in document for the file dialog (the dialog itself is the
 * platform's): the inputs made, their clicks, and a way to answer.
 */
export function fakeDocument() {
  /** @type {any[]} */
  const inputs = [];
  const doc = {
    inputs,
    body: { appendChild: (/** @type {any} */ n) => void (n.connected = true) },
    createElement(/** @type {string} */ tag) {
      /** @type {Record<string, ((e?: any) => void)[]>} */
      const on = {};
      const input = {
        tag,
        type: '',
        accept: '',
        multiple: false,
        style: {},
        files: /** @type {any[]} */ ([]),
        attrs: /** @type {Record<string, string>} */ ({}),
        clicked: 0,
        connected: false,
        setAttribute(/** @type {string} */ k, /** @type {string} */ v) {
          this.attrs[k] = v;
        },
        addEventListener(/** @type {string} */ name, /** @type {(e?: any) => void} */ fn) {
          (on[name] ??= []).push(fn);
        },
        remove() {
          this.connected = false;
        },
        click() {
          this.clicked++;
        },
        /** Answers the dialog: files picked, or none (a cancel). @param {any[]} files */
        answer(files) {
          this.files = files;
          for (const fn of on[files.length > 0 ? 'change' : 'cancel'] ?? []) fn();
        },
      };
      inputs.push(input);
      return input;
    },
  };
  return doc;
}
