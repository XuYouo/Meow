import { describe, expect, it } from 'vitest';
import { CanvasDocumentSchema } from '../shared/contracts/canvas/index.js';
import { defaultStyle, emptyDocument, eraseShapes, makeShape, moveObjects, reorderLayers, shapeBounds, shapeHit, toWorld, zoomAt } from '../src/features/canvas/functions/geometry.js';

const first='a54ef9d1-74e3-4799-9da9-2b02438104e0',second='ab36551a-bc85-4bd3-874d-30d6d10df3a3';
describe('canvas geometric behavior',() => {
  it('keeps the world point under the cursor fixed during bounded zoom',() => {
    const viewport={ x: -100,y: 50,scale: 0.5 },point={ x: 250,y: 180 };
    const world=toWorld(point,viewport),zoomed=zoomAt(viewport,point,2);
    expect(toWorld(point,zoomed)).toEqual(world);
    expect(zoomAt(viewport,point,100).scale).toBe(4);
    expect(zoomAt(viewport,point,0.001).scale).toBe(0.1);
  });
  it('creates all drawing tools with valid normalized bounds and relative freehand geometry',() => {
    for (const tool of ['rectangle','ellipse','text','arrow','line','pencil'] as const) {
      const shape=makeShape(tool,{ x: 20,y: 40 },{ x: -30,y: 10 },[{ x: 20,y: 40 },{ x: -5,y: 15 },{ x: -30,y: 10 }],defaultStyle,first,1);
      expect(() => CanvasDocumentSchema.parse({ ...emptyDocument,shapes: [shape] })).not.toThrow();
      if (tool!=='text') expect(shapeBounds(shape)).toEqual({ x: -30,y: 10,width: 50,height: 30 });
    }
  });
  it('moves mixed selected notes and shapes without changing local erasure masks or non-selected items',() => {
    const shape={ ...makeShape('rectangle',{ x: 0,y: 0 },{ x: 100,y: 80 },[],defaultStyle,first,1),erasures: [{ x: 10,y: 10,radius: 5 }] };
    const value={ ...emptyDocument,shapes: [shape],memoPositions: [{ memoId: second,x: 0,y: 0,z: 2 }] };
    const moved=moveObjects(value,new Set([`shape:${first}`,`memo:${second}`]),{ x: -50,y: 20 });
    expect(moved.shapes[0]?.x).toBe(-50);expect(moved.shapes[0]?.erasures).toEqual(shape.erasures);
    expect(moved.memoPositions[0]).toEqual({ memoId: second,x: -50,y: 20,z: 2 });
    expect(value.memoPositions[0]?.x).toBe(0);
  });
  it('erases part of a stroke or its entire object while preserving unrelated notes',() => {
    const line=makeShape('line',{ x: 0,y: 0 },{ x: 100,y: 100 },[],defaultStyle,first,1);
    const value={ ...emptyDocument,shapes: [line],memoPositions: [{ memoId: second,x: 50,y: 50,z: 2 }] };
    expect(shapeHit(line,{ x: 40,y: 42 },3)).toBe(true);
    expect(shapeHit(line,{ x: 20,y: 80 },3)).toBe(false);
    const partial=eraseShapes(value,{ x: 50,y: 50 },8,false);
    expect(partial.shapes[0]?.erasures).toEqual([{ x: 50,y: 50,radius: 8 }]);
    expect(eraseShapes(value,{ x: 50,y: 50 },8,true).shapes).toEqual([]);
    expect(partial.memoPositions).toEqual(value.memoPositions);
  });
  it('uses one layer order across memo cards and shapes for front/back actions',() => {
    const shape=makeShape('ellipse',{ x: 0,y: 0 },{ x: 50,y: 50 },[],defaultStyle,first,8);
    const value={ ...emptyDocument,shapes: [shape],memoPositions: [{ memoId: second,x: 0,y: 0,z: 2 }] };
    const moved=reorderLayers(value,new Set([`memo:${second}`]),true);
    expect(moved.memoPositions[0]?.z).toBe(1);expect(moved.shapes[0]?.z).toBe(0);
    const back=reorderLayers(moved,new Set([`memo:${second}`]),false);
    expect(back.memoPositions[0]?.z).toBe(0);expect(back.shapes[0]?.z).toBe(1);
  });
});
