import type { MemoView } from '../../../features/presentation/objects/MemoView';
import { Dialog, DialogContent } from '../../../features/presentation/ui/dialog';
import ContentRenderer from './ContentRenderer';

const MemoPreviewDialog = ({ open, onClose, memo }: {open:boolean;onClose:()=>void;memo:MemoView|null}) => {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="max-w-2xl">
        {memo ? (
          <div className="space-y-3">
            <div className="max-h-[60vh] overflow-y-auto pr-2 scrollbar-transparent">
              <ContentRenderer content={memo.content} activeTag={null} onTagClick={() => {}} />
            </div>
            <div className="text-xs text-gray-500">更新于 {new Date(memo.updatedAt || memo.createdAt).toLocaleString('zh-CN')}</div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">未找到内容</div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MemoPreviewDialog;
