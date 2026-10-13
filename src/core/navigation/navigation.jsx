// Navigation: Link, Breadcrumbs, NavToggle, NavItem and Outline, on
// the portable Action (a press area with focus and keyboard activation).
// On the DOM an Action is a <button>, which is not a flex container, so the
// parts of an Action sit in a View inside it.

import { MOTION, durationOf } from '../../theme/motion.js';
import { Action, View, Label, Shape, Show, For, read, $read, $parts } from 'ren-core';
import { styled } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { variantColors, colorOf, radiusOf, pageColors, sized, spacing, fontBelow } from '../../theme/resolve.js';
import { alpha } from '../../theme/colors.js';
import { pass } from '../layout/layout.jsx';
import { pressOf } from '../buttons/button.jsx';
import { ChevronIcon, inkOf } from '../buttons/icons.jsx';
import { $follow } from '../misc/tween.js';
import { textual } from '../feedback/feedback.jsx';
import { $navValue } from './state.js';
import { DECOR, state } from '../../theme/meaning.js';
import { safeHref, safeOrNone } from '../../href.js';

/**
 * Opens `href` with the platform's navigation: `target` '_blank' in a new
 * window (`window.open`, noopener), else the page's location
 * (`location.assign`); nothing where the platform has neither (node, a
 * worker, a canvas without a page), and nothing for an unsafe address: only
 * a relative one, `#…`, `http:`, `https:`, `mailto:` or `tel:` is followed
 * (a `javascript:` or `data:` address, however cased or spaced, never is).
 * @param {string} href @param {string | undefined} target
 * @returns {boolean} whether the platform took it
 */
export function navigate(href, target) {
  if (!safeHref(href)) return false;
  const g = /** @type {any} */ (globalThis);
  if (target === '_blank') {
    if (typeof g.open !== 'function') return false;
    g.open(href, '_blank', 'noopener,noreferrer');
    return true;
  }
  if (g.location == null || typeof g.location.assign !== 'function') return false;
  g.location.assign(href);
  return true;
}

/**
 * A link: text in the accent color (`fg` or `color`), `size`,
 * `underlined` (true by default: a link is not told apart by its color
 * alone, WCAG 1.4.1; 'hover' underlines it under the pointer; false
 * never), `onPress`, and `href` with
 * `target`: after `onPress` (unless it prevents the default) the press
 * opens `href` through the platform's navigation where there is one
 * (`navigate`), inert elsewhere. Only a safe `href` is followed or shown:
 * relative, `#…`, `http:`, `https:`, `mailto:` or `tel:`; any other scheme
 * (`javascript:`, `data:`) makes an inert link with no `href`. It means a
 * link (role `link`, its `href`).
 * @param {Record<string, any>} props
 */
export function Link(props) {
  const style = styled(props, (theme, scheme) => {
    const underline = read(props.underlined) ?? true;
    const size = read(props.size);
    return {
      background: 'transparent',
      border: 0,
      padding: 0,
      cursor: 'pointer',
      color: colorOf(theme, scheme, read(props.color) ?? theme.accent),
      ...(size == null ? null : { fontSize: sized(theme.fontSizes, size) }),
      ...(underline === true ? { underline: true } : underline === 'hover' ? { hover: { underline: true } } : null),
    };
  });
  return <Action ref={props.ref} role="link" href={/** @type {any} */ (() => safeOrNone(read(props.href)))} text={props.children} label={props.label} onPress={follow(props)} style={style} />;
}

/** A Link's press: its `onPress`, then its `href` unless that prevented it. @param {Record<string, any>} props */
function follow(props) {
  const press = pressOf(props);
  return (/** @type {any} */ e) => {
    press?.(e);
    const href = read(props.href);
    if (href == null || href === '' || e?.defaultPrevented === true) return;
    e?.preventDefault?.();
    navigate(String(href), read(props.target));
  };
}

/**
 * Nested in text, a run in the link's color (underlined unless
 * `underlined` is false: a run has no hover, so 'hover' leaves it plain)
 * whose press is the Link's.
 * @type {import('../typography/inline.js').Inline}
 */
Link.inline = (props, theme, scheme) => {
  const size = read(props.size);
  return {
    style: {
      color: colorOf(theme, scheme, read(props.color) ?? theme.accent),
      ...(size == null ? null : { fontSize: sized(theme.fontSizes, size) }),
      ...((read(props.underlined) ?? true) === true ? { underline: true } : null),
    },
    onPress: follow(props),
  };
};

