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

const actorSchema = z.object({ ...baseFields, elementType: z.literal('actor') });

const aggregateSchema = z.object({ ...baseFields, elementType: z.literal('aggregate') });

const policySchema = z.object({ ...baseFields, elementType: z.literal('policy') });

const readModelSchema = z.object({ ...baseFields, elementType: z.literal('readmodel') });

const externalSystemSchema = z.object({ ...baseFields, elementType: z.literal('external') });

const hotspotSchema = z.object({ ...baseFields, elementType: z.literal('hotspot') });

const noteSchema = z.object({ ...baseFields, elementType: z.literal('note') });

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
});

export const eventStormingBoardSchema = z.object({
  schemaVersion: z.number().int().positive(),
  config: boardConfigSchema,
  elements: z.array(boardElementSchema),
  edges: z.array(boardEdgeSchema),
  rawPassthrough: z.array(z.string()).optional(),
});

export type EventStormingBoardInput = z.input<typeof eventStormingBoardSchema>;
