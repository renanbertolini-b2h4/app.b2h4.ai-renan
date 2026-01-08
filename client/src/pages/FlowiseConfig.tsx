import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { orgCredentialsAPI, OrgCredential } from '../lib/apiClient'
import Layout from '../components/Layout'
import AccessDenied from '../components/AccessDenied'

export default function FlowiseConfig() {
  const { user, features } = useAuth()
  const [credentials, setCredentials] = useState<OrgCredential[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const isAdmin = user?.role === 'admin' || user?.is_super_admin

  useEffect(() => {
    if (isAdmin && features.flowiseAccess) {
      loadCredentials()
    } else {
      setLoading(false)
    }
  }, [isAdmin, features.flowiseAccess])

  const loadCredentials = async () => {
    try {
      const data = await orgCredentialsAPI.list()
      setCredentials(data)
    } catch (error) {
      console.error('Erro ao carregar credenciais:', error)
      setMessage({ type: 'error', text: 'Erro ao carregar configurações' })
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (key: string) => {
    setEditingKey(key)
    setEditValue('')
    setMessage(null)
  }

  const handleCancel = () => {
    setEditingKey(null)
    setEditValue('')
  }

  const handleSave = async (key: string) => {
    if (!editValue.trim()) {
      setMessage({ type: 'error', text: 'Digite um valor' })
      return
    }

    setSaving(key)
    setMessage(null)

    try {
      await orgCredentialsAPI.update(key, editValue.trim())
      await loadCredentials()
      setEditingKey(null)
      setEditValue('')
      setMessage({ type: 'success', text: 'Configuração salva com sucesso!' })
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || 'Erro ao salvar configuração'
      setMessage({ type: 'error', text: errorMsg })
    } finally {
      setSaving(null)
    }
  }

  const handleDelete = async (key: string) => {
    if (!confirm('Tem certeza que deseja remover esta configuração?')) {
      return
    }

    setSaving(key)
    setMessage(null)

    try {
      await orgCredentialsAPI.delete(key)
      await loadCredentials()
      setMessage({ type: 'success', text: 'Configuração removida com sucesso!' })
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || 'Erro ao remover configuração'
      setMessage({ type: 'error', text: errorMsg })
    } finally {
      setSaving(null)
    }
  }

  if (!isAdmin) {
    return (
      <Layout>
        <AccessDenied feature="admin" />
      </Layout>
    )
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
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Configurar Flowise
          </h1>
          <p className="text-gray-600">
            Configure as credenciais do Flowise para sua organização
          </p>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg border ${
            message.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {credentials.map((cred) => (
              <div
                key={cred.key}
                className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">{cred.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{cred.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {cred.is_configured ? (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">
                        Configurado
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                        Pendente
                      </span>
                    )}
                  </div>
                </div>

                {editingKey === cred.key ? (
                  <div className="space-y-3">
                    <input
                      type={cred.key.includes('KEY') || cred.key.includes('TOKEN') ? 'password' : 'text'}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder={cred.key.includes('URL') ? 'https://...' : 'Digite o valor...'}
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSave(cred.key)}
                        disabled={saving === cred.key}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white font-medium rounded-lg transition-colors text-sm"
                      >
                        {saving === cred.key ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button
                        onClick={handleCancel}
                        disabled={saving === cred.key}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors text-sm"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-mono text-gray-600">
                      {cred.is_configured ? cred.masked_value : 'Não configurado'}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(cred.key)}
                        className="px-3 py-1.5 text-sm font-medium text-teal-600 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
                      >
                        {cred.is_configured ? 'Editar' : 'Configurar'}
                      </button>
                      {cred.is_configured && (
                        <button
                          onClick={() => handleDelete(cred.key)}
                          disabled={saving === cred.key}
                          className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {cred.updated_at && (
                  <div className="mt-3 text-xs text-gray-400">
                    Atualizado em: {new Date(cred.updated_at).toLocaleString('pt-BR')}
                  </div>
                )}
              </div>
            ))}

            {credentials.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                Nenhuma configuração disponível
              </div>
            )}
          </div>
        )}

        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <h4 className="font-medium text-blue-900 mb-2">Como configurar o Flowise</h4>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Acesse o painel do Flowise da sua organização</li>
            <li>Copie a URL base (ex: https://flowise.suaempresa.com)</li>
            <li>Gere uma API Key nas configurações do Flowise</li>
            <li>Configure ambos os valores acima</li>
          </ol>
        </div>
      </div>
    </Layout>
  )
}
