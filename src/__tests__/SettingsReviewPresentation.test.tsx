// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { PreferenceValuesSchema,PreferencesSchema } from '../../shared/contracts/preferences';
import { defaultPreferences } from '../../server/services/preferences/utils/defaultPreferences';
import type { WorkspaceExtensionProps } from '../pages/Index';
import { readDevicePreferences,defaultKeyboardShortcuts,KeyboardShortcutsSchema } from '../system/storage/DevicePreferences';
import { matchesShortcut,normalizeShortcut } from '../system/storage/KeyboardShortcut';

const mock=vi.hoisted(()=>({update:vi.fn(),list:vi.fn(),record:vi.fn(),group:vi.fn()}));
vi.mock('../features/settings/PreferencesProvider',()=>({usePreferences:()=>({update:mock.update,preferences:{reviewTimezone:'UTC'}})}));
vi.mock('../features/presentation/PresentationContext',()=>({useTheme:()=>({themeColor:'#818CF8',currentFont:'default'})}));
vi.mock('../apis/integrations/GetRepositoryStatsAPI',()=>({GetRepositoryStatsAPI:()=>Promise.resolve({stars:123,url:'https://github.com/y-shi23/MeowNocode'})}));
vi.mock('../apis/integrations/GetIntegrationStatusAPI',()=>({GetIntegrationStatusAPI:()=>Promise.resolve({aiConfigured:true,aiModel:'configured-model'})}));
vi.mock('../features/transfer',()=>({default:()=> <div>真实备份入口</div>}));
vi.mock('../apis/review/ListReviewResultsAPI',()=>({ListReviewResultsAPI:mock.list}));
vi.mock('../apis/review/RecordReviewAPI',()=>({RecordReviewAPI:mock.record}));
vi.mock('../apis/review/ResetReviewGroupAPI',()=>({ResetReviewGroupAPI:mock.group}));
import SettingsCard from '../features/settings/SettingsCard';
import ReviewPanel,{businessDay} from '../features/review/ReviewPanel';

