// Dropzone, Dropzone.Show and Dropzone.Screen on the portable primitives.
//
// Files arrive through the primitives' `onDrop` (ren-dom's drop; on the
// canvases, files dropped on the canvas element, on the main thread) and
// through the platform's file dialog (`pickFiles`: the browser's
// `<input type="file">`, where a DOM document exists; inert in a worker).
// The drag state that Dropzone.Show follows comes from
// the primitives' portable drag (onDragEnter, onDragLeave: the files'
// count and MIME types) on the DOM and on the canvases, on the main thread
// (a worker hears no drag: there a zone stays idle until the drop).
// Dropzone.Screen
// watches the document's drags: on the DOM and on a canvas in
// the page.

import { View, Show, Portal, $context, $lookup, $active, $signal, $read, $write, $untrack, $owner, $cleanup, read } from 'ren-core';
import { styled } from '../../theme/style.js';
import { pageColors, radiusOf, variantColors } from '../../theme/resolve.js';
import { pass } from '../../core/layout/layout.jsx';
import { Busy } from '../../core/overlays/index.js';
import { LAYERS } from '../../theme/layers.js';
import { alpha } from '../../theme/colors.js';
import { acceptList, accepts, sortFiles, pickFiles } from './files.js';
import { flag } from '../../theme/meaning.js';
import { handOn } from '../../core/ref.js';

/** @typedef {import('./files.js').Accept} Accept */
/** @typedef {import('./files.js').RejectedFile} RejectedFile */
/** What a drag over the zone is: none ('idle'), files it takes ('valid'), or files it turns away ('invalid'). @typedef {'idle' | 'valid' | 'invalid'} DragState */

/** The drag state of the Dropzone around. */
const DropzoneContext = $context(/** @type {{ state: () => DragState } | null} */ (null));

/**
 * The document a primitive lives in: the DOM node's own, else the page's
 * (a canvas in the page), else none (a worker, a server).
 * @param {any} node
 */
const documentOf = node => node?.ownerDocument ?? /** @type {any} */ (globalThis).document ?? null;

/**
 * The files a drag carries (ren-core's portable drag: `files`, a count,
 * and `types`, their MIME types), as far as a drag tells: how many, and
 * whether each one's type is accepted (a type can only be known by its
 * MIME type while dragging, so extensions accept it).
 * @param {{ files?: number, types?: readonly string[] }} event
 * @param {Accept | null | undefined} accept
 */
function dragged(event, accept) {
  const types = event?.types ?? [];
  const list = acceptList(accept);
  const mimes = list.filter(t => !t.startsWith('.'));
  const named = mimes.length < list.length;
  return { count: event?.files ?? types.length, typed: types.every(type => list.length === 0 || named || accepts({ type, name: '' }, mimes)) };
}

/**
 * What a dropzone does, from `getHandle`.
 * @typedef {object} DropzoneHandle
 * @property {() => void} open opens the file dialog (inert where no DOM document exists)
 */

/**
 * A zone that takes files: dropped on it, or picked
 * from the file dialog on a press (`clickable`, true) or through the
 * handle `getHandle(handle)` gets (`handle.open()`). `onDrop(files)` hears the accepted files, `onReject(
 * rejected)` the rejected ones (`{ file, reasons }`, the reasons as codes:
 * 'wrong-type', 'too-large', 'too-small', 'too-many', worded by
 * `REJECT_LABELS`), `onFiles({ accepted, rejected })` both; `accept` (one
 * list of MIME types, `'image/*'` families and `'.ext'` extensions), `maxSize`
 * (bytes, Infinity), `minSize`, `max` (files at most: the first ones kept, those past it rejected as 'too-many'), `multiple` (true), `disabled`,
 * `loading` (a Busy cover; no drops), `onPickerOpen`,
 * `onPickerCancel`, `onDragEnter`, `onDragOver`, `onDragLeave` (ren-core's
 * portable drag: `{ x, y, files, types }`), `validColor` ('teal'),
 * `invalidColor` ('orange'), `variant` ('outline': the colors a drag shows;
 * an outline is a dashed edge in the color on the raised ground), `radius`,
 * `interactive` (true: controls inside the zone take the pointer, except
 * while files are dragged over it, when the zone takes them; false: the zone
 * takes every press), `loader` (the Busy cover's loader options), and
 * the style props. Its
 * children show by the drag state through Dropzone.Show (`when` 'idle',
 * 'valid' or 'invalid').
 * @param {Record<string, any>} props
 */
