import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import { ChevronDown, ChevronUp, Database, Github, Music2, Quote, Settings, Star, X } from 'lucide-react';
import { PreferenceValuesSchema, type PreferenceValues } from '../../../shared/contracts/preferences';
import { GetIntegrationStatusAPI } from '../../apis/integrations/GetIntegrationStatusAPI';
import { GetRepositoryStatsAPI } from '../../apis/integrations/GetRepositoryStatsAPI';
import { FetchBackgroundAPI } from '../../apis/integrations/FetchBackgroundAPI';
import type { WorkspaceExtensionProps } from '../../pages/Index/index';
import { useModalFocus } from '../../pages/Index/hooks/useModalFocus';
import { Button } from '../presentation/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../presentation/ui/card';
import { Input } from '../presentation/ui/input';
import { Label } from '../presentation/ui/label';
import TransferFeature from '../transfer';
import MusicLibrary from '../music/MusicLibrary';
import PendingMediaPanel from '../media/PendingMediaPanel';
import { ensurePendingMediaUploaded, releasePendingMedia } from '../media/pendingMedia';
import FontSettings from './FontSettings';
import AppearanceSettings from './AppearanceSettings';
import AISettings from './AISettings';
import KeyboardSettings from './KeyboardSettings';
import { usePreferences } from './PreferencesProvider';

type Section = 'music' | 'hitokoto' | 'about';
const accents = { pink: '#c75b83', blue: '#527fc0', green: '#548a71', purple: '#8c70b6', orange: '#bd824e' };

