import { afterAll, afterEach, describe, expect, test } from 'vitest';
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
import type EventStormingLabelEditing from '../../src/label-editing/EventStormingLabelEditing.js';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type { EventStormingShape } from '../../src/model/di-types.js';
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

// Shared across instances: every call creates a sticky of its own label, so the kit's collision
// case compares the ids two peers allocate for different stickies.
let createdStickies = 0;

function addDomainEvent(modeler: CollaborativeModeler): void {
  const diagram = diagramOf(modeler);
  const factory = diagram.get<EventStormingElementFactory>('eventStormingElementFactory');
  createdStickies += 1;
  const sticky = factory.createNew('event', `${STICKY_STYLES.event.label} ${createdStickies}`);
  diagram
    .get<Modeling>('modeling')
    .createShape(
      sticky,
      { x: 1240, y: 700 },
      diagram.get<Canvas>('canvas').getRootElement() as Shape,
    );
}

function typedHalfway(fragment: string, typedSoFar: string): string {
  if (!orderCheckout.includes(fragment)) throw new Error(`the fixture lost "${fragment}"`);
  return orderCheckout.replace(fragment, typedSoFar);
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
  // The DSL reads every text (unreadable lines stay in rawPassthrough), backed by its fuzz test.
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
  // damaged forms the DSL meets while a peer types, on top of the probes the kit derives
  probeTexts: [
    typedHalfway('[40, 200]', '[40,'),
    typedHalfway('[660, 320]', '[660,'),
    typedHalfway('Order Placed [660, 320]', 'Order Placed [660, 320] (id event_'),
    typedHalfway('(size 240x120)', '(size 240x'),
    'event Unclosed [10',
  ],
  openInteraction(modeler) {
    const diagram = diagramOf(modeler);
    const sticky = diagram.get<ElementRegistry>('elementRegistry').get('event_order_placed');
    if (!sticky) throw new Error('the imported board has no sticky event_order_placed to edit');
    diagram
      .get<EventStormingLabelEditing>('eventStormingLabelEditing')
      .activate(sticky as EventStormingShape);
    const field = diagram
      .get<Canvas>('canvas')
      .getContainer()
      .querySelector<HTMLTextAreaElement>('textarea.event-storming-label-textarea');
    if (!field) throw new Error('no label editor opened');
    field.value = 'typed, not committed';
  },
  interactionState(modeler) {
    const edit = diagramOf(modeler)
      .get<EventStormingLabelEditing>('eventStormingLabelEditing')
      .openEdit();
    return edit && { elementId: edit.elementId, text: edit.value };
  },
};

// No case is inapplicable to Event Storming: the harness fills every optional hook, and the kit
// takes `invalidTexts: []` as a declaration, not a skip. A skip is therefore a gap in the harness.
const failOnSkip = {
  onSkip(caseName: string, reason: string): never {
    throw new Error(`conformance case skipped: "${caseName}" — ${reason}`);
  },
};

const ID_COLLISION_CASE =
  'elements (when present, recommended): ids created on two peers at the same time do not collide';

const advisories: string[] = [];
const completedCases = new Set<string>();

// A filtered run (`-t`, `.only`) skips cases, so only the advisories of cases that ran are due.
function recordingTest(name: string, run: () => Promise<void>): void {
  test(name, async () => {
    await run();
    completedCases.add(name.replace(/^conformance: /, ''));
  });
}

describe('Event Storming implements the collaborative-modeler contract', () => {
  registerConformance(harness, recordingTest, {
    ...failOnSkip,
    onAdvisory(caseName, advice) {
      advisories.push(`${caseName}: ${advice}`);
    },
  });

  // Known and accepted for now: a new sticky takes the lowest free `event_<n>` of its own
  // instance, so two peers that each add one both allocate 'event_1'. Collision-free ids are a
  // RECOMMENDATION of contract 1.1 (a candidate law for 2.0). The exact list fails on any other
  // advisory, and once this one is fixed, so the note cannot go stale.
  afterAll(() => {
    const expected = completedCases.has(ID_COLLISION_CASE)
      ? [
          expect.stringMatching(
            /^elements \(when present, recommended\): ids created on two peers.*'event_1'/,
          ),
        ]
      : [];
    expect(advisories).toEqual(expected);
  });
});