/**
 * Items in a row with a `separator` ('›' by default, text or an element)
 * between them, `separatorGap` ('sm') around it. It means a navigation
 * (`aria-label` 'Breadcrumbs') holding a `list` of `listitem`s, the last
 * the current page (`aria-current`); the separators are decoration. The
 * items are the children as rendered: each of a `For`'s items or an
 * accessor's parts is an item, and a `Show` showing nothing is none.
 * @param {Record<string, any>} props
 */
export function Breadcrumbs(props) {
  const ui = $ui();
  const items = $parts(props.children);
  const style = styled(props);
  const row = { direction: /** @type {const} */ ('row'), wrap: true, align: /** @type {const} */ ('center') };
  /** @type {() => Record<string, any>} */
  const separator = () => {
    const theme = ui.theme();
    const margin = spacing(theme, read(props.separatorGap), 'sm');
    return { margin: [0, margin], color: pageColors(theme, ui.scheme()).quiet, fontSize: theme.fontSizes.md, lineHeight: 1 };
  };
  const between = () => {
    const s = props.separator ?? '›';
    return textual(s) ? <Label {...DECOR} text={s} style={separator} /> : <View {...DECOR} style={separator}>{s}</View>;
  };
  return (
    <View role="navigation" aria-label="Breadcrumbs" {...pass(props)} style={style}>
      <View role="list" style={row}>
        <For each={items}>
          {(item, i) => [
            () => (i() > 0 ? between() : null),
            <View role="listitem" aria-current={() => (i() === $read(items).length - 1 ? 'page' : undefined)} style={{ direction: 'row', align: 'center' }}>
              {item}
            </View>,
          ]}
        </For>
      </View>
    </View>
  );
}

/**
 * The three lines of a NavToggle turning into an X as `p` goes from 0 to 1.
 * @param {number} box @param {number} size @param {number} line @param {string} color @param {number} p
 */
export function toggleFigures(box, size, line, color, p) {
  const c = box / 2;
  const half = size / 2;
  // The three lines a quarter of the figure apart: the stack spans its middle half.
  const gap = size / 4;
  /** @param {number} cy @param {number} degrees @param {string} ink */
  const at = (cy, degrees, ink) => {
    const a = (degrees * Math.PI) / 180;
    const dx = half * Math.cos(a);
    const dy = half * Math.sin(a);
    return { kind: 'line', x: c - dx, y: cy - dy, right: c + dx, bottom: cy + dy, color: ink, stroke: line };
  };
  /** @type {Record<string, any>[]} */
  const out = [at(c - gap * (1 - p), 45 * p, color), at(c + gap * (1 - p), -45 * p, color)];
  if (p < 1) out.push(at(c, 0, alpha(color, 1 - p)));
  return out;
}

/**
 * The navigation toggle: three lines that turn into an X while `open` (a
 * value, an accessor or a signal), over `duration` (ms or a MOTION
 * preset's name; base, 190 ms); `size` (xs
 * to xl, the theme's `sizes.toggle`, or px), `thickness` (the lines' width), `color`, `onPress`,
 * `label` ('Menu'). A button, `aria-expanded` while open.
 *
 * Its geometry: the lines sit in a square as tall as a control of the
 * same step (`sizes.control`; a px size takes the square an icon of that
 * size fills at `theme.ratios.icon`), and they are as thick as a Divider
 * of that step (`sizes.divider`; a px size takes the step whose toggle
 * it reaches).
 * @param {Record<string, any>} props
 */
