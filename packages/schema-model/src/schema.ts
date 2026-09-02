import { z } from 'zod';

/**
 * Zod schemas mirror the metamodel (types.ts) and form the runtime validation gate.
 * Coordinates are unbounded board pixels; unique IDs and edge endpoints referencing
 * existing elements are cross-field validated in `validateBoard`.
 */

const coordinateSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const baseFields = {
  id: z.string().min(1),
  label: z.string(),
  position: coordinateSchema,
  color: z.string().optional(),
};

const domainEventSchema = z.object({ ...baseFields, elementType: z.literal('event') });

const commandSchema = z.object({ ...baseFields, elementType: z.literal('command') });

// Pinning: only actor/hotspot/note may carry `attachedTo` (host existence/kind checked in validateBoard).
const attachedTo = z.string().min(1).optional();

const actorSchema = z.object({ ...baseFields, elementType: z.literal('actor'), attachedTo });

const aggregateSchema = z.object({ ...baseFields, elementType: z.literal('aggregate') });

const policySchema = z.object({ ...baseFields, elementType: z.literal('policy') });

const readModelSchema = z.object({ ...baseFields, elementType: z.literal('readmodel') });

const externalSystemSchema = z.object({ ...baseFields, elementType: z.literal('external') });

const hotspotSchema = z.object({ ...baseFields, elementType: z.literal('hotspot'), attachedTo });

// Manual resize override — absent = auto-size from text (decided in the renderer).
const noteSizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
});

// Per-note text alignment — an absent axis means the default left / top.
const noteAlignSchema = z.object({
  horizontal: z.enum(['left', 'center', 'right']).optional(),
  vertical: z.enum(['top', 'middle', 'bottom']).optional(),
});

const noteSchema = z.object({
  ...baseFields,
  elementType: z.literal('note'),
  size: noteSizeSchema.optional(),
  align: noteAlignSchema.optional(),
  attachedTo,
});

const drawingSchema = z.object({
  ...baseFields,
  elementType: z.literal('drawing'),
  points: z.array(coordinateSchema).min(2),
  closed: z.boolean().optional(),
  strokeStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
});

export const boardElementSchema = z.discriminatedUnion('elementType', [
  domainEventSchema,
  commandSchema,
  actorSchema,
  aggregateSchema,
  policySchema,
  readModelSchema,
  externalSystemSchema,
  hotspotSchema,
  noteSchema,
  drawingSchema,
]);

const arrowSchema = z.object({
  id: z.string().min(1),
  edgeType: z.literal('arrow'),
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
});

export const boardEdgeSchema = z.discriminatedUnion('edgeType', [arrowSchema]);

const boardConfigSchema = z.object({
  title: z.string(),
  style: z.enum(['classic', 'dark']).optional(),
  level: z.enum(['big-picture', 'process', 'design']).optional(),
});

export const eventStormingBoardSchema = z.object({
  schemaVersion: z.number().int().positive(),
  config: boardConfigSchema,
  elements: z.array(boardElementSchema),
  edges: z.array(boardEdgeSchema),
  rawPassthrough: z.array(z.string()).optional(),
});

export type EventStormingBoardInput = z.input<typeof eventStormingBoardSchema>;
