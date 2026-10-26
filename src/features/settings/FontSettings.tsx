import {useEffect,useRef,useState} from 'react';
import {Check,ChevronDown,ChevronUp,Type} from 'lucide-react';
import type {PreferenceValues} from '../../../shared/contracts/preferences';
import {Input} from '../presentation/ui/input';
import {Label} from '../presentation/ui/label';
const presetSizes=[14,15,16,17,18].map((value)=>({value,label:`${value}px${value===16?'（默认）':''}`}));
export default function FontSettings({font,themeColor,onFontChange:handleFontChange,onSizeChange:updateFontConfig}:{font:PreferenceValues['font'];themeColor:string;onFontChange:(font:string)=>void;onSizeChange:(patch:{fontSize:number})=>void}){
  const [expanded,setExpanded]=useState(false);
  const [fontSizeMenuOpen,setFontSizeMenuOpen]=useState(false);
  const fontSizeBtnRef=useRef<HTMLButtonElement>(null),fontSizeMenuRef=useRef<HTMLDivElement>(null);
  const fontConfig={selectedFont:font.family==='system'?'default':font.family};
  const baseFontSize=font.size;
  const currentPreset=presetSizes.some((preset)=>preset.value===baseFontSize)?String(baseFontSize):'custom';
  useEffect(()=>{if(!fontSizeMenuOpen)return;const close=(event:MouseEvent)=>{if(event.target instanceof Node&&!fontSizeBtnRef.current?.contains(event.target)&&!fontSizeMenuRef.current?.contains(event.target))setFontSizeMenuOpen(false);};document.addEventListener('mousedown',close);return ()=>document.removeEventListener('mousedown',close);},[fontSizeMenuOpen]);
  return (
<div className="space-y-4">
                <div
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => setExpanded((value)=>!value)}
                >
                  <Label className="text-sm font-medium cursor-pointer flex items-center">
                    <Type className="h-4 w-4 mr-2" />
                    字体设置
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
                  <div id="font-form-container" className="space-y-4 pl-4 pr-2 pb-4">
                    {/* 字体选择网格 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        { value: 'default', name: '默认字体', preview: 'Aa 默认', desc: '系统默认字体' },
                        { value: 'jinghua', name: '京华老宋体', preview: 'Aa 宋体', desc: '传统宋体，适合正式文档' },
                        { value: 'lxgw', name: '霞鹜文楷', preview: 'Aa 文楷', desc: '现代楷体，易读性佳' },
                        { value: 'kongshan', name: '空山', preview: 'Aa 空山', desc: '艺术字体，独特风格' }
                      ].map((font) => (
                      <button
                        key={font.value}
                        onClick={() => handleFontChange(font.value)}
                        title={font.desc}
                        className={`p-3 rounded-lg border-2 transition-all duration-200 text-left hover:shadow-md ${
                          fontConfig.selectedFont === font.value
                            ? 'border-current shadow-md'
                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                        } bg-white dark:bg-gray-700`}
                        style={fontConfig.selectedFont === font.value ? {
                          borderColor: themeColor,
                          backgroundColor: `${themeColor}10`
                        } : {}}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex flex-col space-y-1 flex-1">
                            <div
                              className={`text-lg font-medium ${
                                font.value !== 'default' ? `font-preview-${font.value}` : ''
                              }`}
                            >
                              {font.preview}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              {font.name}
                            </div>
                          </div>
                          {fontConfig.selectedFont === font.value && (
                            <Check
                              className="h-4 w-4 flex-shrink-0 mt-1"
                              style={{ color: themeColor }}
                            />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* 字体大小设置 */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div className="col-span-2 space-y-2">
                      <Label className="text-sm font-medium">字体大小</Label>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <button
                            type="button"
                            ref={fontSizeBtnRef}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFontSizeMenuOpen(o => !o); }}
                            className="w-full h-9 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 pl-3 pr-8 text-sm text-left shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors focus:outline-none"
                          >
                            {currentPreset === 'custom' ? `自定义：${baseFontSize}px` : (presetSizes.find(p => String(p.value) === currentPreset)?.label || '选择字号')}
                            <ChevronDown
                              className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 transition-transform ${fontSizeMenuOpen ? 'rotate-180' : ''}`}
                            />
                          </button>
                          {fontSizeMenuOpen && (
                            <div
                              ref={fontSizeMenuRef}
                              className="absolute left-0 right-0 mt-1 z-40 border rounded-md shadow-lg overflow-hidden bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 animate-in fade-in zoom-in-95"
                              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            >
                              <div className="py-1 max-h-64 overflow-auto custom-scrollbar">
                                {presetSizes.map(p => (
                                  <button
                                    key={`size-${p.value}`}
                                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${p.value === baseFontSize ? 'bg-gray-100 dark:bg-gray-600/60' : 'hover:bg-gray-100 dark:hover:bg-gray-600/60'}`}
                                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); updateFontConfig({ fontSize: p.value }); setFontSizeMenuOpen(false); }}
                                  >
                                    {p.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={10}
                            max={32}
                            step={1}
                            value={baseFontSize}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              if (!Number.isNaN(v)) {
                                const clamped = Math.max(10, Math.min(32, v));
                                updateFontConfig({ fontSize: clamped });
                              }
                            }}
                            className="w-24 text-sm no-spinner"
                            onWheel={(e) => {
                              e.preventDefault();
                              const delta = e.deltaY < 0 ? 1 : -1;
                              const next = Math.max(10, Math.min(32, (Number(baseFontSize) || 16) + delta));
                              updateFontConfig({ fontSize: next });
                            }}
                            style={{ appearance: 'textfield' }}
                          />
                          <span className="text-sm text-gray-500 dark:text-gray-400">px</span>
                        </div>
                      </div>
                    </div>
                    <div className="col-span-1 text-right text-xs text-gray-500 dark:text-gray-400">默认 16px</div>
                  </div>

                  {/* 字体预览区域 */}
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600" style={{ fontSize: `${baseFontSize}px` }}>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">预览效果：</div>
                    
                      <div
                        className={`text-gray-900 dark:text-white transition-all duration-300 ${
                          fontConfig.selectedFont !== 'default' ? 'custom-font-content' : ''
                        }`}
                      >
                        现在的想法是……记录生活中的点点滴滴，感受文字的魅力。
                      </div>

                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    字体将应用于所有Memos、编辑器、每日一言和标签管理
                  </p>
                  </div>
                  </div>
                )}
              </div>);
}
