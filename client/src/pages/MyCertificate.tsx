import { useState, useEffect } from 'react'
import { certificatesAPI } from '../lib/apiClient'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'

interface CertificateConfig {
  certificate_title: string
  certificate_subtitle: string
  conclusion_message: string
  organization_name: string
}

interface GeneratedCertificate {
  filename: string
  url: string
  size: number
  created_at: string
}

export default function MyCertificate() {
  const { user } = useAuth()
  const [config, setConfig] = useState<CertificateConfig | null>(null)
  const [certificates, setCertificates] = useState<GeneratedCertificate[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [useAiBackground, setUseAiBackground] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [noConfig, setNoConfig] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setNoConfig(false)
      
      const [configData, certsData] = await Promise.all([
        certificatesAPI.getMyConfig().catch(() => null),
        certificatesAPI.listMy().catch(() => ({ certificates: [] }))
      ])
      
      if (configData) {
        setConfig(configData)
      } else {
        setNoConfig(true)
      }
      
      setCertificates(certsData.certificates || [])
    } catch (err: any) {
      console.error('Erro ao carregar dados:', err)
      if (err.response?.status === 404) {
        setNoConfig(true)
      } else {
        setError('Erro ao carregar informações do certificado')
      }
    } finally {
      setLoading(false)
    }
  }

  const generateCertificate = async () => {
    try {
      setGenerating(true)
      setError('')
      await certificatesAPI.generateMy(useAiBackground)
      setSuccess('Seu certificado foi gerado com sucesso!')
      loadData()
      setTimeout(() => setSuccess(''), 5000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao gerar certificado')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async (filename: string) => {
    try {
      setDownloading(filename)
      setError('')
      await certificatesAPI.downloadCertificate(filename)
    } catch (err: any) {
      setError('Erro ao baixar certificado. Tente novamente.')
      console.error('Erro no download:', err)
    } finally {
      setDownloading(null)
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

  if (loading) {
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
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Meu Certificado</h1>
          <p className="text-gray-600">Gere e baixe seu certificado de conclusão</p>
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

        {noConfig ? (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-12 text-center">
            <svg className="w-16 h-16 mx-auto text-amber-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Certificado não disponível</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              O certificado ainda não foi configurado para sua organização. 
              Por favor, entre em contato com o administrador.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Informações do Certificado</h2>
                  <p className="text-sm text-gray-500">{config?.organization_name}</p>
                </div>
                
                <div className="p-6 space-y-4">
                  <div className="p-6 rounded-lg border-2 bg-gradient-to-br from-slate-800 to-slate-900 border-teal-500">
                    <h3 className="text-xl font-bold text-center mb-2 text-teal-400">
                      {config?.certificate_title}
                    </h3>
                    <p className="text-center text-sm mb-4 text-gray-300">
                      {config?.certificate_subtitle}
                    </p>
                    <div className="text-center">
                      <p className="text-lg font-semibold mb-2 text-white">
                        {user?.full_name || user?.email}
                      </p>
                      <p className="text-sm text-gray-300">
                        {config?.conclusion_message}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Gerar Certificado</h2>
                  <p className="text-sm text-gray-500">Clique para gerar seu certificado personalizado</p>
                </div>
                
                <div className="p-6 space-y-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{user?.full_name || 'Seu Nome'}</p>
                        <p className="text-xs text-gray-500">{user?.email}</p>
                      </div>
                    </div>
                  </div>

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
                    onClick={generateCertificate}
                    disabled={generating}
                    className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {generating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Gerando certificado...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                        </svg>
                        <span>Gerar Meu Certificado</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {certificates.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Meus Certificados</h2>
                  <p className="text-sm text-gray-500">{certificates.length} certificado(s) gerado(s)</p>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data de Geração</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Arquivo</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {certificates.map((cert, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {formatDate(cert.created_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {cert.filename}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <button
                              onClick={() => handleDownload(cert.filename)}
                              disabled={downloading === cert.filename}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                            >
                              {downloading === cert.filename ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                  Baixando...
                                </>
                              ) : (
                                <>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                  Download
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
