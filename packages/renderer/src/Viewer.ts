import type { ModuleDeclaration } from 'didi';
import { EventStormingBaseViewer } from './EventStormingBaseViewer.js';
import { eventStormingModelModule } from './model/index.js';
import { boardBoundsModule } from './board-bounds/index.js';
import { eventStormingViewOptionsModule } from './view-options/index.js';
import { eventStormingDrawModule } from './draw/index.js';
import { ioModule } from './io/index.js';

export class Viewer extends EventStormingBaseViewer {
  protected _getModules(): ModuleDeclaration[] {
    return [
      eventStormingModelModule,
      boardBoundsModule,
      eventStormingViewOptionsModule,
      eventStormingDrawModule,
      ioModule,
    ];
  }
}
