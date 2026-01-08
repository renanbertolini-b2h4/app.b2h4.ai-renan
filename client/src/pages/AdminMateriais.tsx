import { useState, useEffect, useRef } from 'react'
import { materiaisAPI, adminAPI, FeatureDefinition } from '../lib/apiClient'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'

interface Material {
  id: string
  title: string
  description: string | null
  icon: string
  file: string
  size: string
  type: string
  sort_order: number
  is_active: boolean
  media_type?: string
  collection?: string
}

interface MaterialDetail {
  id: string
  title: string
  description: string | null
  icon: string
  file_type: string
  file_path: string | null
  content: string | null
  file_size: string | null
  sort_order: number
  is_active: boolean
  allowed_organizations?: { id: string; name: string }[]
  allowed_users?: { id: string; email: string; name: string }[]
  has_restrictions?: boolean
}

interface OrgOption {
  id: string
  name: string
  slug: string
  features?: Record<string, boolean>
}

interface UserOption {
  id: string
  email: string
  name: string | null
  organization_id: string | null
  role?: string
  features?: Record<string, boolean>
}

interface BulkPreview {
  operation: string
  target_type: string
  materials_count: number
  materials: { id: string; title: string }[]
  targets_count: number
  targets: { id: string; name: string; email?: string }[]
  has_more_targets: boolean
}

interface IntegrityResult {
  storage_available: boolean
  storage_type: string
  total_materials: number
  valid_files_count: number
  missing_files_count: number
  missing_files: {
    id: string
    title: string
    media_type: string
    file_path: string
    filename: string
    storage_key: string
  }[]
  message: string
}

const ICON_OPTIONS = ['📄', '📅', '📚', '💼', '🚀', '📝', '📊', '🎯', '💡', '⚡', '🔧', '📖']

