# Packet P4: the step 3 ruling, one mutation per check, against the
# committed Bootstrapper and the abstractKey helper on this branch.
# Each entry is (id, file, find, replace, expect). The first three are
# the harness controls. U entries guard the unit tests in
# test/step3-abstracts.test.ts. Run with:
#   python3 docs/architecture/ncc-slice-7-proof/mutate.py . docs/architecture/ncc-slice-7-proof/p4-mutations.py
B = 'src/Bootstrapper.ts'
S = 'src/shapes.ts'
CALL = "      this.checkAbstracts(answer as ReadonlyArray<readonly [abstract new (...args: any[]) => object, unknown]>);\n"
EMPTY_IF = "      if (listed.length === 0) {\n"
EMPTY = "        throw new DiException(`getClassDefinitions() entry ${index} binds ${concrete.name} to no abstract.`);\n"
KIND_IF = "        if (key === undefined) {\n"
KIND_MSG = "binds ${concrete.name} to ${describeValue(abstract)}, which is not"
SEEN_IF = "        if (seen.has(key)) {\n"
REPEATED = "          throw new DuplicateBindingError(name, 'repeated');\n"
HELD_IF = "        if (this.container.has(key as Token)) {\n"
HELD = "          throw new DuplicateBindingError(name, 'bound');\n"
SEEN_ADD = "        seen.add(key);\n"
RECORD_IF = "        if (this.container.has(token)) {\n"
RECORD = "          throw new DuplicateBindingError(token, 'bound');\n"
SHAPE_LOOP_HEAD = "    if (Array.isArray(answer)) {\n      for (const [index, pair] of answer.entries()) {\n"
NAME = "        const name = typeof key === 'string' ? key : key.name;\n"
KEY_CLASS = "  if (isConstructable(value) || typeof value === 'string') {\n    return value;\n  }\n"
KEY_TOKEN = "    return (value as { name: string }).name;\n"
KEY_TOKEN_IF = "  if (value !== null && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string') {\n"
RECORD_LOOPS = (
    "      for (const token of Object.keys(answer)) {\n"
    "        if (this.container.has(token)) {\n"
    "          throw new DuplicateBindingError(token, 'bound');\n"
    "        }\n"
    "      }\n"
    "      for (const [token, factory] of Object.entries(answer)) {\n"
    "        container.bind(token, factory);\n"
)
RECORD_INTERLEAVED = (
    "      for (const [token, factory] of Object.entries(answer)) {\n"
    "        if (this.container.has(token)) {\n"
    "          throw new DuplicateBindingError(token, 'bound');\n"
    "        }\n"
    "        container.bind(token, factory);\n"
)

MUTATIONS = [
  ('C1-must-catch: the abstract check never runs', B, CALL, "", 'killed'),
  ('C2-must-survive: comment only', B, EMPTY, "        // harmless\n" + EMPTY, 'survive'),
  ('C3-must-refuse: syntax break', B, EMPTY, EMPTY + "(", 'refuse'),

  # The four checks of the ruling, and the record form's
  ('P4-1 an empty abstract list is left to the container', B, EMPTY_IF, "      if (false) {\n", 'killed'),
  ('P4-2 an abstract that is no token is left to the container', B, KIND_IF, "        if (key === undefined) {\n          continue;\n        }\n        if (false) {\n", 'killed'),
  ('P4-3 an abstract named twice in the answer is left to the container', B, SEEN_IF, "        if (false) {\n", 'killed'),
  ('P4-4 the answer forgets the abstracts it has checked', B, SEEN_ADD, "", 'killed'),
  ('P4-5 an abstract the container already holds is left to the container', B, HELD_IF, "        if (false) {\n", 'killed'),
  ('P4-6 a 0.1 record token the container already holds is left to the container', B, RECORD_IF, "        if (false) {\n", 'killed'),

  # Check everything before binding anything
  ('P4-7 the record checks and binds entry by entry', B, RECORD_LOOPS, RECORD_INTERLEAVED, 'killed'),
  ('P4-8 the abstracts are checked before the pairs\' shape', B,
   [(CALL, ""), (SHAPE_LOOP_HEAD, "    if (Array.isArray(answer)) {\n" + CALL + "      for (const [index, pair] of answer.entries()) {\n")], None, 'killed'),

  # The errors the checks raise
  ('P4-9 the empty-list error is a TypeError, so it is not wrapped', B, EMPTY, EMPTY.replace('new DiException', 'new TypeError'), 'killed'),
  ('P4-10 the empty-list error does not name the step', B, EMPTY, EMPTY.replace('getClassDefinitions() entry', 'entry'), 'killed'),
  ('P4-11 the empty-list error does not name the concrete', B, EMPTY, EMPTY.replace('binds ${concrete.name} to no', 'binds a class to no'), 'killed'),
  ('P4-12 the no-token error does not name the concrete', B, KIND_MSG, "binds a class to ${describeValue(abstract)}, which is not", 'killed'),
  ('P4-13 the no-token error is a TypeError', B, "          throw new DiException(\n            `getClassDefinitions() entry ${index} binds", "          throw new TypeError(\n            `getClassDefinitions() entry ${index} binds", 'killed'),
  ('P4-14 a repeated abstract fails with a plain DiException', B, REPEATED, "          throw new DiException('repeated abstract');\n", 'killed'),
  ('P4-15 a held abstract fails with a plain DiException', B, HELD, "          throw new DiException('abstract already bound');\n", 'killed'),
  ('P4-16 a held record token fails with a plain DiException', B, RECORD, "          throw new DiException('token already bound');\n", 'killed'),
  ('P4-17 a duplicate names its concrete, not the abstract', B, NAME, "        const name = concrete.name;\n", 'killed'),

  # Unit tests, test/step3-abstracts.test.ts
  ('U1 a repeated abstract carries the reason bound', B, REPEATED, REPEATED.replace("'repeated'", "'bound'"), 'killed'),
  ('U2 a held abstract carries the reason repeated', B, HELD, HELD.replace("'bound'", "'repeated'"), 'killed'),
  ('U3 a held record token carries the reason repeated', B, RECORD, RECORD.replace("'bound'", "'repeated'"), 'killed'),
  ('U4 a class is keyed by its name', S, KEY_CLASS, "  if (isConstructable(value)) {\n    return value.name;\n  }\n  if (typeof value === 'string') {\n    return value;\n  }\n", 'killed'),
  ('U5 a typed token is keyed by itself, not its name', S, KEY_TOKEN, "    return value as unknown as string;\n", 'killed'),
  ('U6 any function counts as a class', S, KEY_CLASS, "  if (typeof value === 'function' || typeof value === 'string') {\n    return value as unknown as string;\n  }\n", 'killed'),
  ('U7 a token name of any type counts', S, KEY_TOKEN_IF, KEY_TOKEN_IF.replace(" && typeof (value as { name?: unknown }).name === 'string'", " && 'name' in value"), 'killed'),
]
