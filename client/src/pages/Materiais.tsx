import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { apiClient } from '../lib/apiClient'
import Layout from '../components/Layout'
import AccessDenied from '../components/AccessDenied'
import MarkdownViewer from '../components/markdown/MarkdownViewer'
import PDFViewer from '../components/pdf/PDFViewer'
import { useAuthenticatedMediaBatch } from '../hooks/useAuthenticatedUrl'

interface Material {
  id: string
  title: string
  description: string
  icon: string
  file: string
  size: string
  type: string
  media_type: 'document' | 'photo' | 'video'
  collection: string
  thumbnail: string | null
  metadata: Record<string, unknown>
}

type TabType = 'documents' | 'photos' | 'videos'

const iconBadgeColors: Record<string, string> = {
  '📅': 'bg-blue-50 text-blue-600',
  '📚': 'bg-emerald-50 text-emerald-600',
  '💼': 'bg-amber-50 text-amber-600',
  '🚀': 'bg-teal-50 text-teal-600',
  '📷': 'bg-purple-50 text-purple-600',
  '🎬': 'bg-red-50 text-red-600',
  '📄': 'bg-gray-50 text-gray-600',
}

const tabs = [
  { id: 'documents' as TabType, label: 'Documentos', icon: '📄' },
  { id: 'photos' as TabType, label: 'Fotos', icon: '📷' },
  { id: 'videos' as TabType, label: 'Vídeos', icon: '🎬' },
]

