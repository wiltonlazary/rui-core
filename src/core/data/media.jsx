// Pictures and surfaces: Avatar (and Avatar.Group), Image, Cover
// and Card (with Card.Media and Card.Rule), on View, Label and the portable Image.

import { View, Label, Lazy, Image as Picture, read, $active, $signal, $read, $write, $untrack } from 'ren-core';
import { styled } from '../../theme/style.js';
import { variantColors, radiusOf, pageColors, spacing, shadowOf, colorOf, sized } from '../../theme/resolve.js';
import { pass, unlabeled } from '../layout/layout.jsx';
import { parts, Person, flat, isPart } from './parts.jsx';
import { textual } from './badge.jsx';
import { DECOR } from '../../theme/meaning.js';
import { $ui } from '../../theme/theme.jsx';

/**
 * The hues `color="auto"` picks from: each about 135 degrees round the
 * wheel from the one before, so neighbors differ.
 */
const AUTO_COLORS = ['amber', 'green', 'cyan', 'indigo', 'magenta', 'orange', 'teal', 'violet'];

/**
 * A name's initials, upper case: always the first letter of its first word
 * and of its last; a name of one word gives one letter.
 * @param {string} name
 */
export function initials(name) {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const ends = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]];
  return ends.map(w => [...w][0]).join('').toUpperCase();
}

/**
 * The color of a name among `colors`: the name's 32-bit FNV-1a hash (over
 * its UTF-16 code units), modulo the count.
 * @param {string} name @param {readonly string[]} [colors]
 */
export function autoColor(name, colors = AUTO_COLORS) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 0x01000193) >>> 0;
  return colors[hash % colors.length];
}

/**
 * A picture of a person: `source` (an image), else `name` (its initials),
 * else children, else a silhouette; `size` (xs to xl, the theme's
 * `sizes.avatar`, or pixels), `radius`
 * (round by default), `variant` (soft by default) and `color` (the
 * accent; `'auto'` picks one from the name, among `colors`), `label`. It means an
 * image (role `img`) named by `label`, else `name`.
 * @param {Record<string, any>} props
 */
export function Avatar(props) {
  const ui = $ui();
  const size = () => {
    const s = read(props.size);
    return sized(ui.theme().sizes.avatar, s, 'md');
  };
  const color = () => {
    const c = read(props.color);
    return c === 'auto' ? autoColor(String(read(props.name) ?? ''), read(props.colors)) : c;
  };
  const colors = styled({}, (theme, scheme) => variantColors(theme, scheme, read(props.variant) ?? 'soft', color()));
  const style = styled(props, (theme) => {
    const s = size();
    const c = colors();
    const group = props.__index !== undefined;
    return {
      align: 'center',
      justify: 'center',
      width: s,
      height: s,
      minWidth: s,
      shrink: 0,
      overflow: 'hidden',
      radius: read(props.radius) == null ? theme.radius.round : radiusOf(theme, read(props.radius)),
      background: c.background,
      color: c.color,
      fontSize: Math.round(s * theme.ratios.glyph),
      fontWeight: theme.weights.strong,
      lineHeight: 1,
      // In a group: over the one before by a share of the side (or `overlap`), set off from it by a small shadow.
      ...(group ? { shadow: shadowOf(theme, 'sm'), margin: [0, 0, 0, props.__index > 0 ? -(props.__overlap == null ? Math.round(s * theme.ratios.mark) : spacing(theme, props.__overlap, 'xs')) : 0] } : null),
    };
  });
  const content = () => {
    const src = read(props.source);
    if (src != null && src !== '') return <Picture {...DECOR} source={src} label={props.label} style={{ width: '100%', height: '100%' }} />;
    const name = read(props.name);
    if (name != null && name !== '') return <Label {...DECOR} text={initials(String(name))} />;
    if (props.children != null) return textual(props.children) ? <Label text={props.children} /> : props.children;
    // The silhouette: an icon in the avatar's square.
    return <Person size={() => Math.round(size() * ui.theme().ratios.icon)} color={() => colors().color} />;
  };
  return (
    <View role="img" {...pass(props)} {...{ label: () => read(props.label) ?? read(props.name) ?? '' }} style={style}>
      {content}
    </View>
  );
}

/**
 * Avatars overlapping in a row: each lies over the one before it by
 * `overlap` (a spacing step or px; by default `ratios.mark` of its side,
 * 12 at md) and casts the theme's sm shadow on it, which sets them apart
 * (no ring).
 * @param {Record<string, any>} props
 */
function AvatarGroup(props) {
  return (
    <View {...pass(props)} style={styled(props, () => ({ direction: 'row', align: 'center' }))}>
      {parts(props.children, Avatar, i => ({ __index: i, __overlap: read(props.overlap) }))}
    </View>
  );
}
Avatar.Group = AvatarGroup;

