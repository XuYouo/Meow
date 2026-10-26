import type { MemoView } from '../../../features/presentation/objects/MemoView';
import { useMemo, useState } from 'react';
import { Tag, ChevronRight, ChevronDown, Hash } from 'lucide-react';
import { useTheme } from '../../../features/presentation/PresentationContext';
import { useSettings } from '../../../features/presentation/PresentationContext';

const TagManager = ({ memos, activeTag, setActiveTag, showTitle = true }: {memos:MemoView[];activeTag:string|null;setActiveTag:(tag:string|null)=>void;showTitle?:boolean}) => {
  const [expandedTags, setExpandedTags] = useState(new Set<string>());
  const [hoveredTag, setHoveredTag] = useState<string|null>(null);
  const { themeColor } = useTheme();
  const { fontConfig } = useSettings();

  // 计算标签频率和层级结构
  const { tagFrequency, tagHierarchy } = useMemo(() => {
    const frequency: Record<string,number> = {};
    const hierarchy: Record<string,Set<string>|string[]> = {};

    memos.forEach(memo => {
      memo.tags.forEach(tag => {
        frequency[tag] = (frequency[tag] || 0) + 1;

        // 处理二级标签
        if (tag.includes('/')) {
          const [parent = '', childTag = ''] = tag.split('/'); const parentTag = parent;
          if (!hierarchy[parentTag]) {
            hierarchy[parentTag] = new Set();
          }
          const children = hierarchy[parentTag]; if (children instanceof Set && childTag) children.add(childTag);

          // 也统计父标签的频率
          const parentFullTag = parentTag;
          frequency[parentFullTag] = (frequency[parentFullTag] || 0) + 1;
        } else {
          // 一级标签
          if (!hierarchy[tag]) {
            hierarchy[tag] = new Set();
          }
        }
      });
    });

    // 转换Set为Array并排序
    Object.keys(hierarchy).forEach(parentTag => {
      hierarchy[parentTag] = Array.from(hierarchy[parentTag] ?? []).sort();
    });

    return { tagFrequency: frequency, tagHierarchy: hierarchy };
  }, [memos]);

  // 获取排序后的父标签
  const sortedParentTags = useMemo(() => {
    return Object.keys(tagHierarchy)
      .sort((a, b) => (tagFrequency[b] || 0) - (tagFrequency[a] || 0));
  }, [tagHierarchy, tagFrequency]);

  // 切换标签展开状态
  const toggleTagExpansion = (tag: string) => {
    const newExpanded = new Set(expandedTags);
    if (newExpanded.has(tag)) {
      newExpanded.delete(tag);
    } else {
      newExpanded.add(tag);
    }
    setExpandedTags(newExpanded);
  };

  // 处理标签点击
  const handleTagClick = (tag: string, isChild = false, parentTag: string | null = null) => {
    const fullTag = isChild ? `${parentTag}/${tag}` : tag;
    setActiveTag(fullTag === activeTag ? null : fullTag);
  };

  // 获取子标签的频率
  const getChildTagFrequency = (parentTag: string, childTag: string) => {
    const fullTag = `${parentTag}/${childTag}`;
    return tagFrequency[fullTag] || 0;
  };

  return (
    <div className="dark:text-gray-200">
      {showTitle && (
        <div className="flex items-center justify-end mb-4 pr-2">
          <Tag
            className="h-5 w-5 mr-2 transition-colors duration-300"
            style={{ color: themeColor }}
          />
          <h2 className="text-lg font-semibold">
            标签管理
          </h2>
        </div>
      )}

      <div className={`space-y-1 custom-font-content`} style={{ fontSize: fontConfig?.fontSize ? `${fontConfig.fontSize}px` : undefined }}>
        {sortedParentTags.length > 0 ? (
          sortedParentTags.map(parentTag => {
            const hasChildren = ((tagHierarchy[parentTag] as string[] | undefined)?.length ?? 0) > 0;
            const isExpanded = expandedTags.has(parentTag);
            const isParentActive = activeTag === parentTag;

            return (
              <div key={parentTag} className="space-y-1">
                {/* 父标签 */}
                <div
                  className={`flex items-center p-2 rounded-lg transition-colors ${
                    isParentActive
                      ? 'border'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  style={isParentActive ? {
                    backgroundColor: `${themeColor}20`,
                    borderColor: themeColor
                  } : {}}
                  onMouseEnter={() => setHoveredTag(parentTag)}
                  onMouseLeave={() => setHoveredTag(null)}
                >
                  {/* 标签图标 - 悬浮时变为展开图标 */}
                  <div className="mr-2 flex items-center">
                    {hasChildren && hoveredTag === parentTag ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTagExpansion(parentTag);
                        }}
                        className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown
                            className="h-4 w-4 transition-colors duration-300"
                            style={{ color: themeColor }}
                          />
                        ) : (
                          <ChevronRight
                            className="h-4 w-4 transition-colors duration-300"
                            style={{ color: themeColor }}
                          />
                        )}
                      </button>
                    ) : (
                      <Hash
                        className="h-4 w-4 transition-colors duration-300"
                        style={{ color: themeColor }}
                      />
                    )}
                  </div>

                  {/* 标签内容 */}
                  <div
                    onClick={() => handleTagClick(parentTag)}
                    className="flex-1 flex justify-between items-center cursor-pointer"
                  >
                    <span className="font-medium">{parentTag}</span>
                    {/* 优化计数显示：添加深色模式下的文字颜色 */}
                    <span className="text-xs bg-gray-200 dark:bg-gray-700 rounded-full px-2 py-1 text-gray-800 dark:text-gray-200">
                      {tagFrequency[parentTag] || 0}
                    </span>
                  </div>
                </div>

                {/* 子标签 */}
                {hasChildren && isExpanded && (
                  <div className="ml-6 space-y-1">
                    {(tagHierarchy[parentTag] as string[]).map(childTag => {
                      const fullChildTag = `${parentTag}/${childTag}`;
                      const isChildActive = activeTag === fullChildTag;
                      const childFrequency = getChildTagFrequency(parentTag, childTag);

                      return (
                        <div
                          key={childTag}
                          onClick={() => handleTagClick(childTag, true, parentTag)}
                          className={`flex items-center p-2 pl-6 rounded-lg cursor-pointer transition-colors ${
                            isChildActive
                              ? 'border'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                          style={isChildActive ? {
                            backgroundColor: `${themeColor}10`,
                            borderColor: `${themeColor}80`
                          } : {}}
                        >
                          <Hash className="h-3 w-3 text-gray-400 mr-2 flex-shrink-0" />
                          {/* 优化二级标签文字颜色 */}
                          <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{childTag}</span>
                          {/* 优化计数显示：添加深色模式下的文字颜色 */}
                          <span className="text-xs bg-gray-100 dark:bg-gray-800 rounded-full px-2 py-1 text-gray-700 dark:text-gray-300">
                            {childFrequency}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-sm">暂无标签</p>
        )}

        {activeTag && (
          <button
            onClick={() => setActiveTag(null)}
            className="mt-4 w-full text-sm transition-colors duration-300 hover:opacity-80"
            style={{ color: themeColor }}
          >
            清除筛选
          </button>
        )}
      </div>
    </div>
  );
};

export default TagManager;
