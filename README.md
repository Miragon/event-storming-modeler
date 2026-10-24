# Event Storming Modeler has moved

> [!IMPORTANT]
> This repository is archived and read-only. The Event Storming Modeler now lives in the
> [Miragon modeler suite](https://github.com/Miragon/modeler-suite), in
> [`modelers/event-storming`](https://github.com/Miragon/modeler-suite/tree/main/modelers/event-storming), with its full git history.

Nothing changes for users:

- **npm packages** keep their names and version lines; new releases come from the suite: [`@miragon/event-storming-schema-model`](https://www.npmjs.com/package/@miragon/event-storming-schema-model), [`@miragon/event-storming-dsl`](https://www.npmjs.com/package/@miragon/event-storming-dsl), [`@miragon/event-storming-transforms`](https://www.npmjs.com/package/@miragon/event-storming-transforms), [`@miragon/event-storming-renderer`](https://www.npmjs.com/package/@miragon/event-storming-renderer).
- **VS Code extension** `miragon-gmbh.event-storming-modeler` stays the same ([Marketplace](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.event-storming-modeler), [Open VSX](https://open-vsx.org/extension/miragon-gmbh/event-storming-modeler)).
- **Web app** stays at [event-storming.modeler.miragon.io](https://event-storming.modeler.miragon.io).
- **Claude Code plugin** `event-storming-modeler` keeps its name and skills; it now comes from the suite's
  marketplace, which replaces the `event-storming` marketplace of this repository:

  ```text
  /plugin marketplace add Miragon/modeler-suite
  /plugin install event-storming-modeler@modeler-suite
  ```

**Issues and pull requests** go to [Miragon/modeler-suite](https://github.com/Miragon/modeler-suite/issues); the open issues of
this repository were moved there. Development, CI and releases are described in the suite's
[README](https://github.com/Miragon/modeler-suite#readme) and [CONTRIBUTING.md](https://github.com/Miragon/modeler-suite/blob/main/CONTRIBUTING.md), the
modeler itself in [`modelers/event-storming/README.md`](https://github.com/Miragon/modeler-suite/blob/main/modelers/event-storming/README.md).
