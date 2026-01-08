import { useState, useEffect } from 'react'
import { certificatesAPI } from '../lib/apiClient'
import Layout from '../components/Layout'

interface Organization {
  id: string
  name: string
  slug: string
  has_config: boolean
}

interface InstructorInfo {
  name: string
  role: string
}

interface CertificateParams {
  prompt_style: string
  aspect_ratio: string
  certificate_title: string
  certificate_subtitle: string
  conclusion_message: string
  event_date: string
  primary_color: string
  background_color: string
  text_color: string
  instructors: InstructorInfo[]
}

interface GeneratedCertificate {
  filename: string
  url: string
  size?: number
  created_at: string
}

const DEFAULT_PROMPT_STYLE = `Corporate background for digital certificate, abstract technology theme. Central focal point: glowing AI digital brain with neural pathways and circuit patterns, positioned prominently in the center. Vibrant cyan (#00BCD4) and dark blue (#1A1F3A) gradients radiating from the central brain. Data flows and neural network connections emanating outward from the brain. Minimalist clean style, symmetrical composition, the AI brain should be the clear centerpiece surrounded by negative space for text overlay. High quality 8k render, professional business aesthetic, futuristic holographic effect on the brain element.`

const defaultParams: CertificateParams = {
  prompt_style: DEFAULT_PROMPT_STYLE,
  aspect_ratio: '16:9',
  certificate_title: 'CERTIFICADO DE CONCLUSÃO',
  certificate_subtitle: 'Conferido a',
  conclusion_message: 'Pela participação na Imersão de Transformação Digital & IA.',
  event_date: '',
  primary_color: '#00BCD4',
  background_color: '#1A1F3A',
  text_color: '#FFFFFF',
  instructors: []
}

