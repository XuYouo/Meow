// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {WorkspaceExtensionProps} from '../pages/Index';
const mock=vi.hoisted(()=>({cover:vi.fn(),create:vi.fn(),stage:vi.fn(),refresh:vi.fn()}));
vi.mock('../features/music/MusicProvider',()=>({useMusic:()=>({tracks:[],revision:0,loading:false,refresh:mock.refresh})}));
vi.mock('../apis/integrations/ImportImageURLAPI',()=>({ImportImageURLAPI:mock.cover}));
vi.mock('../apis/music/CreateTrackAPI',()=>({CreateTrackAPI:mock.create}));
vi.mock('../features/media/pendingMedia',()=>({stagePendingMedia:mock.stage,ensurePendingMediaUploaded:vi.fn().mockResolvedValue(undefined),releasePendingMedia:vi.fn().mockResolvedValue(undefined)}));
import MusicLibrary from '../features/music/MusicLibrary';
function props():WorkspaceExtensionProps{return {session:{instanceId:'37f65a1d-aa62-46cf-8ba4-79ec05b724d1',principal:'owner',authenticated:true},canWrite:true,localOnly:false,drafts:{},saveDraft:vi.fn(),recoverExternalDraft:vi.fn(),memos:[],save:vi.fn(),remove:vi.fn(),refresh:vi.fn(),notify:vi.fn(),select:vi.fn()};}
function deferred<T>(){let resolve:(value:T)=>void=()=>undefined;const promise=new Promise<T>((finish)=>{resolve=finish;});return {promise,resolve};}
beforeEach(()=>{vi.clearAllMocks();mock.refresh.mockResolvedValue(undefined);});afterEach(cleanup);
describe('music library upload controls and lifetime',()=>{
 it.each(['readonly','closed','unmounted'] as const)('does not publish a track after a late cover response when %s',async(state)=>{
  const pending=deferred<{id:string}>();mock.cover.mockReturnValueOnce(pending.promise);const initial=props(),view=render(<MusicLibrary {...initial}/>);fireEvent.click(screen.getByRole('button',{name:'添加歌曲'}));const dialog=screen.getByRole('dialog',{name:'添加歌曲'});
  expect(within(dialog).getByRole('button',{name:'上传音频'})).toBeTruthy();expect(within(dialog).getByRole('button',{name:'上传封面'})).toBeTruthy();
  fireEvent.change(within(dialog).getByLabelText('歌曲名称 *'),{target:{value:'测试音乐'}});fireEvent.change(within(dialog).getByLabelText('歌曲URL'),{target:{value:'https://example.org/audio.mp3'}});fireEvent.change(within(dialog).getByLabelText('封面URL'),{target:{value:'https://example.org/cover.png'}});fireEvent.click(within(dialog).getByRole('button',{name:'添加'}));await waitFor(()=>expect(mock.cover).toHaveBeenCalledTimes(1));const signal=mock.cover.mock.calls[0]?.[1];
  if(state==='readonly')view.rerender(<MusicLibrary {...initial} canWrite={false}/>);else if(state==='closed')fireEvent.click(within(dialog).getByRole('button',{name:'取消'}));else view.unmount();
  expect(signal.aborted).toBe(true);await act(async()=>{pending.resolve({id:'49ad2042-c3bf-484b-9811-1af9bce1d84b'});await pending.promise;});expect(mock.create).not.toHaveBeenCalled();expect(mock.refresh).not.toHaveBeenCalled();
 });
});
