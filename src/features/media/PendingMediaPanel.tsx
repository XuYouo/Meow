import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';

import { listPendingMedia, type PendingMediaRecord } from '../../system/storage/PendingMediaStore';
import { ensurePendingMediaUploaded, subscribePendingMedia } from './pendingMedia';

export default function PendingMediaPanel({ instanceId, localOnly }: { instanceId: string; localOnly: boolean }) {
  const [records, setRecords] = useState<PendingMediaRecord[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try { setRecords(await listPendingMedia(instanceId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '本机附件暂存无法读取。'); }
  }, [instanceId]);
  useEffect(() => { void refresh(); return subscribePendingMedia(instanceId, () => void refresh()); }, [instanceId, refresh]);
  async function retry(id: string) {
    setBusy(true); setError('');
    try { await ensurePendingMediaUploaded(instanceId, [id]); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '附件上传未确认，文件仍保留在本机。'); }
    finally { setBusy(false); }
  }
  function download(record: PendingMediaRecord) {
    const url = URL.createObjectURL(record.blob);
    const link = document.createElement('a'); link.href = url; link.download = record.fileName; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className='workspace-panel'><div className='context-title'><h2>本机待提交附件</h2><button className='icon-button' title='刷新本机附件' onClick={() => void refresh()}><RefreshCw size={15} /></button></div><p className='muted'>文件先持久保存在本机，关联的笔记或画布得到提交确认后才清理暂存。若要移除附件，请在相应草稿中移除引用。</p>{records.length === 0 && <p className='muted'>暂无待提交文件。</p>}{records.map((record) => <div className='pending-media-row' key={record.mediaId}><span><strong>{record.fileName}</strong><small>{Math.ceil(record.size / 1024)} KB · {record.status === 'uploaded' ? '已上传，等待业务提交确认' : record.status === 'failed' ? '上传失败，文件已保留' : '已保存在本机'}</small>{record.error && <small className='error-text'>{record.error}</small>}</span><button className='icon-button' title={`下载本机文件${record.fileName}`} onClick={() => download(record)}><Download size={15} /></button><button className='button' onClick={() => void retry(record.mediaId)} disabled={busy || localOnly}>重试上传</button></div>)}{error && <p className='error-text' role='alert'>{error}</p>}</section>;
}
