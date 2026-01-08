import React, { createContext, useContext, useState, useEffect } from 'react'
import { authAPI } from '../lib/apiClient'

interface OrganizationFeatures {
  flowiseAccess: boolean
  gammaAccess: boolean
  courseAccess: boolean
  settingsAccess: boolean
  healthCheckAccess: boolean
  courseManagement: boolean
  piiAccess: boolean
  deepAnalysisAccess: boolean
}

interface EffectiveFeatures {
  flowiseAccess: boolean
  gammaAccess: boolean
  courseAccess: boolean
  settingsAccess: boolean
  healthCheckAccess: boolean
  courseManagement: boolean
  piiAccess: boolean
  deepAnalysisAccess: boolean
  isAdmin: boolean
  isSuperAdmin: boolean
}

interface Organization {
  id: string
  name: string
  slug: string
  features: OrganizationFeatures
}

interface User {
  id: string
  email: string
  full_name?: string
  role: string
  is_super_admin?: boolean
  organization?: Organization
  effectiveFeatures?: EffectiveFeatures
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  loading: boolean
  features: EffectiveFeatures
  isAdmin: boolean
  isSuperAdmin: boolean
  token: string | null
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  register: (email: string, password: string, fullName?: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
}

const DEFAULT_FEATURES: EffectiveFeatures = {
  flowiseAccess: false,
  gammaAccess: false,
  courseAccess: false,
  settingsAccess: false,
  healthCheckAccess: false,
  courseManagement: false,
  piiAccess: false,
  deepAnalysisAccess: false,
  isAdmin: false,
  isSuperAdmin: false
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState<string | null>(localStorage.getItem('auth_token'))

  const features = user?.effectiveFeatures || DEFAULT_FEATURES
  const isAdmin = features.isAdmin
  const isSuperAdmin = features.isSuperAdmin

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      authAPI
        .me()
        .then((userData) => {
          setUser(userData)
        })
        .catch(() => {
          localStorage.removeItem('auth_token')
        })
        .finally(() => {
          setLoading(false)
        })
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email: string, password: string) => {
    try {
      const data = await authAPI.login(email, password)
      localStorage.setItem('auth_token', data.access_token)
      setToken(data.access_token)
      const userData = await authAPI.me()
      setUser(userData)
      return { success: true }
    } catch (error: any) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Erro ao fazer login' 
      }
    }
  }

  const register = async (email: string, password: string, fullName?: string) => {
    try {
      const data = await authAPI.register(email, password, fullName)
      localStorage.setItem('auth_token', data.access_token)
      setToken(data.access_token)
      const userData = await authAPI.me()
      setUser(userData)
      return { success: true }
    } catch (error: any) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Erro ao registrar' 
      }
    }
  }

  const logout = () => {
    localStorage.removeItem('auth_token')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        features,
        isAdmin,
        isSuperAdmin,
        token,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
