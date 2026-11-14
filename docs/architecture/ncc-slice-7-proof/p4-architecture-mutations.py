# Packet P4 architecture proof: the step 3 ruling, which checks every pair's
# abstracts before it binds any pair. These target a scratch
# implementation of P4 in a separate clone that is never committed, so
# their find texts do not apply to this branch's src. Each entry is
# (id, file, find, replace, expect). The first three are the controls.
B = 'src/Bootstrapper.ts'
EMPTY = "          throw new DiException(`getClassDefinitions() entry ${index} binds ${concrete.name} to no abstract.`);\n"
KIND = "          if (key === undefined) {\n"
REPEAT = "          if (inPair.has(key)) {\n"
SEEN = "          if (seen.has(key) || this.container.has(abstract as Token)) {\n"
RECORD = "        if (this.container.has(token)) {\n"
COMMIT = "        for (const key of inPair) {\n          seen.add(key);\n        }\n"
BIND_LOOP = "      for (const [concrete, abstracts] of answer as ReadonlyArray<readonly [unknown, unknown]>) {\n        container.bind(concrete, ...(Array.isArray(abstracts) ? abstracts : [abstracts]));\n      }\n      return;"
MUTATIONS = [
  ('C1-must-catch: no pair is bound', B, "        container.bind(concrete, ...(Array.isArray(abstracts) ? abstracts : [abstracts]));\n", "", 'killed'),
  ('C2-must-survive: comment only', B, EMPTY, "          // harmless\n" + EMPTY, 'survive'),
  ('C3-must-refuse: syntax break', B, EMPTY, EMPTY + "(", 'refuse'),

  ('P4-1 an empty abstract list is left to the container', B, "        if (list.length === 0) {\n", "        if (false) {\n", 'killed'),
  ('P4-2 an abstract that is no token is left to the container', B, KIND, "          if (key === undefined && false) {\n", 'killed'),
  ('P4-3 an abstract named twice in one pair is left to the container', B, REPEAT, "          if (false) {\n", 'killed'),
  ('P4-4 an abstract an earlier pair of the answer named is left to the container', B, SEEN, "          if (this.container.has(abstract as Token)) {\n", 'killed'),
  ('P4-5 an abstract the container already holds is left to the container', B, SEEN, "          if (seen.has(key)) {\n", 'killed'),
  ('P4-6 a 0.1 record token the container already holds is left to the container', B, RECORD, "        if (false) {\n", 'killed'),
  ('P4-7 each pair is bound as soon as it is checked, pair by pair', B,
   [(COMMIT, COMMIT + "        container.bind(concrete, ...list);\n"), (BIND_LOOP, "      return;")], None, 'killed'),
  ('P4-8 the empty-list error is a TypeError, so it is not wrapped', B, EMPTY, EMPTY.replace('new DiException', 'new TypeError'), 'killed'),
  ('P4-9 the empty-list error does not name the step', B, EMPTY, EMPTY.replace('getClassDefinitions() entry', 'entry'), 'killed'),
  ('P4-10 the no-token error does not name the concrete', B, "binds ${concrete.name} to ${describeValue(abstract)}", "binds a class to ${describeValue(abstract)}", 'killed'),
  ('P4-11 a repeated abstract fails with a plain DiException', B, "            throw new DuplicateBindingError(abstractName(abstract), 'repeated');\n", "            throw new DiException('repeated abstract');\n", 'killed'),
  ('P4-12 a duplicate names the concrete, not the abstract', B, "            throw new DuplicateBindingError(abstractName(abstract), 'bound');\n", "            throw new DuplicateBindingError(concrete.name, 'bound');\n", 'killed'),
]
