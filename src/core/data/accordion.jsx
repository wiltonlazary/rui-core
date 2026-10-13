// Accordion: items that open and close (one, or `multiple`), with a
// trigger that turns its chevron down and a panel that collapses, on Action
// and the Collapse of this wave.

import { View, Label, Action, read, $active, $signal, $read, $write, $context, $lookup, $untrack, $watch, $writable } from 'ren-core';
import { styled } from '../../theme/style.js';
import { radiusOf, pageColors } from '../../theme/resolve.js';
import { pass } from '../layout/layout.jsx';
import { Collapse } from '../misc/collapse.jsx';
import { $tween } from '../misc/tween.js';
import { parts, Chevron, partOptions } from './parts.jsx';
import { textual } from './badge.jsx';
import { DECOR, flag, state, $uid } from '../../theme/meaning.js';
import { MOTION, durationOf } from '../../theme/motion.js';
import { $ui } from '../../theme/theme.jsx';

/**
 * @typedef {object} AccordionState
 * @property {(value: string) => boolean} open
 * @property {(value: string) => void} toggle
 * @property {Record<string, any>} props the Accordion's props
 */

const AccordionContext = $context(/** @type {AccordionState | null} */ (null));
/** An item's place and names: `trigger` and `panel` their element ids (their own, else made), each read by the other. */
const ItemContext = $context(/** @type {{ value: string, index: number, count: number, trigger: () => string, panel: () => string, name: (part: 'trigger' | 'panel', id: unknown) => void } | null} */ (null));

/** @param {AccordionState | null} a @returns {AccordionState} */
const need = a => {
  if (a === null) throw new Error('RUI: Accordion parts must be inside an Accordion');
  return a;
};

/**
 * Items that open and close: `multiple`, `value` and `onChange`
 * (controlled; a string or null, an array with `multiple`) or
 * `defaultValue`, `variant`, `chevronAt` (end or start), `chevron`
 * (`true`, the built-in one; `false`, none; a node of your own; or its
 * options `{ size, turn }`: its size, `sizes.glyph.md` by default, and
 * whether it turns as its item opens, true by default), `duration` (ms or
 * a MOTION preset; base, 190 ms), `radius`.
 * The look: a trigger row padded by `control.optionPad`, its icon, label
 * and chevron apart by `control.iconGap`; the chevron points toward the
 * row's end (toward its start with `chevronAt="start"`) and turns 90
 * degrees to point down while its item is open; the panel sits under the
 * label (in by `control.optionPad`'s x, and past the chevron too when it
 * is at the start), `control.panelPad` below it.
 * The variants: `plain`, a rule between items; `boxed`, the items in one
 * bordered box, a rule between them; `soft`, each item on the sunken
 * ground, apart by spacing xs; `split`, each item its own bordered card on
 * the page, apart by spacing sm, its border firmer while open.
 * @param {Record<string, any>} props
 */
export function Accordion(props) {
  const R = $active();
  const multiple = () => read(props.multiple) === true;
  const own = $signal(R, $untrack(R, () => read(props.defaultValue) ?? (multiple() ? [] : null)));
  const current = () => (props.value !== undefined ? read(props.value) : $read(own));
  /** @type {AccordionState} */
  const state = {
    props,
    open(value) {
      const v = current();
      return Array.isArray(v) ? v.includes(value) : v === value;
    },
    toggle(value) {
      const v = current();
      const next = multiple() ? (Array.isArray(v) && v.includes(value) ? v.filter(x => x !== value) : [...(Array.isArray(v) ? v : []), value]) : v === value ? null : value;
      if (props.value === undefined) $write(own, next);
      props.onChange?.(next);
    },
  };
  const style = styled(props, (theme, scheme) => {
    const variant = read(props.variant) ?? 'plain';
    return {
      direction: 'column',
      ...(variant === 'split' ? { gap: theme.spacing.sm } : variant === 'soft' ? { gap: theme.spacing.xs } : null),
      ...(variant === 'boxed' ? { border: 1, borderColor: pageColors(theme, scheme).rule, radius: radiusOf(theme, read(props.radius)), overflow: 'hidden' } : null),
    };
  });
  return (
    <AccordionContext value={state}>
      <View {...pass(props)} style={style}>
        {parts(props.children, AccordionItem, (index, count) => ({ __index: index, __count: count }))}
      </View>
    </AccordionContext>
  );
}

/** One item: `value` (its key). @param {Record<string, any>} props */
function AccordionItem(props) {
  const a = need(/** @type {AccordionState | null} */ ($lookup(AccordionContext)));
  const value = String(read(props.value));
  const index = props.__index ?? 0;
  const count = props.__count ?? 1;
  // The trigger's and the panel's ids: made here, unless a part gives its own (then that one, which the other points at).
  // A part names itself as it is built, where a computation runs, so computations may write them.
  const R = $active();
  const made = $uid('accordion');
  const ids = { trigger: $writable($signal(R, `${made}-trigger`)), panel: $writable($signal(R, `${made}-panel`)) };
  const item = {
    value,
    index,
    count,
    trigger: () => /** @type {string} */ ($read(ids.trigger)),
    panel: () => /** @type {string} */ ($read(ids.panel)),
    name: (/** @type {'trigger' | 'panel'} */ part, /** @type {unknown} */ id) => {
      if (id != null && id !== '') $write(ids[part], String(id));
    },
  };
  const style = styled(props, (theme, scheme) => {
    const variant = read(a.props.variant) ?? 'plain';
    const page = pageColors(theme, scheme);
    const radius = radiusOf(theme, read(a.props.radius));
    if (variant === 'soft') return { radius, background: page.sunken };
    if (variant === 'split') return { radius, border: 1, borderColor: a.open(value) ? page.border : page.rule, background: page.body };
    return {};
  });
  const line = () => {
    const variant = read(a.props.variant) ?? 'plain';
    return (variant === 'plain' || variant === 'boxed') && index < count - 1;
  };
  return (
    <ItemContext value={item}>
      <View {...pass(props)} style={style}>
        {props.children}
        {() => (line() ? <View {...DECOR} style={styled({}, (theme, scheme) => ({ height: 1, shrink: 0, background: pageColors(theme, scheme).rule }))} /> : null)}
      </View>
    </ItemContext>
  );
}

