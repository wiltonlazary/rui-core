// Colors: HueSlider, AlphaSlider and ColorPicker (a saturation panel, hue
// and alpha sliders, swatches), with the conversions between hex, rgb(a)
// and hsl(a) text and HSVA.
//
// The ramps are the portable style's linear gradients: the
// hue through its six primaries, the alpha from clear to the color, and the
// saturation panel white to the hue with clear to black over it. The
// checkerboard behind an alpha is two rows of squares.

import { View, Action, $signal, $read, $write, $watch, $active, $untrack, read } from 'ren-core';
import { styled } from '../../theme/style.js';
import { radiusOf, colorOf, shadowOf } from '../../theme/resolve.js';
import { $ui } from '../../theme/theme.jsx';
import { $value, sizeOf, clamp } from './shared.js';
import { saturationPanel } from './color-panel.jsx';
import { $nameOf } from './field.jsx';
import { bordersOf } from '../misc/tween.js';
import { handOn } from '../ref.js';
import { state } from '../../theme/meaning.js';
import { labelsIn } from '../../theme/labels.js';

/** @typedef {{ h: number, s: number, v: number, a: number }} HSVA hue 0-360, saturation and value 0-100, alpha 0-1 */

/** HSVA to red, green, blue (0-255). @param {HSVA} c @returns {[number, number, number]} */
export function hsvaToRgb(c) {
  const s = c.s / 100;
  const v = c.v / 100;
  const h = (((c.h % 360) + 360) % 360) / 60;
  const f = (/** @type {number} */ n) => {
    const k = (n + h) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
}

/** Red, green, blue (0-255) and alpha to HSVA. @param {number} r @param {number} g @param {number} b @param {number} a @returns {HSVA} */
export function rgbaToHsva(r, g, b, a) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  let h = 0;
  if (d !== 0) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s: max === 0 ? 0 : (d / max) * 100, v: max * 100, a };
}

/** HSL (0-360, 0-100, 0-100) to HSV's saturation and value. @param {number} h @param {number} s @param {number} l @param {number} a @returns {HSVA} */
function hslaToHsva(h, s, l, a) {
  const S = s / 100;
  const L = l / 100;
  const v = L + S * Math.min(L, 1 - L);
  return { h, s: v === 0 ? 0 : 2 * (1 - L / v) * 100, v: v * 100, a };
}

/** HSVA to HSL. @param {HSVA} c @returns {[number, number, number]} */
function hsvaToHsl(c) {
  const S = c.s / 100;
  const V = c.v / 100;
  const L = V * (1 - S / 2);
  const s = L === 0 || L === 1 ? 0 : (V - L) / Math.min(L, 1 - L);
  return [Math.round(c.h), Math.round(s * 100), Math.round(L * 100)];
}

/**
 * A CSS color's HSVA: hex (#rgb, #rgba, #rrggbb, #rrggbbaa), rgb(a) or
 * hsl(a); null for anything else.
 * @param {string} text @returns {HSVA | null}
 */
export function parseColor(text) {
  const t = String(text ?? '').trim().toLowerCase();
  if (t[0] === '#') {
    let h = t.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
    if ((h.length !== 6 && h.length !== 8) || !/^[0-9a-f]+$/.test(h)) return null;
    const n = (/** @type {number} */ i) => parseInt(h.slice(i, i + 2), 16);
    // The alpha kept exact, so an 8-digit hex writes back as it came.
    return rgbaToHsva(n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1);
  }
  const m = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(t);
  if (m === null) return null;
  const words = m[2].split(/[\s,/]+/).filter(p => p !== '');
  const parts = words.map(p => parseFloat(p));
  if (parts.length < 3 || parts.some(p => Number.isNaN(p))) return null;
  /** Whether part `i` is a CSS percentage. @param {number} i */
  const percent = i => words[i].endsWith('%');
  // A percent alpha is a fraction of 1; alpha stays within 0..1.
  const a = parts[3] === undefined ? 1 : clamp(percent(3) ? parts[3] / 100 : parts[3], 0, 1);
  // A hue in its unit (deg by default, grad, rad, turn) turns into 0..360; saturation and lightness stay within 0..100.
  const unit = /** @type {RegExpExecArray} */ (/[a-z]*$/.exec(words[0]))[0];
  const hue = parts[0] * (unit === 'grad' ? 0.9 : unit === 'rad' ? 180 / Math.PI : unit === 'turn' ? 360 : 1);
  if (m[1].startsWith('hsl')) return hslaToHsva(((hue % 360) + 360) % 360, clamp(parts[1], 0, 100), clamp(parts[2], 0, 100), a);
  // A percent channel is a fraction of 255; channels stay within 0..255.
  const channel = (/** @type {number} */ i) => clamp(percent(i) ? (parts[i] / 100) * 255 : parts[i], 0, 255);
  return rgbaToHsva(channel(0), channel(1), channel(2), a);
}

