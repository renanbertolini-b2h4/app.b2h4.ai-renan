import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownContentProps {
  content: string
}

export default function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="markdown-content px-8 py-6 bg-white max-w-[210mm] mx-auto font-sans print:px-0 print:py-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold text-[#1e293b] text-center mb-4 leading-tight">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold text-[#00D4D4] mt-6 mb-3 leading-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-bold text-[#1e293b] mt-4 mb-2 leading-tight">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-sm text-[#1e293b] mb-3 leading-relaxed">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="text-sm text-[#64748b] mb-4 ml-5 leading-relaxed list-disc">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="text-sm text-[#64748b] mb-4 ml-5 leading-relaxed list-decimal">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="mb-1">
              {children}
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-[#1e293b]">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-[#64748b]">
              {children}
            </em>
          ),
          code: ({ children }) => (
            <code className="font-mono text-xs bg-[#f1f5f9] px-1.5 py-0.5 rounded text-[#1e293b]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="font-mono text-xs bg-[#f1f5f9] p-4 rounded-lg overflow-x-auto mb-4">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-[#00D4D4] pl-4 my-4 text-[#64748b] italic">
              {children}
            </blockquote>
          ),
          hr: () => (
            <hr className="border-t border-[#e2e8f0] my-6" />
          ),
          a: ({ children, href }) => (
            <a href={href} className="text-[#00D4D4] hover:underline">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto mb-4">
              <table className="min-w-full text-sm border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#f1f5f9]">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="border border-[#e2e8f0] px-3 py-2 text-left font-bold text-[#1e293b]">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-[#e2e8f0] px-3 py-2 text-[#64748b]">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
