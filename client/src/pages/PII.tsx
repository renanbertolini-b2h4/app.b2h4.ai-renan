import { useState, useCallback, useRef, useEffect } from 'react'
import Layout from '../components/Layout'
import MarkdownContent from '../components/markdown/MarkdownContent'
import { piiAPI } from '../lib/apiClient'

interface PIIJob {
  id: string
  original_filename: string
  total_messages: string
  messages_with_pii: string
  total_pii_found: string
  pii_summary: Record<string, number>
  masked_chat_text: string | null
  pseudonymization_mode?: 'masking' | 'tags' | 'faker'
  status: string
  created_at: string
}

interface PIIAnalysis {
  id: string
  job_id: string
  task_type: string
  prompt: string
  llm_model: string | null
  llm_response: string | null
  status: string
  created_at: string
}

interface LLMModels {
  openai?: string[]
  claude?: string[]
}

interface ChunkProgress {
  index: number
  status: string
  retry_count: number
  error_message?: string | null
  error_code?: string | null
  processing_time_ms: number
  rate_limit_delay_s: number
}

interface AnalysisProgress {
  analysis_id: string
  job_id: string
  task_type: string
  llm_model: string | null
  status: string
  is_paused: boolean
  pause_reason: string | null
  total_chunks: number
  completed_chunks: number
  failed_chunks: number
  pending_chunks: number
  processing_chunks: number
  progress_percent: number
  chunks: ChunkProgress[]
  started_at: string | null
  estimated_completion: string | null
  estimated_remaining_seconds: number | null
  avg_chunk_time_ms: number
  rate_limit_info: {
    waiting: boolean
    wait_until: string
    remaining_seconds: number
  } | null
  can_resume: boolean
  can_change_model: boolean
}

interface PIIPattern {
  id: string
  name: string
  regex: string
  pii_type: string
  masking_strategy: string
  description: string | null
  is_default?: boolean
  created_at?: string
}

type AnalysisTaskType = 'sentiment' | 'summary' | 'topics' | 'intent' | 'quality' | 'action_items'

const TASK_LABELS: Record<AnalysisTaskType, { label: string; icon: string; description: string }> = {
  sentiment: { 
    label: 'Sentimento', 
    icon: '😊', 
    description: 'Analisa o tom emocional da conversa' 
  },
  summary: { 
    label: 'Resumo', 
    icon: '📝', 
    description: 'Gera um resumo conciso da conversa' 
  },
  topics: { 
    label: 'Tópicos', 
    icon: '📌', 
    description: 'Identifica os principais assuntos discutidos' 
  },
  intent: { 
    label: 'Intenção', 
    icon: '🎯', 
    description: 'Classifica o objetivo da conversa' 
  },
  quality: { 
    label: 'Qualidade', 
    icon: '⭐', 
    description: 'Avalia a qualidade da comunicação' 
  },
  action_items: { 
    label: 'Ações', 
    icon: '✅', 
    description: 'Extrai tarefas e compromissos' 
  }
}

const PII_TYPES = [
  { value: 'document', label: 'Documento' },
  { value: 'contact', label: 'Contato' },
  { value: 'financial', label: 'Financeiro' },
  { value: 'online', label: 'Online' },
  { value: 'personal', label: 'Pessoal' },
  { value: 'custom', label: 'Customizado' }
]

const MASKING_STRATEGIES = [
  { value: 'redaction', label: 'Redação (parcial)' },
  { value: 'hash', label: 'Hash' },
  { value: 'substitution', label: 'Substituição' }
]