const session={authenticated:true,principal:'owner' as const,instanceId:'ce0c503d-3b26-45df-84eb-eb342120b93f'};
const today=businessDay(new Date(),'UTC');
const first={id:'fb0810f4-6824-4110-9683-f12f93cd7746',content:'正面合成笔记',tags:[],links:[],backlinks:['dd825889-ce74-4136-bb21-05cd3047ee27'],attachments:[],isPinned:false,isPublic:false,revision:1,createdAt:`${today}T01:00:00.000Z`,updatedAt:`${today}T02:00:00.000Z`};
const second={...first,id:'dd825889-ce74-4136-bb21-05cd3047ee27',content:'另一条合成双链',backlinks:[],updatedAt:`${today}T01:00:00.000Z`};
function props():WorkspaceExtensionProps{return {session,drafts:{},saveDraft:vi.fn(),recoverExternalDraft:vi.fn(),localOnly:false,canWrite:true,memos:[first,second],save:vi.fn(),remove:vi.fn(),refresh:vi.fn(),notify:vi.fn(),select:vi.fn(),onClose:vi.fn(),isOpen:true};}
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();mock.update.mockResolvedValue(undefined);mock.list.mockResolvedValue({items:[],nextOffset:null,total:0});mock.record.mockImplementation((input)=>Promise.resolve({...input,revision:1,updatedAt:new Date().toISOString()}));});
afterEach(cleanup);
describe('preserved settings and review presentation',()=>{
 it('keeps original settings modal, font choices, auto-save and data tab',async()=>{
  render(<SettingsCard {...props()} initial={PreferenceValuesSchema.strip().parse(defaultPreferences())}/>);
  const modal=screen.getByRole('dialog',{name:'设置'});expect(modal.className).toContain('fixed inset-0 bg-black');
  expect(screen.getByPlaceholderText('#818CF8')).toHaveProperty('value','#818CF8');
  fireEvent.click(screen.getByText('字体设置'));fireEvent.click(screen.getByTitle('传统宋体，适合正式文档'));
  await waitFor(()=>expect(mock.update).toHaveBeenCalledTimes(1));expect(mock.update.mock.calls[0]?.[0]).toMatchObject({font:{family:'jinghua',size:16},accentColor:'#818CF8',musicEnabled:true});
  fireEvent.change(screen.getByPlaceholderText('#818CF8'),{target:{value:'#12'}});expect(mock.update).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('数据'));expect(screen.getByText('真实备份入口')).toBeTruthy();
 });
 it('accepts the actual server preferences DTO and submits only editable values',async()=>{
  const dto=PreferencesSchema.parse({...defaultPreferences(),revision:7,updatedAt:'2026-10-24T01:00:00.000Z'});
  render(<SettingsCard {...props()} initial={dto}/>);
  fireEvent.click(screen.getByText('字体设置'));
  fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'17'}});
  await waitFor(()=>expect(mock.update).toHaveBeenCalledTimes(1));
  const submitted=mock.update.mock.calls[0]?.[0];
  expect(submitted).toMatchObject({font:{size:17},accentColor:'#818CF8'});
  expect(submitted).not.toHaveProperty('revision');expect(submitted).not.toHaveProperty('updatedAt');
  expect(PreferenceValuesSchema.safeParse(submitted).success).toBe(true);
 });
 it('retains an unsaved settings draft after a network failure and reopening the modal',async()=>{
  mock.update.mockRejectedValue(new Error('网络不可用，修改未确认'));
  const initial=PreferenceValuesSchema.strip().parse(defaultPreferences());
  const first=render(<SettingsCard {...props()} initial={initial}/>);
  fireEvent.change(screen.getByPlaceholderText('#818CF8'),{target:{value:'#123456'}});
  await screen.findByText('网络不可用，修改未确认');first.unmount();
  render(<SettingsCard {...props()} initial={initial}/>);
  expect(screen.getByPlaceholderText('#818CF8')).toHaveProperty('value','#123456');
  expect(localStorage.getItem(`meow:v2:${session.instanceId}:owner:preferences-draft`)).toContain('#123456');
 });
 it('records one optional shortcut per action and rejects duplicate bindings',async()=>{
  render(<SettingsCard {...props()} initial={PreferenceValuesSchema.strip().parse(defaultPreferences())}/>);
  fireEvent.click(screen.getByText('快捷键设置',{selector:'label'}));
  fireEvent.click(screen.getByText('Ctrl+,').closest('button')!);
  fireEvent.keyDown(window,{key:'q',ctrlKey:true,shiftKey:true});fireEvent.keyUp(window,{key:'q',ctrlKey:true,shiftKey:true});
  expect(readDevicePreferences(session.instanceId).shortcuts.openSettings).toBe('Ctrl+Shift+Q');
  fireEvent.click(screen.getByText('禁用设置快捷键'));expect(readDevicePreferences(session.instanceId).shortcuts.openSettings).toBeNull();
  expect(KeyboardShortcutsSchema.safeParse({...defaultKeyboardShortcuts,openSettings:'Tab'}).success).toBe(false);
  expect(normalizeShortcut(defaultKeyboardShortcuts.openDailyReview!)).toBe('Ctrl+\\');
  expect(matchesShortcut({key:'q',metaKey:true,ctrlKey:false,altKey:false,shiftKey:true},'Ctrl+Shift+Q')).toBe(true);
 });
 it('keeps the original flip card and direction key semantics, including unreviewed notes',async()=>{
  const view=render(<ReviewPanel {...props()}/>);await waitFor(()=>expect(mock.list).toHaveBeenCalled());
  expect(screen.getByRole('dialog',{name:'每日回顾'}).className).toContain('daily-review-content');
  expect(view.container.ownerDocument.querySelector('[style*="1200px"]')).toBeTruthy();
  fireEvent.keyDown(document,{key:' ',code:'Space'});expect(view.container.ownerDocument.querySelector('[style*="rotateY(180deg)"]')).toBeTruthy();
  fireEvent.keyDown(document,{key:'ArrowDown'});expect(mock.record).not.toHaveBeenCalled();
  fireEvent.keyDown(document,{key:' ',code:'Space'});fireEvent.keyDown(document,{key:'ArrowDown'});
  await waitFor(()=>expect(mock.record).toHaveBeenCalledTimes(1));expect(mock.record.mock.calls[0]?.[0]).toMatchObject({memoId:first.id,result:'PASS',day:today,timezone:'UTC'});
  fireEvent.keyDown(document,{key:'ArrowUp'});await waitFor(()=>expect(mock.record).toHaveBeenCalledTimes(2));expect(mock.record.mock.calls[1]?.[0]).toMatchObject({memoId:second.id,result:'FAIL'});
 });
 it('protects settings drafts, image preparation and review writes in a read-only tab',async()=>{
  const p=props();p.canWrite=false;
  const draftKey=`meow:v2:${session.instanceId}:owner:preferences-draft`;
  const original=PreferenceValuesSchema.strip().parse(defaultPreferences());
  localStorage.setItem(draftKey,JSON.stringify(original));
  const settings=render(<SettingsCard {...p} initial={original}/>);
  expect(screen.getByText('此标签页只读，请在取得编辑权的标签页修改设置。')).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText('#818CF8'),{target:{value:'#123456'}});
  expect(mock.update).not.toHaveBeenCalled();expect(JSON.parse(localStorage.getItem(draftKey)!)).toEqual(original);
  fireEvent.click(screen.getByText('外观设置'));expect(screen.getAllByRole('button',{name:'上传图片'}).every((button)=>button.tabIndex===-1)).toBe(true);
  settings.unmount();render(<ReviewPanel {...p}/>);await waitFor(()=>expect(mock.list).toHaveBeenCalled());
  fireEvent.keyDown(document,{key:'ArrowDown'});expect(mock.record).not.toHaveBeenCalled();
  expect(screen.getByRole('button',{name:'重置当日为 FAIL'})).toHaveProperty('disabled',true);
 });
 it('reads isolated cached results without network or mutations in local-only mode',async()=>{
  const p=props();p.localOnly=true;render(<ReviewPanel {...p}/>);
  await screen.findByText('离线阅读模式，重新连接后可记录回顾。');fireEvent.keyDown(document,{key:'ArrowDown'});
  expect(mock.list).not.toHaveBeenCalled();expect(mock.record).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'重置当日为 FAIL'})).toHaveProperty('disabled',true);
 });
});
