// Feedback: Alert, Notification, EmptyState and Skeleton, on the portable
// View and Label (icons are the caller's, or drawn with Shape).

import { View, Label, Show, $context, $lookup, $read, read, $active, $memo } from 'ren-core';
import { styled } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { variantColors, radiusOf, shadowOf, pageColors, colorOf, flexWord, fontBelow } from '../../theme/resolve.js';
import { alpha } from '../../theme/colors.js';
import { pass } from '../layout/layout.jsx';
import { CloseButton } from '../buttons/icon-button.jsx';
import { $elapsed } from './anim.js';
import { MOTION } from '../../theme/motion.js';
import { DECOR, flag } from '../../theme/meaning.js';
import { $reducedMotion } from '../../hooks/platform.js';
import { partOptions } from '../data/parts.jsx';
import { labelsIn } from '../../theme/labels.js';

/** Whether children are plain text (a string, a number, or an accessor of one). @param {any} children */
export const textual = children => typeof children === 'string' || typeof children === 'number' || typeof children === 'function';

/** The marker `textOf`'s memo holds while an accessor gives text (a node is held as itself). */
const TEXT = Symbol('text');

/**
 * Text children as a Label in `style`, other children as they are. An
 * accessor may give text or a node, and change from one to the other: the
 * Label stays while it gives text (its text follows), a node shows as it
 * is.
 * @param {any} children @param {any} [style]
 */
export function textOf(children, style) {
  if (typeof children !== 'function') return textual(children) ? <Label text={children} style={style} /> : children;
  const R = $active();
  const held = $memo(R, () => {
    const v = children();
    return v !== null && typeof v === 'object' ? v : TEXT;
  });
  const text = () => {
    const v = children();
    return v == null || typeof v === 'object' ? '' : String(v);
  };
  return () => {
    const h = $read(held);
    return h === TEXT ? <Label text={text} style={style} /> : h;
  };
}


/**
 * The close part of Alert and Notification from `closable`: false (none),
 * true (the built-in close button, labeled 'Close'), its options (`{ label }`
 * and the rest of CloseButton's props) or a node of your own. It presses
 * `onClose`.
 * @param {Record<string, any>} props @param {boolean} fallback whether it shows when `closable` is not set @param {Record<string, any>} own the built-in button's props
 */
function closer(props, fallback, own) {
  return () => {
    const c = read(props.closable) ?? fallback;
    if (c === false || c == null) return null;
    if (c !== true && !partOptions(c)) return c;
    const o = c === true ? {} : c;
    return <CloseButton {...own} {...o} label={o.label ?? (() => labelsIn().close)} onPress={props.onClose} />;
  };
}

/**
 * The tone mark of Alert and Notification, beside the first line: the
 * `icon` at `theme.ratios.icon` of that line's height, or a round dot at
 * `theme.ratios.mark` of it, in `color`; it follows `icon` and is
 * decoration.
 * @param {Record<string, any>} props @param {() => number} line @param {() => string} color
 */
function toneMark(props, line, color) {
  const ui = $ui();
  /** The mark's side: the icon's or the dot's share of the first line. */
  const side = () => line() * (read(props.icon) == null ? ui.theme().ratios.mark : ui.theme().ratios.icon);
  const markBox = () => ({ width: side(), height: line(), align: 'center', justify: 'center', shrink: 0, color: color() });
  const dot = () => ({ width: side(), height: side(), radius: ui.theme().radius.round, background: color() });
  const icon = () => ({ width: side(), height: side(), align: 'center', justify: 'center' });
  return (
    <View {...DECOR} style={/** @type {any} */ (markBox)}>
      {() => (read(props.icon) == null ? <View style={/** @type {any} */ (dot)} /> : <View style={/** @type {any} */ (icon)}>{read(props.icon)}</View>)}
    </View>
  );
}

