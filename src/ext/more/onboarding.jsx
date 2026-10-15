// Onboarding: a tour of steps over marked spots. Each step's spot is
// measured (getBoundingClientRect, against the tour's own box) once laid
// out, and again as it or the tour resizes; a backdrop dims everything
// around it (its cutout), a card beside it holds the step's title and
// content with Back, Next (Finish) and Skip.
import { View, Label, Show, read, $active, $signal, $read, $write, $untrack, $watch, $context, $lookup, $resizes } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { styled } from '../../theme/style.js';
import { alpha } from '../../theme/colors.js';
import { pageColors, radiusOf, shadowOf } from '../../theme/resolve.js';
import { pass } from '../../core/layout/layout.jsx';
import { Button } from '../../core/buttons/button.jsx';
import { $controlled, rectOf, keyOf, partOf, handled } from '../../core/overlays/shared.jsx';
import { $nextFrame, bordersOf } from '../../core/misc/tween.js';
import { textual } from '../../core/data/badge.jsx';
import { DECOR, named } from '../../theme/meaning.js';
import { LAYERS } from '../../theme/layers.js';
import { handOn } from '../../core/ref.js';
import { labelsIn } from '../../theme/labels.js';

/** @typedef {{ spot: string, title?: any, content?: any }} OnboardingStep */
/** @typedef {{ x: number, y: number, width: number, height: number }} Box */

/** The tour a spot registers with. */
const TourContext = $context(/** @type {{ register: (id: string, node: any) => void } | null} */ (null));

/**
 * The four shaded boxes around a hole in a `width` by `height` area.
 * @param {Box} hole @param {number} width @param {number} height
 * @returns {Box[]} above, below, left, right
 */
export function aroundHole(hole, width, height) {
  const top = Math.max(0, hole.y);
  const bottom = Math.min(height, hole.y + hole.height);
  const left = Math.max(0, hole.x);
  const right = Math.min(width, hole.x + hole.width);
  return [
    { x: 0, y: 0, width, height: top },
    { x: 0, y: bottom, width, height: Math.max(0, height - bottom) },
    { x: 0, y: top, width: left, height: Math.max(0, bottom - top) },
    { x: right, y: top, width: Math.max(0, width - right), height: Math.max(0, bottom - top) },
  ];
}

/**
 * A tour: `steps` (OnboardingStep[]), `started` + `onStartedChange(started)`
 * or its own from `defaultStarted` (false; the Finish and Skip end it),
 * `value` (the step's index) + `onChange` or its own from `defaultValue` (0),
 * `onEnd` (after the last step's Finish, which also sets the step back to
 * 0, so an uncontrolled tour started again begins at the first), `onSkip`, `cutout` (`spacing.xs`, 8: the
 * room around the spot), `backdrop` (true, false or { color: black,
 * opacity: the theme's `opacity.disabled` }), `layer` (`LAYERS.float`: the
 * step above sheets, so a tour covers an open Modal), `cardWidth` (`sizes.box.onboarding.card`, 280), `nextLabel`, `previousLabel`,
 * `skipLabel`, `finishLabel`. A step's `spot` names an
 * `Onboarding.Spot id="…"` anywhere inside. The tour covers its own box
 * (put it around the page); Escape skips. Its card means a `dialog` named
 * by the step's title (a `heading`); the shaded cover is decoration.
 * @param {Record<string, any>} props
 */
