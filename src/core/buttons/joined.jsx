// Joined groups: a frame that holds buttons edge to edge. The frame draws
// the outer edge and the lines between its children and carries the
// corners; a child in it draws neither border nor radius.

import { View, For, read, $context, $lookup, $parts } from 'ren-core';
import { styled } from '../../theme/style.js';
import { pageColors, radiusOf, sized } from '../../theme/resolve.js';
import { pass } from '../layout/layout.jsx';

/** Whether a part is a direct child of a joined group. */
const InGroup = $context(false);

/** Whether the component calling it sits in a joined group (read once, where it is made). */
export const $joined = () => $lookup(InGroup) === true;

/** A grouped child's own edge: no border and square corners (the frame draws both). @param {boolean} joined */
export const joinedStyle = joined => (joined ? { border: 0, radius: 0 } : null);

/**
 * A grouped child's content, built outside the group, so a button inside
 * it is not grouped.
 * @param {any} content
 */
export const unjoined = content => <InGroup value={false}>{content}</InGroup>;

/**
 * A frame of children laid edge to edge: `orientation` ('horizontal', a
 * row, by default; or 'vertical', a column), `divider` (the thickness of
 * its edge and of the lines between children: a `theme.sizes.divider`
 * step or px; 'xs', 1 px, by default), `radius` (the frame's corners;
 * the theme's corner by default). The edge and lines are in the page's
 * `border` color; the frame clips its children to its corners, and each
 * child is stretched across the flow. The lines follow the children as
 * rendered: a line between two of a `For`'s items or an accessor's parts,
 * none for a `Show` showing nothing.
 * @param {Record<string, any>} props
 */
export function JoinedGroup(props) {
  const vertical = () => read(props.orientation) === 'vertical';
  const frame = styled(props, (theme, scheme) => ({
    direction: vertical() ? 'column' : 'row',
    align: 'stretch',
    self: 'start',
    gap: 0,
    border: sized(theme.sizes.divider, read(props.divider), 'xs'),
    borderColor: pageColors(theme, scheme).border,
    radius: radiusOf(theme, read(props.radius)),
    overflow: 'hidden',
  }));
  const line = styled({}, (theme, scheme) => {
    const thickness = sized(theme.sizes.divider, read(props.divider), 'xs');
    return { ...(vertical() ? { height: thickness } : { width: thickness }), self: 'stretch', shrink: 0, background: pageColors(theme, scheme).border };
  });
  return (
    <View {...pass(props)} style={frame}>
      <InGroup value={true}>
        <Joined line={line}>{props.children}</Joined>
      </InGroup>
    </View>
  );
}

/**
 * The group's children as rendered, built in the group (each knows it is
 * grouped), with a line between two.
 * @param {{ line: () => Record<string, any>, children?: any }} props
 */
function Joined(props) {
  return <For each={$parts(props.children)}>{(part, i) => [() => (i() > 0 ? <View style={props.line} /> : null), part]}</For>;
}