export default function SettingsCard(props: WorkspaceExtensionProps & { initial: PreferenceValues }) {
  const { update, refresh } = usePreferences();
  const { onOpenTutorial } = props;
  const onClose = () => props.onClose?.();
  const modalRef = useModalFocus<HTMLDivElement>(props.isOpen !== false, onClose);
  const draftKey=`meow:v2:${props.session.instanceId}:owner:preferences-draft`;
  const [values, setValues] = useState(() => {
    try{const parsed=PreferenceValuesSchema.safeParse(JSON.parse(localStorage.getItem(draftKey)??'null'));return parsed.success?parsed.data:PreferenceValuesSchema.strip().parse(props.initial);}catch{return PreferenceValuesSchema.strip().parse(props.initial);}
  });
  const valuesRef = useRef(values);
  const writeAllowed=useRef(props.canWrite);writeAllowed.current=props.canWrite;
  const [saving, setSaving] = useState(0);
  const [error, setError] = useState('');
  const queue = useRef(Promise.resolve());
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function persist(next: PreferenceValues) {
    if(!writeAllowed.current){setError('此标签页只读，请在取得编辑权的标签页修改设置。');return;}
    valuesRef.current = next; setValues(next); setError('');
    try{localStorage.setItem(draftKey,JSON.stringify(next));}catch{setError('此浏览器无法保存设置草稿，请保持窗口打开。');}
    if (props.localOnly) { setError('当前离线，修改保留在此窗口。重新连接后可重试保存。'); return; }
    setSaving((count) => count + 1);
    queue.current = queue.current.catch(() => undefined).then(async () => {
      if(!writeAllowed.current)throw new Error('此标签页已变为只读，未提交的设置草稿仍保留。');
      const mediaIds = [next.avatarMediaId,next.background.mediaId].filter((id): id is string => id !== null);
      await ensurePendingMediaUploaded(props.session.instanceId,mediaIds);
      if(!writeAllowed.current)throw new Error('此标签页已变为只读，未提交的设置草稿仍保留。');
      await update(PreferenceValuesSchema.parse(next));
      if(JSON.stringify(valuesRef.current)===JSON.stringify(next))try{localStorage.removeItem(draftKey);}catch{/* The submitted value is already safe on the server. */}
      try { await releasePendingMedia(props.session.instanceId,mediaIds); } catch { props.notify('设置已保存，附件暂存清理可稍后重试。'); }
    }).catch((cause: unknown) => { if (mounted.current) setError(cause instanceof Error ? cause.message : '保存失败，修改仍保留在此窗口。'); }).finally(() => { if (mounted.current) setSaving((count) => count - 1); });
  }
  async function adoptServer() {
    const saved=await refresh();
    if(saved&&'reviewTimezone' in saved){const next=PreferenceValuesSchema.strip().parse(saved);valuesRef.current=next;setValues(next);setTempColor(/^#[a-fA-F0-9]{6}$/.test(next.accentColor)?next.accentColor:accents[next.accentColor as keyof typeof accents]);setError('');try{if(writeAllowed.current)localStorage.removeItem(draftKey);}catch{/* Displayed server value remains available. */}}
  }
  function change(patch: Partial<PreferenceValues>) { persist({...valuesRef.current,...patch}); }
  const themeColor = /^#[a-fA-F0-9]{6}$/.test(values.accentColor) ? values.accentColor : accents[values.accentColor as keyof typeof accents];
  const [tempColor,setTempColor] = useState(themeColor);
  function handleCustomColorChange(event: ChangeEvent<HTMLInputElement>) { const color = event.target.value; setTempColor(color); if (/^#[a-fA-F0-9]{6}$/.test(color)) change({accentColor:color}); }
  const [activeTab,setActiveTab] = useState<'general'|'data'>('general');
  const [expandedSections,setExpandedSections] = useState<Record<Section,boolean>>({music:false,hitokoto:false,about:false});
  function toggleSection(section: Section) { setExpandedSections((current) => ({...current,[section]:!current[section]})); }
  function handleFontChange(font: string) { const parsed = PreferenceValuesSchema.shape.font.shape.family.safeParse(font === 'default' ? 'system' : font); if (parsed.success) change({font:{...valuesRef.current.font,family:parsed.data}}); }
  function updateFontConfig(patch: {fontSize:number}) { change({font:{...valuesRef.current.font,size:patch.fontSize}}); }
  function handleBackgroundConfigChange(key:'imageUrl'|'brightness'|'blur',value:string|number|null|undefined) { if(key === 'imageUrl') change({background:{...valuesRef.current.background,mediaId:typeof value === 'string' ? value : null,mode:value ? 'image':'none',useRandom:false}}); else if(typeof value === 'number') change({background:{...valuesRef.current.background,[key]:value}}); }
  const [backgroundBusy,setBackgroundBusy] = useState(false);
  async function randomBackground() { if(props.localOnly || !writeAllowed.current || backgroundBusy) return; setBackgroundBusy(true); setError(''); try { const media = await FetchBackgroundAPI({id:crypto.randomUUID(),operationId:crypto.randomUUID()}); change({background:{...valuesRef.current.background,mediaId:media.id,mode:'image',useRandom:true}}); } catch(cause) { setError(cause instanceof Error ? cause.message : '随机背景暂时不可用。'); } finally { setBackgroundBusy(false); } }
  function toggleRandomBackground() { if(valuesRef.current.background.useRandom) change({background:{...valuesRef.current.background,useRandom:false}}); else void randomBackground(); }
  const hitokotoConfig = {enabled:values.hitokotoEnabled,types:values.hitokotoTypes};
  function handleHitokotoConfigChange(_key:'enabled',enabled:boolean) { change({hitokotoEnabled:enabled}); }
  function handleHitokotoTypeToggle(type:string) { const parsed=PreferenceValuesSchema.shape.hitokotoTypes.unwrap().element.safeParse(type); if(!parsed.success) return; const current=valuesRef.current.hitokotoTypes; const types=current.includes(parsed.data) ? current.filter((item) => item !== type) : [...current,parsed.data]; if(!types.length) {setError('请至少选择一种句子类型。');return;} change({hitokotoTypes:types}); }
  const aiConfig = {enabled:values.aiEnabled,model:values.aiModel};
  function updateAiConfig(patch:{enabled?:boolean;model?:string}) { change({...(patch.enabled !== undefined ? {aiEnabled:patch.enabled}:{}),...(patch.model !== undefined ? {aiModel:patch.model}:{})}); }
  const musicConfig = {enabled:values.musicEnabled};
  function updateMusicConfig(patch:{enabled:boolean}) { change({musicEnabled:patch.enabled}); }
  const [aiConfigured,setAIConfigured]=useState<boolean|null>(null);
  const [configuredModel,setConfiguredModel]=useState('');
  const [githubStars,setGithubStars]=useState<number|null>(null),[githubLoading,setGithubLoading]=useState(true),[githubError,setGithubError]=useState(false);
  useEffect(() => { if(props.localOnly) {setGithubLoading(false);return;} const controller=new AbortController(); void GetRepositoryStatsAPI(controller.signal).then((response) => setGithubStars(response.stars)).catch(() => {if(!controller.signal.aborted)setGithubError(true);}).finally(() => {if(!controller.signal.aborted)setGithubLoading(false);}); void GetIntegrationStatusAPI({},controller.signal).then((response) => {setAIConfigured(response.aiConfigured);setConfiguredModel(response.aiModel ?? '');}).catch(() => undefined); return () => controller.abort(); },[props.localOnly]);
  function handleOverlayClick(event:MouseEvent<HTMLDivElement>) {if(event.target===event.currentTarget)onClose();}
  return (
    <div
      ref={modalRef} role="dialog" aria-modal="true" aria-label="设置" tabIndex={-1}
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleOverlayClick}
    >
      <Card className="w-full max-w-lg max-h-[90vh] flex flex-col bg-white dark:bg-gray-800 shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg font-semibold flex items-center">
            <Settings className="h-5 w-5 mr-2" style={{ color: themeColor }} />
            设置
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose} aria-label="关闭设置"
            className="h-8 w-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        {/* 标签页导航 */}
        <div className="px-6 pb-4">
          <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('general')}
              className={`flex-1 flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'general'
                  ? 'bg-white dark:bg-gray-800 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
              style={activeTab === 'general' ? { color: themeColor } : {}}
            >
              <Settings className="h-4 w-4 mr-2" />
              常规
            </button>
            <button
              onClick={() => setActiveTab('data')}
              className={`flex-1 flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'data'
                  ? 'bg-white dark:bg-gray-800 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
              style={activeTab === 'data' ? { color: themeColor } : {}}
            >
              <Database className="h-4 w-4 mr-2" />
              数据
            </button>
          </div>
        </div>

        {/* 滚动容器 - 添加了scrollbar-hidden类 */}
        <CardContent className="space-y-6 flex-1 overflow-y-auto scrollbar-hidden">

          {/* 常规设置 */}
          {!props.canWrite && <p role='status' className='text-sm text-gray-500 dark:text-gray-400'>此标签页只读，请在取得编辑权的标签页修改设置。</p>}
          {activeTab === 'general' && (
            <fieldset disabled={!props.canWrite} className='contents'><div className="space-y-6">
              {/* 主题色设置 */}
              <div className="space-y-4">
                <Label className="text-sm font-medium">主题色</Label>

                {/* 自定义颜色输入 */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-10 h-10 rounded-lg border-2 border-gray-200 dark:border-gray-600 flex-shrink-0 shadow-sm"
                      style={{ backgroundColor: tempColor }}
                      title="颜色预览"
                    />
                    <Input
                      type="text"
                      value={tempColor}
                      onChange={(e) => handleCustomColorChange(e)}
                      placeholder="#818CF8"
                      className="flex-1 text-sm"
                    />
                  </div>
                </div>
              </div>

              <FontSettings font={values.font} themeColor={themeColor} onFontChange={handleFontChange} onSizeChange={updateFontConfig}/>

              <AppearanceSettings themeColor={themeColor} background={values.background} avatarMediaId={values.avatarMediaId} instanceId={props.session.instanceId} localOnly={props.localOnly} canWrite={props.canWrite} backgroundBusy={backgroundBusy} onAvatarChange={(avatarMediaId)=>change({avatarMediaId})} onBackgroundChange={handleBackgroundConfigChange} onToggleRandom={toggleRandomBackground} onRandom={randomBackground}/>

              {/* 音乐功能 - 折叠面板（放在外观设置下面） */}
              <div className="space-y-4">
                <div
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => toggleSection('music')}
                >
                  <Label className="text-sm font-medium cursor-pointer flex items-center">
                    <Music2 className="h-4 w-4 mr-2" />
                    音乐功能
                  </Label>
                  <button
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSection('music');
                    }}
                  >
                    {expandedSections.music ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {expandedSections.music && (
                  <div className="animate-in slide-in-from-top-2 duration-200">
                    <div className="space-y-4 pl-4 pr-2 pb-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">启用音乐功能</Label>
                        <button
                          onClick={() => {
                            const next = !musicConfig.enabled;
                            updateMusicConfig({ enabled: next });
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            musicConfig.enabled
                              ? 'bg-blue-600'
                              : 'bg-gray-200 dark:bg-gray-700'
                          }`}
                          style={musicConfig.enabled ? { backgroundColor: themeColor } : {}}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              musicConfig.enabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        关闭后：隐藏所有音乐按钮与小组件，且停止播放。
                      </p>
                      
                      {/* 音乐列表管理器 */}
                      {musicConfig.enabled && (
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <MusicLibrary {...props} />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* S3存储配置 - 移动到数据标签页 */}
              {/* 已移动到数据标签页 */}

              {/* 一言设置 - 改为折叠面板 */}
              <div className="space-y-4">
                <div
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => toggleSection('hitokoto')}
                >
                  <Label className="text-sm font-medium cursor-pointer flex items-center">
                    <Quote className="h-4 w-4 mr-2" />
                    一言设置
                  </Label>
                  <button
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSection('hitokoto');
                    }}
                  >
                    {expandedSections.hitokoto ?
                      <ChevronUp className="h-4 w-4" /> :
                      <ChevronDown className="h-4 w-4" />
                    }
                  </button>
                </div>

                {/* 折叠内容 - 添加平滑过渡动画 */}
                {expandedSections.hitokoto && (
                  <div className="animate-in slide-in-from-top-2 duration-200">
                  <div id="hitokoto-form-container" className="space-y-4 pl-4 pr-2 pb-4">
                      {/* 一言启用开关 */}
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">显示一言</Label>
                        <button
                          onClick={() => handleHitokotoConfigChange('enabled', !hitokotoConfig.enabled)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            hitokotoConfig.enabled
                              ? 'bg-blue-600'
                              : 'bg-gray-200 dark:bg-gray-700'
                          }`}
                          style={hitokotoConfig.enabled ? { backgroundColor: themeColor } : {}}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              hitokotoConfig.enabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>

                      {/* 一言类型选择 */}
                      {hitokotoConfig.enabled && (
                        <div className="space-y-3">
                          <Label className="text-sm">句子类型（可多选）</Label>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { key: 'a', label: '动画' },
                              { key: 'b', label: '漫画' },
                              { key: 'c', label: '游戏' },
                              { key: 'd', label: '文学' },
                              { key: 'i', label: '诗词' },
                              { key: 'j', label: '网易云' },
                              { key: 'k', label: '哲学' }
                            ].map(({ key, label }) => (
                              <button
                                key={key}
                                onClick={() => handleHitokotoTypeToggle(key)}
                                className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                                  hitokotoConfig.types.some((type) => type === key)
                                    ? 'border-transparent text-white'
                                    : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
                                }`}
                                style={hitokotoConfig.types.some((type) => type === key) ? {
                                  backgroundColor: themeColor,
                                  borderColor: themeColor
                                } : {}}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          {hitokotoConfig.types.length === 0 && (
                            <p className="text-xs text-red-500">请至少选择一种句子类型</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <AISettings themeColor={themeColor} aiConfig={aiConfig} aiConfigured={aiConfigured} configuredModel={configuredModel} updateAiConfig={updateAiConfig}/>

              <KeyboardSettings instanceId={props.session.instanceId} disabled={!props.canWrite} onError={setError}/>

              {/* 关于 - 折叠面板 */}
              <div className="space-y-4">
                <div
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => toggleSection('about')}
                >
                  <Label className="text-sm font-medium cursor-pointer flex items-center">
                    <Github className="h-4 w-4 mr-2" />
                    关于
                  </Label>
                  <button
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSection('about');
                    }}
                  >
                    {expandedSections.about ?
                      <ChevronUp className="h-4 w-4" /> :
                      <ChevronDown className="h-4 w-4" />
                    }
                  </button>
                </div>

                {expandedSections.about && (
                  <div className="animate-in slide-in-from-top-2 duration-200">
                    <div className="space-y-3 pl-4 pr-2 pb-4">
                      {/* GitHub 链接按钮 */}
                      <button
                        onClick={() => window.open('https://github.com/y-shi23/MeowNocode', '_blank', 'noopener,noreferrer')}
                        className="w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all bg-white dark:bg-gray-700 hover:shadow-md"
                        style={{ borderColor: themeColor }}
                        title="前往 GitHub 仓库"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${themeColor}15` }}>
                            <Github className="h-5 w-5" style={{ color: themeColor }} />
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-medium">y-shi23/MeowNocode</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">GitHub 仓库</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-sm">
                          <Star className="h-4 w-4 text-yellow-500" />
                          {githubLoading ? (
                            <span className="text-gray-500">加载中...</span>
                          ) : githubError ? (
                            <span className="text-gray-500">--</span>
                          ) : (
                            <span className="font-medium">{githubStars ?? '--'}</span>
                          )}
                        </div>
                      </button>

                      {/* 教程按钮 */}
                      <button
                        onClick={() => {
                          if (typeof onOpenTutorial === 'function') onOpenTutorial();
                          if (typeof onClose === 'function') onClose();
                        }}
                        className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 text-left bg-gray-50 dark:bg-gray-800/50"
                      >
                        <div className="text-sm font-medium mb-0.5">用户教程</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">查看 Memo 编辑与画布模式的基本用法</div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div></fieldset>
          )}

          {activeTab === 'data' && <div className="space-y-6"><TransferFeature {...props} /><PendingMediaPanel instanceId={props.session.instanceId} localOnly={props.localOnly || !props.canWrite} /></div>}
          {saving > 0 && <p role="status" className="text-xs text-gray-500">正在保存设置…</p>}
          {error && <div role="alert" className="space-y-2 text-sm text-red-500"><p>{error}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={saving > 0 || props.localOnly || !props.canWrite} onClick={() => persist(valuesRef.current)}>重试保存</Button><Button variant="outline" size="sm" disabled={saving > 0 || props.localOnly || !props.canWrite} onClick={() => void adoptServer()}>采用服务器设置</Button></div></div>}
        </CardContent>
      </Card>
    </div>
  );
}