export function Onboarding(props) {
  const R = $active();
  const ui = $ui();
  /** @type {Map<string, any>} */
  const spots = new Map();
  /** Counts the spots registered: the spot followed is looked up again. */
  const registered = $signal(R, 0);
  const step = $controlled(props, 'value', 'defaultValue', 0, s => props.onChange?.(s));
  const steps = () => /** @type {OnboardingStep[]} */ (read(props.steps) ?? []);
  const run = $controlled(props, 'started', 'defaultStarted', false, v => props.onStartedChange?.(v));
  const started = () => run.get() === true;
  const current = () => steps()[step.get()] ?? null;
  const hole = $signal(R, /** @type {Box | null} */ (null));
  const area = $signal(R, { width: 0, height: 0 });
  /** @type {any} */
  let root = null;
  const later = $nextFrame();
  const measure = () => {
    const s = $untrack(R, current);
    const node = s === null ? null : spots.get(s.spot);
    const r = rectOf(node);
    const o = rectOf(root);
    const pad = Number(read(props.cutout) ?? ui.theme().spacing.xs);
    // The shade and the hole are placed inside the root's border (an absolute place starts at its padding's edge).
    const b = bordersOf($untrack(R, style));
    $write(area, { width: Math.max(0, (o?.width ?? 0) - b.left - b.right), height: Math.max(0, (o?.height ?? 0) - b.top - b.bottom) });
    $write(hole, r === null || o === null ? null : { x: r.x - o.x - b.left - pad, y: r.y - o.y - b.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
  };
  $watch(R, () => [started(), step.get()], ([on]) => {
    if (on) later(measure);
  });
  // The step's spot or the tour resized (its content, a font loading): measured again at the next frame.
  const following = () => $untrack(R, started) && later(measure);
  $resizes(() => {
    $read(registered);
    const s = started() ? current() : null;
    return s === null ? null : (spots.get(s.spot) ?? null);
  }, following);
  const go = (/** @type {number} */ to) => {
    const n = $untrack(R, steps).length;
    if (to >= n) {
      props.onEnd?.();
      run.set(false);
      step.set(0);
      return;
    }
    step.set(Math.max(0, to));
  };
  const skip = () => {
    props.onSkip?.();
    run.set(false);
  };
  const shade = styled({}, theme => {
    const b = partOf(read(props.backdrop), true);
    return { position: 'absolute', background: alpha(b?.color ?? theme.black, b === null ? 0 : Number(b.opacity ?? theme.opacity.disabled)) };
  });
  const box = (/** @type {number} */ k) => () => {
    const h = $read(hole);
    const a = $read(area);
    const b = h === null ? { x: 0, y: 0, width: a.width, height: k === 0 ? a.height : 0 } : aroundHole(h, a.width, a.height)[k];
    return { ...shade(), left: b.x, top: b.y, width: b.width, height: b.height };
  };
  const ring = styled({}, (theme, scheme) => {
    const h = $read(hole) ?? { x: 0, y: 0, width: 0, height: 0 };
    return { position: 'absolute', left: h.x, top: h.y, width: h.width, height: h.height, border: 2, borderColor: theme.colors[theme.accent][scheme === 'dark' ? 4 : 6], radius: theme.radius.sm };
  });
  const card = styled({}, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    const h = $read(hole);
    const a = $read(area);
    const { card: cardWidth, room, center } = theme.sizes.box.onboarding;
    const width = Number(read(props.cardWidth) ?? cardWidth);
    const below = h === null || h.y + h.height + room <= a.height || h.y < room;
    const left = h === null ? Math.max(0, (a.width - width) / 2) : Math.max(0, Math.min(h.x, a.width - width));
    return {
      position: 'absolute',
      left,
      ...(h === null ? { top: Math.max(0, a.height / 2 - center) } : below ? { top: h.y + h.height + theme.spacing.xs } : { bottom: a.height - h.y + theme.spacing.xs }),
      width,
      direction: 'column',
      gap: theme.spacing.xs,
      padding: theme.spacing.md,
      background: page.body,
      color: page.text,
      radius: radiusOf(theme, 'md'),
      shadow: shadowOf(theme, 'md'),
      border: 1,
      borderColor: page.border,
      zIndex: 1,
    };
  });
  const text = (/** @type {any} */ v, /** @type {Record<string, any>} */ s) => (v == null ? null : textual(v) ? <Label text={v} style={{ wrap: true, ...s }} /> : v);
  const last = () => step.get() >= steps().length - 1;
  const style = styled(props, () => ({ position: 'relative', direction: 'column' }));
  return (
    <TourContext
      value={{
        register: (id, node) => {
          spots.set(id, node);
          $write(registered, $untrack(R, () => /** @type {number} */ ($read(registered))) + 1);
        },
      }}
    >
      <View
        {...pass(props)}
        ref={(/** @type {any} */ n) => {
          root = n;
          handOn(props.ref, n);
        }}
        onKey={(/** @type {any} */ e) => $untrack(R, started) && keyOf(e) === 'Escape' && (handled(e), skip())}
        onResize={following}
        style={style}
      >
        {props.children}
        <Show when={() => started() && current() !== null}>
          <View style={() => ({ position: 'absolute', inset: 0, zIndex: read(props.layer) ?? LAYERS.float })}>
            <View {...DECOR} style={box(0)} />
            <View {...DECOR} style={box(1)} />
            <View {...DECOR} style={box(2)} />
            <View {...DECOR} style={box(3)} />
            <Show when={() => $read(hole) !== null}>
              <View {...DECOR} style={ring} />
            </Show>
            <View role="dialog" aria-label={named(() => current()?.title)} style={card}>
              {() => {
                const title = current()?.title;
                return textual(title) ? <Label role="heading" aria-level={2} text={title} style={() => ({ wrap: true, fontWeight: ui.theme().weights.bold })} /> : text(title, { fontWeight: ui.theme().weights.bold });
              }}
              {() => text(current()?.content, {})}
              <View style={() => ({ direction: 'row', align: 'center', gap: ui.theme().spacing.xs, margin: [ui.theme().spacing.xs, 0, 0, 0] })}>
                <Label text={() => `${step.get() + 1} / ${steps().length}`} style={styled({}, (theme, scheme) => ({ grow: 1, color: pageColors(theme, scheme).quiet, fontSize: theme.fontSizes.xs }))} />
                <Button variant="ghost" size="xs" onPress={skip}>
                  {() => read(props.skipLabel) ?? labelsIn().skip}
                </Button>
                <Show when={() => step.get() > 0}>
                  <Button variant="neutral" size="xs" onPress={() => go($untrack(R, step.get) - 1)}>
                    {() => read(props.previousLabel) ?? labelsIn().back}
                  </Button>
                </Show>
                <Button size="xs" onPress={() => go($untrack(R, step.get) + 1)}>
                  {() => (last() ? (read(props.finishLabel) ?? labelsIn().finish) : (read(props.nextLabel) ?? labelsIn().next))}
                </Button>
              </View>
            </View>
          </View>
        </Show>
      </View>
    </TourContext>
  );
}

/** A spot of the tour around it: `id` (a step's `spot`), wrapping its children. @param {Record<string, any>} props */
export function OnboardingSpot(props) {
  const tour = $lookup(TourContext);
  return (
    <View ref={(/** @type {any} */ n) => tour?.register(String(read(props.id)), n)} style={styled(props, () => ({ self: 'start' }))}>
      {props.children}
    </View>
  );
}

Onboarding.Spot = OnboardingSpot;
