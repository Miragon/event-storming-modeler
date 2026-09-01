import type EventBus from 'diagram-js/lib/core/EventBus';
import { isNote } from '../model/di-types.js';
import { NOTE_MIN_RESIZE } from '../draw/styles.js';

interface ResizeStartEvent {
  context: {
    shape?: unknown;
    minDimensions?: { width: number; height: number };
  };
}

/**
 * Clamps interactive note resizing to `NOTE_MIN_RESIZE` the way diagram-js Resize consumes it:
 * a `resize.start` interceptor ABOVE the stock handler (default priority 1000) sets
 * `context.minDimensions`, which the drag then enforces as hard constraints — the preview stops
 * at the minimum instead of entering a not-allowed state (the bpmn-js ResizeBehavior pattern).
 */
export default class EventStormingResizeBehavior {
  static $inject = ['eventBus'];

  constructor(eventBus: EventBus) {
    eventBus.on('resize.start', 1500, (event: ResizeStartEvent) => {
      const context = event.context;
      if (isNote(context.shape)) {
        context.minDimensions = NOTE_MIN_RESIZE;
      }
    });
  }
}
