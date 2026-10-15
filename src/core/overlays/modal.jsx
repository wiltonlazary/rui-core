// Modal, Drawer and Dialog: content in the portal layer over a backdrop,
// closed by the backdrop, Escape or the close button, with focus moved into
// them and kept there (the primitives' `trap`), given back where it was on
// close, and a motion on the Clock. Modal and Drawer are built from their
// compound parts (Modal.Frame, Backdrop, Content, Header, Title, Close,
// Body), which compose one by hand too; Modal.Stack (modal-stack.jsx)
// layers several.

import { View, Label, Action, Show, Portal, read, $active, $context, $lookup, $owner, $cleanup, $watch, $focus, $signal, $read, $write, $batch, $after } from 'ren-core';
import { Clock } from '../../theme/motion.js';
import { styled } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { pageColors, radiusOf, shadowOf, spacing, colorOf } from '../../theme/resolve.js';
import { alpha } from '../../theme/colors.js';
import { LAYERS } from '../../theme/layers.js';
import { Layer, $controlled, $presence, timingOf, motionOf, moved, Close, focus, keyOf, activeOf, partOf, dismissOf, shadeColor, shadeOpacity, handled } from './shared.jsx';
import { DECOR } from '../../theme/meaning.js';
import { ModalStack, StackContext, seat } from './modal-stack.jsx';
import { tables } from '../../own.js';
import { labelsIn } from '../../theme/labels.js';



/** A size: a scale step, pixels or a percent string. @param {Record<string, number>} scale @param {any} size */
const sizeOf = (scale, size) => (typeof size === 'number' ? size : typeof size === 'string' && size.endsWith('%') ? size : (scale[size ?? 'md'] ?? scale.md));

/**
 * What Modal and Drawer share: the open state (`open` with
 * `onOpenChange`, or its own from `defaultOpen`), presence (a Modal's
 * 'base' motion, a Drawer's 'calm'), closing, and focus in and out.
 * @param {Record<string, any>} props @param {'modal' | 'drawer'} kind
 */
function $dialog(props, kind) {
  const R = $active();
  const clock = /** @type {import('../../theme/motion.js').ClockValue} */ ($lookup(Clock));
  const state = $controlled(props, 'open', 'defaultOpen', false, value => props.onOpenChange?.(value));
  const isOpen = () => state.get() === true;
  const close = () => state.set(false);
  const motion = () => motionOf(read(props.motion));
  const dismiss = () => dismissOf(read(props.dismiss));
  const presence = $presence(isOpen, () => timingOf(read(props.motion), kind === 'drawer' ? 'calm' : 'base'), { exited: () => props.onExited?.(), entered: () => props.onEntered?.() });
  /** @type {any} */
  let closer = null;
  /** @type {any} */
  let holder = null;
  /** Whether the dialog has nothing else to focus: then the holder is built and takes the focus. */
  const needHolder = $signal(R, false);
  const first = () => closer ?? holder;
  /** @type {(() => void) | null} */
  let cancel = null;
  /** The element focused before it opens, to give the focus back to. @type {any} */
  let before = null;
  /**
   * Moves focus in once the content is laid out (the next frame), noting
   * where it was: to its first focusable (ren-core's `$focus`: the close
   * button, a field), the holder last of all.
   * @param {any} node the content
   */
  const enter = node => {
    if (read(props.trap) === false) {
      // Untrapped, the focus stays where the content puts it (a Launcher's search), but `refocus` still
      // gives it back on close: note it once the flush that shows the content attaches it, before any frame.
      $after(R, () => {
        if (isOpen()) before = activeOf(node);
      });
      return;
    }
    cancel?.();
    cancel = clock.frame(() => { // timer: feature, the focus once the modal's content is laid out (a measurement's frame)
      cancel = null;
      before = activeOf(node);
      // The holder of an earlier opening goes first, so the search below never lands on it (and
      // never loses the focus as it goes).
      $batch(R, () => $write(needHolder, false));
      if ($focus(node)) return;
      // Nothing focusable inside: build the holder (a focusable in the Tab cycle only then) and focus it.
      $batch(R, () => $write(needHolder, true));
      focus(first());
    });
  };
  // Closed: the focus goes back where it was (`refocus`).
  $watch(R, isOpen, open => {
    if (open) return;
    const to = before;
    before = null;
    if (to !== null && read(props.refocus) !== false) focus(to);
  });
  const owner = $owner(R);
  if (owner != null) $cleanup(/** @type {any} */ (owner), () => cancel?.());
  const onKey = (/** @type {any} */ e) => {
    if (keyOf(e) === 'Escape' && dismiss().escape) {
      handled(e);
      close();
    }
  };
  // A press on the backdrop closes it on pointerdown, and the focus goes back at once; the press's default
  // (a browser's mousedown, a canvas's press) would then focus what is under the pointer, the backdrop still
  // there on its way out, and drop the focus to nothing. Prevented, it leaves the focus where it went back.
  const onBackdrop = (/** @type {any} */ e) => {
    if (e == null || e.target !== e.currentTarget || !dismiss().outside) return;
    e.preventDefault?.();
    close();
  };
  return {
    isOpen,
    presence,
    close,
    onKey,
    onBackdrop,
    /** Tab stays inside while it traps the focus. */
    trap: () => read(props.trap) !== false,
    motion,
    layer: () => read(props.layer) ?? LAYERS.sheet,
    enter,
    /** @param {any} n */
    closer: n => (closer = n),
    /** @param {any} n */
    holder: n => (holder = n),
    needHolder: () => /** @type {boolean} */ ($read(needHolder)),
    first,
  };
}

