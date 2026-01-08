import { useState, useEffect } from 'react'
import { credentialsAPI, CredentialStatus } from '../lib/apiClient'
import Layout from '../components/Layout'

export default function AdminCredentials() {
  const [credentials, setCredentials] = useState<CredentialStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingCredential, setEditingCredential] = useState<CredentialStatus | null>(null)
  const [formValue, setFormValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')

  useEffect(() => {
    loadCredentials()
  }, [])

  const loadCredentials = async () => {
    try {
      setLoading(true)
      const data = await credentialsAPI.getStatus()
      setCredentials(data.credentials)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar credenciais')
    } finally {
      setLoading(false)
    }
  }

  const openConfigModal = (cred: CredentialStatus) => {
    setEditingKey(cred.key)
    setEditingCredential(cred)
    setFormValue('')
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingKey) return

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      await credentialsAPI.setup(editingKey, formValue)
      setShowModal(false)
      setSuccess(`${editingCredential?.name} configurado com sucesso!`)
      loadCredentials()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao salvar credencial')
    } finally {
      setSaving(false)
    }
  }

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      ai: 'Inteligência Artificial',
      email: 'Email',
      general: 'Geral'
    }
    return labels[category] || category
  }

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      ai: 'bg-purple-100 text-purple-800',
      email: 'bg-blue-100 text-blue-800',
      general: 'bg-gray-100 text-gray-800'
    }
    return colors[category] || 'bg-gray-100 text-gray-800'
  }

  const groupedCredentials = credentials.reduce((acc, cred) => {
    if (!acc[cred.category]) {
      acc[cred.category] = []
    }
    acc[cred.category].push(cred)
    return acc
  }, {} as Record<string, CredentialStatus[]>)

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Credenciais e APIs</h1>
          <p className="text-gray-600 mt-1">
            Gerencie as chaves de API e credenciais do sistema
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
            {success}
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-amber-800 font-medium">Importante</p>
              <p className="text-amber-700 text-sm mt-1">
                As credenciais são armazenadas de forma criptografada no banco de dados. 
                Para funcionalidades como geração de imagens com IA nos certificados, 
                configure o token da API correspondente.
              </p>
            </div>
          </div>
        </div>

        {Object.entries(groupedCredentials).map(([category, creds]) => (
          <div key={category} className="mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span className={`px-2 py-1 rounded-full text-xs ${getCategoryColor(category)}`}>
                {getCategoryLabel(category)}
              </span>
            </h2>

            <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
              {creds.map((cred) => (
                <div key={cred.key} className="p-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium text-gray-900">{cred.name}</h3>
                      {cred.is_configured ? (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Configurado
                          {cred.source === 'environment' && ' (ENV)'}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                          Não configurado
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{cred.description}</p>
                    <p className="text-xs text-gray-400 font-mono mt-1">{cred.key}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {cred.docs_url && (
                      <a
                        href={cred.docs_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Documentação"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                    <button
                      onClick={() => openConfigModal(cred)}
                      className="px-3 py-1.5 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
                    >
                      {cred.is_configured ? 'Atualizar' : 'Configurar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {showModal && editingCredential && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-lg w-full p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    Configurar {editingCredential.name}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {editingCredential.description}
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Chave
                  </label>
                  <input
                    type="text"
                    value={editingKey || ''}
                    disabled
                    className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-600 font-mono text-sm"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Valor / Token
                  </label>
                  <input
                    type="password"
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                    placeholder="Cole aqui o token ou chave de API"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    O valor será armazenado de forma criptografada
                  </p>
                </div>

                {editingCredential.docs_url && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      Obtenha sua chave de API em:{' '}
                      <a
                        href={editingCredential.docs_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-medium"
                      >
                        {editingCredential.docs_url}
                      </a>
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !formValue}
                    className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