/** The variants whose ground is filled with the tone (their text takes the variant's ink). */
const FILLED = ['solid', 'inverse'];

/**
 * An alert, in the same language as Notification but set in the page
 * rather than raised above it: `title` (a strong line in the variant's
 * ink), `children` (the message: a font step below the title, on the
 * quiet role under a title, else in the text color), `icon` (in place of
 * the tone dot), `variant`, `color` (its tone, the accent by default),
 * `radius`, `closable` with `onClose`.
 *
 * Its tone mark sits beside the first line: a round dot
 * `theme.ratios.mark` of that line's height, or the `icon` at
 * `theme.ratios.icon` of it, in the variant's ink. The surface and edge
 * follow `variant`: soft (the default: a tinted ground with a 1 px edge
 * of the ink at `theme.opacity.soft`), solid (the tone's fill, no edge),
 * outline (no ground, a 1 px edge of the ink), neutral (the page's
 * neutral ground and border), plain (neither) and inverse (a white ground
 * in the tone's ink). On solid and inverse the text is the ink (its quiet
 * role the ink at `theme.opacity.muted`); elsewhere the title is the ink
 * and the message the page's roles. The theme's corner (or `radius`),
 * padding spacing sm by md, its parts `theme.control.iconGap` apart, the
 * title and message half an xs step apart.
 *
 * `closable` is a part: false (the default: none), true (a plain
 * CloseButton at size xs in the ink, labeled 'Close'), its options
 * (`{ label }` and the rest of CloseButton's props) or a node of your
 * own; it presses `onClose`. It means an `alert`; its mark is decoration.
 * @param {Record<string, any>} props
 */
export function Alert(props) {
  const ui = $ui();
  const variant = () => read(props.variant) ?? 'soft';
  const colors = () => variantColors(ui.theme(), ui.scheme(), variant(), read(props.color));
  const ink = () => colors().color;
  const filled = () => FILLED.includes(variant());
  const titled = () => read(props.title) != null;
  /** The message's font size: a step below the title's. @param {import('../../theme/theme.jsx').RuiThemeValue} theme */
  const below = theme => fontBelow(theme, theme.fontSizes.md);
  /** The first line's height: the title's, else the message's. */
  const line = () => {
    const theme = ui.theme();
    return (titled() ? theme.fontSizes.md : below(theme)) * theme.lineHeights.sm;
  };
  const style = styled(props, (theme, scheme) => {
    const c = colors();
    const edge = variant() === 'soft' ? alpha(c.color, theme.opacity.soft) : c.border;
    return {
      direction: 'row',
      align: 'start',
      padding: [theme.spacing.sm, theme.spacing.md],
      gap: theme.control.iconGap,
      radius: radiusOf(theme, read(props.radius)),
      background: c.background,
      border: 1,
      borderColor: edge,
      color: filled() ? c.color : pageColors(theme, scheme).text,
    };
  });
  /** @type {() => Record<string, any>} */
  const title = () => {
    const theme = ui.theme();
    return { fontSize: theme.fontSizes.md, fontWeight: theme.weights.strong, lineHeight: theme.lineHeights.sm, color: ink() };
  };
  const message = () => {
    const theme = ui.theme();
    const page = pageColors(theme, ui.scheme());
    const text = filled() ? ink() : page.text;
    const quiet = filled() ? alpha(ink(), theme.opacity.muted) : page.quiet;
    return { fontSize: below(theme), lineHeight: theme.lineHeights.sm, color: titled() ? quiet : text };
  };
  return (
    <View role="alert" {...pass(props)} style={style}>
      {toneMark(props, line, ink)}
      <View style={() => ({ grow: 1, shrink: 1, minWidth: 0, gap: ui.theme().spacing.xs / 2 })}>
        {() => (titled() ? <Label text={() => String(read(props.title) ?? '')} style={title} /> : null)}
        {textOf(props.children, message)}
      </View>
      {closer(props, false, { size: 'xs', variant: 'plain', color: ink })}
    </View>
  );
}

