import { useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';

interface ServiceHealth {
  status: string;
  message: string;
  url?: string;
  workers?: string[];
  error?: string;
}

interface HealthStatus {
  status: string;
  async_processing_available: boolean;
  analysis_available: boolean;
  services: {
    redis: ServiceHealth;
    celery: ServiceHealth;
    flowwise: ServiceHealth;
  };
  message: string;
}

export default function ServiceStatus() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkHealth = async () => {
    try {
      const response = await apiClient.get('/health');
      setHealth(response.data);
    } catch (error) {
      console.error('Erro ao verificar status dos serviços:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'unhealthy':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'not_configured':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
        <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        <span>Verificando serviços...</span>
      </div>
    );
  }

  if (!health) {
    return null;
  }

  const showWarning = !health.analysis_available || !health.async_processing_available;

  return (
    <div className="mb-4">
      {showWarning && (
        <div className={`border rounded-lg p-4 ${getStatusColor(health.status)}`}>
          <div className="flex items-start gap-3">
            <StatusIcon status={health.status} size="lg" />
            <div className="flex-1">
              <p className="font-medium">{health.message}</p>
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-sm underline mt-1 hover:no-underline"
              >
                {expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
              </button>
            </div>
          </div>

          {expanded && (
            <div className="mt-4 space-y-2 border-t pt-3">
              <ServiceItem
                name="Redis (Fila de mensagens)"
                health={health.services.redis}
              />
              <ServiceItem
                name="Celery (Processamento assíncrono)"
                health={health.services.celery}
              />
              <ServiceItem
                name="Flowwise (Análise de IA)"
                health={health.services.flowwise}
              />
            </div>
          )}
        </div>
      )}

      {!showWarning && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
          <StatusIcon status="healthy" size="sm" />
          <span>{health.message}</span>
        </div>
      )}
    </div>
  );
}

function ServiceItem({ name, health }: { name: string; health: ServiceHealth }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <StatusIcon status={health.status} size="sm" />
      <div className="flex-1">
        <p className="font-medium">{name}</p>
        <p className="text-xs opacity-75">{health.message}</p>
        {health.error && (
          <p className="text-xs mt-1 opacity-60">Erro: {health.error}</p>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status, size = 'sm' }: { status: string; size?: 'sm' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';
  
  switch (status) {
    case 'healthy':
      return (
        <svg className={`${sizeClass} text-green-600`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'unhealthy':
      return (
        <svg className={`${sizeClass} text-red-600`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'not_configured':
      return (
        <svg className={`${sizeClass} text-yellow-600`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      );
    default:
      return (
        <svg className={`${sizeClass} text-gray-600`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
  }
}