export default function AdminMateriais() {
  const { features } = useAuth()
  const [materiais, setMateriais] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create-md' | 'create-upload' | 'edit'>('create-md')
  const [editingMaterial, setEditingMaterial] = useState<MaterialDetail | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [showAccessModal, setShowAccessModal] = useState(false)
  const [accessMaterial, setAccessMaterial] = useState<MaterialDetail | null>(null)
  const [allOrgs, setAllOrgs] = useState<OrgOption[]>([])
  const [allUsers, setAllUsers] = useState<UserOption[]>([])
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [savingAccess, setSavingAccess] = useState(false)
  const [materialsWithRestrictions, setMaterialsWithRestrictions] = useState<Set<string>>(new Set())

  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([])
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkOperation, setBulkOperation] = useState<'add' | 'remove' | 'replace'>('add')
  const [bulkTargetType, setBulkTargetType] = useState<'organizations' | 'users'>('organizations')
  const [bulkSelectionMode, setBulkSelectionMode] = useState<'manual' | 'filter'>('manual')
  const [bulkSelectedTargetIds, setBulkSelectedTargetIds] = useState<string[]>([])
  const [bulkFilterOrgIds, setBulkFilterOrgIds] = useState<string[]>([])
  const [bulkFilterRoles, setBulkFilterRoles] = useState<string[]>([])
  const [bulkFilterFeature, setBulkFilterFeature] = useState('')
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [savingBulk, setSavingBulk] = useState(false)
  const [availableFeatures, setAvailableFeatures] = useState<FeatureDefinition[]>([])

  const [showIntegrityModal, setShowIntegrityModal] = useState(false)
  const [integrityResult, setIntegrityResult] = useState<IntegrityResult | null>(null)
  const [loadingIntegrity, setLoadingIntegrity] = useState(false)

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    icon: '📄',
    content: '',
    sort_order: 0,
    media_type: 'document' as 'document' | 'photo' | 'video',
    collection: 'course'
  })

  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null)
  const thumbnailInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (features.courseManagement) {
      loadMateriais()
      loadOrgsAndUsers()
      loadFeatures()
    } else {
      setLoading(false)
    }
  }, [features.courseManagement])

  const loadMateriais = async () => {
    try {
      const data = await materiaisAPI.adminListar()
      setMateriais(data)
      
      const restrictionSet = new Set<string>()
      for (const m of data) {
        try {
          const detail = await materiaisAPI.adminObter(m.id)
          if (detail.has_restrictions) {
            restrictionSet.add(m.id)
          }
        } catch {
        }
      }
      setMaterialsWithRestrictions(restrictionSet)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar materiais')
    } finally {
      setLoading(false)
    }
  }

  const loadOrgsAndUsers = async () => {
    try {
      const [orgs, users] = await Promise.all([
        materiaisAPI.adminListOrganizations(),
        materiaisAPI.adminListUsers({ limit: 200 })
      ])
      setAllOrgs(orgs)
      setAllUsers(users)
    } catch (err) {
      console.error('Erro ao carregar organizações/usuários', err)
    }
  }

  const loadFeatures = async () => {
    try {
      const featuresData = await adminAPI.getFeatures()
      setAvailableFeatures(featuresData)
    } catch (err) {
      console.error('Erro ao carregar features', err)
    }
  }

  const checkIntegrity = async () => {
    setLoadingIntegrity(true)
    setIntegrityResult(null)
    try {
      const result = await materiaisAPI.checkIntegrity()
      setIntegrityResult(result)
      setShowIntegrityModal(true)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao verificar integridade')
    } finally {
      setLoadingIntegrity(false)
    }
  }

  const toggleMaterialSelection = (id: string) => {
    setSelectedMaterialIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const toggleAllMaterials = () => {
    if (selectedMaterialIds.length === materiais.length) {
      setSelectedMaterialIds([])
    } else {
      setSelectedMaterialIds(materiais.map(m => m.id))
    }
  }

  const openBulkModal = () => {
    setBulkOperation('add')
    setBulkTargetType('organizations')
    setBulkSelectionMode('manual')
    setBulkSelectedTargetIds([])
    setBulkFilterOrgIds([])
    setBulkFilterRoles([])
    setBulkFilterFeature('')
    setBulkPreview(null)
    setShowBulkModal(true)
  }

  const loadBulkPreview = async () => {
    setLoadingPreview(true)
    try {
      const requestData: any = {
        material_ids: selectedMaterialIds,
        operation: bulkOperation,
        target_type: bulkTargetType,
      }
      
      if (bulkSelectionMode === 'manual') {
        requestData.target_ids = bulkSelectedTargetIds
      } else {
        requestData.filter = {
          organization_ids: bulkFilterOrgIds.length > 0 ? bulkFilterOrgIds : undefined,
          roles: bulkFilterRoles.length > 0 ? bulkFilterRoles : undefined,
          has_feature: bulkFilterFeature || undefined,
        }
      }
      
      const preview = await materiaisAPI.adminBulkAccessPreview(requestData)
      setBulkPreview(preview)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao gerar preview')
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleBulkSubmit = async () => {
    setSavingBulk(true)
    setError('')
    try {
      const requestData: any = {
        material_ids: selectedMaterialIds,
        operation: bulkOperation,
        target_type: bulkTargetType,
      }
      
      if (bulkSelectionMode === 'manual') {
        requestData.target_ids = bulkSelectedTargetIds
      } else {
        requestData.filter = {
          organization_ids: bulkFilterOrgIds.length > 0 ? bulkFilterOrgIds : undefined,
          roles: bulkFilterRoles.length > 0 ? bulkFilterRoles : undefined,
          has_feature: bulkFilterFeature || undefined,
        }
      }
      
      await materiaisAPI.adminBulkAccess(requestData)
      setShowBulkModal(false)
      setSelectedMaterialIds([])
      loadMateriais()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao aplicar permissões em massa')
    } finally {
      setSavingBulk(false)
    }
  }

  const toggleBulkTarget = (id: string) => {
    setBulkSelectedTargetIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const toggleBulkFilterOrg = (id: string) => {
    setBulkFilterOrgIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const toggleBulkFilterRole = (role: string) => {
    setBulkFilterRoles(prev =>
      prev.includes(role) ? prev.filter(x => x !== role) : [...prev, role]
    )
  }

  const openCreateMdModal = () => {
    setEditingMaterial(null)
    setModalMode('create-md')
    setFormData({
      title: '',
      description: '',
      icon: '📄',
      content: '',
      sort_order: materiais.length,
      media_type: 'document',
      collection: 'course'
    })
    setShowModal(true)
  }

  const openUploadModal = () => {
    setEditingMaterial(null)
    setModalMode('create-upload')
    setFormData({
      title: '',
      description: '',
      icon: '📄',
      content: '',
      sort_order: materiais.length,
      media_type: 'document',
      collection: 'course'
    })
    setUploadFile(null)
    setThumbnailFile(null)
    setShowModal(true)
  }

  const openEditModal = async (material: Material) => {
    try {
      const detail = await materiaisAPI.adminObter(material.id)
      setEditingMaterial(detail)
      setModalMode('edit')
      setFormData({
        title: detail.title,
        description: detail.description || '',
        icon: detail.icon || '📄',
        content: detail.content || '',
        sort_order: detail.sort_order || 0,
        media_type: (material.media_type as 'document' | 'photo' | 'video') || 'document',
        collection: material.collection || 'course'
      })
      setShowModal(true)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar material')
    }
  }

  const openAccessModal = async (material: Material) => {
    try {
      const detail = await materiaisAPI.adminObter(material.id)
      setAccessMaterial(detail)
      setSelectedOrgIds(detail.allowed_organizations?.map((o: any) => o.id) || [])
      setSelectedUserIds(detail.allowed_users?.map((u: any) => u.id) || [])
      setUserSearch('')
      setShowAccessModal(true)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar permissões')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      if (modalMode === 'create-upload') {
        if (!uploadFile) {
          setError('Selecione um arquivo')
          setSaving(false)
          return
        }
        const formDataUpload = new FormData()
        formDataUpload.append('title', formData.title)
        formDataUpload.append('description', formData.description)
        formDataUpload.append('icon', formData.icon)
        formDataUpload.append('sort_order', formData.sort_order.toString())
        formDataUpload.append('media_type', formData.media_type)
        formDataUpload.append('collection', formData.collection)
        formDataUpload.append('file', uploadFile)
        if (thumbnailFile) {
          formDataUpload.append('thumbnail', thumbnailFile)
        }
        await materiaisAPI.adminUpload(formDataUpload)
      } else if (modalMode === 'create-md') {
        await materiaisAPI.adminCriar({
          title: formData.title,
          description: formData.description || undefined,
          icon: formData.icon,
          file_type: 'md',
          content: formData.content,
          sort_order: formData.sort_order
        })
      } else if (editingMaterial) {
        await materiaisAPI.adminAtualizar(editingMaterial.id, {
          title: formData.title,
          description: formData.description || undefined,
          icon: formData.icon,
          content: formData.content || undefined,
          sort_order: formData.sort_order
        })
      }

      setShowModal(false)
      loadMateriais()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao salvar material')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAccess = async () => {
    if (!accessMaterial) return
    setSavingAccess(true)
    setError('')

    try {
      await materiaisAPI.adminUpdateAccess(accessMaterial.id, {
        organization_ids: selectedOrgIds,
        user_ids: selectedUserIds
      })
      setShowAccessModal(false)
      loadMateriais()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao salvar permissões')
    } finally {
      setSavingAccess(false)
    }
  }

  const toggleActive = async (material: Material) => {
    try {
      await materiaisAPI.adminAtualizar(material.id, {
        is_active: !material.is_active
      })
      loadMateriais()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao atualizar material')
    }
  }

  const handleDelete = async (material: Material) => {
    if (!confirm(`Tem certeza que deseja excluir "${material.title}"?`)) return

    try {
      await materiaisAPI.adminExcluir(material.id)
      loadMateriais()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao excluir material')
    }
  }

  const toggleOrg = (orgId: string) => {
    setSelectedOrgIds(prev => 
      prev.includes(orgId) 
        ? prev.filter(id => id !== orgId)
        : [...prev, orgId]
    )
  }

  const toggleUser = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const filteredUsers = userSearch
    ? allUsers.filter(u => 
        u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.name && u.name.toLowerCase().includes(userSearch.toLowerCase()))
      )
    : allUsers

  if (!features.courseManagement) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-64">
          <p className="text-gray-600">Você não tem permissão para gerenciar materiais.</p>
        </div>
      </Layout>
    )
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
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Materiais do Curso</h1>
            <p className="text-gray-600">Gerenciar materiais e arquivos do curso</p>
          </div>
          <div className="flex gap-2">
            {selectedMaterialIds.length > 0 && (
              <button
                onClick={openBulkModal}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Permissões em Massa ({selectedMaterialIds.length})
              </button>
            )}
            <button
              onClick={openCreateMdModal}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Novo Markdown
            </button>
            <button
              onClick={openUploadModal}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload Arquivo
            </button>
            <button
              onClick={checkIntegrity}
              disabled={loadingIntegrity}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              {loadingIntegrity ? 'Verificando...' : 'Verificar Arquivos'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 mb-6">
            {error}
            <button onClick={() => setError('')} className="ml-4 text-red-800 hover:underline">Fechar</button>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                    <input
                      type="checkbox"
                      checked={selectedMaterialIds.length === materiais.length && materiais.length > 0}
                      onChange={toggleAllMaterials}
                      className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                    />
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ord</th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Material</th>
                  <th className="px-4 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                  <th className="px-4 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Acesso</th>
                  <th className="px-4 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {materiais.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      Nenhum material cadastrado. Clique em "Novo Markdown" ou "Upload Arquivo" para adicionar.
                    </td>
                  </tr>
                ) : (
                  materiais.map((material) => (
                    <tr key={material.id} className={`hover:bg-gray-50 ${selectedMaterialIds.includes(material.id) ? 'bg-amber-50' : ''}`}>
                      <td className="px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedMaterialIds.includes(material.id)}
                          onChange={() => toggleMaterialSelection(material.id)}
                          className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                        />
                      </td>
                      <td className="px-4 py-4 text-gray-600 text-sm">
                        {material.sort_order}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{material.icon}</span>
                          <div>
                            <p className="text-gray-900 font-medium">{material.title}</p>
                            {material.description && (
                              <p className="text-sm text-gray-500 truncate max-w-xs">{material.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            material.media_type === 'photo' ? 'bg-purple-100 text-purple-700' :
                            material.media_type === 'video' ? 'bg-pink-100 text-pink-700' :
                            material.type === 'md' ? 'bg-blue-100 text-blue-700' :
                            material.type === 'pdf' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {material.media_type === 'photo' ? 'Foto' :
                             material.media_type === 'video' ? 'Vídeo' :
                             material.type.toUpperCase()}
                          </span>
                          {material.collection && material.collection !== 'course' && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-100 text-teal-700">
                              {material.collection === 'event' ? 'Evento' : material.collection}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        {materialsWithRestrictions.has(material.id) ? (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">
                            Restrito
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700">
                            Todos
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={() => toggleActive(material)}
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            material.is_active
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-red-100 text-red-700 hover:bg-red-200'
                          }`}
                        >
                          {material.is_active ? 'Ativo' : 'Inativo'}
                        </button>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => openAccessModal(material)}
                            className="text-amber-600 hover:text-amber-800 text-sm font-medium"
                            title="Gerenciar permissões"
                          >
                            Permissões
                          </button>
                          <button
                            onClick={() => openEditModal(material)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDelete(material)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
              <h2 className="text-xl font-bold text-gray-900 mb-6">
                {modalMode === 'create-md' ? 'Novo Material Markdown' :
                 modalMode === 'create-upload' ? 'Upload de Arquivo' :
                 'Editar Material'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ícone</label>
                    <div className="flex flex-wrap gap-2">
                      {ICON_OPTIONS.map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          onClick={() => setFormData({ ...formData, icon })}
                          className={`w-10 h-10 rounded-lg border-2 text-xl flex items-center justify-center transition-colors ${
                            formData.icon === icon
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ordem</label>
                    <input
                      type="number"
                      value={formData.sort_order}
                      onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      min="0"
                    />
                  </div>
                </div>

                {modalMode === 'create-upload' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Mídia</label>
                        <select
                          value={formData.media_type}
                          onChange={(e) => {
                            const newType = e.target.value as 'document' | 'photo' | 'video'
                            setFormData({ 
                              ...formData, 
                              media_type: newType,
                              icon: newType === 'photo' ? '📷' : newType === 'video' ? '🎬' : '📄'
                            })
                            setUploadFile(null)
                            setThumbnailFile(null)
                            if (fileInputRef.current) fileInputRef.current.value = ''
                          }}
                          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                        >
                          <option value="document">Documento</option>
                          <option value="photo">Foto</option>
                          <option value="video">Vídeo</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Coleção</label>
                        <select
                          value={formData.collection}
                          onChange={(e) => setFormData({ ...formData, collection: e.target.value })}
                          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                        >
                          <option value="course">Curso</option>
                          <option value="event">Evento</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {formData.media_type === 'photo' ? 'Foto' : formData.media_type === 'video' ? 'Vídeo' : 'Arquivo'}
                      </label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={
                          formData.media_type === 'photo' 
                            ? '.jpg,.jpeg,.png,.gif,.webp,.bmp'
                            : formData.media_type === 'video'
                            ? '.mp4,.mov,.webm,.avi,.mkv'
                            : '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md'
                        }
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        {formData.media_type === 'photo' && 'Formatos: JPG, PNG, GIF, WebP (máx 10MB)'}
                        {formData.media_type === 'video' && 'Formatos: MP4, MOV, WebM, AVI, MKV (máx 500MB)'}
                        {formData.media_type === 'document' && 'Formatos: PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, TXT, MD (máx 50MB)'}
                      </p>
                    </div>

                    {(formData.media_type === 'video') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Thumbnail (opcional)
                        </label>
                        <input
                          ref={thumbnailInputRef}
                          type="file"
                          accept=".jpg,.jpeg,.png,.gif,.webp"
                          onChange={(e) => setThumbnailFile(e.target.files?.[0] || null)}
                          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Imagem de capa para o vídeo (máx 2MB)
                        </p>
                      </div>
                    )}
                  </>
                )}

                {(modalMode === 'create-md' || (modalMode === 'edit' && editingMaterial?.file_type === 'md')) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Conteúdo Markdown</label>
                    <textarea
                      value={formData.content}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono text-sm"
                      rows={15}
                      placeholder="# Título&#10;&#10;Conteúdo em Markdown..."
                    />
                  </div>
                )}

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

        {showAccessModal && accessMaterial && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Permissões de Acesso
              </h2>
              <p className="text-gray-600 mb-6">
                Material: <strong>{accessMaterial.title}</strong>
              </p>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-amber-800">
                  <strong>Como funciona:</strong> Se nenhuma organização ou usuário for selecionado, 
                  o material fica visível para todos. Se você selecionar organizações ou usuários específicos, 
                  apenas eles poderão ver este material. Super Admins sempre veem todos os materiais.
                </p>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    Organizações com Acesso
                  </h3>
                  <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                    {allOrgs.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">Nenhuma organização disponível</p>
                    ) : (
                      allOrgs.map(org => (
                        <label 
                          key={org.id}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                        >
                          <input
                            type="checkbox"
                            checked={selectedOrgIds.includes(org.id)}
                            onChange={() => toggleOrg(org.id)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <div>
                            <p className="text-gray-900 font-medium">{org.name}</p>
                            <p className="text-xs text-gray-500">{org.slug}</p>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                  {selectedOrgIds.length > 0 && (
                    <p className="text-sm text-blue-600 mt-2">
                      {selectedOrgIds.length} organização(ões) selecionada(s)
                    </p>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    Usuários com Acesso
                  </h3>
                  <input
                    type="text"
                    placeholder="Buscar usuários por email ou nome..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full px-4 py-2 mb-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none"
                  />
                  <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                    {filteredUsers.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">Nenhum usuário encontrado</p>
                    ) : (
                      filteredUsers.map(user => (
                        <label 
                          key={user.id}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                        >
                          <input
                            type="checkbox"
                            checked={selectedUserIds.includes(user.id)}
                            onChange={() => toggleUser(user.id)}
                            className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                          />
                          <div>
                            <p className="text-gray-900 font-medium">{user.email}</p>
                            {user.name && <p className="text-xs text-gray-500">{user.name}</p>}
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                  {selectedUserIds.length > 0 && (
                    <p className="text-sm text-purple-600 mt-2">
                      {selectedUserIds.length} usuário(s) selecionado(s)
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOrgIds([])
                    setSelectedUserIds([])
                  }}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Limpar seleção (tornar público)
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAccessModal(false)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAccess}
                    disabled={savingAccess}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {savingAccess ? 'Salvando...' : 'Salvar Permissões'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showBulkModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Permissões em Massa
              </h2>
              <p className="text-gray-600 mb-6">
                {selectedMaterialIds.length} material(is) selecionado(s)
              </p>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Operação</label>
                    <select
                      value={bulkOperation}
                      onChange={(e) => setBulkOperation(e.target.value as 'add' | 'remove' | 'replace')}
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                    >
                      <option value="add">Adicionar permissões</option>
                      <option value="remove">Remover permissões</option>
                      <option value="replace">Substituir todas as permissões</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Alvo</label>
                    <select
                      value={bulkTargetType}
                      onChange={(e) => {
                        setBulkTargetType(e.target.value as 'organizations' | 'users')
                        setBulkSelectedTargetIds([])
                        setBulkPreview(null)
                      }}
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                    >
                      <option value="organizations">Organizações</option>
                      <option value="users">Usuários</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Modo de Seleção</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={bulkSelectionMode === 'manual'}
                        onChange={() => {
                          setBulkSelectionMode('manual')
                          setBulkPreview(null)
                        }}
                        className="w-4 h-4 text-amber-600"
                      />
                      <span className="text-gray-700">Seleção Manual</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={bulkSelectionMode === 'filter'}
                        onChange={() => {
                          setBulkSelectionMode('filter')
                          setBulkSelectedTargetIds([])
                          setBulkPreview(null)
                        }}
                        className="w-4 h-4 text-amber-600"
                      />
                      <span className="text-gray-700">Por Filtros</span>
                    </label>
                  </div>
                </div>

                {bulkSelectionMode === 'manual' && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">
                      Selecionar {bulkTargetType === 'organizations' ? 'Organizações' : 'Usuários'}
                    </h3>
                    <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                      {bulkTargetType === 'organizations' ? (
                        allOrgs.length === 0 ? (
                          <p className="text-gray-500 text-center py-4">Nenhuma organização disponível</p>
                        ) : (
                          allOrgs.map(org => (
                            <label 
                              key={org.id}
                              className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                            >
                              <input
                                type="checkbox"
                                checked={bulkSelectedTargetIds.includes(org.id)}
                                onChange={() => toggleBulkTarget(org.id)}
                                className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                              />
                              <span className="text-gray-900">{org.name}</span>
                            </label>
                          ))
                        )
                      ) : (
                        allUsers.length === 0 ? (
                          <p className="text-gray-500 text-center py-4">Nenhum usuário disponível</p>
                        ) : (
                          allUsers.map(user => (
                            <label 
                              key={user.id}
                              className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                            >
                              <input
                                type="checkbox"
                                checked={bulkSelectedTargetIds.includes(user.id)}
                                onChange={() => toggleBulkTarget(user.id)}
                                className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                              />
                              <div>
                                <span className="text-gray-900">{user.email}</span>
                                {user.name && <span className="text-gray-500 text-sm ml-2">({user.name})</span>}
                              </div>
                            </label>
                          ))
                        )
                      )}
                    </div>
                    {bulkSelectedTargetIds.length > 0 && (
                      <p className="text-sm text-amber-600 mt-2">
                        {bulkSelectedTargetIds.length} selecionado(s)
                      </p>
                    )}
                  </div>
                )}

                {bulkSelectionMode === 'filter' && (
                  <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-sm font-medium text-gray-700">Filtros</h3>
                    
                    {bulkTargetType === 'users' && (
                      <>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Por Organização(ões)</label>
                          <div className="flex flex-wrap gap-2">
                            {allOrgs.map(org => (
                              <button
                                key={org.id}
                                type="button"
                                onClick={() => toggleBulkFilterOrg(org.id)}
                                className={`px-3 py-1 rounded-full text-sm ${
                                  bulkFilterOrgIds.includes(org.id)
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                                }`}
                              >
                                {org.name}
                              </button>
                            ))}
                          </div>
                        </div>
                        
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Por Role</label>
                          <div className="flex flex-wrap gap-2">
                            {['owner', 'admin', 'member'].map(role => (
                              <button
                                key={role}
                                type="button"
                                onClick={() => toggleBulkFilterRole(role)}
                                className={`px-3 py-1 rounded-full text-sm ${
                                  bulkFilterRoles.includes(role)
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                                }`}
                              >
                                {role}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                    
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Com Feature Ativa</label>
                      <select
                        value={bulkFilterFeature}
                        onChange={(e) => setBulkFilterFeature(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                      >
                        <option value="">Qualquer feature</option>
                        {availableFeatures.map(f => (
                          <option key={f.key} value={f.key}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={loadBulkPreview}
                    disabled={loadingPreview || (bulkSelectionMode === 'manual' && bulkSelectedTargetIds.length === 0)}
                    className="px-6 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {loadingPreview ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Gerando Preview...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Ver Preview
                      </>
                    )}
                  </button>
                </div>

                {bulkPreview && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 mb-2">Preview da Operação</h4>
                    <div className="text-sm text-blue-800 space-y-2">
                      <p>
                        <strong>Operação:</strong>{' '}
                        {bulkPreview.operation === 'add' ? 'Adicionar' : bulkPreview.operation === 'remove' ? 'Remover' : 'Substituir'}
                      </p>
                      <p>
                        <strong>Materiais afetados:</strong> {bulkPreview.materials_count}
                      </p>
                      <p>
                        <strong>{bulkPreview.target_type === 'organizations' ? 'Organizações' : 'Usuários'}:</strong>{' '}
                        {bulkPreview.targets_count}
                        {bulkPreview.has_more_targets && ' (mostrando primeiros 50)'}
                      </p>
                      <div className="mt-2">
                        <strong>Alvos:</strong>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {bulkPreview.targets.map((t: any) => (
                            <span key={t.id} className="px-2 py-1 bg-blue-100 rounded text-xs">
                              {t.name || t.email}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleBulkSubmit}
                  disabled={savingBulk || !bulkPreview || bulkPreview.targets_count === 0}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {savingBulk ? 'Aplicando...' : 'Aplicar Permissões'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showIntegrityModal && integrityResult && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-gray-900">Verificacao de Integridade</h2>
                  <button
                    onClick={() => setShowIntegrityModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-500">Armazenamento</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {integrityResult.storage_available ? 'Object Storage' : 'Local'}
                    </div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-500">Total de Materiais</div>
                    <div className="text-lg font-semibold text-gray-900">{integrityResult.total_materials}</div>
                  </div>
                  <div className="bg-emerald-50 p-4 rounded-lg">
                    <div className="text-sm text-emerald-600">Arquivos OK</div>
                    <div className="text-lg font-semibold text-emerald-700">{integrityResult.valid_files_count}</div>
                  </div>
                  <div className={`p-4 rounded-lg ${integrityResult.missing_files_count > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                    <div className={`text-sm ${integrityResult.missing_files_count > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      Arquivos Faltando
                    </div>
                    <div className={`text-lg font-semibold ${integrityResult.missing_files_count > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                      {integrityResult.missing_files_count}
                    </div>
                  </div>
                </div>

                {integrityResult.missing_files_count > 0 ? (
                  <div>
                    <h3 className="font-semibold text-red-700 mb-3">Materiais com arquivos faltando:</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Estes materiais precisam ser deletados e re-uploadados. Os arquivos foram perdidos quando o sistema usava armazenamento local.
                    </p>
                    <div className="space-y-2">
                      {integrityResult.missing_files.map((item, index) => (
                        <div key={index} className="bg-red-50 border border-red-200 p-3 rounded-lg">
                          <div className="font-medium text-red-900">{item.title}</div>
                          <div className="text-sm text-red-700">
                            Tipo: {item.media_type} | Arquivo: {item.filename}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-lg text-center">
                    <svg className="w-12 h-12 text-emerald-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-emerald-800 font-medium">Todos os arquivos estao disponiveis!</div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => setShowIntegrityModal(false)}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
