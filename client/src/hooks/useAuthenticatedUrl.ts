import { useCallback } from 'react'

const TOKEN_KEY = 'auth_token'

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getAuthenticatedMediaUrl(url: string): string {
  if (!url) return url
  
  const token = getAuthToken()
  if (!token) return url
  
  if (url.startsWith('/api/media/file/') || url.startsWith('/api/materiais/file/')) {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}token=${encodeURIComponent(token)}`
  }
  
  return url
}

export function useAuthenticatedMediaBatch(_urls: string[]) {
  const getBlobUrl = useCallback((originalUrl: string): string | undefined => {
    if (!originalUrl) return undefined
    return getAuthenticatedMediaUrl(originalUrl)
  }, [])

  return { loading: false, getBlobUrl }
}