/**
 * A notification on a raised surface: `title` (a strong line in the
 * text color), `children` (the message: in the text color a font step
 * below the title's size, dimmed to `theme.opacity.muted` under a
 * title), `color`
 * (its tone, the accent by default), `icon` (in place of the tone dot),
 * `loading`, `closable` with `onClose`, `radius`.
 *
 * Its tone mark sits beside the first line: a round dot
 * `theme.ratios.mark` of that line's height, or the `icon` at
 * `theme.ratios.icon` of it, both in `color`. `loading` adds a rule along
 * the bottom edge: a 2 px track in the color at `theme.opacity.faint`
 * with a segment `theme.ratios.mark` of it in the color sweeping
 * across every four calm motions (still, in the middle, when the user
 * asks for reduced motion); the mark stays. The surface: `pageColors` raised, the theme's corner
 * (or `radius`), shadow md, a 1 px edge, padding spacing sm by md, its
 * parts `theme.control.iconGap` apart.
 *
 * `closable` is a part: true (the default: a CloseButton at size xs,
 * labeled 'Close'), false (none), its options (`{ label }` and the rest
 * of CloseButton's props) or a node of your own; it presses `onClose`.
 * It means a `status` (an `alert` in red), busy while loading; its mark
 * and rule are decoration.
 * @param {Record<string, any>} props
 */
export function Notification(props) {
  const ui = $ui();
  const color = () => colorOf(ui.theme(), ui.scheme(), read(props.color));
  const loading = () => read(props.loading) === true;
  const titled = () => read(props.title) != null;
  const still = $reducedMotion().value;
  /** The message's font size: a step below the title's. @param {import('../../theme/theme.jsx').RuiThemeValue} theme */
  const below = theme => fontBelow(theme, theme.fontSizes.md);
  /** The first line's height: the title's, else the message's. */
  const line = () => {
    const theme = ui.theme();
    return (titled() ? theme.fontSizes.md : below(theme)) * theme.lineHeights.sm;
  };
  const style = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    return {
      direction: 'row',
      align: 'start',
      padding: [theme.spacing.sm, theme.spacing.md],
      gap: theme.control.iconGap,
      radius: radiusOf(theme, read(props.radius)),
      overflow: 'hidden',
      shadow: shadowOf(theme, 'md'),
      background: page.raised,
      border: 1,
      borderColor: page.edge,
      color: page.text,
    };
  });
  const title = () => {
    const theme = ui.theme();
    return { fontSize: theme.fontSizes.md, fontWeight: theme.weights.strong, lineHeight: theme.lineHeights.sm, color: pageColors(theme, ui.scheme()).text };
  };
  const message = () => {
    const theme = ui.theme();
    const page = pageColors(theme, ui.scheme());
    return { fontSize: below(theme), lineHeight: theme.lineHeights.sm, color: page.text, ...(titled() ? { opacity: theme.opacity.muted } : null) };
  };
  // The loading rule: its segment sweeping in from the start and out past the end.
  const time = $elapsed(() => loading() && !$read(still));
  /** The moving segment's share of the track, percent: a mark's share (`theme.ratios.mark`). */
  const share = () => ui.theme().ratios.mark * 100;
  const at = () => ($read(still) ? (100 - share()) / 2 : ((time() % (MOTION.calm * 4)) / (MOTION.calm * 4)) * (100 + share()) - share());
  const rule = () => ({ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, direction: 'row', background: alpha(color(), ui.theme().opacity.faint) });
  const lead = () => ({ width: `${Math.max(0, at())}%`, shrink: 0 });
  const run = () => ({ width: `${Math.max(0, Math.min(at() + share(), 100) - Math.max(at(), 0))}%`, shrink: 0, background: color() });
  return (
    <View role={() => (String(read(props.color) ?? '').split('.')[0] === 'red' ? 'alert' : 'status')} aria-busy={flag(loading)} {...pass(props)} style={style}>
      {toneMark(props, line, color)}
      <View style={() => ({ grow: 1, shrink: 1, minWidth: 0, gap: ui.theme().spacing.xs / 2 })}>
        {() => (titled() ? <Label text={() => String(read(props.title) ?? '')} style={title} /> : null)}
        {textOf(props.children, message)}
      </View>
      {closer(props, true, { size: 'xs' })}
      <Show when={loading}>
        <View {...DECOR} style={/** @type {any} */ (rule)}>
          <View style={/** @type {any} */ (lead)} />
          <View style={/** @type {any} */ (run)} />
        </View>
      </Show>
    </View>
  );
}

