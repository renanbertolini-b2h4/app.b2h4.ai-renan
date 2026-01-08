import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const authAPI = {
  register: async (email: string, password: string, full_name?: string) => {
    const response = await apiClient.post('/auth/register', { email, password, full_name })
    return response.data
  },
  login: async (email: string, password: string) => {
    const response = await apiClient.post('/auth/login', { email, password })
    return response.data
  },
  me: async () => {
    const response = await apiClient.get('/auth/me')
    return response.data
  },
}

export const materiaisAPI = {
  listar: async () => {
    const response = await apiClient.get('/materiais')
    return response.data
  },
  getContent: async (id: string) => {
    const response = await apiClient.get(`/materiais/${id}/content`)
    return response.data
  },
  adminListar: async () => {
    const response = await apiClient.get('/admin/materiais')
    return response.data
  },
  adminObter: async (id: string) => {
    const response = await apiClient.get(`/admin/materiais/${id}`)
    return response.data
  },
  adminCriar: async (data: { title: string; description?: string; icon?: string; file_type?: string; content?: string; sort_order?: number }) => {
    const response = await apiClient.post('/admin/materiais', data)
    return response.data
  },
  adminUpload: async (formData: FormData) => {
    const response = await apiClient.post('/admin/materiais/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
  },
  adminAtualizar: async (id: string, data: { title?: string; description?: string; icon?: string; content?: string; sort_order?: number; is_active?: boolean }) => {
    const response = await apiClient.put(`/admin/materiais/${id}`, data)
    return response.data
  },
  adminExcluir: async (id: string) => {
    const response = await apiClient.delete(`/admin/materiais/${id}`)
    return response.data
  },
  adminUpdateAccess: async (id: string, data: { organization_ids?: string[]; user_ids?: string[] }) => {
    const response = await apiClient.put(`/admin/materiais/${id}/access`, data)
    return response.data
  },
  adminListOrganizations: async (search?: string, hasFeature?: string) => {
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (hasFeature) params.append('has_feature', hasFeature)
    const queryString = params.toString()
    const response = await apiClient.get(`/admin/organizations/list${queryString ? '?' + queryString : ''}`)
    return response.data
  },
  adminListUsers: async (options?: { search?: string; orgId?: string; role?: string; hasFeature?: string; limit?: number }) => {
    const params = new URLSearchParams()
    if (options?.search) params.append('search', options.search)
    if (options?.orgId) params.append('org_id', options.orgId)
    if (options?.role) params.append('role', options.role)
    if (options?.hasFeature) params.append('has_feature', options.hasFeature)
    if (options?.limit) params.append('limit', options.limit.toString())
    const queryString = params.toString()
    const response = await apiClient.get(`/admin/users/list${queryString ? '?' + queryString : ''}`)
    return response.data
  },
  adminBulkAccessPreview: async (data: {
    material_ids: string[];
    operation: 'add' | 'remove' | 'replace';
    target_type: 'organizations' | 'users';
    target_ids?: string[];
    filter?: {
      organization_ids?: string[];
      roles?: string[];
      has_feature?: string;
    };
  }) => {
    const response = await apiClient.post('/admin/materiais/bulk-access/preview', data)
    return response.data
  },
  adminBulkAccess: async (data: {
    material_ids: string[];
    operation: 'add' | 'remove' | 'replace';
    target_type: 'organizations' | 'users';
    target_ids?: string[];
    filter?: {
      organization_ids?: string[];
      roles?: string[];
      has_feature?: string;
    };
  }) => {
    const response = await apiClient.post('/admin/materiais/bulk-access', data)
    return response.data
  },
  checkIntegrity: async () => {
    const response = await apiClient.get('/admin/materiais/integrity')
    return response.data
  },
}

export const analisesAPI = {
  criar: async (politico: string, lei: string) => {
    const response = await apiClient.post('/analises', { politico, lei })
    return response.data
  },
  listar: async () => {
    const response = await apiClient.get('/analises')
    return response.data
  },
  obter: async (id: string) => {
    const response = await apiClient.get(`/analises/${id}`)
    return response.data
  },
  obterStatus: async (id: string) => {
    const response = await apiClient.get(`/analises/${id}/status`)
    return response.data
  },
}

export interface FeatureDefinition {
  key: string
  name: string
  description: string
}

export interface NpsFeedbackItem {
  id: string
  score: number
  feedback: string | null
  allow_showcase: boolean
  created_at: string
  user_name: string | null
  user_email: string | null
}

export interface NpsStats {
  total_responses: number
  nps_score: number
  promoters_count: number
  neutrals_count: number
  detractors_count: number
  promoters_percentage: number
  neutrals_percentage: number
  detractors_percentage: number
  recent_feedbacks: NpsFeedbackItem[]
}

export const npsAPI = {
  submit: async (score: number, feedback?: string, allow_showcase?: boolean) => {
    const response = await apiClient.post('/nps', { score, feedback, allow_showcase })
    return response.data
  },
  getStats: async (): Promise<NpsStats> => {
    const response = await apiClient.get('/nps/stats')
    return response.data
  },
}

export const certificatesAPI = {
  // Admin endpoints - por organização
  getOrganizations: async () => {
    const response = await apiClient.get('/admin/certificates/organizations')
    return response.data
  },
  getConfigs: async () => {
    const response = await apiClient.get('/admin/certificates/configs')
    return response.data
  },
  getParams: async (orgId?: string) => {
    const url = orgId ? `/admin/certificates/params/${orgId}` : '/certificates/params'
    const response = await apiClient.get(url)
    return response.data
  },
  updateParams: async (orgId: string, params: any) => {
    const response = await apiClient.put(`/admin/certificates/params/${orgId}`, params)
    return response.data
  },
  generate: async (orgId: string, data: { participant_name: string; use_ai_background: boolean }) => {
    const response = await apiClient.post(`/admin/certificates/generate?organization_id=${orgId}`, data)
    return response.data
  },
  generateBatch: async (orgId: string, data: { participant_names: string[]; use_ai_background: boolean }) => {
    const response = await apiClient.post(`/admin/certificates/generate-batch?organization_id=${orgId}`, data)
    return response.data
  },
  list: async (orgId?: string) => {
    const url = orgId ? `/admin/certificates/list?organization_id=${orgId}` : '/admin/certificates/list'
    const response = await apiClient.get(url)
    return response.data
  },

  // User endpoints - própria organização
  getMyConfig: async () => {
    const response = await apiClient.get('/certificates/my-config')
    return response.data
  },
  generateMy: async (useAiBackground: boolean) => {
    const response = await apiClient.post(`/certificates/generate-my?use_ai_background=${useAiBackground}`)
    return response.data
  },
  listMy: async () => {
    const response = await apiClient.get('/certificates/my-certificates')
    return response.data
  },
  downloadCertificate: async (filename: string) => {
    const response = await apiClient.get(`/certificates/download/${filename}`, {
      responseType: 'blob'
    })
    const blob = new Blob([response.data], { type: 'image/png' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  },
}

export interface CredentialStatus {
  key: string
  name: string
  description: string
  category: string
  is_configured: boolean
  source: string
  docs_url?: string
}

export interface Credential {
  id: string
  key: string
  name: string
  description?: string
  category: string
  is_configured: boolean
  masked_value: string
  is_active: boolean
  docs_url?: string
  created_at?: string
  updated_at?: string
}

export const credentialsAPI = {
  getStatus: async (): Promise<{ credentials: CredentialStatus[] }> => {
    const response = await apiClient.get('/admin/credentials/status')
    return response.data
  },
  getPredefined: async () => {
    const response = await apiClient.get('/admin/credentials/predefined')
    return response.data
  },
  list: async (): Promise<Credential[]> => {
    const response = await apiClient.get('/admin/credentials')
    return response.data
  },
  create: async (data: { key: string; name: string; value: string; description?: string; category?: string }) => {
    const response = await apiClient.post('/admin/credentials', data)
    return response.data
  },
  update: async (id: string, data: { name?: string; value?: string; description?: string; is_active?: boolean }) => {
    const response = await apiClient.put(`/admin/credentials/${id}`, data)
    return response.data
  },
  delete: async (id: string) => {
    const response = await apiClient.delete(`/admin/credentials/${id}`)
    return response.data
  },
  setup: async (key: string, value: string) => {
    const response = await apiClient.post(`/admin/credentials/setup/${key}`, { value })
    return response.data
  },
}

export interface OrgCredential {
  key: string
  name: string
  description: string
  is_configured: boolean
  masked_value: string
  is_active: boolean
  updated_at?: string
}

export const orgCredentialsAPI = {
  list: async (organizationId?: string): Promise<OrgCredential[]> => {
    const params = organizationId ? `?organization_id=${organizationId}` : ''
    const response = await apiClient.get(`/org/credentials${params}`)
    return response.data
  },
  update: async (key: string, value: string, organizationId?: string) => {
    const params = organizationId ? `?organization_id=${organizationId}` : ''
    const response = await apiClient.put(`/org/credentials/${key}${params}`, { value })
    return response.data
  },
  delete: async (key: string, organizationId?: string) => {
    const params = organizationId ? `?organization_id=${organizationId}` : ''
    const response = await apiClient.delete(`/org/credentials/${key}${params}`)
    return response.data
  },
  listForOrg: async (orgId: string): Promise<OrgCredential[]> => {
    const response = await apiClient.get(`/admin/orgs/${orgId}/credentials`)
    return response.data
  },
  updateForOrg: async (orgId: string, key: string, value: string) => {
    const response = await apiClient.put(`/admin/orgs/${orgId}/credentials/${key}`, { value })
    return response.data
  },
}

export interface GammaGenerateRequest {
  prompt: string
  mode?: 'presentation' | 'document' | 'webpage'
  language?: string
  theme?: string
  folder_id?: string
  response_format?: 'url' | 'id'
  generate_images?: boolean
  num_slides?: number
  tone?: string
  audience?: string
  save_to_library?: boolean
  organization_ids?: string[]
  user_ids?: string[]
  advanced?: {
    creativity_level?: number
    include_speaker_notes?: boolean
    include_references?: boolean
    visual_style?: string
    color_scheme?: string
    font_style?: string
    layout_preference?: string
  }
}

export interface GammaGeneration {
  id: string
  title: string
  prompt: string
  gamma_url: string
  format: string
  status: string
  has_pdf: boolean
  has_material: boolean
  created_at: string
  created_by: string
  has_restrictions: boolean
  organization_ids: string[]
  user_ids: string[]
}

export const gammaAPI = {
  health: async () => {
    const response = await apiClient.get('/gamma/health')
    return response.data
  },
  getThemes: async () => {
    const response = await apiClient.get('/gamma/themes')
    return response.data
  },
  getFolders: async () => {
    const response = await apiClient.get('/gamma/folders')
    return response.data
  },
  generate: async (data: GammaGenerateRequest) => {
    const response = await apiClient.post('/gamma/generate', data)
    return response.data
  },
  listGenerations: async (skip = 0, limit = 20) => {
    const response = await apiClient.get(`/gamma/generations?skip=${skip}&limit=${limit}`)
    return response.data
  },
  getGeneration: async (id: string) => {
    const response = await apiClient.get(`/gamma/generations/${id}`)
    return response.data
  },
  updatePermissions: async (id: string, organizationIds?: string[], userIds?: string[]) => {
    const response = await apiClient.put(`/gamma/generations/${id}/permissions`, {
      organization_ids: organizationIds,
      user_ids: userIds
    })
    return response.data
  },
  deleteGeneration: async (id: string) => {
    const response = await apiClient.delete(`/gamma/generations/${id}`)
    return response.data
  },
  sendToMaterials: async (id: string, data?: { title?: string; description?: string; collection?: string; copy_permissions?: boolean }) => {
    const response = await apiClient.post(`/gamma/generations/${id}/send-to-materials`, data || {})
    return response.data
  },
  exportImages: async (id: string, saveToStorage = true) => {
    const response = await apiClient.post(`/gamma/generations/${id}/export-images`, { save_to_storage: saveToStorage })
    return response.data
  },
  getStatus: async (contentId: string) => {
    const response = await apiClient.get(`/gamma/status/${contentId}`)
    return response.data
  },
  getContent: async (contentId: string) => {
    const response = await apiClient.get(`/gamma/content/${contentId}`)
    return response.data
  },
  updateContent: async (contentId: string, updates: Record<string, unknown>) => {
    const response = await apiClient.put(`/gamma/content/${contentId}`, updates)
    return response.data
  },
  deleteContent: async (contentId: string) => {
    const response = await apiClient.delete(`/gamma/content/${contentId}`)
    return response.data
  },
  exportContent: async (contentId: string, format: 'pdf' | 'pptx' | 'png' | 'html' = 'pdf') => {
    const response = await apiClient.post(`/gamma/export/${contentId}`, { format })
    return response.data
  },
  shareContent: async (contentId: string, accessLevel: string = 'view', password?: string, expiryDate?: string) => {
    const response = await apiClient.post(`/gamma/share/${contentId}`, { 
      access_level: accessLevel,
      password,
      expiry_date: expiryDate
    })
    return response.data
  },
  suggestTemplate: async (prompt: string, category?: string) => {
    const response = await apiClient.post('/gamma/suggest-template', { prompt, category })
    return response.data
  },
  getAnalytics: async () => {
    const response = await apiClient.get('/gamma/analytics')
    return response.data
  }
}

export const adminAPI = {
  getDashboard: async () => {
    const response = await apiClient.get('/admin/dashboard')
    return response.data
  },
  getFeatures: async (): Promise<FeatureDefinition[]> => {
    const response = await apiClient.get('/admin/features')
    return response.data
  },
  listOrganizations: async () => {
    const response = await apiClient.get('/admin/organizations')
    return response.data
  },
  createOrganization: async (data: { name: string; slug: string; plan_type?: string; features?: Record<string, boolean> }) => {
    const response = await apiClient.post('/admin/organizations', data)
    return response.data
  },
  updateOrganization: async (id: string, data: { name?: string; plan_type?: string; features?: Record<string, boolean>; is_active?: boolean }) => {
    const response = await apiClient.put(`/admin/organizations/${id}`, data)
    return response.data
  },
  listUsers: async (organizationId?: string) => {
    const params = organizationId ? `?organization_id=${organizationId}` : ''
    const response = await apiClient.get(`/admin/users${params}`)
    return response.data
  },
  createUser: async (data: { email: string; password: string; full_name?: string; organization_id?: string; role?: string; features?: Record<string, boolean>; is_super_admin?: boolean }) => {
    const response = await apiClient.post('/admin/users', data)
    return response.data
  },
  updateUser: async (id: string, data: { email?: string; password?: string; full_name?: string; organization_id?: string; role?: string; features?: Record<string, boolean>; is_active?: boolean; is_super_admin?: boolean }) => {
    const response = await apiClient.put(`/admin/users/${id}`, data)
    return response.data
  },
}

export const piiAPI = {
  processChat: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient.post('/pii/process-chat', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
  },
  getJobs: async (skip = 0, limit = 10) => {
    const response = await apiClient.get(`/pii/jobs?skip=${skip}&limit=${limit}`)
    return response.data
  },
  getJob: async (id: string) => {
    const response = await apiClient.get(`/pii/jobs/${id}`)
    return response.data
  },
  getJobMessages: async (jobId: string, skip = 0, limit = 50) => {
    const response = await apiClient.get(`/pii/jobs/${jobId}/messages?skip=${skip}&limit=${limit}`)
    return response.data
  },
  analyzeWithLLM: async (data: { job_id: string; task_type: string; llm_model?: string; custom_prompt?: string }) => {
    const response = await apiClient.post('/pii/analyze-with-llm', data)
    return response.data
  },
  analyzeWithLLMExecute: async (data: { job_id: string; task_type: string; llm_model?: string; custom_prompt?: string }) => {
    const response = await apiClient.post('/pii/analyze-with-llm-execute', data)
    return response.data
  },
  getAnalysis: async (id: string) => {
    const response = await apiClient.get(`/pii/analyses/${id}`)
    return response.data
  },
  getPatterns: async () => {
    const response = await apiClient.get('/pii/patterns')
    return response.data
  },
  createPattern: async (data: { name: string; regex: string; pii_type: string; masking_strategy: string; description?: string }) => {
    const response = await apiClient.post('/pii/patterns', data)
    return response.data
  },
  updatePattern: async (id: string, data: { name: string; regex: string; pii_type: string; masking_strategy: string; description?: string }) => {
    const response = await apiClient.put(`/pii/patterns/${id}`, data)
    return response.data
  },
  deletePattern: async (id: string) => {
    const response = await apiClient.delete(`/pii/patterns/${id}`)
    return response.data
  },
  getModels: async () => {
    const response = await apiClient.get('/pii/models')
    return response.data
  },
  getInfo: async () => {
    const response = await apiClient.get('/pii/info')
    return response.data
  },
  getAnalysisProgress: async (analysisId: string) => {
    const response = await apiClient.get(`/pii/analyses/${analysisId}/progress`)
    return response.data
  },
  resumeAnalysis: async (analysisId: string, data: { new_model?: string; reset_failed_chunks?: boolean }) => {
    const response = await apiClient.post(`/pii/analyses/${analysisId}/resume`, data)
    return response.data
  },
  getAnalysisSuggestions: async (analysisId: string) => {
    const response = await apiClient.get(`/pii/analyses/${analysisId}/suggestions`)
    return response.data
  },
  getJobAnalyses: async (jobId: string) => {
    const response = await apiClient.get(`/pii/jobs/${jobId}/analyses`)
    return response.data
  },
  getAnalysisPrompts: async (analysisId: string) => {
    const response = await apiClient.get(`/pii/analyses/${analysisId}/prompts`)
    return response.data
  },
  uploadPresidio: async (file: File, mode: string = 'tags') => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient.post(`/pii/upload-presidio?mode=${mode}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
  },
  getModes: async () => {
    const response = await apiClient.get('/pii/modes')
    return response.data
  },
  getJobVault: async (jobId: string) => {
    const response = await apiClient.get(`/pii/jobs/${jobId}/vault`)
    return response.data
  },
  deanonymizeAnalysis: async (analysisId: string) => {
    const response = await apiClient.post(`/pii/analyses/${analysisId}/deanonymize`)
    return response.data
  },
  chatWithAnalysis: async (data: { analysis_id: string; question: string; include_context?: boolean }) => {
    const response = await apiClient.post('/pii/chat', data)
    return response.data
  },
  chatWithJob: async (data: { job_id: string; question: string; llm_model?: string; include_analyses?: boolean }) => {
    const response = await apiClient.post('/pii/chat-with-job', data)
    return response.data
  }
}

export const deepAnalysisAPI = {
  getTypes: async () => {
    const response = await apiClient.get('/deep-analysis/types')
    return response.data
  },
  getPiiJobs: async () => {
    const response = await apiClient.get('/deep-analysis/pii-jobs')
    return response.data
  },
  createJob: async (data: { pii_job_id: string; analysis_type: string; detail_level: string; model: string }) => {
    const response = await apiClient.post('/deep-analysis/jobs', data)
    return response.data
  },
  getJobs: async (limit = 20) => {
    const response = await apiClient.get(`/deep-analysis/jobs?limit=${limit}`)
    return response.data
  },
  getJob: async (id: string) => {
    const response = await apiClient.get(`/deep-analysis/jobs/${id}`)
    return response.data
  },
  getProgress: async (id: string) => {
    const response = await apiClient.get(`/deep-analysis/jobs/${id}/progress`)
    return response.data
  },
  getResult: async (id: string) => {
    const response = await apiClient.get(`/deep-analysis/jobs/${id}/result`)
    return response.data
  },
  deanonymize: async (id: string) => {
    const response = await apiClient.post(`/deep-analysis/jobs/${id}/deanonymize`)
    return response.data
  },
  streamJob: (id: string) => {
    const token = localStorage.getItem('token')
    return new EventSource(`/api/deep-analysis/jobs/${id}/stream?token=${token}`)
  }
}