/** Two hex digits. @param {number} v */
const hex2 = v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');

/**
 * HSVA as text in a format, 'hex', 'rgb' or 'hsl', with its alpha when
 * `alpha` is true (#rrggbbaa, rgba(), hsla()).
 * @param {HSVA} c @param {string} [format] @param {boolean} [alpha]
 */
export function formatColor(c, format = 'hex', alpha = false) {
  const [r, g, b] = hsvaToRgb(c);
  const a = Math.round(c.a * 100) / 100;
  if (format === 'rgb') return alpha ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
  if (format === 'hsl') {
    const [h, s, l] = hsvaToHsl(c);
    return alpha ? `hsla(${h}, ${s}%, ${l}%, ${a})` : `hsl(${h}, ${s}%, ${l}%)`;
  }
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${alpha ? hex2(c.a * 255) : ''}`;
}

/** The opaque hex of an HSVA. @param {HSVA} c */
export const solid = c => formatColor({ ...c, a: 1 }, 'hex');

/**
 * A place on an item from a pointer event, x and y from 0 to 1, across the
 * box inside `inset` (its border: where its ramp and thumb are placed).
 * @param {any} node @param {any} e @param {{ top: number, right: number, bottom: number, left: number }} [inset]
 * @returns {[number, number] | null}
 */
function placeOf(node, e, inset = { top: 0, right: 0, bottom: 0, left: 0 }) {
  const r = node?.getBoundingClientRect?.();
  const width = (r?.width ?? 0) - inset.left - inset.right;
  if (r == null || !(width > 0)) return null;
  const height = Math.max(1, r.height - inset.top - inset.bottom);
  return [clamp(((e.clientX ?? e.x) - r.left - inset.left) / width, 0, 1), clamp(((e.clientY ?? e.y) - r.top - inset.top) / height, 0, 1)];
}

/**
 * A draggable area: the pointer captured on press, `onPlace` at the press,
 * each move and the release (`end` then); a press the browser takes back
 * ends at the last place (`cancel`).
 * `inset` is the area's border, which the place is read inside.
 * @param {(place: [number, number], end: boolean) => void} onPlace @param {() => boolean} disabled
 * @param {() => { top: number, right: number, bottom: number, left: number }} [inset]
 */
export function drag(onPlace, disabled, inset) {
  const dragging = $signal($active(), false);
  /** @type {any} */
  let node = null;
  /** @type {[number, number] | null} */
  let last = null;
  /** @param {any} e @param {boolean} end */
  const place = (e, end) => {
    const p = placeOf(node, e, inset?.());
    if (p !== null) onPlace((last = p), end);
  };
  return {
    ref: (/** @type {any} */ n) => (node = n),
    down: (/** @type {any} */ e) => {
      if (disabled()) return;
      e.currentTarget?.setPointerCapture?.(e.pointerId);
      $write(dragging, true);
      last = null;
      place(e, false);
    },
    move: (/** @type {any} */ e) => {
      if ($read(dragging)) place(e, false);
    },
    up: (/** @type {any} */ e) => {
      if (!$read(dragging)) return;
      $write(dragging, false);
      place(e, true);
    },
    cancel: () => {
      if (!$read(dragging)) return;
      $write(dragging, false);
      if (last !== null) onPlace(last, true);
    },
  };
}

/**
 * A thumb: a disc of the color it points at, so it shows the pick, set
 * in a white ring `ceil(side × theme.ratios.mark / 2)` wide (2 px on the
 * smallest, 4 on xl) and lifted by the theme's shadow sm; focusable for
 * keys, a `slider` (`meaning`: its value and bounds).
 * @param {() => number} size @param {() => Record<string, any>} place @param {(e: any) => void} onKey @param {string | (() => string)} label @param {Record<string, any>} meaning
 * @param {() => string} fill the color under it
 */
export function thumb(size, place, onKey, label, meaning, fill) {
  const ui = $ui();
  /** @returns {Record<string, any>} */
  const look = () => {
    const theme = ui.theme();
    const t = size();
    return {
      position: 'absolute',
      width: t,
      height: t,
      minHeight: 0,
      padding: 0,
      radius: theme.radius.round,
      border: ringOf(theme, t),
      borderColor: theme.white,
      background: fill(),
      shadow: shadowOf(theme, 'sm'),
      cursor: 'pointer',
      ...place(),
    };
  };
  return <Action label={label} role="slider" {...meaning} onKey={onKey} style={look} />;
}

/** A thumb's white ring: half a mark's share of its side, rounded up. @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {number} side */
const ringOf = (theme, side) => Math.ceil((side * theme.ratios.mark) / 2);

/** The gap between a ColorPicker's swatches: half the label gap. @param {import('../../theme/theme.jsx').RuiThemeValue} theme */
const swatchGap = theme => theme.control.labelGap / 2;

/** A linear gradient from one color to another, at an angle (90: left to right). @param {string} from @param {string} to @param {number} [angle] */
export const ramp = (from, to, angle = 90) => ({ linear: angle, stops: /** @type {[number, string][]} */ ([[0, from], [1, to]]) });

/** The hue ramp: red through the six primaries back to red. */
const HUES = { linear: 90, stops: /** @type {[number, string][]} */ ([0, 60, 120, 180, 240, 300, 360].map(h => [h / 360, solid({ h, s: 100, v: 100, a: 1 })])) };

/** Two rows of light and dark squares (the checkerboard behind an alpha). @param {number} columns */
function checker(columns) {
  const row = (/** @type {number} */ r) => (
    <View style={{ direction: 'row', grow: 1, height: 0 }}>
      {Array.from({ length: columns }, (_, i) => (
        <View style={{ grow: 1, width: 0, background: (i + r) % 2 === 0 ? '#ffffff' : '#cccccc' }} />
      ))}
    </View>
  );
  return (
    <View style={{ position: 'absolute', inset: 0, direction: 'column' }}>
      {row(0)}
      {row(1)}
    </View>
  );
}

/**
 * The shared slider of HueSlider and AlphaSlider.
 * @param {Record<string, any>} props @param {{ get: () => number, set: (v: number, end: boolean) => void, max: number, step: number, background: () => any, fill: () => string, label: () => string }} m
 */
function colorSlider(props, m) {
  const R = $active();
  const ui = $ui();
  const size = () => ui.theme().sizes.colorThumb[sizeOf(read(props.size) ?? 'md')];
  const disabled = () => read(props.disabled) === true;
  // Its ramp and thumb sit inside its border, across its padding box: the pointer maps there.
  // A value at its step, written to two decimals as the keys give it (0.57, not 0.5700000000000001).
  const d = drag(([x], end) => m.set(Math.round(Math.round((x * m.max) / m.step) * m.step * 100) / 100, end), disabled, () => bordersOf($untrack(R, root)));
  const root = styled(props, theme => ({ height: size(), radius: size() / 2, overflow: 'visible', cursor: 'pointer', touchAction: 'none', ...(disabled() ? { opacity: theme.opacity.disabled } : null) }));
  // Its own aria-label, else the Field around it (not inside a ColorPicker, which the Field names), else its kind.
  const name = props.__part === true ? {} : $nameOf(props, props['aria-label']);
  const onKey = (/** @type {any} */ e) => {
    if (disabled()) return;
    const v = m.get();
    const next = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? v + m.step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? v - m.step : e.key === 'Home' ? 0 : e.key === 'End' ? m.max : NaN;
    if (Number.isNaN(next)) return;
    e.preventDefault?.();
    m.set(Math.round(clamp(next, 0, m.max) * 100) / 100, true);
  };
  return (
    <View
      ref={(/** @type {any} */ n) => {
        d.ref(n);
        handOn(props.ref, n);
      }}
      style={root}
      onPointerDown={d.down} onPointerMove={d.move} onPointerUp={d.up} onPointerCancel={d.cancel}>
      <View style={() => ({ position: 'absolute', inset: 0, radius: size() / 2, overflow: 'hidden' })}>{m.background()}</View>
      {thumb(size, () => ({ top: 0, left: `${(m.get() / m.max) * 100}%`, margin: [0, 0, 0, -size() / 2] }), onKey, m.label, { 'aria-valuenow': m.get, 'aria-valuemin': 0, 'aria-valuemax': m.max, ...name }, m.fill)}
    </View>
  );
}

/**
 * A hue, 0 to 360: `value` + `onChange` or
 * `defaultValue`, `onCommit`, `size` (its thumb the theme's
 * `sizes.colorThumb`: a disc of the pure hue in a white ring).
 * @param {Record<string, any>} props
 */
export function HueSlider(props) {
  const model = $value(props, 0);
  return colorSlider(props, {
    get: model.get,
    set: (v, end) => {
      if (v !== model.get()) model.set(v);
      if (end) props.onCommit?.(v);
    },
    max: 360,
    step: 1,
    background: () => <View style={{ position: 'absolute', inset: 0, background: HUES }} />,
    fill: () => solid({ h: model.get(), s: 100, v: 100, a: 1 }),
    label: () => labelsIn().hue,
  });
}

/**
 * An alpha, 0 to 1, over a color: `value` +
 * `onChange` or `defaultValue`, `onCommit`, `color` (hex), `size` (its thumb the
 * theme's `sizes.colorThumb`: a disc of the color at that alpha in a white ring).
 * @param {Record<string, any>} props
 */
export function AlphaSlider(props) {
  const model = $value(props, 1);
  const base = () => parseColor(read(props.color) ?? '#000000') ?? { h: 0, s: 0, v: 0, a: 1 };
  return colorSlider(props, {
    get: model.get,
    set: (v, end) => {
      if (v !== model.get()) model.set(v);
      if (end) props.onCommit?.(v);
    },
    max: 1,
    step: 0.01,
    background: () => [checker(24), <View style={() => ({ position: 'absolute', inset: 0, background: ramp(formatColor({ ...base(), a: 0 }, 'hex', true), solid(base())) })} />],
    fill: () => formatColor({ ...base(), a: model.get() }, 'hex', true),
    label: () => labelsIn().alpha,
  });
}

/**
 * A color picker: `value` + `onChange` or
 * `defaultValue` (null: no color chosen yet; the picker starts on the
 * accent), `onCommit`, `format` ('hex', 'rgb' or 'hsl'), `alpha` (false;
 * true: the alpha slider, and the value carries the alpha), `picker` (true: the
 * saturation panel and sliders; 'collapsed': with swatches, the swatches
 * lead and the panel and sliders follow a More colors press, which shows and
 * hides them, `aria-expanded`), `swatches` and `swatchColumns` (8),
 * `onSwatchPress`, `size` (xs to xl: the theme's `sizes.picker` and
 * `sizes.colorThumb`), `stretch`.
 *
 * Its layout: the saturation panel on top (`sizes.picker`, the `sm`
 * corner); under it a row led by the preview, a disc of the color over a
 * checkerboard as high as the sliders beside it, then the hue slider (and
 * the alpha slider, `theme.control.labelGap` below); then the swatches,
 * square, half the label gap apart. Its parts are
 * `theme.control.iconGap` apart. Each thumb is a disc of the color it
 * points at in a white ring (see the sliders).
 * @param {Record<string, any>} props
 */
export function ColorPicker(props) {
  const model = $value(props, /** @type {string | null} */ (null));
  const format = () => read(props.format) ?? 'hex';
  const alpha = () => read(props.alpha) === true;
  const ui = $ui();
  // With no value yet the picker starts on the accent (its shade 6).
  const start = () => parseColor(String(model.get() ?? '')) ?? parseColor(colorOf(ui.theme(), ui.scheme(), ui.theme().accent)) ?? { h: 0, s: 0, v: 100, a: 1 };
  const color = $signal($active(), /** @type {HSVA} */ ($untrack($active(), start)));
  // A value from outside moves the picker; its own changes do not (a gray keeps its hue).
  $watch($active(), () => String(model.get() ?? ''), v => {
    if (v !== '' && v !== formatColor($read(color), format(), alpha())) {
      const c = parseColor(v);
      if (c !== null) $write(color, c);
    }
  });
  const size = () => sizeOf(read(props.size) ?? 'md');
  const dims = () => ui.theme().sizes.picker[size()];
  const emit = (/** @type {HSVA} */ c, /** @type {boolean} */ end) => {
    $write(color, c);
    const text = formatColor(c, format(), alpha());
    if (text !== model.get()) model.set(text);
    if (end) props.onCommit?.(text);
  };
  const t = () => ui.theme().sizes.colorThumb[size()];
  const root = styled(props, theme => ({ direction: 'column', gap: theme.control.iconGap, width: read(props.stretch) ? '100%' : dims().w }));
  /** The preview's side: as high as the sliders and the gap between them. */
  const preview = () => (alpha() ? t() * 2 + ui.theme().control.labelGap : t());
  const sliders = (
    <View style={styled({}, theme => ({ direction: 'row', gap: theme.control.iconGap, align: 'center' }))}>
      {/* The preview leads: a disc of the color over the checkerboard. */}
      <View style={() => ({ width: preview(), height: preview(), radius: ui.theme().radius.round, overflow: 'hidden', shrink: 0 })}>
        {checker(4)}
        <View style={() => ({ position: 'absolute', inset: 0, background: formatColor($read(color), 'hex', true) })} />
      </View>
      <View style={styled({}, theme => ({ direction: 'column', gap: theme.control.labelGap, grow: 1 }))}>
        <HueSlider __part size={size} value={() => $read(color).h} onChange={(/** @type {number} */ h) => emit({ ...$read(color), h }, false)} onCommit={(/** @type {number} */ h) => emit({ ...$read(color), h }, true)} />
        {() => (alpha() ? <AlphaSlider __part size={size} color={() => solid($read(color))} value={() => $read(color).a} onChange={(/** @type {number} */ a) => emit({ ...$read(color), a }, false)} onCommit={(/** @type {number} */ a) => emit({ ...$read(color), a }, true)} /> : null)}
      </View>
    </View>
  );
  const swatch = (/** @type {string} */ c) => (
    <Action
      label={c}
      onPress={() => {
        const parsed = parseColor(c);
        if (parsed !== null) emit(alpha() ? parsed : { ...parsed, a: 1 }, true);
        props.onSwatchPress?.(c);
      }}
      style={() => ({ minHeight: 0, padding: 0, border: 0, height: 0, width: '100%', radius: radiusOf(ui.theme(), 'sm'), overflow: 'hidden', background: 'transparent', cursor: 'pointer', ...swatchBox() })}
    >
      {checker(2)}
      <View style={{ position: 'absolute', inset: 0, background: c }} />
    </Action>
  );
  /** A swatch's square: its height from the picker's width. @returns {Record<string, any>} */
  const swatchBox = () => {
    const per = read(props.swatchColumns) ?? 8;
    const w = dims().w;
    return { height: Math.floor((w - (per - 1) * swatchGap(ui.theme())) / per), minHeight: 0 };
  };
  // The picker is a group its aria-label or its Field names; its sliders keep their own names.
  const name = $nameOf(props, props['aria-label']);
  const list = () => /** @type {string[]} */ (read(props.swatches) ?? []);
  const spectrum = () => [saturationPanel({ color: () => $read(color), onPick: emit, thumb: t, height: () => dims().h }), sliders];
  // Collapsed, the swatches lead and the spectrum shows on a press of More colors.
  const lead = () => read(props.picker) === 'collapsed' && list().length > 0;
  const more = $signal($active(), false);
  const control = styled({}, (theme, scheme) => ({
    self: 'start',
    background: 'transparent',
    border: 0,
    padding: 0,
    minHeight: 0,
    radius: 0,
    color: colorOf(theme, scheme, undefined),
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.weights.regular,
    cursor: 'pointer',
    hover: { underline: true },
  }));
  return (
    <View ref={props.ref} role={Object.keys(name).length > 0 ? 'group' : undefined} {...name} style={root}>
      {() => (read(props.picker) === false || lead() ? null : spectrum())}
      {() => {
        if (list().length === 0) return null;
        const per = read(props.swatchColumns) ?? 8;
        return <View style={styled({}, theme => ({ display: 'grid', columns: `repeat(${per}, 1fr)`, gap: swatchGap(theme) }))}>{list().map(swatch)}</View>;
      }}
      {() => (lead() ? <Action aria-expanded={state(() => $read(more))} text={() => labelsIn().moreColors} onPress={() => $write(more, !$read(more))} style={control} /> : null)}
      {() => (lead() && $read(more) ? spectrum() : null)}
    </View>
  );
}
