# TODO

Open work for rui-core.

## A choice's label and description do not wrap in a narrow container

`Switch`, `Checkbox` and `Radio` lay their label, description and error out
in a column (`body` in `src/core/inputs/choice.jsx`) beside the box, inside
the pressable row. That column neither shrinks nor has `minWidth: 0`, so in a
container narrower than its text the text keeps its one line and runs past
the container instead of wrapping (the page then scrolls sideways).

Repro: a `Switch` with `label="New users may create accounts"` and a
description of about 70 characters, inside a `Stack` 360px wide (fiman's
Administration › Settings at 390px, in Portuguese: "Uma conta nova aguarda um
administrador confirmá-la em Cadastros."). Expected: the description wraps
under the label within the 360px; seen: it is cut at the right edge and the
page scrolls sideways.
