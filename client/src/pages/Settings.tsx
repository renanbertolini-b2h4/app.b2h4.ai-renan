import { useState, useEffect } from 'react'
import { apiClient } from '../lib/apiClient'
import Layout from '../components/Layout'

function Settings() {
  const [flowiseUrl, setFlowiseUrl] = useState('')
  const [flowiseKey, setFlowiseKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const response = await apiClient.get('/config/flowwise')
      setFlowiseUrl(response.data.flowwise_url || '')
      setFlowiseKey(response.data.flowwise_key || '')
    } catch (err) {
      console.log('Nenhuma configuração encontrada')
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const response = await apiClient.post('/config/flowwise', {
        flowise_url: flowiseUrl,
        flowise_key: flowiseKey,
      })
      setSuccess(response.data.message || 'Configuração salva com sucesso!')
      setTimeout(() => setSuccess(''), 5000)
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || err.message || 'Erro ao salvar configuração'
      setError(errorMsg)
      setTimeout(() => setError(''), 5000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Configurações</h1>
          <p className="text-gray-600">Gerencie as configurações do sistema</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Configurações do Flowwise</h2>

          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">O que é Flowwise?</h3>
            <p className="text-sm text-blue-800">
              Flowwise é a plataforma de IA que realiza as análises. 
              Para utilizar o sistema de análise, você precisa configurar sua API do Flowwise.
            </p>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div>
              <label htmlFor="flowiseUrl" className="block text-sm font-medium text-gray-700 mb-2">
                URL da API Flowwise *
              </label>
              <input
                id="flowiseUrl"
                type="url"
                required
                value={flowiseUrl}
                onChange={(e) => setFlowiseUrl(e.target.value)}
                placeholder="https://cloud.flowiseai.com/api/v1/prediction/SEU-FLOW-ID"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500">
                URL completa do seu flow no Flowwise (incluindo o ID do flow)
              </p>
            </div>

            <div>
              <label htmlFor="flowiseKey" className="block text-sm font-medium text-gray-700 mb-2">
                API Key do Flowwise (opcional)
              </label>
              <input
                id="flowiseKey"
                type="password"
                value={flowiseKey}
                onChange={(e) => setFlowiseKey(e.target.value)}
                placeholder="Deixe em branco se não for necessário"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500">
                Chave de API se o seu flow estiver protegido
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-800 text-white py-3 px-4 rounded-lg hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Salvando...' : 'Salvar Configuração'}
            </button>
          </form>

          <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="font-semibold text-gray-900 mb-2">Como obter suas credenciais?</h3>
            <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
              <li>Acesse <a href="https://flowiseai.com" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">flowiseai.com</a></li>
              <li>Crie ou acesse seu flow de análise</li>
              <li>Copie a URL da API do flow</li>
              <li>Se necessário, gere uma API key nas configurações</li>
              <li>Cole as informações nos campos acima</li>
            </ol>
          </div>
        </div>
      </div>
    </Layout>
  )
}

export default Settings