export function NavToggle(props) {
  const ui = $ui();
  const size = () => sized(ui.theme().sizes.toggle, read(props.size), 'md');
  /** The size's step: its own, or the largest step a px size reaches. @returns {any} */
  const step = () => {
    const s = read(props.size);
    if (typeof s === 'string') return s;
    const toggle = /** @type {Record<string, number>} */ (ui.theme().sizes.toggle);
    return Object.keys(toggle).filter(k => toggle[k] <= size()).pop() ?? 'xs';
  };
  const box = () => {
    const theme = ui.theme();
    return typeof read(props.size) === 'number' ? Math.round(size() / theme.ratios.icon) : sized(theme.sizes.control, step(), 'md');
  };
  const open = $follow(() => (read(props.open) ? 1 : 0), () => durationOf(read(props.duration), MOTION.base));
  const style = styled(props, theme => ({
    width: box(),
    height: box(),
    padding: 0,
    border: 0,
    shrink: 0,
    background: 'transparent',
    radius: radiusOf(theme, read(props.radius)),
    cursor: 'pointer',
  }));
  const figures = () => toggleFigures(box(), size(), Number(read(props.thickness) ?? sized(ui.theme().sizes.divider, step(), 'md')), inkOf(ui, props.color), open());
  return (
    <Action ref={props.ref} label={props.label ?? 'Menu'} aria-expanded={state(props.open)} onPress={pressOf(props)} style={style}>
      <Shape shapes={figures} style={() => ({ width: box(), height: box() })} />
    </Action>
  );
}

/**
 * A navigation row: `label`, `description`, `start`, `end`, `active`,
 * `variant` (ghost by default, soft, solid), `color`, `disabled`, `wrap`
 * (true: the label wraps); with `children` (nested NavItems) it opens and
 * closes on press (`open` or `defaultOpen`, `onOpenChange(open)`), a
 * chevron turning (over MOTION's quick), `indent` ('md') indenting them.
 * It means a link (role `link`, its `href`, `aria-current` 'page' while
 * active), or with children a button `aria-expanded` while open.
 *
 * Its look: an option row (`theme.control.optionPad`), its label at the
 * body size (md) and its description on the quiet role a font step
 * below, its parts `theme.control.iconGap` apart. The active row carries
 * a tone edge on its start side (a Divider's md thickness, the tone's
 * shade) with its label in the variant's color: ghost on the page, soft
 * on a wash, solid on the fill (where the description is the fill's text
 * at `theme.opacity.muted`).
 * @param {Record<string, any>} props
 */
export function NavItem(props) {
  const ui = $ui();
  const nested = props.children !== undefined && props.children !== null;
  const expanded = $navValue(props, false, 'open', 'onOpenChange');
  const turn = $follow(() => (expanded.get() ? 0 : -90), MOTION.quick);
  const variant = () => read(props.variant) ?? 'ghost';
  const colors = () => variantColors(ui.theme(), ui.scheme(), variant(), read(props.color));
  const active = () => read(props.active) === true;
  const ink = () => (active() ? colors().color : pageColors(ui.theme(), ui.scheme()).text);
  const style = styled(props, (theme, scheme) => {
    const on = active();
    const c = colors();
    return {
      width: '100%',
      padding: theme.control.optionPad,
      border: 0,
      borderLeft: theme.sizes.divider.md,
      borderLeftColor: on ? colorOf(theme, scheme, read(props.color)) : 'transparent',
      radius: 0,
      textAlign: 'start',
      fontSize: theme.fontSizes.md,
      color: ink(),
      background: on && variant() !== 'ghost' ? c.background : 'transparent',
      cursor: read(props.disabled) ? 'not-allowed' : 'pointer',
      ...(read(props.disabled) ? { opacity: theme.opacity.disabled } : on ? { hover: { background: c.hover } } : { hover: { background: pageColors(theme, scheme).hover } }),
    };
  });
  const press = pressOf(props);
  const onPress = (/** @type {any} */ e) => {
    if (read(props.disabled)) return;
    if (nested) expanded.set(!expanded.get());
    press?.(e);
  };
  const description = () => {
    const theme = ui.theme();
    return { fontSize: fontBelow(theme, theme.fontSizes.md), color: active() && variant() === 'solid' ? alpha(colors().color, theme.opacity.muted) : pageColors(theme, ui.scheme()).quiet };
  };
  const label = () => ({ wrap: read(props.wrap) !== false });
  /** @type {() => Record<string, any>} */
  const offset = () => ({ padding: [0, 0, 0, spacing(ui.theme(), read(props.indent), 'md')] });
  return (
    <View style={styled({}, () => ({ direction: 'column', align: 'stretch' }))}>
      <Action
        ref={props.ref}
        role={nested ? undefined : 'link'}
        href={/** @type {any} */ (() => safeOrNone(read(props.href)))}
        aria-current={() => (active() ? 'page' : undefined)}
        aria-expanded={nested ? state(expanded.get) : undefined}
        aria-disabled={() => (read(props.disabled) ? 'true' : undefined)}
        label={props['aria-label']}
        onPress={onPress}
        style={style}
      >
        <View style={styled({}, theme => ({ direction: 'row', align: 'center', gap: theme.control.iconGap }))}>
          {props.start === undefined ? null : <View style={{ direction: 'row', align: 'center', shrink: 0 }}>{props.start}</View>}
          <View style={{ direction: 'column', grow: 1, shrink: 1, minWidth: 0 }}>
            {textual(props.label) ? <Label text={props.label} style={label} /> : props.label}
            {props.description === undefined ? null : textual(props.description) ? <Label text={props.description} style={description} /> : props.description}
          </View>
          {props.end !== undefined ? (
            <View style={{ direction: 'row', align: 'center', shrink: 0 }}>{props.end}</View>
          ) : nested ? (
            <ChevronIcon size={() => ui.theme().sizes.glyph.sm} rotate={turn} color={ink} />
          ) : null}
        </View>
      </Action>
      {nested ? (
        <Show when={expanded.get}>
          <View style={offset}>{props.children}</View>
        </Show>
      ) : null}
    </View>
  );
}

