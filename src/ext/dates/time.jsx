// Times: TimeInput (a masked field), TimePicker (segments for hours,
// minutes, seconds and AM/PM, with a panel of columns and presets) and
// TimeSlots (a grid of time slots). Values are 'HH:mm' or 'HH:mm:ss' strings
// in 24 hours, '' when empty.

import { View, Label, Action, Scroll, Show, For, $active, $signal, $read, $write, read, $untrack } from 'ren-core';
import { styled } from '../../theme/style.js';
import { radiusOf, pageColors, sized } from '../../theme/resolve.js';
import { Popover } from '../../core/overlays/index.js';
import { MaskInput, Field } from '../../core/inputs/index.js';
import { heightOf } from '../../core/inputs/shared.js';
import { invalidOf, $nameOf } from '../../core/inputs/field.jsx';
import { Tiles } from '../../core/layout/index.js';
import { CloseButton } from '../../core/buttons/index.js';
import { toSeconds, fromSeconds, formatTime, labelsOf } from './arith.js';
import { $dateValue, fontOf, cellStyle } from './shared.jsx';
import { state as aria, flag } from '../../theme/meaning.js';
import { handled } from '../../core/overlays/shared.jsx';
import { $breakpoints } from '../../theme/breakpoints.js';
import { $ui } from '../../theme/theme.jsx';
import { labelsIn } from '../../theme/labels.js';

/** An empty digit: a middle dot, so an unset segment reads as a blank slot, not a dash or a minus. */
const DOT = '\u00b7';
/** An empty two-digit segment (and an unset AM/PM): two middle dots. */
const EMPTY = DOT + DOT;

/** A time kept within bounds (seconds), read by `parse`. @param {number} t @param {any} min @param {any} max @param {(v: any) => number | null} [parse] */
function bounded(t, min, max, parse = toSeconds) {
  const lo = parse(min);
  const hi = parse(max);
  let v = t;
  if (lo !== null && v < lo) v = lo;
  if (hi !== null && v > hi) v = hi;
  return v;
}

// ---------------------------------------------------------------------------
// TimeInput

/**
 * A time typed through a mask (on the portable Edit):
 * 'HH:mm', or 'HH:mm:ss' with `seconds`; `value`/`defaultValue`/`onChange`
 * (the time once complete and valid, '' once cleared), `min` and
 * `max` (applied on blur), and TextInput's props (label, description,
 * error, size, …). An incomplete or impossible time goes back to the value
 * on blur.
 * @param {Record<string, any>} props
 */
export function TimeInput(props) {
  const R = $active();
  const value = $dateValue(props, 'value', 'defaultValue', '', 'onChange');
  const seconds = () => read(props.seconds) === true;
  const draft = $signal(R, /** @type {string | null} */ (null));
  const normal = (/** @type {string} */ v) => {
    const t = toSeconds(v);
    return t === null ? '' : fromSeconds(t, seconds());
  };
  const shown = () => $read(draft) ?? normal(String(value.get() ?? ''));
  const commit = (/** @type {string} */ v) => {
    if (v !== value.get()) value.set(v);
  };
  const input = (/** @type {string} */ text) => {
    if (text === '') {
      // Empty until blur, even where the parent keeps a value (DateTimeSelect).
      $write(draft, '');
      commit('');
      return;
    }
    const complete = text.length === (seconds() ? 8 : 5);
    const t = complete ? toSeconds(text) : null;
    if (t !== null) {
      $write(draft, null);
      commit(fromSeconds(t, seconds()));
    } else $write(draft, text);
  };
  const blur = (/** @type {any} */ e) => {
    const t = toSeconds(String(value.get() ?? ''));
    $write(draft, null);
    if (t !== null) {
      const v = fromSeconds(bounded(t, read(props.min), read(props.max)), seconds());
      commit(v);
    }
    props.onBlur?.(e);
  };
  const rest = { ...props };
  for (const k of ['value', 'defaultValue', 'onChange', 'seconds', 'min', 'max', 'onBlur']) delete rest[k];
  return <MaskInput {...rest} mask={() => (seconds() ? '##:##:##' : '##:##')} placeholder={props.placeholder ?? (() => (seconds() ? `${EMPTY}:${EMPTY}:${EMPTY}` : `${EMPTY}:${EMPTY}`))} value={shown} onChange={input} onBlur={blur} />;
}