/**
 * @typedef {object} DialogValue what the compound parts of a Modal or Drawer share
 * @property {ReturnType<typeof $dialog>} d
 * @property {Record<string, any>} props the root's props (with the stack's say)
 * @property {'modal' | 'drawer'} kind
 * @property {any} named the Modal.Title's text, for the focus holder's name
 * @property {boolean} header a Header was built (the Body then starts under it)
 */

/** The Modal or Drawer a part belongs to. */
const DialogContext = $context(/** @type {DialogValue | null} */ (null));

/** The part's dialog. @returns {DialogValue} */
function $part() {
  const c = /** @type {DialogValue | null} */ ($lookup(DialogContext));
  if (c === null) throw new Error('RUI: Modal and Drawer parts go inside a Modal.Frame or Drawer.Frame');
  return c;
}

/**
 * A Modal's (or Drawer's) frame for its compound parts
 * (Modal.Frame): the state, closing and focus of Modal's props (`open`,
 * `defaultOpen`, `onOpenChange`, `trap`, `refocus`, `dismiss`, `motion`,
 * `portal`, `layer`, and the look: `size`, `at`, `full`, `radius`,
 * `shadow`, `padding`, `offset`; a Drawer's `at` and `offset`), holding
 * `Modal.Backdrop` and `Modal.Content` with `Modal.Header`
 * (`Modal.Title`, `Modal.Close`) and `Modal.Body`. The layer takes Escape
 * and a press outside the content.
 * @param {Record<string, any>} props
 */
export function ModalFrame(props) {
  return Frame(props, 'modal');
}

/** A Drawer's frame for its compound parts (Drawer.Frame): ModalFrame's, the content sliding from its edge. @param {Record<string, any>} props */
export function DrawerFrame(props) {
  return Frame(props, 'drawer');
}

/** @param {Record<string, any>} given @param {'modal' | 'drawer'} kind */
function Frame(given, kind) {
  const stack = /** @type {import('./modal-stack.jsx').Stacking | null} */ ($lookup(StackContext));
  const id = given.stack;
  const member = stack === null || id == null ? null : seat(stack, id, given);
  const props = member?.props ?? given;
  const d = $dialog(props, kind);
  member?.join(d.isOpen);
  /** @type {DialogValue} */
  const ctx = { d, props, kind, named: undefined, header: false };
  return (
    <DialogContext value={ctx}>
      <Show when={d.presence.mounted}>
        {() => (
          <Layer layer={d.layer} portal={props.portal} onKey={d.onKey} onPointerDown={d.onBackdrop}>
            {given.children}
          </Layer>
        )}
      </Show>
    </DialogContext>
  );
}

