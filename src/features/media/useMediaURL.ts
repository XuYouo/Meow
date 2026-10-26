import { useEffect, useState } from 'react';

import { getMediaContentURL, getPendingMediaBlob, subscribePendingMedia } from './pendingMedia';

export function useMediaURL(instanceId: string, mediaId: string) {
  const [state, setState] = useState({ url: getMediaContentURL(mediaId), error: '' });
  useEffect(() => {
    let active = true;
    let currentURL: string | null = null;
    async function read() {
      try {
        const blob = await getPendingMediaBlob(instanceId, mediaId);
        if (!active) return;
        if (currentURL) URL.revokeObjectURL(currentURL);
        currentURL = blob ? URL.createObjectURL(blob) : null;
        setState({ url: currentURL ?? getMediaContentURL(mediaId), error: '' });
      } catch (cause) { if (active) setState({ url: getMediaContentURL(mediaId), error: cause instanceof Error ? cause.message : '本地附件读取失败。' }); }
    }
    void read(); const unsubscribe = subscribePendingMedia(instanceId, () => void read());
    return () => { active = false; unsubscribe(); if (currentURL) URL.revokeObjectURL(currentURL); };
  }, [instanceId, mediaId]);
  return state;
}
