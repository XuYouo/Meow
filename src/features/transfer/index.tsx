import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, Upload } from 'lucide-react';
import { MAX_BACKUP_BYTES, MAX_MEMOS_SOURCE_BYTES, type MemosPreviewDTO } from '../../../shared/contracts/transfer';
import type { WorkspaceExtensionProps } from '../../pages/Index/index';
import { UploadMediaAPI } from '../../apis/media/UploadMediaAPI';
import { ExportBackupAPI } from '../../apis/transfer/ExportBackupAPI';
import { RestoreBackupAPI } from '../../apis/transfer/RestoreBackupAPI';
import { GetTransferStatusAPI } from '../../apis/transfer/GetTransferStatusAPI';
import { PreviewMemosImportAPI } from '../../apis/transfer/PreviewMemosImportAPI';
import { ImportMemosAPI } from '../../apis/transfer/ImportMemosAPI';

type Action = 'idle' | 'exporting' | 'previewing' | 'uploading' | 'importing' | 'restoring';

export default function TransferFeature({ session, localOnly, canWrite, refresh, notify }: WorkspaceExtensionProps) {
  const [action, setAction] = useState<Action>('idle');
  const [empty, setEmpty] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<MemosPreviewDTO | null>(null);
  const [assets, setAssets] = useState<Record<string, { mediaId: string; fileName: string }>>({});
  const [allowMissingAssets, setAllowMissingAssets] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  const [restored, setRestored] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const writeAllowed=useRef(canWrite);writeAllowed.current=canWrite;
  const importOperation = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    if (localOnly || session.principal !== 'owner') return () => { mounted.current = false; controller.current?.abort(); };
    const abort = new AbortController();
    void GetTransferStatusAPI(abort.signal).then((value) => { if (mounted.current) setEmpty(value.empty); }).catch((cause: unknown) => { if (mounted.current && !abort.signal.aborted) setError(cause instanceof Error ? cause.message : '工作区状态读取失败。'); });
    return () => { mounted.current = false; abort.abort(); controller.current?.abort(); };
  }, [localOnly, session.instanceId, session.principal]);

  useEffect(() => {if(!canWrite && action !== 'exporting')controller.current?.abort();},[canWrite,action]);

  if (session.principal !== 'owner') return <section className='space-y-3'><h2>数据与备份</h2><p>请以工作区所有者身份登录。</p></section>;
  const disabled = localOnly || action !== 'idle';
  const writingDisabled=disabled||!canWrite;
  async function run(next: Action, work: (signal: AbortSignal) => Promise<void>) {
    if (localOnly || action !== 'idle' || (next !== 'exporting' && !writeAllowed.current)) return;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setAction(next); setError(''); setNotice('');
    try { await work(abort.signal); }
    catch (cause) { if (mounted.current && !abort.signal.aborted) setError(cause instanceof Error ? cause.message : '操作未完成，请保留源文件并重试。'); }
    finally { if (mounted.current) setAction('idle'); }
  }
  async function download(signal: AbortSignal) {
    const blob = await ExportBackupAPI(signal);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `meow-${new Date().toISOString().slice(0, 10)}.meow-backup.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('完整备份已经生成。外部音乐链接仅保存地址，不包含远端音频字节。');
  }
  async function previewSource(file: File, signal: AbortSignal) {
    if(!writeAllowed.current)throw new Error('此标签页只读。');
    if (file.size > MAX_MEMOS_SOURCE_BYTES) throw new Error('外部 Memos SQLite 快照不能超过25 MB。');
    const result = await PreviewMemosImportAPI(file, signal);
    setPreview(result); setAssets({}); setAllowMissingAssets(false); importOperation.current = null;
    setNotice(result.alreadyImported ? '这一份来源快照已导入，无需重复执行。' : '预检完成。请核对数量与附件，再确认导入。');
  }
  async function attach(sourceResourceId: string, file: File, signal: AbortSignal) {
    if(!writeAllowed.current)throw new Error('此标签页只读。');
    if (file.size > 25 * 1024 * 1024) throw new Error('每个附件不能超过25 MB。');
    const resource = preview?.missingAssets.find((asset) => asset.sourceResourceId === sourceResourceId);
    if (!resource) throw new Error('附件来源已改变，请重新预检。');
    const content = file.type ? file : new File([file], file.name, { type: resource.mimeType });
    const media = await UploadMediaAPI(content, signal);
    setAssets((current) => ({ ...current, [sourceResourceId]: { mediaId: media.id, fileName: file.name } }));
    importOperation.current = null;
  }
  async function importSource(signal: AbortSignal) {
    if(!writeAllowed.current)throw new Error('此标签页只读。');
    if (!preview) return;
    const operationId = importOperation.current ?? crypto.randomUUID(); importOperation.current = operationId;
    const result = await ImportMemosAPI({ previewId: preview.previewId, operationId, allowMissingAssets, assets: Object.entries(assets).map(([sourceResourceId, asset]) => ({ sourceResourceId, mediaId: asset.mediaId })) }, signal);
    setNotice(`已${result.replayed ? '确认先前' : '完成'}导入 ${result.imported} 条笔记。${result.missingAssets.length ? `有 ${result.missingAssets.length} 个未提供的附件，未导入。` : '附件已一并保存。'}`);
    setPreview({ ...preview, alreadyImported: true });
    setEmpty(false); await refresh(); notify('外部 Memos 导入完成。');
  }
  async function restore(signal: AbortSignal) {
    if(!writeAllowed.current)throw new Error('此标签页只读。');
    if (!restoreFile || !restoreConfirmed) return;
    if (restoreFile.size > MAX_BACKUP_BYTES) throw new Error('完整备份包不能超过128 MB。');
    const result = await RestoreBackupAPI(restoreFile, signal);
    setRestored(true); setEmpty(false);
    setNotice(`已恢复 ${result.counts.memos} 条笔记、${result.counts.assets} 个实际附件及所有工作区领域。${result.cleanupPending ? '暂存文件清理待重试；业务恢复已提交，重新提交同一备份可安全重试清理。' : ''}请重新加载以载入全部界面状态。`);
    await refresh(); notify('新版工作区完整恢复成功。');
  }
  return <div className='space-y-6'>
    <section className='space-y-3'><h2 className="text-sm font-medium">完整备份</h2><p>包含笔记、设置、画布、回顾、曲库与已上传附件。密码和登录信息不包含在备份中。</p>
      {!canWrite && <p role='status' className='text-sm text-gray-500'>此标签页只读，可导出备份；恢复和导入请在编辑标签页进行。</p>}
      {localOnly && <p role='status'>当前离线。恢复、导入和完整服务端备份将在重新连接后可用。</p>}
      <button type='button' className='inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-white disabled:opacity-50' style={{backgroundColor:'var(--theme-color, #818CF8)'}} disabled={disabled} onClick={() => void run('exporting', download)}><Download size={16} />{action === 'exporting' ? '正在生成完整备份…' : '导出完整工作区'}</button>
      <p className='text-xs text-gray-500 dark:text-gray-400'>备份最大 128 MB，单个附件最大 25 MB。外部音乐保留链接。</p>
    </section>
    <section className='space-y-3'><h2 className="text-sm font-medium">恢复备份</h2><p>选择本版导出的完整备份。恢复需要一个空的工作区，请保留原文件。</p>
      <p role='status'>{empty === null ? '正在确认目标是否为空…' : empty ? '当前业务工作区为空，可接收新版备份。' : '当前工作区已有业务数据；请为完整恢复创建独立的空实例。'}</p>
      <label className='block text-sm space-y-2'>新版完整备份文件<input className='block w-full text-sm'  type='file' accept='.json,.meow-backup' disabled={writingDisabled || empty === false} onChange={(event) => { setRestoreFile(event.target.files?.[0] ?? null); setRestoreConfirmed(false); setRestored(false); }} /></label>
      <label className='flex gap-2 items-start text-sm'><input type='checkbox' disabled={writingDisabled || !restoreFile || empty !== true} checked={restoreConfirmed} onChange={(event) => setRestoreConfirmed(event.target.checked)} />我确认目标是空的新实例，并将保留源备份。</label>
      <button type='button' className='inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-white disabled:opacity-50' style={{backgroundColor:'var(--theme-color, #818CF8)'}} disabled={writingDisabled || !restoreFile || !restoreConfirmed || empty !== true} onClick={() => void run('restoring', restore)}><Upload size={16} />{action === 'restoring' ? '验证并恢复中…' : '验证并恢复完整包'}</button>
      {restored && <button type='button' className='inline-flex items-center gap-2 rounded-md border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm disabled:opacity-50' onClick={() => window.location.reload()}><RefreshCw size={16} />重新加载工作区</button>}
    </section>
    <section className='space-y-3'><h2 className="text-sm font-medium">从 Memos 导入</h2><p>选择 Memos 的 SQLite 备份，先检查笔记数量和附件，再确认导入。未标为公开的笔记将保持私有。</p>
      <p className='text-xs text-gray-500 dark:text-gray-400'>请从来源应用导出完整快照；直接复制运行中的数据库可能不完整。具体支持格式见项目文档。</p>
      <label className='block text-sm space-y-2'>Memos 备份文件<input className='block w-full text-sm'  type='file' accept='.db,.sqlite,.sqlite3' disabled={writingDisabled} onChange={(event) => { const file = event.target.files?.[0]; if (file) void run('previewing', (signal) => previewSource(file, signal)); }} /></label>
      {action === 'previewing' && <p role='status'>只读检查来源结构、数量和资源引用…</p>}
      {preview && <div className='space-y-3 text-sm'><p><strong>{preview.memoCount}</strong> 条笔记 · {preview.pinnedCount} 条置顶 · {preview.publicCount} 条公开 · 排除 {preview.archivedExcluded} 条归档记录</p><p className='text-xs text-gray-500 dark:text-gray-400'>来源快照：{preview.sourceDigest.slice(0, 16)}…；预检一小时有效。相同快照重复导入不会重复创建；来源发生变化后属于新的批次。</p>
        {preview.missingAssets.length > 0 && <div><h3>提供来源附件（可选）</h3><p>为缺少的附件选择对应文件，也可明确选择暂不导入附件。</p>{preview.missingAssets.map((asset) => <label key={asset.sourceResourceId}>{asset.fileName} · {asset.mimeType}{assets[asset.sourceResourceId] && <span> → 已提供 {assets[asset.sourceResourceId]?.fileName}</span>}<input type='file' disabled={writingDisabled || preview.alreadyImported} onChange={(event) => { const file = event.target.files?.[0]; if (file) void run('uploading', (signal) => attach(asset.sourceResourceId, file, signal)); }} /></label>)}
          <label className='flex gap-2 items-start text-sm'><input type='checkbox' checked={allowMissingAssets} disabled={writingDisabled || preview.alreadyImported} onChange={(event) => { setAllowMissingAssets(event.target.checked); importOperation.current = null; }} />明确接受未提供附件，并保留缺失项报告。</label></div>}
        <details><summary>本次导入范围与说明</summary><ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>
        <button type='button' className='inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-white disabled:opacity-50' style={{backgroundColor:'var(--theme-color, #818CF8)'}} disabled={writingDisabled || preview.alreadyImported || (!allowMissingAssets && preview.missingAssets.some((asset) => !assets[asset.sourceResourceId]))} onClick={() => void run('importing', importSource)}>{preview.alreadyImported ? '此来源快照已导入' : action === 'importing' ? '正在导入…' : '确认导入这份快照'}</button>
      </div>}
    </section>
    {error && <div className='space-y-3' role='alert'>{error}</div>}
    {notice && <div className='space-y-3' role='status'>{notice}</div>}
  </div>;
}
