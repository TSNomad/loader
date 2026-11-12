# Packet P1: one mutation per guard, against the committed Bootstrapper,
# type guards and shape helpers on this branch. Each entry is (id, file,
# find, replace, expect). The first three are the harness controls. The
# ids follow the architecture list in mutations.py where the guard is the
# same, and U entries guard the unit tests in test/shapes.test.ts and
# test/bootstrapper-internals.test.ts. Run with:
#   python3 docs/architecture/ncc-slice-7-proof/mutate.py . docs/architecture/ncc-slice-7-proof/p1-mutations.py
B = 'src/Bootstrapper.ts'
I = 'src/interfaces.ts'
S = 'src/shapes.ts'
SRC = open(B).read()


def block(start: str) -> str:
    """One step's `if` block in loadInitializer, from `start` to its closing brace."""
    a = SRC.index(start)
    b = SRC.index('\n    }\n', a) + len('\n    }\n')
    return SRC[a:b]


SETC = block("    if (canSetContainer(init)) {")
COND = block("    if (hasLoadCondition(init) && ")
DEFS = block("    if (hasClassDefinitions(init)) {")
BINDINGS = block("    if (hasEventBindings(init)) {")
LISTENERS = block("    if (hasListeners(init)) {")
TASKS = block("    if (hasTaskHandlers(init)) {")
CONTROLLERS = block("    if (hasControllers(init)) {")
LOAD = block("    if (isLoadable(init)) {")
RUN_THROW = "          throw new LoaderException(initializerName(initializer), place.position, error);"
SHAPE = "  private shapeError(method: string, problem: string, place: Place): TypeError {\n    return new TypeError("
SHAPE_MSG = "      `${method}() of ${initializerName(place.initializer)} (position ${place.position}) ${problem}`"
EV_GET = "      const events = await this.container.get<AttachesListeners>(eventKey as Token);\n      await this.attachListeners(events, init.getListeners(), place);"
TS_GET = "      const tasks = await this.container.get<LoaderTaskStrategy>(TASK_STRATEGY_TOKEN);\n      await this.attachTaskHandlers(tasks, init.getTaskHandlers(), place);"
RS_GET = "      const rest = await this.container.get<LoaderRestStrategy>(REST_STRATEGY_TOKEN);\n      await this.registerControllers(rest, init.getControllers(), place);"
DEF_PAIR = "        if (!Array.isArray(pair) || pair.length !== 2 || !isConstructable(pair[0])) {\n          throw this.shapeError(\n            'getClassDefinitions',"
TASK_PAIR = "      if (!Array.isArray(pair) || pair.length !== 2 || !isConstructable(pair[0])) {\n        throw this.shapeError(\n          'getTaskHandlers',"
BIND_PAIR = "container.bind(concrete, ...(Array.isArray(abstracts) ? abstracts : [abstracts]));"
LEGACY_ATTACH = "        await events.attach(entry.eventId, entry.listener);\n"
H_RESOLVE = "        const handler = await this.container.get(entry);\n        await handler.handle(event);"
T_RESOLVE = "        const handler = await this.container.get(handlerClass);\n        await handler.handle(task);"
ATTACH = "      await events.attach(eventId, listener);"
KEYS_GUARD = "  return typeof (init as HasLoadCondition).shouldLoad === 'function';"

