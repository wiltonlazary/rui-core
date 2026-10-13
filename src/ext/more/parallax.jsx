// Parallax: layers that move by their depth with the pointer over the
// region, or with a Scroll's offset, and tilt with the pointer; moved by
// the portable transforms (painted, never laid out again).

import { View, Scroll, read, $active, $signal, $read, $write, $context, $lookup } from 'ren-core';
import { styled } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { pass } from '../../core/layout/layout.jsx';
import { pointOf, boxOf, clamp } from './shared.js';
import { handOn } from '../../core/ref.js';

/** The region's offset: the pointer's (-1 to 1 each way) or the scroll's (px). */
const ParallaxContext = $context(/** @type {{ at: () => { x: number, y: number }, scroll: boolean, strength: () => number, tilt: () => number } | null} */ (null));

/**
 * A layer's move at an offset: against the pointer by `depth * strength`
 * px at the edges, or `depth` times the scroll (1 stays put in view, 0
 * scrolls with the content).
 * @param {{ x: number, y: number }} at @param {number} depth @param {boolean} scroll @param {number} strength
 */
export function layerOffset(at, depth, scroll, strength) {
  if (scroll) return { x: 0, y: at.y * depth };
  return { x: -at.x * depth * strength, y: -at.y * depth * strength };
}

/**
 * A parallax region: `source` ('pointer': the layers move against the
 * pointer; 'scroll': the region scrolls and the layers move by their
 * depth), `strength` (px at the edge, pointer: spacing lg, 24), `h` (its height),
 * `contentHeight` (scroll: the scrolled height, twice `h` by default),
 * `resetOnLeave` (true), `onOffsetChange`, `tilt` (pointer: degrees a
 * layer of depth 1 turns at the left and right edges, 0 by default: the
 * nearer a layer, the more it turns). `Parallax.Layer` children
 * (`depth`, 0 to 1) are placed absolutely by their style's `top` and `left` (px); other
 * children flow as usual.
 * @param {Record<string, any>} props
 */
export function Parallax(props) {
  const R = $active();
  const ui = $ui();
  const at = $signal(R, { x: 0, y: 0 });
  const scroll = read(props.source) === 'scroll';
  /** @type {any} */
  let node = null;
  const set = (/** @type {{ x: number, y: number }} */ p) => {
    $write(at, p);
    props.onOffsetChange?.(p);
  };
  const onPointerMove = (/** @type {any} */ e) => {
    const p = pointOf(e);
    const b = boxOf(node);
    if (b.width <= 0 || b.height <= 0) return;
    set({ x: clamp(((p.x - b.x) / b.width) * 2 - 1, -1, 1), y: clamp(((p.y - b.y) / b.height) * 2 - 1, -1, 1) });
  };
  const ctx = { at: () => /** @type {{ x: number, y: number }} */ ($read(at)), scroll, strength: () => Number(read(props.strength) ?? ui.theme().spacing.lg), tilt: () => Number(read(props.tilt) ?? 0) };
  const ref = (/** @type {any} */ n) => {
    node = n;
    handOn(props.ref, n);
  };
  if (scroll) {
    const h = () => read(props.h) ?? ui.theme().sizes.box.parallax;
    return (
      <ParallaxContext value={ctx}>
        <Scroll {...pass(props)} ref={ref} onScroll={() => set({ x: 0, y: Number(node?.scrollTop ?? 0) })} style={styled(props, () => ({ height: h() }))}>
          <View style={() => ({ position: 'relative', height: read(props.contentHeight) ?? Number(h()) * 2, shrink: 0, overflow: 'hidden' })}>{props.children}</View>
        </Scroll>
      </ParallaxContext>
    );
  }
  return (
    <ParallaxContext value={ctx}>
      <View
        {...pass(props)}
        ref={ref}
        onPointerMove={onPointerMove}
        onPointerLeave={() => read(props.resetOnLeave) !== false && set({ x: 0, y: 0 })}
        style={styled(props, () => ({ position: 'relative', overflow: 'hidden' }))}
      >
        {props.children}
      </View>
    </ParallaxContext>
  );
}

/**
 * A layer of a Parallax: `depth` (0.5); its `style` places and sizes it
 * (`top` and `left`, 0 by default, px; the region's size by default),
 * and the region's offset moves (`translate`) and tilts (`rotate`) it
 * from there.
 * @param {Record<string, any>} props
 */
export function ParallaxLayer(props) {
  const ctx = $lookup(ParallaxContext);
  const style = styled({ ...props, style: undefined }, theme => {
    const own = /** @type {Record<string, any>} */ (read(props.style) ?? {});
    const at = ctx?.at() ?? { x: 0, y: 0 };
    const depth = Number(read(props.depth) ?? 0.5);
    const scroll = ctx?.scroll ?? false;
    const d = layerOffset(at, depth, scroll, ctx?.strength() ?? theme.spacing.lg);
    const turn = scroll ? 0 : Math.round(at.x * depth * (ctx?.tilt() ?? 0) * 100) / 100;
    return { width: '100%', height: '100%', ...own, position: 'absolute', top: Number(own.top ?? 0), left: Number(own.left ?? 0), translate: [d.x + 0, d.y + 0], ...(turn === 0 ? null : { rotate: turn }) };
  });
  return (
    <View {...pass(props)} style={style}>
      {props.children}
    </View>
  );
}

Parallax.Layer = ParallaxLayer;
