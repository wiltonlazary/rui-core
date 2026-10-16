// Sliders: Slider, AngleSlider and Rating, and the track and scale that
// RangeSlider (range-slider.jsx) shares. A drag is the portable pointer
// events with pointer capture (onPointerDown captures the pointer on the
// track, moves and the release follow it on every renderer); the value
// comes from the pointer's `x` and `y` against the track's
// `getBoundingClientRect()`. Thumbs are Actions, so they take focus and keys
// (arrows, Home, End). Thumbs, bars and marks are placed with the portable
// absolute positioning and percentages.

import { View, Label, Action, Shape, Show, $signal, $read, $write, $active, $untrack, read } from 'ren-core';
import { styled } from '../../theme/style.js';
import { radiusOf, sized, pageColors, colorOf, tooltipColors } from '../../theme/resolve.js';
import { $ui } from '../../theme/theme.jsx';
import { $value, sizeOf, clamp, stepped, starShape, disabledLook, stepOn, stepOf } from './shared.js';
import { DECOR, flag } from '../../theme/meaning.js';
import { $fieldName, $nameOf } from './field.jsx';
import { handOn } from '../ref.js';
import { insetsOf } from '../misc/tween.js';
import { labelsIn } from '../../theme/labels.js';

/**
 * The horizontal place of a pointer on an item, 0 to 1: across its box, or
 * its content box given its insets (padding and border).
 * @param {any} node @param {any} e @param {{ left: number, right: number }} [inset]
 */
function ratioAt(node, e, inset = { left: 0, right: 0 }) {
  const r = node?.getBoundingClientRect?.();
  const width = (r?.width ?? 0) - inset.left - inset.right;
  if (r == null || !(width > 0)) return 0;
  const x = e.clientX ?? e.x;
  return clamp((x - r.left - inset.left) / width, 0, 1);
}

/**
 * The slider's shared model: bounds, step, the value's place on the track,
 * and the value from a place (stepped, or the nearest mark with
 * `snap`).
 * @param {Record<string, any>} props
 */
export function scale(props) {
  const min = () => read(props.min) ?? 0;
  const max = () => read(props.max) ?? 100;
  const step = () => stepOf(read(props.step));
  const marks = () => /** @type {{ value: number, label?: string }[]} */ (read(props.marks) ?? []);
  /** @param {number} v */
  const place = v => {
    const span = max() - min();
    return span <= 0 ? 0 : clamp((v - min()) / span, 0, 1) * 100;
  };
  /** @param {number} ratio */
  const valueAt = ratio => {
    const raw = min() + ratio * (max() - min());
    if (read(props.snap) === true && marks().length > 0) {
      let best = marks()[0].value;
      for (const m of marks()) if (Math.abs(m.value - raw) < Math.abs(best - raw)) best = m.value;
      return best;
    }
    return clamp(stepped(raw, step(), min()), min(), max());
  };
  /** A keyboard step from `v`: +1 or -1 steps, or to the next mark. @param {number} v @param {number} dir */
  const stepFrom = (v, dir) => {
    if (read(props.snap) === true && marks().length > 0) {
      const sorted = marks().map(m => m.value).sort((a, b) => a - b);
      const next = dir > 0 ? sorted.find(m => m > v) : sorted.reverse().find(m => m < v);
      return next ?? v;
    }
    // Onto the grid in the direction of travel, then within bounds: from an off-grid max, down to the grid below it.
    return clamp(stepOn(v, step(), min(), dir), min(), max());
  };
  /** Home and End: the bounds, or the first and last marks when it snaps to them. @param {'Home' | 'End'} key */
  const endOf = key => {
    if (read(props.snap) === true && marks().length > 0) {
      const values = marks().map(m => m.value);
      return key === 'Home' ? Math.min(...values) : Math.max(...values);
    }
    return key === 'Home' ? min() : max();
  };
  return { min, max, step, marks, place, valueAt, stepFrom, endOf };
}

/**
 * The track, bar, marks, thumbs and mark labels of Slider and RangeSlider.
 * @param {Record<string, any>} props
 * @param {{ values: () => number[], set: (i: number, v: number, end: boolean) => void, bar: () => [number, number], pick: (v: number) => number, label: (i: number) => string }} m
 */
