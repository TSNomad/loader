# Slice 7 review fix proof: the unit test that step 4 resolves the action
# binding strategy once per pair. Each entry is (id, file, find, replace,
# expect). The first three are the harness controls. Run with:
#   python3 docs/architecture/ncc-slice-7-proof/mutate.py . docs/architecture/ncc-slice-7-proof/review-fix-mutations.py
B = 'src/Bootstrapper.ts'
PER_PAIR = "      const actions = await this.container.get(ActionBindingStrategy);\n"
LOOP = "    const plan = this.planEventBindings(answer, place);\n\n    for (const entry of plan) {\n"
MUTATIONS = [
  ('C1-must-catch: no action is bound', B, "          await bindAction(entry.eventClass, action);\n", "", 'killed'),
  ('C2-must-survive: comment only', B, PER_PAIR, "      // harmless\n" + PER_PAIR, 'survive'),
  ('C3-must-refuse: syntax break', B, PER_PAIR, PER_PAIR + "(", 'refuse'),

  ('F1 the strategy is resolved once, on the first pair, and kept for the rest', B,
   [(LOOP, "    const plan = this.planEventBindings(answer, place);\n    let kept: ActionBindingStrategy | undefined;\n\n    for (const entry of plan) {\n"),
    (PER_PAIR, "      const actions = kept ?? (kept = await this.container.get(ActionBindingStrategy));\n")], None, 'killed'),
]
