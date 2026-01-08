import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import AccessDenied from '../components/AccessDenied'
import { gammaAPI, GammaGenerateRequest } from '../lib/apiClient'

interface Theme {
  id: string
  name: string
  preview?: string
}

interface GeneratedContent {
  id?: string
  url?: string
  title?: string
  mode?: string
  created_at?: string
  saved_id?: string
  material_id?: string
}

const DEFAULT_THEMES = [
  { id: 'modern', name: 'Moderno', icon: '🎨', color: 'from-blue-500 to-indigo-600' },
  { id: 'professional', name: 'Profissional', icon: '💼', color: 'from-slate-600 to-slate-800' },
  { id: 'minimal', name: 'Minimalista', icon: '✨', color: 'from-gray-100 to-gray-300' },
  { id: 'creative', name: 'Criativo', icon: '🌈', color: 'from-pink-500 to-purple-600' },
  { id: 'academic', name: 'Acadêmico', icon: '📚', color: 'from-emerald-500 to-teal-600' },
  { id: 'bold', name: 'Ousado', icon: '🔥', color: 'from-orange-500 to-red-600' },
]

const PROMPT_EXAMPLES = [
  { icon: '🧠', text: 'A psicologia dos gastos e como economizar' },
  { icon: '🐠', text: 'Palestra sobre ecologia de recifes de coral' },
  { icon: '🍣', text: 'Como fazer sushi, um guia para iniciantes' },
  { icon: '💰', text: 'Evolução do dinheiro: Das conchas às criptomoedas' },
  { icon: '☕', text: 'Como preparar o café expresso perfeito' },
  { icon: '🚀', text: 'Transformação digital para executivos C-Level' },
  { icon: '🤖', text: 'Inteligência Artificial no dia a dia da empresa' },
  { icon: '📊', text: 'Análise de dados para tomada de decisão' },
]

const TEXT_AMOUNT_OPTIONS = [
  { id: 'minimal', label: 'Só vibes', icon: '📊', description: 'Visual com pouco texto' },
  { id: 'short', label: 'Texto mínimo', icon: '📝', description: 'Pontos principais apenas' },
  { id: 'medium', label: 'Com contexto', icon: '📄', description: 'Explicações moderadas' },
  { id: 'detailed', label: 'Muito texto', icon: '📚', description: 'Conteúdo detalhado' },
]

const FORMAT_OPTIONS = [
  { id: 'presentation', label: 'Apresentação', icon: '📊', description: 'Slides para reuniões' },
  { id: 'document', label: 'Documento', icon: '📄', description: 'Relatórios e textos' },
  { id: 'webpage', label: 'Página Web', icon: '🌐', description: 'Landing pages' },
  { id: 'social', label: 'Social', icon: '📱', description: 'Posts e carrosséis' },
]