MUTATIONS = [
  ('C1-must-catch: skip load()', B, LOAD, "", 'killed'),
  ('C2-must-survive: comment only', B, LOAD, "    // harmless\n" + LOAD, 'survive'),
  ('C3-must-refuse: syntax break', B, LOAD, LOAD + "(", 'refuse'),

  # Order
  ('O1 setContainer after shouldLoad', B, SETC + COND, COND + SETC, 'killed'),
  ('O2 setContainer for every initializer first (phase order, 0.1)', B,
   [(SETC, ""),
    ("    for (const [index, initializer] of this.initializers.entries()) {\n      const place",
     "    for (const x of this.initializers as any[]) if (typeof x.setContainer === 'function') x.setContainer(this.container);\n    for (const [index, initializer] of this.initializers.entries()) {\n      const place")], None, 'killed'),
  ('O3 every load() after every initializer (phase order, 0.1)', B,
   [(LOAD, ""),
    ("        throw error;\n      }\n    }\n  }", "        throw error;\n      }\n    }\n    for (const x of this.initializers as any[]) if (typeof x.load === 'function') await x.load();\n  }")], None, 'killed'),
  ('O4 listeners before event bindings', B, BINDINGS + LISTENERS, LISTENERS + BINDINGS, 'killed'),
  ('O5 load() not awaited', B, "      await init.load();", "      void init.load();", 'killed'),
  ('O6 controllers before task handlers', B, TASKS + CONTROLLERS, CONTROLLERS + TASKS, 'killed'),
  ('O7 class definitions after event bindings', B, DEFS + BINDINGS, BINDINGS + DEFS, 'killed'),
  ('O8 task handlers before listeners', B, LISTENERS + TASKS, TASKS + LISTENERS, 'killed'),
  ('O9 event strategy resolved after the record is read', B, EV_GET,
   "      const record = init.getListeners();\n      const events = await this.container.get<AttachesListeners>(eventKey as Token);\n      await this.attachListeners(events, record, place);", 'killed'),
  ('O10 task strategy resolved after the list is read', B, TS_GET,
   "      const list = init.getTaskHandlers();\n      const tasks = await this.container.get<LoaderTaskStrategy>(TASK_STRATEGY_TOKEN);\n      await this.attachTaskHandlers(tasks, list, place);", 'killed'),
  ('O11 REST strategy resolved after the list is read', B, RS_GET,
   "      const list = init.getControllers();\n      const rest = await this.container.get<LoaderRestStrategy>(REST_STRATEGY_TOKEN);\n      await this.registerControllers(rest, list, place);", 'killed'),
  ('O12 setContainer gets a different container', B, "      init.setContainer(this.container);", "      init.setContainer(new (this.container.constructor as any)());", 'killed'),

  # Load condition
  ('L1 ignore a false condition', B, COND, "    if (hasLoadCondition(init)) {\n      await this.checkLoadCondition(init.shouldLoad(), place);\n    }\n", 'killed'),
  ('L2 condition not awaited', B, "    const settled = await answer;", "    const settled = answer;", 'killed'),
  ('L3 any non-boolean answer loads by truthiness', B,
   [("    if (typeof settled !== 'boolean') {\n      throw this.shapeError('shouldLoad'", "    if (false) {\n      throw this.shapeError('shouldLoad'"),
    ("    return settled;\n  }", "    return Boolean(settled);\n  }")], None, 'killed'),
  ('L4 non-boolean answer wrapped in a LoaderException', B, "      throw this.shapeError('shouldLoad', `must answer a boolean, got ${describeValue(settled)}`, place);", "      throw new DiException('shouldLoad() must answer a boolean');", 'killed'),
  ('L6 hasLoadCondition guard always false', I, KEYS_GUARD, "  return false;", 'killed'),
  ('S7 guards answer true for a non-function', I, KEYS_GUARD, "  return (init as HasLoadCondition).shouldLoad !== undefined;", 'killed'),

  # Class definitions
  ('D1 pairs bind only the first abstract', B, BIND_PAIR, "container.bind(concrete, Array.isArray(abstracts) ? abstracts[0] : abstracts);", 'killed'),
  ('D2 a pair with a list binds each abstract separately', B, BIND_PAIR, "for (const a of (Array.isArray(abstracts) ? abstracts : [abstracts])) container.bind(concrete, a);", 'killed'),
  ('D3 record form ignored', B, "      for (const [token, factory] of Object.entries(answer)) {\n        container.bind(token, factory);\n      }\n", "", 'killed'),
  ('D4 record form binds transient', B, "        container.bind(token, factory);", "        container.bind(token, factory, false);", 'killed'),
  ('D5 pairs bound in reverse', B, "      for (const [concrete, abstracts] of answer as ReadonlyArray", "      for (const [concrete, abstracts] of [...answer].reverse() as ReadonlyArray", 'killed'),
  ('D6 no shape check on pairs', B, DEF_PAIR, "        if (false) {\n          throw this.shapeError(\n            'getClassDefinitions',", 'killed'),
  ('D7 pair length not checked', B, DEF_PAIR, DEF_PAIR.replace(" || pair.length !== 2", ""), 'killed'),
  ('D8 concrete type not checked', B, DEF_PAIR, DEF_PAIR.replace(" || !isConstructable(pair[0])", ""), 'killed'),
  ('D9 validate while binding, not before', B,
   "            place\n          );\n        }\n      }\n      this.checkAbstracts(answer as ReadonlyArray<readonly [abstract new (...args: any[]) => object, unknown]>);\n      for (const [concrete, abstracts] of answer as ReadonlyArray<readonly [unknown, unknown]>) {\n        " + BIND_PAIR + "\n      }",
   "            place\n          );\n        }\n        container.bind(pair[0], ...(Array.isArray(pair[1]) ? pair[1] : [pair[1]]));\n      }", 'killed'),
  ('D10 any object counts as a record (promise, Map, class)', B, "    if (isPlainObject(answer)) {\n      for (const [token, factory]", "    if (answer !== null && (typeof answer === 'object' || typeof answer === 'function')) {\n      for (const [token, factory]", 'killed'),
  ('D11 record factory type not checked', B, "        if (typeof factory !== 'function') {", "        if (false) {", 'killed'),
  ('D12 null or undefined answer skipped', B, "    throw this.shapeError(\n      'getClassDefinitions',\n      `must answer", "    if (answer == null) return;\n    throw this.shapeError(\n      'getClassDefinitions',\n      `must answer", 'killed'),

  # Event bindings
  ('E1 bare string passes an empty transformer', B, "          await bindAction(entry.eventClass, action);", "          await bindAction(entry.eventClass, action, () => null);", 'killed'),
  ('E2 action object drops its transformer', B, "          await bindAction(entry.eventClass, action, transformer);", "          await bindAction(entry.eventClass, action);", 'killed'),
  ('E3 list of actions binds only the first', B, "Array.isArray(entry[1]) ? entry[1] : [entry[1]];", "Array.isArray(entry[1]) ? entry[1].slice(0, 1) : [entry[1]];", 'killed'),
  ('E4 action strategy resolved even for an empty list', B, "    const plan = this.planEventBindings(answer, place);\n", "    const plan = this.planEventBindings(answer, place);\n    await this.container.get(ActionBindingStrategy);\n", 'killed'),
  ('E5 0.1 entry resolves the action strategy too', B, LEGACY_ATTACH, "        await this.container.get(ActionBindingStrategy);\n" + LEGACY_ATTACH, 'killed'),
  ('E6 0.1 entries ignored', B, LEGACY_ATTACH, "", 'killed'),
  ('E8 every error wrapped, not only a DiException', B, "        if (error instanceof DiException) {", "        if (error instanceof Error) {", 'killed'),
  ('E9 no list check', B,
   [("    if (!Array.isArray(answer)) {\n      throw this.shapeError('getEventBindings'", "    if (!answer) {\n      throw this.shapeError('getEventBindings'"),
    ("    return answer.map((entry: unknown, index): EventBindingPlan", "    return (answer as any[]).map((entry: unknown, index: number): EventBindingPlan")], None, 'killed'),
  ('E10 pair arity not checked', B, "        if (entry.length !== 2 || !isConstructable(entry[0])) {", "        if (!isConstructable(entry[0])) {", 'killed'),
  ('E11 pair event not checked', B, "        if (entry.length !== 2 || !isConstructable(entry[0])) {", "        if (entry.length !== 2) {", 'killed'),
  ('E12 action of any type accepted as a name', B, "          if (typeof action === 'string') {\n            return { action };", "          if (typeof action !== 'object' || action === null) {\n            return { action: action as string };", 'killed'),
  ('E13 action object needs no name', B,
   [("isPlainObject(action) && typeof action.action === 'string' && (action.transformer", "isPlainObject(action) && (action.transformer"),
    ("return { action: action.action, transformer", "return { action: action.action as string, transformer")], None, 'killed'),
  ('E14 transformer type not checked', B, " && (action.transformer === undefined || typeof action.transformer === 'function')) {", ") {", 'killed'),
  ('E15 0.1 entry listener not checked', B, "typeof legacy.eventId === 'string' && typeof legacy.listener === 'function') {", "typeof legacy.eventId === 'string') {", 'killed'),
  ('E16 0.1 entry id not checked', B,
   [("typeof legacy.eventId === 'string' && typeof legacy.listener === 'function') {", "typeof legacy.listener === 'function') {"),
    ("{ kind: 'legacy', eventId: legacy.eventId, listener", "{ kind: 'legacy', eventId: legacy.eventId as string, listener")], None, 'killed'),
  ('E17 register while validating', B, "    const plan = this.planEventBindings(answer, place);\n",
   "    const plan = Array.isArray(answer) ? (function* (self: Bootstrapper) { for (const item of answer) yield self.planEventBindings([item], place)[0]; })(this) : this.planEventBindings(answer, place);\n", 'killed'),
  ('E18 bindAction result not awaited', B, "          await bindAction(entry.eventClass, action);", "          void bindAction(entry.eventClass, action);", 'killed'),
  ('E19 bindAction with a transformer not awaited', B, "          await bindAction(entry.eventClass, action, transformer);", "          void bindAction(entry.eventClass, action, transformer);", 'killed'),
  ('E20 0.1 entry attach not awaited', B, LEGACY_ATTACH, "        void events.attach(entry.eventId, entry.listener);\n", 'killed'),

  # Listeners
  ('N1 handler classes not recognized', B, "    if (isHandlerClass(entry)) {\n      return async", "    if (isHandlerClass(entry) && entry.length < 0) {\n      return async", 'killed'),
  ('N2 handler resolved eagerly at load', B, "      return async (event: unknown) => {\n" + H_RESOLVE,
   "      const early = this.container.get(entry);\n      early.catch(() => {});\n      return async (event: unknown) => {\n        const handler = await early;\n        await handler.handle(event);", 'killed'),
  ('N3 handler built with new, not through the container', B, H_RESOLVE, "        const handler = new (entry as any)();\n        await handler.handle(event);", 'killed'),
  ('N4 handle not awaited', B, "        await handler.handle(event);", "        void handler.handle(event);", 'killed'),
  ('N5 handle errors swallowed', B, "        await handler.handle(event);", "        try { await handler.handle(event); } catch { /* dropped */ }", 'killed'),
  ('N6 plain listener wrapped, not attached itself', B, "    return entry as (event: any) => unknown;", "    return (event: unknown) => (entry as (event: unknown) => unknown)(event);", 'killed'),
  ('N7 only the first listener of a list', B, "Array.isArray(entries) ? entries : [entries]", "Array.isArray(entries) ? entries.slice(0, 1) : [entries]", 'killed'),
  ('N8 event strategy resolved only for a non-empty record', B, EV_GET,
   "      const record = init.getListeners();\n      const events = Object.keys(record ?? {}).length > 0 ? await this.container.get<AttachesListeners>(eventKey as Token) : ({ attach() {} } as AttachesListeners);\n      await this.attachListeners(events, record, place);", 'killed'),
  ('N9 listeners read the default token, ignoring the option', B, EV_GET, EV_GET.replace("eventKey as Token", "EventStrategy as unknown as Token"), 'killed'),
  ('N10 attach result not awaited', B, ATTACH, "      void events.attach(eventId, listener);", 'killed'),
  ('N11 attach with priority 0', B, ATTACH, "      await (events as any).attach(eventId, listener, 0);", 'killed'),
  ('N12 any object counts as a record', B, "    if (!isPlainObject(answer)) {\n      throw this.shapeError('getListeners'", "    if (answer === null || typeof answer !== 'object') {\n      throw this.shapeError('getListeners'", 'killed'),
  ('N13 entry type not checked', B, "    if (typeof entry !== 'function') {", "    if (false) {", 'killed'),
  ('N14 register while validating', B,
   [("        plan.push([eventId, this.listenerFor(entry, eventId, place)]);", "        const made = this.listenerFor(entry, eventId, place);\n        if (plan.length === 0) await events.attach(eventId, made);\n        plan.push([eventId, made]);"),
    ("    for (const [eventId, listener] of plan) {", "    for (const [eventId, listener] of plan.slice(1)) {")], None, 'killed'),
  ('N15 a class with no handle method attached as a plain listener', B, "    if (isClassSyntax(entry)) {", "    if (false) {", 'killed'),
  ('N16 handler classes told apart by class syntax, not by prototype.handle', B, "    if (isHandlerClass(entry)) {\n      return async", "    if (isHandlerClass(entry) && isClassSyntax(entry)) {\n      return async", 'killed'),
  ('N17 attach errors swallowed', B, ATTACH, "      try { await events.attach(eventId, listener); } catch { /* dropped */ }", 'killed'),

  # Task handlers
  ('T1 task handler built with new', B, T_RESOLVE, "        const handler = new (handlerClass as any)();\n        await handler.handle(task);", 'killed'),
  ('T2 task handler resolved at load', B,
   "      await tasks.attach(taskClass as Parameters<LoaderTaskStrategy['attach']>[0], async (task: unknown) => {\n        const handler = await this.container.get(handlerClass);",
   "      const early = this.container.get(handlerClass);\n      early.catch(() => {});\n      await tasks.attach(taskClass as Parameters<LoaderTaskStrategy['attach']>[0], async (task: unknown) => {\n        const handler = await early;", 'killed'),
  ('T3 task handle not awaited', B, "        await handler.handle(task);", "        void Promise.resolve(handler.handle(task)).catch(() => {});", 'killed'),
  ('T4 task handler errors swallowed', B, "        await handler.handle(task);", "        try { await handler.handle(task); } catch { /* dropped */ }", 'killed'),
  ('T5 only the first handler of a list', B, "Array.isArray(pair[1]) ? pair[1] : [pair[1]]", "Array.isArray(pair[1]) ? pair[1].slice(0, 1) : [pair[1]]", 'killed'),
  ('T6 task strategy resolved only for a non-empty list', B, TS_GET,
   "      const list = init.getTaskHandlers();\n      const tasks = Array.isArray(list) && list.length > 0 ? await this.container.get<LoaderTaskStrategy>(TASK_STRATEGY_TOKEN) : ({ attach() {} } as LoaderTaskStrategy);\n      await this.attachTaskHandlers(tasks, list, place);", 'killed'),
  ('T7 task attach not awaited', B, "      await tasks.attach(", "      void tasks.attach(", 'killed'),
  ('T8 no list check', B,
   [("    if (!Array.isArray(answer)) {\n      throw this.shapeError('getTaskHandlers'", "    if (!answer) {\n      throw this.shapeError('getTaskHandlers'"),
    ("    for (const [index, pair] of answer.entries()) {\n      if (!Array.isArray(pair)", "    for (const [index, pair] of (answer as any[]).entries()) {\n      if (!Array.isArray(pair)")], None, 'killed'),
  ('T9 pair arity not checked', B, TASK_PAIR, TASK_PAIR.replace(" || pair.length !== 2", ""), 'killed'),
  ('T10 task class not checked', B, TASK_PAIR, TASK_PAIR.replace(" || !isConstructable(pair[0])", ""), 'killed'),
  ('T11 handler type not checked at all', B, "        if (!isHandlerClass(handler)) {", "        if (false) {", 'killed'),
  ('T12 a pair-shaped object accepted as a pair', B, TASK_PAIR, TASK_PAIR.replace("if (!Array.isArray(pair) || pair.length !== 2 || !isConstructable(pair[0])) {", "if (Array.isArray(pair) && (pair.length !== 2 || !isConstructable(pair[0]))) {"), 'killed'),
  ('T13 hasTaskHandlers guard always false', I, "  return typeof (init as HasTaskHandlers).getTaskHandlers === 'function';", "  return false;", 'killed'),
  ('T14 a handler with no handle method accepted', B,
   [("        if (!isHandlerClass(handler)) {", "        if (!isConstructable(handler)) {"),
    ("        plan.push([pair[0], handler]);", "        plan.push([pair[0], handler as any]);")], None, 'killed'),
  ('T15 register while validating', B, "        plan.push([pair[0], handler]);", "        await tasks.attach(pair[0] as any, async () => {});\n        plan.push([pair[0], handler]);", 'killed'),

  # Controllers
  ('R1 controller built at load', B, "      await rest.registerRoute(() => this.container.get(controller));", "      const built = await this.container.get(controller);\n      await rest.registerRoute(async () => built);", 'killed'),
  ('R2 controller built with new', B, "      await rest.registerRoute(() => this.container.get(controller));", "      await rest.registerRoute(async () => new (controller as any)());", 'killed'),
  ('R3 REST strategy resolved only for a non-empty list', B, RS_GET,
   "      const list = init.getControllers();\n      const rest = Array.isArray(list) && list.length > 0 ? await this.container.get<LoaderRestStrategy>(REST_STRATEGY_TOKEN) : ({ registerRoute() {} } as LoaderRestStrategy);\n      await this.registerControllers(rest, list, place);", 'killed'),
  ('R4 registerRoute not awaited', B, "      await rest.registerRoute(", "      void rest.registerRoute(", 'killed'),
  ('R5 a Set accepted as a list', B, "    if (!Array.isArray(answer)) {\n      throw this.shapeError('getControllers'", "    if (!(answer instanceof Array || answer instanceof Set)) {\n      throw this.shapeError('getControllers'", 'killed'),
  ('R6 entry type not checked', B, "      if (!isConstructable(controller)) {", "      if (false) {", 'killed'),
  ('R7 only the first controller', B, "    for (const controller of answer as ReadonlyArray", "    for (const controller of answer.slice(0, 1) as ReadonlyArray", 'killed'),
  ('R8 hasControllers guard always false', I, "  return typeof (init as HasControllers).getControllers === 'function';", "  return false;", 'killed'),
  ('R10 an arrow function accepted as a controller', B, "      if (!isConstructable(controller)) {", "      if (typeof controller !== 'function') {", 'killed'),
  ('R11 register while validating', B, "      if (!isConstructable(controller)) {", "      if (index === 0) await rest.registerRoute(() => this.container.get(controller as any));\n      if (!isConstructable(controller)) {", 'killed'),

  # Errors
  ('X1 DiException passes through unwrapped', B, "        if (error instanceof DiException) {", "        if (false) {", 'killed'),
  ('X2 shape errors are DiExceptions, so they get wrapped', B, SHAPE, "  private shapeError(method: string, problem: string, place: Place): Error {\n    return new DiException(", 'killed'),
  ('X3 cause is a copy, not the error', B, RUN_THROW, "          throw new LoaderException(initializerName(initializer), place.position, new DiException(error.message));", 'killed'),
  ('X4 position counts from 0', B, "position: index + 1 };", "position: index };", 'killed'),
  ('X5 name always the constructor name', S, "  if (isPlainObject(initializer)) {\n    return 'anonymous initializer';\n  }\n", "", 'killed'),
  ('X6 name is the step, not the initializer', B, RUN_THROW, RUN_THROW.replace("initializerName(initializer)", "'Bootstrapper'"), 'killed'),
  ('X7 a failure does not stop later initializers', B,
   [("    for (const [index, initializer] of this.initializers.entries()) {\n      const place", "    let failure: unknown;\n    for (const [index, initializer] of this.initializers.entries()) {\n      const place"),
    (RUN_THROW + "\n        }\n        throw error;\n      }\n    }\n  }", "          failure ??= new LoaderException(initializerName(initializer), place.position, error);\n          continue;\n        }\n        throw error;\n      }\n    }\n    if (failure) throw failure;\n  }")], None, 'killed'),
  ('X8 shape error is not a TypeError', B, SHAPE, "  private shapeError(method: string, problem: string, place: Place): Error {\n    return new RangeError(", 'killed'),
  ('X9 shape error does not name the initializer', B, SHAPE_MSG, "      `${method}() ${problem}`", 'killed'),
  ('X9b shape error does not name the method', B, SHAPE_MSG, "      `${initializerName(place.initializer)} (position ${place.position}) ${problem}`", 'killed'),
  ('X11 a second load is skipped', B, "  private async run(eventKey: EventStrategyKey): Promise<void> {\n", "  private async run(eventKey: EventStrategyKey): Promise<void> {\n    if ((this as any).done) return;\n    (this as any).done = true;\n", 'killed'),
  ('X12 bindings applied only after the initializer loads', B,
   [("        " + BIND_PAIR, "        ((place.initializer as any).__later ??= []).push(() => container.bind(concrete, ...(Array.isArray(abstracts) ? abstracts : [abstracts])));"),
    ("      await init.load();\n    }", "      await init.load();\n    }\n    for (const bind of (init as any).__later ?? []) bind();")], None, 'killed'),

  # Surface
  ('S2 variadic form keeps only the first', B, "      initializers.length === 1 && Array.isArray(initializers[0]) ? [...initializers[0]] : [...initializers];", "      Array.isArray(initializers[0]) ? [...initializers[0]] : initializers.slice(0, 1);", 'killed'),
  ('S3 array form treated as one initializer', B, "      initializers.length === 1 && Array.isArray(initializers[0]) ? [...initializers[0]] : [...initializers];", "      [...initializers];", 'killed'),
  ('S4 bootstrap ignores the option', B, "    return this.run(options.eventStrategyToken ?? EVENT_STRATEGY_TOKEN);", "    void options;\n    return this.run(EVENT_STRATEGY_TOKEN);", 'killed'),
  ('S5 bootstrap does nothing', B, "    return this.run(options.eventStrategyToken ?? EVENT_STRATEGY_TOKEN);", "    void options;\n    return Promise.resolve();", 'killed'),
  ('S6 load does nothing', B, "    return this.run(EventStrategy);", "    return Promise.resolve();", 'killed'),

  # Shape helpers, guarded by test/shapes.test.ts
  ('U1 isPlainObject accepts any object', S, "  return prototype === Object.prototype || prototype === null;", "  return true;", 'killed'),
  ('U2 a null-prototype object is not plain', S, "  return prototype === Object.prototype || prototype === null;", "  return prototype === Object.prototype;", 'killed'),
  ('U3 isConstructable accepts any function', S, "  return typeof value === 'function' && typeof (value as { prototype?: unknown }).prototype === 'object' && (value as { prototype?: unknown }).prototype !== null;", "  return typeof value === 'function';", 'killed'),
  ('U4 isHandlerClass accepts any class', S, "  return isConstructable(value) && typeof (value.prototype as { handle?: unknown }).handle === 'function';", "  return isConstructable(value);", 'killed'),
  ('U5 isHandlerClass reads a static handle', S, "  return isConstructable(value) && typeof (value.prototype as { handle?: unknown }).handle === 'function';", "  return isConstructable(value) && typeof (value as unknown as { handle?: unknown }).handle === 'function';", 'killed'),
  ('U6 isClassSyntax true for any function', S, "  return typeof value === 'function' && Function.prototype.toString.call(value).startsWith('class');", "  return typeof value === 'function';", 'killed'),
  ('U7 initializerName keeps an empty class name', S, "  return typeof name === 'string' && name !== '' ? name : 'anonymous initializer';", "  return typeof name === 'string' ? name : 'anonymous initializer';", 'killed'),
  ('U8 describeValue drops the array length', S, "    return `an array of length ${value.length}`;", "    return 'an array';", 'killed'),
  ('U9 describeValue calls a class a function', S, "    return isClassSyntax(value) ? `class${name}` : `function${name}`;", "    return `function${name}`;", 'killed'),
  ('U10 describeValue drops an instance class name', S, "    return typeof name === 'string' && name !== '' ? `a ${name}` : 'an object';", "    return 'an object';", 'killed'),
  ('U11 describeValue drops a string value', S, "    return `the string ${JSON.stringify(value)}`;", "    return 'a string';", 'killed'),
  ('U12 describeValue drops a primitive type', S, "  return `the ${typeof value} ${String(value)}`;", "  return String(value);", 'killed'),
]
