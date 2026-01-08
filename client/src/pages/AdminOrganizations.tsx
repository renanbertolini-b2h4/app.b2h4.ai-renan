import { useState, useEffect } from 'react'
import { adminAPI, FeatureDefinition } from '../lib/apiClient'
import Layout from '../components/Layout'

interface Organization {
  id: string
  name: string
  slug: string
  plan_type: string
  features: Record<string, boolean>
  is_active: boolean
  created_at: string
  user_count: number
}

export default function AdminOrganizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [availableFeatures, setAvailableFeatures] = useState<FeatureDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [formData, setFormData] = useState<{
    name: string
    slug: string
    plan_type: string
    features: Record<string, boolean>
  }>({
    name: '',
    slug: '',
    plan_type: 'free',
    features: {}
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [orgsData, featuresData] = await Promise.all([
        adminAPI.listOrganizations(),
        adminAPI.getFeatures()
      ])
      setOrganizations(orgsData)
      setAvailableFeatures(featuresData)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  const getDefaultFeatures = (): Record<string, boolean> => {
    const defaults: Record<string, boolean> = {}
    availableFeatures.forEach(f => {
      defaults[f.key] = false
    })
    return defaults
  }

  const openCreateModal = () => {
    setEditingOrg(null)
    setFormData({
      name: '',
      slug: '',
      plan_type: 'free',
      features: getDefaultFeatures()
    })
    setShowModal(true)
  }

  const openEditModal = (org: Organization) => {
    setEditingOrg(org)
    const features: Record<string, boolean> = {}
    availableFeatures.forEach(f => {
      features[f.key] = org.features?.[f.key] || false
    })
    setFormData({
      name: org.name,
      slug: org.slug,
      plan_type: org.plan_type,
      features
    })
    setShowModal(true)
  }

  const handleFeatureChange = (key: string, value: boolean) => {
    setFormData(prev => ({
      ...prev,
      features: { ...prev.features, [key]: value }
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      if (editingOrg) {
        await adminAPI.updateOrganization(editingOrg.id, {
          name: formData.name,
          plan_type: formData.plan_type,
          features: formData.features
        })
      } else {
        await adminAPI.createOrganization({
          name: formData.name,
          slug: formData.slug,
          plan_type: formData.plan_type,
          features: formData.features
        })
      }
      setShowModal(false)
      loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao salvar organização')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (org: Organization) => {
    try {
      await adminAPI.updateOrganization(org.id, { is_active: !org.is_active })
      loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao atualizar organização')
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
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Organizações</h1>
            <p className="text-gray-600">Gerenciar organizações e suas features</p>
          </div>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nova Organização
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 mb-6">
            {error}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Organização</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plano</th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Usuários</th>
                  {availableFeatures.map(feature => (
                    <th key={feature.key} className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {feature.name}
                    </th>
                  ))}
                  <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {organizations.map((org) => (
                  <tr key={org.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-gray-900 font-medium">{org.name}</p>
                        <p className="text-sm text-gray-500">{org.slug}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        org.plan_type === 'enterprise' ? 'bg-purple-100 text-purple-700' :
                        org.plan_type === 'pro' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {org.plan_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-gray-600">{org.user_count}</td>
                    {availableFeatures.map(feature => (
                      <td key={feature.key} className="px-6 py-4 text-center">
                        {org.features?.[feature.key] ? (
                          <span className="text-emerald-600">&#10003;</span>
                        ) : (
                          <span className="text-gray-300">&#10007;</span>
                        )}
                      </td>
                    ))}
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => toggleActive(org)}
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          org.is_active 
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        {org.is_active ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => openEditModal(org)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
              <h2 className="text-xl font-bold text-gray-900 mb-6">
                {editingOrg ? 'Editar Organização' : 'Nova Organização'}
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>

                {!editingOrg && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                    <input
                      type="text"
                      value={formData.slug}
                      onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plano</label>
                  <select
                    value={formData.plan_type}
                    onChange={(e) => setFormData({ ...formData, plan_type: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">Features</label>
                  
                  {availableFeatures.map(feature => (
                    <label key={feature.key} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.features[feature.key] || false}
                        onChange={(e) => handleFeatureChange(feature.key, e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-gray-700">Acesso ao {feature.name}</span>
                    </label>
                  ))}
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors disabled:opacity-50"
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
