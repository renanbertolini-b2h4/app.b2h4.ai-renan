import { useState, useEffect } from 'react'
import { apiClient } from '../lib/apiClient'
import Layout from '../components/Layout'

interface ServiceHealth {
  status: string
  message: string
  url?: string
  response_code?: number
  workers?: string[]
  error?: string
}

interface HealthStatus {
  status: string
  async_processing_available: boolean
  analysis_available: boolean
  services: {
    redis: ServiceHealth
    celery: ServiceHealth
    flowwise: ServiceHealth
  }
  message: string
}

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

function getStatusColor(status: string) {
  switch (status) {
    case 'healthy':
      return {
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        text: 'text-emerald-800',
        badge: 'bg-emerald-100 text-emerald-800',
        icon: 'text-emerald-600'
      }
    case 'unhealthy':
      return {
        bg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-800',
        badge: 'bg-red-100 text-red-800',
        icon: 'text-red-600'
      }
    case 'not_configured':
      return {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        text: 'text-amber-800',
        badge: 'bg-amber-100 text-amber-800',
        icon: 'text-amber-600'
      }
    default:
      return {
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        text: 'text-gray-800',
        badge: 'bg-gray-100 text-gray-800',
        icon: 'text-gray-600'
      }
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'healthy':
      return 'Operacional'
    case 'unhealthy':
      return 'Indisponível'
    case 'not_configured':
      return 'Não Configurado'
    default:
      return 'Desconhecido'
  }
}

