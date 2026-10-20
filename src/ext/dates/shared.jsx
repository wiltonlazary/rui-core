// What the date components share: DateSettings (the first day of the
// week, the weekend days, six weeks a month, labels, today), a controlled or
// uncontrolled value, and the sizes and colors of a picker's controls.

import { View, Show, $context, $lookup, $active, $signal, $read, $write, $kind, $untrack, read } from 'ren-core';
import { styled, pressLook } from '../../theme/style.js';
import { DECOR } from '../../theme/meaning.js';
import { pageColors, colorOf, sized } from '../../theme/resolve.js';
import { alpha } from '../../theme/colors.js';
import { labelsOf, toDate } from './arith.js';

/**
 * @typedef {object} DateSettingsValue
 * @property {number=} weekStart 0 Sunday to 6 Saturday (1)
 * @property {number[]=} weekend the weekend's days ([0, 6])
 * @property {boolean=} sixWeeks six weeks in every month
 * @property {Partial<import('./arith.js').DatesLabels>=} labels words over the English ones
 * @property {string | (() => string)=} today the day `markToday` marks and pickers open on ('YYYY-MM-DD'); the platform's day by default
 */

/** The settings of the date components inside (DateSettings), each a value or an accessor. */
const SettingsContext = $context(/** @type {any} */ (null));

/**
 * Settings for every date component inside: `weekStart`, `weekend`,
 * `sixWeeks`, `labels` and `today`, each a value or an accessor.
 * @param {{ [K in keyof DateSettingsValue]?: DateSettingsValue[K] | (() => DateSettingsValue[K]) } & { children?: any }} props
 */
export function DateSettings(props) {
  const value = () => ({ weekStart: read(props.weekStart), weekend: read(props.weekend), sixWeeks: read(props.sixWeeks), labels: read(props.labels), today: props.today });
  return <SettingsContext value={value}>{props.children}</SettingsContext>;
}

/** The platform's day, by its local fields. */
const platformToday = () => /** @type {string} */ (toDate(new Date()));

/**
 * A component's settings: its props first, then DateSettings', then
 * the defaults. Each is an accessor.
 * @param {Record<string, any>} props
 */
export function $settings(props) {
  // Looked up inside each read, as $ui's theme: the lookup tracks the
  // provider, so settings given as an accessor restyle in place.
  /** @returns {DateSettingsValue} */
  const context = () => /** @type {any} */ (read($lookup(SettingsContext))) ?? {};
  return {
    weekStart: () => Number(read(props.weekStart) ?? context().weekStart ?? 1),
    weekend: () => /** @type {number[]} */ (read(props.weekend) ?? context().weekend ?? [0, 6]),
    sixWeeks: () => Boolean(read(props.sixWeeks) ?? context().sixWeeks ?? false),
    labels: () => labelsOf({ ...context().labels, ...read(props.labels) }),
    today: () => toDate(read(props.today) ?? read(context().today) ?? platformToday()) ?? platformToday(),
  };
}

/**
 * A value, controlled or not: `props[name]` (a
 * value, an accessor or a signal) holds it; without it the component keeps
 * its own from `props[initial]` or `fallback`. A change calls `change` and
 * writes a signal passed in (two-way).
 * @template T
 * @param {Record<string, any>} props @param {string} name @param {string} initial @param {T} fallback @param {string} change
 * @returns {{ get: () => T, set: (value: T) => void }}
 */
export function $dateValue(props, name, initial, fallback, change) {
  const R = $active();
  const start = $untrack(R, () => read(props[initial]));
  const own = $signal(R, /** @type {T} */ (start === undefined ? fallback : start));
  const controlled = () => props[name] !== undefined;
  return {
    get: () => (controlled() ? /** @type {T} */ (read(props[name]) ?? fallback) : $read(own)),
    set(value) {
      const outer = props[name];
      if (outer === undefined) $write(own, value);
      else if ($kind(outer) === 'signal') $write(outer, value);
      props[change]?.(value);
    },
  };
}

/**
 * A day's side: pixels, or a step of the theme's `sizes.day` (sm by default).
 * @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {any} size
 * @returns {number}
 */
// sm when a picker gives no size (DayStrip and Calendar give md).
export const daySize = (theme, size) => {
  const days = /** @type {Record<string, number>} */ (theme.sizes.day);
  return typeof size === 'number' ? size : (days[size ?? 'sm'] ?? days.sm);
};

