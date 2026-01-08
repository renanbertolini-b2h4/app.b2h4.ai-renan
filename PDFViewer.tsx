import { useState, useEffect, useRef } from 'react'
import { apiClient } from '../../lib/apiClient'
import { getAuthToken } from '../../hooks/useAuthenticatedUrl'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`

interface PDFViewerProps {
  fileUrl: string
  title?: string
  onClose?: () => void
}

export default function PDFViewer({
  fileUrl,
  title,
  onClose
}: PDFViewerProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null)

  useEffect(() => {
    const loadPDF = async () => {
      try {
        setLoading(true)
        setError(null)
        
        let apiPath = fileUrl.startsWith('/api') 
          ? fileUrl.replace('/api', '') 
          : fileUrl
        
        const token = getAuthToken()
        if (token && apiPath.includes('/media/file/')) {
          const separator = apiPath.includes('?') ? '&' : '?'
          apiPath = `${apiPath}${separator}token=${encodeURIComponent(token)}`
        }
        
        const response = await apiClient.get(apiPath, {
          responseType: 'arraybuffer'
        })
        
        const blob = new Blob([response.data], { type: 'application/pdf' })
        setPdfBlob(blob)
        
        const arrayBuffer = response.data
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
        const pdfDoc = await loadingTask.promise
        pdfDocRef.current = pdfDoc
        setNumPages(pdfDoc.numPages)
        
        await renderAllPages(pdfDoc)
      } catch (err) {
        console.error('Erro ao carregar PDF:', err)
        setError('Não foi possível carregar o PDF. Verifique suas permissões.')
      } finally {
        setLoading(false)
      }
    }

    loadPDF()

    return () => {
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy()
      }
    }
  }, [fileUrl])

  const renderAllPages = async (pdfDoc: pdfjsLib.PDFDocumentProxy) => {
    if (!containerRef.current) return
    
    containerRef.current.innerHTML = ''
    
    const scale = 1.5
    
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      
      const pageContainer = document.createElement('div')
      pageContainer.className = 'pdf-page bg-white shadow-lg mb-4 mx-auto'
      pageContainer.style.width = `${viewport.width}px`
      pageContainer.style.maxWidth = '100%'
      
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      
      if (!context) continue
      
      canvas.height = viewport.height
      canvas.width = viewport.width
      canvas.style.width = '100%'
      canvas.style.height = 'auto'
      canvas.style.display = 'block'
      
      pageContainer.appendChild(canvas)
      containerRef.current.appendChild(pageContainer)
      
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise
    }
  }

  const handleDownload = () => {
    if (pdfBlob) {
      const url = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${title?.replace(/\s+/g, '_') || 'documento'}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
            {numPages > 0 && (
              <span className="text-sm text-gray-500">({numPages} {numPages === 1 ? 'página' : 'páginas'})</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDownload}
              disabled={!pdfBlob}
              className="flex items-center gap-2 px-4 py-2 bg-[#00D4D4] text-white rounded-lg hover:bg-[#00b8b8] transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
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
        
        <div className="flex-1 overflow-y-auto bg-gray-100 p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Carregando PDF...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center p-8">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <p className="text-gray-800 font-medium mb-2">Erro ao carregar PDF</p>
                <p className="text-gray-600 text-sm">{error}</p>
              </div>
            </div>
          ) : null}
          
          <div 
            ref={containerRef} 
            className="pdf-container"
            style={{ display: loading || error ? 'none' : 'block' }}
          />
        </div>
      </div>
    </div>
  )
}