const EMPTY_STEPS = ['xs', 'sm', 'md', 'lg', 'xl'];

/** An EmptyState's settings, for its parts. */
const Empty = $context(/** @type {Record<string, any>} */ ({}));

/** The EmptyState's size step. @param {Record<string, any>} own */
const emptySize = own => /** @type {'xs' | 'sm' | 'md' | 'lg' | 'xl'} */ (EMPTY_STEPS.includes(read(own.size)) ? read(own.size) : 'md');
/** The EmptyState's heading size: a heading level by its size. @param {Record<string, any>} own @param {import('../../theme/theme.jsx').RuiThemeValue} theme */
const emptyHeading = (own, theme) => theme.headings.levels[5 - EMPTY_STEPS.indexOf(emptySize(own))].size;
/** Its alignment as the portable one: start unless center or end. @param {Record<string, any>} own */
const emptyAlign = own => flexWord(read(own.align) === 'center' ? 'center' : read(own.align) === 'end' ? 'end' : 'start');

/**
 * A placeholder for no data or a first run: `mark`, `heading`, `note`,
 * `children` (buttons, or the parts EmptyState.Mark, EmptyState.Heading,
 * EmptyState.Note and EmptyState.Buttons), `align` (start by default,
 * center, end: the parts and their text line up on that side), `size` (xs
 * to xl: its mark the theme's `sizes.empty`, its note at that font size,
 * its heading at a heading, the sixth level for xs up to the second for
 * xl, apart by half that spacing step), `variant` (solid or soft: a
 * colored mark) with `color`, `tinted` (a plate behind the mark). The
 * buttons sit a spacing xs further down, on the same side.
 * @param {Record<string, any>} props
 */
export function EmptyState(props) {
  const style = styled(props, theme => ({ direction: 'column', align: /** @type {any} */ (emptyAlign(props)), gap: theme.spacing[emptySize(props)] / 2 }));
  return (
    <Empty value={props}>
      <View {...pass(props)} style={style}>
        {props.mark === undefined ? null : <EmptyStateMark>{props.mark}</EmptyStateMark>}
        {props.heading === undefined ? null : <EmptyStateHeading>{props.heading}</EmptyStateHeading>}
        {props.note === undefined ? null : <EmptyStateNote>{props.note}</EmptyStateNote>}
        {props.children}
      </View>
    </Empty>
  );
}

/** The mark (an icon or illustration) of an EmptyState: decoration. @param {Record<string, any>} props */
function EmptyStateMark(props) {
  const own = /** @type {Record<string, any>} */ ($lookup(Empty));
  const style = styled(props, (theme, scheme) => {
    const side = theme.sizes.empty[emptySize(own)];
    const variant = read(own.variant);
    const plate = read(own.tinted) === true;
    const c = variant === 'solid' || variant === 'soft' ? variantColors(theme, scheme, variant, read(own.color)) : null;
    const page = pageColors(theme, scheme);
    return {
      width: side,
      height: side,
      radius: theme.radius.round,
      align: 'center',
      justify: 'center',
      color: c === null ? page.quiet : c.color,
      ...(c !== null ? { background: c.background } : plate ? { background: pageColors(theme, scheme).sunken } : null),
    };
  });
  return (
    <View {...DECOR} style={style}>
      {props.children}
    </View>
  );
}