/**
 * The backdrop (Modal.Backdrop): the frame's `backdrop` options or its
 * own `color` (night.9) at `opacity` (the theme's `opacity.disabled`; `opacity.muted` in the dark scheme),
 * fading with the content; a press on it closes (`dismiss.outside`).
 * @param {Record<string, any>} props
 */
export function ModalBackdrop(props) {
  const { d, props: root } = $part();
  const style = styled(props, (theme, scheme) => {
    const o = partOf(read(root.backdrop));
    const color = colorOf(theme, scheme, read(props.color) ?? o?.color ?? shadeColor(theme));
    const opacity = read(props.opacity) ?? o?.opacity ?? shadeOpacity(theme, scheme);
    return { position: 'absolute', inset: 0, background: o !== null ? alpha(color, opacity * d.presence.t()) : 'transparent' };
  });
  return <View {...DECOR} style={style} onPointerDown={d.onBackdrop} />;
}

/** The drawer effects by edge. */
const SLIDES = tables(/** @type {const} */ ({ left: 'slide-start', right: 'slide-end', top: 'slide-top', bottom: 'slide-bottom' }));

/** A Drawer's `at` as its edge: 'start' and 'end' are the inline ends (left and right in left-to-right text). */
const EDGES = tables(/** @type {Record<string, 'left' | 'right' | 'top' | 'bottom'>} */ ({ start: 'left', end: 'right', top: 'top', bottom: 'bottom' }));

/**
 * The content box (Modal.Content): placed by the frame's look (a
 * Modal's size, offset, `at` or full; a Drawer's edge, size and
 * offset), moving in by the frame's motion, holding the focus
 * (Tab stays inside while it traps it). Its own style props and `style`
 * add to its look.
 * @param {Record<string, any>} props
 */
export function ModalContent(props) {
  const ui = $ui();
  const c = $part();
  const { d, props: root } = c;
  // The focus holder, named by the title (a Modal.Title's text is known
  // once built): the dialog itself, after its parts, so a focusable of
  // theirs takes the focus first.
  const early = root.title !== undefined;
  const title = () => {
    const t = read(early ? root.title : c.named);
    return typeof t === 'string' ? t : labelsIn().dialog;
  };
  // The content means a modal `dialog`, named by its `title` (a Modal.Title
  // is known only once built: its heading names it then); the holder only
  // holds the focus.
  const dialog = { role: 'dialog', 'aria-modal': 'true', ...(early ? { 'aria-label': title } : null) };
  // Built only when the dialog has nothing else to focus (ren-core's Action cannot leave the Tab order).
  const holder = () => (
    <Show when={d.needHolder}>
      <Action
        ref={d.holder}
        role="none"
        label={title}
        style={{ position: 'absolute', width: 0, height: 0, minHeight: 0, minWidth: 0, padding: 0, border: 0, opacity: 0 }}
      />
    </Show>
  );
  if (c.kind === 'drawer') {
    const side = () => EDGES[read(root.at) ?? 'end'] ?? 'right';
    /** The edge box: along its edge at least the layer's length (its content's where the layer has none), the gap as padding. @returns {Record<string, any>} */
    const edge = () => {
      const s = side();
      const size = sizeOf(ui.theme().sizes.modal, read(root.size) ?? ui.theme().sizes.drawer);
      const across = s === 'left' || s === 'right';
      return {
        position: 'absolute',
        ...(across ? { top: 0, minHeight: '100%', width: size, maxWidth: '100%' } : { left: 0, right: 0, height: size, maxHeight: '100%' }),
        [s]: 0,
        padding: read(root.offset) ?? 0,
        direction: across ? 'column' : 'row',
        // Slides in from its edge: its own size off it, by a transform.
        ...moved(d.presence.t(), d.motion().effect ?? SLIDES[s]),
      };
    };
    const panel = styled(props, (theme, scheme) => {
      const page = pageColors(theme, scheme);
      return {
        grow: 1,
        background: page.raised,
        color: page.text,
        radius: (read(root.offset) ?? 0) > 0 ? radiusOf(theme, read(root.radius)) : 0,
        shadow: shadowOf(theme, read(root.shadow) ?? 'xl'),
        direction: 'column',
        overflow: 'hidden',
      };
    });
    return (
      <View style={edge} onPointerDown={d.onBackdrop}>
        <View ref={d.enter} trap={d.trap} {...dialog} style={panel}>
          {props.children}
          {holder()}
        </View>
      </View>
    );
  }
  const full = () => read(root.full) === true;
  /** @returns {Record<string, any>} */
  const inner = () => {
    const centered = read(root.at) === 'center';
    // `offset`: one gap for both, or `{ x, y }`: `sizes.box.modalTop` from the top, md from the sides.
    const offset = read(root.offset);
    const apart = offset != null && typeof offset === 'object';
    const y = (apart ? offset.y : offset) ?? ui.theme().sizes.box.modalTop;
    const x = (apart ? offset.x : offset) ?? ui.theme().spacing.md;
    // A minimum height, not a bottom inset: the box keeps its content's
    // height where that is more than the layer's.
    return full()
      ? { position: 'absolute', top: 0, left: 0, right: 0, minHeight: '100%', direction: 'column' }
      : { position: 'absolute', top: centered ? 0 : y, left: x, right: x, minHeight: centered ? '100%' : 0, direction: 'column', align: 'center', justify: centered ? 'center' : 'start' };
  };
  const content = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    const f = full();
    return {
      width: f ? '100%' : sizeOf(theme.sizes.modal, read(root.size)),
      maxWidth: '100%',
      ...(f ? { height: '100%' } : null),
      background: page.raised,
      color: page.text,
      radius: f ? 0 : radiusOf(theme, read(root.radius)),
      shadow: shadowOf(theme, read(root.shadow) ?? 'lg'),
      direction: 'column',
      overflow: 'hidden',
      ...moved(d.presence.t(), d.motion().effect ?? 'grow'),
    };
  });
  return (
    <View style={inner} onPointerDown={d.onBackdrop}>
      <View ref={d.enter} trap={d.trap} {...dialog} style={content}>
        {props.children}
        {holder()}
      </View>
    </View>
  );
}

