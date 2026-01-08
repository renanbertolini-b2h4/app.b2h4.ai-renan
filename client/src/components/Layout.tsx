import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocation } from 'wouter'
import SettingsModal from './SettingsModal'
import HealthCheckPanel from './HealthCheckPanel'
import { ChangelogButton, ChangelogModal } from './Changelog'
import { useChangelog } from '../hooks/useChangelog'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { user, features, isAdmin, isSuperAdmin, logout } = useAuth()
  const [location, setLocation] = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [healthCheckOpen, setHealthCheckOpen] = useState(false)
  const { groupedEntries, unreadCount, isModalOpen, openModal, closeModal, currentVersion } = useChangelog()

  const canAccessSettings = isSuperAdmin || features.settingsAccess
  const canAccessHealthCheck = isSuperAdmin || features.healthCheckAccess

  const navItems = [
    { 
      path: '/', 
      label: 'Materiais', 
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
      enabled: features.courseAccess 
    },
    { 
      path: '/flowise', 
      label: 'Flowise', 
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      enabled: features.flowiseAccess 
    },
    { 
      path: '/gamma', 
      label: 'Gamma', 
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
      ),
      enabled: features.gammaAccess 
    },
    { 
      path: '/pii', 
      label: 'PII Masking', 
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
      enabled: features.piiAccess 
    },
    { 
      path: '/deep-analysis', 
      label: 'Análise Profunda', 
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
      enabled: features.piiAccess || features.deepAnalysisAccess
    },
    { 
      path: '/nps', 
      label: 'Avaliação', 
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      ),
      enabled: true 
    },
    { 
      path: '/my-certificate', 
      label: 'Meu Certificado', 
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
      ),
      enabled: true 
    }
  ]

  const adminNavItems = [
    { 
      path: '/admin', 
      label: 'Dashboard', 
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    },
    { 
      path: '/admin/organizations', 
      label: 'Organizações', 
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      )
    },
    { 
      path: '/admin/users', 
      label: 'Usuários', 
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )
    },
    { 
      path: '/nps/dashboard', 
      label: 'NPS Analytics', 
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      )
    },
    { 
      path: '/admin/certificates', 
      label: 'Certificados', 
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
      )
    },
    { 
      path: '/admin/credentials', 
      label: 'Credenciais', 
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      )
    },
    { 
      path: '/admin/storage', 
      label: 'Armazenamento', 
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      )
    }
  ]

  const courseManagementItem = {
    path: '/admin/materiais',
    label: 'Gerenciar Materiais',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  }

  const enabledNavItems = navItems.filter(item => item.enabled)

  const isActiveRoute = (path: string) => {
    if (path === '/admin') {
      return location === '/admin'
    }
    return location === path
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50
        ${sidebarCollapsed ? 'w-16' : 'w-56'} bg-slate-800
        transform transition-all duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        flex flex-col h-screen overflow-hidden
      `}>
        <div className="shrink-0 p-3 border-b border-slate-700 bg-slate-800">
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
              <img src="/logo-b2h4.png" alt="B2H4" className="w-full h-full object-contain" />
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <h1 className="text-base font-semibold text-white truncate">Plataforma B2H4</h1>
                <p className="text-xs text-slate-400">IA Generativa</p>
              </div>
            )}
          </div>
          
        </div>

        <nav className="grow min-h-0 p-2 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
          {!sidebarCollapsed && (
            <p className="px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
              Menu
            </p>
          )}
          
          {enabledNavItems.map((item) => (
            <button
              key={item.path}
              onClick={() => {
                setLocation(item.path)
                setSidebarOpen(false)
              }}
              className={`
                w-full rounded-lg flex items-center transition-all text-sm
                ${sidebarCollapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2.5 gap-3'}
                ${isActiveRoute(item.path)
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }
              `}
              title={sidebarCollapsed ? item.label : undefined}
            >
              {item.icon}
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          ))}

          {isSuperAdmin && (
            <>
              <div className="my-3 border-t border-slate-700" />
              {!sidebarCollapsed && (
                <p className="px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Administração
                </p>
              )}
              
              {adminNavItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => {
                    setLocation(item.path)
                    setSidebarOpen(false)
                  }}
                  className={`
                    w-full rounded-lg flex items-center transition-all text-sm
                    ${sidebarCollapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2.5 gap-3'}
                    ${isActiveRoute(item.path)
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                    }
                  `}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  {item.icon}
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </button>
              ))}
            </>
          )}

          {features.courseManagement && (
            <>
              {!isSuperAdmin && <div className="my-3 border-t border-slate-700" />}
              {!isSuperAdmin && !sidebarCollapsed && (
                <p className="px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Gestão
                </p>
              )}
              <button
                onClick={() => {
                  setLocation(courseManagementItem.path)
                  setSidebarOpen(false)
                }}
                className={`
                  w-full rounded-lg flex items-center transition-all text-sm
                  ${sidebarCollapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2.5 gap-3'}
                  ${isActiveRoute(courseManagementItem.path)
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }
                `}
                title={sidebarCollapsed ? courseManagementItem.label : undefined}
              >
                {courseManagementItem.icon}
                {!sidebarCollapsed && <span>{courseManagementItem.label}</span>}
              </button>
            </>
          )}

          {isAdmin && features.flowiseAccess && (
            <>
              {!isSuperAdmin && !features.courseManagement && <div className="my-3 border-t border-slate-700" />}
              {!isSuperAdmin && !features.courseManagement && !sidebarCollapsed && (
                <p className="px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Configurações
                </p>
              )}
              <button
                onClick={() => {
                  setLocation('/flowise/config')
                  setSidebarOpen(false)
                }}
                className={`
                  w-full rounded-lg flex items-center transition-all text-sm
                  ${sidebarCollapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2.5 gap-3'}
                  ${isActiveRoute('/flowise/config')
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }
                `}
                title={sidebarCollapsed ? 'Configurar Flowise' : undefined}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {!sidebarCollapsed && <span>Configurar Flowise</span>}
              </button>
            </>
          )}
        </nav>

        <div className="hidden lg:block shrink-0 px-2 pb-2">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`
              w-full flex items-center justify-center gap-2 
              px-3 py-2 text-xs text-slate-400 hover:text-white 
              hover:bg-slate-700 rounded-lg transition-colors border border-slate-600
            `}
            title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {sidebarCollapsed ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
                <span>Recolher menu</span>
              </>
            )}
          </button>
        </div>

        <div className="shrink-0 p-3 border-t border-slate-700 bg-slate-800">
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-9 h-9 bg-slate-600 rounded-full flex items-center justify-center" title={user?.full_name || user?.email}>
                <span className="text-white text-sm font-medium">
                  {user?.full_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                </span>
              </div>
              
              {isSuperAdmin && (
                <span className="w-2 h-2 bg-purple-400 rounded-full" title="Super Admin" />
              )}
              {!isSuperAdmin && isAdmin && (
                <span className="w-2 h-2 bg-teal-400 rounded-full" title="Admin" />
              )}

              <button
                onClick={logout}
                className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                title="Sair"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 bg-slate-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-medium">
                    {user?.full_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">
                    {user?.full_name || user?.email}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {user?.organization?.name}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {isSuperAdmin && (
                  <span className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-full border border-purple-500/30">
                    Super Admin
                  </span>
                )}
                {!isSuperAdmin && isAdmin && (
                  <span className="px-2 py-1 bg-teal-500/20 text-teal-300 text-xs rounded-full border border-teal-500/30">
                    Admin
                  </span>
                )}
              </div>

              <button
                onClick={logout}
                className="w-full mt-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sair
              </button>
            </>
          )}
        </div>
      </aside>

      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-200 ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-56'}`}>
        <header className="bg-white border-b border-gray-200 px-4 lg:px-8 py-4 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="hidden lg:flex items-center gap-2 text-sm text-teal-700">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>Powered by B2H4</span>
          </div>

          <div className="flex items-center gap-2">
            <ChangelogButton unreadCount={unreadCount} onClick={openModal} />

            {canAccessHealthCheck && (
              <button
                onClick={() => setHealthCheckOpen(true)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Status dos Serviços"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            )}

            {canAccessSettings && (
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Configurações"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HealthCheckPanel isOpen={healthCheckOpen} onClose={() => setHealthCheckOpen(false)} />
      <ChangelogModal 
        isOpen={isModalOpen} 
        onClose={closeModal} 
        groupedEntries={groupedEntries}
        currentVersion={currentVersion}
      />
    </div>
  )
}
