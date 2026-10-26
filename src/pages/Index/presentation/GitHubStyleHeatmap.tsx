import { useState, type MouseEvent } from 'react';
import { format, getYear } from 'date-fns';
import { useTheme } from '../../../features/presentation/PresentationContext';

const GitHubStyleHeatmap = ({ data = [], onDateClick, isSidebarHovered = false }: { data?: {date:string;count:number}[]; onDateClick?: (date:string)=>void; isSidebarHovered?: boolean }) => {
  const events: Record<string, number> = Object.fromEntries(data.map((item) => [item.date, item.count]));
  const [tooltip, setTooltip] = useState({ show: false, content: '', x: 0, y: 0 });
  const { darkMode } = useTheme();

  // 获取当前季度
  const getCurrentQuarter = () => {
    const month = new Date().getMonth();
    return Math.floor(month / 3) + 1;
  };

  // 获取当前年份
  const getCurrentYear = () => {
    return new Date().getFullYear();
  };

  // 生成日历网格 - 按季度显示
  const generateCalendar = () => {
    const grid = [];
    const currentYear = getCurrentYear();
    const currentQuarter = getCurrentQuarter();
    
    // 计算当前季度的起始和结束月份
    const startMonth = (currentQuarter - 1) * 3;
    const endMonth = startMonth + 2;
    
    const startDate = new Date(currentYear, startMonth, 1);
    const endDate = new Date(currentYear, endMonth + 1, 0); // 月末

    // 计算第一周的开始日期（周日开始）
    const firstWeekStart = new Date(startDate);
    firstWeekStart.setDate(startDate.getDate() - startDate.getDay());

    // 计算最后一周的结束日期
    const lastWeekEnd = new Date(endDate);
    lastWeekEnd.setDate(endDate.getDate() + (6 - endDate.getDay()));

    // 按周生成日历
    for (let weekStart = new Date(firstWeekStart); weekStart <= lastWeekEnd; weekStart.setDate(weekStart.getDate() + 7)) {
      const weekColumn = [];
      
      // 为每周的7天创建单元格
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const currentDate = new Date(weekStart);
        currentDate.setDate(weekStart.getDate() + dayOffset);
        
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const isCurrentYear = getYear(currentDate) === currentYear;
        const eventCount = events[dateStr] ?? 0;
        const level = Math.min(eventCount, 4);
        
        weekColumn.push(
          <div 
            key={dateStr}
            className={`rounded-sm cursor-pointer transition-all ${!isCurrentYear ? 'opacity-30' : ''} ${eventCount > 0 ? 'hover:opacity-80' : ''}`}
            style={{ 
              backgroundColor: getLevelColor(level),
              width: '100%',
              height: '100%',
              aspectRatio: '1/1', // 保持正方形
              borderRadius: '2px' // 圆角正方形
            }}
            onMouseEnter={(e) => showTooltip(e, dateStr, eventCount)}
            onMouseLeave={hideTooltip}
            onClick={() => handleDateClick(dateStr, eventCount)}
          />
        );
      }
      
      grid.push(
        <div key={weekStart.toString()} className="flex flex-col gap-1 flex-1">
          {weekColumn}
        </div>
      );
    }
    
    return grid;
  };

  // 生成季度内的月份标签
  const generateMonthLabels = () => {
    const startMonth = (getCurrentQuarter() - 1) * 3;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const labels = [];
    
    // 为当前季度的三个月生成标签
    for (let i = 0; i < 3; i++) {
      const monthIndex = startMonth + i;
      labels.push({
        name: monthNames[monthIndex],
        position: i, // 0, 1, 2 分别代表季度的第1、2、3个月
        month: monthIndex + 1
      });
    }
    
    return labels;
  };

  // 根据等级获取颜色 - 添加黑暗模式支持
  const getLevelColor = (level: number) => {
    if (darkMode) {
      const darkColors: Record<number,string> = {
        0: '#2d333b', // 无活动
        1: '#0e4429', // 1-3条
        2: '#006d32', // 4-6条
        3: '#26a641', // 7-9条
        4: '#39d353'  // 10+条
      };
      return darkColors[level];
    } else {
      const lightColors: Record<number,string> = {
        0: '#ebedf0', // 无活动
        1: '#9be9a8', // 1-3条
        2: '#40c463', // 4-6条
        3: '#30a14e', // 7-9条
        4: '#216e39'  // 10+条
      };
      return lightColors[level];
    }
  };

  // 显示提示
  const showTooltip = (e: MouseEvent<HTMLDivElement>, date: string, count: number) => {
    let content = `${date}<br/>`;

    if (count === 0) {
      content += '无想法';
    } else {
      content += `${count}条想法`;
    }

    // 计算工具提示位置，确保显示在格子附近
    const tooltipWidth = 120; // 预估的工具提示宽度
    const tooltipHeight = 40; // 预估的工具提示高度
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 获取格子的位置和尺寸
    const rect = e.currentTarget.getBoundingClientRect();

    // 计算tooltip位置
    let x, y;

    if (isSidebarHovered) {
      // 当侧栏悬停时，使用相对于容器的定位
      const heatmapContainer = e.currentTarget.closest<HTMLElement>('.heatmap-container');
      const containerRect = heatmapContainer ? heatmapContainer.getBoundingClientRect() : { left: 0, top: 0 };

      // 相对于容器的位置
      x = rect.left - containerRect.left + rect.width / 2 - tooltipWidth / 2;
      y = rect.top - containerRect.top - tooltipHeight - 10;

      // 确保tooltip不会超出容器边界
      const containerWidth = heatmapContainer ? heatmapContainer.offsetWidth : 300;
      const containerHeight = heatmapContainer ? heatmapContainer.offsetHeight : 200;

      // 水平边界检查
      if (x < 5) {
        x = 5;
      } else if (x + tooltipWidth > containerWidth - 5) {
        x = containerWidth - tooltipWidth - 5;
      }

      // 垂直边界检查 - 如果会超出上边界，则显示在格子下方
      if (y < 5) {
        y = rect.bottom - containerRect.top + 10;
      }

      // 如果显示在下方还会超出容器，则强制显示在上方
      if (y + tooltipHeight > containerHeight - 5) {
        y = rect.top - containerRect.top - tooltipHeight - 10;
        // 如果还是超出，则显示在格子右侧
        if (y < 5) {
          x = rect.right - containerRect.left + 10;
          y = rect.top - containerRect.top + rect.height / 2 - tooltipHeight / 2;

          // 如果右侧也超出，则显示在左侧
          if (x + tooltipWidth > containerWidth - 5) {
            x = rect.left - containerRect.left - tooltipWidth - 10;
          }
        }
      }
    } else {
      // 当侧栏固定时，使用固定定位（相对于视口）
      x = rect.left + rect.width / 2 - tooltipWidth / 2;
      y = rect.top - tooltipHeight - 10;

      // 水平边界检查
      if (x < 10) {
        x = 10;
      } else if (x + tooltipWidth > viewportWidth - 10) {
        x = viewportWidth - tooltipWidth - 10;
      }

      // 垂直边界检查
      if (y < 10) {
        y = rect.bottom + 10;
      } else if (y + tooltipHeight > viewportHeight - 10) {
        y = rect.top - tooltipHeight - 10;
      }
    }

    setTooltip({
      show: true,
      content,
      x,
      y
    });
  };

  // 隐藏提示
  const hideTooltip = () => {
    setTooltip({ ...tooltip, show: false });
  };

  // 处理日期点击
  const handleDateClick = (dateStr: string, eventCount: number) => {
    // 只有当日记数大于0时才触发点击事件
    if (eventCount > 0 && onDateClick) {
      onDateClick(dateStr);
    }
  };

  // 获取季度显示文本
  const getQuarterText = () => {
    const quarterMonths: Record<number,string> = {
      1: '1-3月',
      2: '4-6月',
      3: '7-9月',
      4: '10-12月'
    };
    return `${getCurrentYear()}年${quarterMonths[getCurrentQuarter()]}`;
  };

  // 在return语句之前调用generateCalendar和generateMonthLabels
  const grid = generateCalendar();
  const monthLabels = generateMonthLabels();

  return (
    <div className="mt-4 font-sans relative heatmap-container">
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          {getQuarterText()}
        </div>

        <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
          <span>少</span>
          <div className="flex mx-1">
            {[0, 1, 2, 3, 4].map(level => (
              <div
                key={level}
                className="w-2 h-2 mx-0.5 rounded-sm"
                style={{ backgroundColor: getLevelColor(level) }}
                title={`${level === 0 ? '无想法' : level === 4 ? '4+条想法' : `${level}条想法`}`}
              />
            ))}
          </div>
          <span>多</span>
        </div>
      </div>

      {/* 月份标签 */}
      <div className="px-2 mb-1">
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
          {monthLabels.map((label, index) => (
            <div key={index} className="text-center">
              {label.name}
            </div>
          ))}
        </div>
      </div>

      {/* 热力图区域背景为透明 */}
      <div className="px-2 bg-transparent rounded overflow-hidden">
        <div className="flex gap-1" style={{ minHeight: '110px' }}>
          {grid}
        </div>
      </div>

      <div
        className={`tooltip ${isSidebarHovered ? 'absolute' : 'fixed'} bg-gray-900 dark:bg-gray-800 text-white p-2 rounded text-xs pointer-events-none transition-opacity whitespace-nowrap shadow-lg border border-gray-700 ${
          tooltip.show ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          left: `${tooltip.x}px`,
          top: `${tooltip.y}px`,
          maxWidth: '200px',
          zIndex: isSidebarHovered ? 60 : 50,
          transform: tooltip.show ? 'scale(1)' : 'scale(0.95)',
          transition: 'opacity 0.2s ease-in-out, transform 0.2s ease-in-out'
        }}
        dangerouslySetInnerHTML={{ __html: tooltip.content }}
      />
    </div>
  );
};

export default GitHubStyleHeatmap;
