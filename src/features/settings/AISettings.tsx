import {useState} from 'react';
import {Bot,ChevronDown,ChevronUp} from 'lucide-react';
import {Input} from '../presentation/ui/input';
import {Label} from '../presentation/ui/label';
interface Props{themeColor:string;aiConfig:{enabled:boolean;model:string};aiConfigured:boolean|null;configuredModel:string;updateAiConfig:(patch:{enabled?:boolean;model?:string})=>void}
export default function AISettings({themeColor,aiConfig,aiConfigured,configuredModel,updateAiConfig}:Props){
  const [expanded,setExpanded]=useState(false);
  return (
<div className="space-y-4">
                <div
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => setExpanded((value)=>!value)}
                >
                  <Label className="text-sm font-medium cursor-pointer flex items-center">
                    <Bot className="h-4 w-4 mr-2" />
                    AI设置
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
                    <div className="space-y-4 pl-4 pr-2 pb-4">
                      {/* AI启用开关 */}
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">启用AI功能</Label>
                        <button
                          onClick={() => updateAiConfig({ enabled: !aiConfig.enabled })}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            aiConfig.enabled
                              ? 'bg-blue-600'
                              : 'bg-gray-200 dark:bg-gray-700'
                          }`}
                          style={aiConfig.enabled ? { backgroundColor: themeColor } : {}}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              aiConfig.enabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>

                      {/* AI配置选项 */}
                      {aiConfig.enabled && (
                        <div className="space-y-4">
                          {/* Base URL设置 */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">API Base URL</Label>
                            <Input
                              type="text"
                              value={aiConfigured === null ? '配置状态未读取' : aiConfigured ? '已在服务端配置' : '尚未配置'} readOnly
                              className="w-full"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              兼容 OpenAI 格式的连接由服务端管理。
                            </p>
                          </div>

                         {/* 模型设置 */}
                         <div className="space-y-2">
                           <Label className="text-sm font-medium">模型名称</Label>
                           <Input
                             type="text"
                             value={aiConfig.model}
                             onChange={(e) => updateAiConfig({ model: e.target.value })}
                             placeholder={configuredModel || '使用服务端默认模型'}
                             className="w-full"
                           />
                           <p className="text-xs text-gray-500 dark:text-gray-400">
                             留空使用服务端默认模型。
                           </p>
                         </div>

                         {/* API Key设置 */}
                         <div className="space-y-2">
                           <Label className="text-sm font-medium">API Key</Label>
                           <Input
                             type="password"
                             value={aiConfigured ? 'configured' : ''} readOnly placeholder='在服务端配置'
                             className="w-full"
                           />
                           <p className="text-xs text-gray-500 dark:text-gray-400">
                             密钥保留在服务端，不会发送到浏览器。
                           </p>
                         </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>);
}