/**
 * The header row (Modal.Header): its children (a Modal.Title
 * and a Modal.Close) apart in one row, the frame's padding around,
 * at least 56 high (`sizes.control.lg` and `spacing.sm`: a large control
 * with room, as Shell's header).
 * @param {Record<string, any>} props
 */
export function ModalHeader(props) {
  const c = $part();
  c.header = true;
  const style = styled(props, theme => ({ direction: 'row', align: 'center', justify: 'between', gap: theme.spacing.md, padding: spacing(theme, read(c.props.padding), 'lg'), minHeight: theme.sizes.control.lg + theme.spacing.sm }));
  return <View style={style}>{props.children}</View>;
}

/**
 * The title (Modal.Title): large and bold, filling the header's
 * row, a `heading` (level 2); its text also names the content.
 * @param {Record<string, any>} props
 */
export function ModalTitle(props) {
  const c = $part();
  c.named = props.children;
  const style = styled(props, theme => ({ fontSize: theme.fontSizes.lg, fontWeight: theme.headings.weight, lineHeight: theme.lineHeights.xs, grow: 1 }));
  return typeof props.children === 'string' || typeof props.children === 'function' || typeof props.children === 'number' ? (
    <Label role="heading" aria-level={2} text={props.children} style={style} />
  ) : (
    <View role="heading" aria-level={2} style={style}>
      {props.children}
    </View>
  );
}

/**
 * The close button (Modal.Close): closes the frame (or calls
 * `onPress`), and takes the focus as it opens; `size` ('md'), `label`
 * ('Close').
 * @param {Record<string, any>} props
 */
export function ModalClose(props) {
  const { d } = $part();
  return <Close ref={d.closer} size={props.size ?? 'md'} label={props.label} onPress={props.onPress ?? d.close} />;
}

/**
 * The content's body (Modal.Body): the frame's padding around
 * its children; under a header, spacing xs above them (the header's own
 * padding already sets it off).
 * @param {Record<string, any>} props
 */
export function ModalBody(props) {
  const c = $part();
  const style = styled(props, theme => {
    const p = spacing(theme, read(c.props.padding), 'lg');
    return { padding: [c.header ? theme.spacing.xs : p, p, p, p], direction: 'column', ...(c.kind === 'drawer' ? { grow: 1 } : null) };
  });
  return <View style={style}>{props.children}</View>;
}

