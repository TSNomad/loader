# Slice 7 review: a spot check of ten entries against the packet P1
# implementation, chosen where the reviewer wanted a second look rather
# than copied from p1-mutations.py. Each entry is (id, file, find,
# replace, expect). The first three are the harness controls. Run with:
#   python3 docs/architecture/ncc-slice-7-proof/mutate.py . docs/architecture/ncc-slice-7-proof/review-spot-mutations.py
B = 'src/Bootstrapper.ts'
DEF_CHECK_THEN_BIND = (
    "            place\n          );\n        }\n      }\n"
    "      for (const [concrete, abstracts] of answer as ReadonlyArray<readonly [unknown, unknown]>) {\n"
    "        container.bind(concrete, ...(Array.isArray(abstracts) ? abstracts : [abstracts]));\n      }\n"
)
DEF_BIND_AS_CHECKED = (
    "            place\n          );\n        }\n"
    "        container.bind(pair[0], ...(Array.isArray(pair[1]) ? pair[1] : [pair[1]]));\n      }\n"
)
TASK_ATTACH = (
    "        plan.push([pair[0], handler]);\n"
)
TASK_ATTACH_EARLY = (
    "        await tasks.attach(pair[0] as Parameters<LoaderTaskStrategy['attach']>[0], async (task: unknown) => {\n"
    "          const h = await this.container.get(handler);\n          await h.handle(task);\n        });\n"
)
TASK_LOOP = (
    "    for (const [taskClass, handlerClass] of plan) {\n"
    "      await tasks.attach(taskClass as Parameters<LoaderTaskStrategy['attach']>[0], async (task: unknown) => {\n"
    "        const handler = await this.container.get(handlerClass);\n        await handler.handle(task);\n      });\n    }\n"
)
CTRL_CHECK = (
    "    for (const [index, controller] of answer.entries()) {\n"
    "      if (!isConstructable(controller)) {\n"
    "        throw this.shapeError('getControllers', `entry ${index} must be a controller class, got ${describeValue(controller)}`, place);\n"
    "      }\n    }\n\n"
    "    for (const controller of answer as ReadonlyArray<abstract new (...args: any[]) => object>) {\n"
    "      await rest.registerRoute(() => this.container.get(controller));\n    }\n"
)
CTRL_INTERLEAVED = (
    "    for (const [index, controller] of answer.entries()) {\n"
    "      if (!isConstructable(controller)) {\n"
    "        throw this.shapeError('getControllers', `entry ${index} must be a controller class, got ${describeValue(controller)}`, place);\n"
    "      }\n"
    "      await rest.registerRoute(() => this.container.get(controller as abstract new (...args: any[]) => object));\n    }\n"
)
SETC = "    if (canSetContainer(init)) {\n      init.setContainer(this.container);\n    }\n"
COND = "    if (hasLoadCondition(init) && !(await this.checkLoadCondition(init.shouldLoad(), place))) {\n      return;\n    }\n"
MUTATIONS = [
  ('C1-must-catch: controllers never registered', B, "      await rest.registerRoute(() => this.container.get(controller));", "", 'killed'),
  ('C2-must-survive: comment only', B, SETC, "    // harmless\n" + SETC, 'survive'),
  ('C3-must-refuse: syntax break', B, SETC, SETC + "(", 'refuse'),

  ('V1 class definitions bind each pair as it is checked', B, DEF_CHECK_THEN_BIND, DEF_BIND_AS_CHECKED, 'killed'),
  ('V2 an action transformer that is not a function is accepted', B,
   "(action.transformer === undefined || typeof action.transformer === 'function')", "true", 'killed'),
  ('V3 a 0.1 binding entry with a non-function listener is accepted', B,
   "typeof legacy.eventId === 'string' && typeof legacy.listener === 'function'", "typeof legacy.eventId === 'string'", 'killed'),
  ('V4 a class with no handle on its prototype loads as a plain listener', B,
   "    if (isClassSyntax(entry)) {\n      throw this.shapeError(\n        'getListeners',",
   "    if (isClassSyntax(entry) && false) {\n      throw this.shapeError(\n        'getListeners',", 'killed'),
  ('V5 task handlers attach as they are checked', B, [(TASK_ATTACH, TASK_ATTACH_EARLY), (TASK_LOOP, "")], None, 'killed'),
  ('V6 controllers register as they are checked', B, CTRL_CHECK, CTRL_INTERLEAVED, 'killed'),
  ('V7 setContainer runs after the load condition', B, SETC + COND, COND + SETC, 'killed'),
]
