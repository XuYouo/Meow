import {useState} from 'react';
import {ChevronDown,ChevronUp,Image as ImageIcon} from 'lucide-react';
import type {PreferenceValues} from '../../../shared/contracts/preferences';
import {Label} from '../presentation/ui/label';
import {Slider} from '../presentation/ui/slider';
import ImageUpload from './ImageUpload';
interface Props{themeColor:string;background:PreferenceValues['background'];avatarMediaId:string|null;instanceId:string;localOnly:boolean;canWrite:boolean;backgroundBusy:boolean;onAvatarChange:(mediaId:string|null)=>void;onBackgroundChange:(key:'imageUrl'|'brightness'|'blur',value:string|number|null|undefined)=>void;onToggleRandom:()=>void;onRandom:()=>Promise<void>}
export default function AppearanceSettings({themeColor,background,avatarMediaId,instanceId,localOnly,canWrite,backgroundBusy,onAvatarChange,onBackgroundChange:handleBackgroundConfigChange,onToggleRandom:toggleRandomBackground,onRandom:randomBackground}:Props){
  const [expanded,setExpanded]=useState(false);
  const avatarConfig={imageUrl:avatarMediaId};
  const backgroundConfig={...background,imageUrl:background.mediaId};
  return (
<div className="space-y-4">
                <div
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => setExpanded((value)=>!value)}
                >
                  <Label className="text-sm font-medium cursor-pointer flex items-center">
                    <ImageIcon className="h-4 w-4 mr-2" />
                    外观设置
                  </Label>
                  <button
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded((value)=>!value);
                    }}
                  >
                    {expanded ?
                      <ChevronUp className="h-4 w-4" /> :
                      <ChevronDown className="h-4 w-4" />
                    }
                  </button>
                </div>

                {/* 折叠内容 - 添加平滑过渡动画 */}
                {expanded && (
                  <div className="animate-in slide-in-from-top-2 duration-200">
                    <div className="space-y-6 pl-4 pr-2 pb-4">
                      {/* 头像设置 */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">用户头像</Label>
                        <ImageUpload
                          value={avatarConfig.imageUrl} instanceId={instanceId} localOnly={localOnly} disabled={!canWrite}
                          onChange={(url) => onAvatarChange(url)}
                          onClear={() => onAvatarChange(null)}
                          uploadType="avatar"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {avatarConfig?.imageUrl
                            ? '自定义头像将覆盖默认头像显示'
                            : '未设置时将使用默认头像'
                          }
                        </p>
                      </div>

                      {/* 分割线 */}
                      <div className="border-t border-gray-200 dark:border-gray-700"></div>

                      {/* 背景图片设置 */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">背景图片</Label>
                        {/* 使用随机背景 开关 */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm">使用随机背景</span>
                          <button
                            onClick={toggleRandomBackground} disabled={backgroundBusy || localOnly} aria-label='使用随机背景' aria-pressed={backgroundConfig.useRandom}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              backgroundConfig.useRandom
                                ? 'bg-blue-600'
                                : 'bg-gray-200 dark:bg-gray-700'
                            }`}
                            style={backgroundConfig.useRandom ? { backgroundColor: themeColor } : {}}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                backgroundConfig.useRandom ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                        {backgroundConfig.useRandom && (
                          <p className="text-xs text-gray-500 dark:text-gray-400"><button type="button" disabled={backgroundBusy || localOnly} onClick={() => void randomBackground()}>{backgroundBusy ? '正在获取…' : '换一张随机背景'}</button></p>
                        )}
                        <ImageUpload
                          value={backgroundConfig.imageUrl} instanceId={instanceId} localOnly={localOnly} disabled={!canWrite}
                          onChange={(url) => handleBackgroundConfigChange('imageUrl', url)}
                          onClear={() => handleBackgroundConfigChange('imageUrl', null)}
                          uploadType="background"
                        />
                        {backgroundConfig.useRandom && (
                          <p className="text-xs text-amber-600 dark:text-amber-400">点击首页的收藏按钮可固定当前随机背景。</p>
                        )}

                        {/* 有背景或使用随机背景时显示效果调节 */}
                        {(backgroundConfig.imageUrl || backgroundConfig.useRandom) && (
                          <div className="space-y-4">
                            {/* 亮度调节 */}
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">
                                亮度 ({backgroundConfig.brightness}%)
                              </Label>
                              <Slider
                                value={[backgroundConfig.brightness]}
                                onValueChange={(value) => handleBackgroundConfigChange('brightness', value[0])}
                                max={100}
                                min={0}
                                step={1}
                                className="w-full"
                              />
                            </div>

                            {/* 磨砂玻璃效果调节 */}
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">
                                磨砂玻璃效果 ({backgroundConfig.blur}px)
                              </Label>
                              <Slider
                                value={[backgroundConfig.blur]}
                                onValueChange={(value) => handleBackgroundConfigChange('blur', value[0])}
                                max={50}
                                min={0}
                                step={1}
                                className="w-full"
                              />
                            </div>
                          </div>
                        )}

                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {backgroundConfig.imageUrl
                            ? '调节亮度和磨砂玻璃效果，点击图片右上角×可移除背景'
                            : (backgroundConfig.useRandom
                                ? '随机背景开启中，可在侧边栏点击爱心收藏当前背景'
                                : '拖拽图片文件或粘贴图片链接来设置背景')
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
  );
}
