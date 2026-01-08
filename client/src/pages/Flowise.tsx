import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { analisesAPI, apiClient } from '../lib/apiClient'
import Layout from '../components/Layout'
import AccessDenied from '../components/AccessDenied'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface CeleryStatus {
  enabled: boolean
  redis_connected: boolean
  mode: 'sync' | 'async'
  message: string
}

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

export default function Flowise() {
  const { features } = useAuth()
  const [politico, setPolitico] = useState('')
  const [lei, setLei] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [historico, setHistorico] = useState<Analise[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [celeryStatus, setCeleryStatus] = useState<CeleryStatus | null>(null)

  useEffect(() => {
    carregarCeleryStatus()
  }, [])

  useEffect(() => {
    if (features.flowiseAccess) {
      carregarHistorico()
      const interval = setInterval(carregarHistorico, 10000)
      return () => clearInterval(interval)
    }
  }, [features.flowiseAccess])

  const carregarCeleryStatus = async () => {
    try {
      const response = await apiClient.get('/system/celery-status')
      setCeleryStatus(response.data)
    } catch (error) {
      console.error('Erro ao carregar status do Celery:', error)
    }
  }

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
      const response = await apiClient.get(`/analises/${analiseId}/export/${formato}`, {
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
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">Concluído</span>
      case 'processando':
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700">Processando...</span>
      case 'pendente':
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">Pendente</span>
      case 'erro':
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">Erro</span>
      default:
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">{status}</span>
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

  if (!features.flowiseAccess) {
    return (
      <Layout>
        <AccessDenied feature="flowise" />
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Flowise - Análise com IA
          </h1>
          <p className="text-gray-600">
            Execute análises automatizadas usando o poder do Flowise
          </p>
        </div>

        {celeryStatus && (
          <div className={`mb-6 p-4 rounded-lg border ${
            celeryStatus.mode === 'async' 
              ? 'bg-emerald-50 border-emerald-200' 
              : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                celeryStatus.mode === 'async' ? 'bg-emerald-100' : 'bg-amber-100'
              }`}>
                {celeryStatus.mode === 'async' ? (
                  <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <h4 className={`font-semibold ${
                  celeryStatus.mode === 'async' ? 'text-emerald-800' : 'text-amber-800'
                }`}>
                  {celeryStatus.mode === 'async' ? 'Modo Assíncrono Ativo' : 'Modo Síncrono Ativo'}
                </h4>
                <p className={`text-sm mt-1 ${
                  celeryStatus.mode === 'async' ? 'text-emerald-700' : 'text-amber-700'
                }`}>
                  {celeryStatus.message}
                </p>
                {celeryStatus.mode === 'sync' && (
                  <p className="text-xs mt-2 text-amber-600">
                    Para habilitar o modo assíncrono (melhor performance), configure REDIS_URL nas variáveis de ambiente.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Nova Análise</h3>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="politico" className="block text-sm font-medium text-gray-700 mb-2">
                Assunto
              </label>
              <input
                id="politico"
                type="text"
                value={politico}
                onChange={(e) => setPolitico(e.target.value)}
                placeholder="Ex: Tema principal da análise"
                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="lei" className="block text-sm font-medium text-gray-700 mb-2">
                Contexto
              </label>
              <input
                id="lei"
                type="text"
                value={lei}
                onChange={(e) => setLei(e.target.value)}
                placeholder="Ex: Detalhes ou contexto da análise"
                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            <button
              onClick={iniciarAnalise}
              disabled={enviando}
              className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
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

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Histórico de Análises</h3>
            <button
              onClick={carregarHistorico}
              className="text-sm text-teal-600 hover:text-teal-700 flex items-center gap-1 font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Atualizar
            </button>
          </div>

          {carregando ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            </div>
          ) : historico.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-4">📋</div>
              <p>Nenhuma análise encontrada</p>
              <p className="text-sm mt-1">Crie sua primeira análise acima!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historico.map((analise) => (
                <div
                  key={analise.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-teal-300 transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h4 className="font-semibold text-gray-900">{analise.politico}</h4>
                        {getStatusBadge(analise.status)}
                      </div>
                      <p className="text-sm text-gray-500 mb-2">{analise.lei}</p>
                      <div className="flex gap-4 text-xs text-gray-400">
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
                        >
                          PDF
                        </button>
                        <button
                          onClick={() => exportarAnalise(analise.id, 'docx')}
                          className="px-2 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                        >
                          DOCX
                        </button>
                        <button
                          onClick={() => setExpandedId(expandedId === analise.id ? null : analise.id)}
                          className="text-teal-600 hover:text-teal-700 text-sm font-medium"
                        >
                          {expandedId === analise.id ? 'Ocultar' : 'Ver'}
                        </button>
                      </div>
                    )}
                  </div>

                  {analise.error_message && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-sm text-red-600">
                        <strong>Erro:</strong> {analise.error_message}
                      </p>
                    </div>
                  )}

                  {expandedId === analise.id && analise.resultado && (
                    <div className="mt-3 p-4 bg-gray-50 border border-gray-200 rounded-md">
                      <div className="prose prose-sm max-w-none">
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
      </div>
    </Layout>
  )
}
