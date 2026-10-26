import type { MemoView } from '../../../features/presentation/objects/MemoView';
import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '../../../features/presentation/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '../../../features/presentation/ui/card';
import { Button } from '../../../features/presentation/ui/button';
import { Download, Sparkles, X } from 'lucide-react';
import { useTheme } from '../../../features/presentation/PresentationContext';

// 导入模板组件
import BookmarkTemplate from './BookmarkTemplate';
import { useShareExport } from '../hooks/useShareExport';

const ShareDialog = ({ isOpen, onClose, memo }: { isOpen:boolean;onClose:()=>void;memo:MemoView|null }) => {
  const { themeColor } = useTheme();
  const [selectedTemplate, setSelectedTemplate] = useState(0);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const exporting = useShareExport(isOpen, memo?.id);
  const close = () => { exporting.cancel(); onClose(); };
  const exportLabels = { preparing: '正在加载工具…', rendering: '正在渲染分享图…', encoding: '正在转换PNG…', requesting: '正在请求下载…' };
  
  // 模板列表
  const templates = [
    { name: '书签模板', component: BookmarkTemplate },
  ];

  // 关闭对话框时重置选择
  useEffect(() => {
    if (!isOpen) {
      setSelectedTemplate(0);
    }
  }, [isOpen]);

  // 当前选中的模板组件
  const CurrentTemplate = (templates[selectedTemplate] ?? templates[0])?.component;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent aria-describedby={undefined} className="p-0 border-0 bg-transparent shadow-none flex items-center justify-center [&>button]:hidden">
        <DialogTitle className='sr-only'>生成分享图</DialogTitle>
        <Card className="w-[95vw] sm:max-w-2xl max-h-[85vh] flex flex-col bg-white dark:bg-gray-800 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-lg font-semibold flex items-center">
              <Sparkles className="h-5 w-5 mr-2 text-yellow-500" />
              生成分享图
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={close} aria-label="关闭分享图"
              className="h-8 w-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>

          {/* 预览标题 - 固定不滚动 */}
          <div className="px-4 pt-4">
            <h3 className="text-sm font-medium">预览</h3>
          </div>
          
          {/* 预览区域 - 可滚动 */}
          <CardContent className="flex-1 overflow-y-auto scrollbar-hidden px-4">
            <div className="flex justify-center">
              <div
                ref={previewRef}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden"
                style={{
                  width: '100%',
                  maxWidth: '720px',
                }}
              >
                {CurrentTemplate && memo && <CurrentTemplate memo={memo} themeColor={themeColor} />}
              </div>
            </div>
          </CardContent>
          
          {/* 模板选择区域 - 固定不滚动 */}
          <div className="px-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <div className="space-y-3">
              <h3 className="text-sm font-medium">选择模板</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {templates.map((template, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedTemplate === index
                        ? 'border-current shadow-sm'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    } bg-white dark:bg-gray-700`}
                    style={selectedTemplate === index ? {
                      borderColor: themeColor,
                      backgroundColor: `${themeColor}10`
                    } : {}}
                    onClick={() => setSelectedTemplate(index)}
                  >
                    <div className="text-center">
                      <div className="text-sm font-medium mb-1">{template.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {selectedTemplate === index ? '已选择' : '点击选择'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {exporting.state.phase === 'error' && <p className='px-4 py-2 text-xs text-red-600 dark:text-red-400' role='alert'>{exporting.state.message}</p>}
          {exporting.state.phase === 'requested' && <p className='px-4 py-2 text-xs text-gray-500 dark:text-gray-400' role='status'>已向浏览器请求下载 PNG。若未出现文件，请检查下载列表，或<a className='underline ml-1' href={exporting.state.url} download={exporting.state.fileName}>再次下载</a>。</p>}
          {/* 操作按钮 */}
          <div className="p-4 pt-0 flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-2">
            <Button onClick={close} variant="outline" className="w-full sm:w-auto">取消</Button>
            <Button onClick={() => void exporting.start(previewRef.current)} disabled={exporting.busy || !memo} aria-busy={exporting.busy} className="flex items-center w-full sm:w-auto" style={{ backgroundColor: themeColor }}>
              <Download className="h-4 w-4 mr-2" />
              {exporting.state.phase === 'preparing' || exporting.state.phase === 'rendering' || exporting.state.phase === 'encoding' || exporting.state.phase === 'requesting' ? exportLabels[exporting.state.phase] : '下载分享图'}
            </Button>
          </div>
        </Card>
      </DialogContent>
    </Dialog>
  );
};

export default ShareDialog;