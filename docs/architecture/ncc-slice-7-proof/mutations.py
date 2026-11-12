# One mutation per guard in the loader's acceptance tests, against the
# architecture phase's scratch Bootstrapper in a separate clone. Each
# entry is (id, file, find, replace, expect). The first three are the
# harness controls.
B = 'src/Bootstrapper.ts'
I = 'src/interfaces.ts'
LOADLINE = "    if (typeof init.load === 'function') await init.load();\n  }"
SRC = open(B).read()


def block(start: str) -> str:
    """The step block that starts with `start`, up to the next step or load()."""
    a = SRC.index(start)
    b = SRC.index('\n    if (typeof init.', a + 1)
    return SRC[a:b + 1]


BINDINGS = block("    if (typeof init.getEventBindings === 'function') {")
LISTENERS = block("    if (typeof init.getListeners === 'function') {")
TASKS = block("    if (typeof init.getTaskHandlers === 'function') {")
MUTATIONS = [
  ('C1-must-catch: skip load()', B, LOADLINE, "  }", 'killed'),
  ('C2-must-survive: comment only', B, LOADLINE, "    // harmless\n" + LOADLINE, 'survive'),
  ('C3-must-refuse: syntax break', B, LOADLINE, LOADLINE + "(", 'refuse'),

  # Order
  ('O1 setContainer after shouldLoad', B,
   [("    if (typeof init.setContainer === 'function') init.setContainer(this.container);\n    if (typeof init.shouldLoad === 'function') {\n      const answer = await init.shouldLoad();",
     "    if (typeof init.shouldLoad === 'function') {\n      if (typeof init.setContainer === 'function') init.setContainer(this.container);\n      const answer = await init.shouldLoad();")], None, 'killed'),
  ('O2 setContainer for every initializer first (phase order, 0.1)', B,
   [("    for (let i = 0; i < this.initializers.length; i++) {\n      const init = this.initializers[i] as any;\n      try {",
     "    for (const x of this.initializers as any[]) if (typeof x.setContainer === 'function') x.setContainer(this.container);\n    for (let i = 0; i < this.initializers.length; i++) {\n      const init = this.initializers[i] as any;\n      try {"),
    ("    if (typeof init.setContainer === 'function') init.setContainer(this.container);\n    if (typeof init.shouldLoad", "    if (typeof init.shouldLoad")], None, 'killed'),
  ('O3 every load() after every initializer (phase order, 0.1)', B,
   [(LOADLINE, "  }"),
    ("        throw error;\n      }\n    }\n  }", "        throw error;\n      }\n    }\n    for (const x of this.initializers as any[]) if (typeof x.load === 'function') await x.load();\n  }")], None, 'killed'),
  ('O4 listeners before event bindings', B, BINDINGS + LISTENERS, LISTENERS + BINDINGS, 'killed'),
  ('O8 task handlers before listeners', B, LISTENERS + TASKS, TASKS + LISTENERS, 'killed'),
  ('O5 load() not awaited', B, LOADLINE, "    if (typeof init.load === 'function') void init.load();\n  }", 'killed'),
  ('O6 controllers before task handlers', B,
   [("    if (typeof init.getTaskHandlers === 'function') {\n      const list = init.getTaskHandlers();", "    await this.controllersOf(init, c);\n    if (typeof init.getTaskHandlers === 'function') {\n      const list = init.getTaskHandlers();"),
    ("    if (typeof init.getControllers === 'function') {\n      const list = init.getControllers();", "    if (false) {\n      const list = init.getControllers();"),
    ("  private async loadOne(", "  private async controllersOf(init: any, c: any): Promise<void> {\n    if (typeof init.getControllers !== 'function') return;\n    const list = init.getControllers();\n    if (!Array.isArray(list)) shape('getControllers() must answer a list');\n    for (const k of list) if (typeof k !== 'function') shape('getControllers() entry');\n    if (list.length > 0) {\n      const rs = await c.get(REST_STRATEGY_KEY);\n      for (const k of list) await rs.registerRoute(() => c.get(k));\n    }\n  }\n\n  private async loadOne(")], None, 'killed'),
  ('O7 class definitions after event bindings', B,
   [("    if (typeof init.getClassDefinitions === 'function') {\n      const defs = init.getClassDefinitions();", "    await this.bindingsLater;\n    if (typeof init.getClassDefinitions === 'function' && this.defsLater(init)) {\n      const defs = init.getClassDefinitions();"),
    ("      for (const step of plan) await step();\n    }\n    if (typeof init.getListeners", "      for (const step of plan) await step();\n    }\n    if (typeof init.getClassDefinitions === 'function') {\n      const defs = init.getClassDefinitions();\n      for (const [concrete, abstracts] of (Array.isArray(defs) ? defs : [])) c.bind(concrete, ...(Array.isArray(abstracts) ? abstracts : [abstracts]));\n      if (!Array.isArray(defs)) for (const [t, f] of Object.entries(defs)) c.bind(t, f);\n    }\n    if (typeof init.getListeners"),
    ("  private async loadOne(", "  private bindingsLater: Promise<void> = Promise.resolve();\n  private defsLater(init: any): boolean { void init; return false; }\n\n  private async loadOne(")], None, 'killed'),

  # Load condition
  ('L1 ignore a false condition', B, "      if (answer === false) return;\n", "", 'killed'),
  ('L2 condition not awaited', B, "      const answer = await init.shouldLoad();", "      const answer = init.shouldLoad();\n      if (answer instanceof Promise) { const a = await answer; if (a === false) return; }", 'killed'),
  ('L3 any non-boolean answer loads (truthy check)', B, "      if (typeof answer !== 'boolean') shape('shouldLoad() must answer a boolean');\n      if (answer === false) return;", "      if (!answer) return;", 'killed'),
  ('L4 non-boolean answer is a plain TypeError, not wrapped', B, "      if (typeof answer !== 'boolean') shape('shouldLoad() must answer a boolean');", "      if (typeof answer !== 'boolean') throw new TypeError('shouldLoad() must answer a boolean');", 'killed'),
  ('L6 hasLoadCondition guard always false', I, "return typeof (init as any).shouldLoad === 'function';", "return false;", 'killed'),

  # Class definitions
  ('D1 pairs bind only the first abstract', B, "c.bind(concrete, ...(Array.isArray(abstracts) ? abstracts : [abstracts]));", "c.bind(concrete, Array.isArray(abstracts) ? abstracts[0] : abstracts);", 'killed'),
  ('D2 a pair with a list binds each abstract separately', B, "c.bind(concrete, ...(Array.isArray(abstracts) ? abstracts : [abstracts]));", "for (const a of (Array.isArray(abstracts) ? abstracts : [abstracts])) c.bind(concrete, a);", 'killed'),
  ('D3 record form ignored', B, "        for (const [t, f] of Object.entries(defs)) c.bind(t, f);", "", 'killed'),
  ('D4 record form binds transient', B, "for (const [t, f] of Object.entries(defs)) c.bind(t, f);", "for (const [t, f] of Object.entries(defs)) c.bind(t, f, false);", 'killed'),
  ('D5 pairs bound in reverse', B, "        for (const [concrete, abstracts] of defs) c.bind(", "        for (const [concrete, abstracts] of [...defs].reverse()) c.bind(", 'killed'),
  ('D6 no shape check on pairs', B, "          if (!Array.isArray(d) || d.length !== 2 || typeof d[0] !== 'function') shape('getClassDefinitions() entry must be a [concrete, abstracts] pair');", "", 'killed'),
  ('D7 pair length not checked', B, "!Array.isArray(d) || d.length !== 2 || typeof d[0]", "!Array.isArray(d) || typeof d[0]", 'killed'),
  ('D8 concrete type not checked', B, "d.length !== 2 || typeof d[0] !== 'function') shape('getClassDefinitions() entry", "d.length !== 2) shape('getClassDefinitions() entry", 'killed'),
  ('D9 validate while binding, not before', B,
   [("        for (const d of defs) {\n          if (!Array.isArray(d) || d.length !== 2 || typeof d[0] !== 'function') shape('getClassDefinitions() entry must be a [concrete, abstracts] pair');\n        }\n        for (const [concrete, abstracts] of defs) c.bind(concrete, ...(Array.isArray(abstracts) ? abstracts : [abstracts]));",
     "        for (const d of defs) {\n          if (!Array.isArray(d) || d.length !== 2 || typeof d[0] !== 'function') shape('getClassDefinitions() entry must be a [concrete, abstracts] pair');\n          c.bind(d[0], ...(Array.isArray(d[1]) ? d[1] : [d[1]]));\n        }")], None, 'killed'),
  ('D10 any object counts as a record (promise, Map, class)', B, "      } else if (isPlain(defs)) {", "      } else if (defs !== null && (typeof defs === 'object' || typeof defs === 'function')) {", 'killed'),
  ('D11 record factory type not checked', B, "        for (const v of Object.values(defs)) if (typeof v !== 'function') shape('getClassDefinitions() record values must be factories');\n", "", 'killed'),
  ('D12 null or undefined answer skipped', B, "      } else shape('getClassDefinitions() must answer a list of pairs or a plain record');", "      }", 'killed'),

  # Event bindings
  ('E1 bare string passes an empty transformer', B, "plan.push(() => actions().bindAction(e[0], a)); }", "plan.push(() => actions().bindAction(e[0], a, () => null)); }", 'killed'),
  ('E2 action object drops its transformer', B, "actions().bindAction(e[0], a.action, a.transformer)", "actions().bindAction(e[0], a.action)", 'killed'),
  ('E3 list of actions binds only the first', B, "const acts = Array.isArray(e[1]) ? e[1] : [e[1]];", "const acts = Array.isArray(e[1]) ? e[1].slice(0, 1) : [e[1]];", 'killed'),
  ('E4 action strategy resolved even for an empty list', B, "      if (needsActions) actionStrategy = await c.get(ActionBindingStrategy);", "      actionStrategy = await c.get(ActionBindingStrategy);", 'killed'),
  ('E5 0.1 entry resolves the action strategy too', B, "          needsEvents = true; plan.push(", "          needsEvents = true; needsActions = true; plan.push(", 'killed'),
  ('E6 0.1 entries ignored', B, "          needsEvents = true; plan.push(() => events().attach(e.eventId, e.listener));", "          needsEvents = true;", 'killed'),
  ('E8 strategy error wrapped', B, "        if (error instanceof DiException || error instanceof ShapeError) {", "        if (error instanceof Error) {", 'killed'),
  ('E9 no list check', B, "      if (!Array.isArray(list)) shape('getEventBindings() must answer a list');", "      if (!list) shape('getEventBindings() must answer a list');", 'killed'),
  ('E10 pair arity not checked', B, "          if (e.length !== 2 || typeof e[0] !== 'function') shape('getEventBindings() pair');", "          if (typeof e[0] !== 'function') shape('getEventBindings() pair');", 'killed'),
  ('E11 pair event not checked', B, "          if (e.length !== 2 || typeof e[0] !== 'function') shape('getEventBindings() pair');", "          if (e.length !== 2) shape('getEventBindings() pair');", 'killed'),
  ('E12 action of any type accepted as a name', B, "            if (typeof a === 'string') { needsActions", "            if (typeof a !== 'object' || a === null) { needsActions", 'killed'),
  ('E13 action object needs no name', B, "a && typeof a === 'object' && typeof a.action === 'string' && (a.transformer", "a && typeof a === 'object' && (a.transformer", 'killed'),
  ('E14 transformer type not checked', B, " && (a.transformer === undefined || typeof a.transformer === 'function')) { needsActions", ") { needsActions", 'killed'),
  ('E15 0.1 entry listener not checked', B, "typeof e.eventId === 'string' && typeof e.listener === 'function') {", "typeof e.eventId === 'string') {", 'killed'),
  ('E16 0.1 entry id not checked', B, "e && typeof e === 'object' && typeof e.eventId === 'string' && typeof e.listener", "e && typeof e === 'object' && typeof e.listener", 'killed'),
  ('E17 register while validating', B,
   [("            if (typeof a === 'string') { needsActions = true; plan.push(() => actions().bindAction(e[0], a)); }",
     "            if (typeof a === 'string') { needsActions = true; (await c.get(ActionBindingStrategy)).bindAction(e[0], a); }")], None, 'killed'),
  ('E18 strategy result not awaited', B, "      for (const step of plan) await step();", "      for (const step of plan) void step();", 'killed'),

  # Listeners
  ('N1 handler classes called as functions', B, "          const listener = typeof entry.prototype?.handle === 'function'", "          const listener = false", 'killed'),
  ('N2 handler resolved eagerly at load', B,
   [("          const listener = typeof entry.prototype?.handle === 'function'\n            ? async (event: unknown) => { const h = await c.get(entry); await h.handle(event); }",
     "          const built = typeof entry.prototype?.handle === 'function' ? await c.get(entry).catch(() => null) : null;\n          const listener = typeof entry.prototype?.handle === 'function'\n            ? async (event: unknown) => { const h = built ?? await c.get(entry); await h.handle(event); }")], None, 'killed'),
  ('N3 handler built with new, not through the container', B, "async (event: unknown) => { const h = await c.get(entry); await h.handle(event); }", "async (event: unknown) => { const h = new entry(); await h.handle(event); }", 'killed'),
  ('N4 handle not awaited', B, "const h = await c.get(entry); await h.handle(event); }", "const h = await c.get(entry); void h.handle(event); }", 'killed'),
  ('N5 handle errors swallowed', B, "const h = await c.get(entry); await h.handle(event); }", "const h = await c.get(entry).catch(() => null); try { await h?.handle(event); } catch { /* dropped */ } }", 'killed'),
  ('N6 plain listener wrapped, not attached itself', B, "            : entry;", "            : (event: unknown) => entry(event);", 'killed'),
  ('N7 only the first listener of a list', B, "for (const entry of (Array.isArray(entries) ? entries : [entries])) {\n          if (typeof entry !== 'function') shape('getListeners()", "for (const entry of (Array.isArray(entries) ? entries.slice(0, 1) : [entries])) {\n          if (typeof entry !== 'function') shape('getListeners()", 'killed'),
  ('N8 event strategy resolved for an empty record', B, "      if (plan.length > 0) {\n        const ev = await c.get(eventKey);", "      {\n        const ev = await c.get(eventKey);", 'killed'),
  ('N9 listener strategy read by the default token, ignoring the option', B, "        const ev = await c.get(eventKey);", "        const ev = await c.get(EventStrategy);", 'killed'),
  ('N10 attach result not awaited', B, "          await ev.attach(id, listener);", "          void ev.attach(id, listener);", 'killed'),
  ('N11 attach with priority 0', B, "          await ev.attach(id, listener);", "          await ev.attach(id, listener, 0);", 'killed'),
  ('N12 any object counts as a record', B, "      if (!isPlain(rec)) shape('getListeners() must answer a plain object keyed by event id');", "      if (rec === null || typeof rec !== 'object') shape('getListeners() must answer a plain object keyed by event id');", 'killed'),
  ('N13 entry type not checked', B, "          if (typeof entry !== 'function') shape('getListeners() entry must be a function or handler class');\n", "", 'killed'),
  ('N14 register while validating', B,
   [("          if (typeof entry !== 'function') shape('getListeners() entry must be a function or handler class');\n          plan.push([id, entry]);",
     "          if (typeof entry !== 'function') shape('getListeners() entry must be a function or handler class');\n          plan.push([id, entry]);\n          if (plan.length === 1) (await c.get(eventKey)).attach(id, entry);"),
    ("        for (const [id, entry] of plan) {\n          const listener", "        for (const [id, entry] of plan.slice(1)) {\n          const listener")], None, 'killed'),

  # Task handlers
  ('T1 task handler built with new', B, "const hh = await c.get(h); await hh.handle(t); }", "const hh = new h(); await hh.handle(t); }", 'killed'),
  ('T2 task handler resolved at load', B, "        for (const [task, h] of plan) await ts.attach(task, async (t: unknown) => { const hh = await c.get(h); await hh.handle(t); });",
   "        for (const [task, h] of plan) { const hh = await c.get(h).catch((e: unknown) => ({ handle: () => { throw e; } })); await ts.attach(task, async (t: unknown) => { await hh.handle(t); }); }", 'killed'),
  ('T3 task handle not awaited', B, "const hh = await c.get(h); await hh.handle(t); }", "const hh = await c.get(h); void Promise.resolve(hh.handle(t)).catch(() => {}); }", 'killed'),
  ('T4 task handler errors swallowed', B, "const hh = await c.get(h); await hh.handle(t); }", "try { const hh = await c.get(h); await hh.handle(t); } catch { /* dropped */ } }", 'killed'),
  ('T5 only the first handler of a list', B, "        for (const h of (Array.isArray(e[1]) ? e[1] : [e[1]])) {", "        for (const h of (Array.isArray(e[1]) ? e[1].slice(0, 1) : [e[1]])) {", 'killed'),
  ('T6 task strategy resolved for an empty list', B, "      if (plan.length > 0) {\n        const ts = await c.get(TASK_STRATEGY_KEY);", "      {\n        const ts = await c.get(TASK_STRATEGY_KEY);", 'killed'),
  ('T7 task attach not awaited', B, "        for (const [task, h] of plan) await ts.attach(", "        for (const [task, h] of plan) void ts.attach(", 'killed'),
  ('T8 no list check', B, "      if (!Array.isArray(list)) shape('getTaskHandlers() must answer a list');", "      if (!list) shape('getTaskHandlers() must answer a list');", 'killed'),
  ('T9 pair arity not checked', B, "if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'function') shape('getTaskHandlers() pair');", "if (!Array.isArray(e) || typeof e[0] !== 'function') shape('getTaskHandlers() pair');", 'killed'),
  ('T10 task class not checked', B, "if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'function') shape('getTaskHandlers() pair');", "if (!Array.isArray(e) || e.length !== 2) shape('getTaskHandlers() pair');", 'killed'),
  ('T11 handler type not checked', B, "          if (typeof h !== 'function') shape('getTaskHandlers() handler');\n", "", 'killed'),
  ('T12 not-a-pair accepted', B, "if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'function') shape('getTaskHandlers() pair');", "if (Array.isArray(e) && (e.length !== 2 || typeof e[0] !== 'function')) shape('getTaskHandlers() pair');", 'killed'),
  ('T13 hasTaskHandlers guard always false', I, "return typeof (init as any).getTaskHandlers === 'function';", "return false;", 'killed'),

  # Controllers
  ('R1 controller built at load', B, "        for (const k of list) await rs.registerRoute(() => c.get(k));", "        for (const k of list) { const built = await c.get(k); await rs.registerRoute(async () => built); }", 'killed'),
  ('R2 controller built with new', B, "        for (const k of list) await rs.registerRoute(() => c.get(k));", "        for (const k of list) await rs.registerRoute(async () => new k());", 'killed'),
  ('R3 REST strategy resolved for an empty list', B, "      if (list.length > 0) {\n        const rs", "      {\n        const rs", 'killed'),
  ('R4 registerRoute not awaited', B, "        for (const k of list) await rs.registerRoute(", "        for (const k of list) void rs.registerRoute(", 'killed'),
  ('R5 no list check', B, "      if (!Array.isArray(list)) shape('getControllers() must answer a list');", "      if (!list || typeof list[Symbol.iterator] !== 'function') shape('getControllers() must answer a list');", 'killed'),
  ('R6 entry type not checked', B, "      for (const k of list) if (typeof k !== 'function') shape('getControllers() entry');\n", "", 'killed'),
  ('R7 only the first controller', B, "        for (const k of list) await rs.registerRoute(() => c.get(k));", "        for (const k of list.slice(0, 1)) await rs.registerRoute(() => c.get(k));", 'killed'),
  ('R8 hasControllers guard always false', I, "return typeof (init as any).getControllers === 'function';", "return false;", 'killed'),

  # Errors
  ('X1 DiException passes through unwrapped', B, "        if (error instanceof DiException || error instanceof ShapeError) {", "        if (error instanceof ShapeError) {", 'killed'),
  ('X2 shape errors pass through unwrapped', B, "        if (error instanceof DiException || error instanceof ShapeError) {", "        if (error instanceof DiException) {", 'killed'),
  ('X3 cause is a copy, not the error', B, "error instanceof ShapeError ? error.inner : error);", "error instanceof ShapeError ? error.inner : new DiException((error as Error).message));", 'killed'),
  ('X4 position counts from 0', B, "throw new LoaderException(nameOf(init), i + 1,", "throw new LoaderException(nameOf(init), i,", 'killed'),
  ('X5 name always the constructor name', B, "  if (isPlain(init)) return 'anonymous initializer';\n", "", 'killed'),
  ('X6 name is the step, not the initializer', B, "throw new LoaderException(nameOf(init), i + 1,", "throw new LoaderException('Bootstrapper', i + 1,", 'killed'),
  ('X7 a failure does not stop later initializers', B,
   [("    for (let i = 0; i < this.initializers.length; i++) {\n      const init = this.initializers[i] as any;",
     "    let failure: unknown;\n    for (let i = 0; i < this.initializers.length; i++) {\n      const init = this.initializers[i] as any;"),
    ("          throw new LoaderException(nameOf(init), i + 1, error instanceof ShapeError ? error.inner : error);\n        }\n        throw error;\n      }\n    }\n",
     "          failure ??= new LoaderException(nameOf(init), i + 1, error instanceof ShapeError ? error.inner : error);\n          continue;\n        }\n        throw error;\n      }\n    }\n    if (failure) throw failure;\n")], None, 'killed'),
  ('X8 shape error cause is not a TypeError', B, "  constructor(message: string) { super(message); this.inner = new TypeError(message); }", "  constructor(message: string) { super(message); this.inner = new RangeError(message) as any; }", 'killed'),

  # Surface
  ('S2 variadic form keeps only the first', B, "    this.initializers = initializers.length === 1 && Array.isArray(initializers[0]) ? [...initializers[0]] : initializers;", "    this.initializers = Array.isArray(initializers[0]) ? [...initializers[0]] : initializers.slice(0, 1);", 'killed'),
  ('S3 array form treated as one initializer', B, "    this.initializers = initializers.length === 1 && Array.isArray(initializers[0]) ? [...initializers[0]] : initializers;", "    this.initializers = initializers;", 'killed'),
  ('S4 bootstrap ignores the option', B, "    return this.run(options.eventStrategyToken ?? EVENT_STRATEGY_TOKEN);", "    void options;\n    return this.run(EVENT_STRATEGY_TOKEN);", 'killed'),
  ('S5 bootstrap does nothing', B, "    return this.run(options.eventStrategyToken ?? EVENT_STRATEGY_TOKEN);", "    void options;\n    return Promise.resolve();", 'killed'),
  ('S7 guards answer true for a non-function', I, "return typeof (init as any).shouldLoad === 'function';", "return (init as any).shouldLoad !== undefined;", 'killed'),
]
