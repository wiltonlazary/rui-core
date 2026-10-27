// Stepper: a sequence of stages as numbered chips joined by tracks that
// fill as stages are done, the current stage's content next to them, and a
// closing view once every stage is done. `reach` says which stages a press
// may move to.

import { Action, View, Label, Lazy, Show, $active, $memo, $read, $kind, read } from 'ren-core';
import { styled, pressLook } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { variantColors, radiusOf, pageColors, colorOf, sized, spacing, fontBelow } from '../../theme/resolve.js';
import { pass } from '../layout/layout.jsx';
import { CheckIcon } from '../buttons/icons.jsx';
import { Loader } from '../feedback/loader.jsx';
import { textual, textOf } from '../feedback/feedback.jsx';
import { $navValue, flat } from './state.js';
import { DECOR, flag, named } from '../../theme/meaning.js';
import { labelsIn } from '../../theme/labels.js';

/** Whether a child is an element of `component`. @param {any} child @param {Function} component */
const partOf = (child, component) => child instanceof Lazy && child.component === component;

/**
 * A stepper: its `Stepper.Stage` children in order, then an optional
 * `Stepper.Done`. `value` (the current stage's index: a number, an
 * accessor or a signal) or `defaultValue` (0), `onChange(index)`; `reach`
 * ('back': done stages only, 'any': any other stage, 'none'),
 * `orientation` ('horizontal' or 'vertical'), `color` (the tone; the
 * theme's accent), `size` (xs to xl, md), `chipSize` (px; the theme's
 * `sizes.step` at `size`), `radius` (the theme's `corner`), `doneIcon`,
 * `gap` (between the stages and the content, 'lg') and `wrap` (a
 * horizontal row wraps).
 *
 * Stage i is done below the value, current at it and idle above it; at
 * or past the stage count every stage is done and Done's children show,
 * below 0 none is and nothing shows. It means a `list` of `listitem`s,
 * the current one `aria-current` 'step'; a stage a press may move to
 * holds a `button`, and chips and tracks are decoration.
 * @param {Record<string, any>} props
 */
