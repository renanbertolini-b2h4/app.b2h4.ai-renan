import { useState, useEffect } from 'react'
import { npsAPI, NpsStats } from '../lib/apiClient'
import Layout from '../components/Layout'

export default function NPSDashboard() {
  const [stats, setStats] = useState<NpsStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const data = await npsAPI.getStats()
      setStats(data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar estatísticas NPS')
    } finally {
      setLoading(false)
    }
  }

  const getNpsScoreColor = (score: number) => {
    if (score >= 50) return 'text-emerald-600'
    if (score >= 0) return 'text-amber-600'
    return 'text-red-600'
  }

  const getNpsScoreBg = (score: number) => {
    if (score >= 50) return 'bg-emerald-50'
    if (score >= 0) return 'bg-amber-50'
    return 'bg-red-50'
  }

  const getScoreBadgeColor = (score: number) => {
    if (score >= 9) return 'bg-emerald-100 text-emerald-700'
    if (score >= 7) return 'bg-amber-100 text-amber-700'
    return 'bg-red-100 text-red-700'
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

  const exportToCSV = () => {
    if (!stats) return

    const headers = ['Data', 'Nota', 'Feedback', 'Usuário', 'E-mail', 'Autorizado']
    const rows = stats.recent_feedbacks.map(f => [
      formatDate(f.created_at),
      f.score.toString(),
      f.feedback || '',
      f.user_name || '',
      f.user_email || '',
      f.allow_showcase ? 'Sim' : 'Não'
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `nps_feedbacks_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
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

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">NPS Analytics</h1>
            <p className="text-gray-600">Análise de satisfação dos usuários</p>
          </div>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exportar CSV
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className={`${getNpsScoreBg(stats?.nps_score || 0)} border border-gray-200 rounded-xl p-5 shadow-sm`}>
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 ${getNpsScoreBg(stats?.nps_score || 0)} rounded-lg flex items-center justify-center`}>
                <svg className={`w-5 h-5 ${getNpsScoreColor(stats?.nps_score || 0)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <span className={`text-3xl font-bold ${getNpsScoreColor(stats?.nps_score || 0)}`}>
                {stats?.nps_score || 0}
              </span>
            </div>
            <h3 className="text-sm text-gray-600 font-medium">NPS Score</h3>
            <p className="text-xs text-gray-400 mt-1">
              {(stats?.nps_score || 0) >= 50 ? 'Excelente' : (stats?.nps_score || 0) >= 0 ? 'Bom' : 'Precisa melhorar'}
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <span className="text-3xl font-bold text-gray-900">{stats?.total_responses || 0}</span>
            </div>
            <h3 className="text-sm text-gray-600 font-medium">Total de Respostas</h3>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-3xl font-bold text-emerald-600">{stats?.promoters_count || 0}</span>
            </div>
            <h3 className="text-sm text-gray-600 font-medium">Promotores (9-10)</h3>
            <p className="text-xs text-gray-400 mt-1">{stats?.promoters_percentage || 0}% do total</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="mb-3">
              <h3 className="text-sm text-gray-600 font-medium mb-2">Distribuição</h3>
              <div className="h-4 rounded-full overflow-hidden flex bg-gray-100">
                {(stats?.total_responses || 0) > 0 ? (
                  <>
                    <div 
                      className="bg-emerald-500 h-full" 
                      style={{ width: `${stats?.promoters_percentage || 0}%` }}
                      title={`Promotores: ${stats?.promoters_percentage}%`}
                    />
                    <div 
                      className="bg-amber-500 h-full" 
                      style={{ width: `${stats?.neutrals_percentage || 0}%` }}
                      title={`Neutros: ${stats?.neutrals_percentage}%`}
                    />
                    <div 
                      className="bg-red-500 h-full" 
                      style={{ width: `${stats?.detractors_percentage || 0}%` }}
                      title={`Detratores: ${stats?.detractors_percentage}%`}
                    />
                  </>
                ) : (
                  <div className="bg-gray-200 h-full w-full" />
                )}
              </div>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                {stats?.promoters_count || 0}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                {stats?.neutrals_count || 0}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                {stats?.detractors_count || 0}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Feedbacks Recentes</h2>
            <p className="text-sm text-gray-500">Últimas 20 avaliações recebidas</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nota</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Feedback</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuário</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Autorizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {stats?.recent_feedbacks && stats.recent_feedbacks.length > 0 ? (
                  stats.recent_feedbacks.map((feedback) => (
                    <tr key={feedback.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(feedback.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${getScoreBadgeColor(feedback.score)}`}>
                          {feedback.score}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-md">
                        {feedback.feedback || <span className="text-gray-400 italic">Sem comentário</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{feedback.user_name || '-'}</div>
                        <div className="text-xs text-gray-500">{feedback.user_email || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {feedback.allow_showcase ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Sim
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            Não
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      Nenhuma avaliação recebida ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  )
}
