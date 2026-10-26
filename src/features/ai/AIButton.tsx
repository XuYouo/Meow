import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bot } from 'lucide-react';

import { useTheme } from '../presentation/PresentationContext';

interface AIButtonProps {
  isSettingsOpen: boolean; isShareDialogOpen: boolean; isEditorFocused: boolean; enabled?: boolean;
  onContinue?: () => void; onOptimize?: () => void; onChat?: () => void;
}
const AIButton = ({ isSettingsOpen, isShareDialogOpen, isEditorFocused, onContinue, onOptimize, onChat, enabled = true }: AIButtonProps) => {
  const { themeColor } = useTheme();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showSubButtons, setShowSubButtons] = useState(false);
  const [showChatButton, setShowChatButton] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const positionInitialized = useRef(false);

  // 初始化按钮位置到右下角
  useEffect(() => {
    const updatePosition = () => {
      if (buttonRef.current) {
        const buttonWidth = buttonRef.current.offsetWidth;
        const buttonHeight = buttonRef.current.offsetHeight;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        // 默认位置在右下角，距离边缘20px
        setPosition({
          x: windowWidth - buttonWidth - 20,
          y: windowHeight - buttonHeight - 20
        });
        positionInitialized.current = true;
      }
    };

    // 延迟执行以确保DOM已经渲染
    const timer = setTimeout(() => {
      updatePosition();
    }, 100);

    window.addEventListener('resize', updatePosition);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updatePosition);
    };
  }, []);

  // 处理鼠标按下事件
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (!enabled) return;
    
    setIsDragging(true);
    if (!buttonRef.current) return;
    const buttonRect = buttonRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - buttonRect.left,
      y: e.clientY - buttonRect.top
    });
    
    // 添加拖动时的样式
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    
    // 防止文本选择
    e.preventDefault();
  }, [enabled]);

  // 处理鼠标移动事件
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !enabled || !buttonRef.current) return;
    
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const buttonWidth = buttonRef.current.offsetWidth;
    const buttonHeight = buttonRef.current.offsetHeight;
    
    // 计算新位置，确保按钮不会移出窗口
    let newX = e.clientX - dragOffset.x;
    let newY = e.clientY - dragOffset.y;
    
    // 限制在窗口范围内
    newX = Math.max(0, Math.min(newX, windowWidth - buttonWidth));
    newY = Math.max(0, Math.min(newY, windowHeight - buttonHeight));
    
    // 使用requestAnimationFrame优化拖动性能
    requestAnimationFrame(() => {
      setPosition({ x: newX, y: newY });
    });
  }, [isDragging, dragOffset, enabled]);

  // 处理鼠标释放事件
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    // 恢复样式
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, []);

  // 添加/移除事件监听器
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 处理点击事件
  const handleClick = () => {
    if (!enabled) return;
    
    if (isEditorFocused) {
      // 编辑器聚焦时，显示圆形小按钮
      if (showSubButtons) {
        // 如果已经显示，则收起
        setShowSubButtons(false);
        setIsAnimating(true);
        setTimeout(() => setIsAnimating(false), 300);
      } else {
        // 如果未显示，则展开
        setShowSubButtons(true);
        setShowChatButton(false);
      }
    } else {
      // 非编辑器聚焦时，显示对话小按钮
      if (showChatButton) {
        // 如果已经显示，则收起
        setShowChatButton(false);
        setIsAnimating(true);
        setTimeout(() => setIsAnimating(false), 300);
      } else {
        // 如果未显示，则展开
        setShowChatButton(true);
        setShowSubButtons(false);
      }
    }
  };

  // 处理续写按钮点击
  const handleContinueClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setShowSubButtons(false);
    onContinue?.();
  };

  // 处理优化按钮点击
  const handleOptimizeClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setShowSubButtons(false);
    onOptimize?.();
  };

  // 处理对话按钮点击
  const handleChatClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setShowChatButton(false);
    onChat?.();
  };

  // 点击其他区域关闭小按钮
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (buttonRef.current && event.target instanceof Node && !buttonRef.current.contains(event.target)) {
        setShowSubButtons(false);
        setShowChatButton(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 如果设置卡片/分享对话框打开，或者AI功能未启用，则不显示按钮
  if (isSettingsOpen || isShareDialogOpen || !enabled) {
    return null;
  }

  // 计算小按钮位置
  const getSubButtonPositions = () => {
    if (!buttonRef.current) return [];
    
    const buttonRect = buttonRef.current.getBoundingClientRect();
    const centerX = buttonRect.left + buttonRect.width / 2;
    const centerY = buttonRect.top + buttonRect.height / 2;
    const radius = 60; // 小按钮距离主按钮的距离
    
    return [
      { // 续写按钮
        x: centerX - radius,
        y: centerY,
        label: '续'
      },
      { // 优化按钮
        x: centerX + radius,
        y: centerY,
        label: '优'
      }
    ];
  };

  // 计算对话按钮位置
  const getChatButtonPosition = () => {
    if (!buttonRef.current) return { x: 0, y: 0 };
    
    const buttonRect = buttonRef.current.getBoundingClientRect();
    const centerX = buttonRect.left + buttonRect.width / 2;
    const centerY = buttonRect.top + buttonRect.height / 2;
    
    return {
      x: centerX,
      y: centerY - 60
    };
  };

  const subButtonPositions = getSubButtonPositions();
  const chatButtonPosition = getChatButtonPosition();

  return (
    <>
      {/* 主AI按钮 */}
      <button
        ref={buttonRef}
        aria-label='AI 助手'
        className={`fixed z-40 flex items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
          isDragging ? 'cursor-grabbing scale-110 shadow-xl' : 'cursor-grab hover:scale-105 hover:shadow-xl'
        }`}
        style={{
          left: positionInitialized.current ? `${position.x}px` : 'auto',
          top: positionInitialized.current ? `${position.y}px` : 'auto',
          right: positionInitialized.current ? 'auto' : '20px',
          bottom: positionInitialized.current ? 'auto' : '20px',
          width: '56px',
          height: '56px',
          backgroundColor: themeColor,
          color: 'white',
          transition: isDragging ? 'none' : 'all 0.2s ease',
          zIndex: showSubButtons || showChatButton ? 41 : 40
        }}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
      >
        <Bot className="h-6 w-6" />
      </button>

      {/* 圆形小按钮 - 编辑器聚焦时显示 */}
      {subButtonPositions.map((pos, index) => (
        <button
          key={index}
          className={`fixed z-40 flex items-center justify-center rounded-full shadow-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white hover:shadow-xl ${
            isAnimating ? 'transition-all duration-500 cubic-bezier(0.34, 1.56, 0.64, 1)' : 'transition-all duration-500 cubic-bezier(0.34, 1.56, 0.64, 1)'
          }`}
          style={{
            left: buttonRef.current
              ? `${buttonRef.current.getBoundingClientRect().left + buttonRef.current.offsetWidth / 2 - 18}px`
              : `${pos.x - 18}px`,
            top: buttonRef.current
              ? `${buttonRef.current.getBoundingClientRect().top + buttonRef.current.offsetHeight / 2 - 18}px`
              : `${pos.y - 18}px`,
            width: '36px',
            height: '36px',
            opacity: showSubButtons ? 1 : 0,
            transform: showSubButtons
              ? `translate(${pos.x - (buttonRef.current ? buttonRef.current.getBoundingClientRect().left + buttonRef.current.offsetWidth / 2 : pos.x)}px, ${pos.y - (buttonRef.current ? buttonRef.current.getBoundingClientRect().top + buttonRef.current.offsetHeight / 2 : pos.y)}px) scale(1)`
              : 'translate(0, 0) scale(0)',
            transitionDelay: showSubButtons ? `${index * 100}ms` : '0ms'
          }}
          onClick={index === 0 ? handleContinueClick : handleOptimizeClick}
          title={index === 0 ? '会在当前编辑器文字后追加续写' : '会替换掉当前编辑器内的文字'}
        >
          <span className="text-sm font-medium">{pos.label}</span>
        </button>
      ))}

      {/* 对话小按钮 - 非编辑器聚焦时显示 */}
      <button
        className={`fixed z-40 flex items-center justify-center rounded-full shadow-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white hover:shadow-xl ${
          isAnimating ? 'transition-all duration-500 cubic-bezier(0.34, 1.56, 0.64, 1)' : 'transition-all duration-500 cubic-bezier(0.34, 1.56, 0.64, 1)'
        }`}
        style={{
          left: buttonRef.current
            ? `${buttonRef.current.getBoundingClientRect().left + buttonRef.current.offsetWidth / 2 - 18}px`
            : `${chatButtonPosition.x - 18}px`,
          top: buttonRef.current
            ? `${buttonRef.current.getBoundingClientRect().top + buttonRef.current.offsetHeight / 2 - 18}px`
            : `${chatButtonPosition.y - 18}px`,
          width: '36px',
          height: '36px',
          opacity: showChatButton ? 1 : 0,
          transform: showChatButton
            ? `translate(${chatButtonPosition.x - (buttonRef.current ? buttonRef.current.getBoundingClientRect().left + buttonRef.current.offsetWidth / 2 : chatButtonPosition.x)}px, ${chatButtonPosition.y - (buttonRef.current ? buttonRef.current.getBoundingClientRect().top + buttonRef.current.offsetHeight / 2 : chatButtonPosition.y)}px) scale(1)`
            : 'translate(0, 0) scale(0)',
          transitionDelay: showChatButton ? '150ms' : '0ms'
        }}
        onClick={handleChatClick}
      >
        <span className="text-sm font-medium">话</span>
      </button>
    </>
  );
};

export default AIButton;