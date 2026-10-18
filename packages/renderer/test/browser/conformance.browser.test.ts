import { afterEach, describe, test } from 'vitest';
import {
  attachedHost,
  registerConformance,
  type ConformanceHarness,
} from '@miragon/modeler-api/conformance';
import type { CollaborativeModeler } from '@miragon/modeler-api';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type { Shape } from 'diagram-js/lib/model/Types';
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeEventStormingModeler,
} from '../../src/index.js';
import type EventStormingElementFactory from '../../src/model/EventStormingElementFactory.js';
import type EventStormingModeling from '../../src/modeling/EventStormingModeling.js';
import { STICKY_STYLES } from '../../src/draw/styles.js';
import orderCheckout from './fixtures/order-checkout.storm?raw';
import orderCheckoutLoose from './fixtures/order-checkout.loose.storm?raw';
import orderCheckoutForeign from './fixtures/order-checkout.foreign.storm?raw';
import warehouseBigPicture from './fixtures/warehouse-big-picture.storm?raw';
import warehouseBigPictureLoose from './fixtures/warehouse-big-picture.loose.storm?raw';

const hostWrappers: HTMLElement[] = [];

afterEach(() => {
  for (const wrapper of hostWrappers.splice(0)) wrapper.remove();
});

function mountedHost(): HTMLElement {
  const host = attachedHost();
  if (host.parentElement) hostWrappers.push(host.parentElement);
  return host;
}

function diagramOf(modeler: CollaborativeModeler): CollaborativeEventStormingModeler['diagram'] {
  return (modeler as CollaborativeEventStormingModeler).diagram;
}

function addDomainEvent(modeler: CollaborativeModeler): void {
  const diagram = diagramOf(modeler);
  const factory = diagram.get<EventStormingElementFactory>('eventStormingElementFactory');
  const sticky = factory.createNew('event', STICKY_STYLES.event.label);
  diagram
    .get<Modeling>('modeling')
    .createShape(
      sticky,
      { x: 1240, y: 700 },
      diagram.get<Canvas>('canvas').getRootElement() as Shape,
    );
}

function toggleLevel(modeler: CollaborativeModeler): void {
  const modeling = diagramOf(modeler).get<EventStormingModeling>('eventStormingModeling');
  modeling.setLevel(modeling.getLevel() === 'design' ? 'process' : 'design');
}

const harness: ConformanceHarness = {
  async create() {
    const modeler = createCollaborativeModeler();
    modeler.attachTo(mountedHost());
    return modeler;
  },
  async createReadonly() {
    const viewer = createCollaborativeViewer();
    viewer.attachTo(mountedHost());
    return viewer;
  },
  canonicalTexts: [orderCheckout, warehouseBigPicture],
  looseTexts: [orderCheckoutLoose, warehouseBigPictureLoose],
  invalidTexts: [],
  foreignTexts: [
    { text: orderCheckoutForeign, mustSurvive: ['x-vendor: keep-me', 'owner team-checkout'] },
  ],
  viewState: { x: 120, y: 80, width: 640, height: 480 },
  mutate: addDomainEvent,
  configMutations: [{ name: 'level', run: toggleLevel }],
  undo: (modeler) => diagramOf(modeler).get<CommandStack>('commandStack').undo(),
  redo: (modeler) => diagramOf(modeler).get<CommandStack>('commandStack').redo(),
  settle: () => new Promise((resolve) => setTimeout(resolve, 30)),
};

const failOnSkip = {
  onSkip(caseName: string, reason: string): never {
    throw new Error(`conformance case skipped: "${caseName}" — ${reason}`);
  },
};

describe('Event Storming implements the collaborative-modeler contract', () => {
  registerConformance(harness, test, failOnSkip);
});
