// Shell: an application's frame (header, nav, main, side, footer) on
// a portable grid.

import { View, read, $context, $lookup } from 'ren-core';
import { styled } from '../../theme/style.js';
import { spacing, pageColors } from '../../theme/resolve.js';
import { pass } from './layout.jsx';
import { $ui } from '../../theme/theme.jsx';
import { $breakpoints, breakpointOf } from '../../theme/breakpoints.js';
import { LAYERS } from '../../theme/layers.js';

const ShellContext = $context(/** @type {Record<string, any>} */ ({}));

/** A size in pixels. @param {any} v @param {number} fallback */
const px = (v, fallback) => (typeof v === 'number' ? v : fallback);

/**
 * How the shell reads its props at the root's viewport width: whether it
 * is narrow (the width below `fold`, a theme breakpoint name or a length;
 * never without one), whether a part is there (its size given, not false),
 * whether `hide` hides a nav or side now ('narrow', 'wide', true or
 * false), and a part's size (pixels or a responsive object).
 * @param {Record<string, any>} props the Shell's props
 */
function $shell(props) {
  const bp = $breakpoints();
  const ui = $ui();
  const narrow = () => {
    const at = read(props.fold);
    return at != null && bp.width() < breakpointOf(ui.theme(), at);
  };
  /** @param {string} name */
  const present = name => {
    const v = read(props[name]);
    return v != null && v !== false;
  };
  return {
    narrow,
    present,
    /** @param {'nav' | 'side'} name */
    hidden: name => {
      if (!present(name)) return true;
      const h = read(read(props.hide)?.[name]);
      return h === true || (h === 'narrow' && narrow()) || (h === 'wide' && !narrow());
    },
    /** @param {string} name @param {number} fallback */
    size: (name, fallback) => {
      const v = read(props[name]);
      return px(bp.at(v === true ? undefined : v, ui.theme()), fallback);
    },
  };
}

/**
 * An application frame: `header` and `footer` (their heights, 56 for
 * `true`), `nav` and `side` (their widths, 280 for `true`), `fold` (a
 * theme breakpoint name or a length: below it, against the root's viewport,
 * the shell is narrow and a nav or side lies over Main at the whole width),
 * `hide` (`{ nav, side }`, each 'narrow', 'wide', true or false: when to
 * hide it), `padding` (Main's), `bordered` (true). Sizes take pixels or
 * the responsive object form. Children are Shell.Header, Nav, Main, Side,
 * Footer. It fills its parent's height.
 * @param {Record<string, any>} props
 */
export function Shell(props) {
  const shell = $shell(props);
  const style = styled(props, (theme, scheme) => {
    const column = (/** @type {'nav' | 'side'} */ name) => (shell.hidden(name) || shell.narrow() ? 0 : shell.size(name, 280));
    const bar = (/** @type {'header' | 'footer'} */ name) => (shell.present(name) ? shell.size(name, 56) : 0);
    return {
      display: 'grid',
      columns: `${column('nav')}px minmax(0, 1fr) ${column('side')}px`,
      rows: `${bar('header')}px minmax(0, 1fr) ${bar('footer')}px`,
      height: '100%',
      background: pageColors(theme, scheme).body,
      color: pageColors(theme, scheme).text,
    };
  });
  return (
    <ShellContext value={props}>
      <View {...pass(props)} style={style}>
        {props.children}
      </View>
    </ShellContext>
  );
}

/**
 * One part of the frame, its line along its inner edge a border on that
 * side (`bordered`, true by default), and the landmark it is (`banner`,
 * `navigation`, `complementary`, `contentinfo`).
 * @param {Record<string, any>} props @param {{ column: any, row: any, side: 'Top' | 'Right' | 'Bottom' | 'Left', part?: 'nav' | 'side', role: string }} place its grid lines, the side of its line and its landmark
 */
function part(props, place) {
  const shell = /** @type {Record<string, any>} */ ($lookup(ShellContext));
  const view = $shell(shell);
  const hidden = () => place.part !== undefined && view.hidden(place.part);
  // When narrow a nav or side lies over Main at the whole width.
  const narrow = () => place.part !== undefined && view.narrow();
  const style = styled(props, (theme, scheme) => ({
    column: narrow() ? '1 / 4' : place.column,
    row: place.row,
    direction: 'column',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    ...(narrow() ? { zIndex: LAYERS.raised, background: pageColors(theme, scheme).body } : null),
    ...(read(shell.bordered) === false || narrow() ? null : { [`border${place.side}`]: 1, borderColor: pageColors(theme, scheme).rule }),
  }));
  return (
    <View role={place.role} {...pass(props)} hidden={hidden} style={style}>
      {props.children}
    </View>
  );
}

/** The top bar. @param {Record<string, any>} props */
function ShellHeader(props) {
  return part(props, { column: '1 / 4', row: 1, side: 'Bottom', role: 'banner' });
}
/** The start column (collapsible). @param {Record<string, any>} props */
function ShellNav(props) {
  return part(props, { column: 1, row: 2, side: 'Right', part: 'nav', role: 'navigation' });
}
/** The end column (collapsible). @param {Record<string, any>} props */
function ShellSide(props) {
  return part(props, { column: 3, row: 2, side: 'Left', part: 'side', role: 'complementary' });
}
/** The bottom bar. @param {Record<string, any>} props */
function ShellFooter(props) {
  return part(props, { column: '1 / 4', row: 3, side: 'Top', role: 'contentinfo' });
}
/** The content, padded by the shell's `padding`: the `main` landmark. @param {Record<string, any>} props */
function ShellMain(props) {
  const shell = /** @type {Record<string, any>} */ ($lookup(ShellContext));
  const style = styled(props, theme => ({ column: 2, row: 2, direction: 'column', minWidth: 0, minHeight: 0, padding: read(shell.padding) == null ? 0 : spacing(theme, read(shell.padding)) }));
  return (
    <View role="main" {...pass(props)} style={style}>
      {props.children}
    </View>
  );
}
/** A part of a Nav or Side: `fill` takes the space left. @param {Record<string, any>} props */
function ShellSection(props) {
  return (
    <View {...pass(props)} style={styled(props, () => ({ direction: 'column', ...(read(props.fill) ? { grow: 1, minHeight: 0 } : { shrink: 0 }) }))}>
      {props.children}
    </View>
  );
}

Shell.Header = ShellHeader;
Shell.Nav = ShellNav;
Shell.Side = ShellSide;
Shell.Footer = ShellFooter;
Shell.Main = ShellMain;
Shell.Section = ShellSection;
