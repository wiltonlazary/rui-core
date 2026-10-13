# rui-core

Read the workspace layer first: `../../../AGENTS.md` and
`../../../.ai/config/` (stability.md first). Then [README.md](README.md)
and [TODO.md](TODO.md).

rui-core is rui's complete set of components and extensions; rui-show
shows them.

- rui-core is built only on ren-core's public entries (the portable
  primitives `View`, `Layout`, `Scroll`, `Label`, `Edit`, `Action`,
  `Image`, `Shape`, the portable `style`, `Portal`, the control flow) and
  rrx-core. It never imports a renderer, and never uses a DOM tag, so every
  component renders the same on ren-dom, ren-skia and ren-three, alone or
  mixed, style included.
- What a component needs and the primitives lack (a style property, a
  measurement, an input behavior) is a gap in ren-core or ren-canv: it lands
  there first, with their tests, never as a workaround here.
- No third-party dependencies: charts, carousel, dates, drag and drop and
  the rest are written here on the primitives.
- Components take plain props (`Button variant="soft" color="teal"`),
  with values that may be accessors or signals. Hooks are rrx-core
  operations named with `$` and a word or two (`$open`, `$treeState`).
- Every public name follows the conventions in README.md: presses are
  `onPress` only; any state `x` is `x`, `defaultX`, `onXChange` (`open`,
  `onOpenChange`); sides are `start`/`end`, placement `at`; part props take
  `false`, `true`, a node or options; parts are reached as `Parent.Part`
  only; no aliases.
- Spelling is American in every text, label, doc and comment (color,
  behavior, gray). Defaults come from the theme's scales (spacing, palette,
  `MOTION`, `LAYERS`); README's Theme and Defaults list them.
- Components take their colors
  from the theme's roles (`pageColors`: `body`, `text`, `quiet`, `sunken`,
  `raised`, `track`, `stripe`, `edge`, …) or `TINTS`, never a gray or
  night shade; only `src/theme/resolve.js` maps roles to shades, and a
  test in `test/misc.test.jsx` enforces it.
- Every component style number reads a theme token: `opacity`, `weights`,
  `ratios`, `control`, `chart`, `radius.round`, and the spacing, type and
  leading scales, with `fontBelow` for smaller notes; never an inline
  literal for an opacity, weight, leading, size ratio, padding, gap or pill
  radius. `test/tokens.test.js` enforces it (literals inside
  expressions, decimal ratios, alpha() and '#rrggbbaa' opacities, font
  sizes, stacking orders, `duration` defaults through MOTION, hidden
  tables; size tables keyed by step live in `theme.sizes`); a line of
  drawing math may carry `// geometry: <reason>` and a loop period
  `// cycle: <reason>`, kept few.
- Every hook returns one handle, one object per hook with its state as
  `value` and verbs for commands: `const menu = $open(false); menu.value;
  menu.toggle()`, typed as `…Handle`.
- Every component has a test that renders it on the DOM and on Skia
  (`test/harness.jsx`: `both(view)`) and checks the same text, the same
  presses and, where it has state, the same state.
- Its exports are locked by `test/exports.lock.json`; `scripts/lock.mjs`
  regenerates it for requested additions only. Install rrx-core, ren-core,
  ren-canv, ren-dom, ren-json and ren-skia first.
