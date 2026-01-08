import { useState, useEffect } from 'react'
import { adminAPI } from '../lib/apiClient'
import { useLocation } from 'wouter'
import Layout from '../components/Layout'

interface Feature {
  key: string
  name: string
  description: string
}

interface DashboardStats {
  total_organizations: number
  active_organizations: number
  total_users: number
  active_users: number
  super_admins: number
  feature_stats: Record<string, number>
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [features, setFeatures] = useState<Feature[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [, setLocation] = useLocation()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [statsData, featuresData] = await Promise.all([
        adminAPI.getDashboard(),
        adminAPI.getFeatures()
      ])
      setStats(statsData)
      setFeatures(featuresData)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar estatísticas')
    } finally {
      setLoading(false)
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

  if (error) {
    return (
      <Layout>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
          {error}
        </div>
      </Layout>
    )
  }

  const baseCards = [
    { 
      label: 'Organizações', 
      value: stats?.total_organizations || 0, 
      active: stats?.active_organizations || 0, 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
    },
    { 
      label: 'Usuários', 
      value: stats?.total_users || 0, 
      active: stats?.active_users || 0, 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
    },
    { 
      label: 'Super Admins', 
      value: stats?.super_admins || 0, 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      iconBg: 'bg-purple-50',
      iconColor: 'text-purple-600',
    },
  ]

  const featureIcons: Record<string, React.ReactNode> = {
    courseAccess: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    flowiseAccess: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  }

  const featureStyles: Record<string, { iconBg: string; iconColor: string }> = {
    courseAccess: { iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
    flowiseAccess: { iconBg: 'bg-cyan-50', iconColor: 'text-cyan-600' },
  }

  const featureCards = features.map((feature) => ({
    label: `Orgs c/ ${feature.name}`,
    value: stats?.feature_stats?.[feature.key] || 0,
    icon: featureIcons[feature.key] || (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
    iconBg: featureStyles[feature.key]?.iconBg || 'bg-gray-50',
    iconColor: featureStyles[feature.key]?.iconColor || 'text-gray-600',
  }))

  const statCards = [...baseCards, ...featureCards]

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard Admin</h1>
          <p className="text-gray-600">Visão geral da plataforma B2H4</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
          {statCards.map((card, index) => (
            <div
              key={index}
              className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 ${card.iconBg} ${card.iconColor} rounded-lg flex items-center justify-center`}>
                  {card.icon}
                </div>
                <span className="text-2xl font-bold text-gray-900">{card.value}</span>
              </div>
              <h3 className="text-sm text-gray-600 font-medium">{card.label}</h3>
              {'active' in card && typeof (card as any).active === 'number' && (
                <p className="text-xs text-gray-400 mt-1">{(card as any).active} ativos</p>
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div 
            className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md cursor-pointer transition-all"
            onClick={() => setLocation('/admin/organizations')}
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Organizações</h2>
                <p className="text-sm text-gray-500">Gerenciar organizações e features</p>
              </div>
            </div>
            <div className="flex items-center text-blue-600 text-sm font-medium">
              <span>Acessar</span>
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>

          <div 
            className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md cursor-pointer transition-all"
            onClick={() => setLocation('/admin/users')}
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-emerald-50 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Usuários</h2>
                <p className="text-sm text-gray-500">Gerenciar usuários e permissões</p>
              </div>
            </div>
            <div className="flex items-center text-emerald-600 text-sm font-medium">
              <span>Acessar</span>
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
