import type { MemoView } from '../../../features/presentation/objects/MemoView';

const UsageStats = ({ memos = [], pinnedMemos = [] }: { memos?: MemoView[]; pinnedMemos?: MemoView[] }) => {
  // 计算统计数据
  const calculateStats = () => {
    const allMemos = [...memos, ...pinnedMemos];
    
    // 总笔记条数
    const totalMemos = allMemos.length;
    
    // 总标签数（去重）
    const allTags = allMemos.flatMap(memo => memo.tags || []);
    const uniqueTags = [...new Set(allTags)];
    const totalTags = uniqueTags.length;
    
    // 总字数（计算所有笔记内容的字数）
    const totalWords = allMemos.reduce((total, memo) => {
      const content = memo.content || '';
      // 移除标签和多余空格，计算实际内容字数
      const cleanContent = content.replace(/#[^\s#]+/g, '').replace(/\s+/g, ' ').trim();
      return total + (cleanContent.length > 0 ? cleanContent.length : 0);
    }, 0);
    
    return {
      totalMemos,
      totalTags,
      totalWords
    };
  };

  const stats = calculateStats();

  return (
    <div className="mt-6 px-2">
      <div className="flex justify-around items-center">
        {/* 笔记统计 */}
        <div className="flex flex-col items-center">
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-1">
            {stats.totalMemos}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            笔记
          </div>
        </div>
        
        {/* 标签统计 */}
        <div className="flex flex-col items-center">
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-1">
            {stats.totalTags}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            标签
          </div>
        </div>
        
        {/* 字数统计 */}
        <div className="flex flex-col items-center">
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-1">
            {stats.totalWords}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            字数
          </div>
        </div>
      </div>
    </div>
  );
};

export default UsageStats;