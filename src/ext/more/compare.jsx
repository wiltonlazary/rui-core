// Compare: two pictures (or any content) over each other, the first shown
// up to a slider the pointer drags (with pointer capture), hovers or the
// keys move.

import { View, Image, Action, Shape, read, $active, $untrack } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { styled } from '../../theme/style.js';
import { colorOf, pageColors, radiusOf, shadowOf } from '../../theme/resolve.js';
import { pass } from '../../core/layout/layout.jsx';
import { $controlled, keyOf } from '../../core/overlays/shared.jsx';
import { $width, pointOf, boxOf, capture, clamp } from './shared.js';
import { bordersOf } from '../../core/misc/tween.js';
import { DECOR } from '../../theme/meaning.js';


/**
 * An image comparison slider: `before` and `after`, the first shown up
 * to the slider and the second under it, each an image source (a string)
 * or any content, with `beforeLabel` and `afterLabel` (the images' names:
 * 'Before', 'After'); `value` + `onChange` or `defaultValue` (50:
 * percent of the first shown); `orientation` ('horizontal' or
 * 'vertical'); `mode` ('drag': a press and drag moves it; 'hover': the
 * pointer over it; 'fixed': only the keys); `handle` (true: a knob as wide
 * as a small control, `sizes.control.sm`), `color`
 * ('white'), `step` (1; Shift moves 10),
 * `w`, `h` (`sizes.box.stage`, 200), `radius`. The slider is an Action labeled 'Compare',
 * a `slider` of the percent shown (0 to 100)
 * (ArrowLeft/Right or Up/Down, Home, End). `handle` false drops the knob and
 * its keyboard slider: the pointer alone moves it, and with 'fixed' nothing does.
 * @param {Record<string, any>} props
 */
