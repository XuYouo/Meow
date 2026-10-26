import { ReadMediaAPI } from '../../apis/media/ReadMediaAPI';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../presentation/ui/button';
import { Input } from '../presentation/ui/input';
import { Label } from '../presentation/ui/label';
import { Textarea } from '../presentation/ui/textarea';
import { Card } from '../presentation/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../presentation/ui/dialog';
import { Plus, Edit, Trash2, Music, Upload } from 'lucide-react';
import { CreateTrackAPI } from '../../apis/music/CreateTrackAPI';
import { UpdateTrackAPI } from '../../apis/music/UpdateTrackAPI';
import { DeleteTrackAPI } from '../../apis/music/DeleteTrackAPI';
import { ReorderTracksAPI } from '../../apis/music/ReorderTracksAPI';
import { ImportImageURLAPI } from '../../apis/integrations/ImportImageURLAPI';
import type { WorkspaceExtensionProps } from '../../pages/Index/index';
import { ensurePendingMediaUploaded, releasePendingMedia, stagePendingMedia } from '../media/pendingMedia';
import { useMusic } from './MusicProvider';
import { builtinMusic, musicView, type MusicView } from './presentation/MusicView';
import { TrackValuesSchema } from '../../../shared/contracts/music';

type Form = { title: string; artist: string; musicUrl: string; coverUrl: string; lyrics: string; audioFile: string | null; imageFile: string | null };
const emptyForm = (): Form => ({ title: '', artist: '', musicUrl: '', coverUrl: '', lyrics: '', audioFile: null, imageFile: null });
export default function MusicLibrary({ session, localOnly: offline, canWrite, notify }: WorkspaceExtensionProps) {
  const localOnly = offline || !canWrite;
  const music = useMusic();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingSong, setEditingSong] = useState<MusicView | null>(null);
  const [formData, setFormData] = useState<Form>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted=useRef(true),writeAllowed=useRef(!localOnly),pending=useRef<AbortController|null>(null),busyRef=useRef(false);
  writeAllowed.current=!localOnly;
  const deleteOperations=useRef(new Map<string,string>()),orderOperation=useRef<{key:string;operationId:string}|null>(null);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;pending.current?.abort();};},[]);
  useEffect(()=>{if(localOnly)pending.current?.abort();},[localOnly]);
  function begin(){if(!mounted.current||!writeAllowed.current||busyRef.current)return null;const current=new AbortController();pending.current=current;busyRef.current=true;setBusy(true);setError('');return current;}
  const active=(current:AbortController)=>mounted.current&&writeAllowed.current&&pending.current===current&&!current.signal.aborted;
  function finish(current:AbortController){if(pending.current!==current)return;pending.current=null;busyRef.current=false;if(mounted.current)setBusy(false);}
  const identity = useRef({ id: crypto.randomUUID(), operationId: crypto.randomUUID(), fingerprint: '', coverId: crypto.randomUUID(), coverOperationId: crypto.randomUUID() });
  const draggingId = useRef<string | null>(null);
  const importedCoverURL = useRef('');
  const musicList = [builtinMusic, ...music.tracks].map(musicView);
  const isLoading = music.loading;
  function resetForm() { pending.current?.abort();pending.current=null;busyRef.current=false;if(mounted.current)setBusy(false);setFormData(emptyForm()); setEditingSong(null); setError(''); identity.current = { id: crypto.randomUUID(), operationId: crypto.randomUUID(), fingerprint: '', coverId: crypto.randomUUID(), coverOperationId: crypto.randomUUID() }; }
  function handleEditSong(song: MusicView) { resetForm(); setEditingSong(song); setFormData({ title: song.title, artist: song.artist, musicUrl: song.musicUrl, coverUrl: song.coverUrl, lyrics: song.lyrics, audioFile: song.source.kind === 'media' ? song.source.mediaId : null, imageFile: song.coverMediaId }); }
  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>, target: 'audio' | 'image') {
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    const request=begin();if(!request)return;
    try{
      if(!file.type.startsWith(`${target}/`))throw new Error(target==='audio'?'请选择音频文件':'请选择图片文件');
      const staged=await stagePendingMedia(session.instanceId,file);if(!active(request))return;
      setFormData((previous)=>target==='audio'?{...previous,audioFile:staged.mediaId,musicUrl:ReadMediaAPI(staged.mediaId),title:previous.title||file.name.replace(/\.[^.]+$/,'')}:{...previous,imageFile:staged.mediaId,coverUrl:ReadMediaAPI(staged.mediaId)});
    }catch(cause){if(active(request))setError(cause instanceof Error?cause.message:'附件暂存失败');}
    finally{finish(request);}
  }
  async function saveSong() {
    const request=begin();if(!request)return;const operation=identity.current;
    try {
      let coverMediaId = formData.imageFile;
      if (formData.coverUrl && formData.coverUrl !== (coverMediaId ? ReadMediaAPI(coverMediaId) : '')) {
        if (importedCoverURL.current !== formData.coverUrl) { operation.coverId = crypto.randomUUID(); operation.coverOperationId = crypto.randomUUID(); importedCoverURL.current = formData.coverUrl; }
        coverMediaId = (await ImportImageURLAPI({ id: operation.coverId, operationId: operation.coverOperationId, url: formData.coverUrl },request.signal)).id;
        if(!active(request))return;
      }
      if (!formData.coverUrl) coverMediaId = null;
      const audioMediaId = formData.audioFile && formData.musicUrl === ReadMediaAPI(formData.audioFile) ? formData.audioFile : null;
      const values = TrackValuesSchema.parse({ title: formData.title, artist: formData.artist, album: editingSong?.album ?? '', source: audioMediaId ? { kind: 'media', mediaId: audioMediaId } : { kind: 'external', url: formData.musicUrl }, coverMediaId, lyricsMediaId: editingSong?.lyricsMediaId ?? null, lyrics: formData.lyrics, duration: editingSong?.duration ?? null, danmaku: editingSong?.danmaku ?? [] });
      const mediaIds = [audioMediaId, coverMediaId].filter((id): id is string => id !== null);
      if(!active(request))return;
      await ensurePendingMediaUploaded(session.instanceId, mediaIds,request.signal);
      if(!active(request))return;
      const fingerprint = JSON.stringify(values);
      if (operation.fingerprint && operation.fingerprint !== fingerprint) operation.operationId = crypto.randomUUID();
      operation.fingerprint = fingerprint;
      if (editingSong) await UpdateTrackAPI({ id: editingSong.id, baseRevision: editingSong.revision, operationId: operation.operationId, values },request.signal);
      else await CreateTrackAPI({ id: operation.id, operationId: operation.operationId, values },request.signal);
      if(!active(request))return;
      try{await releasePendingMedia(session.instanceId,mediaIds);}catch{notify('歌曲已保存，本机附件暂存清理可稍后重试。');}
      if(!active(request))return;await music.refresh();if(!active(request))return; setIsAddDialogOpen(false); resetForm();
    } catch (cause) { if(active(request))setError(cause instanceof Error ? cause.message : '歌曲未保存，表单内容已保留。'); }
    finally { finish(request); }
  }
  async function handleDeleteSong(song:MusicView){
    if(song.isBuiltin)return;const request=begin();if(!request)return;
    const key=JSON.stringify([song.id,song.revision]);const operationId=deleteOperations.current.get(key)??crypto.randomUUID();deleteOperations.current.set(key,operationId);
    try{await DeleteTrackAPI({id:song.id,baseRevision:song.revision,operationId},request.signal);if(active(request))await music.refresh();}
    catch(cause){if(active(request))setError(cause instanceof Error?cause.message:'删除失败');}finally{finish(request);}
  }
  async function saveOrder(ids:string[]){
    const request=begin();if(!request)return;const key=JSON.stringify([ids,music.revision]);if(orderOperation.current?.key!==key)orderOperation.current={key,operationId:crypto.randomUUID()};
    try{await ReorderTracksAPI({ids,baseRevision:music.revision,operationId:orderOperation.current.operationId},request.signal);if(active(request))await music.refresh();}
    catch(cause){if(active(request))setError(cause instanceof Error?cause.message:'排序未保存');}finally{finish(request);}
  }
  async function reorder(targetId: string) { const ids = music.tracks.map((track) => track.id); const source = draggingId.current; draggingId.current = null; if (!source || source === targetId) return; const destination = ids.indexOf(targetId); if (destination < 0) return; const reordered = ids.filter((id) => id !== source); reordered.splice(destination, 0, source); await saveOrder(reordered); }
  async function move(id: string, direction: number) { const ids = music.tracks.map((track) => track.id); const index = ids.indexOf(id); const other = ids[index + direction]; if (index < 0 || !other) return; ids[index] = other; ids[index + direction] = id; await saveOrder(ids); }
  return (
    <div className="space-y-4">
      {/* 音乐列表容器 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">音乐列表</Label>
          <Dialog open={isAddDialogOpen || !!editingSong} onOpenChange={(open) => {
            if (!open) {
              setIsAddDialogOpen(false);
              setEditingSong(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button
                disabled={busy || localOnly}
                onClick={() => setIsAddDialogOpen(true)}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                添加歌曲
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800 shadow-xl">
              <DialogHeader>
                <DialogTitle>{editingSong ? '编辑歌曲' : '添加歌曲'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* 歌曲名称 */}
                <div className="space-y-2">
                  <Label htmlFor="title">歌曲名称 *</Label>
                  <Input disabled={busy || localOnly}
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="输入歌曲名称"
                  />
                </div>

                {/* 歌手名称 */}
                <div className="space-y-2">
                  <Label htmlFor="artist">歌手名称</Label>
                  <Input disabled={busy || localOnly}
                    id="artist"
                    value={formData.artist}
                    onChange={(e) => setFormData(prev => ({ ...prev, artist: e.target.value }))}
                    placeholder="输入歌手名称"
                  />
                </div>

                {/* 歌曲URL */}
                <div className="space-y-2">
                  <Label htmlFor="musicUrl">歌曲URL</Label>
                  <div className="flex gap-2">
                    <Input disabled={busy || localOnly}
                      id="musicUrl"
                      value={formData.musicUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, musicUrl: e.target.value }))}
                      placeholder="输入歌曲URL或选择本地文件"
                      className="flex-1"
                    />
                    <input
                      type="file" disabled={busy || localOnly}
                      accept="audio/*"
                      onChange={(e) => void handleFileUpload(e, 'audio')}
                      className="hidden"
                      id="audio-upload" aria-label="音频文件"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || localOnly} aria-label='上传音频' onClick={() => document.getElementById('audio-upload')?.click()}
                    >
                      <Upload className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* 封面URL */}
                <div className="space-y-2">
                  <Label htmlFor="coverUrl">封面URL</Label>
                  <div className="flex gap-2">
                    <Input disabled={busy || localOnly}
                      id="coverUrl"
                      value={formData.coverUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, coverUrl: e.target.value }))}
                      placeholder="输入封面URL或选择本地文件"
                      className="flex-1"
                    />
                    <input
                      type="file" disabled={busy || localOnly}
                      accept="image/*"
                      onChange={(e) => void handleFileUpload(e, 'image')}
                      className="hidden"
                      id="cover-upload" aria-label="封面文件"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || localOnly} aria-label='上传封面' onClick={() => document.getElementById('cover-upload')?.click()}
                    >
                      <Upload className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* 歌词内容 */}
                <div className="space-y-2">
                  <Label htmlFor="lyrics">歌词内容</Label>
                  <Textarea disabled={busy || localOnly}
                    id="lyrics"
                    value={formData.lyrics}
                    onChange={(e) => setFormData(prev => ({ ...prev, lyrics: e.target.value }))}
                    placeholder="输入歌词内容（每行一句歌词）"
                    rows={6}
                  />
                  <p className="text-xs text-gray-500">
                    提示：直接输入歌词文本，每行一句歌词。系统会自动处理时间轴。<br />
                    📁 音频文件将保存在自己的后端，支持 FLAC 无损音乐。
                  </p>
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsAddDialogOpen(false);
                      setEditingSong(null);
                      resetForm();
                    }}
                    className="flex-1"
                  >
                    取消
                  </Button>
                  <Button
                    disabled={busy || localOnly}
                    onClick={() => void saveSong()}
                    className="flex-1"
                  >
                    {editingSong ? '更新' : '添加'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* 音乐列表 */}
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p>正在加载音乐列表...</p>
          </div>
        ) : musicList.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Music className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>暂无音乐，点击上方按钮添加歌曲</p>
          </div>
        ) : (
          musicList.map((song) => (
            <Card key={song.id} className="p-3" draggable={!song.isBuiltin && !localOnly} onDragStart={() => { draggingId.current = song.id; }} onDragOver={(event) => { if (!song.isBuiltin) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); void reorder(song.id); }} tabIndex={0} onKeyDown={(event) => { if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); void move(song.id, event.key === 'ArrowUp' ? -1 : 1); } }}>
              <div className="flex items-center gap-3">
                <img
                  src={song.coverUrl || '/images/default-music-cover.svg'}
                  alt={song.title}
                  className="w-12 h-12 rounded object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{song.title}</div>
                  <div className="text-xs text-gray-500 truncate">{song.artist}</div>
                </div>
                {!song.isBuiltin && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy || localOnly}
                      aria-label={`编辑${song.title}`} onClick={() => handleEditSong(song)}
                      className="h-8 w-8 p-0"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy || localOnly}
                      aria-label={`删除${song.title}`} onClick={() => void handleDeleteSong(song)}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      {error && <p role='alert' className='text-sm text-red-500'>{error}</p>}
      {/* 统计信息 */}
      <div className="text-xs text-gray-500 pt-2 border-t">
        共 {musicList.length} 首歌曲（{musicList.filter(s => s.isBuiltin).length} 首内置，{musicList.filter(s => !s.isBuiltin).length} 首自定义）

      </div>
    </div>
  );
}