export default function HealthCheck() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [storageIntegrity, setStorageIntegrity] = useState<StorageIntegrity | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastCheck, setLastCheck] = useState<Date | null>(null)

  useEffect(() => {
    checkHealth()
  }, [])

  const checkHealth = async () => {
    setLoading(true)
    try {
      const healthResponse = await apiClient.get('/health')
      setHealth(healthResponse.data)
      setLastCheck(new Date())
    } catch (error) {
      console.error('Erro ao verificar status dos serviços:', error)
      setHealth(null)
    }
    
    try {
      const storageResponse = await apiClient.get('/system/storage-integrity')
      setStorageIntegrity(storageResponse.data)
    } catch (error) {
      console.error('Erro ao verificar integridade do armazenamento:', error)
      setStorageIntegrity(null)
    }
    
    setLoading(false)
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Status dos Serviços</h1>
            {lastCheck && (
              <p className="text-sm text-gray-500">
                Última verificação: {lastCheck.toLocaleString('pt-BR')}
              </p>
            )}
          </div>
          
          <button
            onClick={checkHealth}
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
            {loading ? 'Atualizando...' : 'Atualizar Status'}
          </button>
        </div>

        {health && (
          <div className={`rounded-xl border-2 p-6 mb-8 ${getStatusColor(health.status).bg} ${getStatusColor(health.status).border}`}>
            <div className="flex items-center gap-4">
              <StatusIcon status={health.status} size="xl" />
              <div className="flex-1">
                <h2 className={`text-xl font-bold ${getStatusColor(health.status).text}`}>
                  {health.message}
                </h2>
                <div className="flex gap-4 mt-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Processamento Assíncrono:</span>
                    <StatusBadge 
                      status={health.async_processing_available ? 'healthy' : 'unhealthy'}
                      label={health.async_processing_available ? 'Disponível' : 'Indisponível'}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Análise:</span>
                    <StatusBadge 
                      status={health.analysis_available ? 'healthy' : 'unhealthy'}
                      label={health.analysis_available ? 'Disponível' : 'Indisponível'}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {health?.services.redis && (
            <ServiceCard
              title="Redis"
              description="Fila de mensagens para processamento assíncrono"
              health={health.services.redis}
              icon={
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              }
            />
          )}

          {health?.services.celery && (
            <ServiceCard
              title="Celery"
              description="Workers para processar análises"
              health={health.services.celery}
              icon={
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              }
            />
          )}

          {health?.services.flowwise && (
            <ServiceCard
              title="Flowwise AI"
              description="Análise com IA"
              health={health.services.flowwise}
              icon={
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              }
            />
          )}
        </div>

        {storageIntegrity && (
          <div className="mt-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Armazenamento de Arquivos</h2>
            <div className={`bg-white rounded-xl border-2 p-6 ${
              storageIntegrity.status === 'healthy' ? 'border-emerald-200' : 'border-amber-200'
            }`}>
              <div className="flex items-start gap-4">
                <div className={storageIntegrity.status === 'healthy' ? 'text-emerald-600' : 'text-amber-600'}>
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold text-gray-900">Object Storage</h3>
                    <StatusBadge 
                      status={storageIntegrity.status} 
                      label={storageIntegrity.status === 'healthy' ? 'Operacional' : 'Atenção'} 
                    />
                  </div>
                  <p className="text-sm text-gray-600 mb-4">Armazenamento de arquivos de mídia (documentos, fotos, vídeos)</p>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-gray-50 p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold text-gray-900">{storageIntegrity.total_materials}</div>
                      <div className="text-xs text-gray-500">Total</div>
                    </div>
                    <div className="bg-emerald-50 p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold text-emerald-700">{storageIntegrity.valid_files}</div>
                      <div className="text-xs text-emerald-600">OK</div>
                    </div>
                    <div className={`p-3 rounded-lg text-center ${storageIntegrity.missing_files_count > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                      <div className={`text-2xl font-bold ${storageIntegrity.missing_files_count > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        {storageIntegrity.missing_files_count}
                      </div>
                      <div className={`text-xs ${storageIntegrity.missing_files_count > 0 ? 'text-red-600' : 'text-emerald-600'}`}>Faltando</div>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-lg text-center">
                      <div className="text-sm font-bold text-blue-700">{storageIntegrity.storage_type === 'replit_object_storage' ? 'Cloud' : 'Local'}</div>
                      <div className="text-xs text-blue-600">Tipo</div>
                    </div>
                  </div>

                  <div className={`text-sm p-3 rounded-lg ${
                    storageIntegrity.status === 'healthy' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                  }`}>
                    <p className="font-medium">{storageIntegrity.message}</p>
                  </div>

                  {storageIntegrity.missing_files.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-red-700 mb-2">Arquivos faltando:</p>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {storageIntegrity.missing_files.map((file, idx) => (
                          <div key={idx} className="text-xs bg-red-50 text-red-700 p-2 rounded">
                            {file.title} ({file.media_type})
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {loading && !health && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-teal-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Verificando serviços...</p>
          </div>
        )}

        {!loading && !health && (
          <div className="text-center py-12 bg-red-50 rounded-xl border border-red-200">
            <svg className="w-16 h-16 text-red-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="mt-4 text-red-800 font-medium">Erro ao verificar status dos serviços</p>
            <button
              onClick={checkHealth}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Tentar Novamente
            </button>
          </div>
        )}
      </div>
    </Layout>
  )
}

function ServiceCard({ 
  title, 
  description, 
  health, 
  icon 
}: { 
  title: string 
  description: string 
  health: ServiceHealth 
  icon: React.ReactNode
}) {
  const colors = getStatusColor(health.status)
  
  return (
    <div className={`bg-white rounded-xl border-2 ${colors.border} p-6 transition-all hover:shadow-md`}>
      <div className="flex items-start gap-4">
        <div className={colors.icon}>
          {icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            <StatusBadge 
              status={health.status} 
              label={getStatusLabel(health.status)} 
            />
          </div>
          <p className="text-sm text-gray-600 mb-4">{description}</p>
          
          <div className={`text-sm p-3 rounded-lg ${colors.bg} ${colors.text}`}>
            <p className="font-medium">{health.message}</p>
          </div>

          <div className="mt-4 space-y-2 text-sm text-gray-600">
            {health.url && (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <span className="font-mono text-xs truncate">{health.url}</span>
              </div>
            )}
            
            {health.response_code && (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Código HTTP: {health.response_code}</span>
              </div>
            )}
            
            {health.workers && health.workers.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span className="font-medium">{health.workers.length} worker(s) ativo(s)</span>
                </div>
                <div className="ml-6 space-y-1">
                  {health.workers.map((worker, idx) => (
                    <div key={idx} className="text-xs font-mono text-gray-500">
                      {worker}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {health.error && (
              <div className="flex items-start gap-2 text-red-600">
                <svg className="w-4 h-4 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-xs">{health.error}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const colors = getStatusColor(status)
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colors.badge}`}>
      <span className={`w-2 h-2 rounded-full ${
        status === 'healthy' ? 'bg-emerald-600' :
        status === 'unhealthy' ? 'bg-red-600' :
        status === 'not_configured' ? 'bg-amber-600' :
        'bg-gray-600'
      }`} />
      {label}
    </span>
  )
}

function StatusIcon({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const sizeClass = 
    size === 'xl' ? 'w-12 h-12' :
    size === 'lg' ? 'w-8 h-8' :
    size === 'md' ? 'w-6 h-6' :
    'w-4 h-4'
  
  const colors = getStatusColor(status)
  
  switch (status) {
    case 'healthy':
      return (
        <svg className={`${sizeClass} ${colors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    case 'unhealthy':
      return (
        <svg className={`${sizeClass} ${colors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    case 'not_configured':
      return (
        <svg className={`${sizeClass} ${colors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      )
    default:
      return (
        <svg className={`${sizeClass} ${colors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
  }
}