export function track(props, m) {
  const s = scale(props);
  // One thumb without a name of its own, inside a Field: the Field's label names it.
  const one = $untrack($active(), m.values).length === 1;
  const thumbName = props.thumbLabel === undefined && props['aria-label'] === undefined && one ? $fieldName(props) : null;
  // Several thumbs (a RangeSlider) are a group its aria-label or its Field names; each thumb keeps its own name.
  const groupName = one ? {} : $nameOf(props, props['aria-label']);
  const ui = $ui();
  const size = () => sizeOf(read(props.size) ?? 'md');
  const trackSize = () => (typeof read(props.size) === 'number' ? read(props.size) : ui.theme().sizes.track[size()]);
  const thumbSize = () => read(props.thumbSize) ?? (typeof read(props.size) === 'number' ? trackSize() + 8 : ui.theme().sizes.thumb[size()]);
  const disabled = () => read(props.disabled) === true;
  const color = () => colorOf(ui.theme(), ui.scheme(), read(props.color));
  const dragging = $signal($active(), -1);
  const hovered = $signal($active(), false);
  const focused = $signal($active(), -1);
  /** @type {any} */
  let area = null;
  /** @type {any[]} */
  const thumbs = [];
  const at = (/** @type {any} */ e) => s.valueAt(ratioAt(area, e));
  const label = (/** @type {number} */ v) => (typeof props.format === 'function' ? props.format(v) : String(v));
  const showLabel = (/** @type {number} */ i) => () => {
    const readout = read(props.readout);
    if (disabled() || readout === false) return false;
    return readout === true || $read(dragging) === i || $read(focused) === i || ($read(hovered) && $read(dragging) < 0 && m.values().length === 1);
  };
  const root = styled(props, theme => ({ direction: 'column', ...(disabled() ? disabledLook(theme) : null) }));
  /** @returns {Record<string, any>} */
  const areaStyle = () => ({ height: Math.max(thumbSize(), trackSize()), justify: 'center', cursor: disabled() ? 'not-allowed' : 'pointer', touchAction: 'none' });
  /** @returns {Record<string, any>} */
  const trackStyle = () => {
    const theme = ui.theme();
    return {
      height: trackSize(),
      radius: radiusOf(theme, read(props.radius)),
      background: pageColors(theme, ui.scheme()).track,
    };
  };
  /** @returns {Record<string, any>} */
  const barStyle = () => {
    const [a, b] = m.bar();
    const fillEnd = read(props.fillEnd) === true;
    const from = fillEnd ? (m.values().length === 1 ? b : a) : a;
    const to = fillEnd && m.values().length === 1 ? 100 : b;
    return {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: `${from}%`,
      width: `${Math.max(0, to - from)}%`,
      radius: radiusOf(ui.theme(), read(props.radius)),
      background: disabled() ? pageColors(ui.theme(), ui.scheme()).disabledText : color(),
    };
  };
  /** A 0-wide column at a percentage whose content is centered on it. @param {number} pct @returns {Record<string, any>} */
  const pin = pct => ({ position: 'absolute', top: 0, bottom: 0, left: `${pct}%`, width: 0, align: 'center', justify: 'center' });
  const markDot = (/** @type {{ value: number }} */ mark) => {
    /** @returns {Record<string, any>} */
    const dot = () => {
      const theme = ui.theme();
      const [a, b] = m.bar();
      const p = s.place(mark.value);
      const filled = p >= a && p <= b;
      // A solid mark dot (`ratios.mark` of the thumb): the rule color, the tone once passed.
      const d = Math.max(4, Math.round(thumbSize() * theme.ratios.mark));
      return {
        width: d,
        height: d,
        shrink: 0,
        radius: d / 2,
        background: filled && !disabled() ? color() : pageColors(theme, ui.scheme()).rule,
      };
    };
    return (
      <View style={() => pin(s.place(mark.value))}>
        <View style={dot} />
      </View>
    );
  };
  const thumb = (/** @type {number} */ i) => {
    /** @returns {Record<string, any>} */
    const look = () => {
      const theme = ui.theme();
      const t = thumbSize();
      const page = pageColors(theme, ui.scheme());
      return {
        width: t,
        height: t,
        minHeight: 0,
        shrink: 0,
        padding: 0,
        radius: t / 2,
        // A 2 px ring in the tone, as a field's focus edge.
        border: 2,
        borderColor: disabled() ? page.disabledText : color(),
        background: page.raised,
        cursor: disabled() ? 'not-allowed' : 'pointer',
      };
    };
    /** @returns {Record<string, any>} */
    const bubble = () => {
      const theme = ui.theme();
      const t = thumbSize();
      return {
        position: 'absolute',
        // A value tip a label gap over the thumb, padded as an option.
        bottom: t + theme.control.labelGap,
        padding: theme.control.optionPad,
        radius: radiusOf(theme, 'sm'),
        fontSize: sized(theme.fontSizes, 'sm'),
        // Tooltip's colors: a value tip.
        color: tooltipColors(theme, ui.scheme()).text,
        background: tooltipColors(theme, ui.scheme()).background,
      };
    };
    const onKey = (/** @type {any} */ e) => {
      if (disabled()) return;
      const v = m.values()[i];
      let next = v;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = s.stepFrom(v, 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = s.stepFrom(v, -1);
      else if (e.key === 'Home' || e.key === 'End') next = s.endOf(e.key);
      else return;
      e.preventDefault?.();
      m.set(i, next, true);
    };
    return (
      <View style={() => pin(s.place(m.values()[i] ?? s.min()))}>
        <Show when={showLabel(i)}>
          <View {...DECOR} style={bubble}>
            <Label text={() => label(m.values()[i]) ?? ''} />
          </View>
        </Show>
        <Action
          ref={(/** @type {any} */ n) => (thumbs[i] = n)}
          label={() => m.label(i)}
          {...thumbName}
          role="slider"
          aria-valuenow={() => m.values()[i] ?? s.min()}
          aria-valuemin={s.min}
          aria-valuemax={s.max}
          aria-valuetext={() => (typeof props.format === 'function' ? String(props.format(m.values()[i] ?? s.min())) : undefined)}
          aria-disabled={flag(disabled)}
          onKey={onKey}
          onFocus={() => $write(focused, i)}
          onBlur={() => $write(focused, -1)}
          style={look}
        >
          {read(props.thumb) ?? null}
        </Action>
      </View>
    );
  };
  const down = (/** @type {any} */ e) => {
    if (disabled()) return;
    e.preventDefault?.();
    e.currentTarget?.setPointerCapture?.(e.pointerId);
    const v = at(e);
    const i = m.pick(v);
    $write(dragging, i);
    m.set(i, v, false);
    thumbs[i]?.focus?.();
  };
  const move = (/** @type {any} */ e) => {
    const i = $read(dragging);
    if (i < 0) return;
    m.set(i, at(e), false);
  };
  const up = (/** @type {any} */ e) => {
    const i = $read(dragging);
    if (i < 0) return;
    m.set(i, at(e), true);
    $write(dragging, -1);
    thumbs[i]?.focus?.();
  };
  // A press the browser took back ends where the last move left it (a
  // cancel's point is not the pointer's).
  const cancel = () => {
    const i = $read(dragging);
    if (i < 0) return;
    $write(dragging, -1);
    m.set(i, m.values()[i] ?? s.min(), true);
  };
  /** @returns {Record<string, any>} */
  const labels = () => ({ height: s.marks().some(k => k.label != null) ? sized(ui.theme().fontSizes, 'sm') * ui.theme().lineHeights.md + ui.theme().control.labelGap : 0 });
  /** @returns {Record<string, any>} */
  const markLabel = () => ({ margin: [ui.theme().control.labelGap, 0, 0, 0], fontSize: sized(ui.theme().fontSizes, 'sm'), color: pageColors(ui.theme(), ui.scheme()).quiet });
  return (
    <View ref={props.ref} role={Object.keys(groupName).length > 0 ? 'group' : undefined} {...groupName} style={root}>
      <View
        ref={(/** @type {any} */ n) => (area = n)}
        style={areaStyle}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onPointerEnter={() => $write(hovered, true)}
        onPointerLeave={() => $write(hovered, false)}
      >
        <View style={trackStyle}>
          <View style={barStyle} />
          {() => s.marks().map(markDot)}
        </View>
        {m.values().map((_, i) => thumb(i))}
      </View>
      <View {...DECOR} style={labels}>
        {() =>
          s.marks()
            .filter(k => k.label != null)
            .map(k => (
              <View style={() => ({ ...pin(s.place(k.value)), justify: 'start' })}>
                <Label text={String(k.label)} style={markLabel} />
              </View>
            ))}
      </View>
    </View>
  );
}

/**
 * A value on a track: `value` + `onChange` or
 * `defaultValue`, `onCommit` (at release or a key), `min` (0), `max`
 * (100), `step` (1; one not above 0 is 1), `marks` (`{ value, label }`), `snap` (to the marks),
 * `format` (the readout's text of a value), `readout` (the value over the
 * thumb: `true` always, `false` never, else while dragged, focused or
 * hovered), `thumb` (content in the thumb), `size` (xs to xl, or the
 * track's pixels), `thumbSize`, `radius`, `color`, `fillEnd` (the fill
 * runs from the thumb to the end),
 * `disabled`, `thumbLabel` or `aria-label` (the thumb's name; else the
 * Field's label around it, else 'Slider thumb'). Keys on the thumb: arrows step onto the grid of
 * `step` from `min` in their direction, Home and End go to the bounds (to the
 * first and last marks with `snap`).
 * Each thumb means a `slider` with its value, `min` and `max`.
 * @param {Record<string, any>} props
 */
export function Slider(props) {
  const s = scale(props);
  const model = $value(props, /** @type {number} */ (read(props.min) ?? 0));
  return track(props, {
    values: () => [model.get()],
    set: (_, v, end) => {
      if (v !== model.get()) model.set(v);
      if (end) props.onCommit?.(v);
    },
    bar: () => [0, s.place(model.get())],
    pick: () => 0,
    label: () => read(props.thumbLabel) ?? read(props['aria-label']) ?? labelsIn().sliderThumb,
  });
}

/**
 * An angle, 0 to 359 degrees, 0 at the top and clockwise
 * (AngleSlider): `value` + `onChange` or `defaultValue`, `onCommit`,
 * `step` (1; one not above 0 is 1), `size` (64), `thumbSize` (px; `sizes.track.md`, 6: a dot as
 * thick as a md Slider's track), `readout` (true: the angle in
 * the middle), `format`, `marks`, `snap`, `disabled`, `aria-label`. Keys:
 * the arrows step onto the grid (with `snap`, mark to mark round the dial);
 * Home is 0 and End the last grid value below 360 (with `snap`, the first
 * and last mark). A `slider` from 0 to 359.
 * @param {Record<string, any>} props
 */
export function AngleSlider(props) {
  const model = $value(props, 0);
  const ui = $ui();
  const size = () => read(props.size) ?? ui.theme().sizes.box.knob;
  const thumbSize = () => read(props.thumbSize) ?? ui.theme().sizes.track.md;
  const disabled = () => read(props.disabled) === true;
  const dragging = $signal($active(), false);
  /** @type {any} */
  let node = null;
  const norm = (/** @type {number} */ v) => ((v % 360) + 360) % 360;
  const snap = (/** @type {number} */ deg) => {
    const marks = /** @type {{ value: number }[]} */ (read(props.marks) ?? []);
    if (read(props.snap) === true && marks.length > 0) {
      let best = marks[0].value;
      const dist = (/** @type {number} */ a) => Math.min(Math.abs(a - deg), 360 - Math.abs(a - deg));
      for (const m of marks) if (dist(m.value) < dist(best)) best = m.value;
      return best;
    }
    const step = stepOf(read(props.step));
    return norm(Math.round(deg / step) * step);
  };
  const angleAt = (/** @type {any} */ e) => {
    const r = node?.getBoundingClientRect?.();
    if (r == null || !(r.width > 0)) return model.get();
    const dx = (e.clientX ?? e.x) - (r.left + r.width / 2);
    const dy = (e.clientY ?? e.y) - (r.top + r.height / 2);
    return snap(norm((Math.atan2(dx, -dy) * 180) / Math.PI));
  };
  const set = (/** @type {number} */ v, /** @type {boolean} */ end) => {
    if (v !== model.get()) model.set(v);
    if (end) props.onCommit?.(v);
  };
  const root = styled(props, (theme, scheme) => ({
    width: size(),
    height: size(),
    minHeight: 0,
    padding: 0,
    border: 0,
    radius: size() / 2,
    align: 'center',
    justify: 'center',
    background: pageColors(theme, scheme).sunken,
    color: pageColors(theme, scheme).text,
    fontSize: sized(theme.fontSizes, 'xs'),
    cursor: disabled() ? 'not-allowed' : 'pointer',
    ...(disabled() ? { opacity: theme.opacity.disabled } : null),
    touchAction: 'none',
  }));
  /** @returns {Record<string, any>} */
  const thumb = () => {
    const theme = ui.theme();
    const t = thumbSize();
    const r = size() / 2 - t;
    const a = (model.get() * Math.PI) / 180;
    return {
      position: 'absolute',
      width: t,
      height: t,
      radius: t / 2,
      left: size() / 2 + r * Math.sin(a) - t / 2,
      top: size() / 2 - r * Math.cos(a) - t / 2,
      background: disabled() ? pageColors(theme, ui.scheme()).disabledText : read(props.color) != null ? colorOf(theme, ui.scheme(), read(props.color)) : pageColors(theme, ui.scheme()).text,
    };
  };
  const markDot = (/** @type {{ value: number }} */ m) => {
    /** @returns {Record<string, any>} */
    const look = () => {
      const r = size() / 2 - 2;
      const a = (m.value * Math.PI) / 180;
      return { position: 'absolute', width: 2, height: 2, radius: 1, left: size() / 2 + r * Math.sin(a) - 1, top: size() / 2 - r * Math.cos(a) - 1, background: pageColors(ui.theme(), ui.scheme()).quiet };
    };
    return <View style={look} />;
  };
  const text = () => {
    const v = model.get();
    return props.format ? String(props.format(v)) : `${v}°`;
  };
  return (
    <Action
      ref={(/** @type {any} */ n) => {
        node = n;
        handOn(props.ref, n);
      }}
      label={() => read(props['aria-label']) ?? labelsIn().angle}
      {...(props['aria-label'] === undefined ? $fieldName(props) : null)}
      role="slider"
      aria-valuenow={model.get}
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuetext={text}
      aria-disabled={flag(disabled)}
      style={root}
      onPointerDown={(/** @type {any} */ e) => {
        if (disabled()) return;
        e.currentTarget?.setPointerCapture?.(e.pointerId);
        $write(dragging, true);
        set(angleAt(e), false);
      }}
      onPointerMove={(/** @type {any} */ e) => $read(dragging) && set(angleAt(e), false)}
      onPointerUp={(/** @type {any} */ e) => {
        if (!$read(dragging)) return;
        $write(dragging, false);
        set(angleAt(e), true);
      }}
      onPointerCancel={() => {
        if (!$read(dragging)) return;
        $write(dragging, false);
        set(model.get(), true);
      }}
      onKey={(/** @type {any} */ e) => {
        if (disabled()) return;
        const step = stepOf(read(props.step));
        const v = model.get();
        const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
        const marks = (/** @type {{ value: number }[]} */ (read(props.marks) ?? [])).map(m => norm(m.value)).sort((a, b) => a - b);
        let next = -1;
        if (read(props.snap) === true && marks.length > 0) {
          // Mark to mark, round the dial; Home and End the first and last mark.
          if (dir > 0) next = marks.find(m => m > v) ?? marks[0];
          else if (dir < 0) next = [...marks].reverse().find(m => m < v) ?? marks[marks.length - 1];
          else if (e.key === 'Home') next = marks[0];
          else if (e.key === 'End') next = marks[marks.length - 1];
        } else if (dir !== 0) next = norm(stepOn(v, step, 0, dir));
        else if (e.key === 'Home') next = 0;
        // End: the last value on the step grid below 360.
        else if (e.key === 'End') next = norm(stepOn(360, step, 0, -1));
        if (next < 0) return;
        e.preventDefault?.();
        set(next, true);
      }}
    >
      {() => (/** @type {{ value: number }[]} */ (read(props.marks) ?? [])).map(markDot)}
      <View style={thumb} />
      <Show when={() => read(props.readout) !== false}>
        <Label {...DECOR} text={text} />
      </Show>
    </Action>
  );
}

/**
 * Stars: `value` + `onChange` or `defaultValue`, `count`
 * (5), `divisions` (1: whole stars; 2: halves, …), `readOnly`, `size` (xs
 * to xl, the theme's `sizes.rating`, or pixels; md), `color` ('amber'), `empty` and `full` (the symbols:
 * functions of the star's index, or elements), `solo` (only the chosen
 * star filled),
 * `onHover` (the value under the pointer, or null as it leaves). The pointer previews the
 * value it would set; keys: arrows step by a fraction, Home and End. A
 * `slider` from 0 to `count`.
 * @param {Record<string, any>} props
 */
export function Rating(props) {
  const R = $active();
  const model = $value(props, 0);
  const ui = $ui();
  const count = () => read(props.count) ?? 5;
  const divisions = () => Math.max(1, read(props.divisions) ?? 1);
  const size = () => (typeof read(props.size) === 'number' ? read(props.size) : ui.theme().sizes.rating[sizeOf(read(props.size) ?? 'md')]);
  const frozen = () => read(props.readOnly) === true;
  // The value under the pointer, null while it is not over the stars.
  const hover = $signal($active(), /** @type {number | null} */ (null));
  /** @type {any} */
  let node = null;
  const valueAt = (/** @type {any} */ e) => {
    // The stars sit inside its padding and border.
    const ratio = ratioAt(node, e, insetsOf($untrack(R, root)));
    const f = divisions();
    return clamp(Math.ceil(ratio * count() * f) / f, 1 / f, count());
  };
  const shown = () => $read(hover) ?? model.get();
  const fill = (/** @type {number} */ i) => {
    const v = shown();
    if (read(props.solo) === true) return Math.ceil(v) - 1 === i ? 1 : 0;
    return clamp(v - i, 0, 1);
  };
  const symbol = (/** @type {number} */ i, /** @type {boolean} */ full) => {
    const custom = full ? props.full : props.empty;
    if (custom !== undefined) return typeof custom === 'function' ? custom(i) : custom;
    return (
      <Shape
        style={() => ({ width: size(), height: size(), shrink: 0 })}
        shapes={() => {
          const theme = ui.theme();
          const scheme = ui.scheme();
          const color = full ? colorOf(theme, scheme, read(props.color) ?? 'amber') : pageColors(theme, scheme).track;
          return starShape(size(), color);
        }}
      />
    );
  };
  const star = (/** @type {number} */ i) => (
    <View style={() => ({ width: size(), height: size(), shrink: 0 })}>
      {symbol(i, false)}
      <View style={() => ({ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${fill(i) * 100}%`, overflow: 'hidden' })}>{symbol(i, true)}</View>
    </View>
  );
  const set = (/** @type {number} */ v) => {
    if (frozen()) return;
    if (v !== model.get()) model.set(v);
  };
  const preview = (/** @type {number | null} */ v) => {
    if ($read(hover) === v) return;
    $write(hover, v);
    props.onHover?.(v);
  };
  const root = styled(props, theme => ({ direction: 'row', align: 'center', background: 'transparent', border: 0, padding: 0, minHeight: 0, radius: theme.radius.sm, gap: 0, cursor: frozen() ? 'default' : 'pointer', justify: 'start', self: 'start' }));
  return (
    <Action
      ref={(/** @type {any} */ n) => {
        node = n;
        handOn(props.ref, n);
      }}
      label={() => read(props.label) ?? labelsIn().rating}
      {...(props.label === undefined && props['aria-label'] === undefined ? $fieldName(props) : null)}
      role="slider"
      aria-valuenow={model.get}
      aria-valuemin={0}
      aria-valuemax={count}
      aria-readonly={flag(frozen)}
      style={root}
      onPointerDown={(/** @type {any} */ e) => set(valueAt(e))}
      onPointerMove={(/** @type {any} */ e) => !frozen() && preview(valueAt(e))}
      onPointerLeave={() => !frozen() && preview(null)}
      onPointerCancel={() => !frozen() && preview(null)}
      onKey={(/** @type {any} */ e) => {
        if (frozen()) return;
        const d = divisions();
        const f = 1 / d;
        const v = model.get();
        // On the divisions grid, never drifting: a whole number of 1/d steps.
        const on = (/** @type {number} */ x) => Math.round(x * d) / d;
        const next = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? Math.min(count(), on(v + f)) : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? Math.max(0, on(v - f)) : e.key === 'Home' ? f : e.key === 'End' ? count() : -1;
        if (next < 0) return;
        e.preventDefault?.();
        set(next);
      }}
    >
      {() => Array.from({ length: count() }, (_, i) => star(i))}
    </Action>
  );
}