// ---------------------------------------------------------------------------
// TimePicker

/** @typedef {{ h: number | null, m: number | null, s: number | null, pm: boolean | null }} Parts */

/** @param {number | null} n */
const two = n => (n === null ? EMPTY : n < 10 ? `0${n}` : String(n));

/** A duration's seconds from 'H+:mm' or 'H+:mm:ss' (hours past 23 too), or null. @param {any} text */
export function durationSeconds(text) {
  if (text == null) return null;
  const m = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(String(text).trim());
  if (m === null || Number(m[2]) > 59 || Number(m[3] ?? 0) > 59) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
}

/** A duration as 'HH:mm:ss' (or 'HH:mm'), its hours at least two digits and past 23 when longer. @param {number} total @param {boolean} [seconds] */
export function fromDuration(total, seconds = true) {
  const t = Math.max(0, Math.round(total));
  const text = `${two(Math.floor(t / 3600))}:${two(Math.floor(t / 60) % 60)}`;
  return seconds ? `${text}:${two(t % 60)}` : text;
}

/**
 * A time picked in segments: `value`/
 * `defaultValue`/`onChange` ('HH:mm:ss' or 'HH:mm'; '' while a segment is
 * empty), `format` ('24h' or '12h'), `seconds`, `min`, `max`,
 * `hourStep`, `minuteStep`, `secondStep`, `periods` ({ am, pm }),
 * `clearable`, `panel` (columns of hours, minutes, seconds and AM/PM),
 * `presets` (times, or groups `{ label, times }`), `sticky` (true: a
 * preset keeps the panel open), `popover`, `kind` ('time', or
 * 'duration': 24 hours, hours past 23 (`hourDigits`, 2, shown at
 * least), digits typed into the hours without moving on, no panel),
 * and the Field's `label`, `description`, `error`, `size`,
 * `radius`, `disabled`.
 *
 * A segment is a focusable control: ArrowUp and ArrowDown step it, Home and
 * End go to its least and greatest, digits type it (moving on when it is
 * full), Backspace clears it, ArrowLeft and ArrowRight move between
 * segments; A and P set AM and PM. A press on a segment opens the panel
 * (rui-core's Popover, below the field's start), Escape and a press outside
 * close it.
 * @param {Record<string, any>} props
 */
