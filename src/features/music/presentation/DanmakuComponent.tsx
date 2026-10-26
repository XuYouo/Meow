import { useState, useEffect, useRef, useCallback } from 'react';

interface Danmaku { id: string; text: string; top: number; left: number; speed: number; opacity: number; fontSize: number; color: string }

const DanmakuComponent = ({
  isVisible,
  text, // backward-compatible single text
  getText, // optional: function to get dynamic text each spawn
  texts, // optional: array of candidates
  opacity = 0.8,
  speed = 5,
  isLoop = true,
  maxLines = 10,
  screenRatio = 0.5,
  interval = 1000,
  fontSize = 16,
  color = '#ffffff',
  density = 5,
  randomHeight = true,
  randomSpeed = true,
  randomSize = true,
  zIndex = 10,
}: {
  isVisible: boolean; text?: string; getText?: () => string; texts?: string[];
  opacity?: number; speed?: number; isLoop?: boolean; maxLines?: number; screenRatio?: number; interval?: number;
  fontSize?: number; color?: string; density?: number; randomHeight?: boolean; randomSpeed?: boolean; randomSize?: boolean; zIndex?: number;
}) => {
  const [danmakus, setDanmakus] = useState<Danmaku[]>([]);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);

  const MAX_DANMAKU_COUNT = 50;

  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = !document.hidden;
      setIsPageVisible(visible);
      if (!visible) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
      } else {
        setDanmakus([]);
        lastTimeRef.current = performance.now();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const createDanmaku = useCallback(() => {
    const containerHeight = window.innerHeight * screenRatio;
    const lineHeight = fontSize * 1.5;
    const maxTop = Math.max(0, containerHeight - lineHeight);
    // Determine content per item
    let content = text;
    try {
      if (typeof getText === 'function') {
        content = getText();
      } else if (Array.isArray(texts) && texts.length) {
        content = texts[Math.floor(Math.random() * texts.length)];
      }
    } catch {
      // fallback to provided text on any error
      content = text;
    }
    return {
      id: crypto.randomUUID(),
      text: content ?? '',
      top: randomHeight ? Math.random() * maxTop : Math.random() * maxLines * lineHeight,
      left: window.innerWidth,
      speed: randomSpeed ? speed * (0.5 + Math.random()) : speed,
      opacity: opacity * (0.7 + Math.random() * 0.3),
      fontSize: randomSize ? fontSize * (0.8 + Math.random() * 0.4) : fontSize,
      color,
    };
  }, [text, getText, texts, screenRatio, fontSize, randomHeight, maxLines, randomSpeed, speed, opacity, randomSize, color]);

  const addDanmaku = useCallback(() => {
    if (!isVisible || !isPageVisible) return;
    setDanmakus((prev) => {
      let current = prev;
      if (current.length >= MAX_DANMAKU_COUNT) {
        current = current.slice(-MAX_DANMAKU_COUNT + density);
      }
      const newItems: Danmaku[] = [];
      for (let i = 0; i < density; i++) newItems.push(createDanmaku());
      return [...current, ...newItems];
    });
  }, [isVisible, isPageVisible, density, createDanmaku]);

  const updateDanmakus = useCallback((currentTime: number) => {
    if (currentTime - lastTimeRef.current < 16) {
      if (isVisible && isPageVisible) {
        animationRef.current = requestAnimationFrame(updateDanmakus);
      }
      return;
    }
    lastTimeRef.current = currentTime;
    setDanmakus((prev) => prev
      .map((d) => ({ ...d, left: d.left - d.speed }))
      .filter((d) => d.left > -300));
    if (isVisible && isPageVisible) {
      animationRef.current = requestAnimationFrame(updateDanmakus);
    }
  }, [isVisible, isPageVisible]);

  useEffect(() => {
    if (isVisible && isPageVisible) {
      addDanmaku();
      if (isLoop) intervalRef.current = setInterval(addDanmaku, interval);
      lastTimeRef.current = performance.now();
      animationRef.current = requestAnimationFrame(updateDanmakus);
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
      if (!isVisible) setDanmakus([]);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isVisible, isPageVisible, isLoop, interval, addDanmaku, updateDanmakus]);

  useEffect(() => {
    const onResize = () => setDanmakus([]);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!isVisible) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ height: `${screenRatio * 100}%`, zIndex }}
    >
      {danmakus.map((d) => (
        <div
          key={d.id}
          className="absolute whitespace-nowrap select-none"
          style={{
            top: `${d.top}px`,
            left: `${d.left}px`,
            opacity: d.opacity,
            fontSize: `${d.fontSize}px`,
            color: d.color,
            textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
            fontWeight: 'bold',
            transform: 'translateZ(0)',
            willChange: 'transform',
          }}
        >
          {d.text}
        </div>
      ))}
    </div>
  );
};

export default DanmakuComponent;
