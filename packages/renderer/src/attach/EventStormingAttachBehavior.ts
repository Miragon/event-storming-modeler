import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type { Shape } from 'diagram-js/lib/model/Types';
import { isAttachableKind, isHostKind } from '../model/di-types.js';
import type { UpdatePropertiesContext } from '../modeling/cmd/UpdatePropertiesHandler.js';

/**
 * Keeps pinning consistent under RETYPE (`setStickyKind` via the popup): only attachable kinds
 * (actor/hotspot/note) may carry a `host` and only host kinds may carry attachers — a stale link
 * would make the exporter's `validateBoard` throw. Drag/drop, host-delete and move-together are
 * covered by the stock diagram-js AttachSupport; retype mutates in place (no `shape.replace`),
 * so it needs this hook. Notes themselves cannot be retyped (`setStickyKind` rejects them), but
 * a HOST retyped to a non-host kind sheds its note attachers like any other attacher here.
 * Runs in `preExecute` of the SAME command -> detach joins the retype as one undo step.
 */
export default class EventStormingAttachBehavior extends CommandInterceptor {
  static override $inject = ['eventBus', 'modeling'];

  constructor(eventBus: EventBus, modeling: Modeling) {
    super(eventBus);

    this.preExecute('element.updateProperties', (event: { context: UpdatePropertiesContext }) => {
      const { element, properties } = event.context;
      const newType = properties['eventStormingType'];
      if (typeof newType !== 'string') return;
      const shape = element as unknown as Shape;
      if (shape.host && !isAttachableKind(newType)) {
        modeling.updateAttachment(shape, undefined);
      }
      if (shape.attachers?.length && !isHostKind(newType)) {
        for (const attacher of [...shape.attachers]) {
          modeling.updateAttachment(attacher, undefined);
        }
      }
    });
  }
}