export function TimePicker(props) {
  const R = $active();
  const value = $dateValue(props, 'value', 'defaultValue', '', 'onChange');
  const duration = () => read(props.kind) === 'duration';
  const twelve = () => !duration() && read(props.format) === '12h';
  const digits = () => Math.max(1, Number(read(props.hourDigits) ?? 2));
  /** A value's seconds, a duration's too. @param {any} v */
  const parse = v => (duration() ? durationSeconds(v) : toSeconds(v));
  /** Seconds as a value. @param {number} t @param {boolean} full with seconds */
  const format = (t, full) => (duration() ? fromDuration(t, full) : fromSeconds(t, full));
  const panelOn = () => read(props.panel) === true && !duration();
  const seconds = () => read(props.seconds) === true;
  const disabled = () => read(props.disabled) === true || read(props.readOnly) === true;
  const labels = () => {
    const l = read(props.periods);
    return { am: l?.am ?? labelsOf(null).am, pm: l?.pm ?? labelsOf(null).pm };
  };
  const draft = $signal(R, /** @type {Parts | null} */ (null));
  const open = $signal(R, false);
  /** The parts of the value. @returns {Parts} */
  const fromValue = () => {
    const t = parse(String(value.get() ?? ''));
    if (t === null) return { h: null, m: null, s: null, pm: null };
    const h = Math.floor(t / 3600);
    return { h, m: Math.floor(t / 60) % 60, s: t % 60, pm: h >= 12 };
  };
  const parts = () => $read(draft) ?? fromValue();
  /** Writes parts: the value once every segment is set, else '' and a draft. @param {Parts} p */
  const write = p => {
    const complete = p.h !== null && p.m !== null && (!seconds() || p.s !== null) && (!twelve() || p.pm !== null);
    if (complete) {
      const t = bounded(/** @type {number} */ (p.h) * 3600 + /** @type {number} */ (p.m) * 60 + (seconds() ? /** @type {number} */ (p.s) : 0), read(props.min), read(props.max), parse);
      $write(draft, null);
      const v = format(t, seconds());
      if (v !== value.get()) value.set(v);
    } else {
      $write(draft, p);
      if (value.get() !== '') value.set('');
    }
  };

  /**
   * @typedef {object} Segment
   * @property {string} name
   * @property {() => string} text
   * @property {(p: Parts, n: number | null) => Parts} set
   * @property {(p: Parts) => number | null} get the shown number
   * @property {() => [number, number]} range the shown least and greatest
   * @property {() => number} step
   */
  /** @type {Segment[]} */
  const all = [
    {
      name: 'hours',
      get: p => (p.h === null ? null : twelve() ? (p.h % 12 === 0 ? 12 : p.h % 12) : p.h),
      text: () => {
        const h = all[0].get(parts());
        if (!duration()) return two(h);
        return h === null ? DOT.repeat(digits()) : String(h).padStart(digits(), '0');
      },
      set: (p, n) => {
        if (n === null) return { ...p, h: null };
        if (!twelve()) return { ...p, h: n };
        return { ...p, h: (n % 12) + (p.pm === true ? 12 : 0) };
      },
      range: () => (duration() ? [0, Infinity] : twelve() ? [1, 12] : [0, 23]),
      step: () => Number(read(props.hourStep) ?? 1),
    },
    { name: 'minutes', get: p => p.m, text: () => two(parts().m), set: (p, n) => ({ ...p, m: n }), range: () => [0, 59], step: () => Number(read(props.minuteStep) ?? 1) },
    { name: 'seconds', get: p => p.s, text: () => two(parts().s), set: (p, n) => ({ ...p, s: n }), range: () => [0, 59], step: () => Number(read(props.secondStep) ?? 1) },
    {
      name: 'am/pm',
      get: p => (p.pm === null ? null : p.pm ? 1 : 0),
      text: () => {
        const p = parts().pm;
        return p === null ? EMPTY : p ? labels().pm : labels().am;
      },
      set: (p, n) => (n === null ? { ...p, pm: null } : { ...p, pm: n === 1, h: p.h === null ? null : (p.h % 12) + (n === 1 ? 12 : 0) }),
      range: () => [0, 1],
      step: () => 1,
    },
  ];
  const shown = () => all.filter(s => (s.name !== 'seconds' || seconds()) && (s.name !== 'am/pm' || twelve()));
  /** @type {Record<string, any>} */
  const nodes = {};
  let typed = '';
  const focusSegment = (/** @type {string} */ name, /** @type {number} */ by) => {
    const list = shown();
    const at = list.findIndex(s => s.name === name) + by;
    if (at >= 0 && at < list.length) nodes[list[at].name]?.focus?.();
  };
  const keys = (/** @type {Segment} */ seg) => (/** @type {any} */ e) => {
    if (disabled()) return;
    const k = String(e.key);
    const p = parts();
    const [lo, hi] = seg.range();
    const cur = seg.get(p);
    const put = (/** @type {number | null} */ n) => {
      e.preventDefault?.();
      write(seg.set(p, n));
    };
    // A duration's hours have no greatest: they stop at 0 and grow, typed digits add up.
    const unbounded = hi === Infinity;
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      const dir = k === 'ArrowUp' ? 1 : -1;
      const step = seg.step();
      typed = '';
      if (cur === null) return put(dir > 0 || unbounded ? lo : hi);
      let n = cur + dir * step;
      if (n > hi) n = lo;
      if (n < lo) n = unbounded ? lo : hi;
      return put(n);
    }
    if (k === 'Home' || (k === 'End' && !unbounded)) {
      typed = '';
      return put(k === 'Home' ? lo : hi);
    }
    if (unbounded && /^[0-9]$/.test(k)) {
      typed = String(Number(typed + k));
      return put(Number(typed));
    }
    if (k === 'Backspace' || k === 'Delete') {
      typed = '';
      return put(null);
    }
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault?.();
      typed = '';
      focusSegment(seg.name, k === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (k === 'Escape') {
      if ($untrack(R, () => $read(open))) handled(e);
      $write(open, false);
      return;
    }
    if (seg.name === 'am/pm') {
      const c = k.toLowerCase();
      if (c === labels().am[0].toLowerCase()) put(0);
      else if (c === labels().pm[0].toLowerCase()) put(1);
      return;
    }
    if (/^[0-9]$/.test(k)) {
      const joined = typed + k;
      const n = Number(joined);
      if (typed !== '' && n <= hi) {
        typed = '';
        put(n);
        focusSegment(seg.name, 1);
        return;
      }
      const d = Number(k);
      // A digit that no two-digit number in range starts with fills the segment.
      if (d * 10 > hi) {
        typed = '';
        put(Math.max(lo, d));
        focusSegment(seg.name, 1);
        return;
      }
      typed = k;
      put(Math.max(lo, d));
    }
  };
  const size = () => (typeof read(props.size) === 'string' ? read(props.size) : 'sm');
  const height = (/** @type {import('../../theme/theme.jsx').RuiThemeValue} */ theme) => heightOf(theme, size());
  const segment = (/** @type {Segment} */ seg) => (
    <Action
      ref={(/** @type {any} */ n) => (nodes[seg.name] = n)}
      label={seg.name}
      role="spinbutton"
      aria-disabled={flag(() => read(props.disabled) === true)}
      aria-valuenow={() => seg.get(parts()) ?? undefined}
      aria-valuemin={() => seg.range()[0]}
      aria-valuemax={() => seg.range()[1]}
      text={seg.text}
      onPress={() => !disabled() && panelOn() && $write(open, true)}
      onFocus={() => (typed = '')}
      onKey={keys(seg)}
      style={styled({}, (theme, scheme) => ({
        padding: [0, 2],
        border: 0,
        radius: 2,
        minHeight: 0,
        background: 'transparent',
        color: seg.get(parts()) === null ? pageColors(theme, scheme).placeholder : pageColors(theme, scheme).text,
        fontSize: sized(theme.fontSizes, size()),
        cursor: disabled() ? 'not-allowed' : 'text',
        focus: { background: pageColors(theme, scheme).hover },
      }))}
    />
  );
  const colon = styled({}, (theme, scheme) => ({ color: pageColors(theme, scheme).quiet, fontSize: sized(theme.fontSizes, size()) }));
  const empty = () => {
    const p = parts();
    return p.h === null && p.m === null && p.s === null && p.pm === null;
  };
  const field = styled({}, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    return {
      direction: 'row',
      align: 'center',
      gap: 0,
      height: height(theme),
      minHeight: height(theme),
      // The segments inset from the start by the field's inset ratio of its height; half a step at the end.
      padding: [0, theme.spacing.xs / 2, 0, Math.round(height(theme) * theme.ratios.inset)],
      border: 1,
      borderColor: invalidOf(read(props.error), read(props.invalid)) ? theme.colors.red[theme.accentShade[scheme]] : page.border,
      radius: radiusOf(theme, read(props.radius)),
      background: disabled() ? page.disabled : page.field,
      ...(read(props.disabled) === true ? { opacity: theme.opacity.disabled } : null),
    };
  });

  // ------------------------------------------------------------ panel
  const pick = (/** @type {Segment} */ seg, /** @type {number} */ n) => {
    write(seg.set(parts(), n));
  };
  const column = (/** @type {Segment} */ seg) => {
    const numbers = () => {
      const [lo, hi] = seg.range();
      const step = Math.max(1, seg.step());
      /** @type {number[]} */
      const out = [];
      for (let n = lo; n <= hi; n += step) out.push(n);
      return out;
    };
    const text = (/** @type {number} */ n) => (seg.name === 'am/pm' ? (n === 1 ? labels().pm : labels().am) : two(n));
    return (
      <Scroll role="listbox" aria-label={seg.name} style={styled({}, theme => ({ width: theme.sizes.time.column[0], height: theme.sizes.time.column[1], direction: 'column', gap: 2 }))}>
        <For by="position" each={numbers}>
          {n => (
            <Action
              text={() => text(n())}
              label={() => `${seg.name} ${text(n())}`}
              role="option"
              aria-selected={aria(() => seg.get(parts()) === n())}
              selected={() => seg.get(parts()) === n()}
              onPress={() => pick(seg, n())}
              style={styled({}, (theme, scheme) => ({
                ...cellStyle(theme, scheme, { selected: seg.get(parts()) === n() }, { width: theme.sizes.time.cell[0], height: theme.sizes.time.cell[1], fontSize: theme.fontSizes.sm, radius: radiusOf(theme, read(props.radius)) }),
                shrink: 0,
              }))}
            />
          )}
        </For>
      </Scroll>
    );
  };
  /** @returns {{ label: string | null, times: string[] }[]} */
  const groups = () => {
    const p = read(props.presets);
    if (p == null || p.length === 0) return [];
    return typeof p[0] === 'string' ? [{ label: null, times: p }] : p;
  };
  const preset = (/** @type {string} */ time) => (
    <Action
      text={() => formatTime(time, { format: twelve() ? '12h' : '24h', seconds: seconds(), periods: labels() })}
      datetime={time}
      onPress={() => {
        const t = parse(time);
        if (t === null) return;
        $write(draft, null);
        const v = format(bounded(t, read(props.min), read(props.max), parse), seconds());
        if (v !== value.get()) value.set(v);
        if (read(props.sticky) === false) $write(open, false);
      }}
      style={styled({}, (theme, scheme) => ({
        ...cellStyle(theme, scheme, { selected: toSeconds(time) === toSeconds(String(value.get() ?? '')) }, { width: 'auto', height: theme.sizes.time.cell[1], fontSize: theme.fontSizes.sm, radius: radiusOf(theme, read(props.radius)) }),
        padding: [0, theme.spacing.xs],
      }))}
    />
  );

  const dim = styled({}, (theme, scheme) => ({ fontSize: theme.fontSizes.xs, color: pageColors(theme, scheme).quiet }));
  // The panel: its groups of presets and its columns, a spacing step apart; within them, half a step.
  const panel = styled({}, theme => ({ padding: theme.control.panelPad, gap: theme.spacing.xs }));
  const group = styled({}, theme => ({ direction: 'column', gap: theme.spacing.xs / 2 }));
  const times = styled({}, theme => ({ direction: 'row', wrap: true, gap: theme.spacing.xs / 2, maxWidth: theme.sizes.time.presets }));
  const columns = styled({}, theme => ({ direction: 'row', gap: theme.spacing.xs / 2 }));
  const clear = () => {
    $write(draft, null);
    if (value.get() !== '') value.set('');
  };
  const fieldProps = { ...props };
  for (const k of ['value', 'defaultValue', 'onChange', 'presets', 'format', 'seconds', 'min', 'max', 'panel', 'clearable', 'periods', 'radius', 'disabled', 'kind', 'hourDigits', 'popover', 'hourStep', 'minuteStep', 'secondStep', 'sticky']) delete fieldProps[k];
  return (
    <Field {...fieldProps}>
      <Popover
        at="bottom-start"
        motion={{ duration: 0 }}
        radius={props.radius}
        shadow="md"
        {...read(props.popover)}
        open={() => $read(open) && panelOn() && !disabled()}
        onOpenChange={(/** @type {boolean} */ v) => $write(open, v)}
      >
        {/* A function child: the segments open it (a press on the field never closes it). */}
        <Popover.Trigger style={{ direction: 'column' }}>
          {(/** @type {any} */ _trigger) => (
        <View role="group" {...$nameOf(props, props['aria-label'])} style={field}>
          <For by="position" each={shown}>
            {(seg, i) => (
              <View style={{ direction: 'row', align: 'center' }}>
                <Show when={i > 0}>
                  <Label text={() => (seg().name === 'am/pm' ? ' ' : ':')} style={colon} />
                </Show>
                {() => segment(seg())}
              </View>
            )}
          </For>
          <View style={{ grow: 1 }} />
          <Show when={() => read(props.clearable) === true && !empty() && !disabled()}>
            <CloseButton size="sm" label={() => labelsIn().clearTime} onPress={clear} />
          </Show>
        </View>
          )}
        </Popover.Trigger>
        <Popover.Panel style={panel}>
            <For by="position" each={groups}>
              {g => (
                <View style={group}>
                  <Show when={() => g().label != null}>
                    <Label text={() => String(g().label)} style={dim} />
                  </Show>
                  <View style={times}>{() => g().times.map(preset)}</View>
                </View>
              )}
            </For>
            <View style={columns}>
              <For by="position" each={shown}>{seg => column(seg())}</For>
            </View>
        </Popover.Panel>
      </Popover>
    </Field>
  );
}

