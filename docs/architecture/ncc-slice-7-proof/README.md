# Slice 7 proof record, loader

This folder holds the evidence that each acceptance test is a contract,
as `../ncc-slice-7.md` describes. The method is the one slice 6 used.
`mutate.py` runs the suite once per mutation in a list and writes a
log. A mutation counts as caught when the suite exits non-zero, and
each entry names the guard it breaks and lists the tests that went
red. Every run starts with three controls: a break the harness must
catch, a comment it must not, and a syntax error it must refuse to
score. Every log here ends with zero mismatches.

## Architecture, before P1

- `stub-run.log` is the suite with every `skip` removed, run against
  the architecture stubs: 92 tests, 83 fail. Of the 9 that passed, two
  are the empty passes `node --test` reports for the fixtures and the
  compile-only file. Four checked final code: `getContainer`,
  `BaseInitializer`, `LoaderException` and the package's exports.
  Three checked an absence, which the stubs met by doing nothing: a
  bootstrapper with no initializers, and an empty list of class
  definitions or event bindings loading with nothing bound.
  `mutations.log` shows each absence test failing when the absence
  breaks.
- `mutations.py` and `mutations.log`: 106 entries, three of them
  controls, against a scratch implementation in a separate clone that
  is never committed. Its find texts do not apply to this branch.
- `types-mutate.py`, `type-mutations.py` and `type-mutations.log`: the
  same method for the compile-only test, `test/loader-type-safety.ts`.
  Each loosening must leave exactly its own `@ts-expect-error` lines
  unused. All 12 directives are covered. The list targets the final
  interfaces, so it reruns on this branch:

```
python3 docs/architecture/ncc-slice-7-proof/types-mutate.py . test/loader-type-safety.ts docs/architecture/ncc-slice-7-proof/type-mutations.py
```

The first architecture run found four guards no test caught, and the
tests gained those cases. The two audit rounds then moved the contract
closer to PHPNomad and pinned the handler-class rule and the partial
load, and `mutations.log` is the run after those changes.

## Implementation, P1 and the review

- `p1-mutations.py` and `p1-mutations.log`: packet P1's list, 123
  entries, against the committed `Bootstrapper`, type guards and shape
  helpers. It reruns on this branch:

```
python3 docs/architecture/ncc-slice-7-proof/mutate.py . docs/architecture/ncc-slice-7-proof/p1-mutations.py
```

- `review-spot-mutations.py` and its log: the slice 7 review's spot
  check of the committed code, chosen where the reviewer wanted a
  second look.
- `review-fix-mutations.py` and its log: the review's proof that only
  the unit test it added catches a step 4 that keeps the action
  binding strategy after its first pair.

## P4, the step 3 ruling

- `p4-stub-run.log` is the suite with the two P4 tests unskipped, run
  against this branch's step 3: 102 tests, 2 fail, and both are the P4
  tests. The first fails because the container's error does not name
  `getClassDefinitions`. The second fails on its first case, a later
  pair with no abstract, for the same reason. Its duplicate cases
  would fail on the pairs bound before the bad one.
- `p4-architecture-mutations.py` and its log: 15 entries, three of
  them controls, against a scratch P4 in a separate clone that is
  never committed. The scratch passes all 102 tests. Each of the 12
  mutations breaks one check in the ruling, or the error it raises,
  and each is caught by a P4 test.

## P4, the implementation

- `p4-mutations.py` and `p4-mutations.log`: packet P4's list, 27
  entries, three of them controls, against the committed step 3 and
  the `abstractKey` helper. Each P4 entry breaks one check of the
  ruling, the order of checking before binding, or the error a check
  raises, and a P4 acceptance test catches each. The U entries guard
  the unit tests in `test/step3-abstracts.test.ts`: the reason each
  `DuplicateBindingError` carries, and the key the check compares
  abstracts by. It reruns on this branch:

```
python3 docs/architecture/ncc-slice-7-proof/mutate.py . docs/architecture/ncc-slice-7-proof/p4-mutations.py
```

- P4 puts the abstract check between step 3's shape check and its
  binds, which moved the find text of one entry in each of two lists:
  D9 in `p1-mutations.py` and V1 in `review-spot-mutations.py`. Both
  now include the check's line, and both still break the same guard.
  `p1-mutations.p4-rerun.log` and `review-spot-mutations.p4-rerun.log`
  are the reruns on the P4 code, each with zero mismatches.
