# Slice 7 proof record, loader

This folder holds the evidence that each acceptance test is a contract,
as `../ncc-slice-7.md` describes. The method is the one slice 6 used.

- `stub-run.log` is the suite with every `skip` removed, run against
  this branch's stubs: 92 tests, 83 fail. Of the 9 that pass, two are
  the empty passes `node --test` reports for the fixtures and the
  compile-only file. Four check final code: `getContainer`,
  `BaseInitializer`, `LoaderException` and the package's exports.
  Three check an absence, which the stubs meet by doing nothing: a
  bootstrapper with no initializers, and an empty list of class
  definitions or event bindings loading with nothing bound. The mutations below
  show each absence test failing when the absence breaks.
- `mutate.py` runs the suite once per mutation in `mutations.py` and
  writes `mutations.log`. A mutation counts as caught when the suite
  exits non-zero. Each entry names the guard it breaks and lists the
  tests that went red. The run holds 106 entries, three of them
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
malformed-answer tests gained those cases. The first audit round then
moved the contract closer to PHPNomad: strategies resolve where
PHPNomad resolves them, wrong shapes are unwrapped `TypeError`s, and
`LoaderException` carries PHPNomad's message. The scratch
implementation, the tests and this list changed with it, and the run
in `mutations.log` is the one after those changes and after the second
round. That round fixed how a handler class is told apart from a plain
listener, and added tests for a load that fails partway: nothing is
rolled back, a second `load()` fails at the first duplicate, and a
strategy that throws mid-list leaves the earlier entries attached.