// ---------------------------------------------------------------------------
// TimeSlots

/**
 * Time slots in a grid: `data` (times, 'HH:mm' or
 * 'HH:mm:ss'; timeRange makes them), `value`/`defaultValue`/`onChange`
 * (the time pressed, as given in `data`; null when none), `format` ('24h'
 * or '12h'), `seconds`, `periods`, `min`, `max`,
 * `exclude` (times, or a function of a time), `deselectable`,
 * `grid` (Tiles' props: { columns: 4, gap: 'sm' }), `timeOf(time)`,
 * `size`, `radius`, `color`. The arrows move between slots, Enter and Space
 * press.
 * @param {Record<string, any>} props
 */
export function TimeSlots(props) {
  const value = $dateValue(props, 'value', 'defaultValue', /** @type {string | null} */ (null), 'onChange');
  const grid = () => ({ columns: 4, gap: 'sm', ...read(props.grid) });
  // The columns now, as Tiles lays them out: a responsive value at the viewport's width.
  const R = $active();
  const bp = $breakpoints();
  const ui = $ui();
  const columns = () => Number(bp.at(grid().columns, ui.theme()) ?? 4) || 4;
  /** @type {Map<string, any>} */
  const nodes = new Map();
  const data = () => /** @type {string[]} */ (read(props.data) ?? []);
  const off = (/** @type {string} */ time) => {
    const t = toSeconds(time);
    if (t === null) return true;
    const lo = toSeconds(read(props.min));
    const hi = toSeconds(read(props.max));
    if ((lo !== null && t < lo) || (hi !== null && t > hi)) return true;
    const d = props.exclude;
    if (typeof d === 'function') return d(time) === true;
    const list = read(d);
    return Array.isArray(list) && list.some(x => toSeconds(x) === t);
  };
  const same = (/** @type {string} */ a, /** @type {any} */ b) => b != null && toSeconds(a) === toSeconds(b);
  const press = (/** @type {string} */ time) => {
    if (off(time)) return;
    props.timeOf?.(time)?.onPress?.();
    if (same(time, value.get())) {
      if (read(props.deselectable) === true) value.set(null);
      return;
    }
    value.set(time);
  };
  const move = (/** @type {string} */ time, /** @type {number} */ by) => {
    const list = data();
    let at = list.indexOf(time) + by;
    const step = by > 0 ? 1 : -1;
    while (at >= 0 && at < list.length && off(list[at])) at += Math.abs(by) === 1 ? step : by;
    if (at >= 0 && at < list.length) nodes.get(list[at])?.focus?.();
  };
  const control = (/** @type {() => string} */ time) => {
    const extra = () => props.timeOf?.(time()) ?? {};
    const state = () => ({ selected: same(time(), value.get()), disabled: off(time()), ...extra() });
    const keys = (/** @type {any} */ e) => {
      const k = e.key;
      const cols = $untrack(R, columns);
      if (k === 'Enter' || k === ' ') {
        e.preventDefault?.();
        press(time());
        return;
      }
      const by = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : k === 'ArrowDown' ? cols : k === 'ArrowUp' ? -cols : 0;
      if (by === 0) return;
      e.preventDefault?.();
      move(time(), by);
    };
    const text = () => formatTime(time(), { format: read(props.format) === '12h' ? '12h' : '24h', seconds: read(props.seconds) === true, periods: read(props.periods) });
    return (
      <Action
        ref={(/** @type {any} */ n) => nodes.set(time(), n)}
        text={text}
        datetime={time}
        selected={() => state().selected === true}
        onPress={() => press(time())}
        onKey={keys}
        style={styled({}, (theme, scheme) => ({
          ...cellStyle(theme, scheme, state(), { width: '100%', height: /** @type {Record<string, number>} */ (theme.sizes.control)[typeof read(props.size) === 'string' ? read(props.size) : 'sm'] ?? theme.sizes.control.md, fontSize: fontOf(theme, read(props.size)), radius: radiusOf(theme, read(props.radius)), color: read(props.color) }),
          border: 1,
          borderColor: state().selected ? 'transparent' : pageColors(theme, scheme).border,
          ...read(extra().style),
        }))}
      />
    );
  };
  return (
    <Tiles {...props} columns={() => grid().columns} gap={() => grid().gap} rowGap={() => grid().rowGap}>
      <For by="position" each={data}>{time => control(time)}</For>
    </Tiles>
  );
}

