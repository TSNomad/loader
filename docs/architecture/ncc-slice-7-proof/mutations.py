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
DEFS = block("    if (typeof init.getClassDefinitions === 'function') {")
CONTROLLERS = block("    if (typeof init.getControllers === 'function') {")
MUTATIONS = [
  ('C1-must-catch: skip load()', B, LOADLINE, "  }", 'killed'),
  ('C2-must-survive: comment only', B, LOADLINE, "    // harmless\n" + LOADLINE, 'survive'),
  ('C3-must-refuse: syntax break', B, LOADLINE, LOADLINE + "(", 'refuse'),

  # Order
  ('O2 setContainer for every initializer first (phase order, 0.1)', B,
   [("    for (let i = 0; i < this.initializers.length; i++) {\n      const init = this.initializers[i] as any;\n      const where",
     "    for (const x of this.initializers as any[]) if (typeof x.setContainer === 'function') x.setContainer(this.container);\n    for (let i = 0; i < this.initializers.length; i++) {\n      const init = this.initializers[i] as any;\n      const where"),
    ("    if (typeof init.setContainer === 'function') init.setContainer(this.container);\n    if (typeof init.shouldLoad", "    if (typeof init.shouldLoad")], None, 'killed'),
  ('O6 controllers before task handlers', B, TASKS + CONTROLLERS, CONTROLLERS + TASKS, 'killed'),
  ('O7 class definitions after event bindings', B, DEFS + BINDINGS, BINDINGS + DEFS, 'killed'),
  ('O9 event strategy resolved after the record is read', B, "      const ev = await c.get(eventKey);\n      const rec = init.getListeners();", "      const rec = init.getListeners();\n      const ev = await c.get(eventKey);", 'killed'),
  ('O10 task strategy resolved after the list is read', B, "      const ts = await c.get(TASK_STRATEGY_TOKEN);\n      const list = init.getTaskHandlers();", "      const list = init.getTaskHandlers();\n      const ts = await c.get(TASK_STRATEGY_TOKEN);", 'killed'),
  ('O11 REST strategy resolved after the list is read', B, "      const rs = await c.get(REST_STRATEGY_TOKEN);\n      const list = init.getControllers();", "      const list = init.getControllers();\n      const rs = await c.get(REST_STRATEGY_TOKEN);", 'killed'),
  ('O1 setContainer after shouldLoad', B,
   [("    if (typeof init.setContainer === 'function') init.setContainer(this.container);\n    if (typeof init.shouldLoad === 'function') {\n      const answer = await init.shouldLoad();",
     "    if (typeof init.shouldLoad === 'function') {\n      if (typeof init.setContainer === 'function') init.setContainer(this.container);\n      const answer = await init.shouldLoad();")], None, 'killed'),
  ('O3 every load() after every initializer (phase order, 0.1)', B,
   [(LOADLINE, "  }"),
    ("        throw error;\n      }\n    }\n  }", "        throw error;\n      }\n    }\n    for (const x of this.initializers as any[]) if (typeof x.load === 'function') await x.load();\n  }")], None, 'killed'),
  ('O4 listeners before event bindings', B, BINDINGS + LISTENERS, LISTENERS + BINDINGS, 'killed'),
  ('O8 task handlers before listeners', B, LISTENERS + TASKS, TASKS + LISTENERS, 'killed'),
  ('O5 load() not awaited', B, LOADLINE, "    if (typeof init.load === 'function') void init.load();\n  }", 'killed'),

  # Load condition
  ('L4 non-boolean answer wrapped in a LoaderException', B, "      if (typeof answer !== 'boolean') shape('shouldLoad() must answer a boolean');", "      if (typeof answer !== 'boolean') throw new DiException('shouldLoad() must answer a boolean');", 'killed'),
  ('L1 ignore a false condition', B, "      if (answer === false) return;\n", "", 'killed'),
  ('L2 condition not awaited', B, "      const answer = await init.shouldLoad();", "      const answer = init.shouldLoad();\n      if (answer instanceof Promise) { const a = await answer; if (a === false) return; }", 'killed'),
  ('L3 any non-boolean answer loads (truthy check)', B, "      if (typeof answer !== 'boolean') shape('shouldLoad() must answer a boolean');\n      if (answer === false) return;", "      if (!answer) return;", 'killed'),
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
  ('E1 bare string passes an empty transformer', B, "calls.push((s) => s.bindAction(e[0], a));", "calls.push((s) => s.bindAction(e[0], a, () => null));", 'killed'),
  ('E2 action object drops its transformer', B, "s.bindAction(e[0], a.action, a.transformer)", "s.bindAction(e[0], a.action)", 'killed'),
  ('E4 action strategy resolved even for an empty list', B, "      if (!Array.isArray(list)) shape('getEventBindings() must answer a list');", "      if (!Array.isArray(list)) shape('getEventBindings() must answer a list');\n      await c.get(ActionBindingStrategy);", 'killed'),
  ('E5 0.1 entry resolves the action strategy too', B, "plan.push(async () => { const s = await c.get(eventKey);", "plan.push(async () => { await c.get(ActionBindingStrategy); const s = await c.get(eventKey);", 'killed'),
  ('E6 0.1 entries ignored', B, "          plan.push(async () => { const s = await c.get(eventKey); await s.attach(e.eventId, e.listener); });", "          plan.push(async () => {});", 'killed'),
  ('E8 strategy error wrapped', B, "        if (error instanceof DiException) {", "        if (error instanceof Error) {", 'killed'),
  ('E12 action of any type accepted as a name', B, "            if (typeof a === 'string') calls.push", "            if (typeof a !== 'object' || a === null) calls.push", 'killed'),
  ('E14 transformer type not checked', B, " && (a.transformer === undefined || typeof a.transformer === 'function')) calls.push", ") calls.push", 'killed'),
  ('E17 register while validating', B, "            if (typeof a === 'string') calls.push((s) => s.bindAction(e[0], a));", "            if (typeof a === 'string') (await c.get(ActionBindingStrategy)).bindAction(e[0], a);", 'killed'),
  ('E3 list of actions binds only the first', B, "const acts = Array.isArray(e[1]) ? e[1] : [e[1]];", "const acts = Array.isArray(e[1]) ? e[1].slice(0, 1) : [e[1]];", 'killed'),
  ('E9 no list check', B, "      if (!Array.isArray(list)) shape('getEventBindings() must answer a list');", "      if (!list) shape('getEventBindings() must answer a list');", 'killed'),
  ('E10 pair arity not checked', B, "          if (e.length !== 2 || typeof e[0] !== 'function') shape('getEventBindings() pair');", "          if (typeof e[0] !== 'function') shape('getEventBindings() pair');", 'killed'),
  ('E11 pair event not checked', B, "          if (e.length !== 2 || typeof e[0] !== 'function') shape('getEventBindings() pair');", "          if (e.length !== 2) shape('getEventBindings() pair');", 'killed'),
  ('E13 action object needs no name', B, "a && typeof a === 'object' && typeof a.action === 'string' && (a.transformer", "a && typeof a === 'object' && (a.transformer", 'killed'),
  ('E15 0.1 entry listener not checked', B, "typeof e.eventId === 'string' && typeof e.listener === 'function') {", "typeof e.eventId === 'string') {", 'killed'),
  ('E16 0.1 entry id not checked', B, "e && typeof e === 'object' && typeof e.eventId === 'string' && typeof e.listener", "e && typeof e === 'object' && typeof e.listener", 'killed'),
  ('E18 strategy result not awaited', B, "      for (const step of plan) await step();", "      for (const step of plan) void step();", 'killed'),

  # Listeners
  ('N1 handler classes called as functions', B, "          const handler = typeof entry.prototype?.handle === 'function';", "          const handler = false && typeof entry.prototype?.handle === 'function';", 'killed'),
  ('N2 handler resolved eagerly at load', B, "          plan.push([id, handler ?", "          if (handler) await c.get(entry).catch(() => null);\n          plan.push([id, handler ?", 'killed'),
  ('N6 plain listener wrapped, not attached itself', B, " : entry]);", " : (event: unknown) => entry(event)]);", 'killed'),
  ('N8 event strategy resolved only for a non-empty record', B, "      const ev = await c.get(eventKey);\n      const rec = init.getListeners();", "      const rec = init.getListeners();\n      const ev = Object.keys(rec ?? {}).length > 0 ? await c.get(eventKey) : null;", 'killed'),
  ('N9 listener strategy read by the default token, ignoring the option', B, "      const ev = await c.get(eventKey);", "      const ev = await c.get(EventStrategy);", 'killed'),
  ('N10 attach result not awaited', B, "for (const [id, listener] of plan) await ev.attach(id, listener);", "for (const [id, listener] of plan) void ev.attach(id, listener);", 'killed'),
  ('N11 attach with priority 0', B, "for (const [id, listener] of plan) await ev.attach(id, listener);", "for (const [id, listener] of plan) await ev.attach(id, listener, 0);", 'killed'),
  ('N14 register while validating', B,
   [("          if (typeof entry !== 'function') shape('getListeners() entry must be a function or handler class');\n",
     "          if (typeof entry !== 'function') shape('getListeners() entry must be a function or handler class');\n          if (plan.length === 0) await ev.attach(id, entry);\n"),
    ("for (const [id, listener] of plan) await ev.attach(id, listener);", "for (const [id, listener] of plan.slice(1)) await ev.attach(id, listener);")], None, 'killed'),
  ('N15 a class with no handle method attached as a plain listener', B, "          if (!handler && isClass(entry)) shape('getListeners() entry is a class with no handle method');\n", "", 'killed'),
  ('N3 handler built with new, not through the container', B, "async (event: unknown) => { const h = await c.get(entry); await h.handle(event); }", "async (event: unknown) => { const h = new entry(); await h.handle(event); }", 'killed'),
  ('N4 handle not awaited', B, "const h = await c.get(entry); await h.handle(event); }", "const h = await c.get(entry); void h.handle(event); }", 'killed'),
  ('N5 handle errors swallowed', B, "const h = await c.get(entry); await h.handle(event); }", "const h = await c.get(entry).catch(() => null); try { await h?.handle(event); } catch { /* dropped */ } }", 'killed'),
  ('N7 only the first listener of a list', B, "for (const entry of (Array.isArray(entries) ? entries : [entries])) {\n          if (typeof entry !== 'function') shape('getListeners()", "for (const entry of (Array.isArray(entries) ? entries.slice(0, 1) : [entries])) {\n          if (typeof entry !== 'function') shape('getListeners()", 'killed'),
  ('N12 any object counts as a record', B, "      if (!isPlain(rec)) shape('getListeners() must answer a plain object keyed by event id');", "      if (rec === null || typeof rec !== 'object') shape('getListeners() must answer a plain object keyed by event id');", 'killed'),
  ('N13 entry type not checked', B, "          if (typeof entry !== 'function') shape('getListeners() entry must be a function or handler class');\n", "", 'killed'),

  # Task handlers
  ('T2 task handler resolved at load', B, "      for (const [task, h] of plan) await ts.attach(task, async (t: unknown) => { const hh = await c.get(h); await hh.handle(t); });",
   "      for (const [task, h] of plan) { const hh = await c.get(h).catch((e: unknown) => ({ handle: () => { throw e; } })); await ts.attach(task, async (t: unknown) => { await hh.handle(t); }); }", 'killed'),
  ('T6 task strategy resolved only for a non-empty list', B, "      const ts = await c.get(TASK_STRATEGY_TOKEN);\n      const list = init.getTaskHandlers();", "      const list = init.getTaskHandlers();\n      const ts = Array.isArray(list) && list.length > 0 ? await c.get(TASK_STRATEGY_TOKEN) : null;", 'killed'),
  ('T7 task attach not awaited', B, "      for (const [task, h] of plan) await ts.attach(", "      for (const [task, h] of plan) void ts.attach(", 'killed'),
  ('T11 handler type not checked at all', B, "          if (typeof h !== 'function') shape('getTaskHandlers() handler');\n          if (typeof h.prototype?.handle !== 'function') shape('getTaskHandlers() handler class has no handle method');\n", "", 'killed'),
  ('T14 a handler with no handle method accepted', B, "          if (typeof h.prototype?.handle !== 'function') shape('getTaskHandlers() handler class has no handle method');\n", "", 'killed'),
  ('T1 task handler built with new', B, "const hh = await c.get(h); await hh.handle(t); }", "const hh = new h(); await hh.handle(t); }", 'killed'),
  ('T3 task handle not awaited', B, "const hh = await c.get(h); await hh.handle(t); }", "const hh = await c.get(h); void Promise.resolve(hh.handle(t)).catch(() => {}); }", 'killed'),
  ('T4 task handler errors swallowed', B, "const hh = await c.get(h); await hh.handle(t); }", "try { const hh = await c.get(h); await hh.handle(t); } catch { /* dropped */ } }", 'killed'),
  ('T5 only the first handler of a list', B, "        for (const h of (Array.isArray(e[1]) ? e[1] : [e[1]])) {", "        for (const h of (Array.isArray(e[1]) ? e[1].slice(0, 1) : [e[1]])) {", 'killed'),
  ('T8 no list check', B, "      if (!Array.isArray(list)) shape('getTaskHandlers() must answer a list');", "      if (!list) shape('getTaskHandlers() must answer a list');", 'killed'),
  ('T9 pair arity not checked', B, "if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'function') shape('getTaskHandlers() pair');", "if (!Array.isArray(e) || typeof e[0] !== 'function') shape('getTaskHandlers() pair');", 'killed'),
  ('T10 task class not checked', B, "if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'function') shape('getTaskHandlers() pair');", "if (!Array.isArray(e) || e.length !== 2) shape('getTaskHandlers() pair');", 'killed'),
  ('T12 not-a-pair accepted', B, "if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'function') shape('getTaskHandlers() pair');", "if (Array.isArray(e) && (e.length !== 2 || typeof e[0] !== 'function')) shape('getTaskHandlers() pair');", 'killed'),
  ('T13 hasTaskHandlers guard always false', I, "return typeof (init as any).getTaskHandlers === 'function';", "return false;", 'killed'),

  # Controllers
  ('R1 controller built at load', B, "      for (const k of list) await rs.registerRoute(() => c.get(k));", "      for (const k of list) { const built = await c.get(k); await rs.registerRoute(async () => built); }", 'killed'),
  ('R2 controller built with new', B, "      for (const k of list) await rs.registerRoute(() => c.get(k));", "      for (const k of list) await rs.registerRoute(async () => new k());", 'killed'),
  ('R3 REST strategy resolved only for a non-empty list', B, "      const rs = await c.get(REST_STRATEGY_TOKEN);\n      const list = init.getControllers();", "      const list = init.getControllers();\n      const rs = Array.isArray(list) && list.length > 0 ? await c.get(REST_STRATEGY_TOKEN) : null;", 'killed'),
  ('R4 registerRoute not awaited', B, "      for (const k of list) await rs.registerRoute(", "      for (const k of list) void rs.registerRoute(", 'killed'),
  ('R7 only the first controller', B, "      for (const k of list) await rs.registerRoute(() => c.get(k));", "      for (const k of list.slice(0, 1)) await rs.registerRoute(() => c.get(k));", 'killed'),
  ('R5 no list check', B, "      if (!Array.isArray(list)) shape('getControllers() must answer a list');", "      if (!list || typeof list[Symbol.iterator] !== 'function') shape('getControllers() must answer a list');", 'killed'),
  ('R6 entry type not checked', B, "      for (const k of list) if (typeof k !== 'function') shape('getControllers() entry');\n", "", 'killed'),
  ('R8 hasControllers guard always false', I, "return typeof (init as any).getControllers === 'function';", "return false;", 'killed'),

  # Errors
  ('X1 DiException passes through unwrapped', B, "        if (error instanceof DiException) {", "        if (false) {", 'killed'),
  ('X2 shape errors wrapped in a LoaderException', B, "      throw new TypeError(`${message}, in ${where}`);", "      throw new DiException(`${message}, in ${where}`);", 'killed'),
  ('X3 cause is a copy, not the error', B, "throw new LoaderException(nameOf(init), i + 1, error);", "throw new LoaderException(nameOf(init), i + 1, new DiException((error as Error).message));", 'killed'),
  ('X7 a failure does not stop later initializers', B,
   [("    for (let i = 0; i < this.initializers.length; i++) {\n      const init = this.initializers[i] as any;",
     "    let failure: unknown;\n    for (let i = 0; i < this.initializers.length; i++) {\n      const init = this.initializers[i] as any;"),
    ("          throw new LoaderException(nameOf(init), i + 1, error);\n        }\n        throw error;\n      }\n    }\n",
     "          failure ??= new LoaderException(nameOf(init), i + 1, error);\n          continue;\n        }\n        throw error;\n      }\n    }\n    if (failure) throw failure;\n")], None, 'killed'),
  ('X8 shape error is not a TypeError', B, "      throw new TypeError(`${message}, in ${where}`);", "      throw new RangeError(`${message}, in ${where}`);", 'killed'),
  ('X9 shape error does not name the initializer', B, "      throw new TypeError(`${message}, in ${where}`);", "      throw new TypeError(message);", 'killed'),
  ('X10 LoaderException message carries the position', 'src/LoaderException.ts', "    super(`Failed to load ${initializer}`, { cause });", "    super(`Failed to load ${initializer} (position ${position})`, { cause });", 'killed'),
  ('X11 a second load is skipped', B, "  private async run(eventKey: string | typeof EventStrategy): Promise<void> {\n", "  private async run(eventKey: string | typeof EventStrategy): Promise<void> {\n    if ((this as any).done) return;\n    (this as any).done = true;\n", 'killed'),
  ('X4 position counts from 0', B, "throw new LoaderException(nameOf(init), i + 1,", "throw new LoaderException(nameOf(init), i,", 'killed'),
  ('X5 name always the constructor name', B, "  if (isPlain(init)) return 'anonymous initializer';\n", "", 'killed'),
  ('X6 name is the step, not the initializer', B, "throw new LoaderException(nameOf(init), i + 1,", "throw new LoaderException('Bootstrapper', i + 1,", 'killed'),

  # Surface
  ('S2 variadic form keeps only the first', B, "    this.initializers = initializers.length === 1 && Array.isArray(initializers[0]) ? [...initializers[0]] : initializers;", "    this.initializers = Array.isArray(initializers[0]) ? [...initializers[0]] : initializers.slice(0, 1);", 'killed'),
  ('S3 array form treated as one initializer', B, "    this.initializers = initializers.length === 1 && Array.isArray(initializers[0]) ? [...initializers[0]] : initializers;", "    this.initializers = initializers;", 'killed'),
  ('S4 bootstrap ignores the option', B, "    return this.run(options.eventStrategyToken ?? EVENT_STRATEGY_TOKEN);", "    void options;\n    return this.run(EVENT_STRATEGY_TOKEN);", 'killed'),
  ('S5 bootstrap does nothing', B, "    return this.run(options.eventStrategyToken ?? EVENT_STRATEGY_TOKEN);", "    void options;\n    return Promise.resolve();", 'killed'),
  ('S7 guards answer true for a non-function', I, "return typeof (init as any).shouldLoad === 'function';", "return (init as any).shouldLoad !== undefined;", 'killed'),
]
