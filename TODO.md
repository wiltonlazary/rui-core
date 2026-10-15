# TODO

Open work for rui-core.

- [ ] EmptyState's note overflows a narrow container: EmptyState.Note caps
  its width at `theme.sizes.box.empty` but not at the room it is in, and
  the column (aligned to the start) does not stretch it, so a note longer
  than one line in a container narrower than that cap runs past the edge
  and the page scrolls sideways. Repro: at 390 px wide, in a
  `Container` with `px="md"`, `<EmptyState heading="No tags yet"
  note="Crie uma com Nova tag: seus livros-caixa podem usá-la." />`: the
  note does not wrap. Done when the note wraps within its container (its
  width at most the cap and at most the room), with a test at that width
  on the DOM renderer.
