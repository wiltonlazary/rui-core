// The overlay suites' shared drivers: the view on the DOM and on Skia
// with helpers that see the portal layer (on the DOM a Portal renders into
// the document's body, outside the view's host), presses as a browser sends
// them (pointerdown, pointerup, click), keys to the focused node, and boxes;
// a popover against the viewport and a menu walked by keys.

import { $flush } from 'rrx-core';
import { View } from 'ren-core';
import { Rui, Clock, manualClock, Button, Text, Popover, Menu } from 'rui-core';
import { both } from './harness.jsx';

/** Collapses whitespace. @param {string[]} parts */
export const normalize = parts => parts.join(' ').replace(/\s+/g, ' ').trim();

/** True when the node or an ancestor is not displayed. @param {any} node */
export function hidden(node) {
  for (let n = node; n != null && n.style !== undefined; n = n.parentElement) if (n.style.display === 'none') return true;
  return false;
}

/**
 * The view on both renderers, with helpers that see the portal layer.
 * @param {() => any} view @param {{ width?: number, height?: number }} [size]
 */
export function pair(view, size) {
  const { dom, skia, dispose } = both(view, size);
  const body = dom.document.body;
  /** @param {string} role */
  const nodes = role => /** @type {any[]} */ ([...body.querySelectorAll(`[data-ren="${role}"]`)]).filter(n => !hidden(n));
  const flush = () => {
    $flush(dom.root);
    $flush(skia.root);
  };
  const d = {
    /** The Labels, Actions and Edits the DOM shows, the portal layer's too, in document order. */
    text() {
      $flush(dom.root);
      /** @type {string[]} */
      const out = [];
      for (const node of body.querySelectorAll('[data-ren]')) {
        const role = node.getAttribute('data-ren');
        if ((role !== 'Label' && role !== 'Action' && role !== 'Edit') || hidden(node)) continue;
        if (role === 'Action' && node.querySelector('[data-ren]') !== null) continue;
        out.push(role === 'Edit' ? node.value || node.placeholder || '' : node.textContent);
      }
      return normalize(out);
    },
    nodes,
    /** The deepest Action or View whose text is `text`. @param {string} text */
    find(text) {
      const found = [...nodes('Action'), ...nodes('Label'), ...nodes('View')].filter(n => n.textContent.trim() === text);
      const node = found.find(n => n.getAttribute('data-ren') !== 'View') ?? found.at(-1);
      if (node === undefined) throw new Error(`no "${text}" on the DOM in: ${d.text()}`);
      return node;
    },
    /** Presses a node as a browser does. @param {any} node */
    tap(node) {
      const w = dom.window;
      const at = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1 };
      node.dispatchEvent(new w.PointerEvent('pointerdown', at));
      node.dispatchEvent(new w.PointerEvent('pointerup', { ...at, buttons: 0 }));
      node.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
      $flush(dom.root);
    },
    /** Presses the node showing `text`. @param {string} text */
    press(text) {
      d.tap(d.find(text));
    },
    /** A key to the focused node (the DOM's keydown). @param {string} key */
    key(key) {
      const node = dom.document.activeElement ?? body;
      node.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      $flush(dom.root);
    },
    /** Types into the focused Edit as the browser does. @param {string} text */
    type(text) {
      const node = /** @type {any} */ (dom.document.activeElement);
      for (const ch of text) {
        node.value = node.value + ch;
        node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        $flush(dom.root);
      }
    },
    /** Moves the pointer onto a node (enter). @param {any} node */
    enter(node) {
      node.dispatchEvent(new dom.window.PointerEvent('pointerenter', { bubbles: false }));
      node.dispatchEvent(new dom.window.PointerEvent('pointerover', { bubbles: true }));
      $flush(dom.root);
    },
    /** Moves the pointer off a node (leave). @param {any} node */
    leave(node) {
      node.dispatchEvent(new dom.window.PointerEvent('pointerleave', { bubbles: false }));
      node.dispatchEvent(new dom.window.PointerEvent('pointerout', { bubbles: true }));
      $flush(dom.root);
    },
    focused: () => dom.document.activeElement,
  };
  /** Every scene item, the overlay's too, in tree order. */
  const items = () => {
    skia.skia.present();
    /** @type {any[]} */
    const out = [];
    const walk = (/** @type {any} */ n) => {
      for (let c = n.first; c !== null; c = c.next) {
        out.push(c);
        walk(c);
      }
    };
    walk(skia.skia.root);
    walk(skia.skia.overlay);
    return out;
  };
  const s = {
    text: () => skia.text(),
    commands: () => skia.skia.commands(),
    items,
    /** The item painted with `text` (a Label's or an Action's). @param {string} text */
    find(text) {
      const found = items().filter(i => (i.text ?? '') === text || (i.draft ?? '') === text);
      if (found.length === 0) throw new Error(`no "${text}" item on Skia in: ${skia.text()}`);
      return found.at(-1);
    },
    /** Presses where the text `text` is painted. @param {string} text */
    press(text) {
      skia.press(text);
    },
    /** Presses at a point. @param {number} x @param {number} y */
    at(x, y) {
      skia.skia.press(x, y);
      skia.skia.release(x, y);
      $flush(skia.root);
    },
    /** A key to the focused item. @param {string} key */
    key(key) {
      skia.skia.key(key);
      $flush(skia.root);
    },
    /** Types into the focused Edit. @param {string} text */
    type(text) {
      for (const ch of text) skia.skia.key(ch);
      $flush(skia.root);
    },
    /** Moves the pointer to a point. @param {number} x @param {number} y */
    move(x, y) {
      skia.skia.move(x, y);
      $flush(skia.root);
    },
    /** An item's box. @param {any} item */
    box: item => {
      skia.skia.present();
      return item.getBoundingClientRect();
    },
    focused: () => skia.skia.focused,
  };
  return { dom, skia, d, s, flush, dispose };
}