export function Stepper(props) {
  const ui = $ui();
  const R = $active();
  const children = flat(props.children);
  const stages = children.filter(c => partOf(c, StepperStage)).map(c => /** @type {Record<string, any>} */ (c.props));
  const done = children.find(c => partOf(c, StepperDone));
  const n = stages.length;
  const panels = [...stages.map(s => s.children), done?.props.children];
  const state = $navValue(props, 0);
  const current = () => Math.floor(Number(state.get()));
  /** The panel shown: a stage's content, Done's (n), or none (-1). */
  const shown = $memo(R, () => {
    const c = current();
    return c < 0 ? -1 : Math.min(c, n);
  });
  const vertical = () => read(props.orientation) === 'vertical';
  const movable = () => props.value === undefined || $kind(props.value) === 'signal' || typeof props.onChange === 'function';
  const chip = () => {
    const own = read(props.chipSize);
    return typeof own === 'number' ? own : sized(ui.theme().sizes.step, read(props.size));
  };
  const thickness = () => sized(ui.theme().sizes.progress, read(props.size));
  /** A stage's tone. @param {Record<string, any>} stage */
  const tone = stage => read(stage.color) ?? read(props.color);

  /** One stage: its chip and text, pressable or plain. @param {Record<string, any>} stage @param {number} i */
  const item = (stage, i) => {
    const phase = () => {
      const c = current();
      return i < c ? 'done' : i === c ? 'current' : 'idle';
    };
    const disabled = () => read(stage.disabled) === true;
    const pressable = () => {
      if (!movable() || disabled() || phase() === 'current') return false;
      const reach = read(props.reach) ?? 'back';
      return reach === 'any' || (reach === 'back' && phase() === 'done');
    };
    const name = () => named(stage.label)() ?? labelsIn().step(i + 1, n);
    const glyph = () => Math.round(chip() * ui.theme().ratios.glyph);
    const dim = () => (disabled() ? { opacity: ui.theme().opacity.disabled } : null);
    const box = styled({}, (theme, scheme) => ({
      direction: 'row',
      align: 'center',
      gap: theme.control.iconGap,
      background: 'transparent',
      border: 0,
      padding: 0,
      color: pageColors(theme, scheme).text,
      ...(pressable() ? pressLook(theme) : { cursor: 'default' }),
    }));
    const chipStyle = styled({}, (theme, scheme) => {
      const side = chip();
      const p = phase();
      const page = pageColors(theme, scheme);
      const background =
        p === 'done'
          ? variantColors(theme, scheme, 'solid', tone(stage)).background
          : p === 'current'
            ? variantColors(theme, scheme, 'soft', tone(stage)).background
            : page.track;
      return { width: side, height: side, shrink: 0, radius: Math.min(side / 2, radiusOf(theme, read(props.radius))), align: 'center', justify: 'center', border: 0, background, ...dim() };
    });
    const numberStyle = styled({}, (theme, scheme) => {
      const p = phase();
      const color =
        p === 'done'
          ? variantColors(theme, scheme, 'solid', tone(stage)).color
          : p === 'current'
            ? variantColors(theme, scheme, 'soft', tone(stage)).color
            : pageColors(theme, scheme).quiet;
      return { fontSize: glyph(), fontWeight: theme.weights.bold, lineHeight: 1, color, wrap: false };
    });
    const labelStyle = styled({}, (theme, scheme) => ({ fontSize: sized(theme.fontSizes, read(props.size)), fontWeight: theme.weights.strong, color: pageColors(theme, scheme).text }));
    const noteStyle = styled({}, (theme, scheme) => ({ fontSize: fontBelow(theme, read(props.size) ?? 'md'), color: pageColors(theme, scheme).quiet, wrap: true }));
    const check = () => {
      const mark = stage.doneIcon ?? props.doneIcon;
      if (mark != null) return textual(mark) ? <Label text={mark} style={numberStyle} /> : mark;
      return <CheckIcon size={glyph} color={() => variantColors(ui.theme(), ui.scheme(), 'solid', tone(stage)).color} />;
    };
    const number = () => {
      const own = stage.icon;
      if (own != null && !textual(own)) return own;
      return <Label text={own ?? String(i + 1)} style={numberStyle} />;
    };
    const mark = () => (read(stage.loading) === true ? <Loader size={glyph} color={() => tone(stage) ?? ui.theme().accent} /> : phase() === 'done' ? check() : number());
    const inner = () => [
      <View {...DECOR} style={chipStyle}>
        {mark}
      </View>,
      <View style={() => ({ direction: 'column', gap: 2, ...dim() })}>
        {textual(stage.label) ? <Label text={stage.label} style={labelStyle} /> : stage.label}
        {stage.description == null ? null : textOf(stage.description, noteStyle)}
      </View>,
    ];
    return (
      <View
        role="listitem"
        aria-current={() => (phase() === 'current' ? 'step' : undefined)}
        aria-disabled={flag(disabled)}
        aria-label={textual(stage.label) ? undefined : name()}
        style={{ direction: 'row', align: 'center' }}
      >
        <Show when={pressable} fallback={<View style={box}>{inner()}</View>}>
          <Action label={name} onPress={() => (pressable() ? state.set(i) : undefined)} style={box}>
            {inner()}
          </Action>
        </Show>
      </View>
    );
  };

  /** The track after stage i, full once stage i is done. @param {number} i */
  const track = i => {
    const stage = stages[i];
    const outer = styled({}, (theme, scheme) => {
      const t = thickness();
      const shared = { radius: theme.radius.round, background: pageColors(theme, scheme).track, overflow: 'hidden', shrink: 0 };
      return vertical()
        ? { ...shared, width: t, minHeight: theme.spacing.lg, margin: [theme.control.labelGap, 0, theme.control.labelGap, (chip() - t) / 2] }
        : { ...shared, height: t, grow: 1, shrink: 1, minWidth: theme.spacing.md, margin: [0, theme.control.iconGap], self: 'center' };
    });
    const fill = () => {
      const full = i < current();
      const background = colorOf(ui.theme(), ui.scheme(), tone(stage));
      return vertical() ? { width: '100%', height: full ? '100%' : 0, background } : { height: '100%', width: full ? '100%' : 0, background };
    };
    return (
      <View {...DECOR} style={outer}>
        <View style={/** @type {any} */ (fill)} />
      </View>
    );
  };

  const list = () => ({
    direction: vertical() ? 'column' : 'row',
    align: vertical() ? 'start' : 'center',
    wrap: !vertical() && read(props.wrap) === true,
    shrink: 0,
  });
  const style = styled(props, theme => ({
    direction: vertical() ? 'row' : 'column',
    align: vertical() ? 'start' : 'stretch',
    gap: spacing(theme, read(props.gap), 'lg'),
  }));
  const content = () => {
    const at = $read(shown);
    const panel = at < 0 ? undefined : panels[at];
    return panel == null ? null : <View style={{ grow: 1, minWidth: 0 }}>{textOf(panel)}</View>;
  };
  return (
    <View {...pass(props)} style={style}>
      <View role="list" style={/** @type {any} */ (list)}>
        {stages.flatMap((stage, i) => (i === 0 ? [item(stage, i)] : [track(i - 1), item(stage, i)]))}
      </View>
      {content}
    </View>
  );
}

/**
 * A stage: `label`, `description` (wrapping within its room), `icon` (in
 * place of its number), `doneIcon`, `loading`, `color`, `disabled` (never
 * pressed, dimmed); its children show while it is current.
 * @param {Record<string, any>} _props
 * @returns {null}
 */
export function StepperStage(_props) {
  return null;
}

/**
 * What shows once every stage is done: its children.
 * @param {Record<string, any>} _props
 * @returns {null}
 */
export function StepperDone(_props) {
  return null;
}

Stepper.Stage = StepperStage;
Stepper.Done = StepperDone;
