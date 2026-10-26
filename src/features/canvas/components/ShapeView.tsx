import { useEffect, useRef } from 'react';
import { useMediaURL } from '../../media/useMediaURL';
import type { CanvasShape } from '../../../../shared/contracts/canvas';

function CanvasImage({ instanceId,mediaId,width,height,alt }: { instanceId: string;mediaId: string;width: number;height: number;alt: string }) {
  const { url,error }=useMediaURL(instanceId,mediaId);
  return <><image href={url} width={width} height={height} preserveAspectRatio='xMidYMid meet'><title>{alt}</title></image>{error&&<text x='0' y='18' fill='#9f472e' fontSize='12'>{error}</text>}</>;
}
export default function ShapeView({ instanceId,shape,selected,readOnly=false,onSelect,onTextChange }: { readOnly?: boolean;instanceId: string;shape: CanvasShape;selected: boolean;onSelect: () => void;onTextChange: (text: string) => void }) {
  const text=useRef<HTMLDivElement>(null),style=shape.style;
  useEffect(() => { if (!readOnly&&selected&&shape.type==='text') text.current?.focus(); },[readOnly,selected,shape.type]);
  const dash=style.dash==='dashed'?'6 6':style.dash==='dotted'?'2 6':undefined;
  const maskId=`mask-shape-${shape.id}`,arrowId=`arrow-${shape.id}`;
  const common={ stroke: style.stroke,strokeWidth: style.strokeWidth,fill: style.fill==='transparent'?'none':style.fill,strokeDasharray: dash };
  const selectedStyle={ fill: 'none',stroke: '#3b82f6',strokeWidth: style.strokeWidth+2,strokeDasharray: '4 4',opacity: 0.9,pointerEvents: 'none' as const };
  const points='points' in shape?shape.points.map((point) => `${point.x},${point.y}`).join(' '):'';
  return <svg data-shape-root='1' data-canvas-object={`shape:${shape.id}`} style={{ position: 'absolute',left: shape.x,top: shape.y,width: Math.max(shape.width,1),height: Math.max(shape.height,1),overflow: 'visible',zIndex: 1,cursor: selected?'move':undefined }} tabIndex={0} role='button' aria-pressed={selected} aria-disabled={readOnly} onDoubleClick={() => { if (!readOnly) onSelect(); }} onKeyDown={(event) => { if (!readOnly&&(event.key==='Enter'||event.key===' ')) { event.preventDefault();event.stopPropagation();onSelect(); } }} aria-label={`画布${shape.type}`}>
    <defs><mask id={maskId} maskUnits='userSpaceOnUse' x='-100000' y='-100000' width='200000' height='200000'><rect x='-100000' y='-100000' width='200000' height='200000' fill='white' />{shape.erasures.map((point,index) => <circle key={index} cx={point.x} cy={point.y} r={point.radius} fill='black' />)}</mask><marker id={arrowId} markerWidth='10' markerHeight='10' refX='9' refY='3' orient='auto' markerUnits='strokeWidth'><path d='M0,0 L0,6 L9,3 z' fill={style.stroke} /></marker></defs>
    <g opacity={style.opacity} mask={`url(#${maskId})`}>
      {shape.type==='rectangle'&&<rect width={shape.width} height={shape.height} rx={shape.cornerRadius} {...common} />}
      {shape.type==='ellipse'&&<ellipse cx={shape.width/2} cy={shape.height/2} rx={shape.width/2} ry={shape.height/2} {...common} />}
      {(shape.type==='line'||shape.type==='arrow'||shape.type==='pencil')&&<polyline points={points} {...common} fill='none' strokeLinecap={shape.type==='pencil'?'round':undefined} strokeLinejoin={shape.type==='pencil'?'round':undefined} markerEnd={shape.type==='arrow'?`url(#${arrowId})`:undefined} />}
      {shape.type==='text'&&<foreignObject width='200' height='50'><div ref={text} data-shape-id={shape.id} contentEditable={!readOnly} suppressContentEditableWarning style={{ color: style.stroke,fontSize: `${style.fontSize}px`,textAlign: style.textAlign,fontFamily: 'inherit',lineHeight: '1.2',outline: 'none',cursor: 'text',padding: '2px 4px',borderRadius: 2,border: selected?'1px dashed #3b82f6':'1px solid transparent',minWidth: 50,minHeight: 20 }} onPaste={(event) => { event.preventDefault();if (readOnly) return;const value=event.clipboardData.getData('text/plain'),selection=window.getSelection();if (!selection?.rangeCount) return;const range=selection.getRangeAt(0);range.deleteContents();range.insertNode(document.createTextNode(value));range.collapse(false); }} onBlur={(event) => { if (!readOnly) onTextChange(event.currentTarget.textContent??'双击编辑'); }} onKeyDown={(event) => { event.stopPropagation();if (event.key==='Escape') event.currentTarget.blur(); }}>{shape.text}</div></foreignObject>}
      {shape.type==='image'&&<CanvasImage instanceId={instanceId} mediaId={shape.mediaId} width={shape.width} height={shape.height} alt={shape.alt} />}
    </g>
    {selected&&(shape.type==='ellipse'?<ellipse cx={shape.width/2} cy={shape.height/2} rx={shape.width/2} ry={shape.height/2} {...selectedStyle} />:'points' in shape?<polyline points={points} {...selectedStyle} />:<rect width={shape.width} height={shape.height} rx={shape.type==='rectangle'?shape.cornerRadius:0} {...selectedStyle} />)}
  </svg>;
}
