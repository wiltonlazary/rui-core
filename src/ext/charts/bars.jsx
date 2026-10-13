// Bars: a list of labeled amounts, each a line of text (the label at the
// start, its value at the end) over a thin track filled by its share of
// the largest. No text sits on a bar, so any fill color reads.

import { View, Label, For, Show, read } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { styled } from '../../theme/style.js';
import { pageColors } from '../../theme/resolve.js';
import { DECOR } from '../../theme/meaning.js';
import { pass } from '../../core/layout/layout.jsx';
import { partOf } from '../../core/overlays/shared.jsx';
import { num } from './scale.js';
import { tint, formatterOf, fieldsOf } from './shared.jsx';

/** @typedef {import('../../theme/theme.jsx').RuiThemeValue} RuiThemeValue */
/** @typedef {{ label?: any, value?: any, color?: string }} BarsItem */

/**
 * A bar's fill as a share of the largest value, in percent; 0 for a zero,
 * negative or missing value, or when nothing is positive.
 * @param {any} value @param {number} max
 */
const shareOf = (value, max) => {
  const v = num(value);
  return Number.isFinite(v) && v > 0 && max > 0 ? (v / max) * 100 : 0;
};

/**
 * A list of bars: `data` ({ label, value, color? }[]), `head` ({ label,
 * value }: the column titles above), `color` (every fill's unless an item
 * has its own; the accent by default), `format` and `unit` (the values'
 * text), `barSize` (the bar's thickness: `sizes.progress.md`), `rowGap`
 * (between items: spacing sm), `minLength` (the least fill of a positive
 * value: `sizes.progress.sm` px), `track` (true: the unfilled part in the
 * page's track role), `w`, and the root's style props. It means a `list`
 * of `listitem`s, each an item of a `name` and a `value` (raw).
 * @param {Record<string, any>} props
 */
export function Bars(props) {
  const ui = $ui();
  const data = () => /** @type {BarsItem[]} */ (read(props.data) ?? []);
  const max = () => data().reduce((m, d) => Math.max(m, Number.isFinite(num(d.value)) ? num(d.value) : 0), 0);
  const format = formatterOf(props);
  const head = () => partOf(read(props.head), false);
  const barSize = () => Number(read(props.barSize) ?? ui.theme().sizes.progress.md);
  /** @param {'text' | 'quiet'} role @param {'regular' | 'strong'} weight @param {'xs' | 'sm'} size */
  const text = (role, weight, size) => () => {
    const theme = ui.theme();
    return { fontSize: theme.fontSizes[size], lineHeight: theme.lineHeights[size], fontWeight: theme.weights[weight], color: pageColors(theme, ui.scheme())[role] };
  };
  const line = () => ({ direction: /** @type {const} */ ('row'), justify: /** @type {const} */ ('between'), align: /** @type {const} */ ('center'), gap: ui.theme().spacing.sm });
  const style = styled(props, theme => ({ width: '100%', gap: Number(read(props.rowGap) ?? theme.spacing.sm) }));
  return (
    <View role="list" {...pass(props)} style={style}>
      <Show when={() => head() !== null}>
        <View {...DECOR} style={line}>
          <Label text={() => String(head()?.label ?? '')} style={text('quiet', 'strong', 'xs')} />
          <Label text={() => String(head()?.value ?? '')} style={text('quiet', 'strong', 'xs')} />
        </View>
      </Show>
      <For by="position" each={data}>
        {item => {
          const share = () => shareOf(item().value, max());
          return (
            <View role="listitem" itemscope style={() => ({ gap: ui.theme().control.labelGap })}>
              <View style={line}>
                <Label itemprop="name" text={() => String(item().label ?? '')} style={text('text', 'regular', 'sm')} />
                <Label itemprop="value" content={() => /** @type {any} */ (fieldsOf(item()).value)} text={() => format(item().value)} style={text('text', 'strong', 'sm')} />
              </View>
              <View
                style={() => {
                  const theme = ui.theme();
                  return { direction: 'row', height: barSize(), radius: theme.radius.round, background: read(props.track) === false ? 'transparent' : pageColors(theme, ui.scheme()).track };
                }}
              >
                <Show when={() => share() > 0}>
                  <View
                    style={() => {
                      const theme = ui.theme();
                      return { width: `${share()}%`, minWidth: Number(read(props.minLength) ?? theme.sizes.progress.sm), height: '100%', radius: theme.radius.round, background: tint(theme, ui.scheme(), item().color ?? read(props.color)) };
                    }}
                  />
                </Show>
              </View>
            </View>
          );
        }}
      </For>
    </View>
  );
}