/**
 * The parts Modal and Drawer build from their props: the backdrop, the
 * content with its header (the title and the close button) and its body.
 * @param {Record<string, any>} props
 */
function Composed(props) {
  const root = $part().props;
  const closable = () => partOf(read(props.closable));
  return (
    <>
      <Show when={() => partOf(read(root.backdrop)) !== null}>
        <ModalBackdrop />
      </Show>
      <ModalContent>
        <Show when={() => props.title !== undefined || closable() !== null}>
          <ModalHeader>
            {typeof props.title === 'string' || typeof props.title === 'function' ? <ModalTitle>{props.title}</ModalTitle> : <View style={{ grow: 1 }}>{props.title}</View>}
            {() => {
              const c = closable();
              if (c === null) return null;
              return c.node !== undefined ? c.node : <ModalClose size={c.size ?? 'md'} label={c.label} />;
            }}
          </ModalHeader>
        </Show>
        <ModalBody>{props.children}</ModalBody>
      </ModalContent>
    </>
  );
}

/**
 * A modal dialog: `open` with `onOpenChange(open)` (or `defaultOpen`),
 * `title`, `closable` (true; `{ size, label }`, or a node of your own),
 * `at` ('top'; 'center' centers it in the layer), `size` (xs to xl, the theme's
 * `sizes.modal`: 560 at md; px or '100%'), `full`, `padding` ('lg'), `radius`, `shadow`
 * ('lg'), `backdrop` (true; `{ color, opacity }`: night.9 at the theme's
 * `opacity.disabled`, `opacity.muted` in the dark scheme), `dismiss` (`{ escape, outside }`, both true; false
 * for neither), `trap` (true: focus moves into it and Tab stays in it),
 * `refocus` (true: on close the focus goes back to the element that had
 * it on open, trapped or not), `motion` ('base', a grow; a preset's name or `{ effect, duration,
 * exit, easing }`), `portal` (true), `layer` (`LAYERS.sheet`), `offset`
 * (`sizes.box.modalTop` from the top, md from the sides; or `{ x, y }`), `onEntered`,
 * `onExited`, `stack` (an id
 * in a `Modal.Stack`). Its parts, for composing one: `Modal.Frame`,
 * `Modal.Backdrop`, `Modal.Content`, `Modal.Header`, `Modal.Title`,
 * `Modal.Close`, `Modal.Body`.
 * @param {Record<string, any>} props
 */
export function Modal(props) {
  return (
    <ModalFrame {...props}>
      <Composed {...props} />
    </ModalFrame>
  );
}

/**
 * A panel sliding from an edge: `at` ('end': the inline end, the right in
 * left-to-right text; 'start', 'top', 'bottom'), `size` (360; xs to xl, the
 * theme's `sizes.modal`; px or '100%'), `offset` (0: a gap from the edges), `radius`, and
 * Modal's `open`, `defaultOpen`, `onOpenChange`, `title`, `closable`,
 * `backdrop`, `dismiss`, `trap`, `refocus`, `padding`, `shadow`,
 * `motion` ('calm': a slide from its edge), `portal`, `layer`, `stack`
 * (in a `Drawer.Stack`). Its parts: `Drawer.Frame` and
 * Modal's others (`Drawer.Backdrop`, `Drawer.Content`, …).
 * @param {Record<string, any>} props
 */
export function Drawer(props) {
  return (
    <DrawerFrame {...props}>
      <Composed {...props} />
    </DrawerFrame>
  );
}

Modal.Frame = ModalFrame;
Modal.Backdrop = ModalBackdrop;
Modal.Content = ModalContent;
Modal.Header = ModalHeader;
Modal.Title = ModalTitle;
Modal.Close = ModalClose;
Modal.Body = ModalBody;
Modal.Stack = ModalStack;
Drawer.Frame = DrawerFrame;
Drawer.Backdrop = ModalBackdrop;
Drawer.Content = ModalContent;
Drawer.Header = ModalHeader;
Drawer.Title = ModalTitle;
Drawer.Close = ModalClose;
Drawer.Body = ModalBody;
Drawer.Stack = ModalStack;