export function Dropzone(props) {
  const R = $active();
  const state = $signal(R, /** @type {DragState} */ ('idle'));
  /** @type {any} */
  let node = null;
  /** The items the drag has entered and not left, the zone's own or inside it. @type {Set<any>} */
  const entered = new Set();
  const off = () => read(props.disabled) === true || read(props.loading) === true;
  const options = () => ({ accept: read(props.accept), maxSize: read(props.maxSize), minSize: read(props.minSize), max: read(props.max), multiple: read(props.multiple) !== false });
  /** Sorts files as they arrive and tells the handlers. @param {readonly any[]} files */
  const take = files => {
    const { accepted, rejected } = sortFiles(files, options());
    props.onFiles?.({ accepted, rejected });
    if (accepted.length > 0) props.onDrop?.(accepted);
    if (rejected.length > 0) props.onReject?.(rejected);
  };
  // The file dialog: inert where no DOM document exists (a worker).
  const open = () => {
    const doc = documentOf(node);
    if ($untrack(R, off) || doc == null) return;
    props.onPickerOpen?.();
    const o = $untrack(R, options);
    void pickFiles({ accept: o.accept, multiple: o.multiple, document: doc }).then(files => {
      if (files.length === 0) props.onPickerCancel?.();
      else take(files);
    });
  };
  props.getHandle?.(/** @type {DropzoneHandle} */ ({ open }));
  const settle = () => {
    entered.clear();
    $write(state, 'idle');
  };
  /**
   * Whether a drag target is still inside the zone: a child the drag
   * entered may be gone by its leave (the content under the pointer changes
   * with the drag state), and a gone one never hears a leave.
   * @param {any} t
   */
  const inside = t => {
    for (let n = t; n != null; n = n.parentNode ?? n.parent ?? null) {
      if (n.hidden === true) return false;
      if (n === node) return true;
    }
    return false;
  };
  // The portable drag (ren-dom's and ren-canv's, in the DOM's order: the next
  // enter before the last leave); it stays while any entered item it has not
  // left is still in the zone.
  const onDragEnter = (/** @type {any} */ e) => {
    if ($untrack(R, off)) return;
    entered.add(e?.target ?? node);
    const d = dragged(e, $untrack(R, () => read(props.accept)));
    const o = $untrack(R, options);
    const many = (!o.multiple && d.count > 1) || (Number(o.max ?? 0) >= 1 && d.count > Number(o.max));
    $write(state, d.count > 0 && d.typed && !many ? 'valid' : 'invalid');
    props.onDragEnter?.(e);
  };
  const onDragLeave = (/** @type {any} */ e) => {
    entered.delete(e?.target ?? node);
    for (const t of entered) if (!inside(t)) entered.delete(t);
    if (entered.size > 0) return;
    settle();
    props.onDragLeave?.(e);
  };
  const onDrop = (/** @type {{ files: readonly any[] }} */ e) => {
    settle();
    if ($untrack(R, off)) return;
    take(e.files ?? []);
  };
  const clickable = () => read(props.clickable) !== false && !off();
  const style = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    const s = $read(state);
    /** @type {Record<string, any>} */
    const out = {
      position: 'relative',
      direction: 'column',
      padding: theme.spacing.md,
      border: 1,
      borderStyle: 'dashed',
      borderColor: page.border,
      background: page.raised,
      color: page.text,
      radius: radiusOf(theme, read(props.radius)),
      cursor: clickable() ? 'pointer' : 'default',
      select: 'none',
    };
    if (clickable()) out.hover = { background: page.hover };
    if (s !== 'idle') {
      const v = variantColors(theme, scheme, read(props.variant) ?? 'outline', s === 'valid' ? (read(props.validColor) ?? 'teal') : (read(props.invalidColor) ?? 'orange'));
      const clear = v.background === 'transparent';
      Object.assign(out, { background: clear ? page.raised : v.background, borderColor: v.border === 'transparent' ? v.background : v.border, color: v.color, hover: null });
    }
    if (read(props.disabled) === true) Object.assign(out, { cursor: 'not-allowed', background: page.disabled, borderColor: page.rule, color: page.disabledText, hover: null });
    return out;
  });
  const ctx = { state: () => /** @type {DragState} */ ($read(state)) };
  return (
    <DropzoneContext value={ctx}>
      <View
        role="button"
        aria-disabled={flag(props.disabled)}
        {...pass(props)}
        ref={(/** @type {any} */ n) => {
          node = n;
          handOn(props.ref, n);
        }}
        onPress={() => clickable() && open()}
        onDrop={onDrop}
        onDragEnter={onDragEnter}
        onDragOver={(/** @type {any} */ e) => props.onDragOver?.(e)}
        onDragLeave={onDragLeave}
        style={style}
      >
        <View style={() => ({ direction: 'column', grow: 1, pointerEvents: read(props.interactive) === false || $read(state) !== 'idle' ? 'none' : 'auto' })}>{props.children}</View>
        <Busy shown={() => read(props.loading) === true} {...(read(props.loader) ? { loader: read(props.loader) } : null)} />
      </View>
    </DropzoneContext>
  );
}

