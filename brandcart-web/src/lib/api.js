const envBase = import.meta.env.VITE_API_BASE_URL?.trim() || ''
const API_BASE_URL = envBase.endsWith('/') ? envBase.slice(0, -1) : envBase

export async function apiGet(path) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }

  return res.json()
}