export default function Gamma() {
  const { features, isSuperAdmin } = useAuth()
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'disconnected' | 'not_configured'>('checking')
  const [themes, setThemes] = useState<Theme[]>([])
  const [generating, setGenerating] = useState(false)
  const [sendingToMaterials, setSendingToMaterials] = useState(false)
  const [exportingImages, setExportingImages] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null)
  const [recentPresentations, setRecentPresentations] = useState<GeneratedContent[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [textAmount, setTextAmount] = useState('medium')

  const [showEmbedViewer, setShowEmbedViewer] = useState(false)
  const [viewingPresentation, setViewingPresentation] = useState<GeneratedContent | null>(null)
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)

  const [formData, setFormData] = useState<GammaGenerateRequest>({
    prompt: '',
    mode: 'presentation',
    language: 'pt-BR',
    theme: '',
    generate_images: true,
    num_slides: 10,
    tone: 'professional',
    audience: 'general',
    advanced: {
      creativity_level: 0.7,
      include_speaker_notes: true,
      include_references: false,
      visual_style: 'modern',
      layout_preference: 'balanced'
    }
  })

  useEffect(() => {
    checkApiStatus()
    loadRecentPresentations()
  }, [])

  const checkApiStatus = async () => {
    try {
      const result = await gammaAPI.health()
      if (result.api_configured) {
        setApiStatus('connected')
        loadThemes()
      } else {
        setApiStatus('not_configured')
      }
    } catch (err: unknown) {
      const error = err as { response?: { status?: number } }
      if (error.response?.status === 503) {
        setApiStatus('not_configured')
      } else {
        setApiStatus('connected')
      }
    }
  }

  const loadThemes = async () => {
    try {
      const result = await gammaAPI.getThemes()
      if (result.themes && result.themes.length > 0) {
        setThemes(result.themes)
      }
    } catch {
      console.log('Usando temas padrão')
    }
  }

  const loadRecentPresentations = () => {
    const saved = localStorage.getItem('gamma_recent')
    if (saved) {
      try {
        setRecentPresentations(JSON.parse(saved).slice(0, 5))
      } catch {
        console.log('Erro ao carregar histórico')
      }
    }
  }

  const saveToRecent = (content: GeneratedContent) => {
    const updated = [content, ...recentPresentations.filter(p => p.id !== content.id)].slice(0, 10)
    setRecentPresentations(updated)
    localStorage.setItem('gamma_recent', JSON.stringify(updated))
  }

  const handleGenerate = async () => {
    if (!formData.prompt.trim()) {
      setError('Digite uma descrição para a apresentação')
      return
    }

    setGenerating(true)
    setError('')
    setSuccess('')
    setGeneratedContent(null)

    try {
      const result = await gammaAPI.generate({
        ...formData,
        save_to_library: true
      })
      
      if (result.success && result.data) {
        const content: GeneratedContent = {
          id: result.data.id,
          url: result.data.url || result.data.edit_url,
          title: result.data.title || formData.prompt.slice(0, 50),
          mode: formData.mode,
          created_at: result.generated_at,
          saved_id: result.data.saved_generation?.id
        }
        setGeneratedContent(content)
        saveToRecent(content)
        setSuccess('Apresentação gerada com sucesso!')
      } else {
        setError('Erro ao gerar apresentação')
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } }; message?: string }
      setError(error.response?.data?.detail || error.message || 'Erro ao gerar apresentação')
    } finally {
      setGenerating(false)
    }
  }

  const handleSendToMaterials = async () => {
    if (!generatedContent?.saved_id) {
      setError('Geração não foi salva na biblioteca')
      return
    }

    setSendingToMaterials(true)
    setError('')

    try {
      const result = await gammaAPI.sendToMaterials(generatedContent.saved_id, {
        title: generatedContent.title,
        collection: 'gamma',
        copy_permissions: true
      })

      if (result.success) {
        setGeneratedContent({
          ...generatedContent,
          material_id: result.material_id
        })
        setSuccess(result.already_exists 
          ? 'Este conteúdo já está nos Materiais!' 
          : 'Enviado para Materiais com sucesso!')
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } }; message?: string }
      setError(error.response?.data?.detail || error.message || 'Erro ao enviar para Materiais')
    } finally {
      setSendingToMaterials(false)
    }
  }

  const handleExportImages = async () => {
    if (!generatedContent?.saved_id) {
      setError('Geração não foi salva na biblioteca')
      return
    }

    setExportingImages(true)
    setError('')

    try {
      const result = await gammaAPI.exportImages(generatedContent.saved_id, true)

      if (result.success) {
        if (result.url) {
          window.open(result.url, '_blank')
        }
        setSuccess('Imagens exportadas com sucesso!')
        setShowExportModal(false)
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } }; message?: string }
      setError(error.response?.data?.detail || error.message || 'Erro ao exportar imagens')
    } finally {
      setExportingImages(false)
    }
  }

  const handleExampleClick = (text: string) => {
    setFormData({ ...formData, prompt: text })
  }

  const adjustSlides = (delta: number) => {
    const newValue = Math.max(3, Math.min(50, (formData.num_slides || 10) + delta))
    setFormData({ ...formData, num_slides: newValue })
  }

  const handleViewPresentation = (presentation: GeneratedContent) => {
    setViewingPresentation(presentation)
    setShowEmbedViewer(true)
    setActiveDropdown(null)
  }

  const getEmbedUrl = (url: string) => {
    if (url.includes('/embed/')) return url
    const match = url.match(/gamma\.app\/(docs|slides|pages)\/([^/?]+)/)
    if (match) {
      return `https://gamma.app/embed/${match[2]}`
    }
    return url.replace(/\/edit\/?/, '/embed/')
  }

  if (!features.gammaAccess && !isSuperAdmin) {
    return (
      <Layout>
        <AccessDenied feature="gamma" />
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span className="text-3xl">🎨</span> Gamma AI
            </h1>
            <p className="text-gray-600 mt-1">
              O que você gostaria de criar hoje?
            </p>
          </div>
          
          <div className="flex items-center gap-3 px-4 py-2 bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              apiStatus === 'connected' ? 'bg-emerald-100' :
              apiStatus === 'checking' ? 'bg-yellow-100' :
              'bg-red-100'
            }`}>
              <svg className={`w-4 h-4 ${
                apiStatus === 'connected' ? 'text-emerald-600' :
                apiStatus === 'checking' ? 'text-yellow-600' :
                'text-red-600'
              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Gamma AI</p>
              <p className={`text-xs ${
                apiStatus === 'connected' ? 'text-emerald-600' :
                apiStatus === 'checking' ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {apiStatus === 'connected' ? 'Operacional' :
                 apiStatus === 'checking' ? 'Verificando...' :
                 apiStatus === 'not_configured' ? 'Não configurado' :
                 'Indisponível'}
              </p>
            </div>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-red-800 font-medium">Erro</p>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
            <button onClick={() => setError('')} className="ml-auto text-red-600 hover:text-red-800">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-green-800">{success}</p>
            <button onClick={() => setSuccess('')} className="ml-auto text-green-600 hover:text-green-800">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {apiStatus === 'not_configured' && (
          <div className="mb-6 p-6 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-amber-800">Configuração necessária</h3>
                <p className="text-amber-700 mt-1">
                  Para usar o Gamma AI, é necessário configurar a API Key do Gamma.
                </p>
                <p className="text-amber-700 mt-2 text-sm">
                  Vá em <strong>Administração → Credenciais</strong> e configure a chave <strong>Gamma API</strong>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Format Selection */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Tipo de Conteúdo</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {FORMAT_OPTIONS.map((format) => (
                  <button
                    key={format.id}
                    onClick={() => setFormData({ ...formData, mode: format.id as 'presentation' | 'document' | 'webpage' })}
                    disabled={apiStatus !== 'connected'}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${
                      formData.mode === format.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    } ${apiStatus !== 'connected' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className="text-2xl block mb-2">{format.icon}</span>
                    <span className="font-medium text-gray-900 block">{format.label}</span>
                    <span className="text-xs text-gray-500">{format.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Controls Row */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex flex-wrap gap-4 items-center justify-between">
                {/* Slides Counter */}
                <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-2">
                  <button
                    onClick={() => adjustSlides(-1)}
                    disabled={apiStatus !== 'connected' || (formData.num_slides || 10) <= 3}
                    className="w-8 h-8 rounded-full bg-white border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                  >
                    −
                  </button>
                  <span className="text-sm font-medium text-gray-700 min-w-[80px] text-center">
                    {formData.num_slides || 10} cartões
                  </span>
                  <button
                    onClick={() => adjustSlides(1)}
                    disabled={apiStatus !== 'connected' || (formData.num_slides || 10) >= 50}
                    className="w-8 h-8 rounded-full bg-white border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                  >
                    +
                  </button>
                </div>

                {/* Language */}
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-4 py-2">
                  <span className="text-lg">🇧🇷</span>
                  <select
                    value={formData.language}
                    onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                    className="bg-transparent border-none text-sm font-medium text-gray-700 focus:ring-0"
                    disabled={apiStatus !== 'connected'}
                  >
                    <option value="pt-BR">Português (Brasil)</option>
                    <option value="en">English</option>
                    <option value="es">Español</option>
                  </select>
                </div>

                {/* Generate Images Toggle */}
                <label className="flex items-center gap-2 bg-gray-50 rounded-lg px-4 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.generate_images}
                    onChange={(e) => setFormData({ ...formData, generate_images: e.target.checked })}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    disabled={apiStatus !== 'connected'}
                  />
                  <span className="text-sm font-medium text-gray-700">Gerar imagens com IA</span>
                </label>
              </div>
            </div>

            {/* Main Input */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <label className="block text-lg font-semibold text-gray-900 mb-3">
                Descreva o que você quer criar
              </label>
              <textarea
                value={formData.prompt}
                onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                placeholder="Ex: Crie uma apresentação sobre transformação digital para executivos C-Level, destacando cases de sucesso e ROI..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none text-base"
                rows={4}
                disabled={apiStatus !== 'connected'}
              />

              {/* Text Amount Options */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Quantidade de texto</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {TEXT_AMOUNT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setTextAmount(option.id)}
                      disabled={apiStatus !== 'connected'}
                      className={`p-3 rounded-lg border text-center transition-all ${
                        textAmount === option.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:border-gray-300'
                      } ${apiStatus !== 'connected' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span className="text-xl block mb-1">{option.icon}</span>
                      <span className="text-sm font-medium text-gray-900 block">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Theme Selection */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Tema Visual</h2>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {(themes.length > 0 ? themes.map(t => ({ ...t, icon: '🎨', color: 'from-gray-400 to-gray-600' })) : DEFAULT_THEMES).map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => setFormData({ ...formData, theme: theme.id })}
                    disabled={apiStatus !== 'connected'}
                    className={`p-3 rounded-xl border-2 text-center transition-all group ${
                      formData.theme === theme.id
                        ? 'border-indigo-500 ring-2 ring-indigo-200'
                        : 'border-gray-200 hover:border-gray-300'
                    } ${apiStatus !== 'connected' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className={`w-full h-12 rounded-lg bg-gradient-to-br ${theme.color} mb-2 flex items-center justify-center`}>
                      <span className="text-white text-xl">{theme.icon}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900 block truncate">{theme.name}</span>
                    {formData.theme === theme.id && (
                      <span className="text-indigo-600 text-xs">✓ Selecionado</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced Options */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50"
              >
                <span className="font-medium text-gray-900">Configurações Avançadas</span>
                <svg className={`w-5 h-5 text-gray-500 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showAdvanced && (
                <div className="p-6 pt-0 border-t border-gray-100 space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tom</label>
                      <select
                        value={formData.tone}
                        onChange={(e) => setFormData({ ...formData, tone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        disabled={apiStatus !== 'connected'}
                      >
                        <option value="professional">Profissional</option>
                        <option value="casual">Casual</option>
                        <option value="academic">Acadêmico</option>
                        <option value="creative">Criativo</option>
                        <option value="formal">Formal</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Público-alvo</label>
                      <select
                        value={formData.audience}
                        onChange={(e) => setFormData({ ...formData, audience: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        disabled={apiStatus !== 'connected'}
                      >
                        <option value="general">Geral</option>
                        <option value="executive">Executivos</option>
                        <option value="technical">Técnico</option>
                        <option value="educational">Educacional</option>
                        <option value="investors">Investidores</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Criatividade</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={formData.advanced?.creativity_level || 0.7}
                          onChange={(e) => setFormData({
                            ...formData,
                            advanced: { ...formData.advanced, creativity_level: parseFloat(e.target.value) }
                          })}
                          className="flex-1"
                          disabled={apiStatus !== 'connected'}
                        />
                        <span className="text-sm text-gray-600 w-8">{Math.round((formData.advanced?.creativity_level || 0.7) * 100)}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 pt-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.advanced?.include_speaker_notes}
                        onChange={(e) => setFormData({
                          ...formData,
                          advanced: { ...formData.advanced, include_speaker_notes: e.target.checked }
                        })}
                        className="rounded border-gray-300 text-indigo-600"
                        disabled={apiStatus !== 'connected'}
                      />
                      Notas do apresentador
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.advanced?.include_references}
                        onChange={(e) => setFormData({
                          ...formData,
                          advanced: { ...formData.advanced, include_references: e.target.checked }
                        })}
                        className="rounded border-gray-300 text-indigo-600"
                        disabled={apiStatus !== 'connected'}
                      />
                      Incluir referências
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={generating || apiStatus !== 'connected' || !formData.prompt.trim()}
              className="w-full py-4 px-6 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3 text-lg"
            >
              {generating ? (
                <>
                  <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Gerando com IA...
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Gerar Apresentação
                </>
              )}
            </button>
          </div>

          {/* Right Column - Results and Examples */}
          <div className="space-y-6">
            {/* Generated Content with Embedded Viewer */}
            {generatedContent && (
              <div className="bg-white rounded-xl border-2 border-green-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-green-50 border-b border-green-200 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-green-800 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {generatedContent.title || 'Apresentação Gerada!'}
                  </h2>
                  <div className="flex items-center gap-2">
                    {generatedContent.url && (
                      <a
                        href={generatedContent.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Abrir no Gamma"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>

                {/* Embedded Presentation Viewer */}
                {generatedContent.url && (
                  <div className="relative bg-gray-100">
                    <iframe
                      src={getEmbedUrl(generatedContent.url)}
                      className="w-full h-[450px] border-0"
                      allow="fullscreen"
                      title={generatedContent.title || 'Apresentação Gamma'}
                    />
                  </div>
                )}

                <div className="p-4 border-t border-gray-100">
                  <div className="flex flex-wrap gap-2">
                    {generatedContent.saved_id && (
                      <button
                        onClick={() => setShowExportModal(true)}
                        className="flex-1 py-2 px-4 bg-purple-600 text-white text-center text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Exportar
                      </button>
                    )}

                    {generatedContent.saved_id && !generatedContent.material_id && (
                      <button
                        onClick={handleSendToMaterials}
                        disabled={sendingToMaterials}
                        className="flex-1 py-2 px-4 bg-emerald-600 text-white text-center text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:bg-emerald-400 transition-colors flex items-center justify-center gap-2"
                      >
                        {sendingToMaterials ? (
                          <>
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Enviando...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Salvar nos Materiais
                          </>
                        )}
                      </button>
                    )}

                    {generatedContent.material_id && (
                      <div className="flex-1 py-2 px-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-center text-sm font-medium rounded-lg flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Salvo nos Materiais
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Prompt Examples */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Exemplos de prompts</h2>
                <p className="text-gray-500 text-sm">Clique para usar</p>
              </div>
              <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
                {PROMPT_EXAMPLES.map((example, index) => (
                  <button
                    key={index}
                    onClick={() => handleExampleClick(example.text)}
                    disabled={apiStatus !== 'connected'}
                    className="w-full p-3 bg-gray-50 hover:bg-indigo-50 rounded-lg text-left transition-colors flex items-start gap-3 group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="text-xl">{example.icon}</span>
                    <span className="text-sm text-gray-700 group-hover:text-indigo-700 flex-1">{example.text}</span>
                    <span className="text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">+</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Presentations */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Apresentações Recentes
                </h2>
              </div>

              <div className="p-4">
                {recentPresentations.length === 0 ? (
                  <div className="text-center py-8">
                    <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                    </svg>
                    <p className="text-gray-500">Nenhuma apresentação ainda</p>
                    <p className="text-gray-400 text-sm mt-1">
                      Suas apresentações geradas aparecerão aqui
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentPresentations.map((presentation, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group relative"
                      >
                        <button
                          onClick={() => handleViewPresentation(presentation)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <span className="text-lg">
                              {presentation.mode === 'presentation' ? '📊' :
                               presentation.mode === 'document' ? '📄' :
                               presentation.mode === 'webpage' ? '🌐' : '📱'}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate group-hover:text-indigo-600">
                              {presentation.title || 'Sem título'}
                            </p>
                            <p className="text-xs text-gray-500 capitalize">{presentation.mode}</p>
                          </div>
                        </button>

                        {/* Action Menu */}
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setActiveDropdown(activeDropdown === presentation.id ? null : presentation.id || null)
                            }}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                            </svg>
                          </button>

                          {/* Dropdown Menu */}
                          {activeDropdown === presentation.id && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                              <button
                                onClick={() => handleViewPresentation(presentation)}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                Visualizar aqui
                              </button>

                              <a
                                href={presentation.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => setActiveDropdown(null)}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Exportar (PDF/PPTX)
                              </a>

                              <a
                                href={presentation.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => setActiveDropdown(null)}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                                Abrir no Gamma
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Exportar Apresentação</h3>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-gray-500 text-sm mt-1">Escolha o formato de exportação</p>
            </div>

            <div className="p-6 space-y-3">
              <a
                href={generatedContent?.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-4 group"
              >
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 group-hover:text-indigo-600">PDF</p>
                  <p className="text-sm text-gray-500">Exportar via Gamma (abre editor)</p>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>

              <button
                onClick={handleExportImages}
                disabled={exportingImages}
                className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-4 group disabled:opacity-50"
              >
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  {exportingImages ? (
                    <svg className="animate-spin h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-gray-900 group-hover:text-purple-600">
                    {exportingImages ? 'Exportando...' : 'Imagens (PNG)'}
                  </p>
                  <p className="text-sm text-gray-500">Exportar slides como imagens</p>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>

              <a
                href={generatedContent?.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-4 group"
              >
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 group-hover:text-orange-600">PowerPoint</p>
                  <p className="text-sm text-gray-500">Exportar via Gamma (abre editor)</p>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-500 text-center">
                PDF e PowerPoint abrem o editor do Gamma para exportação
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Presentation Viewer Modal */}
      {showEmbedViewer && viewingPresentation && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] mx-4 overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <span className="text-lg">
                    {viewingPresentation.mode === 'presentation' ? '📊' :
                     viewingPresentation.mode === 'document' ? '📄' :
                     viewingPresentation.mode === 'webpage' ? '🌐' : '📱'}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {viewingPresentation.title || 'Apresentação'}
                  </h3>
                  <p className="text-xs text-gray-500 capitalize">{viewingPresentation.mode}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={viewingPresentation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 text-sm bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Exportar (PDF/PPTX)
                </a>
                <a
                  href={viewingPresentation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 text-sm bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Abrir no Gamma
                </a>
                <button
                  onClick={() => {
                    setShowEmbedViewer(false)
                    setViewingPresentation(null)
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Embedded Viewer */}
            <div className="flex-1 bg-gray-100">
              <iframe
                src={getEmbedUrl(viewingPresentation.url || '')}
                className="w-full h-full border-0"
                allow="fullscreen"
                title={viewingPresentation.title || 'Apresentação Gamma'}
              />
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