/**
 * A small window fixed in a corner of the viewport
 * (`position: fixed`), not modal: `open` with `onOpenChange(open)` (or
 * `defaultOpen`), `dismiss` (`{ escape, outside }`: Escape inside it
 * closes it and a press outside does not, as the page stays in use;
 * `outside: true` lays a transparent layer under it that takes such a
 * press and closes it (with `portal` false there is none); `true` for
 * both, false for neither), `closable` (false; true, `{ size,
 * label }` or a node), `at` ({ bottom: 'lg', right: 'lg' } by default;
 * any of top, right, bottom, left, in px or spacing steps), `size` (xs
 * to xl, the theme's `sizes.dialog`, or px), `bordered`, `shadow` ('lg'), `radius`, `p` ('lg'),
 * `motion` ('base', a rise; or `{ effect, duration, exit, easing }`),
 * `portal`, `layer` (`LAYERS.sheet`). Its children stand in a column;
 * the close is no corner overlay but a part of the first row: at the
 * row's end, level with the content's top, `theme.control.iconGap` from
 * it, inside the dialog's padding. It means a `dialog`.
 * @param {Record<string, any>} props
 */
export function Dialog(props) {
  const state = $controlled(props, 'open', 'defaultOpen', false, value => props.onOpenChange?.(value));
  const isOpen = () => state.get() === true;
  const close = () => state.set(false);
  const motion = () => motionOf(read(props.motion));
  const presence = $presence(isOpen, () => timingOf(read(props.motion), 'base'));
  /** Not modal: a press outside closes it only when asked. @returns {{ escape: boolean, outside: boolean }} */
  const dismiss = () => {
    const d = read(props.dismiss);
    if (d == null) return { escape: true, outside: false };
    return typeof d === 'object' ? { escape: d.escape !== false, outside: d.outside === true } : dismissOf(d);
  };
  const portal = () => read(props.portal) !== false;
  const style = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    const at = read(props.at) ?? { bottom: 'lg', right: 'lg' };
    /** An inset: px, or a spacing step. @param {any} v */
    const inset = v => (v == null ? undefined : spacing(theme, v));
    const pad = props.p === undefined ? { padding: theme.spacing.lg } : null;
    return {
      position: 'fixed',
      top: inset(at.top),
      right: inset(at.right),
      bottom: inset(at.bottom),
      left: inset(at.left),
      zIndex: read(props.layer) ?? LAYERS.sheet,
      width: sizeOf(theme.sizes.dialog, read(props.size)),
      maxWidth: '100%',
      background: page.raised,
      color: page.text,
      radius: radiusOf(theme, read(props.radius)),
      shadow: shadowOf(theme, read(props.shadow) ?? 'lg'),
      ...(read(props.bordered) ? { border: 1, borderColor: page.rule } : null),
      ...pad,
      // The content's column, then the close in the first row at its end.
      direction: 'row',
      align: 'start',
      gap: theme.control.iconGap,
      ...moved(presence.t(), motion().effect ?? 'rise'),
    };
  });
  const body = styled({}, () => ({ direction: 'column', align: 'stretch', grow: 1, shrink: 1, minWidth: 0 }));
  const closable = () => partOf(read(props.closable), false);
  const content = (
    <View ref={props.ref} role="dialog" aria-label={props['aria-label']} style={style} onKey={(/** @type {any} */ e) => keyOf(e) === 'Escape' && dismiss().escape && (handled(e), close())}>
      <View style={body}>{props.children}</View>
      {() => {
        const c = closable();
        if (c === null) return null;
        return <View style={{ shrink: 0 }}>{c.node !== undefined ? c.node : <Close size={c.size ?? 'sm'} label={c.label} onPress={close} />}</View>;
      }}
    </View>
  );
  return (
    <Show when={presence.mounted}>
      {() =>
        portal() ? (
          <>
            {() => (dismiss().outside && isOpen() ? <Layer layer={() => read(props.layer) ?? LAYERS.sheet} onPointerDown={close} /> : null)}
            <Portal>{content}</Portal>
          </>
        ) : (
          content
        )
      }
    </Show>
  );
}