const DEFAULT_PATTERNS: PIIPattern[] = [
  { id: 'default-cpf', name: 'CPF', regex: '\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}', pii_type: 'document', masking_strategy: 'redaction', description: 'CPF brasileiro', is_default: true },
  { id: 'default-email', name: 'Email', regex: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', pii_type: 'contact', masking_strategy: 'redaction', description: 'Endereço de email', is_default: true },
  { id: 'default-phone', name: 'Telefone', regex: '\\(?\\d{2}\\)?\\s?\\d{4,5}-?\\d{4}', pii_type: 'contact', masking_strategy: 'redaction', description: 'Telefone brasileiro', is_default: true },
  { id: 'default-credit-card', name: 'Cartão de Crédito', regex: '\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}', pii_type: 'financial', masking_strategy: 'redaction', description: 'Número de cartão', is_default: true },
  { id: 'default-url', name: 'URL', regex: 'https?://[^\\s]+', pii_type: 'online', masking_strategy: 'substitution', description: 'Links HTTP/HTTPS', is_default: true },
  { id: 'default-ip', name: 'IP', regex: '\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}', pii_type: 'online', masking_strategy: 'hash', description: 'Endereço IP', is_default: true },
  { id: 'default-birthdate', name: 'Data de Nascimento', regex: '\\d{2}/\\d{2}/\\d{4}', pii_type: 'personal', masking_strategy: 'redaction', description: 'Data no formato DD/MM/AAAA', is_default: true },
  { id: 'default-bank-account', name: 'Conta Bancária', regex: '\\d{4,6}-[\\dXx]', pii_type: 'financial', masking_strategy: 'redaction', description: 'Número de conta bancária', is_default: true }
]

export default function PII() {
  const [jobs, setJobs] = useState<PIIJob[]>([])
  const [selectedJob, setSelectedJob] = useState<PIIJob | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  
  const [analyses, setAnalyses] = useState<PIIAnalysis[]>([])
  const [availableModels, setAvailableModels] = useState<LLMModels>({})
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4-turbo')
  const [selectedTask, setSelectedTask] = useState<AnalysisTaskType>('summary')
  
  const [patterns, setPatterns] = useState<PIIPattern[]>([])
  const [loadingPatterns, setLoadingPatterns] = useState(false)
  const [showAddPattern, setShowAddPattern] = useState(false)
  const [editingPattern, setEditingPattern] = useState<PIIPattern | null>(null)
  const [newPattern, setNewPattern] = useState({
    name: '',
    regex: '',
    pii_type: 'custom',
    masking_strategy: 'redaction',
    description: ''
  })
  const [testText, setTestText] = useState('')
  const [testResult, setTestResult] = useState<{ matches: string[]; valid: boolean } | null>(null)
  
  const [activeTab, setActiveTab] = useState<'upload' | 'jobs' | 'analysis' | 'chat' | 'settings'>('upload')
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [resumeModel, setResumeModel] = useState<string>('gpt-3.5-turbo')
  const [showMessages, setShowMessages] = useState(false)
  const [messages, setMessages] = useState<Array<{id: string; timestamp: string; sender: string; original_content: string; masked_content: string; pii_found: Record<string, unknown>}>>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [selectedMode, setSelectedMode] = useState<'masking' | 'tags' | 'faker'>('tags')
  const [deanonymizedResponses, setDeanonymizedResponses] = useState<Record<string, string>>({})
  const [loadingDeanonymize, setLoadingDeanonymize] = useState<string | null>(null)
  
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'assistant'; content: string}>>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  const loadJobs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await piiAPI.getJobs()
      setJobs(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar jobs')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadModels = useCallback(async () => {
    try {
      const models = await piiAPI.getModels()
      setAvailableModels(models)
      const allModels = [...(models.openai || []), ...(models.claude || [])]
      if (allModels.length > 0 && !allModels.includes(selectedModel)) {
        setSelectedModel(allModels[0])
      }
    } catch {
      console.log('LLM models not available')
    }
  }, [selectedModel])

  const loadPatterns = useCallback(async () => {
    setLoadingPatterns(true)
    try {
      const customPatterns = await piiAPI.getPatterns()
      setPatterns(customPatterns)
    } catch (err) {
      console.error('Erro ao carregar padrões:', err)
    } finally {
      setLoadingPatterns(false)
    }
  }, [])

  const loadJobAnalyses = useCallback(async (jobId: string) => {
    try {
      const jobAnalyses = await piiAPI.getJobAnalyses(jobId)
      setAnalyses(jobAnalyses)
    } catch (err) {
      console.error('Erro ao carregar análises do job:', err)
    }
  }, [])

  const loadJobMessages = useCallback(async (jobId: string) => {
    setLoadingMessages(true)
    try {
      const msgs = await piiAPI.getJobMessages(jobId, 0, 500)
      setMessages(msgs)
    } catch (err) {
      console.error('Erro ao carregar mensagens:', err)
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  const fetchProgress = useCallback(async (analysisId: string) => {
    try {
      const response = await piiAPI.getAnalysisProgress(analysisId)
      setAnalysisProgress(response)
      
      if (response.status === 'completed' || response.status === 'failed') {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current)
          progressIntervalRef.current = null
        }
        setAnalyzing(false)
        
        if (response.status === 'completed') {
          setSuccessMessage('Análise concluída com sucesso!')
          try {
            const analysisDetails = await piiAPI.getAnalysis(analysisId)
            setAnalyses(prev => {
              const exists = prev.some(a => a.id === analysisDetails.id)
              if (exists) {
                return prev.map(a => a.id === analysisDetails.id ? analysisDetails : a)
              }
              return [analysisDetails, ...prev]
            })
          } catch (fetchErr) {
            console.error('Erro ao buscar detalhes da análise:', fetchErr)
          }
        }
      }
    } catch (err) {
      console.error('Erro ao buscar progresso:', err)
    }
  }, [])

  const startProgressTracking = useCallback((analysisId: string) => {
    fetchProgress(analysisId)
    
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
    }
    
    progressIntervalRef.current = setInterval(() => {
      fetchProgress(analysisId)
    }, 3000)
  }, [fetchProgress])

  const stopProgressTracking = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
    setAnalysisProgress(null)
  }, [])

  const handleResumeAnalysis = async (analysisId: string) => {
    try {
      setAnalyzing(true)
      await piiAPI.resumeAnalysis(analysisId, {
        new_model: resumeModel,
        reset_failed_chunks: true
      })
      startProgressTracking(analysisId)
      setSuccessMessage('Análise retomada!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao retomar análise')
      setAnalyzing(false)
    }
  }

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
    }
  }, [])

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.txt')) {
      setError('Por favor, envie um arquivo .txt exportado do WhatsApp')
      return
    }

    setUploading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const modeNames: Record<string, string> = {
        'masking': 'Mascaramento',
        'tags': 'Tags Semânticas',
        'faker': 'Dados Sintéticos'
      }
      const job = await piiAPI.uploadPresidio(file, selectedMode)
      setSuccessMessage(`Chat processado com ${modeNames[selectedMode]}! ${job.total_pii_found} PII(s) encontrados em ${job.messages_with_pii} mensagens.`)
      setSelectedJob(job)
      setActiveTab('jobs')
      loadJobs()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao processar arquivo')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDeanonymize = async (analysisId: string) => {
    try {
      setLoadingDeanonymize(analysisId)
      const result = await piiAPI.deanonymizeAnalysis(analysisId)
      if (result.has_vault && result.deanonymized_response) {
        setDeanonymizedResponses(prev => ({
          ...prev,
          [analysisId]: result.deanonymized_response
        }))
      } else {
        setError('Este chat não possui vault de pseudonimização. Re-hidratação não disponível.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao re-hidratar dados')
    } finally {
      setLoadingDeanonymize(null)
    }
  }

  const handleAnalyze = async () => {
    if (!selectedJob) return

    setAnalyzing(true)
    setError(null)
    setAnalysisProgress(null)

    try {
      const analysis = await piiAPI.analyzeWithLLMExecute({
        job_id: selectedJob.id,
        task_type: selectedTask,
        llm_model: selectedModel
      })
      
      if (analysis.status === 'processing' || analysis.is_chunked) {
        startProgressTracking(analysis.id)
      } else {
        setAnalyses(prev => [analysis, ...prev])
        setSuccessMessage('Análise concluída!')
        setAnalyzing(false)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao analisar com LLM')
      setAnalyzing(false)
    }
  }

  const handleTabChange = (tab: 'upload' | 'jobs' | 'analysis' | 'chat' | 'settings') => {
    setActiveTab(tab)
    if (tab === 'jobs') {
      loadJobs()
    }
    if (tab === 'analysis') {
      loadModels()
    }
    if (tab === 'settings') {
      loadPatterns()
    }
    if (tab === 'chat') {
      loadModels()
    }
  }

  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || !selectedJob) return

    const userMessage = chatInput.trim()
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setChatInput('')
    setChatLoading(true)

    try {
      const response = await piiAPI.chatWithJob({
        job_id: selectedJob.id,
        question: userMessage,
        llm_model: selectedModel,
        include_analyses: true
      })
      setChatMessages(prev => [...prev, { role: 'assistant', content: response.answer }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar mensagem')
    } finally {
      setChatLoading(false)
    }
  }

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [chatMessages])

  const handleTestRegex = () => {
    if (!newPattern.regex || !testText) {
      setTestResult(null)
      return
    }

    try {
      const regex = new RegExp(newPattern.regex, 'g')
      const matches = testText.match(regex) || []
      setTestResult({ matches, valid: true })
    } catch {
      setTestResult({ matches: [], valid: false })
    }
  }

  const handleCreatePattern = async () => {
    if (!newPattern.name || !newPattern.regex) {
      setError('Nome e regex são obrigatórios')
      return
    }

    try {
      new RegExp(newPattern.regex)
    } catch {
      setError('Regex inválido')
      return
    }

    try {
      await piiAPI.createPattern(newPattern)
      setSuccessMessage('Padrão criado com sucesso!')
      setNewPattern({ name: '', regex: '', pii_type: 'custom', masking_strategy: 'redaction', description: '' })
      setShowAddPattern(false)
      setTestText('')
      setTestResult(null)
      loadPatterns()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar padrão')
    }
  }

  const handleDeletePattern = async (patternId: string) => {
    if (!confirm('Tem certeza que deseja excluir este padrão?')) return

    try {
      await piiAPI.deletePattern(patternId)
      setSuccessMessage('Padrão excluído com sucesso!')
      loadPatterns()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir padrão')
    }
  }

  const handleEditPattern = (pattern: PIIPattern) => {
    setEditingPattern(pattern)
    setNewPattern({
      name: pattern.name,
      regex: pattern.regex,
      pii_type: pattern.pii_type,
      masking_strategy: pattern.masking_strategy,
      description: pattern.description || ''
    })
    setShowAddPattern(true)
    setTestText('')
    setTestResult(null)
  }

  const handleUpdatePattern = async () => {
    if (!editingPattern || !newPattern.name || !newPattern.regex) {
      setError('Nome e regex são obrigatórios')
      return
    }

    try {
      new RegExp(newPattern.regex)
    } catch {
      setError('Regex inválido')
      return
    }

    try {
      await piiAPI.updatePattern(editingPattern.id, newPattern)
      setSuccessMessage('Padrão atualizado com sucesso!')
      setNewPattern({ name: '', regex: '', pii_type: 'custom', masking_strategy: 'redaction', description: '' })
      setShowAddPattern(false)
      setEditingPattern(null)
      setTestText('')
      setTestResult(null)
      loadPatterns()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar padrão')
    }
  }

  const handleCancelEdit = () => {
    setShowAddPattern(false)
    setEditingPattern(null)
    setNewPattern({ name: '', regex: '', pii_type: 'custom', masking_strategy: 'redaction', description: '' })
    setTestText('')
    setTestResult(null)
  }

  useEffect(() => {
    if (newPattern.regex && testText) {
      handleTestRegex()
    }
  }, [newPattern.regex, testText])

  const renderPIISummary = (summary: Record<string, number>) => {
    return Object.entries(summary).map(([type, count]) => (
      <span 
        key={type}
        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 mr-2 mb-1"
      >
        {type}: {count}
      </span>
    ))
  }

  const getModelDisplayName = (model: string) => {
    if (model.startsWith('gpt-')) {
      return `OpenAI ${model}`
    }
    if (model.startsWith('claude-')) {
      return `Anthropic ${model}`
    }
    return model
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">PII Masking</h1>
          <p className="text-gray-600 mt-1">
            Processe conversas do WhatsApp, detecte e mascare dados pessoais, e analise com IA.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-green-800">{successMessage}</p>
            <button onClick={() => setSuccessMessage(null)} className="ml-auto text-green-500 hover:text-green-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              {[
                { id: 'upload', label: 'Upload', icon: '📤' },
                { id: 'jobs', label: 'Histórico', icon: '📋' },
                { id: 'analysis', label: 'Análise IA', icon: '🤖' },
                { id: 'chat', label: 'Chat', icon: '💬' },
                { id: 'settings', label: 'Configurações', icon: '⚙️' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id as 'upload' | 'jobs' | 'analysis' | 'chat' | 'settings')}
                  className={`
                    flex-1 py-4 px-6 text-center border-b-2 font-medium text-sm transition-colors
                    ${activeTab === tab.id
                      ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'upload' && (
              <div className="space-y-6">
                <div className="text-center py-8">
                  <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Enviar Chat do WhatsApp
                  </h3>
                  <p className="text-gray-600 mb-6 max-w-md mx-auto">
                    Exporte sua conversa do WhatsApp como arquivo .txt e envie aqui. 
                    O sistema detectará e mascara automaticamente dados pessoais como CPF, email, telefone, etc.
                  </p>

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".txt"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="chat-file"
                  />
                  <label
                    htmlFor="chat-file"
                    className={`
                      inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium cursor-pointer transition-colors
                      ${uploading 
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                      }
                    `}
                  >
                    {uploading ? (
                      <>
                        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Processando...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Selecionar Arquivo
                      </>
                    )}
                  </label>

                  <div className="mt-6 space-y-3">
                    <h4 className="text-sm font-medium text-gray-700 text-center">Técnica de Proteção</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <button
                        onClick={() => setSelectedMode('masking')}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          selectedMode === 'masking' 
                            ? 'border-orange-500 bg-orange-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">🔒</span>
                          <span className="font-medium text-gray-900">Mascaramento</span>
                          <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">Irreversível</span>
                        </div>
                        <p className="text-xs text-gray-500">João Silva → Jo** ***va</p>
                        <p className="text-xs text-gray-400 mt-1">Compartilhar com terceiros</p>
                      </button>
                      
                      <button
                        onClick={() => setSelectedMode('tags')}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          selectedMode === 'tags' 
                            ? 'border-cyan-500 bg-cyan-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">🏷️</span>
                          <span className="font-medium text-gray-900">Tags Semânticas</span>
                          <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">Recomendado</span>
                        </div>
                        <p className="text-xs text-gray-500">João Silva → [PESSOA_1]</p>
                        <p className="text-xs text-gray-400 mt-1">Análise IA precisa</p>
                      </button>
                      
                      <button
                        onClick={() => setSelectedMode('faker')}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          selectedMode === 'faker' 
                            ? 'border-purple-500 bg-purple-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">🎭</span>
                          <span className="font-medium text-gray-900">Dados Sintéticos</span>
                          <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">Reversível</span>
                        </div>
                        <p className="text-xs text-gray-500">João Silva → Carlos Santos</p>
                        <p className="text-xs text-gray-400 mt-1">Texto natural</p>
                      </button>
                    </div>
                    
                    {selectedMode === 'masking' && (
                      <p className="text-xs text-center text-orange-600 bg-orange-50 p-2 rounded">
                        ⚠️ Mascaramento é irreversível. Não será possível recuperar dados originais.
                      </p>
                    )}
                    {selectedMode === 'tags' && (
                      <p className="text-xs text-center text-cyan-600 bg-cyan-50 p-2 rounded">
                        ✅ Recomendado para análise com IA. Tags claras permitem re-hidratação perfeita.
                      </p>
                    )}
                    {selectedMode === 'faker' && (
                      <p className="text-xs text-center text-purple-600 bg-purple-50 p-2 rounded">
                        🎭 Dados fake realistas mantêm o texto natural. Pode ser revertido após análise.
                      </p>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3">Tipos de PII Detectados:</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { name: 'CPF', icon: '🪪' },
                      { name: 'Email', icon: '📧' },
                      { name: 'Telefone', icon: '📱' },
                      { name: 'Cartão de Crédito', icon: '💳' },
                      { name: 'URL', icon: '🔗' },
                      { name: 'IP', icon: '🌐' },
                      { name: 'Data de Nascimento', icon: '📅' },
                      { name: 'Conta Bancária', icon: '🏦' }
                    ].map(pii => (
                      <div key={pii.name} className="flex items-center gap-2 text-sm text-gray-700">
                        <span>{pii.icon}</span>
                        <span>{pii.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'jobs' && (
              <div className="space-y-4">
                {loading ? (
                  <div className="text-center py-8">
                    <svg className="animate-spin w-8 h-8 mx-auto text-blue-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="mt-2 text-gray-600">Carregando...</p>
                  </div>
                ) : jobs.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum chat processado</h3>
                    <p className="text-gray-600">Envie um arquivo para começar.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {jobs.map(job => (
                      <div 
                        key={job.id}
                        className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${selectedJob?.id === job.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
                        onClick={() => {
                          setSelectedJob(job)
                          setActiveTab('analysis')
                          loadModels()
                          loadJobAnalyses(job.id)
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900 flex items-center gap-2">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              {job.original_filename}
                              {job.pseudonymization_mode === 'masking' && (
                                <span className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded">🔒 Mascarado</span>
                              )}
                              {job.pseudonymization_mode === 'tags' && (
                                <span className="px-1.5 py-0.5 text-xs bg-cyan-100 text-cyan-700 rounded">🏷️ Tags</span>
                              )}
                              {job.pseudonymization_mode === 'faker' && (
                                <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">🎭 Sintético</span>
                              )}
                            </h4>
                            <div className="mt-2 flex flex-wrap gap-2 text-sm text-gray-600">
                              <span className="inline-flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                </svg>
                                {job.total_messages} mensagens
                              </span>
                              <span className="inline-flex items-center gap-1 text-red-600">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                {job.total_pii_found} PIIs mascarados
                              </span>
                            </div>
                            <div className="mt-2">
                              {renderPIISummary(job.pii_summary)}
                            </div>
                          </div>
                          <div className="text-right text-sm text-gray-500">
                            {new Date(job.created_at).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'analysis' && (
              <div className="space-y-6">
                {!selectedJob ? (
                  <div className="text-center py-8">
                    <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Selecione um chat</h3>
                    <p className="text-gray-600">Vá até o histórico e selecione um chat para analisar.</p>
                    <button
                      onClick={() => handleTabChange('jobs')}
                      className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Ver Histórico
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-blue-900">{selectedJob.original_filename}</h4>
                          <p className="text-sm text-blue-700 mt-1">
                            {selectedJob.total_messages} mensagens | {selectedJob.total_pii_found} PIIs mascarados
                          </p>
                        </div>
                        <button
                          onClick={() => setSelectedJob(null)}
                          className="text-blue-500 hover:text-blue-700"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => {
                            if (!showMessages) {
                              loadJobMessages(selectedJob.id)
                            }
                            setShowMessages(!showMessages)
                          }}
                          className="text-sm px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors flex items-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          {showMessages ? 'Ocultar Conversa' : 'Ver Conversa Original'}
                        </button>
                      </div>
                    </div>

                    {showMessages && (
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                          <h4 className="font-medium text-gray-900">Comparação: Original vs Mascarado</h4>
                          <span className="text-xs text-gray-500">{messages.length} mensagens</span>
                        </div>
                        {loadingMessages ? (
                          <div className="p-8 text-center">
                            <svg className="animate-spin w-6 h-6 mx-auto text-blue-600" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          </div>
                        ) : (
                          <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
                            {messages.map((msg, idx) => {
                              const hasPii = msg.original_content !== msg.masked_content
                              return (
                                <div key={msg.id || idx} className={`p-3 ${hasPii ? 'bg-red-50' : ''}`}>
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs font-medium text-gray-600">{msg.sender}</span>
                                    <span className="text-xs text-gray-400">{msg.timestamp}</span>
                                    {hasPii && (
                                      <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">PII detectado</span>
                                    )}
                                  </div>
                                  {hasPii ? (
                                    <div className="space-y-2">
                                      <div className="text-sm">
                                        <span className="text-xs font-medium text-red-600 block mb-1">Original:</span>
                                        <div className="bg-red-100 p-2 rounded text-red-900 font-mono text-xs break-all">
                                          {msg.original_content}
                                        </div>
                                      </div>
                                      <div className="text-sm">
                                        <span className="text-xs font-medium text-green-600 block mb-1">Mascarado:</span>
                                        <div className="bg-green-100 p-2 rounded text-green-900 font-mono text-xs break-all">
                                          {msg.masked_content}
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-sm text-gray-700">{msg.masked_content}</div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Tipo de Análise
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {(Object.entries(TASK_LABELS) as [AnalysisTaskType, typeof TASK_LABELS[AnalysisTaskType]][]).map(([key, value]) => (
                          <button
                            key={key}
                            onClick={() => setSelectedTask(key)}
                            className={`
                              p-3 rounded-lg border text-left transition-all
                              ${selectedTask === key
                                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                              }
                            `}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-lg">{value.icon}</span>
                              <span className="font-medium text-gray-900">{value.label}</span>
                            </div>
                            <p className="text-xs text-gray-500">{value.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Modelo de IA
                      </label>
                      <div className="relative">
                        <select
                          value={selectedModel}
                          onChange={(e) => setSelectedModel(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white"
                        >
                          {availableModels.openai && availableModels.openai.length > 0 && (
                            <optgroup label="OpenAI">
                              {availableModels.openai.map(model => (
                                <option key={model} value={model}>{model}</option>
                              ))}
                            </optgroup>
                          )}
                          {availableModels.claude && availableModels.claude.length > 0 && (
                            <optgroup label="Anthropic Claude">
                              {availableModels.claude.map(model => (
                                <option key={model} value={model}>{model}</option>
                              ))}
                            </optgroup>
                          )}
                          {!availableModels.openai?.length && !availableModels.claude?.length && (
                            <option value="gpt-4-turbo">gpt-4-turbo (padrão)</option>
                          )}
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Modelo selecionado: {getModelDisplayName(selectedModel)}
                      </p>
                    </div>

                    <button
                      onClick={handleAnalyze}
                      disabled={analyzing}
                      className={`
                        w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2
                        ${analyzing
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                        }
                      `}
                    >
                      {analyzing ? (
                        <>
                          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Analisando...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Analisar com IA
                        </>
                      )}
                    </button>

                    {analysisProgress && (
                      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-gray-900 flex items-center gap-2">
                            <svg className="w-5 h-5 text-blue-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Progresso da Análise
                          </h4>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            analysisProgress.status === 'completed' ? 'bg-green-100 text-green-800' :
                            analysisProgress.status === 'failed' ? 'bg-red-100 text-red-800' :
                            analysisProgress.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
                            analysisProgress.status === 'partial' ? 'bg-orange-100 text-orange-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {analysisProgress.status === 'completed' ? 'Concluído' :
                             analysisProgress.status === 'failed' ? 'Falhou' :
                             analysisProgress.status === 'paused' ? 'Pausado' :
                             analysisProgress.status === 'partial' ? 'Parcial' :
                             'Processando'}
                          </span>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                            <span>{analysisProgress.completed_chunks} de {analysisProgress.total_chunks} chunks</span>
                            <span>{analysisProgress.progress_percent.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div
                              className={`h-3 rounded-full transition-all duration-500 ${
                                analysisProgress.failed_chunks > 0 ? 'bg-orange-500' : 'bg-blue-500'
                              }`}
                              style={{ width: `${analysisProgress.progress_percent}%` }}
                            />
                          </div>
                        </div>

                        {analysisProgress.rate_limit_info && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <div className="flex items-center gap-2 text-yellow-800">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="font-medium">Aguardando rate limit...</span>
                            </div>
                            <p className="text-sm text-yellow-700 mt-1">
                              Retomando em {analysisProgress.rate_limit_info.remaining_seconds}s
                            </p>
                          </div>
                        )}

                        {analysisProgress.pause_reason && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <p className="text-sm text-amber-800">{analysisProgress.pause_reason}</p>
                          </div>
                        )}

                        {analysisProgress.estimated_remaining_seconds && analysisProgress.estimated_remaining_seconds > 0 && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>
                              Tempo estimado: {Math.floor(analysisProgress.estimated_remaining_seconds / 60)}m {analysisProgress.estimated_remaining_seconds % 60}s
                            </span>
                          </div>
                        )}

                        {analysisProgress.failed_chunks > 0 && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                            <div className="flex items-center gap-2 text-red-800">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              <span className="font-medium">{analysisProgress.failed_chunks} chunk(s) falharam</span>
                            </div>
                            <div className="text-xs text-red-700">
                              {analysisProgress.chunks.filter(c => c.status === 'failed').map(c => (
                                <div key={c.index} className="flex items-center gap-2">
                                  <span>Chunk {c.index + 1}:</span>
                                  <span>{c.error_code === 'RATE_LIMIT' ? 'Rate limit' : c.error_message?.slice(0, 50)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {analysisProgress.can_resume && (
                          <div className="border-t border-gray-200 pt-4 space-y-3">
                            <h5 className="font-medium text-gray-800">Retomar análise</h5>
                            <div className="flex items-center gap-3">
                              <select
                                value={resumeModel}
                                onChange={(e) => setResumeModel(e.target.value)}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              >
                                <option value="gpt-3.5-turbo">GPT-3.5 Turbo (mais rápido)</option>
                                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                                <option value="gpt-4o">GPT-4o</option>
                              </select>
                              <button
                                onClick={() => handleResumeAnalysis(analysisProgress.analysis_id)}
                                disabled={analyzing}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                              >
                                Retomar
                              </button>
                            </div>
                            <p className="text-xs text-gray-500">
                              Chunks já processados serão mantidos. Apenas chunks pendentes/falhados serão reprocessados.
                            </p>
                          </div>
                        )}

                        {(analysisProgress.status === 'completed' || analysisProgress.status === 'failed') && (
                          <button
                            onClick={stopProgressTracking}
                            className="w-full py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg"
                          >
                            Fechar progresso
                          </button>
                        )}
                      </div>
                    )}

                    {analyses.length > 0 && (
                      <div className="space-y-4">
                        <h4 className="font-medium text-gray-900">Resultados da Análise</h4>
                        {analyses.map(analysis => (
                          <div key={analysis.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-lg">
                                {TASK_LABELS[analysis.task_type as AnalysisTaskType]?.icon || '📊'}
                              </span>
                              <span className="font-medium text-gray-900">
                                {TASK_LABELS[analysis.task_type as AnalysisTaskType]?.label || analysis.task_type}
                              </span>
                              <span className={`
                                ml-auto px-2 py-0.5 rounded-full text-xs font-medium
                                ${analysis.status === 'completed' ? 'bg-green-100 text-green-800' : 
                                  analysis.status === 'failed' ? 'bg-red-100 text-red-800' : 
                                  'bg-yellow-100 text-yellow-800'}
                              `}>
                                {analysis.status === 'completed' ? 'Concluído' : 
                                 analysis.status === 'failed' ? 'Falhou' : 'Processando'}
                              </span>
                            </div>
                            {analysis.llm_response && (
                              <div className="space-y-2">
                                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                                  <MarkdownContent content={deanonymizedResponses[analysis.id] || analysis.llm_response} />
                                </div>
                                {deanonymizedResponses[analysis.id] && (
                                  <div className="flex items-center gap-2 text-xs text-green-600">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Dados originais restaurados (re-hidratados)
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="mt-2 flex items-center justify-between flex-wrap gap-2">
                              <span className="text-xs text-gray-500">
                                Modelo: {analysis.llm_model || 'N/A'} | 
                                {new Date(analysis.created_at).toLocaleString('pt-BR')}
                              </span>
                              <div className="flex items-center gap-3">
                                {!deanonymizedResponses[analysis.id] && selectedJob?.pseudonymization_mode !== 'masking' && (
                                  <button
                                    onClick={() => handleDeanonymize(analysis.id)}
                                    disabled={loadingDeanonymize === analysis.id}
                                    className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1 disabled:opacity-50"
                                  >
                                    {loadingDeanonymize === analysis.id ? (
                                      <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                      </svg>
                                    ) : (
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                      </svg>
                                    )}
                                    Re-hidratar
                                  </button>
                                )}
                                {selectedJob?.pseudonymization_mode === 'masking' && (
                                  <span className="text-xs text-gray-400 flex items-center gap-1" title="Mascaramento é irreversível">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                    Irreversível
                                  </span>
                                )}
                                {deanonymizedResponses[analysis.id] && (
                                  <button
                                    onClick={() => setDeanonymizedResponses(prev => {
                                      const newState = {...prev}
                                      delete newState[analysis.id]
                                      return newState
                                    })}
                                    className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                    Ver pseudonimizado
                                  </button>
                                )}
                                <button
                                  onClick={async () => {
                                    try {
                                      const promptData = await piiAPI.getAnalysisPrompts(analysis.id)
                                      const blob = new Blob([promptData.full_prompt_text], { type: 'text/plain;charset=utf-8' })
                                      const url = URL.createObjectURL(blob)
                                      const a = document.createElement('a')
                                      a.href = url
                                      a.download = `prompt_${analysis.task_type}_${analysis.id.slice(0, 8)}.txt`
                                      document.body.appendChild(a)
                                      a.click()
                                      document.body.removeChild(a)
                                      URL.revokeObjectURL(url)
                                    } catch (err) {
                                      console.error('Erro ao baixar prompt:', err)
                                    }
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  Ver Prompt
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <div className="mx-auto w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-1">Chat com os Dados</h3>
                  <p className="text-sm text-gray-600 max-w-md mx-auto">
                    Faça perguntas sobre a conversa pseudonimizada. O assistente tem acesso ao contexto mascarado e às análises anteriores.
                  </p>
                </div>

                {!selectedJob ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                    <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    <p className="text-gray-600 font-medium">Nenhum chat selecionado</p>
                    <p className="text-sm text-gray-500 mt-1">Vá até o histórico e selecione um chat para começar a conversar.</p>
                    <button
                      onClick={() => handleTabChange('jobs')}
                      className="mt-4 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Ver Histórico
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="font-medium">Chat:</span>
                          <span className="text-blue-600">{selectedJob.original_filename}</span>
                          <span className="text-gray-400">•</span>
                          <span>{selectedJob.masked_chat_text ? `${(selectedJob.masked_chat_text.length / 1000).toFixed(1)}k caracteres` : 'Sem dados'}</span>
                          {analyses.filter(a => a.status === 'completed').length > 0 && (
                            <>
                              <span className="text-gray-400">•</span>
                              <span className="text-green-600">{analyses.filter(a => a.status === 'completed').length} análise(s)</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500">Modelo:</label>
                          <select
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-purple-500"
                          >
                            {availableModels.openai?.map(model => (
                              <option key={model} value={model}>{model}</option>
                            ))}
                            {availableModels.claude?.map(model => (
                              <option key={model} value={model}>{model}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div 
                      ref={chatContainerRef}
                      className="h-96 overflow-y-auto border border-gray-200 rounded-lg bg-gray-50 p-4 space-y-4"
                    >
                      {chatMessages.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-gray-500">
                          <div className="text-center">
                            <svg className="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            <p className="text-sm">Faça uma pergunta para começar...</p>
                            <div className="mt-4 space-y-2 text-xs text-gray-400">
                              <p>Sugestões:</p>
                              <button 
                                onClick={() => setChatInput('Quais são os principais pontos discutidos?')}
                                className="block w-full text-left px-3 py-1.5 bg-white border border-gray-200 rounded hover:bg-gray-100 transition-colors"
                              >
                                "Quais são os principais pontos discutidos?"
                              </button>
                              <button 
                                onClick={() => setChatInput('Resuma as ações combinadas')}
                                className="block w-full text-left px-3 py-1.5 bg-white border border-gray-200 rounded hover:bg-gray-100 transition-colors"
                              >
                                "Resuma as ações combinadas"
                              </button>
                              <button 
                                onClick={() => setChatInput('Qual o tom emocional da conversa?')}
                                className="block w-full text-left px-3 py-1.5 bg-white border border-gray-200 rounded hover:bg-gray-100 transition-colors"
                              >
                                "Qual o tom emocional da conversa?"
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        chatMessages.map((msg, index) => (
                          <div
                            key={index}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                                msg.role === 'user'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white border border-gray-200 text-gray-800'
                              }`}
                            >
                              {msg.role === 'assistant' ? (
                                <MarkdownContent content={msg.content} />
                              ) : (
                                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                      {chatLoading && (
                        <div className="flex justify-start">
                          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                              </div>
                              <span className="text-sm text-gray-500">Pensando...</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSendChatMessage()
                          }
                        }}
                        placeholder="Digite sua pergunta sobre a conversa..."
                        className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        disabled={chatLoading}
                      />
                      <button
                        onClick={handleSendChatMessage}
                        disabled={chatLoading || !chatInput.trim()}
                        className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {chatLoading ? (
                          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                        )}
                        Enviar
                      </button>
                    </div>

                    {chatMessages.length > 0 && (
                      <div className="flex justify-end">
                        <button
                          onClick={() => setChatMessages([])}
                          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Limpar conversa
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Padrões de PII</h3>
                    <p className="text-sm text-gray-600">Gerencie os padrões de detecção de dados pessoais</p>
                  </div>
                  {!showAddPattern && (
                    <button
                      onClick={() => {
                        setEditingPattern(null)
                        setNewPattern({ name: '', regex: '', pii_type: 'custom', masking_strategy: 'redaction', description: '' })
                        setShowAddPattern(true)
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Novo Padrão
                    </button>
                  )}
                </div>

                {showAddPattern && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 space-y-4">
                    <h4 className="font-medium text-gray-900">
                      {editingPattern ? 'Editar Padrão' : 'Criar Novo Padrão'}
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                        <input
                          type="text"
                          value={newPattern.name}
                          onChange={(e) => setNewPattern(prev => ({ ...prev, name: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Ex: RG Brasileiro"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de PII</label>
                        <select
                          value={newPattern.pii_type}
                          onChange={(e) => setNewPattern(prev => ({ ...prev, pii_type: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          {PII_TYPES.map(type => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Expressão Regular (Regex) *</label>
                      <input
                        type="text"
                        value={newPattern.regex}
                        onChange={(e) => setNewPattern(prev => ({ ...prev, regex: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                        placeholder="Ex: \d{2}\.\d{3}\.\d{3}-[0-9Xx]"
                      />
                      {testResult !== null && (
                        <p className={`mt-1 text-xs ${testResult.valid ? 'text-green-600' : 'text-red-600'}`}>
                          {testResult.valid ? `Regex válido - ${testResult.matches.length} ocorrência(s) encontrada(s)` : 'Regex inválido'}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Estratégia de Mascaramento</label>
                      <select
                        value={newPattern.masking_strategy}
                        onChange={(e) => setNewPattern(prev => ({ ...prev, masking_strategy: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        {MASKING_STRATEGIES.map(strategy => (
                          <option key={strategy.value} value={strategy.value}>{strategy.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                      <textarea
                        value={newPattern.description}
                        onChange={(e) => setNewPattern(prev => ({ ...prev, description: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        rows={2}
                        placeholder="Descrição opcional do padrão"
                      />
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Testar Regex</label>
                      <textarea
                        value={testText}
                        onChange={(e) => setTestText(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                        rows={3}
                        placeholder="Cole um texto aqui para testar se o regex encontra correspondências..."
                      />
                      {testResult && testResult.valid && testResult.matches.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-600 mb-1">Correspondências encontradas:</p>
                          <div className="flex flex-wrap gap-1">
                            {testResult.matches.map((match, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full font-mono">
                                {match}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-3">
                      <button
                        onClick={handleCancelEdit}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={editingPattern ? handleUpdatePattern : handleCreatePattern}
                        disabled={!newPattern.name || !newPattern.regex}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                          !newPattern.name || !newPattern.regex
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {editingPattern ? 'Salvar Alterações' : 'Criar Padrão'}
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Padrões Padrão (Sistema)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {DEFAULT_PATTERNS.map(pattern => (
                      <div key={pattern.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-gray-900">{pattern.name}</span>
                          <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded-full">Sistema</span>
                        </div>
                        <p className="text-xs text-gray-500 mb-2">{pattern.description}</p>
                        <code className="block text-xs bg-gray-100 p-2 rounded text-gray-700 font-mono overflow-x-auto">
                          {pattern.regex}
                        </code>
                        <div className="mt-2 flex gap-2">
                          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                            {PII_TYPES.find(t => t.value === pattern.pii_type)?.label || pattern.pii_type}
                          </span>
                          <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-800 rounded">
                            {MASKING_STRATEGIES.find(s => s.value === pattern.masking_strategy)?.label || pattern.masking_strategy}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {loadingPatterns ? (
                  <div className="text-center py-4">
                    <svg className="animate-spin w-6 h-6 mx-auto text-blue-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                ) : patterns.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Padrões Customizados</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {patterns.map(pattern => (
                        <div key={pattern.id} className="bg-white border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-gray-900">{pattern.name}</span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleEditPattern(pattern)}
                                className="text-blue-500 hover:text-blue-700 p-1"
                                title="Editar padrão"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeletePattern(pattern.id)}
                                className="text-red-500 hover:text-red-700 p-1"
                                title="Excluir padrão"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          {pattern.description && (
                            <p className="text-xs text-gray-500 mb-2">{pattern.description}</p>
                          )}
                          <code className="block text-xs bg-gray-100 p-2 rounded text-gray-700 font-mono overflow-x-auto">
                            {pattern.regex}
                          </code>
                          <div className="mt-2 flex gap-2">
                            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                              {PII_TYPES.find(t => t.value === pattern.pii_type)?.label || pattern.pii_type}
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-800 rounded">
                              {MASKING_STRATEGIES.find(s => s.value === pattern.masking_strategy)?.label || pattern.masking_strategy}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
