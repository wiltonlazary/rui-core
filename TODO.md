# TODO

Open work for rui-core.

- [ ] A button whose text changes with a state cannot keep one width: an
  app toggling Delete / Restore or Disable / Enable on list items sets a
  guessed `minWidth` in pixels (fiman uses 96) so the other actions do
  not move, and a longer word in another language (Portuguese
  'Desativar', Spanish 'Restaurar') or another font size breaks it.
  Wanted: Button takes the alternative
  texts it may show (for example `reserve={['Delete', 'Restore']}`) and
  keeps the width of the widest, measured in its own font, following a
  change of the texts (a language switch). Repro: two Buttons side by
  side, the first's text switching between 'Ativar' and 'Desativar' with
  no `minWidth`: the second moves. Done when, with the texts reserved,
  the second does not move, with a test on the DOM renderer.
