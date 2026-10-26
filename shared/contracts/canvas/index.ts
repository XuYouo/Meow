import { z } from 'zod';
import { defineContract } from '../api.js';

const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
export const CanvasPointSchema = z.object({ x: coordinate,y: coordinate }).strict();
export const CanvasStyleSchema = z.object({
  stroke: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fill: z.union([z.literal('transparent'),z.string().regex(/^#[0-9a-fA-F]{6}$/)]),
  strokeWidth: z.number().min(0.5).max(40),
  dash: z.enum(['solid','dashed','dotted']),
  opacity: z.number().min(0).max(1),
  fontSize: z.number().min(8).max(150),
  textAlign: z.enum(['left','center','right']),
}).strict();
const shapeBase = {
  id: z.string().uuid(),x: coordinate,y: coordinate,
  width: z.number().min(0).max(100_000),height: z.number().min(0).max(100_000),
  z: z.number().int().min(0).max(1_000_000),style: CanvasStyleSchema,
  erasures: z.array(CanvasPointSchema.extend({ radius: z.number().min(1).max(1000) }).strict()).max(4000),
};
export const CanvasShapeSchema = z.discriminatedUnion('type',[
  z.object({ ...shapeBase,type: z.literal('rectangle'),cornerRadius: z.number().min(0).max(500) }).strict(),
  z.object({ ...shapeBase,type: z.literal('ellipse') }).strict(),
  z.object({ ...shapeBase,type: z.literal('line'),points: z.array(CanvasPointSchema).min(2).max(2) }).strict(),
  z.object({ ...shapeBase,type: z.literal('arrow'),points: z.array(CanvasPointSchema).min(2).max(2) }).strict(),
  z.object({ ...shapeBase,type: z.literal('pencil'),points: z.array(CanvasPointSchema).min(2).max(4000) }).strict(),
  z.object({ ...shapeBase,type: z.literal('text'),text: z.string().min(1).max(10_000) }).strict(),
  z.object({ ...shapeBase,type: z.literal('image'),mediaId: z.string().uuid(),alt: z.string().max(500) }).strict(),
]);
export const CanvasDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  viewport: z.object({ x: coordinate,y: coordinate,scale: z.number().min(0.1).max(4) }).strict(),
  memoPositions: z.array(z.object({ memoId: z.string().uuid(),x: coordinate,y: coordinate,z: z.number().int().min(0).max(1_000_000) }).strict()).max(5000),
  shapes: z.array(CanvasShapeSchema).max(1000),
}).strict().superRefine((document,context) => {
  if (new Set(document.memoPositions.map((position) => position.memoId)).size !== document.memoPositions.length) context.addIssue({ code: 'custom',message: 'Duplicate memo position' });
  if (new Set(document.shapes.map((shape) => shape.id)).size !== document.shapes.length) context.addIssue({ code: 'custom',message: 'Duplicate canvas shape' });
});
export const CanvasSchema = z.object({ revision: z.number().int().nonnegative(),updatedAt: z.string().datetime().nullable(),document: CanvasDocumentSchema }).strict();
export const SaveCanvasInputSchema = z.object({ operationId: z.string().uuid(),baseRevision: z.number().int().nonnegative(),document: CanvasDocumentSchema }).strict();
export const GetCanvas = defineContract('GET','/api/canvas',z.object({}).strict(),CanvasSchema);
export const SaveCanvas = defineContract('PATCH','/api/canvas',SaveCanvasInputSchema,CanvasSchema);
export type CanvasDocument = z.infer<typeof CanvasDocumentSchema>;
export type CanvasShape = z.infer<typeof CanvasShapeSchema>;
export type CanvasStyle = z.infer<typeof CanvasStyleSchema>;
export type CanvasDTO = z.infer<typeof CanvasSchema>;
export type CanvasPoint = z.infer<typeof CanvasPointSchema>;
