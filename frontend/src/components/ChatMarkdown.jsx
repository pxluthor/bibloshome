import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Renderiza markdown de LLM com estilos Tailwind aplicados por elemento
// (o projeto não usa o plugin @tailwindcss/typography, então estilizamos à mão).
const COMPONENTS = {
    h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1.5 first:mt-0">{children}</h1>,
    h2: ({ children }) => <h2 className="text-sm font-bold mt-3 mb-1.5 first:mt-0">{children}</h2>,
    h3: ({ children }) => <h3 className="text-sm font-semibold mt-2.5 mb-1 first:mt-0">{children}</h3>,
    h4: ({ children }) => <h4 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h4>,
    p:  ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
    ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    a: ({ children, href }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-purple-600 underline hover:text-purple-800">
            {children}
        </a>
    ),
    blockquote: ({ children }) => (
        <blockquote className="border-l-2 border-purple-300 pl-3 italic text-gray-600 my-2">{children}</blockquote>
    ),
    hr: () => <hr className="border-gray-200 my-3" />,
    code: ({ className, children, ...props }) => {
        const isBlock = /language-/.test(className || '');
        if (isBlock) {
            return <code className={`${className} font-mono`} {...props}>{children}</code>;
        }
        return (
            <code className="bg-black/10 rounded px-1 py-0.5 text-[0.85em] font-mono" {...props}>
                {children}
            </code>
        );
    },
    pre: ({ children }) => (
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto text-xs my-2 leading-relaxed">
            {children}
        </pre>
    ),
    table: ({ children }) => (
        <div className="overflow-x-auto my-2">
            <table className="w-full text-xs border-collapse">{children}</table>
        </div>
    ),
    th: ({ children }) => <th className="border border-gray-300 px-2 py-1 bg-gray-50 font-semibold text-left">{children}</th>,
    td: ({ children }) => <td className="border border-gray-300 px-2 py-1 align-top">{children}</td>,
};

export default function ChatMarkdown({ content }) {
    return (
        <div className="break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
                {content || ''}
            </ReactMarkdown>
        </div>
    );
}