/** Per-root state: each renderer's root keeps its own. */
export function states() {
  /** @type {any[]} */
  const list = [];
  return { list, add: (/** @type {any} */ v) => (list.push(v), v) };
}

/** The DOM element's inline style, as a map. @param {any} node */
export const css = node => {
  /** @type {Record<string, string>} */
  const out = {};
  for (const part of String(node.getAttribute('style') ?? '').split(';')) {
    const at = part.indexOf(':');
    if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return out;
};

/** The nearest ancestor (or the node) whose style sets `name`. @param {any} node @param {string} name */
export const styledBy = (node, name) => {
  for (let n = node; n != null && n.getAttribute !== undefined; n = n.parentElement) if (css(n)[name] !== undefined) return n;
  return null;
};

/** The text command painting `text` on the Skia side: [op, text, x, baseline]. @param {any} s @param {string} text */
export const painted = (s, text) => {
  s.text();
  const c = s.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === text);
  if (c === undefined) throw new Error(`"${text}" not painted`);
  return c;
};


/**
 * Lends the DOM the boxes Skia laid out (happy-dom lays nothing out): a
 * fixed View over the viewport is the canvas's size, and each node set in
 * the returned map has its Skia item's box.
 * @param {any} dom @param {{ width: number, height: number }} [size]
 * @returns {Map<any, { getBoundingClientRect: () => any }>}
 */
export function lend(dom, size = { width: 480, height: 360 }) {
  /** @type {Map<any, any>} */
  const map = new Map();
  const proto = dom.window.HTMLElement.prototype;
  const base = proto.getBoundingClientRect;
  proto.getBoundingClientRect = function () {
    const c = css(this);
    const r =
      c.position === 'fixed' && c.top === '0px' && c.left === '0px' && c.right === '0px' && c.bottom === '0px'
        ? { x: 0, y: 0, ...size }
        : (map.get(this)?.getBoundingClientRect() ?? null);
    if (r === null) return base.call(this);
    return { x: r.x, y: r.y, left: r.x, top: r.y, width: r.width, height: r.height, right: r.x + r.width, bottom: r.y + r.height };
  };
  return map;
}

