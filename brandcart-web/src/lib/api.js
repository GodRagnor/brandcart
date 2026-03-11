const envBase = import.meta.env.VITE_API_BASE_URL?.trim() || ''
const API_BASE_URL = validateApiUrl(envBase)
const COOKIE_SESSION_TOKEN = '__cookie_session__'

let refreshPromise = null

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

function clearLegacyAuthStorage() {
  localStorage.removeItem('brandcartAuthToken')
  localStorage.removeItem('brandcartAuthPhone')
  localStorage.removeItem('brandcartAuthRole')
}

function notifyAuthExpired() {
  clearLegacyAuthStorage()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('brandcart-auth-expired'))
  }
}

function shouldSendBearer(token) {
  return Boolean(token && token !== COOKIE_SESSION_TOKEN)
}

async function refreshAuthSession() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    }).then(async (res) => {
      if (!res.ok) {
        throw new Error('Session refresh failed')
      }
      try {
        return await res.json()
      } catch {
        return null
      }
    }).finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

async function apiRequest(path, options = {}) {
  const { method = 'GET', body, token, _retry = false } = options
  const headers = {}
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData

  if (body !== undefined && !isFormData) {
    headers['Content-Type'] = 'application/json'
  }
  if (shouldSendBearer(token)) {
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
    credentials: 'include',
    headers,
    body: body !== undefined ? (isFormData ? body : JSON.stringify(body)) : undefined,
  })

  if (res.status === 401 && !_retry && !path.startsWith('/api/auth/refresh') && !path.startsWith('/api/auth/verify-otp') && !path.startsWith('/api/auth/send-otp')) {
    try {
      await refreshAuthSession()
      return apiRequest(path, { ...options, _retry: true })
    } catch {
      notifyAuthExpired()
    }
  }

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

    if (res.status === 401) {
      notifyAuthExpired()
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

export async function apiDelete(path, options = {}) {
  return apiRequest(path, { ...options, method: 'DELETE' })
}