/**
 * A picture: `source`, `fallback` (shown when `source` is empty or fails to
 * load; `onError` hears the failure), `fit` (object-fit: cover by
 * default, contain, fill, none), `radius` (clipping the picture), `w`, `h`,
 * `label`.
 * @param {Record<string, any>} props
 */
export function Image(props) {
  const R = $active();
  /** The `source` that failed to load, if the current one did. */
  const failed = $signal(R, /** @type {any} */ (null));
  const style = styled(props, theme => ({
    overflow: 'hidden',
    radius: read(props.radius) == null ? 0 : radiusOf(theme, read(props.radius)),
    ...(read(props.h) == null ? null : { height: read(props.h) }),
  }));
  const source = () => {
    const src = read(props.source);
    const fallback = read(props.fallback);
    return src == null || src === '' || (fallback != null && $read(failed) === src) ? (fallback ?? '') : src;
  };
  const onError = (/** @type {any} */ e) => {
    const src = $untrack(R, () => read(props.source));
    // The fallback failing too is only heard.
    if ($untrack(R, source) === src) $write(failed, src);
    props.onError?.(e);
  };
  /** @returns {any} */
  const fit = () => ({ width: '100%', height: '100%', grow: 1, objectFit: read(props.fit) ?? 'cover' });
  return (
    <View {...unlabeled(props)} style={style}>
      <Picture source={source} label={props.label} onError={onError} style={fit} />
    </View>
  );
}

/** Content over a picture that covers it: `source`, `radius`. @param {Record<string, any>} props */
export function Cover(props) {
  const style = styled(props, theme => ({ position: 'relative', overflow: 'hidden', radius: read(props.radius) == null ? 0 : radiusOf(theme, read(props.radius)) }));
  return (
    <View {...pass(props)} style={style}>
      <Picture {...DECOR} source={props.source} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      {props.children}
    </View>
  );
}

/**
 * A surface: `padding` (its body's, md by default), `radius`, `shadow`,
 * `bordered` (an edge in the page's rule color). Its parts: Card.Media (a
 * picture or a band of color across the card's top) and Card.Rule (a line
 * across the whole card between its content).
 *
 * The card is a frame holding its media, then its body: every Card.Media,
 * wherever it is written among the children, sits at the top in the
 * order written, full width, and the rest goes in the padded body below.
 * @param {Record<string, any>} props
 */
export function Card(props) {
  const style = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    return {
      direction: 'column',
      overflow: 'hidden',
      background: page.raised,
      color: page.text,
      radius: radiusOf(theme, read(props.radius)),
      shadow: shadowOf(theme, read(props.shadow)),
      ...(read(props.bordered) ? { border: 1, borderColor: page.rule } : null),
    };
  });
  const body = styled({}, theme => ({ direction: 'column', grow: 1, minHeight: 0, padding: spacing(theme, read(props.padding), 'md') }));
  const list = flat(props.children);
  const media = list.filter(c => isPart(c, CardMedia)).map((c, i) => new Lazy(c.component, { ...c.props, __first: i === 0, __radius: props.radius }));
  const rest = list.filter(c => !isPart(c, CardMedia)).map(c => (isPart(c, CardRule) ? new Lazy(c.component, { ...c.props, __padding: props.padding }) : c));
  return (
    <View {...pass(props)} style={style}>
      {media}
      <View style={body}>{rest}</View>
    </View>
  );
}

/**
 * The media of a Card, for a picture or a band of color: it sits at the
 * card's top edge, full width, with no padding of its own; the first
 * takes the card's corner (its `radius`, the theme's by default) on its
 * top corners, so it is shaped even where a renderer does not clip.
 * @param {Record<string, any>} props
 */
function CardMedia(props) {
  const style = styled(props, theme => {
    const r = props.__first ? radiusOf(theme, read(props.__radius)) : 0;
    return { direction: 'column', shrink: 0, overflow: 'hidden', radius: [r, r, 0, 0] };
  });
  return (
    <View {...pass(props)} style={style}>
      {props.children}
    </View>
  );
}
Card.Media = CardMedia;

/**
 * A line across a Card from edge to edge, in the page's rule color (or
 * `color`), set apart from the content above and below by the card's
 * padding. Decoration: it is hidden from assistive tech.
 * @param {Record<string, any>} props
 */
function CardRule(props) {
  const style = styled(props, (theme, scheme) => {
    const pad = spacing(theme, read(props.__padding), 'md');
    return {
      height: 0,
      shrink: 0,
      margin: [pad, -pad, pad, -pad],
      borderTop: 1,
      borderColor: read(props.color) == null ? pageColors(theme, scheme).rule : colorOf(theme, scheme, read(props.color)),
    };
  });
  return <View aria-hidden="true" style={style} />;
}
Card.Rule = CardRule;
