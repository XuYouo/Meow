import { useState } from 'react';

export default function Spoiler({ text = '', styleType = 'blur', color }: { text: string; styleType?: 'blur' | 'box'; color?: string }) {
  const [revealed, setRevealed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isVisible = revealed || hovered;
  const handlers = { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false), onClick: (event: React.MouseEvent) => { event.stopPropagation(); setRevealed((value) => !value); }, role: 'button', tabIndex: 0, 'aria-label': '显示或隐藏剧透', 'aria-expanded': isVisible, onKeyDown: (event: React.KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setRevealed((value) => !value); } }, className: 'inline-block align-baseline cursor-pointer transition-all duration-150' };
  if (styleType === 'box') return <span {...handlers} style={isVisible ? { backgroundColor: 'transparent' } : { backgroundColor: color && /^#[a-f0-9]{3,8}$/i.test(color) ? color : '#000', borderRadius: 4, padding: '0.1em 0.25em' }}><span style={{ color: isVisible ? 'inherit' : 'transparent', textShadow: isVisible ? 'none' : '0 0 0 transparent' }}>{text}</span></span>;
  return <span {...handlers}><span style={{ filter: isVisible ? 'none' : 'blur(5px)', transition: 'filter 150ms ease' }}>{text}</span></span>;
}