export default function Materiais() {
  const { features } = useAuth()
  const [materiais, setMateriais] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('documents')
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null)
  const [markdownContent, setMarkdownContent] = useState<string>('')
  const [loadingContent, setLoadingContent] = useState(false)
  const [viewerType, setViewerType] = useState<'md' | 'pdf' | 'photo' | 'video' | null>(null)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)

  const mediaUrls = materiais
    .filter(m => m.media_type === 'photo' || m.media_type === 'video')
    .flatMap(m => [m.file, m.thumbnail].filter(Boolean) as string[])
  
  const { getBlobUrl, loading: loadingMedia } = useAuthenticatedMediaBatch(mediaUrls)

  useEffect(() => {
    if (features.courseAccess) {
      loadMateriais()
    } else {
      setLoading(false)
    }
  }, [features.courseAccess])

  const loadMateriais = async () => {
    try {
      const response = await apiClient.get('/materiais')
      setMateriais(response.data)
    } catch (error) {
      console.error('Erro ao carregar materiais:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredMateriais = materiais.filter((m) => {
    if (activeTab === 'documents') return m.media_type === 'document'
    if (activeTab === 'photos') return m.media_type === 'photo'
    if (activeTab === 'videos') return m.media_type === 'video'
    return true
  })

  const tabCounts = {
    documents: materiais.filter((m) => m.media_type === 'document').length,
    photos: materiais.filter((m) => m.media_type === 'photo').length,
    videos: materiais.filter((m) => m.media_type === 'video').length,
  }

  const handleOpenMaterial = async (material: Material) => {
    if (material.media_type === 'photo') {
      const blobUrl = getBlobUrl(material.file)
      if (blobUrl) {
        setLightboxImage(blobUrl)
      }
      return
    }

    if (material.media_type === 'video') {
      setSelectedMaterial(material)
      setViewerType('video')
      return
    }

    if (material.type === 'md') {
      setLoadingContent(true)
      setSelectedMaterial(material)
      setViewerType('md')
      try {
        let content = ''
        if (material.file.startsWith('/api/')) {
          const response = await apiClient.get(material.file.replace('/api', ''))
          content = response.data
        } else {
          const response = await fetch(material.file)
          content = await response.text()
        }
        setMarkdownContent(content)
      } catch (error) {
        console.error('Erro ao carregar conteúdo:', error)
        setMarkdownContent('Erro ao carregar o conteúdo.')
      } finally {
        setLoadingContent(false)
      }
    } else if (material.type === 'pdf') {
      setSelectedMaterial(material)
      setViewerType('pdf')
    } else {
      window.open(material.file, '_blank')
    }
  }

  const handleCloseMaterial = () => {
    setSelectedMaterial(null)
    setMarkdownContent('')
    setViewerType(null)
  }

  const closeLightbox = () => {
    setLightboxImage(null)
  }

  if (!features.courseAccess) {
    return (
      <Layout>
        <AccessDenied feature="course" />
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Materiais do Curso
          </h1>
          <p className="text-gray-600">
            Aqui estão todos os materiais que você precisa para aproveitar ao máximo a Imersão C-Level em IA Generativa
          </p>
        </div>

        <div className="flex border-b border-gray-200 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
              {tabCounts[tab.id] > 0 && (
                <span className={`ml-1 px-2 py-0.5 text-xs rounded-full ${
                  activeTab === tab.id
                    ? 'bg-teal-100 text-teal-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {tabCounts[tab.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600"></div>
          </div>
        ) : filteredMateriais.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl">
            <p className="text-gray-500">Nenhum {activeTab === 'documents' ? 'documento' : activeTab === 'photos' ? 'foto' : 'vídeo'} disponível.</p>
          </div>
        ) : activeTab === 'photos' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-10">
            {loadingMedia && (
              <div className="col-span-full flex justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600"></div>
              </div>
            )}
            {filteredMateriais.map((material) => {
              const imageSrc = getBlobUrl(material.file)
              return (
                <div
                  key={material.id}
                  onClick={() => handleOpenMaterial(material)}
                  className="aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity relative group"
                >
                  {imageSrc ? (
                    <img
                      src={imageSrc}
                      alt={material.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="animate-pulse bg-gray-200 w-full h-full"></div>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                  </div>
                  {material.description && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                      <p className="text-white text-xs truncate">{material.title}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : activeTab === 'videos' ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
            {filteredMateriais.map((material) => {
              const thumbnailSrc = material.thumbnail ? getBlobUrl(material.thumbnail) : null
              return (
                <div
                  key={material.id}
                  className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  <div 
                    className="aspect-video bg-gray-900 relative cursor-pointer group"
                    onClick={() => handleOpenMaterial(material)}
                  >
                    {thumbnailSrc ? (
                      <img
                        src={thumbnailSrc}
                        alt={material.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-4xl">🎬</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="text-base font-semibold text-gray-900 mb-1">{material.title}</h3>
                    {material.description && (
                      <p className="text-sm text-gray-500 line-clamp-2">{material.description}</p>
                    )}
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-gray-400">{material.size}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
            {filteredMateriais.map((material) => (
              <div
                key={material.id}
                className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg mb-4 ${iconBadgeColors[material.icon] || 'bg-gray-100 text-gray-600'}`}>
                  {material.icon}
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-2">{material.title}</h3>
                <p className="text-sm text-gray-500 mb-4 line-clamp-2">{material.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{material.size}</span>
                  <button
                    onClick={() => handleOpenMaterial(material)}
                    className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Visualizar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-10">
          <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <span className="w-8 h-8 bg-teal-50 text-teal-600 rounded-lg flex items-center justify-center text-sm">📍</span>
            Informações Logísticas
          </h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-2 text-sm">📅 Data e Horário</h4>
              <p className="text-sm text-gray-600">05 de Dezembro de 2025</p>
              <p className="text-sm text-gray-600">08:00 - 18:00 (10 horas)</p>
              <p className="text-sm text-teal-600 mt-1">Chegue às 07:45 para check-in</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2 text-sm">📍 Local</h4>
              <p className="text-sm text-gray-600">São Paulo, SP</p>
              <p className="text-xs text-gray-400 mt-1">Endereço será enviado por WhatsApp</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2 text-sm">💻 O que levar</h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>✅ Laptop carregado</li>
                <li>✅ Carregador</li>
                <li>✅ Disposição para aprender!</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2 text-sm">☕ Alimentação</h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>✅ Coffee break manhã</li>
                <li>✅ Almoço completo</li>
                <li>✅ Coffee break tarde</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-gray-100 rounded-xl p-8 text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Dúvidas?
          </h3>
          <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
            Entre em contato comigo a qualquer momento. Estou aqui para ajudar!
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="https://wa.me/5511993153446"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              WhatsApp
            </a>
            <a
              href="mailto:carlos@b2h4.ai"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              E-mail
            </a>
          </div>
        </div>
      </div>

      {selectedMaterial && viewerType === 'md' && (
        loadingContent ? (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600"></div>
          </div>
        ) : (
          <MarkdownViewer
            content={markdownContent}
            title={selectedMaterial.title}
            onClose={handleCloseMaterial}
          />
        )
      )}

      {selectedMaterial && viewerType === 'pdf' && (
        <PDFViewer
          fileUrl={selectedMaterial.file}
          title={selectedMaterial.title}
          onClose={handleCloseMaterial}
        />
      )}

      {selectedMaterial && viewerType === 'video' && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-4xl">
            <button
              onClick={handleCloseMaterial}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <video
              src={getBlobUrl(selectedMaterial.file) || selectedMaterial.file}
              controls
              autoPlay
              className="w-full rounded-lg"
            >
              Seu navegador não suporta vídeos HTML5.
            </video>
            <div className="mt-4 text-center">
              <h3 className="text-white text-lg font-semibold">{selectedMaterial.title}</h3>
              {selectedMaterial.description && (
                <p className="text-gray-400 text-sm mt-1">{selectedMaterial.description}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {lightboxImage && (
        <div 
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={closeLightbox}
        >
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={lightboxImage}
            alt="Foto ampliada"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </Layout>
  )
}