/**
 * Its children while the drag state is `when`: 'idle' (nothing dragged
 * over), 'valid' (files the zone takes) or 'invalid' (files it turns away).
 * @param {{ when: DragState | (() => DragState), children?: any }} props
 */
export function DropzoneShow(props) {
  const ctx = $lookup(DropzoneContext);
  return <Show when={() => (ctx?.state() ?? 'idle') === read(props.when)}>{props.children}</Show>;
}

/**
 * A Dropzone over the whole viewport while files are dragged over the
 * page: it watches the document's
 * dragenter and dragleave (the page's document, where one exists: inert in
 * a worker) and hides after a drop. It covers the page on the page's
 * ground at the muted opacity, the zone an md step in. `active` (true), `layer` (`LAYERS.top`),
 * `portal` (true), and the Dropzone's props.
 * @param {Record<string, any>} props
 */
export function DropzoneScreen(props) {
  const R = $active();
  const shown = $signal(R, false);
  let depth = 0;
  const hide = () => {
    depth = 0;
    $write(shown, false);
  };
  /** @param {any} doc */
  const watch = doc => {
    if (doc == null || typeof doc.addEventListener !== 'function') return;
    const enter = (/** @type {any} */ e) => {
      if (read(props.active) === false) return;
      const types = e?.dataTransfer?.types;
      if (types != null && ![...types].includes('Files')) return;
      depth++;
      $write(shown, true);
    };
    const leave = () => {
      if (depth > 0 && --depth === 0) $write(shown, false);
    };
    doc.addEventListener('dragenter', enter);
    doc.addEventListener('dragleave', leave);
    doc.addEventListener('drop', hide);
    const owner = $owner(R);
    if (owner != null)
      $cleanup(/** @type {any} */ (owner), () => {
        doc.removeEventListener('dragenter', enter);
        doc.removeEventListener('dragleave', leave);
        doc.removeEventListener('drop', hide);
      });
  };
  let watched = false;
  const probe = (/** @type {any} */ n) => {
    if (watched) return;
    watched = true;
    watch(documentOf(n));
  };
  // Fixed over the viewport (a fixed item's percent is of the viewport, of the portal layer on the canvases):
  // the page's ground at the theme's muted opacity, the page showing faintly through, the zone an md step in.
  const cover = styled({}, (theme, scheme) => ({
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: read(props.layer) ?? LAYERS.top,
    background: alpha(pageColors(theme, scheme).body, theme.opacity.muted),
    direction: 'column',
    padding: theme.spacing.md,
  }));
  const body = (
    <Show when={() => $read(shown)}>
      <View style={cover}>
        <Dropzone
          {...props}
          style={{ grow: 1, ...(read(props.style) ?? {}) }}
          onDrop={(/** @type {any[]} */ files) => {
            hide();
            props.onDrop?.(files);
          }}
          onReject={(/** @type {RejectedFile[]} */ rejected) => {
            hide();
            props.onReject?.(rejected);
          }}
        />
      </View>
    </Show>
  );
  return (
    <>
      {/* A probe for the document the view lives in. */}
      <View ref={probe} style={{ position: 'absolute', width: 0, height: 0 }} />
      {read(props.portal) === false ? body : <Portal>{body}</Portal>}
    </>
  );
}

Dropzone.Show = DropzoneShow;
Dropzone.Screen = DropzoneScreen;