/** The font size of a picker's controls. @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {any} size */
export const fontOf = (theme, size) => sized(theme.fontSizes, typeof size === 'string' ? /** @type {any} */ (size) : 'sm', 'sm');

/**
 * @typedef {object} CellState
 * @property {boolean=} selected
 * @property {('start' | 'middle' | 'end' | 'solo' | false)=} span its place in a range: its first, a middle, its last, or the only one
 * @property {boolean=} disabled
 * @property {boolean=} outside a day of another month
 * @property {boolean=} weekend
 * @property {boolean=} today marked with a dot under its number (todayDot)
 */

/**
 * A picker control's style (a day and a picker control). The look:
 * - a range is one continuous band in the accent's light tint, its ends
 *   filled in the accent and rounded to a half circle on their outer side,
 *   its middle square, so the band reads as one pill across the days;
 * - a selected control (not in a range) is filled in the accent, rounded
 *   by `radius`;
 * - weekends are quiet; outside days are quiet at the muted opacity and
 *   never carry the band or the fill (their month's own grid shows them);
 * - disabled controls take the disabled ink and no hover, with the plain
 *   cursor (nothing happens on a press);
 * - today carries a dot under its number (todayDot), not a border.
 * @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {import('../../theme/theme.jsx').Scheme} scheme
 * @param {CellState} s @param {{ width: number | string, height: number, fontSize: number, radius: number, color?: string }} box
 * @returns {Record<string, any>}
 */
export function cellStyle(theme, scheme, s, box) {
  const page = pageColors(theme, scheme);
  const dark = scheme === 'dark';
  const primary = colorOf(theme, scheme, box.color ?? theme.accent);
  const shades = theme.colors[(box.color ?? theme.accent).split('.')[0]] ?? theme.colors[theme.accent];
  const span = s.outside ? false : (s.span ?? false);
  const end = box.height / 2;
  /** @type {Record<string, any>} */
  const base = {
    width: box.width,
    minWidth: box.width,
    height: box.height,
    minHeight: box.height,
    padding: 0,
    border: 0,
    shrink: 0,
    align: 'center',
    justify: 'center',
    textAlign: 'center',
    position: 'relative',
    fontSize: box.fontSize,
    // The band's ends round to half its height on their outer side; its middle stays square.
    radius: span === false ? box.radius : span === 'solo' ? end : span === 'start' ? [end, 0, 0, end] : span === 'end' ? [0, end, end, 0] : 0,
    background: 'transparent',
    color: s.weekend ? page.quiet : page.text,
    ...pressLook(theme),
  };
  if (s.outside) Object.assign(base, { color: page.quiet, opacity: theme.opacity.muted });
  if (s.disabled) return { ...base, color: page.disabledText, ...pressLook(theme, true) };
  if (isFilled(s)) return { ...base, background: primary, color: theme.white, hover: { background: shades[Math.min(9, theme.accentShade[scheme] + 1)] } };
  if (span !== false) return { ...base, background: dark ? alpha(primary, theme.opacity.faint) : shades[0], hover: { background: dark ? alpha(primary, theme.opacity.soft) : shades[1] } };
  return { ...base, hover: { background: page.hover } };
}

/** Whether a control is filled in the accent: a range's end, or a selection outside a range; never an outside day. @param {CellState} s */
export const isFilled = s => {
  const span = s.outside ? false : (s.span ?? false);
  return !s.outside && (span === 'start' || span === 'end' || span === 'solo' || (span === false && s.selected === true));
};

/**
 * Today's mark: a dot half a spacing step (xs) across, that far above the
 * control's bottom edge, centered under the number; in the accent, white on
 * a filled control. Placed inside a day or a picker control while `state()`
 * says it is today.
 * @param {{ state: () => CellState, color?: any }} props
 */
export function TodayDot(props) {
  const style = styled({}, (theme, scheme) => {
    const d = theme.spacing.xs / 2;
    return {
      position: 'absolute',
      left: '50%',
      bottom: d,
      width: d,
      height: d,
      margin: [0, 0, 0, -d / 2],
      radius: theme.radius.round,
      background: isFilled(props.state()) ? theme.white : colorOf(theme, scheme, read(props.color) ?? theme.accent),
    };
  });
  return (
    <Show when={() => props.state().today === true}>
      <View {...DECOR} style={style} />
    </Show>
  );
}
