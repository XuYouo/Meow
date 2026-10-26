import { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, Loader2, AlertCircle } from 'lucide-react';
import { Dialog, DialogPortal, DialogOverlay, DialogContent, DialogTitle } from '../presentation/ui/dialog';
import { Button } from '../presentation/ui/button';
import { Textarea } from '../presentation/ui/textarea';
import { ScrollArea } from '../presentation/ui/scroll-area';
import { cn } from '../presentation/functions/classNames';
import { ChatAPI } from '../../apis/integrations/ChatAPI';
import type { Memo } from '../../objects/memos/Memo';
import { usePreferences } from '../settings/PreferencesProvider';

type Message = { role: 'user' | 'assistant'; content: string; timestamp: string };
const welcome: Message = { role: 'assistant', content: '你好！我是你的AI助手。我可以帮你分析、总结或回答关于你的笔记的问题。请告诉我你需要什么帮助？', timestamp: new Date().toISOString() };
const AIDialog = ({ isOpen, onClose, memos, localOnly = false, canWrite = true }: { isOpen: boolean; onClose: () => void; memos: Memo[]; localOnly?: boolean; canWrite?: boolean }) => {
  const { preferences } = usePreferences();
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [contextIds, setContextIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingMessage]);
  useEffect(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('.ai-dialog-textarea');
    if (textarea) { textarea.style.height = 'auto'; textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`; }
  }, [inputMessage]);
  useEffect(() => { if (!isOpen || localOnly || !canWrite) abortControllerRef.current?.abort(); return () => { abortControllerRef.current?.abort(); }; }, [isOpen, localOnly, canWrite]);
  async function handleSendMessage() {
    if (!inputMessage.trim() || abortControllerRef.current || localOnly || !canWrite) return;
    if (!preferences || !('aiEnabled' in preferences) || !preferences.aiEnabled) { setError('请先在设置中启用AI功能。'); return; }
    const text = inputMessage.trim();
    const current = new AbortController(); abortControllerRef.current = current;
    setError(null); setMessages((previous) => [...previous, { role: 'user', content: text, timestamp: new Date().toISOString() }]);
    setInputMessage(''); setIsLoading(true); setStreamingMessage('');
    let collected = '';
    try {
      const model = preferences && 'aiModel' in preferences ? preferences.aiModel.trim() : '';
      await ChatAPI({ mode: 'chat', prompt: text, contextMemoIds: contextIds, history: messages.slice(1).slice(-20).map(({ role, content }) => ({ role, content })), ...(model ? { model } : {}) }, (chunk) => { collected += chunk; setStreamingMessage(collected); }, current.signal);
    } catch (cause) {
      setError(current.signal.aborted ? '已停止生成，收到的文字已保留。' : cause instanceof Error ? cause.message : 'AI请求未完成，请重试。');
    } finally {
      if (collected) setMessages((previous) => [...previous, { role: 'assistant', content: collected, timestamp: new Date().toISOString() }]);
      setStreamingMessage(''); setIsLoading(false); if (abortControllerRef.current === current) abortControllerRef.current = null;
    }
  }
  function cancelRequest() { abortControllerRef.current?.abort(); }
  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void handleSendMessage(); }
  }
  const formatTime = (timestamp: string) => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogPortal>
        <DialogOverlay className="bg-black/20 backdrop-blur-sm" />
        <DialogContent aria-describedby={undefined} className="max-w-2xl max-h-[80vh] flex flex-col p-0 gap-0 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl border dark:border-gray-700 [&>button]:hidden">
          <div className="flex flex-col h-full pt-2 relative">
            <DialogTitle className='sr-only'>AI 助手</DialogTitle>
            {/* 关闭按钮 */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="absolute top-2 right-4 z-10 h-8 w-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="h-4 w-4" />
            </Button>
          {/* 消息区域 */}
          <ScrollArea className="flex-1 p-4 max-h-[60vh] overflow-y-auto scrollbar-transparent">
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex gap-3",
                    message.role === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-3 py-2",
                      message.role === 'user'
                        ? "bg-indigo-500 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    )}
                  >
                    <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                    <div className="text-xs opacity-70 mt-1">
                      {formatTime(message.timestamp)}
                    </div>
                  </div>
                  {message.role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center">
                      <span className="text-white text-sm font-medium">你</span>
                    </div>
                  )}
                </div>
              ))}
              
              {/* 正在加载的消息 */}
              {isLoading && !streamingMessage && (
                <div className="flex gap-3 justify-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
                  </div>
                  <div className="max-w-[80%] rounded-lg px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 min-h-[40px] flex items-center">
                    <div className="text-sm flex items-center justify-center w-full">
                      <span className="flex space-x-1">
                        <span className="inline-block w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="inline-block w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="inline-block w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* 流式消息 */}
              {streamingMessage && (
                <div className="flex gap-3 justify-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
                  </div>
                  <div className="max-w-[80%] rounded-lg px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    <div className="text-sm whitespace-pre-wrap">{streamingMessage}</div>
                    {isLoading && (
                      <div className="flex items-center gap-1 mt-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span className="text-xs opacity-70">正在输入...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
          
          {/* 错误提示 */}
          {error && (
            <div className="mx-4 mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700 dark:text-red-300">{error}</div>
            </div>
          )}
          
          <details className='mx-4 my-2 text-xs text-gray-500'><summary>参考笔记（{contextIds.length}/100）</summary><div className='max-h-32 overflow-y-auto space-y-1'>{memos.map((memo) => <label className='flex gap-2' key={memo.id}><input type='checkbox' checked={contextIds.includes(memo.id)} disabled={isLoading || (!contextIds.includes(memo.id) && contextIds.length >= 100)} onChange={(event) => setContextIds((previous) => event.target.checked ? [...previous, memo.id] : previous.filter((id) => id !== memo.id))} />{memo.content.slice(0, 70)}</label>)}</div></details>
          {/* 输入区域 */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入你的问题..."
                className="flex-1 resize-none pr-10 ai-dialog-textarea scrollbar-transparent"
                rows={1}
                disabled={isLoading || localOnly || !canWrite}
                style={{ minHeight: '40px', maxHeight: '120px' }}
              />
              <Button
                onClick={isLoading ? cancelRequest : handleSendMessage}
                aria-label={isLoading ? '停止生成' : '发送问题'}
                disabled={localOnly || !canWrite || (!inputMessage.trim() && !isLoading)}
                size="icon"
                className="absolute top-1/2 right-2 h-8 w-8 -translate-y-1/2"
                variant="ghost"
              >
                {isLoading ? (
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-3 h-3 rounded-full border-2 border-current"></div>
                      <div className="absolute w-1.5 h-1.5 bg-current rounded-sm"></div>
                    </div>
                    <div className="w-4 h-4"></div>
                  </div>
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
    </Dialog>
  );
};

export default AIDialog;
