import type { ModuleDeclaration } from 'didi';
import type CommandStack from 'diagram-js/lib/command/CommandStack';

import ModelingModule from 'diagram-js/lib/features/modeling';
import MoveModule from 'diagram-js/lib/features/move';
import CreateModule from 'diagram-js/lib/features/create';
import ConnectModule from 'diagram-js/lib/features/connect';
import ContextPadModule from 'diagram-js/lib/features/context-pad';
import PaletteModule from 'diagram-js/lib/features/palette';
import RulesModule from 'diagram-js/lib/features/rules';
import OutlineModule from 'diagram-js/lib/features/outline';
import PopupMenuModule from 'diagram-js/lib/features/popup-menu';

import { NavigatedViewer } from './NavigatedViewer.js';
import { eventStormingAttachModule } from './attach/index.js';
import { eventStormingModelingModule } from './modeling/index.js';
import { eventStormingLassoModule } from './lasso/index.js';
import { eventStormingRulesModule } from './rules/index.js';
import { elementSnappingModule } from './snapping/index.js';
import { eventStormingPaletteModule } from './palette/index.js';
import { eventStormingContextPadModule } from './context-pad/index.js';
import { labelEditingModule } from './label-editing/index.js';
import { eventStormingKeyboardModule } from './keyboard/index.js';
import { eventStormingPopupModule } from './popup/index.js';
import { eventStormingAppendModule } from './append/index.js';
import { eventStormingColorPickerModule } from './color-picker/index.js';
import { eventStormingOrderingModule } from './ordering/index.js';
import { eventStormingDrawToolModule } from './draw-tool/index.js';
import { eventStormingResizeModule } from './resize/index.js';

/**
 * Full Event Storming editor: palette/create, free move with sticky-center snapping, connect
 * with rules, context pad, inline label editing, undo/redo, pinning of actor/hotspot stickies,
 * free resizing of notes.
 */
export class Modeler extends NavigatedViewer {
  protected override _getModules(): ModuleDeclaration[] {
    return [
      ...super._getModules(),
      ModelingModule,
      RulesModule,
      MoveModule,
      CreateModule,
      ConnectModule,
      ContextPadModule,
      PaletteModule,
      OutlineModule,
      PopupMenuModule,
      eventStormingModelingModule,
      eventStormingAttachModule,
      eventStormingRulesModule,
      elementSnappingModule,
      eventStormingPaletteModule,
      eventStormingContextPadModule,
      labelEditingModule,
      eventStormingKeyboardModule,
      eventStormingPopupModule,
      eventStormingAppendModule,
      eventStormingColorPickerModule,
      eventStormingLassoModule,
      eventStormingOrderingModule,
      eventStormingDrawToolModule,
      eventStormingResizeModule,
    ];
  }

  undo(): void {
    this.get<CommandStack>('commandStack').undo();
  }

  redo(): void {
    this.get<CommandStack>('commandStack').redo();
  }

  canUndo(): boolean {
    return this.get<CommandStack>('commandStack').canUndo();
  }

  canRedo(): boolean {
    return this.get<CommandStack>('commandStack').canRedo();
  }
}
