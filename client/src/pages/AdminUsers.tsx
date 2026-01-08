import { useState, useEffect } from 'react'
import { adminAPI, FeatureDefinition } from '../lib/apiClient'
import Layout from '../components/Layout'

interface Organization {
  id: string
  name: string
  slug: string
}

interface User {
  id: string
  email: string
  full_name: string | null
  role: string
  features: Record<string, boolean>
  is_active: boolean
  is_super_admin: boolean
  created_at: string
  last_login_at: string | null
  organization: Organization | null
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [availableFeatures, setAvailableFeatures] = useState<FeatureDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [filterOrg, setFilterOrg] = useState('')
  const [formData, setFormData] = useState<{
    email: string
    password: string
    full_name: string
    organization_id: string
    role: string
    features: Record<string, boolean>
    is_super_admin: boolean
  }>({
    email: '',
    password: '',
    full_name: '',
    organization_id: '',
    role: 'member',
    features: {},
    is_super_admin: false
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [filterOrg])

  const loadData = async () => {
    try {
      const [usersData, orgsData, featuresData] = await Promise.all([
        adminAPI.listUsers(filterOrg || undefined),
        adminAPI.listOrganizations(),
        adminAPI.getFeatures()
      ])
      setUsers(usersData)
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
    setEditingUser(null)
    setFormData({
      email: '',
      password: '',
      full_name: '',
      organization_id: '',
      role: 'member',
      features: getDefaultFeatures(),
      is_super_admin: false
    })
    setShowModal(true)
  }

  const openEditModal = (user: User) => {
    setEditingUser(user)
    const features: Record<string, boolean> = {}
    availableFeatures.forEach(f => {
      features[f.key] = user.features?.[f.key] || false
    })
    setFormData({
      email: user.email,
      password: '',
      full_name: user.full_name || '',
      organization_id: user.organization?.id || '',
      role: user.role,
      features,
      is_super_admin: user.is_super_admin
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
      if (editingUser) {
        await adminAPI.updateUser(editingUser.id, {
          email: formData.email,
          password: formData.password || undefined,
          full_name: formData.full_name || undefined,
          organization_id: formData.organization_id || undefined,
          role: formData.role,
          features: formData.features,
          is_super_admin: formData.is_super_admin
        })
      } else {
        await adminAPI.createUser({
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name || undefined,
          organization_id: formData.organization_id || undefined,
          role: formData.role,
          features: formData.features,
          is_super_admin: formData.is_super_admin
        })
      }
      setShowModal(false)
      loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao salvar usuário')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (user: User) => {
    try {
      await adminAPI.updateUser(user.id, { is_active: !user.is_active })
      loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao atualizar usuário')
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
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Usuários</h1>
            <p className="text-gray-600">Gerenciar usuários e permissões</p>
          </div>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo Usuário
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 mb-6">
            {error}
          </div>
        )}

        <div className="mb-6">
          <select
            value={filterOrg}
            onChange={(e) => setFilterOrg(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">Todas as organizações</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuário</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Organização</th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
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
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="text-gray-900 font-medium flex items-center gap-2">
                            {user.full_name || user.email}
                            {user.is_super_admin && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                                Super Admin
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-gray-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {user.organization?.name || '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        user.role === 'owner' ? 'bg-purple-100 text-purple-700' :
                        user.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    {availableFeatures.map(feature => (
                      <td key={feature.key} className="px-6 py-4 text-center">
                        {user.features?.[feature.key] ? (
                          <span className="text-emerald-600">&#10003;</span>
                        ) : (
                          <span className="text-gray-300">&#10007;</span>
                        )}
                      </td>
                    ))}
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => toggleActive(user)}
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          user.is_active 
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        {user.is_active ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => openEditModal(user)}
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
                {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {editingUser ? 'Nova Senha (opcional)' : 'Senha'}
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    required={!editingUser}
                    placeholder={editingUser ? 'Deixe em branco para manter a atual' : ''}
                  />
                  {editingUser && (
                    <p className="text-xs text-gray-500 mt-1">Deixe em branco para manter a senha atual</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Organização</label>
                  <select
                    value={formData.organization_id}
                    onChange={(e) => setFormData({ ...formData, organization_id: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">Sem organização</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                    <option value="guest">Guest</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">Features do Usuário</label>
                  
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

                <div className="pt-4 border-t border-gray-200">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_super_admin}
                      onChange={(e) => setFormData({ ...formData, is_super_admin: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <span className="text-purple-700 font-medium">Super Admin</span>
                      <p className="text-xs text-gray-500">Acesso total à plataforma</p>
                    </div>
                  </label>
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
