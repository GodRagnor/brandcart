/**
 * Security utilities for the Brandcart frontend
 */

/**
 * Custom hook for managing token with expiration
 * Tokens should ideally be stored in httpOnly cookies by the backend
 * This is a fallback for additional validation
 */
export function createTokenValidator() {
  const TOKEN_KEY = 'brandcartAuthToken'
  const TOKEN_EXPIRY_KEY = 'brandcartAuthTokenExpiry'
  
  const setToken = (token, expirySeconds = 3600) => {
    if (!token || typeof token !== 'string') {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(TOKEN_EXPIRY_KEY)
      return
    }
    
    localStorage.setItem(TOKEN_KEY, token)
    const expiryTime = Date.now() + (expirySeconds * 1000)
    localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString())
  }
  
  const getToken = () => {
    const token = localStorage.getItem(TOKEN_KEY)
    const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY)
    
    if (!token || !expiry) {
      return null
    }
    
    if (Date.now() > parseInt(expiry, 10)) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(TOKEN_EXPIRY_KEY)
      return null
    }
    
    return token
  }
  
  const clearToken = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_EXPIRY_KEY)
  }
  
  return { setToken, getToken, clearToken }
}

/**
 * Rate limiter for API calls
 */
export function createRateLimiter(maxRequests = 100, windowMs = 60000) {
  const requests = []
  
  return {
    isAllowed() {
      const now = Date.now()
      const cutoff = now - windowMs
      
      const recentRequests = requests.filter((time) => time > cutoff)
      requests.length = 0
      requests.push(...recentRequests, now)
      
      return recentRequests.length < maxRequests
    }
  }
}

/**
 * Input sanitizer for common XSS patterns
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return ''
  }
  
  const element = document.createElement('textarea')
  element.textContent = input
  return element.innerHTML
}

/**
 * Validate and sanitize email
 */
export function validateEmail(email) {
  const trimmed = String(email).trim().toLowerCase()
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(trimmed) ? trimmed : null
}

/**
 * Validate phone number (India specific)
 */
export function validatePhone(phone) {
  const cleaned = String(phone).replace(/\D/g, '')
  return cleaned.length === 10 ? cleaned : null
}

/**
 * Generate a secure random string for CSRF tokens
 */
export function generateSecureToken(length = 32) {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Hash function using SubtleCrypto (for client-side verification only)
 */
export async function hashString(str) {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Validate URLs to prevent open redirects
 */
export function isValidRedirectUrl(url, baseUrl = window.location.origin) {
  if (!url || typeof url !== 'string') {
    return false
  }
  
  try {
    const parsed = new URL(url, baseUrl)
    const base = new URL(baseUrl)
    return parsed.origin === base.origin
  } catch {
    return false
  }
}

/**
 * Clear sensitive data from localStorage on logout
 */
export function clearSensitiveData() {
  const sensitiveKeys = [
    'brandcartAuthToken',
    'brandcartAuthTokenExpiry',
    'brandcartAuthPhone',
    'brandcartAuthRole',
  ]
  
  sensitiveKeys.forEach(key => {
    localStorage.removeItem(key)
  })
}

/**
 * Detect and warn about storage quota issues
 */
export function checkStorageAvailability() {
  if (!navigator.storage?.estimate) {
    return true
  }
  
  return navigator.storage.estimate().then(({ usage, quota }) => {
    const percentUsed = (usage / quota) * 100
    if (percentUsed > 90) {
      console.warn(`Storage quota ${percentUsed.toFixed(1)}% full`)
    }
    return percentUsed < 95
  })
}