/** The press area that opens and closes its item: `icon` (decoration: the button is named by its title), `chevron`, `disabled`; a button, `aria-expanded` while its item is open. @param {Record<string, any>} props */
function AccordionTrigger(props) {
  const R = $active();
  const a = need(/** @type {AccordionState | null} */ ($lookup(AccordionContext)));
  const item = $lookup(ItemContext);
  if (item === null) throw new Error('RUI: Accordion.Trigger must be inside an Accordion.Item');
  item.name('trigger', read(props.id));
  const ui = $ui();
  const open = () => a.open(item.value);
  const turn = $tween($untrack(R, open) ? 1 : 0);
  $watch(R, open, o => turn.to(o ? 1 : 0, durationOf(read(a.props.duration), MOTION.base)));
  const style = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    const off = read(props.disabled) === true;
    return {
      direction: 'row',
      align: 'center',
      gap: theme.control.iconGap,
      width: '100%',
      padding: theme.control.optionPad,
      minHeight: 0,
      background: 'transparent',
      border: 0,
      radius: 0,
      color: page.text,
      fontSize: theme.fontSizes.md,
      fontWeight: theme.weights.strong,
      textAlign: 'start',
      justify: 'start',
      ...(off ? { opacity: theme.opacity.disabled, cursor: 'not-allowed' } : { cursor: 'pointer', hover: { background: page.hover } }),
    };
  });
  const ink = styled({}, (theme, scheme) => ({ color: pageColors(theme, scheme).text }));
  /** The chevron part's options, when it is the built-in one. @returns {Record<string, any>} */
  const options = () => {
    const c = read(a.props.chevron);
    return partOptions(c) ? c : {};
  };
  const chevron = () => {
    if (read(a.props.chevron) === false || props.chevron === null) return null;
    const custom = props.chevron ?? a.props.chevron;
    if (custom !== undefined && custom !== true && !partOptions(custom)) return custom;
    return (
      <Chevron
        size={() => read(options().size) ?? ui.theme().sizes.glyph.md}
        point={() => (left() ? 'start' : 'end')}
        open={() => (read(options().turn) === false ? 0 : $read(turn.value))}
        color={() => ink().color}
      />
    );
  };
  const left = () => read(a.props.chevronAt) === 'start';
  const label = <View style={styled({}, () => ({ grow: 1, minWidth: 0 }))}>{textual(props.children) ? <Label text={props.children} /> : props.children}</View>;
  return (
    <Action ref={props.ref} id={item.trigger} aria-controls={item.panel} aria-expanded={state(open)} aria-disabled={flag(props.disabled)} onPress={() => (read(props.disabled) ? undefined : a.toggle(item.value))} style={style}>
      {/* One row inside: on the DOM a button does not lay its children out as a flex row. */}
      <View style={styled({}, theme => ({ direction: 'row', align: 'center', gap: theme.control.iconGap, grow: 1, width: '100%', minWidth: 0 }))}>
        {() => (left() ? chevron() : null)}
        {/* The icon is decoration: the trigger is named by its title alone. */}
        {props.icon === undefined ? null : (
          <View {...DECOR} style={{ direction: 'row', align: 'center', shrink: 0 }}>
            {props.icon}
          </View>
        )}
        {label}
        {() => (left() ? null : chevron())}
      </View>
    </Action>
  );
}

/** The content its item opens, a `region` named by its trigger (the trigger `aria-controls` it). @param {Record<string, any>} props */
function AccordionPanel(props) {
  const a = need(/** @type {AccordionState | null} */ ($lookup(AccordionContext)));
  const item = $lookup(ItemContext);
  if (item === null) throw new Error('RUI: Accordion.Panel must be inside an Accordion.Item');
  item.name('panel', read(props.id));
  const style = styled(props, theme => {
    const x = theme.control.optionPad[1];
    const c = read(a.props.chevron);
    const lead = read(a.props.chevronAt) === 'start' && c !== false ? (partOptions(c) ? read(c.size) ?? theme.sizes.glyph.md : c === undefined || c === true ? theme.sizes.glyph.md : 0) + theme.control.iconGap : 0;
    return { padding: [0, x, theme.control.panelPad, x + lead], fontSize: theme.fontSizes.md };
  });
  return (
    <Collapse open={() => a.open(item.value)} duration={() => durationOf(read(a.props.duration), MOTION.base)}>
      <View role="region" {...pass(props)} id={item.panel} aria-labelledby={item.trigger} style={style}>
        {textual(props.children) ? <Label text={props.children} style={{ wrap: true }} /> : props.children}
      </View>
    </Collapse>
  );
}

Accordion.Item = AccordionItem;
Accordion.Trigger = AccordionTrigger;
Accordion.Panel = AccordionPanel;