/** The placement box around a panel's content on the DOM (a side of its anchor box). @param {any} node */
export const placeOf = node => {
  for (let n = node; n != null && n.getAttribute !== undefined; n = n.parentElement) {
    const c = css(n);
    if (c.top === '100%' || c.bottom === '100%' || c.left === '100%' || c.right === '100%') return n;
  }
  throw new Error('no placement box');
};
/** The nearest fixed item holding a scene item (or itself). @param {any} item */
export const fixedOf = item => {
  let n = item;
  while (n != null && !n.r.fixed) n = n.parent;
  if (n == null) throw new Error('not in a fixed item');
  return n;
};

/** True when a background is a color at alpha `a` (rgba or 8-digit hex). @param {string | undefined} bg @param {number} a */
export const tinted = (bg, a) => new RegExp(`, ${a}\\)|^#[0-9a-f]{6}${Math.round(a * 255).toString(16).padStart(2, '0')}$`, 'i').test(bg ?? '');

/** Rounded box. @param {any} r */
export const round = r => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });

/** A view in the theme and on a clock. @param {any} clock @param {() => any} content */
export const app = (clock, content) => () => (
  <Clock value={clock}>
    <Rui>
      <View style={{ padding: 20 }}>{content()}</View>
    </Rui>
  </Clock>
);

/** The first body child that is not the view's host: the portal layer's content on the DOM. @param {any} dom */
export const layer = dom => [...dom.document.body.children].find(n => n.tagName !== 'MAIN');

/**
 * A popover whose trigger sits at `at` (padding of the page) with a
 * panel `w` wide; the DOM is lent Skia's boxes.
 * @param {Record<string, any>} options @param {any[]} at @param {any} [w]
 */
export const viewport = (options, at, w) => {
  const clock = manualClock();
  const view = () => (
    <Clock value={clock}>
      <Rui>
        <View style={{ padding: at }}>
          <Popover offset={8} {...options}>
            <Popover.Trigger>
              <Button>Toggle</Button>
            </Popover.Trigger>
            <Popover.Panel w={w}>
              <Text>Drop</Text>
              <Text>Two</Text>
            </Popover.Panel>
          </Popover>
        </View>
      </Rui>
    </Clock>
  );
  const p = pair(view);
  const boxes = lend(p.dom);
  boxes.set(p.d.find('Toggle').parentElement, p.s.find('Toggle').parent);
  p.d.press('Toggle');
  p.s.press('Toggle');
  clock.advance(32);
  p.flush();
  boxes.set(styledBy(p.d.find('Drop'), 'pointer-events'), p.s.find('Drop').parent.parent);
  // happy-dom lays nothing out (no resize to hear): the lent boxes are measured on a page scroll.
  p.dom.document.dispatchEvent(new p.dom.window.Event('scroll'));
  clock.advance(200);
  p.flush();
  const trigger = () => p.s.box(p.s.find('Toggle'));
  const drop = () => p.s.box(p.s.find('Drop').parent);
  return { ...p, clock, boxes, trigger, drop };
};

/**
 * A menu of Copy, Cut, Delete, Duplicate (or `items`: a name, or `{ text,
 * disabled }`) opened by ArrowDown from its trigger, `key` pressed on both
 * renderers, `at` the focused item on each.
 * @param {Record<string, any>} options @param {(string | { text: string, disabled?: boolean })[]} [items]
 */
export const menuWalk = (options, items = ['Copy', 'Cut', 'Delete', 'Duplicate']) => {
  const clock = manualClock();
  const view = app(clock, () => (
    <Menu {...options}>
      <Menu.Trigger>
        <Button>Open</Button>
      </Menu.Trigger>
      <Menu.Panel>
        {items.map(i => (typeof i === 'string' ? <Menu.Item>{i}</Menu.Item> : <Menu.Item disabled={i.disabled}>{i.text}</Menu.Item>))}
      </Menu.Panel>
    </Menu>
  ));
  const p = pair(view);
  p.d.find('Open').focus();
  p.s.find('Open').focus();
  p.d.key('ArrowDown');
  p.s.key('ArrowDown');
  clock.advance(200);
  p.flush();
  const key = (/** @type {string} */ k) => {
    p.d.key(k);
    p.s.key(k);
    clock.advance(50);
    p.flush();
  };
  const at = () => [p.d.focused().textContent, p.s.focused()?.first?.first?.text];
  return { ...p, clock, key, at };
};
