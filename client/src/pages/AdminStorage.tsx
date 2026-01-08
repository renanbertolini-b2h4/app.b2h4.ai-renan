import { useState, useEffect } from 'react'
import { apiClient } from '../lib/apiClient'
import Layout from '../components/Layout'

interface StorageIntegrity {
  status: string
  storage_available: boolean
  storage_type: string
  total_materials: number
  valid_files: number
  missing_files_count: number
  missing_files: {
    id: string
    title: string
    media_type: string
    filename: string
  }[]
  message: string
}

interface StorageStatus {
  object_storage_available: boolean
  fallback_mode: boolean
  storage_type: string
  replit_client_initialized: boolean
  replit_client_works: boolean
  replit_upload_test_error: string | null
  gcs_bucket_initialized: boolean
  gcs_upload_test_error: string | null
  initialization_error: string | null
  last_upload_error: string | null
  replit_env_vars: Record<string, boolean>
  is_deployment: boolean
}

export default function AdminStorage() {
  const [storageData, setStorageData] = useState<StorageIntegrity | null>(null)
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastCheck, setLastCheck] = useState<Date | null>(null)

  useEffect(() => {
    checkStorage()
  }, [])

  const checkStorage = async () => {
    setLoading(true)
    setError('')
    try {
      const [integrityRes, statusRes] = await Promise.all([
        apiClient.get('/system/storage-integrity'),
        apiClient.get('/system/storage-status')
      ])
      setStorageData(integrityRes.data)
      setStorageStatus(statusRes.data)
      setLastCheck(new Date())
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao verificar integridade do armazenamento')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' }
      case 'warning':
        return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' }
      default:
        return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' }
    }
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Integridade do Armazenamento</h1>
            {lastCheck && (
              <p className="text-sm text-gray-500">
                Ultima verificacao: {lastCheck.toLocaleString('pt-BR')}
              </p>
            )}
          </div>
          
          <button
            onClick={checkStorage}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg 
              className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? 'Verificando...' : 'Verificar Novamente'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
            {error}
          </div>
        )}

        {storageData && (
          <>
            <div className={`rounded-xl border-2 p-6 mb-6 ${getStatusColor(storageData.status).bg} ${getStatusColor(storageData.status).border}`}>
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${storageData.status === 'healthy' ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                  {storageData.status === 'healthy' ? (
                    <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h2 className={`text-xl font-bold ${getStatusColor(storageData.status).text}`}>
                    {storageData.status === 'healthy' ? 'Sistema Operacional' : 'Atencao Necessaria'}
                  </h2>
                  <p className="text-gray-600">{storageData.message}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <div className="text-3xl font-bold text-gray-900">{storageData.total_materials}</div>
                <div className="text-sm text-gray-500">Total de Materiais</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <div className="text-3xl font-bold text-emerald-600">{storageData.valid_files}</div>
                <div className="text-sm text-gray-500">Arquivos Validos</div>
              </div>
              <div className={`rounded-xl border p-4 text-center ${storageData.missing_files_count > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
                <div className={`text-3xl font-bold ${storageData.missing_files_count > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {storageData.missing_files_count}
                </div>
                <div className={`text-sm ${storageData.missing_files_count > 0 ? 'text-red-500' : 'text-gray-500'}`}>Arquivos Faltando</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <div className="text-lg font-bold text-blue-600">
                  {storageData.storage_type === 'replit_object_storage' ? 'Cloud (Replit)' : 'Local'}
                </div>
                <div className="text-sm text-gray-500">Tipo de Armazenamento</div>
              </div>
            </div>

            {storageData.missing_files.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-red-50 px-6 py-4 border-b border-red-200">
                  <h3 className="font-semibold text-red-800">Arquivos Faltando ({storageData.missing_files.length})</h3>
                  <p className="text-sm text-red-600 mt-1">
                    Estes materiais precisam ser excluidos e re-enviados na producao
                  </p>
                </div>
                <div className="divide-y divide-gray-100">
                  {storageData.missing_files.map((file) => (
                    <div key={file.id} className="px-6 py-4 flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        file.media_type === 'document' ? 'bg-blue-100' : 
                        file.media_type === 'video' ? 'bg-purple-100' : 'bg-amber-100'
                      }`}>
                        {file.media_type === 'document' && (
                          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        )}
                        {file.media_type === 'video' && (
                          <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                        {file.media_type === 'photo' && (
                          <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{file.title}</p>
                        <p className="text-sm text-gray-500 truncate">{file.filename}</p>
                      </div>
                      <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded">
                        {file.id.slice(0, 8)}...
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {storageData.missing_files.length === 0 && (
              <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-6 text-center">
                <svg className="w-12 h-12 text-emerald-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="font-semibold text-emerald-800">Todos os arquivos estao integros</h3>
                <p className="text-sm text-emerald-600 mt-1">
                  Nenhum arquivo faltando no armazenamento
                </p>
              </div>
            )}

            {storageStatus && (
              <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-slate-50 px-6 py-4 border-b border-gray-200">
                  <h3 className="font-semibold text-slate-800">Diagnostico Tecnico</h3>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${storageStatus.object_storage_available ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                      <span className="text-sm text-gray-700">Object Storage Disponivel</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${!storageStatus.fallback_mode ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                      <span className="text-sm text-gray-700">
                        {storageStatus.fallback_mode ? 'Modo Fallback (Local)' : 'Modo Cloud'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${storageStatus.replit_client_initialized ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                      <span className="text-sm text-gray-700">Replit Client</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${storageStatus.gcs_bucket_initialized ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
                      <span className="text-sm text-gray-700">GCS Bucket</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${storageStatus.is_deployment ? 'bg-blue-500' : 'bg-gray-400'}`}></span>
                      <span className="text-sm text-gray-700">
                        {storageStatus.is_deployment ? 'Ambiente: Producao' : 'Ambiente: Desenvolvimento'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-700">Tipo: {storageStatus.storage_type}</span>
                    </div>
                  </div>
                  
                  {storageStatus.initialization_error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                      <p className="text-sm font-medium text-red-800">Erro de Inicializacao:</p>
                      <p className="text-sm text-red-600 font-mono mt-1">{storageStatus.initialization_error}</p>
                    </div>
                  )}
                  
                  {storageStatus.replit_upload_test_error && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                      <p className="text-sm font-medium text-amber-800">Erro Teste Replit:</p>
                      <p className="text-sm text-amber-600 font-mono mt-1">{storageStatus.replit_upload_test_error}</p>
                    </div>
                  )}
                  
                  {storageStatus.gcs_upload_test_error && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                      <p className="text-sm font-medium text-amber-800">Erro Teste GCS:</p>
                      <p className="text-sm text-amber-600 font-mono mt-1">{storageStatus.gcs_upload_test_error}</p>
                    </div>
                  )}
                  
                  {storageStatus.last_upload_error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                      <p className="text-sm font-medium text-red-800">Ultimo Erro de Upload:</p>
                      <p className="text-sm text-red-600 font-mono mt-1">{storageStatus.last_upload_error}</p>
                    </div>
                  )}
                  
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-600 mb-2">Variaveis de Ambiente Replit:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(storageStatus.replit_env_vars).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2 text-xs">
                          <span className={`w-2 h-2 rounded-full ${value ? 'bg-emerald-500' : 'bg-gray-300'}`}></span>
                          <span className="font-mono text-gray-600">{key}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
