// Window: a draggable, resizable window with a title bar, minimize and
// close, brought to the front of its root's windows when pressed. Drags and
// resizes hold the pointer with capture.

import { View, Label, Action, Shape, Show, Portal, read, $active, $untrack } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { styled } from '../../theme/style.js';
import { pageColors, radiusOf, shadowOf } from '../../theme/resolve.js';
import { Close, $controlled, keyOf, partOf, handled } from '../../core/overlays/shared.jsx';
import { LAYERS } from '../../theme/layers.js';
import { dragger, clamp, $stack } from './shared.js';
import { DECOR, named } from '../../theme/meaning.js';
import { labelsIn } from '../../theme/labels.js';

/** @typedef {{ x: number, y: number }} Point */
/** @typedef {{ width: number, height: number }} Size */

/** @typedef {{ min: Size, max: Size }} Bounds */

/**
 * The size after a resize by (dx, dy) from `from`, within the bounds.
 * @param {Size} from @param {number} dx @param {number} dy @param {'right' | 'bottom' | 'corner'} edge
 * @param {Bounds} b
 * @returns {Size}
 */
export function resized(from, dx, dy, edge, b) {
  return {
    width: edge === 'bottom' ? from.width : clamp(from.width + dx, b.min.width, b.max.width),
    height: edge === 'right' ? from.height : clamp(from.height + dy, b.min.height, b.max.height),
  };
}

/**
 * A window over its parent (or the page's layer, `portal`): `title`,
 * `open` + `onOpenChange` or `defaultOpen` (true), `defaultPosition`
 * (`sizes.box.at`: { x: 20, y: 20 }) or `position` + `onPositionChange`, `defaultSize`
 * (`sizes.box.window`: { width: 320, height: 240 }) or `size` + `onSizeChange`, `bounds`
 * `{ min: { width, height }, max: { width, height } }` (any part may be left
 * out; min `sizes.box.windowMin`: 160 × 80, max unbounded), `draggable` (true: by
 * the title bar; `onMove(phase)` hears 'start' at a drag's first move and
 * 'end' as it lets go), `resizable` (true: the right and bottom edges and the
 * corner; `onResize(phase)` the same around each resize), `closable` (true, or { label: 'Close window' }), `collapsible`
 * (true: minimize to the title bar; `collapsed` + `onCollapsedChange` or
 * `defaultCollapsed`), `layer` (the sheet layer, 20: the base; a pressed window goes above
 * the others of its root), `radius`, `shadow` ('md'), `portal` (false).
 * Escape in the window closes it (`dismiss`: { escape: true }, or false).
 * It means a `dialog` named by its title (or its `aria-label`).
 * @param {Record<string, any>} props
 */
