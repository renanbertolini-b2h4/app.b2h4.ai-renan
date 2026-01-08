import { useState, useEffect } from 'react'
import { apiClient } from '../lib/apiClient'

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

interface HealthCheckPanelProps {
  isOpen: boolean
  onClose: () => void
}

function getStatusColor(status: string) {
  switch (status) {
    case 'healthy':
      return {
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        text: 'text-emerald-700',
        dot: 'bg-emerald-500'
      }
    case 'unhealthy':
      return {
        bg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-700',
        dot: 'bg-red-500'
      }
    case 'not_configured':
      return {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        text: 'text-amber-700',
        dot: 'bg-amber-500'
      }
    default:
      return {
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        text: 'text-gray-700',
        dot: 'bg-gray-500'
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

export default function HealthCheckPanel({ isOpen, onClose }: HealthCheckPanelProps) {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastCheck, setLastCheck] = useState<Date | null>(null)

  useEffect(() => {
    if (isOpen) {
      checkHealth()
    }
  }, [isOpen])

  const checkHealth = async () => {
    setLoading(true)
    try {
      const response = await apiClient.get('/health')
      setHealth(response.data)
      setLastCheck(new Date())
    } catch (error) {
      console.error('Erro ao verificar status dos serviços:', error)
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      
      <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-300">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Status dos Serviços</h2>
              {lastCheck && (
                <p className="text-xs text-gray-500">
                  Atualizado: {lastCheck.toLocaleTimeString('pt-BR')}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={checkHealth}
              disabled={loading}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Atualizar"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && !health ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            </div>
          ) : health ? (
            <>
              <div className={`rounded-xl p-4 ${getStatusColor(health.status).bg} ${getStatusColor(health.status).border} border`}>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(health.status).dot}`}></div>
                  <div>
                    <p className={`font-semibold ${getStatusColor(health.status).text}`}>
                      {health.message}
                    </p>
                    <div className="flex gap-4 mt-1 text-xs">
                      <span className={health.async_processing_available ? 'text-emerald-600' : 'text-red-600'}>
                        Async: {health.async_processing_available ? 'OK' : 'Erro'}
                      </span>
                      <span className={health.analysis_available ? 'text-emerald-600' : 'text-red-600'}>
                        Análise: {health.analysis_available ? 'OK' : 'Erro'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <ServiceItem
                name="Redis"
                description="Fila de mensagens"
                health={health.services.redis}
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                  </svg>
                }
              />

              <ServiceItem
                name="Celery"
                description="Workers de processamento"
                health={health.services.celery}
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                }
              />

              <ServiceItem
                name="Flowwise AI"
                description="Análise com IA"
                health={health.services.flowwise}
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                }
              />
            </>
          ) : (
            <div className="text-center py-8">
              <svg className="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-600 mb-4">Erro ao verificar serviços</p>
              <button
                onClick={checkHealth}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-900 transition-colors"
              >
                Tentar Novamente
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function ServiceItem({ name, description, health, icon }: { 
  name: string
  description: string
  health: ServiceHealth
  icon: React.ReactNode 
}) {
  const colors = getStatusColor(health.status)
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`rounded-xl border ${colors.border} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full p-4 flex items-center gap-3 ${colors.bg} hover:opacity-90 transition-opacity`}
      >
        <div className={colors.text}>{icon}</div>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{name}</span>
            <span className={`px-2 py-0.5 text-xs rounded-full ${colors.bg} ${colors.text} border ${colors.border}`}>
              {getStatusLabel(health.status)}
            </span>
          </div>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {expanded && (
        <div className="p-4 bg-white border-t border-gray-100 text-sm space-y-2">
          <p className="text-gray-600">{health.message}</p>
          
          {health.workers && health.workers.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Workers ativos:</p>
              {health.workers.map((worker, idx) => (
                <p key={idx} className="text-xs text-gray-400 font-mono">{worker}</p>
              ))}
            </div>
          )}
          
          {health.error && (
            <p className="text-xs text-red-600">{health.error}</p>
          )}
        </div>
      )}
    </div>
  )
}