/**
 * Links to a page's headings: `data` ({ label, level, id }[]: the text,
 * its level, 1 the top, and the heading's id, a `#id` link where given),
 * `value` (the index shown active: a value, an accessor or a signal; or
 * `defaultValue`), `onChange(index)` on press, `variant` (solid by
 * default, soft, plain), `color`, `size`, `radius`, `indent` ('md' a
 * level: px or a spacing step), `indentFrom` (2: the first level
 * indented), and `spy` (from rui-core/hooks' `$spy`, its `scroll` props on the
 * Scroll and its `heading` refs on the headings): its headings are the
 * data (without `data`), the active one follows the Scroll (without
 * `value`), and a press scrolls to its heading. It means a navigation,
 * the active link `aria-current` 'location'.
 * @param {Record<string, any>} props
 */
export function Outline(props) {
  const ui = $ui();
  const spy = props.spy;
  const own = $navValue(props, 0);
  const followed = spy != null && props.value === undefined;
  const active = followed ? { get: () => $read(spy.value), set: (/** @type {number} */ i) => spy.scrollTo(i) } : own;
  const style = styled(props, () => ({ direction: 'column', align: 'stretch' }));
  const data = () => /** @type {{ label: any, level?: number, id?: string }[]} */ (read(props.data) ?? (spy == null ? undefined : $read(spy.headings)) ?? []);
  return (
    <View role="navigation" aria-label="Table of contents" {...pass(props)} style={style}>
      {() =>
        data().map((heading, index) => {
          const itemStyle = () => {
            const theme = ui.theme();
            const scheme = ui.scheme();
            const variant = read(props.variant) ?? 'solid';
            const on = active.get() === index;
            const c = variantColors(theme, scheme, variant, read(props.color));
            const steps = Math.max(0, (heading.level ?? 1) - Number(read(props.indentFrom) ?? 2) + 1);
            const page = pageColors(theme, scheme);
            return {
              padding: [theme.spacing.xs / 2, theme.spacing.sm, theme.spacing.xs / 2, theme.spacing.sm + steps * spacing(theme, read(props.indent), 'md')],
              border: 0,
              textAlign: 'start',
              radius: radiusOf(theme, read(props.radius)),
              fontSize: sized(theme.fontSizes, read(props.size), 'sm'),
              cursor: 'pointer',
              background: on && variant !== 'plain' ? c.background : 'transparent',
              color: on ? (variant === 'plain' ? colorOf(theme, scheme, read(props.color)) : c.color) : page.text,
              ...(on ? null : { hover: { background: pageColors(theme, scheme).hover } }),
            };
          };
          const press = () => {
            active.set(index);
            // Followed, the spy scrolled; else the value told onChange, and the Scroll goes there too.
            if (followed) props.onChange?.(index);
            else spy?.scrollTo(index);
          };
          return <Action role="link" href={heading.id == null ? undefined : `#${heading.id}`} text={String(heading.label)} aria-current={() => (active.get() === index ? 'location' : undefined)} selected={() => active.get() === index} onPress={press} style={/** @type {any} */ (itemStyle)} />;
        })
      }
    </View>
  );
}
