// The frame every round chart draws in: its Shape and text, the pointer
// area, the tooltip and the legend.

import { View, Shape, Show, $active, $signal, $read, $write, read } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { styled } from '../../theme/style.js';
import { chartColors, Placed, Legend, Tip, pointIn, rootProps, ChartData, datasetOf, legendAt, LEGEND_AT, $chartInsets } from './shared.jsx';
import { partOf } from '../../core/overlays/shared.jsx';

/** @typedef {import('./path.js').Figure} Figure */
/** @typedef {import('./shared.jsx').Placed} PlacedText */
/** @typedef {import('./shared.jsx').TooltipModel} TooltipModel */

/**
 * A round chart's frame: a box of `width` by `height` holding its Shape and
 * text, a pointer area over it, the tooltip, and a legend. Its box is the
 * chart's `ref` (`o.ref`, a chart that measures its box, hands it on).
 * @param {{ props: Record<string, any>, kind: import('./shared.jsx').ChartKind, model: () => { figures: Figure[], labels: PlacedText[], width: number, height: number }, hit: (x: number, y: number) => TooltipModel | null, legend?: () => import('./shared.jsx').LegendItem[], legendOn?: () => boolean, tooltip: boolean, center?: any, onResize?: (box: { width: number, height: number }) => void, ref?: (node: any) => void, rootWidth?: any }} o
 */
export function Frame(o) {
  const R = $active();
  const ui = $ui();
  const tip = $signal(R, /** @type {TooltipModel | null} */ (null));
  const colors = () => chartColors(ui.theme(), ui.scheme());
  const legendOf = () => (o.legend === undefined ? null : partOf(read(o.props.legend), o.legendOn?.() ?? false));
  const legendShown = () => legendOf() !== null;
  const place = () => legendAt(legendOf(), LEGEND_AT);
  // Sized by its drawing, its box is the drawing and its own padding and border (a width is a border box).
  const inset = $chartInsets(o.props);
  const style = styled(o.props, () => ({ width: o.rootWidth ?? o.model().width + inset().left + inset().right, direction: 'column', align: 'center' }));
  // One legend, at the top or the bottom and along it by `at`; 'bottom-start' by default.
  const legend = <Legend items={() => (o.legend === undefined ? [] : o.legend())} justify={() => legendAt(read(o.props.legend) ?? null, LEGEND_AT).justify} />;
  return (
    <View {...rootProps(o.props, o.kind)} ref={o.ref ?? o.props.ref} onResize={o.onResize} style={style}>
      <Show when={() => legendShown() && !place().bottom}>{legend}</Show>
      <View
        style={() => ({ position: 'relative', width: o.model().width, height: o.model().height, shrink: 0 })}
        onPointerMove={o.tooltip ? (/** @type {any} */ event) => $write(tip, o.hit(...pointIn(event))) : undefined}
        onPointerLeave={o.tooltip ? () => $write(tip, null) : undefined}
      >
        <Shape shapes={() => o.model().figures} style={() => ({ position: 'absolute', left: 0, top: 0, width: o.model().width, height: o.model().height })} />
        <Placed items={() => o.model().labels} color={() => colors().text} />
        {o.center ?? null}
        <Show when={() => $read(tip) !== null}>
          <Tip tip={() => /** @type {TooltipModel} */ ($read(tip) ?? { label: '', rows: [], at: {} })} />
        </Show>
      </View>
      <Show when={() => legendShown() && place().bottom}>{legend}</Show>
      <ChartData of={() => datasetOf(o.props)} />
    </View>
  );
}