export function Window(props) {
  const R = $active();
  const ui = $ui();
  // Its place among the root's windows: the front one pressed last, all of them within as many steps as there are windows.
  const stack = $stack();
  const front = stack.front;
  const box = $untrack(R, ui.theme).sizes.box;
  const [x, y] = box.at;
  const pos = $controlled(props, 'position', 'defaultPosition', /** @type {Point} */ ({ x, y }), p => props.onPositionChange?.(p));
  const [width, height] = box.window;
  const size = $controlled(props, 'size', 'defaultSize', /** @type {Size} */ ({ width, height }), s => props.onSizeChange?.(s));
  const collapsed = $controlled(props, 'collapsed', 'defaultCollapsed', false, c => props.onCollapsedChange?.(c));
  const open = $controlled(props, 'open', 'defaultOpen', true, o => props.onOpenChange?.(o));
  const close = () => open.set(false);
  const escape = () => {
    const d = read(props.dismiss);
    return d !== false && (d == null || typeof d !== 'object' || d.escape !== false);
  };
  /** @returns {Bounds} */
  const bounds = () => {
    const b = read(props.bounds) ?? {};
    const [w, h] = ui.theme().sizes.box.windowMin;
    return {
      min: { width: b.min?.width ?? w, height: b.min?.height ?? h },
      max: { width: b.max?.width ?? Infinity, height: b.max?.height ?? Infinity },
    };
  };
  /**
   * A gesture's phases: 'start' at its first move, 'end' as it lets go of one that moved.
   * @param {'onMove' | 'onResize'} name @param {{ began?: boolean }} s @param {number} dx @param {number} dy
   */
  const begin = (name, s, dx, dy) => {
    if (s.began || (dx === 0 && dy === 0)) return;
    s.began = true;
    props[name]?.('start');
  };
  const move = dragger({
    /** @param {{ from: Point, began?: boolean }} s */
    onMove: (dx, dy, s) => {
      begin('onMove', s, dx, dy);
      pos.set({ x: s.from.x + dx, y: s.from.y + dy });
    },
    onEnd: s => s.began && props.onMove?.('end'),
  });
  const grow = dragger({
    /** @param {{ from: Size, edge: 'right' | 'bottom' | 'corner', began?: boolean }} s */
    onMove: (dx, dy, s) => {
      begin('onResize', s, dx, dy);
      size.set(resized(s.from, dx, dy, s.edge, $untrack(R, bounds)));
    },
    onEnd: s => s.began && props.onResize?.('end'),
  });
  /** Keeps a press on a title bar button from starting a drag. @param {any} e */
  const stop = e => e?.stopPropagation?.();
  const style = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    const p = pos.get();
    const s = size.get();
    return {
      position: 'absolute',
      left: p.x,
      top: p.y,
      width: s.width,
      height: collapsed.get() ? theme.sizes.box.windowTitle + 2 : s.height,
      zIndex: Number(read(props.layer) ?? LAYERS.sheet) + stack.place(),
      direction: 'column',
      background: page.body,
      color: page.text,
      border: 1,
      borderColor: page.border,
      radius: radiusOf(theme, read(props.radius) ?? 'md'),
      shadow: shadowOf(theme, read(props.shadow) ?? 'md'),
      overflow: 'hidden',
    };
  });
  const bar = styled({}, (theme, scheme) => ({
    direction: 'row',
    align: 'center',
    gap: theme.spacing.xs / 2,
    height: theme.sizes.box.windowTitle,
    minHeight: theme.sizes.box.windowTitle,
    shrink: 0,
    padding: [0, theme.control.panelPad, 0, theme.spacing.sm],
    background: pageColors(theme, scheme).sunken,
    cursor: read(props.draggable) === false ? undefined : 'move',
    ...(read(props.draggable) === false ? null : { touchAction: 'none' }),
  }));
  const minimizeIcon = () => {
    const c = pageColors(ui.theme(), ui.scheme()).text;
    return collapsed.get()
      ? [{ kind: 'path', points: [3, 9, 7, 5, 11, 9], stroke: 1.5, color: c }]
      : [{ kind: 'line', x: 3, y: 10, right: 11, bottom: 10, stroke: 1.5, color: c }];
  };
  const edge = (/** @type {'right' | 'bottom' | 'corner'} */ which) => {
    // A side's strip is `control.panelPad` thick and stops `spacing.xs` short of the corner; the corner is a `sizes.glyph.xs` square.
    const place = () => {
      const t = ui.theme();
      const strip = t.control.panelPad;
      const corner = t.sizes.glyph.xs;
      return which === 'right'
        ? { top: 0, right: 0, bottom: t.spacing.xs, width: strip, cursor: 'ew-resize' }
        : which === 'bottom'
          ? { left: 0, bottom: 0, right: t.spacing.xs, height: strip, cursor: 'ns-resize' }
          : { right: 0, bottom: 0, width: corner, height: corner, cursor: 'nwse-resize' };
    };
    return (
      <View
        onPointerDown={(/** @type {any} */ e) => {
          front();
          grow.down(e, { from: { ...$untrack(R, size.get) }, edge: which });
        }}
        onPointerMove={grow.move}
        onPointerUp={grow.up}
        onPointerCancel={grow.cancel}
        style={() => ({ position: 'absolute', zIndex: 2, ...place(), touchAction: 'none' })}
      />
    );
  };
  const content = (
    <View
      ref={props.ref}
      role="dialog"
      aria-label={props['aria-label'] ?? named(props.title)}
      style={style}
      onPointerDown={front}
      onKey={(/** @type {any} */ e) => keyOf(e) === 'Escape' && escape() && (handled(e), close())}
    >
      <View
        style={bar}
        onPointerDown={(/** @type {any} */ e) => {
          if (read(props.draggable) === false) return;
          move.down(e, { from: { ...$untrack(R, pos.get) } });
        }}
        onPointerMove={move.move}
        onPointerUp={move.up}
        onPointerCancel={move.cancel}
      >
        <View style={{ grow: 1, minWidth: 0 }}>
          {typeof props.title === 'string' || typeof props.title === 'function' ? <Label text={props.title} ellipsis style={() => ({ fontWeight: ui.theme().weights.strong })} /> : props.title}
        </View>
        {read(props.collapsible) === false ? null : (
          <Action
            onPointerDown={stop}
            label={() => (collapsed.get() ? labelsIn().restore : labelsIn().minimize)}
            onPress={() => collapsed.set(!$untrack(R, collapsed.get))}
            style={styled({}, (theme, scheme) => ({ width: theme.sizes.icon.md, height: theme.sizes.icon.md, minHeight: theme.sizes.icon.md, padding: 0, border: 0, radius: theme.radius.sm, background: 'transparent', align: 'center', justify: 'center', cursor: 'pointer', hover: { background: pageColors(theme, scheme).hover } }))}
          >
            <Shape {...DECOR} shapes={minimizeIcon} style={() => ({ width: ui.theme().sizes.glyph.sm, height: ui.theme().sizes.glyph.sm })} />
          </Action>
        )}
        {() => {
          const closable = partOf(read(props.closable), true);
          return closable === null ? null : (
            <View onPointerDown={stop} style={{ shrink: 0 }}>
              <Close size="md" label={closable.label ?? (() => labelsIn().closeWindow)} onPress={close} />
            </View>
          );
        }}
      </View>
      <Show when={() => !collapsed.get()}>
        <View style={styled({}, theme => ({ grow: 1, minHeight: 0, direction: 'column', padding: theme.spacing.sm, overflow: 'hidden' }))}>{props.children}</View>
        {read(props.resizable) === false ? null : [edge('right'), edge('bottom'), edge('corner')]}
      </Show>
    </View>
  );
  const placed = read(props.portal) === true ? <Portal>{content}</Portal> : content;
  return <Show when={open.get}>{placed}</Show>;
}
