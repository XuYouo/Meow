import type { CanvasDocument, CanvasPoint, CanvasShape, CanvasStyle } from '../../../../shared/contracts/canvas';

export type DrawingTool = 'rectangle' | 'ellipse' | 'text' | 'arrow' | 'line' | 'pencil';
export const defaultStyle: CanvasStyle = { stroke: '#3b82f6',fill: 'transparent',strokeWidth: 2,dash: 'solid',opacity: 1,fontSize: 16,textAlign: 'left' };
export const emptyDocument: CanvasDocument = { schemaVersion: 1,viewport: { x: 0,y: 0,scale: 1 },memoPositions: [],shapes: [] };
export function toWorld(point: CanvasPoint,viewport: CanvasDocument['viewport']): CanvasPoint { return { x: (point.x-viewport.x)/viewport.scale,y: (point.y-viewport.y)/viewport.scale }; }
export function zoomAt(viewport: CanvasDocument['viewport'],point: CanvasPoint,factor: number): CanvasDocument['viewport'] {
  const scale = Math.min(4,Math.max(0.1,viewport.scale*factor));
  const world = toWorld(point,viewport);
  return { x: point.x-world.x*scale,y: point.y-world.y*scale,scale };
}
export function nextLayer(document: CanvasDocument): number { return Math.max(0,...document.shapes.map((shape) => shape.z),...document.memoPositions.map((position) => position.z))+1; }
export function makeShape(tool: DrawingTool,start: CanvasPoint,end: CanvasPoint,points: CanvasPoint[],style: CanvasStyle,id: string,z: number): CanvasShape {
  const box = { id,x: Math.min(start.x,end.x),y: Math.min(start.y,end.y),width: Math.max(1,Math.abs(end.x-start.x)),height: Math.max(1,Math.abs(end.y-start.y)),z,style: { ...style },erasures: [] };
  if (tool === 'rectangle') return { ...box,type: tool,cornerRadius: 8 };
  if (tool === 'ellipse') return { ...box,type: tool };
  if (tool === 'text') return { ...box,x: start.x,y: start.y,width: 200,height: style.fontSize*1.5,type: tool,text: '双击或在选项中编辑文字' };
  return { ...box,x: start.x,y: start.y,type: tool,points: (tool === 'pencil' ? points.length > 1 ? points : [start,end] : [start,end]).slice(0,4000).map((point) => ({ x: point.x-start.x,y: point.y-start.y })) };
}
export function shapeBounds(shape: CanvasShape): { x: number;y: number;width: number;height: number } {
  if ('points' in shape) {
    const xs = shape.points.map((point) => point.x),ys = shape.points.map((point) => point.y);
    const x = Math.min(...xs),y = Math.min(...ys);
    return { x: shape.x+x,y: shape.y+y,width: Math.max(1,Math.max(...xs)-x),height: Math.max(1,Math.max(...ys)-y) };
  }
  return { x: shape.x,y: shape.y,width: shape.width,height: shape.height };
}
function segmentDistance(point: CanvasPoint,start: CanvasPoint,end: CanvasPoint): number {
  const dx=end.x-start.x,dy=end.y-start.y;
  const denominator=dx*dx+dy*dy;
  const t=denominator===0?0:Math.max(0,Math.min(1,((point.x-start.x)*dx+(point.y-start.y)*dy)/denominator));
  return Math.hypot(point.x-start.x-t*dx,point.y-start.y-t*dy);
}
export function shapeHit(shape: CanvasShape,point: CanvasPoint,radius = 5): boolean {
  const local = { x: point.x-shape.x,y: point.y-shape.y };
  if ('points' in shape) return shape.points.some((end,index) => index>0 && segmentDistance(local,shape.points[index-1] ?? end,end)<=radius+shape.style.strokeWidth/2);
  if (shape.type==='ellipse') {
    const rx=Math.max(shape.width/2,1),ry=Math.max(shape.height/2,1),distance=Math.sqrt(((local.x-rx)/rx)**2+((local.y-ry)/ry)**2);
    if (shape.style.fill!=='transparent'&&distance<=1) return true;
    return Math.abs(distance-1)<=(shape.style.strokeWidth/Math.min(rx,ry))+0.1+radius/Math.min(rx,ry);
  }
  if (shape.type==='rectangle'&&shape.style.fill==='transparent') {
    const tolerance=radius+shape.style.strokeWidth/2+4;
    return local.x>=-tolerance&&local.y>=-tolerance&&local.x<=shape.width+tolerance&&local.y<=shape.height+tolerance&&(Math.min(Math.abs(local.x),Math.abs(local.y),Math.abs(local.x-shape.width),Math.abs(local.y-shape.height))<=tolerance);
  }
  return local.x>=-radius && local.y>=-radius && local.x<=shape.width+radius && local.y<=shape.height+radius;
}
export function moveObjects(document: CanvasDocument,ids: Set<string>,delta: CanvasPoint): CanvasDocument {
  return { ...document,shapes: document.shapes.map((shape) => ids.has(`shape:${shape.id}`)?{ ...shape,x: shape.x+delta.x,y: shape.y+delta.y }:shape),memoPositions: document.memoPositions.map((position) => ids.has(`memo:${position.memoId}`)?{ ...position,x: position.x+delta.x,y: position.y+delta.y }:position) };
}
export function reorderLayers(document: CanvasDocument,ids: Set<string>,front: boolean): CanvasDocument {
  const order = [...document.shapes.map((shape) => ({ key: `shape:${shape.id}`,z: shape.z })),...document.memoPositions.map((position) => ({ key: `memo:${position.memoId}`,z: position.z }))].sort((a,b) => a.z-b.z);
  const selected=order.filter((item) => ids.has(item.key)),other=order.filter((item) => !ids.has(item.key));
  const ranks=new Map((front?[...other,...selected]:[...selected,...other]).map((item,index) => [item.key,index]));
  return { ...document,shapes: document.shapes.map((shape) => ({ ...shape,z: ranks.get(`shape:${shape.id}`)??0 })),memoPositions: document.memoPositions.map((position) => ({ ...position,z: ranks.get(`memo:${position.memoId}`)??0 })) };
}
export function eraseShapes(document: CanvasDocument,point: CanvasPoint,radius: number,whole: boolean): CanvasDocument {
  const hit=document.shapes.filter((shape) => shapeHit(shape,point,radius));
  const ids=new Set(hit.map((shape) => shape.id));
  return { ...document,shapes: whole?document.shapes.filter((shape) => !ids.has(shape.id)):document.shapes.map((shape) => ids.has(shape.id)?{ ...shape,erasures: [...shape.erasures,{ x: point.x-shape.x,y: point.y-shape.y,radius }].slice(-4000) }:shape) };
}
