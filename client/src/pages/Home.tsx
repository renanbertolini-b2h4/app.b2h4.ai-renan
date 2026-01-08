import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocation } from 'wouter'
import { analisesAPI } from '../lib/apiClient'
import ServiceStatus from '../components/ServiceStatus'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { apiClient } from '../lib/apiClient'

interface Analise {
  id: string
  politico: string
  lei: string
  resultado: string | null
  status: string
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  execution_time: number | null
  created_at: string
  updated_at: string
}

function Home() {
  const { user, logout } = useAuth()
  const [, setLocation] = useLocation()
  const [politico, setPolitico] = useState('')
  const [lei, setLei] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [historico, setHistorico] = useState<Analise[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    carregarHistorico()
    const interval = setInterval(carregarHistorico, 10000)
    return () => clearInterval(interval)
  }, [])

  const carregarHistorico = async () => {
    try {
      const dados = await analisesAPI.listar()
      setHistorico(dados)
    } catch (error) {
      console.error('Erro ao carregar histórico:', error)
    } finally {
      setCarregando(false)
    }
  }

  const iniciarAnalise = async () => {
    if (!politico.trim() || !lei.trim()) {
      alert('Por favor, preencha todos os campos')
      return
    }

    // Feedback imediato!
    setEnviando(true)

    try {
      await analisesAPI.criar(politico, lei)
      setPolitico('')
      setLei('')
      carregarHistorico()
      alert('Análise iniciada! Acompanhe o progresso no histórico abaixo.')
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Erro ao realizar análise'
      alert(errorMessage)
    } finally {
      setEnviando(false)
    }
  }

  const exportarAnalise = async (analiseId: string, formato: 'pdf' | 'docx' | 'md') => {
    try {
      const response = await apiClient.get(`/api/analises/${analiseId}/export/${formato}`, {
        responseType: 'blob'
      })
      
      const contentDisposition = response.headers['content-disposition']
      let filename = `analise.${formato}`
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^";\n]+)"?/)
        if (match) filename = match[1]
      }
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error: any) {
      console.error('Erro ao exportar:', error)
      alert('Erro ao exportar análise. Tente novamente.')
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'concluido':
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">✅ Concluído</span>
      case 'processando':
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">⏳ Processando...</span>
      case 'pendente':
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">⏸️ Pendente</span>
      case 'erro':
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">❌ Erro</span>
      default:
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">{status}</span>
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatExecutionTime = (seconds: number | null) => {
    if (!seconds) return '-'
    if (seconds < 60) return `${seconds.toFixed(1)}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)
    return `${minutes}m ${remainingSeconds}s`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Posicionômetro Político</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setLocation('/health-check')}
              className="text-sm text-green-600 hover:text-green-700 font-medium"
            >
              Status dos Serviços
            </button>
            <button
              onClick={() => setLocation('/settings')}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Configurações
            </button>
            <span className="text-sm text-gray-600">
              {user?.full_name || user?.email}
            </span>
            <button
              onClick={logout}
              className="text-sm text-red-600 hover:text-red-700"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <ServiceStatus />
        
        {/* Formulário Nova Análise */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Nova Análise</h2>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="politico" className="block text-sm font-medium text-gray-700 mb-2">
                Nome do Político
              </label>
              <input
                id="politico"
                type="text"
                value={politico}
                onChange={(e) => setPolitico(e.target.value)}
                placeholder="Ex: Lula, Bolsonaro, etc."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="lei" className="block text-sm font-medium text-gray-700 mb-2">
                Lei ou Projeto
              </label>
              <input
                id="lei"
                type="text"
                value={lei}
                onChange={(e) => setLei(e.target.value)}
                placeholder="Ex: Reforma da Previdência, Lei do Agro, etc."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={iniciarAnalise}
              disabled={enviando}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {enviando && (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {enviando ? 'Enviando...' : 'Iniciar Análise'}
            </button>
          </div>
        </div>

        {/* Histórico de Análises */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Histórico de Análises</h2>
            <button
              onClick={carregarHistorico}
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Atualizar
            </button>
          </div>

          {carregando ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Carregando histórico...</p>
            </div>
          ) : historico.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>Nenhuma análise encontrada</p>
              <p className="text-sm mt-1">Crie sua primeira análise acima!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historico.map((analise) => (
                <div
                  key={analise.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-gray-900">{analise.politico}</h3>
                        {getStatusBadge(analise.status)}
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{analise.lei}</p>
                      <div className="flex gap-4 text-xs text-gray-500">
                        <span>📅 {formatDate(analise.created_at)}</span>
                        {analise.execution_time && (
                          <span>⏱️ {formatExecutionTime(analise.execution_time)}</span>
                        )}
                      </div>
                    </div>
                    
                    {analise.resultado && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => exportarAnalise(analise.id, 'pdf')}
                          className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                          title="Baixar PDF"
                        >
                          PDF
                        </button>
                        <button
                          onClick={() => exportarAnalise(analise.id, 'docx')}
                          className="px-2 py-1 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded transition-colors"
                          title="Baixar DOCX"
                        >
                          DOCX
                        </button>
                        <button
                          onClick={() => setExpandedId(expandedId === analise.id ? null : analise.id)}
                          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                        >
                          {expandedId === analise.id ? 'Ocultar' : 'Ver Resultado'}
                        </button>
                      </div>
                    )}
                  </div>

                  {analise.error_message && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-sm text-red-800">
                        <strong>Erro:</strong> {analise.error_message}
                      </p>
                    </div>
                  )}

                  {expandedId === analise.id && analise.resultado && (
                    <div className="mt-3 p-4 bg-white border border-gray-200 rounded-md">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Resultado da Análise:</h4>
                      
                      <div className="flex gap-2 mb-4 pb-3 border-b border-gray-200">
                        <button
                          onClick={() => exportarAnalise(analise.id, 'pdf')}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors flex items-center gap-1"
                          title="Exportar como PDF"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          PDF
                        </button>
                        <button
                          onClick={() => exportarAnalise(analise.id, 'docx')}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors flex items-center gap-1"
                          title="Exportar como DOCX"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          DOCX
                        </button>
                        <button
                          onClick={() => exportarAnalise(analise.id, 'md')}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-gray-600 hover:bg-gray-700 rounded-md transition-colors flex items-center gap-1"
                          title="Exportar como Markdown"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          MD
                        </button>
                      </div>
                      
                      <div className="prose prose-sm max-w-none markdown-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {analise.resultado}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default Home
