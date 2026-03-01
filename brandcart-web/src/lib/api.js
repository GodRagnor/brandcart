const envBase = import.meta.env.VITE_API_BASE_URL?.trim() || ''
const API_BASE_URL = envBase.endsWith('/') ? envBase.slice(0, -1) : envBase

async function apiRequest(path, options = {}) {
  const { method = 'GET', body, token } = options
  const headers = {}

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const payload = await res.json()
      if (payload?.detail) {
        message = typeof payload.detail === 'string' ? payload.detail : JSON.stringify(payload.detail)
      } else if (payload?.message) {
        message = payload.message
      }
    } catch {
      message = `HTTP ${res.status}`
    }
    throw new Error(message)
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
