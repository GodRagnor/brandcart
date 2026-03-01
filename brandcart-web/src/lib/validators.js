/**
 * Input validators for Brandcart
 */

/**
 * Validate card number using Luhn algorithm
 */
export function validateCardNumber(cardNumber) {
  const cleaned = String(cardNumber).replace(/\D/g, '')
  
  if (cleaned.length < 13 || cleaned.length > 19) {
    return { valid: false, error: 'Card number must be 13-19 digits' }
  }
  
  // Luhn algorithm
  let sum = 0
  let isEven = false
  
  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned[i], 10)
    
    if (isEven) {
      digit *= 2
      if (digit > 9) {
        digit -= 9
      }
    }
    
    sum += digit
    isEven = !isEven
  }
  
  return { valid: sum % 10 === 0, error: sum % 10 === 0 ? null : 'Invalid card number' }
}

/**
 * Validate card expiry date
 */
export function validateCardExpiry(expiry) {
  const match = String(expiry).match(/^(\d{1,2})\/(\d{2,4})$/)
  
  if (!match) {
    return { valid: false, error: 'Use MM/YY format' }
  }
  
  const month = parseInt(match[1], 10)
  const yearStr = match[2]
  const year = yearStr.length === 2 ? 2000 + parseInt(yearStr, 10) : parseInt(yearStr, 10)
  
  if (month < 1 || month > 12) {
    return { valid: false, error: 'Invalid month' }
  }
  
  const expDate = new Date(year, month - 1, 1)
  expDate.setMonth(expDate.getMonth() + 1)
  
  if (expDate < new Date()) {
    return { valid: false, error: 'Card expired' }
  }
  
  return { valid: true, error: null, month, year }
}

/**
 * Validate card CVV
 */
export function validateCardCVV(cvv) {
  const cleaned = String(cvv).replace(/\D/g, '')
  
  if (cleaned.length < 3 || cleaned.length > 4) {
    return { valid: false, error: 'CVV must be 3-4 digits' }
  }
  
  return { valid: true, error: null }
}

/**
 * Validate pincode (India)
 */
export function validatePincode(pincode) {
  const cleaned = String(pincode).replace(/\D/g, '')
  
  if (cleaned.length !== 6) {
    return { valid: false, error: 'Pincode must be 6 digits' }
  }
  
  return { valid: true, error: null }
}

/**
 * Validate password strength
 */
export function validatePasswordStrength(password) {
  const errors = []
  
  if (!password || password.length < 8) {
    errors.push('At least 8 characters')
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('At least one lowercase letter')
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('At least one uppercase letter')
  }
  
  if (!/\d/.test(password)) {
    errors.push('At least one number')
  }
  
  if (!/[!@#$%^&*()_+\-=[\]{};:'",.<>?/\\|`~]/.test(password)) {
    errors.push('At least one special character')
  }
  
  return {
    valid: errors.length === 0,
    score: 5 - errors.length,
    errors,
  }
}

/**
 * Validate product quantity
 */
export function validateQuantity(quantity, maxQuantity = 100) {
  const num = parseInt(quantity, 10)
  
  if (isNaN(num) || num < 1) {
    return { valid: false, error: 'Quantity must be at least 1' }
  }
  
  if (num > maxQuantity) {
    return { valid: false, error: `Quantity cannot exceed ${maxQuantity}` }
  }
  
  return { valid: true, error: null, quantity: num }
}

/**
 * Validate product price
 */
export function validatePrice(price) {
  const num = parseFloat(price)
  
  if (isNaN(num) || num < 0) {
    return { valid: false, error: 'Invalid price' }
  }
  
  // Max price: 99,99,999 (9,999,999 rupees)
  if (num > 9999999) {
    return { valid: false, error: 'Price too high' }
  }
  
  return { valid: true, error: null, price: num }
}

/**
 * Validate discount percentage
 */
export function validateDiscount(discount, maxDiscount = 100) {
  const num = parseInt(discount, 10)
  
  if (isNaN(num) || num < 0 || num > maxDiscount) {
    return { valid: false, error: `Discount must be 0-${maxDiscount}%` }
  }
  
  return { valid: true, error: null, discount: num }
}

/**
 * Sanitize product title/description
 */
export function sanitizeText(text, maxLength = 500) {
  if (typeof text !== 'string') {
    return ''
  }
  
  // Remove HTML tags and trim
  let clean = text.replace(/<[^>]*>/g, '').trim()
  
  // Truncate if too long
  if (clean.length > maxLength) {
    clean = clean.substring(0, maxLength - 3) + '...'
  }
  
  return clean
}

/**
 * Validate URL is safe (no javascript: or data: URIs)
 */
export function validateImageUrl(url) {
  if (typeof url !== 'string') {
    return { valid: false, error: 'Invalid URL' }
  }
  
  const lower = url.toLowerCase().trim()
  
  if (lower.startsWith('javascript:') || lower.startsWith('data:')) {
    return { valid: false, error: 'Invalid image URL' }
  }
  
  try {
    const parsed = new URL(lower, window.location.origin)
    if (!/^https?:/.test(parsed.protocol)) {
      return { valid: false, error: 'Only HTTP(S) URLs allowed' }
    }
    return { valid: true, error: null, url: parsed.href }
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }
}