export default function CertificateGenerator() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string>('')
  const [params, setParams] = useState<CertificateParams>(defaultParams)
  const [participantName, setParticipantName] = useState('')
  const [batchNames, setBatchNames] = useState('')
  const [useAiBackground, setUseAiBackground] = useState(true)
  const [loading, setLoading] = useState(false)
  const [loadingOrgs, setLoadingOrgs] = useState(true)
  const [loadingParams, setLoadingParams] = useState(false)
  const [savingParams, setSavingParams] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [certificates, setCertificates] = useState<GeneratedCertificate[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single')

  useEffect(() => {
    loadOrganizations()
  }, [])

  useEffect(() => {
    if (selectedOrgId) {
      loadParams()
      loadCertificates()
    }
  }, [selectedOrgId])

  const loadOrganizations = async () => {
    try {
      setLoadingOrgs(true)
      const data = await certificatesAPI.getOrganizations()
      setOrganizations(data.organizations || [])
      if (data.organizations?.length > 0) {
        setSelectedOrgId(data.organizations[0].id)
      }
    } catch (err: any) {
      console.error('Erro ao carregar organizações:', err)
      setError('Erro ao carregar organizações')
    } finally {
      setLoadingOrgs(false)
    }
  }

  const loadParams = async () => {
    if (!selectedOrgId) return
    try {
      setLoadingParams(true)
      const data = await certificatesAPI.getParams(selectedOrgId)
      setParams({
        ...defaultParams,
        ...data,
        event_date: data.event_date || '',
        instructors: data.instructors || []
      })
    } catch (err: any) {
      console.error('Erro ao carregar parâmetros:', err)
      setParams(defaultParams)
    } finally {
      setLoadingParams(false)
    }
  }

  const loadCertificates = async () => {
    if (!selectedOrgId) return
    try {
      setLoading(true)
      const data = await certificatesAPI.list(selectedOrgId)
      setCertificates(data.certificates || [])
    } catch (err: any) {
      console.error('Erro ao carregar certificados:', err)
    } finally {
      setLoading(false)
    }
  }

  const saveParams = async () => {
    if (!selectedOrgId) {
      setError('Selecione uma organização primeiro')
      return
    }
    try {
      setSavingParams(true)
      setError('')
      await certificatesAPI.updateParams(selectedOrgId, params)
      setSuccess('Configurações salvas com sucesso!')
      loadOrganizations()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao salvar configurações')
    } finally {
      setSavingParams(false)
    }
  }

  const generateSingle = async () => {
    if (!selectedOrgId) {
      setError('Selecione uma organização primeiro')
      return
    }
    if (!participantName.trim()) {
      setError('Digite o nome do participante')
      return
    }

    try {
      setGenerating(true)
      setError('')
      await certificatesAPI.generate(selectedOrgId, {
        participant_name: participantName.trim(),
        use_ai_background: useAiBackground
      })
      setSuccess('Certificado gerado com sucesso!')
      setParticipantName('')
      loadCertificates()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao gerar certificado')
    } finally {
      setGenerating(false)
    }
  }

  const generateBatch = async () => {
    if (!selectedOrgId) {
      setError('Selecione uma organização primeiro')
      return
    }
    const names = batchNames
      .split('\n')
      .map(n => n.trim())
      .filter(n => n.length > 0)

    if (names.length === 0) {
      setError('Digite ao menos um nome de participante')
      return
    }

    try {
      setGenerating(true)
      setError('')
      const result = await certificatesAPI.generateBatch(selectedOrgId, {
        participant_names: names,
        use_ai_background: useAiBackground
      })
      setSuccess(`${result.generated_count} certificado(s) gerado(s) com sucesso!`)
      setBatchNames('')
      loadCertificates()
      setTimeout(() => setSuccess(''), 5000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao gerar certificados em lote')
    } finally {
      setGenerating(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const selectedOrg = organizations.find(o => o.id === selectedOrgId)

  if (loadingOrgs) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600"></div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Gerador de Certificados</h1>
          <p className="text-gray-600">Configure e gere certificados personalizados por organização</p>
        </div>

        <div className="mb-6 bg-white border border-gray-200 rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Organização
              </label>
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Selecione uma organização...</option>
                {organizations.map(org => (
                  <option key={org.id} value={org.id}>
                    {org.name} {org.has_config ? '✓' : '(sem configuração)'}
                  </option>
                ))}
              </select>
            </div>
            {selectedOrg && (
              <div className="pt-6">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  selectedOrg.has_config 
                    ? 'bg-emerald-100 text-emerald-700' 
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {selectedOrg.has_config ? 'Configurado' : 'Não configurado'}
                </span>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-emerald-600">
            {success}
          </div>
        )}

        {!selectedOrgId ? (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-12 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Selecione uma organização</h3>
            <p className="text-gray-500">Escolha uma organização acima para configurar e gerar certificados.</p>
          </div>
        ) : loadingParams ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600"></div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Configurações do Certificado</h2>
                  <p className="text-sm text-gray-500">Personalize o visual e conteúdo para {selectedOrg?.name}</p>
                </div>
                
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Título do Certificado
                    </label>
                    <input
                      type="text"
                      value={params.certificate_title}
                      onChange={(e) => setParams({ ...params, certificate_title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Subtítulo
                    </label>
                    <input
                      type="text"
                      value={params.certificate_subtitle}
                      onChange={(e) => setParams({ ...params, certificate_subtitle: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Mensagem de Conclusão
                    </label>
                    <textarea
                      value={params.conclusion_message}
                      onChange={(e) => setParams({ ...params, conclusion_message: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data da Imersão
                    </label>
                    <input
                      type="text"
                      value={params.event_date}
                      onChange={(e) => setParams({ ...params, event_date: e.target.value })}
                      placeholder="Ex: 15 de Dezembro de 2024"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Esta data aparecerá no certificado (deixe vazio para usar data de geração)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Proporção
                    </label>
                    <select
                      value={params.aspect_ratio}
                      onChange={(e) => setParams({ ...params, aspect_ratio: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <optgroup label="Paisagem (horizontal)">
                        <option value="16:9">16:9 (1920x1080)</option>
                        <option value="16:10">16:10 (1920x1200)</option>
                        <option value="4:3">4:3 (1600x1200)</option>
                        <option value="3:2">3:2 (1800x1200)</option>
                        <option value="2:1">2:1 (2000x1000)</option>
                      </optgroup>
                      <optgroup label="Retrato (vertical)">
                        <option value="9:16">9:16 (1080x1920)</option>
                        <option value="3:4">3:4 (1200x1600)</option>
                        <option value="2:3">2:3 (1200x1800)</option>
                      </optgroup>
                      <optgroup label="Quadrado">
                        <option value="1:1">1:1 (1200x1200)</option>
                      </optgroup>
                    </select>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cor Primária
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={params.primary_color}
                          onChange={(e) => setParams({ ...params, primary_color: e.target.value })}
                          className="w-10 h-10 rounded cursor-pointer border border-gray-300"
                        />
                        <input
                          type="text"
                          value={params.primary_color}
                          onChange={(e) => setParams({ ...params, primary_color: e.target.value })}
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Fundo
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={params.background_color}
                          onChange={(e) => setParams({ ...params, background_color: e.target.value })}
                          className="w-10 h-10 rounded cursor-pointer border border-gray-300"
                        />
                        <input
                          type="text"
                          value={params.background_color}
                          onChange={(e) => setParams({ ...params, background_color: e.target.value })}
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Texto
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={params.text_color}
                          onChange={(e) => setParams({ ...params, text_color: e.target.value })}
                          className="w-10 h-10 rounded cursor-pointer border border-gray-300"
                        />
                        <input
                          type="text"
                          value={params.text_color}
                          onChange={(e) => setParams({ ...params, text_color: e.target.value })}
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Prompt para Fundo IA
                    </label>
                    <textarea
                      value={params.prompt_style}
                      onChange={(e) => setParams({ ...params, prompt_style: e.target.value })}
                      rows={3}
                      placeholder="Descreva o estilo de fundo que a IA deve gerar..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Este prompt será usado quando a opção "Usar IA no fundo" estiver ativada
                    </p>
                  </div>

                  <div className="border-t border-gray-200 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Instrutores
                      </label>
                      <button
                        type="button"
                        onClick={() => setParams({
                          ...params,
                          instructors: [...(params.instructors || []), { name: '', role: 'Instrutor' }]
                        })}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Adicionar
                      </button>
                    </div>
                    
                    {(params.instructors || []).length === 0 ? (
                      <p className="text-sm text-gray-500 italic">Nenhum instrutor adicionado</p>
                    ) : (
                      <div className="space-y-3">
                        {(params.instructors || []).map((instructor, index) => (
                          <div key={index} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                            <div className="flex-1 space-y-2">
                              <input
                                type="text"
                                value={instructor.name}
                                onChange={(e) => {
                                  const newInstructors = [...(params.instructors || [])]
                                  newInstructors[index] = { ...newInstructors[index], name: e.target.value }
                                  setParams({ ...params, instructors: newInstructors })
                                }}
                                placeholder="Nome do instrutor"
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                              <input
                                type="text"
                                value={instructor.role}
                                onChange={(e) => {
                                  const newInstructors = [...(params.instructors || [])]
                                  newInstructors[index] = { ...newInstructors[index], role: e.target.value }
                                  setParams({ ...params, instructors: newInstructors })
                                }}
                                placeholder="Cargo ou função"
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const newInstructors = (params.instructors || []).filter((_, i) => i !== index)
                                setParams({ ...params, instructors: newInstructors })
                              }}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      Os instrutores aparecerão na parte inferior do certificado com suas assinaturas
                    </p>
                  </div>

                  <button
                    onClick={saveParams}
                    disabled={savingParams}
                    className="w-full px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    {savingParams ? 'Salvando...' : 'Salvar Configurações'}
                  </button>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Gerar Certificados</h2>
                  <p className="text-sm text-gray-500">Individual ou em lote para {selectedOrg?.name}</p>
                </div>

                <div className="border-b border-gray-200">
                  <div className="flex">
                    <button
                      onClick={() => setActiveTab('single')}
                      className={`flex-1 px-4 py-3 text-sm font-medium ${
                        activeTab === 'single'
                          ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Individual
                    </button>
                    <button
                      onClick={() => setActiveTab('batch')}
                      className={`flex-1 px-4 py-3 text-sm font-medium ${
                        activeTab === 'batch'
                          ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Em Lote
                    </button>
                  </div>
                </div>
                
                <div className="p-6 space-y-4">
                  {activeTab === 'single' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nome do Participante
                      </label>
                      <input
                        type="text"
                        value={participantName}
                        onChange={(e) => setParticipantName(e.target.value)}
                        placeholder="Digite o nome completo..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nomes dos Participantes (um por linha)
                      </label>
                      <textarea
                        value={batchNames}
                        onChange={(e) => setBatchNames(e.target.value)}
                        rows={6}
                        placeholder="João Silva&#10;Maria Santos&#10;Pedro Oliveira..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        {batchNames.split('\n').filter(n => n.trim()).length} nome(s) detectado(s)
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                    <input
                      type="checkbox"
                      id="useAi"
                      checked={useAiBackground}
                      onChange={(e) => setUseAiBackground(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="useAi" className="flex-1">
                      <span className="block text-sm font-medium text-gray-900">
                        Usar IA para gerar fundo
                      </span>
                      <span className="block text-xs text-gray-500">
                        Gera um fundo único usando Inteligência Artificial (mais lento)
                      </span>
                    </label>
                  </div>

                  <button
                    onClick={activeTab === 'single' ? generateSingle : generateBatch}
                    disabled={generating}
                    className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {generating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Gerando...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Gerar Certificado{activeTab === 'batch' ? 's' : ''}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Certificados Gerados</h2>
                  <p className="text-sm text-gray-500">{certificates.length} certificado(s) para {selectedOrg?.name}</p>
                </div>
                <button
                  onClick={loadCertificates}
                  disabled={loading}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1"
                >
                  <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Atualizar
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Participante</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data de Geração</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Arquivo</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {certificates.length > 0 ? (
                      certificates.map((cert, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-medium text-gray-900">{cert.filename.replace(/^cert_org_[^_]+_/, '').replace(/_[^_]+\.png$/, '').replace(/_/g, ' ')}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {formatDate(cert.created_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {cert.filename}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <a
                              href={cert.url}
                              download
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              Download
                            </a>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                          Nenhum certificado gerado ainda para esta organização.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