/** The text alignment of an EmptyState's lines. @param {Record<string, any>} own @returns {any} */
const emptyText = own => (emptyAlign(own) === 'center' ? 'center' : emptyAlign(own));

/** The heading of an EmptyState. @param {Record<string, any>} props */
function EmptyStateHeading(props) {
  const own = /** @type {Record<string, any>} */ ($lookup(Empty));
  const style = styled(props, theme => ({ fontSize: emptyHeading(own, theme), fontWeight: theme.headings.weight, textAlign: emptyText(own) }));
  return textual(props.children) ? <Label text={props.children} style={style} /> : <View style={style}>{props.children}</View>;
}

/** The note of an EmptyState, in quiet text that wraps within its room, at most `sizes.box.empty` wide. @param {Record<string, any>} props */
function EmptyStateNote(props) {
  const own = /** @type {Record<string, any>} */ ($lookup(Empty));
  const style = styled(props, (theme, scheme) => ({
    fontSize: theme.fontSizes[emptySize(own)],
    color: pageColors(theme, scheme).quiet,
    textAlign: emptyText(own),
    // It wraps within the room it is in, at most the theme's cap wide.
    wrap: true,
    maxWidth: theme.sizes.box.empty,
  }));
  return textual(props.children) ? <Label text={props.children} style={style} /> : <View style={style}>{props.children}</View>;
}

/** The buttons of an EmptyState, in a row on its side. @param {Record<string, any>} props */
function EmptyStateButtons(props) {
  const own = /** @type {Record<string, any>} */ ($lookup(Empty));
  const style = styled(props, theme => ({ direction: 'row', gap: theme.spacing.sm, wrap: true, justify: /** @type {any} */ (emptyAlign(own)), margin: [theme.spacing.xs, 0, 0, 0] }));
  return <View style={style}>{props.children}</View>;
}
EmptyState.Mark = EmptyStateMark;
EmptyState.Heading = EmptyStateHeading;
EmptyState.Note = EmptyStateNote;
EmptyState.Buttons = EmptyStateButtons;

/**
 * A placeholder while content loads: `height`, `width` (px or a percent),
 * `radius`, `round` (as wide as high, round), `pulse` (true by default:
 * its opacity breathes from `theme.opacity.disabled` to
 * `theme.opacity.dense` and back over four calm motions), `loading`
 * (true by default; false shows the children instead). Its children keep
 * their room while it shows; it is `aria-hidden` while it shows.
 * @param {Record<string, any>} props
 */
export function Skeleton(props) {
  const shown = () => read(props.loading) !== false;
  const time = $elapsed(() => shown() && read(props.pulse) !== false);
  const style = styled(props, (theme, scheme) => {
    if (!shown()) return {};
    const h = read(props.height);
    const w = read(props.width);
    const round = read(props.round) === true;
    const { disabled: low, dense: high } = theme.opacity;
    const wave = (1 - Math.cos((time() / (MOTION.calm * 4)) * 2 * Math.PI)) / 2;
    const pulse = read(props.pulse) === false ? 1 : low + (high - low) * wave;
    return {
      ...(h == null ? null : { height: h }),
      ...(round ? { width: h, radius: theme.radius.round } : { ...(w == null ? { width: '100%' } : { width: w }), radius: radiusOf(theme, read(props.radius)) }),
      background: pageColors(theme, scheme).track,
      overflow: 'hidden',
      opacity: pulse,
    };
  });
  return (
    <View aria-hidden={() => (shown() ? 'true' : undefined)} {...pass(props)} style={style}>
      {props.children === undefined ? null : <View style={() => (shown() ? { opacity: 0 } : {})}>{props.children}</View>}
    </View>
  );
}

