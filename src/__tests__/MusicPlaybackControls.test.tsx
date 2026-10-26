// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {TrackDTO} from '../../shared/contracts/music';
import {MusicProvider,useMusic} from '../features/music/MusicProvider';
import MusicPlayer from '../features/music/MusicPlayer';
import {usePlayback} from '../features/music/usePlayback';
const mock=vi.hoisted(()=>({list:vi.fn(),remove:vi.fn()}));
vi.mock('../apis/music/ListTracksAPI',()=>({ListTracksAPI:mock.list}));
vi.mock('../apis/music/DeleteTrackAPI',()=>({DeleteTrackAPI:mock.remove}));
const session={instanceId:'84c8ff35-fe4a-470f-9bac-dfb2a68af76b',principal:'owner' as const,authenticated:true};
const track:TrackDTO={id:'c04d13fd-16a4-45db-a65a-386352798526',title:'测试曲目',artist:'合成作者',album:'',source:{kind:'external',url:'https://example.org/audio.mp3'},coverMediaId:null,lyricsMediaId:null,lyrics:'[00:03]歌词',danmaku:[],duration:90,position:0,revision:1,createdAt:'2026-10-24T00:00:00.000Z',updatedAt:'2026-10-24T00:00:00.000Z'};
function Harness({canWrite=true}:{canWrite?:boolean}){const music=useMusic();return <><button onClick={()=>music.play(track.id)}>选择测试曲目</button><MusicPlayer canWrite={canWrite} localOnly={false}/></>;}
function show(canWrite=true){return render(<MusicProvider session={session} localOnly={false}><Harness canWrite={canWrite}/></MusicProvider>);}
beforeEach(()=>{localStorage.clear();vi.resetAllMocks();mock.list.mockResolvedValue({items:[track],nextOffset:null,total:1,revision:1});mock.remove.mockResolvedValue({});vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>undefined);vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({lyrics:[]}))));});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('music playback controls and authority',()=>{
 it('seeks over the entire progress track and supports keyboard seeking with persisted device progress',async()=>{
  const view=show();await waitFor(()=>expect(mock.list).toHaveBeenCalled());fireEvent.click(screen.getByText('选择测试曲目'));
  const audio=view.container.querySelector('audio');if(!audio)throw Error('audio missing');Object.defineProperty(audio,'duration',{configurable:true,value:90});fireEvent.loadedMetadata(audio);
  const progress=screen.getByRole('slider',{name:'播放进度'});vi.spyOn(progress,'getBoundingClientRect').mockReturnValue(new DOMRect(10,0,200,6));
  fireEvent.click(progress,{clientX:110});expect(audio.currentTime).toBe(45);
  fireEvent.click(progress.firstElementChild!,{clientX:160});expect(audio.currentTime).toBe(67.5);
  fireEvent.keyDown(progress,{key:'ArrowRight'});expect(audio.currentTime).toBe(72.5);fireEvent.keyDown(progress,{key:'End'});expect(audio.currentTime).toBe(90);fireEvent.keyDown(progress,{key:'Home'});expect(audio.currentTime).toBe(0);
  await waitFor(()=>expect(JSON.parse(localStorage.getItem(`meow:v2:${session.instanceId}:owner:device:player`)??'{}').progress).toBe(0));
 });
 it('keeps one audio while keyboard-expanding, opening full view, adjusting volume and closing a nested playlist',async()=>{
  const view=show();await waitFor(()=>expect(mock.list).toHaveBeenCalled());fireEvent.click(screen.getByText('选择测试曲目'));const audio=view.container.querySelector('audio');
  fireEvent.click(screen.getByLabelText('折叠播放器'));fireEvent.keyDown(screen.getByRole('button',{name:'展开播放器'}),{key:'Enter'});expect(screen.getByRole('slider',{name:'播放进度'})).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('button',{name:'打开全屏播放器'}),{key:' '});const full=await screen.findByRole('dialog',{name:'全屏播放器'});expect(view.container.querySelector('audio')).toBe(audio);
  expect(within(full).getAllByRole('button',{name:'暂停播放'}).every((element)=>element.tagName==='BUTTON')).toBe(true);
  fireEvent.focus(within(full).getByRole('button',{name:'静音'}));const volume=within(full).getByRole('slider',{name:'音量'});fireEvent.keyDown(volume,{key:'ArrowDown'});expect(audio?.volume).toBeCloseTo(0.75);
  fireEvent.click(within(full).getByRole('button',{name:'播放列表'}));await screen.findByRole('dialog',{name:'播放列表'});fireEvent.keyDown(document,{key:'Escape'});
  await waitFor(()=>expect(screen.queryByRole('dialog',{name:'播放列表'})).toBeNull());expect(screen.getByRole('dialog',{name:'全屏播放器'})).toBeTruthy();fireEvent.keyDown(document,{key:'Escape'});await waitFor(()=>expect(screen.queryByRole('dialog',{name:'全屏播放器'})).toBeNull());expect(view.container.querySelectorAll('audio')).toHaveLength(1);expect(view.container.querySelector('audio')).toBe(audio);
 });
 it('disables playlist deletion in a reader while keeping device playback available',async()=>{
  show(false);await waitFor(()=>expect(mock.list).toHaveBeenCalled());fireEvent.click(screen.getByLabelText('播放列表'));const dialog=await screen.findByRole('dialog',{name:'播放列表'});await within(dialog).findByText(track.title);
  const remove=within(dialog).getByRole('button',{name:`删除${track.title}`});expect(remove).toHaveProperty('disabled',true);fireEvent.click(remove);expect(mock.remove).not.toHaveBeenCalled();fireEvent.click(within(dialog).getByRole('button',{name:`播放${track.title}`}));expect(mock.remove).not.toHaveBeenCalled();
 });
 it('rejects a captured writer deletion callback after ownership changes',async()=>{
  let retained:(()=>Promise<void>)|undefined;
  function Probe({canWrite}:{canWrite:boolean}){const playback=usePlayback({canWrite,localOnly:false});return <><span>count:{playback.playlist.length}</span><button onClick={()=>{retained=()=>playback.deleteSongAtIndex(1);}}>capture</button></>;}
  const view=render(<MusicProvider session={session} localOnly={false}><Probe canWrite/></MusicProvider>);await screen.findByText('count:2');fireEvent.click(screen.getByText('capture'));view.rerender(<MusicProvider session={session} localOnly={false}><Probe canWrite={false}/></MusicProvider>);await act(async()=>{await retained?.();});expect(mock.remove).not.toHaveBeenCalled();
 });
});
