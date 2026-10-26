import { Children, Fragment, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

import { useTheme } from '../../../features/presentation/PresentationContext';
import { buildEmojiUrl, getEmojiCategory } from '../../../features/presentation/functions/emoji';
import Spoiler from './Spoiler';

export default function ContentRenderer({ content, activeTag, onTagClick }: { content: string; activeTag?: string | null; onTagClick?: (tag: string | null) => void }) {
  const { themeColor, currentFont } = useTheme();
  function decorate(children: ReactNode): ReactNode {
    return Children.map(children, (child) => {
      if (typeof child !== 'string') return child;
      const pattern = /{%\s*spoiler\b([\s\S]*?)%}|:([a-z0-9]+)_([a-z0-9_-]+):|(^|\s)(#[\u4e00-\u9fa5a-zA-Z0-9_/]+)/gi;
      const nodes: ReactNode[] = []; let previous = 0; let match: RegExpExecArray | null;
      while ((match = pattern.exec(child))) {
        if (match.index > previous) nodes.push(child.slice(previous, match.index));
        if (match[1] !== undefined) {
          const source = match[1].trim(); const tokens = source.split(/\s+/); let styleType: 'blur' | 'box' = 'blur'; let color: string | undefined; let consumed = 0;
          for (const token of tokens) {
            if (/^style:(box|blur)$/i.test(token)) { styleType = token.slice(6).toLowerCase() === 'box' ? 'box' : 'blur'; consumed++; }
            else if (/^color:/i.test(token)) { color = token.slice(6); consumed++; }
            else break;
          }
          nodes.push(<Spoiler key={`spoiler-${match.index}`} text={tokens.slice(consumed).join(' ')} styleType={styleType} color={color} />);
        } else if (match[2] && match[3] && getEmojiCategory(match[2])) {
          nodes.push(<img key={`emoji-${match.index}`} src={buildEmojiUrl(match[2], match[3])} alt={`emoji:${match[2]}_${match[3]}`} className='inline-block transition-transform duration-150 ease-out' style={{ height: '1em', width: 'auto', verticalAlign: '-0.2em', display: 'inline-block', margin: '0 0.1em' }} loading='lazy' />);
        } else if (match[5]) {
          nodes.push(match[4] ?? ''); const tag = match[5].slice(1); const isActive = tag === activeTag;
          const slash = tag.indexOf('/');
          nodes.push(<span key={`tag-${match.index}`} role='button' tabIndex={0} className={`inline-block text-xs px-2 py-1 rounded-full cursor-pointer transition-colors mx-1 border ${isActive ? '' : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 border-gray-200 dark:border-gray-600'}`} style={isActive ? { backgroundColor: `${themeColor}20`, borderColor: themeColor, color: themeColor } : {}} onClick={() => onTagClick?.(tag)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onTagClick?.(tag); } }}>{slash >= 0 ? <><span className='text-gray-500'>#{tag.slice(0, slash)}/</span><span className='font-medium'>{tag.slice(slash + 1)}</span></> : `#${tag}`}</span>);
        } else nodes.push(match[0]);
        previous = pattern.lastIndex;
      }
      if (previous < child.length) nodes.push(child.slice(previous));
      return <Fragment>{nodes}</Fragment>;
    });
  }
  const normalized = content.replace(/```(?:__html|html)\s*\n([\s\S]*?)```/g, (_match, html: string) => html);
  return <div className={`prose prose-sm max-w-none dark:prose-invert ${currentFont !== 'default' ? 'custom-font-content' : ''}`}><ReactMarkdown rehypePlugins={[rehypeRaw, rehypeSanitize]} components={{
    h1: ({ children }) => <h1 className='text-xl font-bold my-2'>{decorate(children)}</h1>,
    h2: ({ children }) => <h2 className='text-lg font-bold my-2'>{decorate(children)}</h2>,
    h3: ({ children }) => <h3 className='text-md font-bold my-2'>{decorate(children)}</h3>,
    p: ({ children }) => <span className='whitespace-pre-wrap break-words'>{decorate(children)}</span>,
    ul: ({ children }) => <ul className='list-disc pl-5 my-2'>{children}</ul>,
    ol: ({ children }) => <ol className='list-decimal pl-5 my-2'>{children}</ol>,
    li: ({ children }) => <li className='my-1'>{decorate(children)}</li>,
    strong: ({ children }) => <strong className='font-bold'>{decorate(children)}</strong>,
    em: ({ children }) => <em className='italic'>{decorate(children)}</em>,
    a: ({ href, children }) => <a href={href} target='_blank' rel='noopener noreferrer'>{decorate(children)}</a>,
  }}>{normalized}</ReactMarkdown></div>;
}
