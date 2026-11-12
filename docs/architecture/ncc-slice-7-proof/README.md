# Slice 7 proof record, loader

This folder holds the evidence that each acceptance test is a contract,
as `../ncc-slice-7.md` describes. The method is the one slice 6 used.

- `stub-run.log` is the suite with every `skip` removed, run against
  this branch's stubs: 87 tests, 76 fail. The 11 that pass check final
  code (`getContainer`, `BaseInitializer`, `LoaderException`) or an
  absence, such as an empty list resolving no strategy, which the stubs
  meet by doing nothing. The mutations below show each of those
  absence tests failing when the absence breaks.
- `mutate.py` runs the suite once per mutation in `mutations.py` and
  writes `mutations.log`. A mutation counts as caught when the suite
  exits non-zero. Each entry names the guard it breaks and lists the
  tests that went red. The run holds 93 entries, three of them
  controls, and ends with zero mismatches.
- `types-mutate.py` does the same for the compile-only test,
  `test/loader-type-safety.ts`, from `type-mutations.py` into
  `type-mutations.log`. Each loosening must leave exactly its own
  `@ts-expect-error` lines unused. All 12 directives are covered, and
  the run ends with zero mismatches.

Every run starts with three controls: a break the harness must catch,
a comment it must not, and a syntax error it must refuse to score.

`mutations.py` targets a scratch implementation in a separate clone
that is never committed, so its find texts do not apply to this
branch's stubs. `type-mutations.py` targets the final interfaces, which
are on this branch, so anyone can rerun it here:

```
python3 docs/architecture/ncc-slice-7-proof/types-mutate.py . test/loader-type-safety.ts docs/architecture/ncc-slice-7-proof/type-mutations.py
```

The first full run found four guards no test caught: a pair with a
third item in event bindings and task handlers, a pair-shaped object
that is not an array, and a `Set` answered where a list belongs. The
malformed-answer tests gained those cases, and the run in
`mutations.log` is the one after that change.
