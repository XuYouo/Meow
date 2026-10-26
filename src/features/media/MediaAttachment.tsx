import { Download } from 'lucide-react';

import { useMediaURL } from './useMediaURL';

export default function MediaAttachment({ instanceId, mediaId, kind }: { instanceId: string; mediaId: string; kind: 'image' | 'audio' | 'file' }) {
  const media = useMediaURL(instanceId, mediaId);
  return <div className='memo-attachment'>{media.error && <p className='error-text' role='alert'>{media.error}</p>}{kind === 'audio' ? <audio controls src={media.url} preload='none' /> : kind === 'image' ? <img src={media.url} alt='笔记附件' loading='lazy' /> : <a href={media.url} download><Download size={14} />下载附件</a>}</div>;
}
