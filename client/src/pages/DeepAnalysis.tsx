import { useState, useEffect, useCallback } from 'react'
import Layout from '../components/Layout'
import MarkdownContent from '../components/markdown/MarkdownContent'
import { deepAnalysisAPI, piiAPI } from '../lib/apiClient'

interface PIIJob {
  id: string
  filename: string
  created_at: string
  text_length: number
  pseudonymization_mode: string
}

interface AnalysisType {
  id: string
  label: string
  icon: string
  description: string
  estimated_time: string
}

interface DetailLevel {
  id: string
  label: string
  description: string
}

interface DeepAnalysisJob {
  id: string
  pii_job_id: string
  pii_job_filename: string | null
  analysis_type: string
  analysis_type_label: string | null
  status: string
  detail_level: string
  model_used: string
  total_chunks: number
  processed_chunks: number
  current_step: string | null
  error_message: string | null
  final_result: string | null
  total_tokens_used: number
  processing_time_seconds: number | null
  created_at: string
  completed_at: string | null
  progress_percent: number
}

interface LLMModels {
  openai?: string[]
  claude?: string[]
}

const DeepAnalysis = () => {
  const [piiJobs, setPiiJobs] = useState<PIIJob[]>([])
  const [analysisTypes, setAnalysisTypes] = useState<AnalysisType[]>([])
  const [detailLevels, setDetailLevels] = useState<DetailLevel[]>([])
  const [deepAnalysisJobs, setDeepAnalysisJobs] = useState<DeepAnalysisJob[]>([])
  const [models, setModels] = useState<LLMModels>({})
  
  const [selectedPiiJob, setSelectedPiiJob] = useState<string>('')
  const [selectedType, setSelectedType] = useState<string>('')
  const [selectedDetailLevel, setSelectedDetailLevel] = useState<string>('normal')
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4-turbo')
  
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentJob, setCurrentJob] = useState<DeepAnalysisJob | null>(null)
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [deanonymizedResult, setDeanonymizedResult] = useState<string | null>(null)
  const [showDeanonymized, setShowDeanonymized] = useState(false)
  const [canDeanonymize, setCanDeanonymize] = useState(false)
  const [pseudonymizationMode, setPseudonymizationMode] = useState<string | null>(null)
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [typesData, piiJobsData, jobsData, modelsData] = await Promise.all([
        deepAnalysisAPI.getTypes(),
        deepAnalysisAPI.getPiiJobs(),
        deepAnalysisAPI.getJobs(),
        piiAPI.getModels()
      ])
      
      setAnalysisTypes(typesData.types || [])
      setDetailLevels(typesData.detail_levels || [])
      setPiiJobs(piiJobsData || [])
      setDeepAnalysisJobs(jobsData || [])
      setModels(modelsData || {})
      
      if (typesData.types?.length > 0 && !selectedType) {
        setSelectedType(typesData.types[0].id)
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido'
      setError(`Erro ao carregar dados: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }, [selectedType])

  useEffect(() => {
    loadData()
  }, [loadData])

  const startAnalysis = async () => {
    if (!selectedPiiJob || !selectedType) {
      setError('Selecione um job PII e um tipo de análise')
      return
    }
    
    setError(null)
    setIsProcessing(true)
    setProgress(0)
    setCurrentStep('Iniciando análise profunda...')
    setResult(null)
    setDeanonymizedResult(null)
    setShowDeanonymized(false)
    
    try {
      const job = await deepAnalysisAPI.createJob({
        pii_job_id: selectedPiiJob,
        analysis_type: selectedType,
        detail_level: selectedDetailLevel,
        model: selectedModel
      })
      
      setCurrentJob(job)
      
      const token = localStorage.getItem('auth_token')
      const eventSource = new EventSource(`/api/deep-analysis/jobs/${job.id}/stream?token=${token}`)
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          if (data.type === 'progress') {
            setProgress(data.progress || 0)
            setCurrentStep(data.step || '')
          } else if (data.type === 'chunk_complete') {
            setProgress(data.progress || 0)
            setCurrentStep(`Chunk ${data.chunk}/${data.total} concluído`)
          } else if (data.type === 'complete') {
            setProgress(100)
            setCurrentStep('Análise concluída!')
            setResult(data.result)
            setIsProcessing(false)
            eventSource.close()
            loadData()
            
            deepAnalysisAPI.getResult(job.id).then((resultData) => {
              setCanDeanonymize(resultData.can_deanonymize || false)
              setPseudonymizationMode(resultData.pseudonymization_mode)
            }).catch(console.error)
          } else if (data.type === 'error') {
            setError(data.error || 'Erro no processamento')
            setIsProcessing(false)
            eventSource.close()
          }
        } catch (err) {
          console.error('Erro ao processar evento:', err)
        }
      }
      
      eventSource.onerror = () => {
        setError('Conexão com o servidor perdida')
        setIsProcessing(false)
        eventSource.close()
      }
      
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido'
      setError(`Erro ao iniciar análise: ${errorMessage}`)
      setIsProcessing(false)
    }
  }

  const handleDeanonymize = async () => {
    if (!currentJob) return
    
    try {
      const response = await deepAnalysisAPI.deanonymize(currentJob.id)
      setDeanonymizedResult(response.result)
      setShowDeanonymized(true)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido'
      setError(`Erro ao re-hidratar: ${errorMessage}`)
    }
  }

  const viewHistoryJob = async (job: DeepAnalysisJob) => {
    setCurrentJob(job)
    setResult(job.final_result)
    setProgress(job.progress_percent)
    setCurrentStep(job.current_step || '')
    setDeanonymizedResult(null)
    setShowDeanonymized(false)
    setActiveTab('new')
    
    if (job.status === 'completed') {
      try {
        const resultData = await deepAnalysisAPI.getResult(job.id)
        setCanDeanonymize(resultData.can_deanonymize || false)
        setPseudonymizationMode(resultData.pseudonymization_mode)
      } catch (err) {
        console.error('Erro ao carregar resultado:', err)
      }
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('pt-BR')
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-gray-100 text-gray-800',
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-emerald-100 text-emerald-800',
      failed: 'bg-red-100 text-red-800'
    }
    const labels: Record<string, string> = {
      pending: 'Pendente',
      processing: 'Processando',
      completed: 'Concluído',
      failed: 'Falhou'
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
        {labels[status] || status}
      </span>
    )
  }

  const allModels = [...(models.openai || []), ...(models.claude || [])]

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <span className="text-3xl">🔬</span>
            Análise Profunda
          </h1>
          <p className="text-slate-600 mt-1">
            Análise detalhada com técnica Refine Chain - mantém contexto entre chunks para conexões mais ricas
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
            <button onClick={() => setError(null)} className="float-right font-bold">&times;</button>
          </div>
        )}

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('new')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'new' 
                ? 'bg-slate-800 text-white' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Nova Análise
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'history' 
                ? 'bg-slate-800 text-white' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Histórico ({deepAnalysisJobs.length})
          </button>
        </div>

        {activeTab === 'new' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-800 mb-4">1. Selecionar Conversa</h2>
                
                {piiJobs.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <p className="mb-2">Nenhum job PII processado encontrado.</p>
                    <p className="text-sm">Primeiro processe uma conversa no módulo PII Masking.</p>
                  </div>
                ) : (
                  <select
                    value={selectedPiiJob}
                    onChange={(e) => setSelectedPiiJob(e.target.value)}
                    disabled={isProcessing}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  >
                    <option value="">Selecione uma conversa processada...</option>
                    {piiJobs.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.filename} ({Math.round(job.text_length / 1000)}k chars) - {formatDate(job.created_at)}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-800 mb-4">2. Tipo de Análise</h2>
                
                <div className="grid grid-cols-2 gap-3">
                  {analysisTypes.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setSelectedType(type.id)}
                      disabled={isProcessing}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        selectedType === type.id
                          ? 'border-cyan-500 bg-cyan-50'
                          : 'border-slate-200 hover:border-slate-300'
                      } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="text-2xl mb-1">{type.icon}</div>
                      <div className="font-medium text-slate-800">{type.label}</div>
                      <div className="text-xs text-slate-500 mt-1">{type.estimated_time}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-800 mb-4">3. Configurações</h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Nível de Detalhe</label>
                    <div className="flex gap-2">
                      {detailLevels.map((level) => (
                        <button
                          key={level.id}
                          onClick={() => setSelectedDetailLevel(level.id)}
                          disabled={isProcessing}
                          className={`flex-1 px-4 py-2 rounded-lg border transition-all ${
                            selectedDetailLevel === level.id
                              ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                              : 'border-slate-200 text-slate-600 hover:border-slate-300'
                          } ${isProcessing ? 'opacity-50' : ''}`}
                        >
                          {level.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Modelo LLM</label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      disabled={isProcessing}
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    >
                      {allModels.map((model) => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <button
                onClick={startAnalysis}
                disabled={isProcessing || !selectedPiiJob || !selectedType}
                className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-all ${
                  isProcessing || !selectedPiiJob || !selectedType
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-slate-800 hover:bg-slate-700'
                }`}
              >
                {isProcessing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processando...
                  </span>
                ) : (
                  '▶️ Iniciar Análise Profunda'
                )}
              </button>
            </div>

            <div className="space-y-6">
              {(isProcessing || result) && (
                <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-800 mb-4">Progresso</h2>
                  
                  <div className="mb-4">
                    <div className="flex justify-between text-sm text-slate-600 mb-1">
                      <span>{currentStep}</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3">
                      <div 
                        className="bg-cyan-500 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  {currentJob && (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-slate-500">Tipo:</div>
                      <div className="font-medium">{currentJob.analysis_type_label}</div>
                      <div className="text-slate-500">Chunks:</div>
                      <div className="font-medium">{currentJob.processed_chunks}/{currentJob.total_chunks}</div>
                      <div className="text-slate-500">Modelo:</div>
                      <div className="font-medium">{currentJob.model_used}</div>
                    </div>
                  )}
                </div>
              )}

              {result && (
                <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
                  <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-800">Resultado</h2>
                    <div className="flex gap-2">
                      {canDeanonymize && pseudonymizationMode !== 'masking' && (
                        <button
                          onClick={() => {
                            if (showDeanonymized) {
                              setShowDeanonymized(false)
                            } else {
                              handleDeanonymize()
                            }
                          }}
                          className="px-3 py-1.5 text-sm bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors flex items-center gap-1"
                        >
                          🔓 {showDeanonymized ? 'Ver Pseudonimizado' : 'Re-hidratar'}
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="p-6 max-h-[600px] overflow-y-auto">
                    <MarkdownContent content={showDeanonymized && deanonymizedResult ? deanonymizedResult : result} />
                  </div>
                  
                  {currentJob?.processing_time_seconds && (
                    <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 text-sm text-slate-500">
                      Tempo de processamento: {Math.floor(currentJob.processing_time_seconds / 60)}min {currentJob.processing_time_seconds % 60}s
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
            <div className="overflow-x-auto">
              {deepAnalysisJobs.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p className="text-4xl mb-4">📭</p>
                  <p>Nenhuma análise profunda realizada ainda.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Conversa</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Tipo</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Status</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Tempo</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Data</th>
                      <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {deepAnalysisJobs.map((job) => (
                      <tr key={job.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800 truncate max-w-[200px]">
                            {job.pii_job_filename || 'Sem nome'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-600">{job.analysis_type_label || job.analysis_type}</span>
                        </td>
                        <td className="px-4 py-3">{getStatusBadge(job.status)}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {job.processing_time_seconds 
                            ? `${Math.floor(job.processing_time_seconds / 60)}m ${job.processing_time_seconds % 60}s`
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-sm">{formatDate(job.created_at)}</td>
                        <td className="px-4 py-3 text-right">
                          {job.status === 'completed' && (
                            <button
                              onClick={() => viewHistoryJob(job)}
                              className="px-3 py-1.5 text-sm bg-cyan-100 text-cyan-700 rounded-lg hover:bg-cyan-200 transition-colors"
                            >
                              Ver Resultado
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

export default DeepAnalysis
