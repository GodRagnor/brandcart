const envBase = import.meta.env.VITE_API_BASE_URL?.trim() || ''
const API_BASE_URL = validateApiUrl(envBase)

function validateApiUrl(url) {
  if (!url) return ''
  const trimmed = url.endsWith('/') ? url.slice(0, -1) : url
  try {
    const parsed = new URL(trimmed)
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && parsed.protocol !== 'https:') {
      console.warn('Warning: API URL should use HTTPS')
    }
    return trimmed
  } catch {
    console.error('Invalid API base URL:', url)
    return ''
  }
}

function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]')
  return meta ? meta.getAttribute('content') : ''
}

async function apiRequest(path, options = {}) {
  const { method = 'GET', body, token } = options
  const headers = {}

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  
  if (method !== 'GET') {
    const csrfToken = getCsrfToken()
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
    }
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: 'same-origin',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    let message = `HTTP ${res.status}`
    let errorCode = ''
    try {
      const payload = await res.json()
      if (payload?.detail) {
        message = typeof payload.detail === 'string' ? payload.detail : JSON.stringify(payload.detail)
      } else if (payload?.message) {
        message = payload.message
      }
      if (payload?.code) {
        errorCode = payload.code
      }
    } catch {
      message = `HTTP ${res.status}`
    }
    
    if (res.status === 401 && errorCode === 'TOKEN_EXPIRED') {
      localStorage.removeItem('brandcartAuthToken')
      window.location.reload()
    }
    
    const error = new Error(message)
    error.status = res.status
    error.code = errorCode
    throw error
  }

  if (res.status === 204) {
    return null
  }
  return res.json()
}

export async function apiGet(path, options = {}) {
  return apiRequest(path, { ...options, method: 'GET' })
}

export async function apiPost(path, body, options = {}) {
  return apiRequest(path, { ...options, method: 'POST', body })
}

export async function apiPatch(path, body, options = {}) {
  return apiRequest(path, { ...options, method: 'PATCH', body })
}