export function Compare(props) {
  const R = $active();
  const ui = $ui();
  const size = $width(props);
  const state = $controlled(props, 'value', 'defaultValue', 50, v => props.onChange?.(v));
  const vertical = () => read(props.orientation) === 'vertical';
  const mode = () => read(props.mode) ?? 'drag';
  const value = () => clamp(Number(state.get()), 0, 100);
  const set = (/** @type {number} */ v) => {
    const next = Math.round(clamp(v, 0, 100) * 100) / 100;
    if (next !== $untrack(R, value)) state.set(next);
  };
  /** @type {any} */
  let region = null;
  let dragging = false;
  // The sections, the divider and the knob sit inside its border: the pointer maps onto that box.
  const border = () => bordersOf(style());
  const follow = (/** @type {any} */ e) => {
    const p = pointOf(e);
    const o = boxOf(region);
    const s = $untrack(R, border);
    const b = { x: o.x + s.left, y: o.y + s.top, width: o.width - s.left - s.right, height: o.height - s.top - s.bottom };
    const along = vertical() ? (b.height > 0 ? (p.y - b.y) / b.height : 0) : b.width > 0 ? (p.x - b.x) / b.width : 0;
    set(along * 100);
  };
  const onPointerDown = (/** @type {any} */ e) => {
    if (mode() !== 'drag' || (e?.button ?? 0) !== 0) return;
    dragging = true;
    capture(e);
    e?.preventDefault?.();
    follow(e);
  };
  const onPointerMove = (/** @type {any} */ e) => {
    if (dragging || mode() === 'hover') follow(e);
  };
  const onPointerUp = () => {
    dragging = false;
  };
  const onKey = (/** @type {any} */ e) => {
    const k = keyOf(e);
    const step = Number(read(props.step) ?? 1) * (e?.shiftKey ? 10 : 1);
    const less = vertical() ? 'ArrowUp' : 'ArrowLeft';
    const more = vertical() ? 'ArrowDown' : 'ArrowRight';
    const now = $untrack(R, value);
    const to = k === less ? now - step : k === more ? now + step : k === 'Home' ? 0 : k === 'End' ? 100 : NaN;
    if (Number.isNaN(to)) return;
    e?.preventDefault?.();
    set(to);
  };
  const height = () => read(props.h) ?? ui.theme().sizes.box.stage;
  const side = (/** @type {any} */ content, /** @type {string} */ alt) =>
    typeof content === 'string' ? <Image source={content} label={alt} style={{ width: '100%', height: '100%' }} /> : content;
  const clip = /** @returns {Record<string, any>} */ () => (vertical() ? { position: 'absolute', left: 0, top: 0, right: 0, height: `${value()}%`, overflow: 'hidden' } : { position: 'absolute', left: 0, top: 0, bottom: 0, width: `${value()}%`, overflow: 'hidden' });
  // The first section keeps the full box inside its clip (it is cut, not squeezed).
  const inner = /** @returns {Record<string, any>} */ () => (vertical() ? { position: 'absolute', left: 0, top: 0, right: 0, height: typeof height() === 'number' ? Math.max(0, height() - border().top - border().bottom) : '100%' } : { position: 'absolute', left: 0, top: 0, bottom: 0, width: Math.max(0, (size.width() || 0) - border().left - border().right) });
  const line = /** @returns {Record<string, any>} */ () => {
    const theme = ui.theme();
    const c = colorOf(theme, ui.scheme(), read(props.color) ?? 'white');
    return vertical()
      ? { position: 'absolute', left: 0, right: 0, top: `${value()}%`, height: 2, margin: [-1, 0, 0, 0], background: c, zIndex: 1 }
      : { position: 'absolute', top: 0, bottom: 0, left: `${value()}%`, width: 2, margin: [0, 0, 0, -1], background: c, zIndex: 1 };
  };
  // The knob: a circle as wide as a small control (sizes.control.sm),
  // big enough to grab, centered on the divider.
  const knob = styled({}, (theme, scheme) => {
    const c = colorOf(theme, scheme, read(props.color) ?? 'white');
    const side = theme.sizes.control.sm;
    return {
      position: 'absolute',
      width: side,
      height: side,
      minHeight: side,
      padding: 0,
      radius: theme.radius.round,
      background: c,
      border: 0,
      shadow: shadowOf(theme, 'sm'),
      align: 'center',
      justify: 'center',
      zIndex: 2,
      cursor: vertical() ? 'ns-resize' : 'ew-resize',
      ...(vertical() ? { left: '50%', top: `${value()}%`, margin: [-side / 2, 0, 0, -side / 2] } : { top: '50%', left: `${value()}%`, margin: [-side / 2, 0, 0, -side / 2] }),
    };
  });
  const grip = () => {
    // The knob is light (white by default) in either scheme: the light page's quiet text on it.
    const c = pageColors(ui.theme(), 'light').quiet;
    return vertical()
      ? [{ kind: 'path', closed: true, points: [4, 5, 8, 1, 12, 5], color: c }, { kind: 'path', closed: true, points: [4, 11, 12, 11, 8, 15], color: c }]
      : [{ kind: 'path', closed: true, points: [5, 4, 1, 8, 5, 12], color: c }, { kind: 'path', closed: true, points: [11, 4, 15, 8, 11, 12], color: c }];
  };
  const style = styled(props, theme => ({ position: 'relative', overflow: 'hidden', height: height(), radius: radiusOf(theme, read(props.radius) ?? 0), cursor: mode() === 'drag' ? (vertical() ? 'ns-resize' : 'ew-resize') : undefined, ...(mode() === 'drag' ? { touchAction: vertical() ? 'pan-x pinch-zoom' : 'pan-y pinch-zoom' } : null) }));
  return (
    <View
      {...pass(props)}
      ref={(/** @type {any} */ n) => {
        region = n;
        size.ref(n);
      }}
      onResize={size.onResize}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={style}
    >
      <View style={{ position: 'absolute', inset: 0 }}>{side(props.after, read(props.afterLabel) ?? 'After')}</View>
      <View style={clip}>
        <View style={inner}>{side(props.before, read(props.beforeLabel) ?? 'Before')}</View>
      </View>
      <View style={line} />
      {read(props.handle) === false ? null : (
        <Action label="Compare" role="slider" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-orientation={() => (vertical() ? 'vertical' : 'horizontal')} onKey={onKey} style={knob}>
          <Shape {...DECOR} shapes={grip} style={() => ({ width: ui.theme().sizes.glyph.md, height: ui.theme().sizes.glyph.md })} />
        </Action>
      )}
    </View>
  );
}
