import { useRef } from 'react'
import DocumentHeader from './DocumentHeader'
import DocumentFooter from './DocumentFooter'
import MarkdownContent from './MarkdownContent'

interface MarkdownViewerProps {
  content: string
  title?: string
  showExportButton?: boolean
  onClose?: () => void
}

export default function MarkdownViewer({
  content,
  title,
  showExportButton = true,
  onClose
}: MarkdownViewerProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  const handleExportPDF = async () => {
    if (!contentRef.current) return
    
    const html2pdf = (await import('html2pdf.js')).default
    
    const options = {
      margin: 0,
      filename: `${title?.replace(/\s+/g, '_') || 'documento'}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { 
        scale: 2,
        useCORS: true,
        letterRendering: true,
        logging: false
      },
      jsPDF: { 
        unit: 'mm' as const, 
        format: 'a4' as const, 
        orientation: 'portrait' as const
      }
    }
    
    html2pdf().set(options).from(contentRef.current).save()
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
          <div className="flex items-center gap-3">
            {showExportButton && (
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-2 px-4 py-2 bg-[#00D4D4] text-white rounded-lg hover:bg-[#00b8b8] transition-colors text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Exportar PDF
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto bg-gray-100">
          <div ref={contentRef} className="bg-white shadow-lg mx-auto my-4" style={{ maxWidth: '210mm' }}>
            <DocumentHeader title="Imersão C-Level em IA Generativa" />
            <MarkdownContent content={content} />
            <DocumentFooter />
          </div>
        </div>
      </div>
    </div>
  )
}
