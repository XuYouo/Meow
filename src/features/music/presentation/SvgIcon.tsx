import type { CSSProperties } from 'react';

// 简化版 SvgIcon：通过 <img> 引用 public/svgs 下的图标，支持可选颜色滤镜
export default function SvgIcon({ name, width = 24, height = 24, className = '', color = 'currentColor' }: { name: string; width?: number; height?: number; className?: string; color?: string }) {
  const style: CSSProperties = {};
  const filter = getColorFilter(color);
  if (filter) style.filter = filter;

  return (
    <img
      src={`/svgs/${name}.svg`}
      alt={name}
      width={width}
      height={height}
      className={className}
      style={style}
      draggable={false}
    />
  );
}

function getColorFilter(color: string) {
  if (!color || color === 'currentColor') return '';
  const map: Record<string, string> = {
    '#fff': 'invert(100%)',
    '#ffffff': 'invert(100%)',
    white: 'invert(100%)',
    '#000': 'invert(0%)',
    '#000000': 'invert(0%)',
    black: 'invert(0%)',
    '#6b7280': 'invert(52%) sepia(6%) saturate(640%) hue-rotate(185deg) brightness(93%) contrast(88%)',
    '#9ca3af': 'invert(64%) sepia(11%) saturate(297%) hue-rotate(185deg) brightness(97%) contrast(87%)',
    '#ff0000': 'invert(13%) sepia(99%) saturate(7404%) hue-rotate(4deg) brightness(97%) contrast(118%)',
    red: 'invert(13%) sepia(99%) saturate(7404%) hue-rotate(4deg) brightness(97%) contrast(118%)',
  };
  return map[String(color).toLowerCase()] || '';
}
