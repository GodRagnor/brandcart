import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import './App.css'
import { apiDelete, apiGet, apiPatch, apiPost } from './lib/api'
import { createRateLimiter, validateEmail, validatePhone } from './lib/security'
import { validateQuantity, validatePrice, sanitizeText } from './lib/validators'
// buyer/seller dashboards have been merged into App.jsx; dashboard folder is no longer used

const categoryIcons = [
  { label: 'Mobiles', icon: 'mobiles', query: 'mobile' },
  { label: 'Electronics', icon: 'electronics', query: 'electronics' },
  { label: 'Fashion', icon: 'fashion', query: 'fashion' },
  { label: 'Home', icon: 'home', query: 'home' },
  { label: 'Beauty', icon: 'beauty', query: 'beauty' },
  { label: 'Appliances', icon: 'appliances', query: 'appliances' },
  { label: 'Grocery', icon: 'grocery', query: 'grocery' },
  { label: 'Furniture', icon: 'furniture', query: 'furniture' },
  { label: 'Sports', icon: 'sports', query: 'sports' },
  { label: 'Books', icon: 'books', query: 'books' },
  { label: 'Toys', icon: 'toys', query: 'toys' },
  { label: 'Deals', icon: 'deals', query: 'deals' },
]

const indiaStates = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
]

const readCartItems = () => {
  const raw = localStorage.getItem('brandcartCart')
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((item) => item && typeof item === 'object' && item.id)
  } catch {
    return []
  }
}

const readWishlistIds = () => {
  const raw = localStorage.getItem('brandcartWishlist')
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((id) => typeof id === 'string')
  } catch {
    return []
  }
}

const AUTH_TOKEN_KEY = 'brandcartAuthToken'
const AUTH_PHONE_KEY = 'brandcartAuthPhone'
const AUTH_ROLE_KEY = 'brandcartAuthRole'
const COOKIE_AUTH_TOKEN = '__cookie_session__'
const ACCOUNT_PROFILE_KEY = 'brandcartAccountProfile'
const LEGACY_ACCOUNT_CARDS_KEY = 'brandcartSavedCards'
const ACCOUNT_DEVICES_KEY = 'brandcartDeviceSessions'
const ACCOUNT_NOTIFICATIONS_KEY = 'brandcartNotificationPrefs'
const ACCOUNT_PRIVACY_KEY = 'brandcartPrivacyPrefs'
const ACCOUNT_QA_KEY = 'brandcartQaItems'
const ACCOUNT_REVIEWS_KEY = 'brandcartReviewDrafts'
const paymentOptions = [
  { id: 'RAZORPAY', title: 'UPI / Card / Wallet / NetBanking', subtitle: 'Secure online payment via Razorpay' },
  { id: 'COD', title: 'Cash on Delivery', subtitle: 'Pay when product is delivered' },
]
let razorpayCheckoutPromise = null

const readAuthToken = () => ''
const readAuthPhone = () => ''
const readAuthRole = () => 'buyer'
const readPortalMode = () => {
  const mode = new URLSearchParams(window.location.search).get('portal')
  return mode === 'seller' || mode === 'admin' || mode === 'delivery' ? mode : ''
}
const readStoredJson = (key, fallback) => {
  const raw = localStorage.getItem(key)
  if (!raw) {
    return fallback
  }
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.9',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

const getInitials = (name) => {
  if (!name || typeof name !== 'string') {
    return 'BR'
  }
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase() || '').join('') || 'BR'
}

// currency helper reused by seller dashboard
const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(value || 0)
}

const formatDateTime = (value) => {
  if (!value) {
    return '-'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }
  return date.toLocaleString()
}

const formatStatusText = (value) => {
  const text = String(value || '').trim()
  if (!text) {
    return '-'
  }
  return text
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const getStatusTone = (value) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (['delivered', 'approved', 'completed', 'paid'].includes(normalized)) {
    return 'positive'
  }
  if (['cancelled', 'rejected', 'failed', 'rto'].includes(normalized)) {
    return 'danger'
  }
  if (['requested', 'pending_manual_review', 'scheduled', 'picked_up', 'processing', 'delivery_otp_pending', 'out_for_delivery'].includes(normalized)) {
    return 'warning'
  }
  return 'neutral'
}

const buyerCancelReasonOptions = [
  { value: '', label: 'Reason optional' },
  { value: 'changed_mind', label: 'Changed my mind' },
  { value: 'ordered_by_mistake', label: 'Ordered by mistake' },
  { value: 'need_faster_delivery', label: 'Need faster delivery' },
  { value: 'price_issue', label: 'Found a better price' },
]

const buyerReturnReasonOptions = [
  { value: '', label: 'Choose return reason' },
  { value: 'damaged', label: 'Product arrived damaged' },
  { value: 'wrong_item', label: 'Wrong item received' },
  { value: 'defective', label: 'Product is defective' },
  { value: 'missing_item', label: 'Missing item or accessory' },
  { value: 'quality_issue', label: 'Quality not as expected' },
]

const buyerOrderStatusOptions = [
  { value: 'all', label: 'All orders' },
  { value: 'created', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivery_otp_pending', label: 'Delivery OTP pending' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'rto', label: 'RTO' },
  { value: 'return_requested', label: 'Return requested' },
  { value: 'return_approved', label: 'Return approved' },
  { value: 'refund_completed', label: 'Refund completed' },
  { value: 'cancellation_refund_pending', label: 'Cancellation refund pending' },
]

const createSellerVariantDraft = () => ({
  id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `variant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  label: 'Size',
  value: '',
  mrp: '',
  selling_price: '',
  stock: '',
  image: '',
  sku: '',
})

const getProductVariants = (product) => {
  if (!Array.isArray(product?.variants)) {
    return []
  }
  return product.variants.filter((variant) => variant && typeof variant === 'object' && variant.id)
}

const getVariantDisplayLabel = (variant) => {
  if (!variant || typeof variant !== 'object') {
    return 'Variant'
  }
  const label = String(variant.label || '').trim()
  const value = String(variant.value || '').trim()
  if (label && value) {
    return `${label}: ${value}`
  }
  return value || label || String(variant.name || 'Variant')
}

const getDefaultProductVariant = (product) => {
  const variants = getProductVariants(product)
  if (!variants.length) {
    return null
  }
  const preferredId = String(product?.selected_variant?.id || product?.default_variant?.id || '').trim()
  if (preferredId) {
    const matched = variants.find((variant) => String(variant?.id || '').trim() === preferredId)
    if (matched) {
      return matched
    }
  }
  return variants[0]
}

const getProductActiveOffer = (product) => {
  const offer = product?.active_offer
  if (!offer || typeof offer !== 'object') {
    return null
  }

  const offerPrice = Number(offer.offer_price)
  if (!Number.isFinite(offerPrice) || offerPrice <= 0) {
    return null
  }

  return {
    ...offer,
    id: String(offer.id || ''),
    offer_price: offerPrice,
    savings_amount: Number.isFinite(Number(offer.savings_amount)) ? Number(offer.savings_amount) : null,
    savings_percent: Number.isFinite(Number(offer.savings_percent)) ? Number(offer.savings_percent) : null,
  }
}

const resolveOfferReferencePrice = (mrp, basePrice) => {
  const parsedMrp = Number(mrp)
  const parsedBasePrice = Number(basePrice)
  const hasValidMrp = Number.isFinite(parsedMrp) && parsedMrp > 0
  const hasValidBasePrice = Number.isFinite(parsedBasePrice) && parsedBasePrice > 0

  if (hasValidMrp && hasValidBasePrice) {
    return Math.max(parsedMrp, parsedBasePrice)
  }
  if (hasValidMrp) {
    return parsedMrp
  }
  return hasValidBasePrice ? parsedBasePrice : null
}

const getProductPricingMeta = (product) => {
  const activeVariant = getDefaultProductVariant(product)
  const basePrice = Number(activeVariant?.selling_price ?? product?.selling_price)
  const mrp = Number(activeVariant?.mrp ?? product?.mrp)
  const activeOffer = getProductActiveOffer(product)
  const hasValidBasePrice = Number.isFinite(basePrice) && basePrice > 0
  const hasValidMrp = Number.isFinite(mrp) && mrp > 0
  const offerReferencePrice = resolveOfferReferencePrice(mrp, basePrice)
  const hasOffer = Boolean(activeOffer && hasValidBasePrice && activeOffer.offer_price < basePrice)
  const effectivePrice = hasOffer ? activeOffer.offer_price : (hasValidBasePrice ? basePrice : null)
  const comparePrice = hasOffer
    ? offerReferencePrice
    : (hasValidMrp && hasValidBasePrice && mrp > basePrice ? mrp : null)
  const hasComparePrice = Number.isFinite(comparePrice) && comparePrice > Number(effectivePrice || 0)
  const savingsAmount = hasComparePrice ? Math.max(0, Number(comparePrice) - Number(effectivePrice || 0)) : null
  const savingsPercent = hasComparePrice && Number(effectivePrice || 0) > 0
    ? Math.round((Number(savingsAmount || 0) / Number(comparePrice)) * 100)
    : null
  const discountBadgeLabel = hasComparePrice
    ? (Number.isFinite(Number(savingsPercent)) && Number(savingsPercent) > 0 ? `${Number(savingsPercent)}% off` : (activeOffer?.festival_name || 'Discount'))
    : null

  return {
    activeOffer: hasOffer ? activeOffer : null,
    activeVariant,
    basePrice: hasValidBasePrice ? basePrice : null,
    effectivePrice,
    comparePrice,
    hasComparePrice,
    savingsAmount,
    savingsPercent,
    discountBadgeLabel,
    mrp: hasValidMrp ? mrp : null,
  }
}

const buildCartItemFromProduct = (product, preferredImage = '') => {
  if (!product?.id) {
    return null
  }

  const pricing = getProductPricingMeta(product)
  const activeVariant = pricing.activeVariant
  const fallbackImage = Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : null
  const image = preferredImage || activeVariant?.image || fallbackImage || null
  const variantId = String(activeVariant?.id || '').trim()

  return {
    id: product.id,
    cart_key: variantId ? `${product.id}:${variantId}` : product.id,
    title: product.title,
    image,
    price: pricing.effectivePrice ?? Number(product?.selling_price || 0),
    base_price: pricing.activeOffer && pricing.hasComparePrice ? pricing.comparePrice : null,
    offer_id: pricing.activeOffer?.id || '',
    variant_id: variantId,
    variant_label: activeVariant ? getVariantDisplayLabel(activeVariant) : '',
    qty: 1,
  }
}

const buildCartEntryKey = (productId, variantId = '') => {
  const normalizedProductId = String(productId || '').trim()
  const normalizedVariantId = String(variantId || '').trim()
  if (!normalizedProductId) {
    return ''
  }
  return normalizedVariantId ? `${normalizedProductId}:${normalizedVariantId}` : normalizedProductId
}

const normalizeServerCartItems = (items) => (
  (Array.isArray(items) ? items : [])
    .map((item) => {
      const productId = String(item?.id || item?.product_id || '').trim()
      if (!productId) {
        return null
      }

      const variantId = String(item?.variant_id || '').trim()
      const qty = Math.max(1, Number.parseInt(item?.qty ?? item?.quantity ?? 1, 10) || 1)
      const parsedPrice = Number(item?.price ?? item?.unit_price ?? item?.selling_price ?? 0)
      const parsedBasePrice = Number(item?.base_price)
      const image = item?.image || (Array.isArray(item?.images) && item.images.length > 0 ? item.images[0] : null) || null

      return {
        id: productId,
        cart_key: String(item?.cart_key || buildCartEntryKey(productId, variantId)),
        title: item?.title || 'Product',
        image,
        price: Number.isFinite(parsedPrice) ? parsedPrice : 0,
        base_price: Number.isFinite(parsedBasePrice) ? parsedBasePrice : null,
        offer_id: String(item?.offer_id || '').trim(),
        variant_id: variantId,
        variant_label: String(item?.variant_label || '').trim(),
        qty,
      }
    })
    .filter(Boolean)
)

const buildCartSyncPayload = (items) => {
  const ordered = []
  const byKey = new Map()

  for (const item of (Array.isArray(items) ? items : [])) {
    const productId = String(item?.id || item?.product_id || '').trim()
    if (!productId) {
      continue
    }

    const variantId = String(item?.variant_id || '').trim()
    const key = buildCartEntryKey(productId, variantId)
    const quantity = Math.max(1, Number.parseInt(item?.qty ?? item?.quantity ?? 1, 10) || 1)
    const payload = {
      product_id: productId,
      quantity,
      ...(variantId ? { variant_id: variantId } : {}),
    }
    const offerId = String(item?.offer_id || '').trim()
    if (offerId) {
      payload.offer_id = offerId
    }

    if (!byKey.has(key)) {
      byKey.set(key, payload)
      ordered.push(key)
      continue
    }

    const existing = byKey.get(key)
    existing.quantity = quantity
    if (payload.offer_id) {
      existing.offer_id = payload.offer_id
    }
  }

  return ordered.map((key) => byKey.get(key)).filter(Boolean)
}

const buildWishlistSyncPayload = (ids) => {
  const ordered = []
  const seen = new Set()

  for (const value of (Array.isArray(ids) ? ids : [])) {
    const productId = String(value || '').trim()
    if (!productId || seen.has(productId)) {
      continue
    }
    seen.add(productId)
    ordered.push(productId)
  }

  return ordered
}

const mergeCartSyncPayloads = (serverPayload, localPayload) => {
  const ordered = []
  const byKey = new Map()
  const mergeItem = (item) => {
    const productId = String(item?.product_id || '').trim()
    if (!productId) {
      return
    }

    const variantId = String(item?.variant_id || '').trim()
    const key = buildCartEntryKey(productId, variantId)
    const quantity = Math.max(1, Number.parseInt(item?.quantity ?? 1, 10) || 1)
    if (!byKey.has(key)) {
      byKey.set(key, {
        product_id: productId,
        quantity,
        ...(variantId ? { variant_id: variantId } : {}),
        ...(item?.offer_id ? { offer_id: item.offer_id } : {}),
      })
      ordered.push(key)
      return
    }

    const existing = byKey.get(key)
    existing.quantity = Math.max(existing.quantity || 1, quantity)
    if (!existing.offer_id && item?.offer_id) {
      existing.offer_id = item.offer_id
    }
  }

  ;(Array.isArray(serverPayload) ? serverPayload : []).forEach(mergeItem)
  ;(Array.isArray(localPayload) ? localPayload : []).forEach(mergeItem)

  return ordered.map((key) => byKey.get(key)).filter(Boolean)
}

const mergeWishlistSyncPayloads = (serverIds, localIds) => (
  buildWishlistSyncPayload([
    ...(Array.isArray(serverIds) ? serverIds : []),
    ...(Array.isArray(localIds) ? localIds : []),
  ])
)

const buildCollectionsSyncSignature = (cartPayload, wishlistPayload) => JSON.stringify({
  cart: [...(Array.isArray(cartPayload) ? cartPayload : [])].sort((left, right) => (
    buildCartEntryKey(left?.product_id, left?.variant_id).localeCompare(buildCartEntryKey(right?.product_id, right?.variant_id))
  )),
  wishlist: [...(Array.isArray(wishlistPayload) ? wishlistPayload : [])].sort(),
})

const normalizeOrderStatus = (value) => String(value || '').trim().toLowerCase()

const buildOrderTrackingTimeline = (order) => {
  const status = normalizeOrderStatus(order?.status)
  const trackingRows = Array.isArray(order?.tracking) ? order.tracking : []
  const findTrackingAt = (codes) => {
    const hit = trackingRows.find((row) => codes.includes(String(row?.status || '').trim().toUpperCase()))
    return hit?.at || null
  }

  const shippedAt = findTrackingAt(['SHIPPED', 'ORDER_SHIPPED'])
  const outForDeliveryAt = findTrackingAt(['OUT_FOR_DELIVERY', 'DELIVERY_OTP_GENERATED']) || order?.delivery_otp_generated_at || null
  const deliveredAt = findTrackingAt(['DELIVERED', 'ORDER_DELIVERED']) || order?.delivered_at || null

  const shippedDone = ['shipped', 'delivery_otp_pending', 'out_for_delivery', 'delivered', 'rto'].includes(status) || Boolean(shippedAt)
  const outForDeliveryDone = ['delivery_otp_pending', 'out_for_delivery', 'delivered'].includes(status) || Boolean(outForDeliveryAt)
  const deliveredDone = status === 'delivered' || Boolean(deliveredAt)

  const steps = [
    { event: 'ORDERED', label: 'Ordered', created_at: order?.created_at || null, done: true },
    { event: 'SHIPPED', label: 'Shipped', created_at: shippedAt || null, done: shippedDone },
    { event: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', created_at: outForDeliveryAt || null, done: outForDeliveryDone },
    { event: 'DELIVERED', label: 'Delivered', created_at: deliveredAt || null, done: deliveredDone },
  ].filter((step) => step.done || step.created_at)

  if (status === 'rto') {
    steps.push({
      event: 'RTO',
      label: 'Returned To Origin',
      created_at: order?.updated_at || null,
      done: true,
    })
  }

  if (status === 'cancelled') {
    steps.push({
      event: 'CANCELLED',
      label: 'Cancelled',
      created_at: order?.cancellation?.requested_at || order?.updated_at || null,
      done: true,
    })
  }

  const returnStatus = normalizeOrderStatus(order?.return?.status)
  if (returnStatus === 'requested') {
    steps.push({ event: 'RETURN_REQUESTED', label: 'Return Requested', created_at: order?.updated_at || null, done: true })
  } else if (returnStatus === 'approved') {
    steps.push({ event: 'RETURN_APPROVED', label: 'Return Approved', created_at: order?.updated_at || null, done: true })
  } else if (returnStatus === 'rejected') {
    steps.push({ event: 'RETURN_REJECTED', label: 'Return Rejected', created_at: order?.updated_at || null, done: true })
  }

  const pickupStatus = normalizeOrderStatus(order?.return?.pickup_status)
  if (pickupStatus === 'scheduled') {
    steps.push({
      event: 'RETURN_PICKUP_SCHEDULED',
      label: 'Pickup Scheduled',
      created_at: order?.return?.pickup_at || order?.updated_at || null,
      done: true,
    })
  } else if (pickupStatus === 'picked_up') {
    steps.push({
      event: 'RETURN_PICKED_UP',
      label: 'Product Picked Up',
      created_at: order?.return?.pickup_completed_at || order?.updated_at || null,
      done: true,
    })
  }

  if (normalizeOrderStatus(order?.return?.refund_status) === 'completed') {
    steps.push({ event: 'REFUND_COMPLETED', label: 'Refund Completed', created_at: order?.updated_at || null, done: true })
  }

  if (normalizeOrderStatus(order?.cancellation?.refund_status) === 'completed') {
    steps.push({
      event: 'CANCELLATION_REFUND_COMPLETED',
      label: 'Cancellation Refund Completed',
      created_at: order?.cancellation?.refunded_at || order?.updated_at || null,
      done: true,
    })
  }

  return steps
}

const summarizeReviews = (payload) => {
  const reviews = Array.isArray(payload?.reviews) ? payload.reviews : []
  const count = Number.isFinite(Number(payload?.count)) ? Number(payload.count) : reviews.length

  if (!reviews.length) {
    return { count, average: null, reviews: [] }
  }

  const total = reviews.reduce((sum, review) => {
    const value = Number(review?.rating)
    return Number.isFinite(value) ? sum + value : sum
  }, 0)
  const average = total > 0 ? total / reviews.length : null

  return {
    count,
    average: average ? Number(average.toFixed(1)) : null,
    reviews,
  }
}

function CategoryIcon({ icon }) {
  if (icon === 'mobiles') {
    return (
      <svg {...iconProps}>
        <rect x="7" y="3" width="10" height="18" rx="2.2" />
        <path d="M10 6h4M11 18h2" />
      </svg>
    )
  }
  if (icon === 'electronics') {
    return (
      <svg {...iconProps}>
        <rect x="3.5" y="5" width="17" height="11" rx="2.2" />
        <path d="M9.5 19h5M12 16v3" />
      </svg>
    )
  }
  if (icon === 'fashion') {
    return (
      <svg {...iconProps}>
        <path d="m9 4 3-2 3 2 2.3-.8 1.2 3-2 1.8V20h-9V8l-2-1.8 1.2-3z" />
      </svg>
    )
  }
  if (icon === 'home') {
    return (
      <svg {...iconProps}>
        <path d="M3.8 10.3 12 3l8.2 7.3" />
        <path d="M6.8 9.8V20h10.4V9.8" />
        <path d="M10.3 20v-5h3.4v5" />
      </svg>
    )
  }
  if (icon === 'beauty') {
    return (
      <svg {...iconProps}>
        <path d="m8.5 4.2 7.3 7.3-4.8 4.8-7.3-7.3z" />
        <path d="M15.8 4.4 19.2 7.8M13.2 13.6 17.5 18" />
      </svg>
    )
  }
  if (icon === 'appliances') {
    return (
      <svg {...iconProps}>
        <rect x="6.1" y="3.2" width="11.8" height="17.6" rx="2.1" />
        <circle cx="12" cy="12.2" r="3.5" />
        <path d="M9.4 6.8h.01M14.6 6.8h.01" />
      </svg>
    )
  }
  if (icon === 'furniture') {
    return (
      <svg {...iconProps}>
        <rect x="5.5" y="8" width="13" height="6" rx="1.6" />
        <path d="M7 14v5M17 14v5M5.5 10.5H3.8M20.2 10.5h-1.7" />
      </svg>
    )
  }
  if (icon === 'grocery') {
    return (
      <svg {...iconProps}>
        <circle cx="9.2" cy="19" r="1.2" />
        <circle cx="16.8" cy="19" r="1.2" />
        <path d="M3.4 5.2h2.3l1.9 10h9.1l1.8-6.6H7.5" />
      </svg>
    )
  }
  if (icon === 'sports') {
    return (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="7.5" />
        <path d="M7.8 8.7c1.6 1.1 3.2 1.1 4.8 0 1.6-1.1 3.2-1.1 4.8 0M7.8 15.3c1.6-1.1 3.2-1.1 4.8 0 1.6 1.1 3.2 1.1 4.8 0" />
      </svg>
    )
  }
  if (icon === 'books') {
    return (
      <svg {...iconProps}>
        <path d="M5.2 5.5h5.5a2.3 2.3 0 0 1 2.3 2.3v11H7.5a2.3 2.3 0 0 0-2.3 2.3z" />
        <path d="M18.8 5.5h-5.5A2.3 2.3 0 0 0 11 7.8v11h5.5a2.3 2.3 0 0 1 2.3 2.3z" />
      </svg>
    )
  }
  if (icon === 'toys') {
    return (
      <svg {...iconProps}>
        <circle cx="9" cy="9" r="3" />
        <circle cx="15" cy="9" r="3" />
        <path d="M8 14.5h8l-1.3 5h-5.4z" />
      </svg>
    )
  }
  return (
    <svg {...iconProps}>
      <path d="m10 3 10 10-7 7L3 10V3z" />
      <circle cx="7.8" cy="7.8" r="1.1" />
    </svg>
  )
}

function FooterNavIcon({ icon }) {
  if (icon === 'home') {
    return (
      <svg {...iconProps}>
        <path d="M3.8 10.3 12 3l8.2 7.3" />
        <path d="M6.8 9.8V20h10.4V9.8" />
      </svg>
    )
  }
  if (icon === 'wishlist') {
    return (
      <svg {...iconProps}>
        <path d="M12 20s-6.8-4.4-8.8-8.2C1.8 9.3 3 6.3 5.8 5.4c2-.6 3.8.1 5.1 1.6 1.3-1.5 3.1-2.2 5.1-1.6 2.8.9 4 3.9 2.6 6.4C18.8 15.6 12 20 12 20z" />
      </svg>
    )
  }
  if (icon === 'orders') {
    return (
      <svg {...iconProps}>
        <rect x="4.5" y="4" width="15" height="16" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    )
  }
  if (icon === 'categories') {
    return (
      <svg {...iconProps}>
        <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" />
        <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" />
        <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" />
        <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" />
      </svg>
    )
  }
  if (icon === 'cart') {
    return (
      <svg {...iconProps}>
        <circle cx="9.2" cy="19" r="1.2" />
        <circle cx="16.8" cy="19" r="1.2" />
        <path d="M3.4 5.2h2.3l1.9 10h9.1l1.8-6.6H7.5" />
      </svg>
    )
  }
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8.2" r="3.3" />
      <path d="M5.8 20c.8-3.4 2.9-5.1 6.2-5.1 3.3 0 5.4 1.7 6.2 5.1" />
    </svg>
  )
}

function AccountMenuIcon({ type }) {
  if (type === 'plus') {
    return (
      <svg {...iconProps}>
        <path d="M12 4.5 13.7 8.3 17.8 10l-4.1 1.7L12 15.5l-1.7-3.8L6.2 10l4.1-1.7z" />
      </svg>
    )
  }
  if (type === 'device') {
    return (
      <svg {...iconProps}>
        <rect x="7.2" y="3.4" width="9.6" height="17.2" rx="2" />
        <path d="M10 6h4M11 18h2" />
      </svg>
    )
  }
  if (type === 'profile') {
    return (
      <svg {...iconProps}>
        <circle cx="12" cy="8.2" r="3.1" />
        <path d="M5.8 19.5c.9-3.3 3-5 6.2-5s5.3 1.7 6.2 5" />
      </svg>
    )
  }
  if (type === 'cards') {
    return (
      <svg {...iconProps}>
        <rect x="4" y="6.2" width="16" height="11.6" rx="2" />
        <path d="M4 10h16M7.4 14.2h4.4" />
      </svg>
    )
  }
  if (type === 'address') {
    return (
      <svg {...iconProps}>
        <path d="M12 20s6-5 6-10a6 6 0 0 0-12 0c0 5 6 10 6 10z" />
        <circle cx="12" cy="10" r="1.9" />
      </svg>
    )
  }
  if (type === 'language') {
    return (
      <svg {...iconProps}>
        <path d="M6 6h6M9 6v10M5.5 11h6.5M14.5 8h4M18.5 8v8M14.5 16h4" />
      </svg>
    )
  }
  if (type === 'notification') {
    return (
      <svg {...iconProps}>
        <path d="M8 10a4 4 0 1 1 8 0v3.6l1.6 1.8H6.4L8 13.6z" />
        <path d="M10.3 18a1.7 1.7 0 0 0 3.4 0" />
      </svg>
    )
  }
  if (type === 'privacy') {
    return (
      <svg {...iconProps}>
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V8a4 4 0 0 1 8 0v2M12 14v2.8" />
      </svg>
    )
  }
  if (type === 'reviews') {
    return (
      <svg {...iconProps}>
        <path d="M5 6h10v12H5zM15 10l4-4M9 10h3M9 13h3" />
      </svg>
    )
  }
  if (type === 'qa') {
    return (
      <svg {...iconProps}>
        <path d="M4 6h10v8H8l-4 3zM20 9v8h-6l-4 3" />
      </svg>
    )
  }
  if (type === 'wishlist') {
    return (
      <svg {...iconProps}>
        <path d="M12 20s-6.8-4.4-8.8-8.2C1.8 9.3 3 6.3 5.8 5.4c2-.6 3.8.1 5.1 1.6 1.3-1.5 3.1-2.2 5.1-1.6 2.8.9 4 3.9 2.6 6.4C18.8 15.6 12 20 12 20z" />
      </svg>
    )
  }
  if (type === 'seller') {
    return (
      <svg {...iconProps}>
        <path d="M4.8 9h14.4l-1.2 10.2H6zM4 9l1.7-4h12.6L20 9M9 13h6" />
      </svg>
    )
  }
  if (type === 'admin') {
    return (
      <svg {...iconProps}>
        <path d="M12 3 4.8 6.1v5.2c0 4.8 3 7.8 7.2 9.7 4.2-1.9 7.2-4.9 7.2-9.7V6.1z" />
        <path d="m9.6 12 1.7 1.8 3.3-3.6" />
      </svg>
    )
  }
  if (type === 'docs') {
    return (
      <svg {...iconProps}>
        <path d="M7 4h8l3 3v13H7zM15 4v3h3M10 12h5M10 15h5" />
      </svg>
    )
  }
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 9.2v5.4M12 17.2h.01" />
    </svg>
  )
}

// Rate limiter for OTP requests (max 5 per minute)
const otpRateLimiter = createRateLimiter(5, 60000)

function App() {
  const [searchText, setSearchText] = useState('')
  const [searchSuggestions, setSearchSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [products, setProducts] = useState([])
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
  const [productsError, setProductsError] = useState('')
  const [offerHighlights, setOfferHighlights] = useState([])
  const [isLoadingOfferHighlights, setIsLoadingOfferHighlights] = useState(false)
  const [offerHighlightsError, setOfferHighlightsError] = useState('')

  const [activeProductId, setActiveProductId] = useState('')
  const [activeProductSummary, setActiveProductSummary] = useState(null)
  const [productDetail, setProductDetail] = useState(null)
  const [selectedImage, setSelectedImage] = useState('')
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState('')

  const [productReviews, setProductReviews] = useState({ count: 0, average: null, reviews: [] })
  const [isLoadingReviews, setIsLoadingReviews] = useState(false)
  const [productQuestions, setProductQuestions] = useState([])
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false)
  const [questionInput, setQuestionInput] = useState('')
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false)

  const [sellerProfile, setSellerProfile] = useState(null)
  const [similarProducts, setSimilarProducts] = useState([])
  const [isLoadingSimilar, setIsLoadingSimilar] = useState(false)

  const [cartNotice, setCartNotice] = useState('')
  const [wishlistIds, setWishlistIds] = useState(readWishlistIds)
  const [cartItems, setCartItems] = useState(readCartItems)
  const [wishlistItems, setWishlistItems] = useState([])
  const [isLoadingWishlistItems, setIsLoadingWishlistItems] = useState(false)
  const [activeQuickPanel, setActiveQuickPanel] = useState('')
  const [isCategoryView, setIsCategoryView] = useState(false)
  const [activeCategoryQuery, setActiveCategoryQuery] = useState('mobile')
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [accountLanguage, setAccountLanguage] = useState('English')
  const [authToken, setAuthToken] = useState(readAuthToken)
  const [isRestoringSession, setIsRestoringSession] = useState(true)
  const [userPhone, setUserPhone] = useState(readAuthPhone)
  const [userRole, setUserRole] = useState(readAuthRole)
  const [portalMode, setPortalMode] = useState(readPortalMode)
  const [authPhoneInput, setAuthPhoneInput] = useState('')
  const [authOtpInput, setAuthOtpInput] = useState('')
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [isOtpSent, setIsOtpSent] = useState(false)
  const [checkoutPending, setCheckoutPending] = useState(false)
  const [checkoutFlow, setCheckoutFlow] = useState(null)
  const [buyNowItem, setBuyNowItem] = useState(null)
  const [addresses, setAddresses] = useState([])
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false)
  const [isSavingAddress, setIsSavingAddress] = useState(false)
  const [selectedCheckoutAddress, setSelectedCheckoutAddress] = useState(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('RAZORPAY')
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [buyerOrders, setBuyerOrders] = useState([])
  const [isLoadingBuyerOrders, setIsLoadingBuyerOrders] = useState(false)
  const [buyerOrderStatusFilter, setBuyerOrderStatusFilter] = useState('all')
  const [buyerOrderTimeline, setBuyerOrderTimeline] = useState([])
  const [isLoadingBuyerTimeline, setIsLoadingBuyerTimeline] = useState(false)
  const [activeBuyerTimelineOrderId, setActiveBuyerTimelineOrderId] = useState('')
  const [buyerUpdatingOrderActionId, setBuyerUpdatingOrderActionId] = useState('')
  const [buyerCancelReasonDrafts, setBuyerCancelReasonDrafts] = useState({})
  const [buyerReturnReasonDrafts, setBuyerReturnReasonDrafts] = useState({})
  const [deliveryPincode, setDeliveryPincode] = useState('')
  const [isCheckingDelivery, setIsCheckingDelivery] = useState(false)
  const [deliveryCheck, setDeliveryCheck] = useState({
    checked: false,
    deliverable: null,
    codAvailable: null,
    reason: '',
    estimatedDays: null,
    requiresAddressConfirmation: false,
  })
  const [accountView, setAccountView] = useState('menu')
  const [accountMenuQuery, setAccountMenuQuery] = useState('')
  const [profileForm, setProfileForm] = useState(() => readStoredJson(ACCOUNT_PROFILE_KEY, {
    fullName: '',
    email: '',
    gender: 'Prefer not to say',
  }))
  const [deviceSessions, setDeviceSessions] = useState(() => readStoredJson(ACCOUNT_DEVICES_KEY, []))
  const [notificationPrefs, setNotificationPrefs] = useState(() => readStoredJson(ACCOUNT_NOTIFICATIONS_KEY, {
    orderUpdates: true,
    promotions: true,
    priceAlerts: true,
  }))
  const [privacyPrefs, setPrivacyPrefs] = useState(() => readStoredJson(ACCOUNT_PRIVACY_KEY, {
    personalizedAds: true,
    usageAnalytics: true,
    savedSearches: true,
  }))
  const [qaItems, setQaItems] = useState(() => readStoredJson(ACCOUNT_QA_KEY, []))
  const [qaInput, setQaInput] = useState('')
  const [reviewDrafts, setReviewDrafts] = useState(() => readStoredJson(ACCOUNT_REVIEWS_KEY, []))
  const [reviewInput, setReviewInput] = useState('')
  const [sellerRequestForm, setSellerRequestForm] = useState({
    legal_name: '',
    brand_name: '',
    category: '',
    description: '',
    email: '',
    pan_card: '',
    gst_certificate: '',
    address_proof: '',
    logo_url: '',
  })
  const [isSubmittingSellerRequest, setIsSubmittingSellerRequest] = useState(false)
  const [sellerOnboarding, setSellerOnboarding] = useState({
    status: 'none',
    requestedAt: '',
    rejectedAt: '',
    rejectedReason: '',
    request: null,
  })
  const [isLoadingSellerOnboarding, setIsLoadingSellerOnboarding] = useState(false)

  // ----- seller dashboard state (moved from separate component) -----
  const [sellerActiveSection, setSellerActiveSection] = useState('overview')
  const [sellerPerformance, setSellerPerformance] = useState(null)
  const [sellerProducts, setSellerProducts] = useState([])
  const [sellerWallet, setSellerWallet] = useState(null)
  const [sellerDashboardProfile, setSellerDashboardProfile] = useState(null)
  const [sellerServiceableRegions, setSellerServiceableRegions] = useState([])
  const [sellerAllIndia, setSellerAllIndia] = useState(false)
  const [sellerOffers, setSellerOffers] = useState([])
  const [isLoadingSellerData, setIsLoadingSellerData] = useState(false)
  const [sellerDataError, setSellerDataError] = useState('')
  const [isLoadingSellerOffers, setIsLoadingSellerOffers] = useState(false)
  const [sellerProfileForm, setSellerProfileForm] = useState({
    support_email: '',
    short_tagline: '',
    logo_url: '',
    description: '',
  })
  const [isSavingSellerProfile, setIsSavingSellerProfile] = useState(false)
  const [sellerLogoFile, setSellerLogoFile] = useState(null)
  const [isUploadingSellerLogo, setIsUploadingSellerLogo] = useState(false)
  const [sellerDocumentsForm, setSellerDocumentsForm] = useState({
    pan_card: '',
    gst_certificate: '',
    address_proof: '',
  })
  const [isSubmittingSellerDocuments, setIsSubmittingSellerDocuments] = useState(false)
  const [isSavingSellerAllIndia, setIsSavingSellerAllIndia] = useState(false)
  const [sellerRegionForm, setSellerRegionForm] = useState({ state: '', city: '', cod_enabled: false })
  const [isSavingSellerRegions, setIsSavingSellerRegions] = useState(false)
  const [isEnablingSellerCod, setIsEnablingSellerCod] = useState(false)
  const [sellerCreateProductForm, setSellerCreateProductForm] = useState({
    title: '',
    description: '',
    category: '',
    sub_category: '',
    tags: '',
    mrp: '',
    selling_price: '',
    stock: '',
    images: '',
  })
  const [sellerProductVariants, setSellerProductVariants] = useState([])
  const [isCreatingSellerProduct, setIsCreatingSellerProduct] = useState(false)
  const [sellerProductUploadFiles, setSellerProductUploadFiles] = useState([])
  const [isUploadingSellerProductImages, setIsUploadingSellerProductImages] = useState(false)
  const [sellerOfferForm, setSellerOfferForm] = useState({
    product_id: '',
    offer_price: '',
    start_at: '',
    end_at: '',
    festival_slug: '',
  })
  const [isCreatingSellerOffer, setIsCreatingSellerOffer] = useState(false)
  const [sellerUpdatingOfferId, setSellerUpdatingOfferId] = useState('')
  const [sellerPayoutForm, setSellerPayoutForm] = useState({
    amount: '',
    account_holder_name: '',
    bank_account_number: '',
    ifsc_code: '',
    bank_name: '',
  })
  const [isRequestingEmergencyPayout, setIsRequestingEmergencyPayout] = useState(false)
  const [sellerSavedBankAccount, setSellerSavedBankAccount] = useState(null)
  const [sellerBankAccountForm, setSellerBankAccountForm] = useState({
    account_holder_name: '',
    bank_account_number: '',
    ifsc_code: '',
    bank_name: '',
  })
  const [isSavingSellerBankAccount, setIsSavingSellerBankAccount] = useState(false)
  const [useSavedBankForPayout, setUseSavedBankForPayout] = useState(true)
  const [sellerOrderOps, setSellerOrderOps] = useState({
    order_id: '',
    return_action: 'accept',
  })
  const [sellerOrders, setSellerOrders] = useState([])
  const [sellerOrderStatusFilter, setSellerOrderStatusFilter] = useState('all')
  const [isLoadingSellerOrders, setIsLoadingSellerOrders] = useState(false)
  const [sellerOrderTimeline, setSellerOrderTimeline] = useState([])
  const [sellerShippingPartners, setSellerShippingPartners] = useState([])
  const [sellerPartnerSelections, setSellerPartnerSelections] = useState({})
  const [sellerShipmentDrafts, setSellerShipmentDrafts] = useState({})
  const [sellerAssigningPartnerOrderId, setSellerAssigningPartnerOrderId] = useState('')
  const [sellerUpdatingShipmentStatusOrderId, setSellerUpdatingShipmentStatusOrderId] = useState('')
  const [sellerNotifications, setSellerNotifications] = useState([])
  const [deliveryPartnerOrders, setDeliveryPartnerOrders] = useState([])
  const [deliveryPartnerOrderStatusFilter, setDeliveryPartnerOrderStatusFilter] = useState('all')
  const [isLoadingDeliveryPartnerOrders, setIsLoadingDeliveryPartnerOrders] = useState(false)
  const [deliveryPartnerMarkingOrderId, setDeliveryPartnerMarkingOrderId] = useState('')
  const [deliveryPartnerOtpInputs, setDeliveryPartnerOtpInputs] = useState({})
  const [deliveryPartnerCompletingOrderId, setDeliveryPartnerCompletingOrderId] = useState('')
  const [isSubmittingSellerOrderAction, setIsSubmittingSellerOrderAction] = useState(false)
  const [isLoadingSellerTimeline, setIsLoadingSellerTimeline] = useState(false)
  const [adminSellerRequests, setAdminSellerRequests] = useState([])
  const [isLoadingAdminSellerRequests, setIsLoadingAdminSellerRequests] = useState(false)
  const [adminUpdatingSellerId, setAdminUpdatingSellerId] = useState('')
  const [adminRejectReasons, setAdminRejectReasons] = useState({})
  const [adminActiveSellers, setAdminActiveSellers] = useState([])
  const [isLoadingAdminActiveSellers, setIsLoadingAdminActiveSellers] = useState(false)
  const [adminSellerRanking, setAdminSellerRanking] = useState([])
  const [isLoadingAdminSellerRanking, setIsLoadingAdminSellerRanking] = useState(false)
  const [adminRiskDashboard, setAdminRiskDashboard] = useState(null)
  const [isLoadingAdminRiskDashboard, setIsLoadingAdminRiskDashboard] = useState(false)
  const [adminFinanceSummary, setAdminFinanceSummary] = useState(null)
  const [isLoadingAdminFinanceSummary, setIsLoadingAdminFinanceSummary] = useState(false)
  const [adminOrderSummary, setAdminOrderSummary] = useState(null)
  const [isLoadingAdminOrderSummary, setIsLoadingAdminOrderSummary] = useState(false)
  const [adminOrderCareCases, setAdminOrderCareCases] = useState(null)
  const [isLoadingAdminOrderCareCases, setIsLoadingAdminOrderCareCases] = useState(false)
  const [adminPayoutRequests, setAdminPayoutRequests] = useState([])
  const [adminPayoutStatusFilter, setAdminPayoutStatusFilter] = useState('')
  const [isLoadingAdminPayoutRequests, setIsLoadingAdminPayoutRequests] = useState(false)
  const [adminPayoutDecisionReasons, setAdminPayoutDecisionReasons] = useState({})
  const [adminUpdatingPayoutId, setAdminUpdatingPayoutId] = useState('')
  const [adminFreezeReasons, setAdminFreezeReasons] = useState({})
  const [adminUpdatingSellerActionId, setAdminUpdatingSellerActionId] = useState('')
  const [adminRiskSnapshots, setAdminRiskSnapshots] = useState({})
  const [adminLoadingRiskSellerId, setAdminLoadingRiskSellerId] = useState('')
  const [adminOffersSummary, setAdminOffersSummary] = useState(null)
  const [isLoadingAdminOffersSummary, setIsLoadingAdminOffersSummary] = useState(false)
  const [adminUpdatingOrderCareId, setAdminUpdatingOrderCareId] = useState('')
  const [commissionInput, setCommissionInput] = useState('')
  const [isUpdatingCommission, setIsUpdatingCommission] = useState(false)
  const [festivalForm, setFestivalForm] = useState({
    slug: '',
    name: '',
    start_at: '',
    end_at: '',
    eligible_tiers: 'verified_fast',
  })
  const [isCreatingFestival, setIsCreatingFestival] = useState(false)
  const hasHydratedSyncedCollectionsRef = useRef(false)
  const syncedCollectionsSignatureRef = useRef('')
  const collectionSyncNoticeRef = useRef(false)
  const collectionSyncRequestIdRef = useRef(0)
  const [addressForm, setAddressForm] = useState({
    name: '',
    phone: '',
    line1: '',
    city: '',
    state: '',
    pincode: '',
    is_default: false,
  })
  const isLoggedIn = Boolean(authToken)
  const isAdminPortal = portalMode === 'admin'
  const isSellerPortal = portalMode === 'seller'
  const isDeliveryPortal = portalMode === 'delivery'
  const hasSellerPortalAccess = isLoggedIn && (userRole === 'seller' || sellerOnboarding.status === 'verified')
  const hasAdminPortalAccess = isLoggedIn && userRole === 'admin'
  const hasDeliveryPortalAccess = isLoggedIn && userRole === 'delivery_partner'

  const sellerProductFilePreviews = useMemo(
    () => sellerProductUploadFiles.map((file, index) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
      name: file.name,
      url: URL.createObjectURL(file),
    })),
    [sellerProductUploadFiles],
  )

  useEffect(() => {
    return () => {
      sellerProductFilePreviews.forEach((item) => URL.revokeObjectURL(item.url))
    }
  }, [sellerProductFilePreviews])

  const syncSellerShipmentState = (orders) => {
    const nextOrders = Array.isArray(orders) ? orders : []
    setSellerPartnerSelections((prev) => {
      const next = { ...(prev || {}) }
      nextOrders.forEach((order) => {
        const orderId = String(order?.id || '').trim()
        const partnerId = String(order?.shipping?.partner_id || '').trim()
        if (orderId && partnerId && !next[orderId]) {
          next[orderId] = partnerId
        }
      })
      return next
    })
    setSellerShipmentDrafts((prev) => {
      const next = { ...(prev || {}) }
      nextOrders.forEach((order) => {
        const orderId = String(order?.id || '').trim()
        if (!orderId) {
          return
        }
        if (next[orderId]) {
          return
        }
        next[orderId] = {
          tracking_number: String(order?.shipping?.tracking_number || '').trim(),
          tracking_url: String(order?.shipping?.tracking_url || '').trim(),
        }
      })
      return next
    })
  }

  const buildLocalSuggestions = (query) => {
    const needle = query.trim().toLowerCase()
    if (!needle || needle.length < 2) {
      return []
    }

    const candidates = [
      ...(Array.isArray(products) ? products : []),
      ...(Array.isArray(similarProducts) ? similarProducts : []),
      ...(productDetail ? [productDetail] : []),
      ...(activeProductSummary ? [activeProductSummary] : []),
    ]

    const unique = []
    const seen = new Set()

    for (const item of candidates) {
      if (!item || typeof item !== 'object') {
        continue
      }

      const key = item.id || item.title
      if (!key || seen.has(key)) {
        continue
      }

      const haystack = [item.title, item.category, item.sub_category]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      if (haystack.includes(needle)) {
        seen.add(key)
        unique.push(item)
      }

      if (unique.length >= 8) {
        break
      }
    }

    return unique
  }

  const buildLocalSuggestionsEffect = useEffectEvent((query) => buildLocalSuggestions(query))

  const attachReviewStats = async (items) => {
    const safeItems = Array.isArray(items) ? items : []
    const enriched = await Promise.all(safeItems.map(async (item) => {
      if (!item?.id) {
        return { ...item, review_count: 0, review_average: null }
      }
      try {
        const response = await apiGet(`/api/reviews/product/${item.id}`)
        const summary = summarizeReviews(response)
        return {
          ...item,
          review_count: summary.count,
          review_average: summary.average,
        }
      } catch {
        return { ...item, review_count: 0, review_average: null }
      }
    }))
    return enriched
  }

  const loadProducts = async (search = '') => {
    setIsLoadingProducts(true)
    setProductsError('')
    const trimmedSearch = search.trim()
    const shouldLoadHighlights = !trimmedSearch

    if (shouldLoadHighlights) {
      setIsLoadingOfferHighlights(true)
      setOfferHighlightsError('')
    } else {
      setOfferHighlights([])
      setOfferHighlightsError('')
      setIsLoadingOfferHighlights(false)
    }

    try {
      const path = trimmedSearch
        ? `/api/products?search=${encodeURIComponent(trimmedSearch)}`
        : '/api/products/trending?limit=24'

      const [data, highlightData] = await Promise.all([
        apiGet(path),
        shouldLoadHighlights
          ? apiGet('/api/products/offer-highlights?limit=6').catch((error) => ({ __error: error }))
          : Promise.resolve(null),
      ])
      const list = Array.isArray(data) ? data : []
      const withReviews = await attachReviewStats(list)
      setProducts(withReviews)

      if (shouldLoadHighlights) {
        if (highlightData?.__error) {
          setOfferHighlights([])
          setOfferHighlightsError(highlightData.__error instanceof Error ? highlightData.__error.message : 'Failed to load live offers')
        } else {
          setOfferHighlights(Array.isArray(highlightData?.highlights) ? highlightData.highlights : [])
          setOfferHighlightsError('')
        }
      }
    } catch (error) {
      setProducts([])
      setProductsError(error instanceof Error ? error.message : 'Failed to load products')
      if (shouldLoadHighlights) {
        setOfferHighlights([])
      }
    } finally {
      setIsLoadingProducts(false)
      if (shouldLoadHighlights) {
        setIsLoadingOfferHighlights(false)
      }
    }
  }

  const loadProductsEffect = useEffectEvent((search = '') => {
    loadProducts(search)
  })

  const clearSessionState = (resetAuthMarker = false) => {
    if (resetAuthMarker) {
      setAuthToken('')
    }
    setUserPhone('')
    setUserRole('buyer')
    setIsOtpSent(false)
    setAuthOtpInput('')
    setCheckoutPending(false)
    setCheckoutFlow(null)
    setBuyNowItem(null)
    setAddresses([])
    setSelectedCheckoutAddress(null)
    setPaymentError('')
    setBuyerOrders([])
    setBuyerOrderTimeline([])
    setActiveBuyerTimelineOrderId('')
    setBuyerCancelReasonDrafts({})
    setBuyerReturnReasonDrafts({})
    setAdminSellerRequests([])
    setAdminActiveSellers([])
    setAdminSellerRanking([])
    setAdminRiskDashboard(null)
    setAdminFinanceSummary(null)
    setAdminOrderSummary(null)
    setAdminOrderCareCases(null)
    setAdminPayoutRequests([])
    setAdminOffersSummary(null)
    setAdminRiskSnapshots({})
    setAdminRejectReasons({})
    setActiveQuickPanel('')
    setAccountView('menu')
    setSellerOnboarding({
      status: 'none',
      requestedAt: '',
      rejectedAt: '',
      rejectedReason: '',
      request: null,
    })
  }

  const hydrateSyncedCollections = useEffectEvent(async () => {
    const requestId = collectionSyncRequestIdRef.current + 1
    collectionSyncRequestIdRef.current = requestId
    const localCartPayload = buildCartSyncPayload(cartItems)
    const localWishlistPayload = buildWishlistSyncPayload(wishlistIds)

    try {
      const [remoteCart, remoteWishlist] = await Promise.all([
        apiGet('/api/cart', { token: authToken }),
        apiGet('/api/wishlist', { token: authToken }),
      ])

      const mergedCartPayload = mergeCartSyncPayloads(
        buildCartSyncPayload(remoteCart?.items),
        localCartPayload,
      )
      const mergedWishlistPayload = mergeWishlistSyncPayloads(
        remoteWishlist?.product_ids,
        localWishlistPayload,
      )

      const [nextCart, nextWishlist] = await Promise.all([
        apiPost('/api/cart/sync', { items: mergedCartPayload }, { token: authToken }),
        apiPost('/api/wishlist/sync', { product_ids: mergedWishlistPayload }, { token: authToken }),
      ])

      if (requestId !== collectionSyncRequestIdRef.current) {
        return
      }

      const nextCartItems = normalizeServerCartItems(nextCart?.items)
      const nextWishlistIds = buildWishlistSyncPayload(nextWishlist?.product_ids)
      syncedCollectionsSignatureRef.current = buildCollectionsSyncSignature(
        buildCartSyncPayload(nextCartItems),
        nextWishlistIds,
      )
      hasHydratedSyncedCollectionsRef.current = true
      collectionSyncNoticeRef.current = false
      setCartItems(nextCartItems)
      setWishlistIds(nextWishlistIds)
    } catch (error) {
      if (requestId !== collectionSyncRequestIdRef.current) {
        return
      }
      hasHydratedSyncedCollectionsRef.current = true
      if (!collectionSyncNoticeRef.current) {
        const message = error instanceof Error ? error.message : 'Account sync is unavailable right now'
        flashNotice(message === 'Authentication required' ? 'Login to sync cart and wishlist' : 'Account sync unavailable. Using this device copy for now.')
        collectionSyncNoticeRef.current = true
      }
    }
  })

  const pushSyncedCollections = useEffectEvent(async (cartPayload, wishlistPayload) => {
    const requestId = collectionSyncRequestIdRef.current + 1
    collectionSyncRequestIdRef.current = requestId
    try {
      const [nextCart, nextWishlist] = await Promise.all([
        apiPost('/api/cart/sync', { items: cartPayload }, { token: authToken }),
        apiPost('/api/wishlist/sync', { product_ids: wishlistPayload }, { token: authToken }),
      ])

      if (requestId !== collectionSyncRequestIdRef.current) {
        return
      }

      const nextCartItems = normalizeServerCartItems(nextCart?.items)
      const nextWishlistIds = buildWishlistSyncPayload(nextWishlist?.product_ids)
      syncedCollectionsSignatureRef.current = buildCollectionsSyncSignature(
        buildCartSyncPayload(nextCartItems),
        nextWishlistIds,
      )
      collectionSyncNoticeRef.current = false
      setCartItems(nextCartItems)
      setWishlistIds(nextWishlistIds)
    } catch (error) {
      if (requestId !== collectionSyncRequestIdRef.current) {
        return
      }
      if (!collectionSyncNoticeRef.current) {
        const message = error instanceof Error ? error.message : 'Account sync is unavailable right now'
        flashNotice(message === 'Authentication required' ? 'Login to sync cart and wishlist' : 'Account sync unavailable. Using this device copy for now.')
        collectionSyncNoticeRef.current = true
      }
    }
  })

  useEffect(() => {
    loadProductsEffect()
  }, [])

  useEffect(() => {
    localStorage.setItem('brandcartCart', JSON.stringify(Array.isArray(cartItems) ? cartItems : []))
  }, [cartItems])

  useEffect(() => {
    localStorage.setItem('brandcartWishlist', JSON.stringify(Array.isArray(wishlistIds) ? wishlistIds : []))
  }, [wishlistIds])

  useEffect(() => {
    localStorage.removeItem(LEGACY_ACCOUNT_CARDS_KEY)
  }, [])

  useEffect(() => {
    if (!authToken || isRestoringSession) {
      hasHydratedSyncedCollectionsRef.current = false
      syncedCollectionsSignatureRef.current = ''
      collectionSyncNoticeRef.current = false
      collectionSyncRequestIdRef.current = 0
      return
    }

    hydrateSyncedCollections()
  }, [authToken, isRestoringSession])

  useEffect(() => {
    if (!authToken || isRestoringSession || !hasHydratedSyncedCollectionsRef.current) {
      return
    }

    const cartPayload = buildCartSyncPayload(cartItems)
    const wishlistPayload = buildWishlistSyncPayload(wishlistIds)
    const signature = buildCollectionsSyncSignature(cartPayload, wishlistPayload)
    if (signature === syncedCollectionsSignatureRef.current) {
      return
    }

    const timeoutId = setTimeout(() => {
      pushSyncedCollections(cartPayload, wishlistPayload)
    }, 250)

    return () => clearTimeout(timeoutId)
  }, [authToken, isRestoringSession, cartItems, wishlistIds])

  useEffect(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_PHONE_KEY)
    localStorage.removeItem(AUTH_ROLE_KEY)

    const handleAuthExpired = () => {
      clearSessionState(true)
      setIsRestoringSession(false)
      setCartNotice('Session expired. Please sign in again.')
      setTimeout(() => setCartNotice(''), 1800)
    }

    const syncPortalMode = () => {
      setPortalMode(readPortalMode())
    }

    window.addEventListener('brandcart-auth-expired', handleAuthExpired)
    window.addEventListener('popstate', syncPortalMode)
    return () => {
      window.removeEventListener('brandcart-auth-expired', handleAuthExpired)
      window.removeEventListener('popstate', syncPortalMode)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const restoreSession = async () => {
      try {
        const me = await apiGet('/api/auth/me')
        if (!cancelled) {
          setAuthToken(COOKIE_AUTH_TOKEN)
          setUserPhone(me?.phone || '')
          setUserRole(me?.role || 'buyer')
        }
      } catch {
        if (!cancelled) {
          clearSessionState(true)
        }
      } finally {
        if (!cancelled) {
          setIsRestoringSession(false)
        }
      }
    }

    restoreSession()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!authToken) {
      if (!isRestoringSession) {
        clearSessionState(false)
      }
      return
    }

    let cancelled = false
    const loadMe = async () => {
      try {
        const me = await apiGet('/api/auth/me', { token: authToken })
        if (!cancelled) {
          setUserPhone(me?.phone || '')
          setUserRole(me?.role || 'buyer')
        }
      } catch {
        if (!cancelled) {
          clearSessionState(true)
        }
      }
    }

    loadMe()
    return () => {
      cancelled = true
    }
  }, [authToken, isRestoringSession])

  useEffect(() => {
    if (!authToken) {
      return
    }

    let cancelled = false
    const loadSellerOnboarding = async () => {
      setIsLoadingSellerOnboarding(true)
      try {
        const response = await apiGet('/api/auth/seller-request-status', { token: authToken })
        if (cancelled) {
          return
        }
        const status = response?.seller_status || 'none'
        const request = response?.request && typeof response.request === 'object' ? response.request : null
        // if onboarding has been verified, treat user as seller regardless of backend role field
        const inferredRole = status === 'verified' ? 'seller' : (response?.role || 'buyer')
        setUserRole(inferredRole)
        setSellerOnboarding({
          status,
          requestedAt: response?.requested_at || '',
          rejectedAt: response?.rejected_at || '',
          rejectedReason: response?.rejected_reason || '',
          request,
        })
        if (request) {
          setSellerRequestForm((prev) => ({
            legal_name: prev.legal_name || request.legal_name || '',
            brand_name: prev.brand_name || request.brand_name || '',
            category: prev.category || request.category || '',
            description: prev.description || request.description || '',
            email: prev.email || request.email || '',
            pan_card: prev.pan_card || request?.documents?.pan_card || '',
            gst_certificate: prev.gst_certificate || request?.documents?.gst_certificate || '',
            address_proof: prev.address_proof || request?.documents?.address_proof || '',
            logo_url: prev.logo_url || request.logo_url || '',
          }))
        }
      } catch {
        if (!cancelled) {
          setSellerOnboarding({
            status: 'none',
            requestedAt: '',
            rejectedAt: '',
            rejectedReason: '',
            request: null,
          })
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSellerOnboarding(false)
        }
      }
    }

    loadSellerOnboarding()
    return () => {
      cancelled = true
    }
  }, [authToken])

  // load seller dashboard data when role/status indicates seller access
  useEffect(() => {
    const hasSellerAccess = Boolean(authToken) && hasSellerPortalAccess && isSellerPortal

    if (!hasSellerAccess) {
      setSellerPerformance(null)
      setSellerProducts([])
      setSellerWallet(null)
      setSellerDashboardProfile(null)
      setSellerSavedBankAccount(null)
      setSellerAllIndia(false)
      setSellerServiceableRegions([])
      setSellerOffers([])
      setSellerOrders([])
      setSellerShippingPartners([])
      setSellerNotifications([])
      setSellerPartnerSelections({})
      setSellerShipmentDrafts({})
      setIsLoadingSellerData(false)
      setIsLoadingSellerOffers(false)
      setSellerDataError('')
      return
    }

    const loadSellerData = async () => {
      setIsLoadingSellerData(true)
      setIsLoadingSellerOffers(true)
      setSellerDataError('')
      try {
        const [perfData, prodData, walletData, profData, regionsData, offersData, bankData, ordersData, shippingPartnersData, notificationsData] = await Promise.all([
          apiGet('/api/seller/performance', { token: authToken }).catch(() => null),
          apiGet('/api/seller/my-products', { token: authToken }).catch(() => null),
          apiGet('/api/seller/wallet', { token: authToken }).catch(() => null),
          apiGet('/api/seller/profile', { token: authToken }).catch(() => null),
          apiGet('/api/seller/serviceable-regions', { token: authToken }).catch(() => null),
          apiGet('/api/seller/offers', { token: authToken }).catch(() => null),
          apiGet('/api/seller/bank-account', { token: authToken }).catch(() => null),
          apiGet('/api/seller/orders?status=all&limit=50&page=1', { token: authToken }).catch(() => null),
          apiGet('/api/seller/shipping-partners/catalog?limit=100', { token: authToken }).catch(() => null),
          apiGet('/api/seller/notifications?limit=20', { token: authToken }).catch(() => null),
        ])
        const nextOrders = Array.isArray(ordersData?.orders) ? ordersData.orders : []
        setSellerPerformance(perfData)
        setSellerProducts(Array.isArray(prodData?.products) ? prodData.products : [])
        setSellerWallet(walletData && typeof walletData === 'object' ? walletData : null)
        setSellerDashboardProfile(profData)
        setSellerProfileForm({
          support_email: profData?.brand?.email || '',
          short_tagline: profData?.brand?.short_tagline || '',
          logo_url: profData?.brand?.logo_url || '',
          description: profData?.brand?.description || '',
        })
        setSellerAllIndia(Boolean(regionsData?.all_india))
        setSellerServiceableRegions(Array.isArray(regionsData?.serviceable_regions) ? regionsData.serviceable_regions : [])
        setSellerOffers(Array.isArray(offersData?.offers) ? offersData.offers : [])
        setSellerOrders(nextOrders)
        setSellerShippingPartners(Array.isArray(shippingPartnersData?.partners) ? shippingPartnersData.partners : [])
        setSellerNotifications(Array.isArray(notificationsData?.notifications) ? notificationsData.notifications : [])
        syncSellerShipmentState(nextOrders)
        const savedBank = bankData?.bank_account || null
        setSellerSavedBankAccount(savedBank)
        setUseSavedBankForPayout(Boolean(savedBank))
        if (savedBank) {
          setSellerBankAccountForm((prev) => ({
            ...prev,
            account_holder_name: savedBank.account_holder_name || '',
            ifsc_code: savedBank.ifsc_code || '',
            bank_name: savedBank.bank_name || '',
            bank_account_number: '',
          }))
        }
      } catch {
        setSellerDataError('Failed to load seller data')
      } finally {
        setIsLoadingSellerData(false)
        setIsLoadingSellerOffers(false)
      }
    }
    loadSellerData()
  }, [authToken, hasSellerPortalAccess, isSellerPortal])

  useEffect(() => {
    if (!Array.isArray(wishlistIds) || wishlistIds.length === 0) {
      setWishlistItems([])
      setIsLoadingWishlistItems(false)
      return
    }

    let cancelled = false
    const loadWishlistItems = async () => {
      setIsLoadingWishlistItems(true)
      const localPool = [
        ...(Array.isArray(products) ? products : []),
        ...(Array.isArray(similarProducts) ? similarProducts : []),
        ...(productDetail ? [productDetail] : []),
        ...(activeProductSummary ? [activeProductSummary] : []),
      ]
      const localById = new Map(localPool.filter((item) => item?.id).map((item) => [item.id, item]))

      const resolved = await Promise.all(wishlistIds.map(async (id) => {
        if (localById.has(id)) {
          return localById.get(id)
        }
        try {
          return await apiGet(`/api/products/${id}`)
        } catch {
          return null
        }
      }))

      if (!cancelled) {
        setWishlistItems(resolved.filter((item) => item?.id))
        setIsLoadingWishlistItems(false)
      }
    }

    loadWishlistItems()
    return () => {
      cancelled = true
    }
  }, [wishlistIds, products, similarProducts, productDetail, activeProductSummary])

  useEffect(() => {
    localStorage.setItem(ACCOUNT_PROFILE_KEY, JSON.stringify(profileForm))
  }, [profileForm])

  useEffect(() => {
    localStorage.setItem(ACCOUNT_DEVICES_KEY, JSON.stringify(deviceSessions))
  }, [deviceSessions])

  useEffect(() => {
    localStorage.setItem(ACCOUNT_NOTIFICATIONS_KEY, JSON.stringify(notificationPrefs))
  }, [notificationPrefs])

  useEffect(() => {
    setNotificationsEnabled(Boolean(notificationPrefs.orderUpdates || notificationPrefs.promotions || notificationPrefs.priceAlerts))
  }, [notificationPrefs])

  useEffect(() => {
    localStorage.setItem(ACCOUNT_PRIVACY_KEY, JSON.stringify(privacyPrefs))
  }, [privacyPrefs])

  useEffect(() => {
    localStorage.setItem(ACCOUNT_QA_KEY, JSON.stringify(qaItems))
  }, [qaItems])

  useEffect(() => {
    localStorage.setItem(ACCOUNT_REVIEWS_KEY, JSON.stringify(reviewDrafts))
  }, [reviewDrafts])

  useEffect(() => {
    if (activeQuickPanel !== 'account' || accountView !== 'menu') {
      setAccountMenuQuery('')
    }
  }, [activeQuickPanel, accountView])

  useEffect(() => {
    if (!userPhone) {
      return
    }
    setProfileForm((prev) => ({ ...prev, phone: userPhone }))
  }, [userPhone])

  useEffect(() => {
    const trimmed = searchText.trim()
    if (!trimmed || trimmed.length < 2) {
      setSearchSuggestions([])
      setIsLoadingSuggestions(false)
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      setIsLoadingSuggestions(true)
      try {
        const data = await apiGet(`/api/products/search?q=${encodeURIComponent(trimmed)}&limit=8&page=1`)
        if (!cancelled) {
          const remote = Array.isArray(data) ? data : []
          setSearchSuggestions(remote.length > 0 ? remote : buildLocalSuggestionsEffect(trimmed))
        }
      } catch {
        if (!cancelled) {
          setSearchSuggestions(buildLocalSuggestionsEffect(trimmed))
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSuggestions(false)
        }
      }
    }, 220)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchText, products, similarProducts, productDetail, activeProductSummary])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const productId = params.get('p')
    if (productId) {
      setActiveProductId(productId)
    }
  }, [])

  useEffect(() => {
    if (!activeProductId) {
      setProductDetail(null)
      setDetailError('')
      setSelectedImage('')
      setDeliveryCheck({
        checked: false,
        deliverable: null,
        codAvailable: null,
        reason: '',
        estimatedDays: null,
        requiresAddressConfirmation: false,
      })
      return
    }

    const loadProductDetail = async () => {
      setIsLoadingDetail(true)
      setDetailError('')

      try {
        const detail = await apiGet(`/api/products/${activeProductId}`)
        setProductDetail(detail)
        if (Array.isArray(detail?.variants) && detail.variants.length > 0) {
          setSelectedVariantId(String(detail?.default_variant?.id || detail.variants[0]?.id || ''))
        } else {
          setSelectedVariantId('')
        }
        if (Array.isArray(detail?.images) && detail.images.length > 0) {
          setSelectedImage(detail.images[0])
        } else {
          setSelectedImage('')
        }
      } catch (error) {
        setProductDetail(null)
        setSelectedVariantId('')
        setDetailError(error instanceof Error ? error.message : 'Failed to load product detail')
      } finally {
        setIsLoadingDetail(false)
      }
    }

    loadProductDetail()
  }, [activeProductId])

  useEffect(() => {
    if (!activeProductId) {
      setProductReviews({ count: 0, average: null, reviews: [] })
      return
    }

    let cancelled = false
    const loadReviews = async () => {
      setIsLoadingReviews(true)
      try {
        const response = await apiGet(`/api/reviews/product/${activeProductId}`)
        if (!cancelled) {
          setProductReviews(summarizeReviews(response))
        }
      } catch {
        if (!cancelled) {
          setProductReviews({ count: 0, average: null, reviews: [] })
        }
      } finally {
        if (!cancelled) {
          setIsLoadingReviews(false)
        }
      }
    }

    loadReviews()
    const timer = setInterval(loadReviews, 15000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [activeProductId])

  useEffect(() => {
    if (!activeProductId) {
      setProductQuestions([])
      return
    }

    let cancelled = false
    const loadQuestions = async () => {
      setIsLoadingQuestions(true)
      try {
        const response = await apiGet(`/api/questions/product/${activeProductId}`)
        if (!cancelled) {
          setProductQuestions(Array.isArray(response?.items) ? response.items : [])
        }
      } catch {
        if (!cancelled) {
          setProductQuestions([])
        }
      } finally {
        if (!cancelled) {
          setIsLoadingQuestions(false)
        }
      }
    }

    loadQuestions()
    const timer = setInterval(loadQuestions, 15000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [activeProductId])

  useEffect(() => {
    if (!activeProductId) {
      setSellerProfile(null)
      return
    }

    if (productDetail?.seller) {
      setSellerProfile(productDetail.seller)
      return
    }

    if (activeProductSummary?.seller) {
      setSellerProfile(activeProductSummary.seller)
      return
    }

    const loadSellerFallback = async () => {
      const endpoints = [
        '/api/products/trending?limit=60',
        '/api/products/recommended?limit=60',
        '/api/products/top-discounts?limit=60',
      ]

      for (const endpoint of endpoints) {
        try {
          const list = await apiGet(endpoint)
          const match = Array.isArray(list) ? list.find((item) => item?.id === activeProductId) : null
          if (match?.seller) {
            setSellerProfile(match.seller)
            return
          }
        } catch {
          continue
        }
      }

      setSellerProfile(null)
    }

    loadSellerFallback()
  }, [activeProductId, activeProductSummary, productDetail?.seller])

  useEffect(() => {
    if (!activeProductId || !productDetail?.category) {
      setSimilarProducts([])
      return
    }

    const loadSimilar = async () => {
      setIsLoadingSimilar(true)
      try {
        const list = await apiGet(`/api/products?search=${encodeURIComponent(productDetail.category)}`)
        const filtered = (Array.isArray(list) ? list : [])
          .filter((item) => item?.id && item.id !== activeProductId)
          .slice(0, 16)
        const withReviews = await attachReviewStats(filtered)
        setSimilarProducts(withReviews)
      } catch {
        setSimilarProducts([])
      } finally {
        setIsLoadingSimilar(false)
      }
    }

    loadSimilar()
  }, [activeProductId, productDetail?.category])

  const handleSearchSubmit = (event) => {
    event.preventDefault()
    if (activeProductId) {
      closeProduct()
    }
    loadProducts(searchText)
    setShowSuggestions(false)
  }

  const handleSuggestionSelect = (item) => {
    const title = item?.title || ''
    setSearchText(title)
    setShowSuggestions(false)

    if (item?.id) {
      if (activeProductId && activeProductId !== item.id) {
        closeProduct()
      }
      openProduct(item)
      return
    }

    if (activeProductId) {
      closeProduct()
    }
    loadProducts(title)
  }

  const handleCategorySelect = (query) => {
    setIsCategoryView(false)
    setSearchText(query)
    setShowSuggestions(false)
    loadProducts(query)
    if (activeProductId) {
      closeProduct()
    }
  }

  const handleHomeShortcut = () => {
    setActiveQuickPanel('')
    setIsCategoryView(false)
    setSearchText('')
    setShowSuggestions(false)
    if (activeProductId) {
      closeProduct()
    }
    loadProducts()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCategoriesShortcut = () => {
    setIsCategoryView(true)
    setActiveQuickPanel('')
    if (activeProductId) {
      closeProduct()
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const flashNotice = (message) => {
    setCartNotice(message)
    setTimeout(() => setCartNotice(''), 1400)
  }

  const normalizePhoneInput = (value) => value.replace(/\D/g, '').slice(0, 10)

  const loadAddresses = async (tokenOverride = '') => {
    const token = tokenOverride || authToken
    if (!token) {
      return
    }
    setIsLoadingAddresses(true)
    try {
      const data = await apiGet('/api/addresses', { token })
      setAddresses(Array.isArray(data) ? data : [])
    } catch {
      setAddresses([])
      flashNotice('Could not load addresses')
    } finally {
      setIsLoadingAddresses(false)
    }
  }

  const openAddressPanel = () => {
    if (!isLoggedIn) {
      setCheckoutPending(false)
      setCheckoutFlow(null)
      setBuyNowItem(null)
      setActiveQuickPanel('auth')
      flashNotice('Login required')
      return
    }
    setCheckoutFlow(null)
    setBuyNowItem(null)
    setSelectedCheckoutAddress(null)
    setPaymentError('')
    setActiveQuickPanel('address')
    loadAddresses()
  }

  const sendOtp = async (event) => {
    event.preventDefault()
    
    // Check rate limit
    if (!otpRateLimiter.isAllowed()) {
      flashNotice('Too many OTP requests. Please try again later.')
      return
    }
    
    const phone = normalizePhoneInput(authPhoneInput)
    
    // Validate phone
    const phoneValidation = validatePhone(phone)
    if (!phoneValidation) {
      flashNotice('Enter a valid 10-digit phone number')
      return
    }

    setIsSendingOtp(true)
    try {
      const response = await apiPost('/api/auth/send-otp', { phone: phoneValidation })
      setAuthPhoneInput(phoneValidation)
      setIsOtpSent(true)
      
      // Show detailed feedback based on what was sent
      if (response?.sms_sent && response?.email_sent) {
        flashNotice('OTP sent via SMS and Email')
      } else if (response?.sms_sent) {
        flashNotice('OTP sent via SMS')
      } else if (response?.email_sent) {
        flashNotice('OTP sent via Email')
      } else {
        flashNotice(response?.message || 'OTP sent')
      }
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Failed to send OTP')
    } finally {
      setIsSendingOtp(false)
    }
  }

  const verifyOtp = async (event) => {
    event.preventDefault()
    const phone = normalizePhoneInput(authPhoneInput)
    const otp = authOtpInput.trim()
    
    // Validate inputs
    const phoneValidation = validatePhone(phone)
    if (!phoneValidation || otp.length < 4 || otp.length > 6) {
      flashNotice('Enter valid phone and OTP')
      return
    }

    setIsVerifyingOtp(true)
    try {
      const response = await apiPost('/api/auth/verify-otp', { phone: phoneValidation, otp })
      const nextToken = COOKIE_AUTH_TOKEN
      setUserRole(response?.role || 'buyer')
      setAuthToken(nextToken)
      setUserPhone(response?.phone || phoneValidation)
      recordDeviceSession(phoneValidation)
      setIsOtpSent(false)
      setAuthOtpInput('')
      setIsRestoringSession(false)
      flashNotice('Login successful')
      if (checkoutPending) {
        setCheckoutPending(false)
        setActiveQuickPanel('address')
        loadAddresses(nextToken)
      } else {
        setActiveQuickPanel('account')
      }
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Invalid OTP')
    } finally {
      setIsVerifyingOtp(false)
    }
  }

  const logout = async () => {
    try {
      await apiPost('/api/auth/logout', {}, { token: authToken })
    } catch {
      // Clear local state even if the server session has already expired.
    } finally {
      clearSessionState(true)
      setIsOtpSent(false)
      setAuthOtpInput('')
      setCheckoutPending(false)
      setAdminRejectReasons({})
      setActiveQuickPanel('')
      setAccountView('menu')
      flashNotice('Logged out')
    }
  }

  const updateAddressField = (field, value) => {
    setAddressForm((prev) => ({ ...prev, [field]: value }))
  }

  const addAddress = async (event) => {
    event.preventDefault()
    if (!authToken) {
      flashNotice('Login required')
      return
    }

    const payload = {
      name: addressForm.name.trim(),
      phone: normalizePhoneInput(addressForm.phone),
      line1: addressForm.line1.trim(),
      city: addressForm.city.trim(),
      state: addressForm.state.trim(),
      pincode: addressForm.pincode.replace(/\D/g, '').slice(0, 6),
      is_default: Boolean(addressForm.is_default),
    }

    if (!payload.name || !payload.phone || !payload.line1 || !payload.city || !payload.state || payload.pincode.length !== 6) {
      flashNotice('Complete all address fields')
      return
    }

    setIsSavingAddress(true)
    try {
      await apiPost('/api/addresses', payload, { token: authToken })
      setAddressForm((prev) => ({
        ...prev,
        line1: '',
        city: '',
        state: '',
        pincode: '',
        is_default: false,
      }))
      flashNotice('Address added')
      loadAddresses()
    } catch {
      flashNotice('Could not add address')
    } finally {
      setIsSavingAddress(false)
    }
  }

  const proceedToPayment = (selectedAddress) => {
    if (!checkoutFlow || (checkoutFlow === 'buy_now' && !buyNowItem)) {
      setSelectedCheckoutAddress(selectedAddress || null)
      flashNotice('Address selected')
      return
    }
    setSelectedCheckoutAddress(selectedAddress || null)
    setSelectedPaymentMethod('RAZORPAY')
    setPaymentError('')
    setActiveQuickPanel('payment')
  }

  const createIdempotencyKey = (prefix) => {
    if (window.crypto?.randomUUID) {
      return `${prefix}-${window.crypto.randomUUID()}`
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  const loadRazorpayCheckout = () => {
    if (window.Razorpay) {
      return Promise.resolve(true)
    }
    if (razorpayCheckoutPromise) {
      return razorpayCheckoutPromise
    }
    razorpayCheckoutPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-brandcart-sdk="razorpay"]')
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(true), { once: true })
        existingScript.addEventListener('error', () => reject(new Error('Failed to load Razorpay SDK')), { once: true })
        return
      }

      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      script.dataset.brandcartSdk = 'razorpay'
      script.onload = () => resolve(true)
      script.onerror = () => reject(new Error('Failed to load Razorpay SDK'))
      document.body.appendChild(script)
    }).catch((error) => {
      razorpayCheckoutPromise = null
      throw error
    })
    return razorpayCheckoutPromise
  }

  const buildCreateOrderPath = ({ productId, quantity, paymentMethod, addressId, idempotencyKey, offerId, variantId }) => {
    const params = new URLSearchParams({
      product_id: String(productId),
      quantity: String(quantity),
      payment_method: paymentMethod,
      idempotency_key: idempotencyKey,
    })
    if (addressId) {
      params.set('address_id', String(addressId))
    }
    if (offerId) {
      params.set('offer_id', String(offerId))
    }
    if (variantId) {
      params.set('variant_id', String(variantId))
    }
    return `/api/orders/create?${params.toString()}`
  }

  const placeCodOrders = async () => {
    const addressId = selectedCheckoutAddress?._id
    if (!addressId) {
      throw new Error('Address is missing')
    }

    const results = []
    const itemsToCheckout = checkoutItems
    if (!itemsToCheckout.length) {
      throw new Error('Cart is empty')
    }
    for (const item of itemsToCheckout) {
      const response = await apiPost(
        buildCreateOrderPath({
          productId: item.id,
          quantity: assertValidOrderQuantity(item.qty || 1),
          paymentMethod: 'COD',
          addressId,
          idempotencyKey: createIdempotencyKey('cod'),
          offerId: item.offer_id,
          variantId: item.variant_id,
        }),
        undefined,
        { token: authToken },
      )
      results.push(response)
    }
    return results
  }

  const placeRazorpayOrder = async () => {
    if (checkoutItems.length !== 1) {
      throw new Error('Online payment is supported for one item at a time. Use Buy Now for Razorpay or use COD for full cart.')
    }

    const item = checkoutItems[0]
    const addressId = selectedCheckoutAddress?._id
    if (!addressId) {
      throw new Error('Address is missing')
    }

    const created = await apiPost(
      buildCreateOrderPath({
        productId: item.id,
        quantity: assertValidOrderQuantity(item.qty || 1),
        paymentMethod: 'RAZORPAY',
        addressId,
        idempotencyKey: createIdempotencyKey('rzp-create'),
        offerId: item.offer_id,
        variantId: item.variant_id,
      }),
      undefined,
      { token: authToken },
    )

    const payment = created?.payment
    if (!payment?.key_id || !payment?.razorpay_order_id) {
      throw new Error('Invalid payment session from backend')
    }

    await loadRazorpayCheckout()

    await new Promise((resolve, reject) => {
      const options = {
        key: payment.key_id,
        amount: payment.amount_paise,
        currency: payment.currency || 'INR',
        name: 'Brandcart',
        description: item.title || 'Order payment',
        order_id: payment.razorpay_order_id,
        prefill: {
          contact: userPhone || authPhoneInput || '',
        },
        theme: {
          color: '#f0b83f',
        },
        handler: async (rzpResponse) => {
          try {
            await apiPost('/api/orders/payment/razorpay/verify', {
              order_id: created.order_id,
              razorpay_order_id: rzpResponse.razorpay_order_id,
              razorpay_payment_id: rzpResponse.razorpay_payment_id,
              razorpay_signature: rzpResponse.razorpay_signature,
              idempotency_key: createIdempotencyKey('rzp-verify'),
            }, { token: authToken })
            resolve(created)
          } catch (error) {
            reject(error)
          }
        },
        modal: {
          ondismiss: () => reject(new Error('Payment cancelled')),
        },
      }
      const razorpay = new window.Razorpay(options)
      razorpay.on('payment.failed', (event) => {
        const reason = event?.error?.description || 'Payment failed'
        reject(new Error(reason))
      })
      razorpay.open()
    })
  }

  const completeCheckout = async () => {
    if (!selectedCheckoutAddress) {
      flashNotice('Select delivery address')
      return
    }
    if (!checkoutItems.length) {
      flashNotice('Cart is empty')
      return
    }

    setIsPlacingOrder(true)
    setPaymentError('')
    try {
      if (selectedPaymentMethod === 'COD') {
        await placeCodOrders()
      } else if (selectedPaymentMethod === 'RAZORPAY') {
        await placeRazorpayOrder()
      } else {
        throw new Error('Unsupported payment method')
      }

      const itemCount = checkoutItems.reduce((sum, item) => sum + Number(item.qty || 1), 0)
      const selected = paymentOptions.find((item) => item.id === selectedPaymentMethod)
      const methodLabel = selected?.title || selectedPaymentMethod
      const city = selectedCheckoutAddress?.city

      if (checkoutFlow === 'buy_now') {
        setBuyNowItem(null)
      } else {
        setCartItems([])
      }
      setCheckoutPending(false)
      setCheckoutFlow(null)
      setSelectedCheckoutAddress(null)
      setPaymentError('')
      closeQuickPanel()
      flashNotice(`Order placed via ${methodLabel} for ${itemCount} item${itemCount > 1 ? 's' : ''}${city ? ` to ${city}` : ''}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not place order'
      setPaymentError(message)
      flashNotice(message)
    } finally {
      setIsPlacingOrder(false)
    }
  }

  const addProductToCart = (product, preferredImage = '') => {
    if (!product?.id) {
      return
    }

    const nextItem = buildCartItemFromProduct(product, preferredImage)
    if (!nextItem) {
      return
    }

    setCartItems((prev) => {
      const next = Array.isArray(prev) ? [...prev] : []
      const existing = next.find((item) => (item.cart_key || item.id) === (nextItem.cart_key || nextItem.id))
      if (existing) {
        existing.qty = (existing.qty || 1) + 1
        existing.price = nextItem.price
        existing.base_price = nextItem.base_price
        existing.offer_id = nextItem.offer_id
        existing.image = nextItem.image
        existing.variant_id = nextItem.variant_id
        existing.variant_label = nextItem.variant_label
      } else {
        next.push(nextItem)
      }
      return next
    })
    flashNotice('Added to cart')
  }

  const toggleWishlist = () => {
    if (!activeProductId) {
      return
    }

    setWishlistIds((prev) => {
      const exists = prev.includes(activeProductId)
      const next = exists
        ? prev.filter((id) => id !== activeProductId)
        : [...prev, activeProductId]
      flashNotice(exists ? 'Removed from wishlist' : 'Added to wishlist')
      return next
    })
  }

  const handleShareProduct = async () => {
    if (!activeProductId) {
      return
    }

    const shareUrl = new URL(window.location.href)
    shareUrl.searchParams.set('p', activeProductId)
    const payload = {
      title: productDetail?.title || 'Brandcart Product',
      text: productDetail?.title ? `Check out ${productDetail.title}` : 'Check out this product',
      url: shareUrl.toString(),
    }

    try {
      if (navigator.share) {
        await navigator.share(payload)
        return
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload.url)
        flashNotice('Product link copied')
        return
      }
    } catch {
      return
    }

    flashNotice('Unable to share right now')
  }

  const openProduct = (product) => {
    if (!product?.id) {
      return
    }
    setActiveProductSummary(product)
    setActiveProductId(product.id)
    const url = new URL(window.location.href)
    url.searchParams.set('p', product.id)
    window.history.pushState({}, '', url)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const closeProduct = () => {
    setActiveProductId('')
    setActiveProductSummary(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('p')
    window.history.pushState({}, '', url)
  }

  const formatInr = (value) => {
    const amount = Number(value)
    if (!Number.isFinite(amount)) {
      return null
    }
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
  }

  const addToCart = () => {
    if (!productDetail?.id) {
      return
    }
    if (deliveryCheck.checked && deliveryCheck.deliverable === false && !deliveryCheck.requiresAddressConfirmation) {
      flashNotice('Not deliverable to this pincode')
      return
    }
    addProductToCart(productDetail, selectedImage || detailImages[0] || null)
  }

  const removeFromWishlist = (id) => {
    setWishlistIds((prev) => prev.filter((itemId) => itemId !== id))
    flashNotice('Removed from wishlist')
  }

  const openOrdersPanel = () => {
    if (!isLoggedIn) {
      setCheckoutPending(false)
      setCheckoutFlow(null)
      setBuyNowItem(null)
      setActiveQuickPanel((prev) => (prev === 'auth' ? '' : 'auth'))
      return
    }
    setAccountView('orders')
    setActiveQuickPanel('account')
  }

  const openCartPanel = () => {
    setCheckoutPending(false)
    setCheckoutFlow(null)
    setBuyNowItem(null)
    setActiveQuickPanel((prev) => (prev === 'cart' ? '' : 'cart'))
  }

  const openAccountPanel = () => {
    if (!isLoggedIn) {
      setCheckoutPending(false)
      setCheckoutFlow(null)
      setBuyNowItem(null)
      setActiveQuickPanel((prev) => (prev === 'auth' ? '' : 'auth'))
      return
    }
    setAccountView('menu')
    setActiveQuickPanel((prev) => (prev === 'account' ? '' : 'account'))
  }

  const closeQuickPanel = () => {
    setAccountView('menu')
    setCheckoutPending(false)
    setCheckoutFlow(null)
    setBuyNowItem(null)
    setSelectedCheckoutAddress(null)
    setPaymentError('')
    setActiveQuickPanel('')
  }

  const recordDeviceSession = (phone) => {
    const nextDevice = {
      id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `dev-${Date.now()}`,
      label: `${navigator.platform || 'Device'} / ${navigator.userAgent?.includes('Mobile') ? 'Mobile' : 'Desktop'}`,
      phone,
      last_active_at: new Date().toISOString(),
      current: true,
    }
    setDeviceSessions((prev) => {
      const normalized = (Array.isArray(prev) ? prev : []).map((item) => ({ ...item, current: false }))
      return [nextDevice, ...normalized].slice(0, 6)
    })
  }

  const saveProfile = (event) => {
    event.preventDefault()
    if (!profileForm.fullName.trim()) {
      flashNotice('Name is required')
      return
    }
    flashNotice('Profile updated')
    setAccountView('menu')
  }

  const saveLanguage = (language) => {
    setAccountLanguage(language)
    flashNotice(`Language: ${language}`)
    setAccountView('menu')
  }

  const toggleNotificationPref = (key) => {
    setNotificationPrefs((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const togglePrivacyPref = (key) => {
    setPrivacyPrefs((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const addQuestion = (event) => {
    event.preventDefault()
    const value = qaInput.trim()
    if (!value) {
      return
    }
    setQaItems((prev) => ([{
      id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `qa-${Date.now()}`,
      question: value,
      answer: 'Thanks, our team will respond soon.',
      created_at: new Date().toISOString(),
    }, ...prev]))
    setQaInput('')
    flashNotice('Question submitted')
  }

  const addReviewDraft = (event) => {
    event.preventDefault()
    const value = reviewInput.trim()
    if (!value) {
      return
    }
    setReviewDrafts((prev) => ([{
      id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `review-${Date.now()}`,
      text: value,
      created_at: new Date().toISOString(),
    }, ...prev]))
    setReviewInput('')
    flashNotice('Review draft saved')
  }

  const loadBuyerOrders = async (statusOverride = buyerOrderStatusFilter) => {
    if (!authToken) {
      return []
    }
    setIsLoadingBuyerOrders(true)
    try {
      const response = await apiGet(`/api/orders/buyer/my-orders?status=${encodeURIComponent(statusOverride || 'all')}&limit=50&page=1`, { token: authToken })
      const nextOrders = Array.isArray(response?.orders) ? response.orders : []
      setBuyerOrders(nextOrders)
      if (activeBuyerTimelineOrderId) {
        const activeOrder = nextOrders.find((row) => String(row?.id || '').trim() === activeBuyerTimelineOrderId)
        if (activeOrder) {
          setBuyerOrderTimeline(buildOrderTrackingTimeline(activeOrder))
        } else {
          setActiveBuyerTimelineOrderId('')
          setBuyerOrderTimeline([])
        }
      }
      return nextOrders
    } catch (error) {
      setBuyerOrders([])
      if (activeBuyerTimelineOrderId) {
        setActiveBuyerTimelineOrderId('')
        setBuyerOrderTimeline([])
      }
      flashNotice(error instanceof Error ? error.message : 'Could not load your orders')
      return []
    } finally {
      setIsLoadingBuyerOrders(false)
    }
  }

  const loadBuyerOrdersEffect = useEffectEvent((statusOverride = buyerOrderStatusFilter) => {
    loadBuyerOrders(statusOverride)
  })

  const loadBuyerOrderTimeline = async (orderId) => {
    const id = String(orderId || '').trim()
    if (!id) {
      flashNotice('Invalid order id')
      return
    }
    setIsLoadingBuyerTimeline(true)
    setActiveBuyerTimelineOrderId(id)
    try {
      const order = buyerOrders.find((row) => String(row?.id || '').trim() === id)
      if (!order) {
        setBuyerOrderTimeline([])
        flashNotice('Timeline unavailable for this order')
        return
      }
      const timeline = buildOrderTrackingTimeline(order)
      setBuyerOrderTimeline(timeline)
      flashNotice('Order status loaded')
    } finally {
      setIsLoadingBuyerTimeline(false)
    }
  }

  const cancelBuyerOrder = async (orderId) => {
    const id = String(orderId || '').trim()
    if (!authToken || !id) {
      return
    }
    setBuyerUpdatingOrderActionId(`${id}:cancel`)
    try {
      const reason = buyerCancelReasonDrafts[id]
      const response = await apiPost(`/api/orders/${encodeURIComponent(id)}/cancel`, { reason: reason || undefined }, { token: authToken })
      setBuyerCancelReasonDrafts((prev) => ({ ...prev, [id]: '' }))
      flashNotice(response?.refund_status ? 'Order cancelled. Refund review is now pending.' : 'Order cancelled')
      await loadBuyerOrders()
      if (activeBuyerTimelineOrderId === id) {
        await loadBuyerOrderTimeline(id)
      }
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not cancel order')
    } finally {
      setBuyerUpdatingOrderActionId('')
    }
  }

  const requestBuyerReturn = async (orderId) => {
    const id = String(orderId || '').trim()
    if (!authToken || !id) {
      return
    }
    const reason = String(buyerReturnReasonDrafts[id] || '').trim()
    if (!reason) {
      flashNotice('Choose a return reason first')
      return
    }
    setBuyerUpdatingOrderActionId(`${id}:return`)
    try {
      await apiPost(`/api/orders/${encodeURIComponent(id)}/return-request`, { reason }, { token: authToken })
      setBuyerReturnReasonDrafts((prev) => ({ ...prev, [id]: '' }))
      flashNotice('Return requested')
      await loadBuyerOrders()
      if (activeBuyerTimelineOrderId === id) {
        await loadBuyerOrderTimeline(id)
      }
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not request return')
    } finally {
      setBuyerUpdatingOrderActionId('')
    }
  }

  const runAdminOrderCareAction = async (orderId, action) => {
    const id = String(orderId || '').trim()
    if (!authToken || userRole !== 'admin' || !id) {
      return
    }
    const configs = {
      schedule_pickup: {
        endpoint: `/api/orders/system/schedule-pickup/${encodeURIComponent(id)}`,
        message: 'Pickup scheduled',
      },
      mark_picked_up: {
        endpoint: `/api/orders/system/pickup-complete/${encodeURIComponent(id)}`,
        message: 'Pickup marked complete',
      },
      complete_return_refund: {
        endpoint: `/api/orders/system/refund/${encodeURIComponent(id)}`,
        message: 'Return refund completed',
      },
      complete_cancellation_refund: {
        endpoint: `/api/orders/system/cancellation-refund/${encodeURIComponent(id)}`,
        message: 'Cancellation refund completed',
      },
    }
    const config = configs[action]
    if (!config) {
      return
    }
    setAdminUpdatingOrderCareId(`${id}:${action}`)
    try {
      await apiPost(config.endpoint, {}, { token: authToken })
      flashNotice(config.message)
      await Promise.all([loadAdminOrderCareCases(), loadAdminOrderSummary()])
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not update order care case')
    } finally {
      setAdminUpdatingOrderCareId('')
    }
  }

  useEffect(() => {
    if (!authToken || activeQuickPanel !== 'account' || accountView !== 'orders') {
      return
    }
    loadBuyerOrdersEffect(buyerOrderStatusFilter)
  }, [authToken, activeQuickPanel, accountView, buyerOrderStatusFilter])

  useEffect(() => {
    if (!authToken || activeQuickPanel !== 'account' || accountView !== 'orders') {
      return
    }
    const timer = setInterval(() => {
      loadBuyerOrdersEffect(buyerOrderStatusFilter)
    }, 15000)
    return () => clearInterval(timer)
  }, [authToken, activeQuickPanel, accountView, buyerOrderStatusFilter])

  const submitSellerRequest = async (event) => {
    event.preventDefault()
    if (!authToken) {
      flashNotice('Login required')
      return
    }
    if (sellerOnboarding.status === 'requested') {
      flashNotice('Your seller request is already under review')
      return
    }
    if (userRole === 'seller' || sellerOnboarding.status === 'verified') {
      flashNotice('Your account is already verified as seller')
      return
    }
    const emailInput = sellerRequestForm.email.trim()
    const normalizedEmail = emailInput ? validateEmail(emailInput) : undefined
    if (emailInput && !normalizedEmail) {
      flashNotice('Enter a valid seller support email')
      return
    }
    const payload = {
      legal_name: sanitizeText(sellerRequestForm.legal_name, 120),
      brand_name: sanitizeText(sellerRequestForm.brand_name, 120),
      category: sanitizeText(sellerRequestForm.category, 80),
      description: sanitizeText(sellerRequestForm.description, 600),
      email: normalizedEmail,
      logo_url: sellerRequestForm.logo_url.trim() || undefined,
      documents: {
        pan_card: sellerRequestForm.pan_card.trim().toUpperCase(),
        gst_certificate: sellerRequestForm.gst_certificate.trim().toUpperCase(),
        address_proof: sanitizeText(sellerRequestForm.address_proof, 240),
      },
    }
    if (!payload.legal_name || !payload.brand_name || !payload.category || !payload.documents.pan_card || !payload.documents.gst_certificate || !payload.documents.address_proof) {
      flashNotice('Complete seller request form')
      return
    }
    setIsSubmittingSellerRequest(true)
    try {
      await apiPost('/api/auth/request-seller', payload, { token: authToken })
      setSellerOnboarding({
        status: 'requested',
        requestedAt: new Date().toISOString(),
        rejectedAt: '',
        rejectedReason: '',
        request: {
          legal_name: payload.legal_name,
          brand_name: payload.brand_name,
          category: payload.category,
          description: payload.description,
          email: payload.email || '',
          logo_url: payload.logo_url || '',
          documents: {
            pan_card: payload.documents.pan_card,
            gst_certificate: payload.documents.gst_certificate,
            address_proof: payload.documents.address_proof,
          },
        },
      })
      flashNotice('Seller request submitted and pending review')
      setAccountView('menu')
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not submit seller request')
    } finally {
      setIsSubmittingSellerRequest(false)
    }
  }

  const refreshSellerDashboard = async () => {
    if (!authToken || (userRole !== 'seller' && sellerOnboarding.status !== 'verified')) {
      return
    }
    try {
      const [perfData, prodData, walletData, profData, regionsData, offersData, bankData, ordersData, shippingPartnersData, notificationsData] = await Promise.all([
        apiGet('/api/seller/performance', { token: authToken }).catch(() => null),
        apiGet('/api/seller/my-products', { token: authToken }).catch(() => null),
        apiGet('/api/seller/wallet', { token: authToken }).catch(() => null),
        apiGet('/api/seller/profile', { token: authToken }).catch(() => null),
        apiGet('/api/seller/serviceable-regions', { token: authToken }).catch(() => null),
        apiGet('/api/seller/offers', { token: authToken }).catch(() => null),
        apiGet('/api/seller/bank-account', { token: authToken }).catch(() => null),
        apiGet(`/api/seller/orders?status=${encodeURIComponent(sellerOrderStatusFilter)}&limit=50&page=1`, { token: authToken }).catch(() => null),
        apiGet('/api/seller/shipping-partners/catalog?limit=100', { token: authToken }).catch(() => null),
        apiGet('/api/seller/notifications?limit=20', { token: authToken }).catch(() => null),
      ])
      const nextOrders = Array.isArray(ordersData?.orders) ? ordersData.orders : []
      setSellerPerformance(perfData)
      setSellerProducts(Array.isArray(prodData?.products) ? prodData.products : [])
      setSellerWallet(walletData && typeof walletData === 'object' ? walletData : null)
      setSellerDashboardProfile(profData)
      setSellerAllIndia(Boolean(regionsData?.all_india))
      setSellerServiceableRegions(Array.isArray(regionsData?.serviceable_regions) ? regionsData.serviceable_regions : [])
      setSellerOffers(Array.isArray(offersData?.offers) ? offersData.offers : [])
      setSellerOrders(nextOrders)
      setSellerShippingPartners(Array.isArray(shippingPartnersData?.partners) ? shippingPartnersData.partners : [])
      setSellerNotifications(Array.isArray(notificationsData?.notifications) ? notificationsData.notifications : [])
      syncSellerShipmentState(nextOrders)
      const savedBank = bankData?.bank_account || null
      setSellerSavedBankAccount(savedBank)
      setUseSavedBankForPayout(Boolean(savedBank))
      if (savedBank) {
        setSellerBankAccountForm((prev) => ({
          ...prev,
          account_holder_name: savedBank.account_holder_name || '',
          ifsc_code: savedBank.ifsc_code || '',
          bank_name: savedBank.bank_name || '',
          bank_account_number: '',
        }))
        setSellerPayoutForm((prev) => ({
          ...prev,
          account_holder_name: savedBank.account_holder_name || prev.account_holder_name,
          ifsc_code: savedBank.ifsc_code || prev.ifsc_code,
          bank_name: savedBank.bank_name || prev.bank_name,
          bank_account_number: '',
        }))
      }
      setSellerProfileForm({
        support_email: profData?.brand?.email || '',
        short_tagline: profData?.brand?.short_tagline || '',
        logo_url: profData?.brand?.logo_url || '',
        description: profData?.brand?.description || '',
      })
    } catch {
      flashNotice('Could not refresh seller dashboard')
    }
  }

  const loadSellerOrders = async (statusOverride = sellerOrderStatusFilter) => {
    if (!authToken || (userRole !== 'seller' && sellerOnboarding.status !== 'verified')) {
      return
    }
    setIsLoadingSellerOrders(true)
    try {
      const response = await apiGet(`/api/seller/orders?status=${encodeURIComponent(statusOverride || 'all')}&limit=50&page=1`, { token: authToken })
      const nextOrders = Array.isArray(response?.orders) ? response.orders : []
      setSellerOrders(nextOrders)
      syncSellerShipmentState(nextOrders)
    } catch (error) {
      setSellerOrders([])
      flashNotice(error instanceof Error ? error.message : 'Could not load seller orders')
    } finally {
      setIsLoadingSellerOrders(false)
    }
  }

  const loadSellerOrdersEffect = useEffectEvent((statusOverride = sellerOrderStatusFilter) => {
    loadSellerOrders(statusOverride)
  })

  const saveSellerProfile = async (event) => {
    event.preventDefault()
    if (!authToken) {
      return
    }
    const supportEmailInput = sellerProfileForm.support_email.trim()
    const supportEmail = supportEmailInput ? validateEmail(supportEmailInput) : undefined
    if (supportEmailInput && !supportEmail) {
      flashNotice('Enter a valid support email')
      return
    }
    const payload = {
      support_email: supportEmail,
      short_tagline: sanitizeText(sellerProfileForm.short_tagline, 120) || undefined,
      logo_url: sellerProfileForm.logo_url.trim() || undefined,
      description: sanitizeText(sellerProfileForm.description, 800) || undefined,
    }
    setIsSavingSellerProfile(true)
    try {
      await apiPatch('/api/seller/profile', payload, { token: authToken })
      flashNotice('Seller profile updated')
      await refreshSellerDashboard()
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not update seller profile')
    } finally {
      setIsSavingSellerProfile(false)
    }
  }

  const uploadSellerLogo = async () => {
    if (!authToken) {
      return
    }
    if (!sellerLogoFile) {
      flashNotice('Select a logo image first')
      return
    }
    setIsUploadingSellerLogo(true)
    try {
      const formData = new FormData()
      formData.append('file', sellerLogoFile)
      const response = await apiPost('/api/uploads/brand-logo', formData, { token: authToken })
      const logoUrl = response?.logo_url || ''
      if (logoUrl) {
        setSellerProfileForm((prev) => ({ ...prev, logo_url: logoUrl }))
      }
      setSellerLogoFile(null)
      flashNotice('Logo uploaded')
      await refreshSellerDashboard()
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not upload logo')
    } finally {
      setIsUploadingSellerLogo(false)
    }
  }

  const submitSellerDocuments = async (event) => {
    event.preventDefault()
    if (!authToken) {
      return
    }
    const payload = {
      pan_card: sellerDocumentsForm.pan_card.trim().toUpperCase(),
      gst_certificate: sellerDocumentsForm.gst_certificate.trim().toUpperCase(),
      address_proof: sellerDocumentsForm.address_proof.trim(),
    }
    if (!payload.pan_card || !payload.gst_certificate || !payload.address_proof) {
      flashNotice('Complete all document fields')
      return
    }
    setIsSubmittingSellerDocuments(true)
    try {
      await apiPost('/api/seller/documents', payload, { token: authToken })
      flashNotice('Seller documents submitted')
      setSellerDocumentsForm({ pan_card: '', gst_certificate: '', address_proof: '' })
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not submit documents')
    } finally {
      setIsSubmittingSellerDocuments(false)
    }
  }

  const enableSellerAllIndiaDelivery = async () => {
    if (!authToken) {
      return
    }
    setIsSavingSellerAllIndia(true)
    try {
      await apiPost('/api/seller/serviceable-regions/all-india', {}, { token: authToken })
      flashNotice('All India delivery enabled')
      await refreshSellerDashboard()
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not enable All India delivery')
    } finally {
      setIsSavingSellerAllIndia(false)
    }
  }

  const addSellerRegion = () => {
    const state = sellerRegionForm.state.trim()
    const city = sellerRegionForm.city.trim()
    if (!state) {
      flashNotice('Select a state')
      return
    }
    const exists = sellerServiceableRegions.some((item) =>
      item?.state?.toLowerCase() === state.toLowerCase()
      && (item?.city || '').toLowerCase() === city.toLowerCase(),
    )
    if (exists) {
      flashNotice('Region already added')
      return
    }
    setSellerServiceableRegions((prev) => ([
      ...prev,
      {
        state,
        city: city || null,
        delivery_enabled: true,
        cod_enabled: Boolean(sellerRegionForm.cod_enabled),
      },
    ]))
    setSellerRegionForm({ state: '', city: '', cod_enabled: false })
  }

  const removeSellerRegion = (state, city) => {
    setSellerServiceableRegions((prev) =>
      prev.filter((item) => !(
        item?.state?.toLowerCase() === (state || '').toLowerCase()
        && (item?.city || '').toLowerCase() === (city || '').toLowerCase()
      )),
    )
  }

  const saveSellerServiceableRegions = async () => {
    if (!authToken) {
      return
    }
    if (sellerAllIndia) {
      flashNotice('Disable All India first to use state/city serviceability')
      return
    }
    if (!sellerServiceableRegions.length) {
      flashNotice('Add at least one state/city region')
      return
    }
    setIsSavingSellerRegions(true)
    try {
      await apiPost('/api/seller/serviceable-regions', sellerServiceableRegions, { token: authToken })
      flashNotice('State/city serviceability updated')
      await refreshSellerDashboard()
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not update state/city serviceability')
    } finally {
      setIsSavingSellerRegions(false)
    }
  }

  const saveSellerBankAccount = async (event) => {
    event.preventDefault()
    if (!authToken) {
      return
    }
    const payload = {
      account_holder_name: sellerBankAccountForm.account_holder_name.trim(),
      bank_account_number: sellerBankAccountForm.bank_account_number.replace(/\s+/g, ''),
      ifsc_code: sellerBankAccountForm.ifsc_code.trim().toUpperCase(),
      bank_name: sellerBankAccountForm.bank_name.trim() || undefined,
    }
    if (!payload.account_holder_name || !payload.bank_account_number || payload.ifsc_code.length !== 11) {
      flashNotice('Complete valid bank account details')
      return
    }
    setIsSavingSellerBankAccount(true)
    try {
      const response = await apiPost('/api/seller/bank-account', payload, { token: authToken })
      const saved = response?.bank_account || null
      setSellerSavedBankAccount(saved)
      setUseSavedBankForPayout(true)
      setSellerBankAccountForm((prev) => ({ ...prev, bank_account_number: '' }))
      setSellerPayoutForm((prev) => ({
        ...prev,
        account_holder_name: saved?.account_holder_name || prev.account_holder_name,
        ifsc_code: saved?.ifsc_code || prev.ifsc_code,
        bank_name: saved?.bank_name || prev.bank_name,
        bank_account_number: '',
      }))
      flashNotice('Bank account saved')
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not save bank account')
    } finally {
      setIsSavingSellerBankAccount(false)
    }
  }

  const enableSellerCod = async () => {
    if (!authToken) {
      return
    }
    setIsEnablingSellerCod(true)
    try {
      await apiPost('/api/seller/enable-cod', {}, { token: authToken })
      flashNotice('COD enabled')
      await refreshSellerDashboard()
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not enable COD')
    } finally {
      setIsEnablingSellerCod(false)
    }
  }

  const assertValidOrderQuantity = (quantity) => {
    const validation = validateQuantity(quantity, 99)
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid quantity')
    }
    return validation.quantity
  }

  const addSellerVariantDraft = () => {
    setSellerProductVariants((prev) => [...prev, createSellerVariantDraft()])
  }

  const updateSellerVariantDraft = (draftId, field, value) => {
    setSellerProductVariants((prev) => prev.map((item) => (item.id === draftId ? { ...item, [field]: value } : item)))
  }

  const removeSellerVariantDraft = (draftId) => {
    setSellerProductVariants((prev) => prev.filter((item) => item.id !== draftId))
  }

  const createSellerProduct = async (event) => {
    event.preventDefault()
    if (!authToken) {
      return
    }
    const images = sellerCreateProductForm.images
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean)
    const normalizedVariants = []
    for (const draft of sellerProductVariants) {
      const label = sanitizeText(draft.label, 40)
      const value = sanitizeText(draft.value, 80)
      const sku = sanitizeText(draft.sku, 40)
      const image = String(draft.image || '').trim()
      const hasAnyField = [label, value, draft.mrp, draft.selling_price, draft.stock, sku, image].some((item) => String(item || '').trim())
      if (!hasAnyField) {
        continue
      }
      const mrpValidation = validatePrice(draft.mrp)
      const sellingPriceValidation = validatePrice(draft.selling_price)
      const stock = Number(draft.stock)
      if (!label || !value || !mrpValidation.valid || !sellingPriceValidation.valid || !Number.isInteger(stock) || stock < 0) {
        flashNotice(`Complete valid fields for variant ${value || label || 'entry'}`)
        return
      }
      if (sellingPriceValidation.price > mrpValidation.price) {
        flashNotice(`Variant ${value || label || 'entry'} has selling price above MRP`)
        return
      }
      normalizedVariants.push({
        label,
        value,
        sku: sku || undefined,
        mrp: mrpValidation.price,
        selling_price: sellingPriceValidation.price,
        stock,
        image: image || undefined,
      })
    }

    const hasVariants = normalizedVariants.length > 0
    const mrpValidation = validatePrice(sellerCreateProductForm.mrp)
    const sellingPriceValidation = validatePrice(sellerCreateProductForm.selling_price)
    const stock = Number(sellerCreateProductForm.stock)
    const sortedVariants = hasVariants
      ? [...normalizedVariants].sort((left, right) => (
        Number(left.selling_price || 0) - Number(right.selling_price || 0)
        || Number(left.mrp || 0) - Number(right.mrp || 0)
        || String(left.value || '').localeCompare(String(right.value || ''))
      ))
      : []
    const fallbackVariant = sortedVariants[0] || null
    const payload = {
      title: sanitizeText(sellerCreateProductForm.title, 140),
      description: sanitizeText(sellerCreateProductForm.description, 1600) || undefined,
      category: sanitizeText(sellerCreateProductForm.category, 80),
      sub_category: sanitizeText(sellerCreateProductForm.sub_category, 80) || undefined,
      tags: sellerCreateProductForm.tags.split(',').map((tag) => sanitizeText(tag, 40)).filter(Boolean),
      mrp: hasVariants ? Number(fallbackVariant?.mrp || NaN) : (mrpValidation.valid ? mrpValidation.price : NaN),
      selling_price: hasVariants ? Number(fallbackVariant?.selling_price || NaN) : (sellingPriceValidation.valid ? sellingPriceValidation.price : NaN),
      stock: hasVariants ? normalizedVariants.reduce((sum, item) => sum + Number(item.stock || 0), 0) : stock,
      images,
      variants: normalizedVariants,
    }
    if (
      !payload.title
      || !payload.category
      || (!hasVariants && (!mrpValidation.valid || !sellingPriceValidation.valid || !Number.isInteger(payload.stock) || payload.stock < 0))
      || (hasVariants && normalizedVariants.length === 0)
      || images.length === 0
    ) {
      flashNotice('Complete valid product details')
      return
    }
    if (payload.selling_price > payload.mrp) {
      flashNotice('Selling price cannot exceed MRP')
      return
    }
    setIsCreatingSellerProduct(true)
    try {
      await apiPost('/api/products/create', payload, { token: authToken })
      flashNotice('Product created')
      setSellerCreateProductForm({
        title: '',
        description: '',
        category: '',
        sub_category: '',
        tags: '',
        mrp: '',
        selling_price: '',
        stock: '',
        images: '',
      })
      setSellerProductVariants([])
      await refreshSellerDashboard()
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not create product')
    } finally {
      setIsCreatingSellerProduct(false)
    }
  }

  const uploadSellerProductImages = async () => {
    if (!authToken) {
      return
    }
    if (!Array.isArray(sellerProductUploadFiles) || sellerProductUploadFiles.length === 0) {
      flashNotice('Select image files first')
      return
    }

    const currentUrls = sellerCreateProductForm.images
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean)

    if (currentUrls.length + sellerProductUploadFiles.length > 7) {
      flashNotice('Maximum 7 images allowed per product')
      return
    }

    setIsUploadingSellerProductImages(true)
    try {
      const uploadedUrls = []
      for (const file of sellerProductUploadFiles) {
        const formData = new FormData()
        formData.append('file', file)
        const response = await apiPost('/api/uploads/product-image', formData, { token: authToken })
        if (response?.image_url) {
          uploadedUrls.push(response.image_url)
        }
      }
      const merged = [...currentUrls, ...uploadedUrls]
      setSellerCreateProductForm((prev) => ({ ...prev, images: merged.join('\n') }))
      setSellerProductUploadFiles([])
      flashNotice(`${uploadedUrls.length} image(s) uploaded`)
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not upload product images')
    } finally {
      setIsUploadingSellerProductImages(false)
    }
  }

  const removeSelectedSellerProductFile = (fileId) => {
    setSellerProductUploadFiles((prev) => prev.filter((file, index) => `${file.name}-${file.size}-${file.lastModified}-${index}` !== fileId))
  }

  const createSellerOffer = async (event) => {
    event.preventDefault()
    if (!authToken) {
      return
    }
    const payload = {
      product_id: sellerOfferForm.product_id.trim(),
      offer_price: Number(sellerOfferForm.offer_price),
      start_at: sellerOfferForm.start_at ? new Date(sellerOfferForm.start_at).toISOString() : '',
      end_at: sellerOfferForm.end_at ? new Date(sellerOfferForm.end_at).toISOString() : '',
      festival_slug: sellerOfferForm.festival_slug.trim() || undefined,
    }
    if (!payload.product_id || !Number.isFinite(payload.offer_price) || !payload.start_at || !payload.end_at) {
      flashNotice('Complete offer fields')
      return
    }
    const selectedProduct = sellerProducts.find((product) => String(product?.id || '').trim() === payload.product_id)
    if (!selectedProduct) {
      flashNotice('Select a valid seller product')
      return
    }
    const basePrice = Number(selectedProduct?.selling_price)
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      flashNotice('Selected product price is unavailable')
      return
    }
    if (payload.offer_price >= basePrice) {
      flashNotice(`Offer price must be lower than product price (${formatCurrency(basePrice)})`)
      return
    }
    const startAtMs = Date.parse(payload.start_at)
    const endAtMs = Date.parse(payload.end_at)
    if (!Number.isFinite(startAtMs) || !Number.isFinite(endAtMs) || startAtMs >= endAtMs) {
      flashNotice('Offer end time must be later than start time')
      return
    }
    setIsCreatingSellerOffer(true)
    try {
      const response = await apiPost('/api/seller/offers', payload, { token: authToken })
      flashNotice(response?.message || 'Offer saved')
      setSellerOfferForm({
        product_id: '',
        offer_price: '',
        start_at: '',
        end_at: '',
        festival_slug: '',
      })
      await refreshSellerDashboard()
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not create offer')
    } finally {
      setIsCreatingSellerOffer(false)
    }
  }

  const pauseSellerOffer = async (offerId) => {
    if (!authToken || !offerId) {
      return
    }
    setSellerUpdatingOfferId(offerId)
    try {
      await apiPatch(`/api/seller/offers/${offerId}/pause`, {}, { token: authToken })
      flashNotice('Offer paused')
      await refreshSellerDashboard()
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not pause offer')
    } finally {
      setSellerUpdatingOfferId('')
    }
  }

  const deleteSellerOffer = async (offerId) => {
    if (!authToken || !offerId) {
      return
    }
    setSellerUpdatingOfferId(offerId)
    try {
      await apiDelete(`/api/seller/offers/${offerId}`, { token: authToken })
      flashNotice('Offer deleted')
      await refreshSellerDashboard()
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not delete offer')
    } finally {
      setSellerUpdatingOfferId('')
    }
  }

  const requestEmergencyPayout = async (event) => {
    event.preventDefault()
    if (!authToken) {
      return
    }
    const payload = {
      amount: Number(sellerPayoutForm.amount),
      account_holder_name: useSavedBankForPayout ? undefined : sellerPayoutForm.account_holder_name.trim(),
      bank_account_number: useSavedBankForPayout ? undefined : sellerPayoutForm.bank_account_number.replace(/\s+/g, ''),
      ifsc_code: useSavedBankForPayout ? undefined : sellerPayoutForm.ifsc_code.trim().toUpperCase(),
      bank_name: useSavedBankForPayout ? undefined : (sellerPayoutForm.bank_name.trim() || undefined),
    }
    const hasSavedBank = Boolean(sellerSavedBankAccount)
    if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
      flashNotice('Enter valid payout amount')
      return
    }
    if (!useSavedBankForPayout && (!payload.account_holder_name || !payload.bank_account_number || payload.ifsc_code.length !== 11)) {
      flashNotice('Complete payout bank fields')
      return
    }
    if (useSavedBankForPayout && !hasSavedBank) {
      flashNotice('Save bank account first or disable "use saved bank account"')
      return
    }
    setIsRequestingEmergencyPayout(true)
    try {
      await apiPost('/api/seller/wallet/emergency-payout', payload, { token: authToken })
      flashNotice('Emergency payout requested')
      setSellerPayoutForm({
        amount: '',
        account_holder_name: '',
        bank_account_number: '',
        ifsc_code: '',
        bank_name: '',
      })
      await refreshSellerDashboard()
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not request payout')
    } finally {
      setIsRequestingEmergencyPayout(false)
    }
  }

  const updateSellerShipmentDraft = (orderId, field, value) => {
    const normalizedOrderId = String(orderId || '').trim()
    if (!normalizedOrderId) {
      return
    }
    setSellerShipmentDrafts((prev) => ({
      ...(prev || {}),
      [normalizedOrderId]: {
        ...(prev?.[normalizedOrderId] || {}),
        [field]: value,
      },
    }))
  }

  const saveSellerOrderShipment = async (orderId, partnerIdOverride = '') => {
    if (!authToken) {
      return
    }
    const normalizedOrderId = String(orderId || '').trim()
    const selectedPartnerId = String(
      partnerIdOverride
      || sellerPartnerSelections[normalizedOrderId]
      || sellerOrders.find((row) => String(row?.id || '').trim() === normalizedOrderId)?.shipping?.partner_id
      || '',
    ).trim()
    const shipmentDraft = sellerShipmentDrafts[normalizedOrderId] || {}
    const trackingNumber = sanitizeText(shipmentDraft.tracking_number || '').trim()
    const trackingUrl = sanitizeText(shipmentDraft.tracking_url || '').trim()
    if (!normalizedOrderId || !selectedPartnerId) {
      flashNotice('Choose a shipping partner first')
      return
    }
    if (trackingNumber.length < 4) {
      flashNotice('Enter the AWB or tracking number')
      return
    }
    setSellerAssigningPartnerOrderId(normalizedOrderId)
    try {
      await apiPost(
        `/api/seller/orders/${encodeURIComponent(normalizedOrderId)}/shipping`,
        {
          partner_id: selectedPartnerId,
          tracking_number: trackingNumber,
          tracking_url: trackingUrl || undefined,
        },
        { token: authToken },
      )
      flashNotice('Shipment saved')
      await loadSellerOrders(sellerOrderStatusFilter)
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not save shipment')
    } finally {
      setSellerAssigningPartnerOrderId('')
    }
  }

  const syncSellerShipmentStatus = async (orderId, status) => {
    if (!authToken) {
      return
    }
    const normalizedOrderId = String(orderId || '').trim()
    const normalizedStatus = String(status || '').trim().toLowerCase()
    if (!normalizedOrderId || !normalizedStatus) {
      flashNotice('Invalid shipping status update')
      return
    }
    const loadingKey = `${normalizedOrderId}:${normalizedStatus}`
    setSellerUpdatingShipmentStatusOrderId(loadingKey)
    try {
      await apiPost(
        `/api/seller/orders/${encodeURIComponent(normalizedOrderId)}/shipping-status`,
        { status: normalizedStatus },
        { token: authToken },
      )
      flashNotice(
        normalizedStatus === 'delivered'
          ? 'Order marked delivered'
          : normalizedStatus === 'out_for_delivery'
            ? 'Order marked out for delivery'
            : 'Shipping status updated',
      )
      await loadSellerOrders(sellerOrderStatusFilter)
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not update shipping status')
    } finally {
      setSellerUpdatingShipmentStatusOrderId('')
    }
  }

  const loadDeliveryPartnerOrders = async (statusOverride = deliveryPartnerOrderStatusFilter) => {
    if (!authToken || userRole !== 'delivery_partner') {
      return
    }
    setIsLoadingDeliveryPartnerOrders(true)
    try {
      const response = await apiGet(`/api/orders/delivery-partner/my-orders?status=${encodeURIComponent(statusOverride || 'all')}&limit=50&page=1`, { token: authToken })
      setDeliveryPartnerOrders(Array.isArray(response?.orders) ? response.orders : [])
    } catch (error) {
      setDeliveryPartnerOrders([])
      flashNotice(error instanceof Error ? error.message : 'Could not load delivery orders')
    } finally {
      setIsLoadingDeliveryPartnerOrders(false)
    }
  }

  const loadDeliveryPartnerOrdersEffect = useEffectEvent((statusOverride = deliveryPartnerOrderStatusFilter) => {
    loadDeliveryPartnerOrders(statusOverride)
  })

  const markDeliveryPartnerOrderOutForDelivery = async (orderId) => {
    if (!authToken || userRole !== 'delivery_partner') {
      return
    }
    const normalizedOrderId = String(orderId || '').trim()
    if (!normalizedOrderId) {
      flashNotice('Invalid order id')
      return
    }
    setDeliveryPartnerMarkingOrderId(normalizedOrderId)
    try {
      const response = await apiPost(`/api/orders/delivery-partner/out-for-delivery/${encodeURIComponent(normalizedOrderId)}`, {}, { token: authToken })
      const otpInfo = response?.otp ? ` OTP: ${response.otp}` : ''
      flashNotice(`Out for delivery updated.${otpInfo}`)
      await loadDeliveryPartnerOrders(deliveryPartnerOrderStatusFilter)
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not update order status')
    } finally {
      setDeliveryPartnerMarkingOrderId('')
    }
  }

  const completeDeliveryPartnerOrder = async (orderId) => {
    if (!authToken || userRole !== 'delivery_partner') {
      return
    }
    const normalizedOrderId = String(orderId || '').trim()
    const otp = String(deliveryPartnerOtpInputs[normalizedOrderId] || '').trim()
    if (!normalizedOrderId) {
      flashNotice('Invalid order id')
      return
    }
    if (otp.length < 4 || otp.length > 6) {
      flashNotice('Enter the buyer delivery OTP')
      return
    }
    setDeliveryPartnerCompletingOrderId(normalizedOrderId)
    try {
      await apiPost(`/api/orders/delivery-partner/complete-delivery/${encodeURIComponent(normalizedOrderId)}`, { otp }, { token: authToken })
      setDeliveryPartnerOtpInputs((prev) => {
        const next = { ...(prev || {}) }
        delete next[normalizedOrderId]
        return next
      })
      flashNotice('Order marked delivered')
      await loadDeliveryPartnerOrders(deliveryPartnerOrderStatusFilter)
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not complete delivery')
    } finally {
      setDeliveryPartnerCompletingOrderId('')
    }
  }

  const submitSellerReturnAction = async (orderIdOverride = '', actionOverride = '') => {
    if (!authToken) {
      return
    }
    const orderId = String(orderIdOverride || sellerOrderOps.order_id || '').trim()
    const actionInput = String(actionOverride || sellerOrderOps.return_action || '').toLowerCase()
    const action = actionInput === 'reject' ? 'reject' : 'accept'
    if (!orderId) {
      flashNotice('Enter order ID')
      return
    }
    setIsSubmittingSellerOrderAction(true)
    try {
      await apiPost(`/api/orders/seller/return-action/${encodeURIComponent(orderId)}?action=${encodeURIComponent(action)}`, {}, { token: authToken })
      flashNotice(action === 'accept' ? 'Return approved' : 'Return rejected')
      await loadSellerOrders()
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not submit return action')
    } finally {
      setIsSubmittingSellerOrderAction(false)
    }
  }

  const loadSellerOrderTimeline = async (orderIdOverride = '') => {
    const orderId = String(orderIdOverride || sellerOrderOps.order_id || '').trim()
    if (!orderId) {
      flashNotice('Enter order ID')
      return
    }
    setIsLoadingSellerTimeline(true)
    try {
      const order = sellerOrders.find((row) => String(row?.id || '').trim() === orderId)
      if (!order) {
        setSellerOrderTimeline([])
        flashNotice('Timeline not available: order not found for this seller account')
        return
      }
      const timeline = buildOrderTrackingTimeline(order)
      setSellerOrderTimeline(timeline)
      flashNotice('Order status loaded')
    } finally {
      setIsLoadingSellerTimeline(false)
    }
  }

  useEffect(() => {
    if (!isSellerPortal || !hasSellerPortalAccess) {
      return
    }
    if (sellerActiveSection !== 'orders') {
      return
    }
    loadSellerOrdersEffect(sellerOrderStatusFilter)
  }, [sellerActiveSection, sellerOrderStatusFilter, isSellerPortal, hasSellerPortalAccess])

  useEffect(() => {
    if (!isDeliveryPortal || !hasDeliveryPortalAccess) {
      setDeliveryPartnerOrders([])
      setDeliveryPartnerOtpInputs({})
      setDeliveryPartnerMarkingOrderId('')
      setDeliveryPartnerCompletingOrderId('')
      return
    }
    loadDeliveryPartnerOrdersEffect(deliveryPartnerOrderStatusFilter)
  }, [isDeliveryPortal, hasDeliveryPortalAccess, deliveryPartnerOrderStatusFilter])

  const loadAdminSellerRequests = async () => {
    if (!authToken || userRole !== 'admin') {
      return
    }
    setIsLoadingAdminSellerRequests(true)
    try {
      const response = await apiGet('/api/admin/seller-requests', { token: authToken })
      setAdminSellerRequests(Array.isArray(response?.requests) ? response.requests : [])
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Failed to load seller requests')
    } finally {
      setIsLoadingAdminSellerRequests(false)
    }
  }

  const loadAdminActiveSellers = async () => {
    if (!authToken || userRole !== 'admin') {
      return
    }
    setIsLoadingAdminActiveSellers(true)
    try {
      const response = await apiGet('/api/admin/sellers/active', { token: authToken })
      setAdminActiveSellers(Array.isArray(response) ? response : [])
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Failed to load active sellers')
    } finally {
      setIsLoadingAdminActiveSellers(false)
    }
  }

  const loadAdminSellerRanking = async () => {
    if (!authToken || userRole !== 'admin') {
      return
    }
    setIsLoadingAdminSellerRanking(true)
    try {
      const response = await apiGet('/api/admin/sellers/ranking', { token: authToken })
      setAdminSellerRanking(Array.isArray(response) ? response : [])
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Failed to load seller ranking')
    } finally {
      setIsLoadingAdminSellerRanking(false)
    }
  }

  const loadAdminRiskDashboard = async () => {
    if (!authToken || userRole !== 'admin') {
      return
    }
    setIsLoadingAdminRiskDashboard(true)
    try {
      const response = await apiGet('/api/admin/dashboard/sellers', { token: authToken })
      setAdminRiskDashboard(response && typeof response === 'object' ? response : null)
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Failed to load risk dashboard')
    } finally {
      setIsLoadingAdminRiskDashboard(false)
    }
  }

  const loadAdminFinanceSummary = async () => {
    if (!authToken || userRole !== 'admin') {
      return
    }
    setIsLoadingAdminFinanceSummary(true)
    try {
      const response = await apiGet('/api/admin/finance/summary', { token: authToken })
      setAdminFinanceSummary(response && typeof response === 'object' ? response : null)
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Failed to load finance summary')
    } finally {
      setIsLoadingAdminFinanceSummary(false)
    }
  }

  const loadAdminOrderSummary = async () => {
    if (!authToken || userRole !== 'admin') {
      return
    }
    setIsLoadingAdminOrderSummary(true)
    try {
      const response = await apiGet('/api/admin/orders/summary', { token: authToken })
      setAdminOrderSummary(response && typeof response === 'object' ? response : null)
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Failed to load order summary')
    } finally {
      setIsLoadingAdminOrderSummary(false)
    }
  }

  const loadAdminOrderCareCases = async () => {
    if (!authToken || userRole !== 'admin') {
      return
    }
    setIsLoadingAdminOrderCareCases(true)
    try {
      const response = await apiGet('/api/admin/orders/care-cases', { token: authToken })
      setAdminOrderCareCases(response && typeof response === 'object' ? response : null)
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Failed to load order care queue')
    } finally {
      setIsLoadingAdminOrderCareCases(false)
    }
  }

  const loadAdminOffersSummary = async () => {
    if (!authToken || userRole !== 'admin') {
      return
    }
    setIsLoadingAdminOffersSummary(true)
    try {
      const response = await apiGet('/api/admin/offers/summary', { token: authToken })
      setAdminOffersSummary(response && typeof response === 'object' ? response : null)
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Failed to load offers summary')
    } finally {
      setIsLoadingAdminOffersSummary(false)
    }
  }

  const loadAdminPayoutRequests = async (statusOverride = adminPayoutStatusFilter) => {
    if (!authToken || userRole !== 'admin') {
      return
    }
    setIsLoadingAdminPayoutRequests(true)
    try {
      const query = statusOverride ? `?status=${encodeURIComponent(statusOverride)}` : ''
      const response = await apiGet(`/api/admin/payout-requests${query}`, { token: authToken })
      setAdminPayoutRequests(Array.isArray(response?.requests) ? response.requests : [])
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Failed to load payout requests')
    } finally {
      setIsLoadingAdminPayoutRequests(false)
    }
  }

  const loadAdminSnapshot = async () => {
    await Promise.all([
      loadAdminSellerRequests(),
      loadAdminActiveSellers(),
      loadAdminSellerRanking(),
      loadAdminRiskDashboard(),
      loadAdminFinanceSummary(),
      loadAdminOrderSummary(),
      loadAdminOrderCareCases(),
      loadAdminOffersSummary(),
      loadAdminPayoutRequests(),
    ])
  }

  const loadAdminSnapshotEffect = useEffectEvent(() => {
    loadAdminSnapshot()
  })

  const loadAdminPayoutRequestsEffect = useEffectEvent((statusOverride = adminPayoutStatusFilter) => {
    loadAdminPayoutRequests(statusOverride)
  })

  const decideSellerRequest = async (userId, action) => {
    if (!authToken || userRole !== 'admin' || !userId) {
      return
    }
    const reason = (adminRejectReasons[userId] || '').trim()
    if (action === 'reject' && !reason) {
      flashNotice('Rejection reason is required')
      return
    }
    setAdminUpdatingSellerId(userId)
    try {
      await apiPost(
        `/api/admin/seller/${userId}/verify-identity`,
        { action, ...(action === 'reject' ? { reason } : {}) },
        { token: authToken },
      )
      setAdminSellerRequests((prev) => prev.filter((item) => item.user_id !== userId))
      setAdminRejectReasons((prev) => ({ ...prev, [userId]: '' }))
      flashNotice(action === 'approve' ? 'Seller approved' : 'Seller rejected')
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not update seller request')
    } finally {
      setAdminUpdatingSellerId('')
    }
  }

  const updateSellerStatus = async (sellerId, action) => {
    if (!authToken || userRole !== 'admin' || !sellerId) {
      return
    }
    const reason = (adminFreezeReasons[sellerId] || '').trim()
    if (action === 'freeze' && !reason) {
      flashNotice('Freeze reason is required')
      return
    }
    setAdminUpdatingSellerActionId(sellerId)
    try {
      const url = action === 'freeze'
        ? `/api/admin/seller/${sellerId}/freeze?reason=${encodeURIComponent(reason)}`
        : `/api/admin/seller/${sellerId}/unfreeze`
      await apiPost(url, {}, { token: authToken })
      if (action === 'freeze') {
        setAdminFreezeReasons((prev) => ({ ...prev, [sellerId]: '' }))
      }
      flashNotice(action === 'freeze' ? 'Seller frozen' : 'Seller unfrozen')
      await Promise.all([loadAdminActiveSellers(), loadAdminRiskDashboard(), loadAdminSellerRanking()])
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not update seller status')
    } finally {
      setAdminUpdatingSellerActionId('')
    }
  }

  const loadSellerRiskSnapshot = async (sellerId) => {
    if (!authToken || userRole !== 'admin' || !sellerId) {
      return
    }
    setAdminLoadingRiskSellerId(sellerId)
    try {
      const response = await apiGet(`/api/admin/sellers/${sellerId}/risk`, { token: authToken })
      setAdminRiskSnapshots((prev) => ({ ...prev, [sellerId]: response }))
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not fetch risk snapshot')
    } finally {
      setAdminLoadingRiskSellerId('')
    }
  }

  const decidePayoutRequest = async (requestId, action, currentStatus = '') => {
    if (!authToken || userRole !== 'admin' || !requestId) {
      return
    }
    const reason = (adminPayoutDecisionReasons[requestId] || '').trim()
    if (action === 'reject' && !reason) {
      flashNotice('Rejection reason is required')
      return
    }
    setAdminUpdatingPayoutId(requestId)
    try {
      const response = await apiPost(`/api/admin/payout-requests/${requestId}/decision`, { action, reason: reason || undefined }, { token: authToken })
      setAdminPayoutDecisionReasons((prev) => ({ ...prev, [requestId]: '' }))
      if (action === 'approve') {
        if (response?.status === 'approved') {
          flashNotice('Payout approved')
        } else if (response?.status === 'failed') {
          flashNotice('Payout failed at provider')
        } else {
          flashNotice('Payout moved to processing')
        }
      } else if (currentStatus === 'failed') {
        flashNotice('Failed payout closed and seller hold released')
      } else {
        flashNotice('Payout rejected and seller hold released')
      }
      await Promise.all([loadAdminPayoutRequests(), loadAdminFinanceSummary()])
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not process payout decision')
    } finally {
      setAdminUpdatingPayoutId('')
    }
  }

  const retryPayoutRequest = async (requestId) => {
    if (!authToken || userRole !== 'admin' || !requestId) {
      return
    }
    setAdminUpdatingPayoutId(requestId)
    try {
      const response = await apiPost(`/api/admin/payout-requests/${requestId}/retry`, {}, { token: authToken })
      if (response?.status === 'approved') {
        flashNotice('Payout approved after retry')
      } else if (response?.status === 'failed') {
        flashNotice('Payout retry failed again')
      } else {
        flashNotice('Payout retry moved to processing')
      }
      await Promise.all([loadAdminPayoutRequests(), loadAdminFinanceSummary()])
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not retry payout')
    } finally {
      setAdminUpdatingPayoutId('')
    }
  }

  const reconcilePayoutRequest = async (requestId) => {
    if (!authToken || userRole !== 'admin' || !requestId) {
      return
    }
    setAdminUpdatingPayoutId(requestId)
    try {
      const response = await apiPost(`/api/admin/payout-requests/${requestId}/reconcile`, {}, { token: authToken })
      flashNotice(`Payout reconciled: ${response?.status || 'updated'}`)
      await Promise.all([loadAdminPayoutRequests(), loadAdminFinanceSummary()])
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not reconcile payout')
    } finally {
      setAdminUpdatingPayoutId('')
    }
  }

  const saveCommissionRate = async () => {
    if (!authToken || userRole !== 'admin') {
      return
    }
    const parsed = Number(commissionInput)
    if (!Number.isFinite(parsed)) {
      flashNotice('Enter a valid commission rate')
      return
    }
    setIsUpdatingCommission(true)
    try {
      await apiPost(`/api/admin/set-commission?rate=${encodeURIComponent(parsed)}`, {}, { token: authToken })
      flashNotice('Commission updated')
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not update commission')
    } finally {
      setIsUpdatingCommission(false)
    }
  }

  const createFestivalOffer = async (event) => {
    event.preventDefault()
    if (!authToken || userRole !== 'admin') {
      return
    }
    const slug = festivalForm.slug.trim()
    const name = festivalForm.name.trim()
    const startAt = festivalForm.start_at
    const endAt = festivalForm.end_at
    const tiers = festivalForm.eligible_tiers
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    if (!slug || !name || !startAt || !endAt || tiers.length === 0) {
      flashNotice('Complete festival fields')
      return
    }
    setIsCreatingFestival(true)
    try {
      await apiPost('/api/admin/festivals', {
        slug,
        name,
        start_at: startAt,
        end_at: endAt,
        eligible_tiers: tiers,
      }, { token: authToken })
      flashNotice('Festival created')
      setFestivalForm((prev) => ({ ...prev, slug: '', name: '' }))
      await loadAdminOffersSummary()
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not create festival')
    } finally {
      setIsCreatingFestival(false)
    }
  }

  useEffect(() => {
    if (authToken && userRole === 'admin' && isAdminPortal) {
      loadAdminSnapshotEffect()
    }
  }, [authToken, userRole, isAdminPortal])

  useEffect(() => {
    if (authToken && userRole === 'admin' && isAdminPortal) {
      loadAdminPayoutRequestsEffect(adminPayoutStatusFilter)
    }
  }, [adminPayoutStatusFilter, authToken, userRole, isAdminPortal])

  const openPortalInNewTab = (mode) => {
    const target = mode === 'admin' ? 'admin' : (mode === 'delivery' ? 'delivery' : 'seller')
    const url = new URL(window.location.href)
    url.searchParams.set('portal', target)
    url.searchParams.delete('p')
    const popup = window.open(url.toString(), '_blank', 'noopener,noreferrer')
    if (!popup) {
      flashNotice('Popup blocked. Please allow popups for this site.')
    } else {
      const label = target === 'admin' ? 'Admin' : (target === 'delivery' ? 'Delivery Partner' : 'Seller')
      flashNotice(`${label} dashboard opened in new tab`)
    }
  }

  const exitPortalMode = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('portal')
    window.history.replaceState({}, '', url)
    setPortalMode('')
  }

  useEffect(() => {
    if (isRestoringSession) {
      return
    }
    if (!portalMode) {
      return
    }
    if (portalMode === 'admin' && hasAdminPortalAccess) {
      return
    }
    if (portalMode === 'seller' && hasSellerPortalAccess) {
      return
    }
    if (portalMode === 'delivery' && hasDeliveryPortalAccess) {
      return
    }
    exitPortalMode()
    flashNotice('Portal access unavailable. Returned to storefront.')
  }, [portalMode, hasAdminPortalAccess, hasSellerPortalAccess, hasDeliveryPortalAccess, isRestoringSession])

  const handleAccountAction = (action) => {
    if (action === 'manage_devices') {
      setAccountView('devices')
      return
    }
    if (action === 'edit_profile') {
      setAccountView('profile')
      return
    }
    if (action === 'saved_cards') {
      setAccountView('cards')
      return
    }
    if (action === 'saved_addresses') {
      openAddressPanel()
      return
    }
    if (action === 'language') {
      setAccountView('language')
      return
    }
    if (action === 'notifications') {
      setAccountView('notifications')
      return
    }
    if (action === 'privacy') {
      setAccountView('privacy')
      return
    }
    if (action === 'my_orders') {
      setAccountView('orders')
      return
    }
    if (action === 'wishlist') {
      setAccountView('wishlist')
      return
    }
    if (action === 'reviews') {
      setAccountView('reviews')
      return
    }
    if (action === 'qa') {
      setAccountView('qa')
      return
    }
    if (action === 'sell') {
      const canOpenSellerPortal = userRole === 'seller' || sellerOnboarding.status === 'verified'
      if (canOpenSellerPortal) {
        openPortalInNewTab('seller')
        return
      }
      setAccountView('sell')
      return
    }
    if (action === 'admin_portal') {
      if (userRole !== 'admin') {
        flashNotice('Admin role required')
        return
      }
      openPortalInNewTab('admin')
      return
    }
    if (action === 'delivery_portal') {
      if (userRole !== 'delivery_partner') {
        flashNotice('Delivery partner role required')
        return
      }
      openPortalInNewTab('delivery')
      return
    }
    if (action === 'terms') {
      setAccountView('terms')
      return
    }
    if (action === 'faqs') {
      setAccountView('faqs')
    }
  }

  const updateCartQty = (id, change) => {
    setCartItems((prev) => {
      const next = prev
        .map((item) => (((item.cart_key || item.id) === id) ? { ...item, qty: Math.max(0, (item.qty || 1) + change) } : item))
        .filter((item) => (item.qty || 0) > 0)
      return next
    })
  }

  const removeCartItem = (id) => {
    setCartItems((prev) => prev.filter((item) => (item.cart_key || item.id) !== id))
    flashNotice('Removed from cart')
  }

  const checkoutCart = () => {
    if (!cartItems.length) {
      flashNotice('Cart is empty')
      return
    }
    setCheckoutFlow('cart')
    setBuyNowItem(null)
    if (!isLoggedIn) {
      setCheckoutPending(true)
      setActiveQuickPanel('auth')
      flashNotice('Login to continue checkout')
      return
    }
    setCheckoutPending(false)
    setSelectedCheckoutAddress(null)
    setActiveQuickPanel('address')
    loadAddresses()
  }

  const buyNow = () => {
    if (!productDetail?.id) {
      return
    }
    if (deliveryCheck.checked && deliveryCheck.deliverable === false && !deliveryCheck.requiresAddressConfirmation) {
      flashNotice('Not deliverable to this pincode')
      return
    }

    const image = selectedImage || detailImages[0] || (Array.isArray(productDetail.images) ? productDetail.images[0] : null)
    const nextItem = buildCartItemFromProduct(productDetail, image || null)
    if (!nextItem) {
      return
    }
    setBuyNowItem(nextItem)
    setCheckoutFlow('buy_now')
    setPaymentError('')
    setSelectedCheckoutAddress(null)

    if (!isLoggedIn) {
      setCheckoutPending(true)
      setActiveQuickPanel('auth')
      flashNotice('Login to continue checkout')
      return
    }

    setCheckoutPending(false)
    setSelectedCheckoutAddress(null)
    setActiveQuickPanel('address')
    loadAddresses()
  }

  const checkDeliveryAvailability = async (event) => {
    event.preventDefault()
    if (!activeProductId) {
      return
    }
    const pincode = deliveryPincode.replace(/\D/g, '').slice(0, 6)
    if (pincode.length !== 6) {
      flashNotice('Enter a valid 6-digit pincode')
      return
    }

    setIsCheckingDelivery(true)
    try {
      const response = await apiGet(`/api/public/product/${activeProductId}/delivery?pincode=${encodeURIComponent(pincode)}`)
      setDeliveryCheck({
        checked: true,
        deliverable: Boolean(response?.deliverable),
        codAvailable: Boolean(response?.cod_available),
        reason: response?.reason || '',
        estimatedDays: Number.isFinite(Number(response?.estimated_days)) ? Number(response.estimated_days) : null,
        requiresAddressConfirmation: Boolean(response?.requires_address_confirmation),
      })
      if (response?.requires_address_confirmation) {
        flashNotice(response?.reason || 'Delivery will be confirmed at checkout address')
      } else if (!response?.deliverable) {
        flashNotice('Delivery unavailable for this pincode')
      }
    } catch (error) {
      setDeliveryCheck({
        checked: true,
        deliverable: false,
        codAvailable: false,
        reason: error instanceof Error ? error.message : 'Could not check delivery',
        estimatedDays: null,
        requiresAddressConfirmation: false,
      })
      flashNotice('Could not check delivery')
    } finally {
      setIsCheckingDelivery(false)
    }
  }

  const submitProductQuestion = async (event) => {
    event.preventDefault()
    if (!activeProductId) {
      return
    }
    const question = questionInput.trim()
    if (!question) {
      flashNotice('Enter your question')
      return
    }
    if (!isLoggedIn) {
      setCheckoutPending(false)
      setActiveQuickPanel('auth')
      flashNotice('Login to ask a question')
      return
    }

    setIsSubmittingQuestion(true)
    try {
      await apiPost(`/api/questions/product/${activeProductId}`, { question }, { token: authToken })
      setQuestionInput('')
      const response = await apiGet(`/api/questions/product/${activeProductId}`)
      setProductQuestions(Array.isArray(response?.items) ? response.items : [])
      flashNotice('Question submitted')
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not submit question')
    } finally {
      setIsSubmittingQuestion(false)
    }
  }

  const detailImages = Array.isArray(productDetail?.images) ? productDetail.images : []
  const detailPricing = getProductPricingMeta(productDetail)
  const detailOffer = detailPricing.activeOffer
  const detailPrice = formatInr(detailPricing.effectivePrice)
  const detailComparePrice = formatInr(detailPricing.comparePrice)
  const detailHasStrike = detailPricing.hasComparePrice
  const isPdp = Boolean(activeProductId)
  const isWishlisted = Boolean(activeProductId && wishlistIds.includes(activeProductId))
  const prevIsPdpRef = useRef(isPdp)
  const [viewTransition, setViewTransition] = useState('')
  const isCheckoutFlow = checkoutFlow === 'cart' || (checkoutFlow === 'buy_now' && Boolean(buyNowItem))
  const checkoutItems = checkoutFlow === 'buy_now' && buyNowItem
    ? [buyNowItem]
    : (checkoutFlow === 'cart' ? cartItems : [])
  const checkoutItemTotal = checkoutItems.reduce((sum, item) => sum + Number(item.qty || 1), 0)
  const checkoutSubtotal = checkoutItems.reduce((sum, item) => {
    const line = Number(item.price || 0) * Number(item.qty || 1)
    return Number.isFinite(line) ? sum + line : sum
  }, 0)
  const cartItemTotal = cartItems.reduce((sum, item) => sum + Number(item.qty || 1), 0)
  const cartSubtotal = cartItems.reduce((sum, item) => {
    const line = Number(item.price || 0) * Number(item.qty || 1)
    return Number.isFinite(line) ? sum + line : sum
  }, 0)
  const categoryProducts = useMemo(() => {
    const needle = activeCategoryQuery.toLowerCase()
    const filtered = products.filter((item) => {
      const haystack = [item?.title, item?.category, item?.sub_category].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(needle)
    })
    return filtered.length ? filtered : products
  }, [products, activeCategoryQuery])
  const spotlightProducts = categoryProducts.slice(0, 8)
  const launchProducts = categoryProducts.slice(8, 16)
  const heroProduct = categoryProducts[0] || null
  const homeOfferLead = offerHighlights[0] || null
  const homeOfferLeadPricing = homeOfferLead ? getProductPricingMeta(homeOfferLead) : null
  const homeOfferTiles = offerHighlights.slice(1, 5)
  const accountViewTitle = ({
    menu: 'Account Settings',
    devices: 'Manage Devices',
    profile: 'Edit Profile',
    cards: 'Payments & Security',
    language: 'Select Language',
    notifications: 'Notification Settings',
    privacy: 'Privacy Center',
    orders: 'My Orders',
    wishlist: 'My Wishlist',
    reviews: 'Reviews',
    qa: 'Questions & Answers',
    sell: 'Sell on Brandcart',
    terms: 'Terms & Policies',
    faqs: 'FAQs',
  })[accountView] || 'Account Settings'
  const accountMenuNeedle = accountMenuQuery.trim().toLowerCase()
  const accountMenuMatches = (label) => {
    if (!accountMenuNeedle) {
      return true
    }
    const text = typeof label === 'string' ? label : String(label || '')
    return text.toLowerCase().includes(accountMenuNeedle)
  }
  const buyerOrderStats = {
    total: buyerOrders.length,
    active: buyerOrders.filter((order) => !['delivered', 'cancelled', 'rto'].includes(normalizeOrderStatus(order?.status))).length,
    returns: buyerOrders.filter((order) => {
      const returnStatus = normalizeOrderStatus(order?.return?.status)
      const pickupStatus = normalizeOrderStatus(order?.return?.pickup_status)
      return Boolean(returnStatus || pickupStatus)
    }).length,
    refundsPending: buyerOrders.filter((order) => {
      const returnRefundStatus = normalizeOrderStatus(order?.return?.refund_status)
      const cancellationRefundStatus = normalizeOrderStatus(order?.cancellation?.refund_status)
      return ['pending_manual_review', 'processing'].includes(returnRefundStatus)
        || ['pending_manual_review', 'processing'].includes(cancellationRefundStatus)
    }).length,
  }
  const adminOrderCareSummary = adminOrderCareCases?.summary || {}
  const adminCancellationQueue = Array.isArray(adminOrderCareCases?.cancellation_queue) ? adminOrderCareCases.cancellation_queue : []
  const adminReturnQueue = Array.isArray(adminOrderCareCases?.return_queue) ? adminOrderCareCases.return_queue : []
  const adminRefundQueue = Array.isArray(adminOrderCareCases?.refund_queue) ? adminOrderCareCases.refund_queue : []
  const adminOrderCareTotal = adminCancellationQueue.length + adminReturnQueue.length + adminRefundQueue.length

  useEffect(() => {
    const previous = prevIsPdpRef.current
    if (previous !== isPdp) {
      setViewTransition(isPdp ? 'to-pdp' : 'to-home')
      const timer = setTimeout(() => setViewTransition(''), 380)
      prevIsPdpRef.current = isPdp
      return () => clearTimeout(timer)
    }
    prevIsPdpRef.current = isPdp
    return undefined
  }, [isPdp])

  if (isAdminPortal && hasAdminPortalAccess) {
    return (
      <main className="admin-shell">
        <header className="admin-header">
          <div>
            <p className="admin-kicker">Brandcart Operations</p>
            <h1>Admin Dashboard</h1>
            <p className="admin-meta">Logged in as {userPhone || 'admin'}</p>
          </div>
          <div className="admin-header-actions">
            <button type="button" className="account-inline-btn" onClick={exitPortalMode}>Back to Storefront</button>
            <button
              type="button"
              className="account-inline-btn"
              onClick={loadAdminSnapshot}
              disabled={
                isLoadingAdminSellerRequests
                || isLoadingAdminActiveSellers
                || isLoadingAdminSellerRanking
                || isLoadingAdminRiskDashboard
                || isLoadingAdminFinanceSummary
                || isLoadingAdminOrderSummary
                || isLoadingAdminOrderCareCases
                || isLoadingAdminOffersSummary
                || isLoadingAdminPayoutRequests
              }
            >
              Refresh All
            </button>
            <button type="button" className="account-primary-btn" onClick={logout}>Logout</button>
          </div>
        </header>

        <section className="admin-panel">
          <div className="admin-panel-head">
            <h2>Platform Snapshot</h2>
            <span>Live backend data</span>
          </div>
          <div className="admin-metrics-grid">
            <article className="admin-metric-card">
              <strong>Total Sellers</strong>
              <p>{isLoadingAdminRiskDashboard ? '...' : Number(adminRiskDashboard?.summary?.total_sellers || 0)}</p>
            </article>
            <article className="admin-metric-card">
              <strong>Frozen Sellers</strong>
              <p>{isLoadingAdminRiskDashboard ? '...' : Number(adminRiskDashboard?.summary?.frozen_sellers || 0)}</p>
            </article>
            <article className="admin-metric-card">
              <strong>Probation Sellers</strong>
              <p>{isLoadingAdminRiskDashboard ? '...' : Number(adminRiskDashboard?.summary?.probation_sellers || 0)}</p>
            </article>
            <article className="admin-metric-card">
              <strong>Low Trust Sellers</strong>
              <p>{isLoadingAdminRiskDashboard ? '...' : Number(adminRiskDashboard?.summary?.low_trust_sellers || 0)}</p>
            </article>
            <article className="admin-metric-card">
              <strong>Pending COD</strong>
              <p>{isLoadingAdminFinanceSummary ? '...' : (formatInr(adminFinanceSummary?.pending_cod_amount) || '₹0')}</p>
            </article>
            <article className="admin-metric-card">
              <strong>Unsettled Payouts</strong>
              <p>{isLoadingAdminFinanceSummary ? '...' : (formatInr(adminFinanceSummary?.unsettled_payouts) || '₹0')}</p>
            </article>
            <article className="admin-metric-card">
              <strong>Reserve Locked</strong>
              <p>{isLoadingAdminFinanceSummary ? '...' : (formatInr(adminFinanceSummary?.reserve_locked) || '₹0')}</p>
            </article>
            <article className="admin-metric-card">
              <strong>Emergency Payouts Requested</strong>
              <p>
                {isLoadingAdminFinanceSummary
                  ? '...'
                  : `${formatInr(adminFinanceSummary?.emergency_payout_requested_amount) || '₹0'} / ${Number(adminFinanceSummary?.emergency_payout_requested_count || 0)}`}
              </p>
            </article>
            <article className="admin-metric-card">
              <strong>Emergency Payouts Processing</strong>
              <p>
                {isLoadingAdminFinanceSummary
                  ? '...'
                  : `${formatInr(adminFinanceSummary?.emergency_payout_processing_amount) || '₹0'} / ${Number(adminFinanceSummary?.emergency_payout_processing_count || 0)}`}
              </p>
            </article>
            <article className="admin-metric-card">
              <strong>Total Orders</strong>
              <p>{isLoadingAdminOrderSummary ? '...' : Number(adminOrderSummary?.total_orders || 0)}</p>
            </article>
            <article className="admin-metric-card">
              <strong>RTO Orders</strong>
              <p>{isLoadingAdminOrderSummary ? '...' : Number(adminOrderSummary?.rto_orders || 0)}</p>
            </article>
            <article className="admin-metric-card">
              <strong>Refunds Completed</strong>
              <p>{isLoadingAdminOrderSummary ? '...' : Number(adminOrderSummary?.refunds_completed || 0)}</p>
            </article>
            <article className="admin-metric-card">
              <strong>Delivered Orders</strong>
              <p>{isLoadingAdminOrderSummary ? '...' : Number(adminOrderSummary?.delivered_orders || 0)}</p>
            </article>
            <article className="admin-metric-card">
              <strong>High Risk Sellers</strong>
              <p>{isLoadingAdminRiskDashboard ? '...' : Number(adminRiskDashboard?.risky_sellers?.length || 0)}</p>
            </article>
            <article className="admin-metric-card">
              <strong>Active Offers</strong>
              <p>{isLoadingAdminOffersSummary ? '...' : Number(adminOffersSummary?.summary?.active_offers || 0)}</p>
            </article>
            <article className="admin-metric-card">
              <strong>Sellers Running Offers</strong>
              <p>{isLoadingAdminOffersSummary ? '...' : Number(adminOffersSummary?.summary?.sellers_running_offers || 0)}</p>
            </article>
            <article className="admin-metric-card">
              <strong>Festival Offers</strong>
              <p>{isLoadingAdminOffersSummary ? '...' : Number(adminOffersSummary?.summary?.festival_offers || 0)}</p>
            </article>
            <article className="admin-metric-card">
              <strong>Scheduled Offers</strong>
              <p>{isLoadingAdminOffersSummary ? '...' : Number(adminOffersSummary?.summary?.scheduled_offers || 0)}</p>
            </article>
            <article className="admin-metric-card">
              <strong>Live Festivals</strong>
              <p>{isLoadingAdminOffersSummary ? '...' : Number(adminOffersSummary?.summary?.live_festivals || 0)}</p>
            </article>
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head">
            <h2>Order Care Desk</h2>
            <span>{isLoadingAdminOrderCareCases ? 'Loading...' : `${adminOrderCareTotal} active case cards`}</span>
          </div>
          <div className="admin-metrics-grid">
            <article className="admin-metric-card">
              <strong>Buyer Cancellations</strong>
              <p>{isLoadingAdminOrderCareCases ? '...' : Number(adminOrderCareSummary?.buyer_cancellations || 0)}</p>
            </article>
            <article className="admin-metric-card">
              <strong>Cancellation Refunds Pending</strong>
              <p>{isLoadingAdminOrderCareCases ? '...' : Number(adminOrderCareSummary?.prepaid_cancellation_refunds_pending || 0)}</p>
            </article>
            <article className="admin-metric-card">
              <strong>Open Return Requests</strong>
              <p>{isLoadingAdminOrderCareCases ? '...' : Number(adminOrderCareSummary?.open_return_requests || 0)}</p>
            </article>
            <article className="admin-metric-card">
              <strong>Pickup Scheduled</strong>
              <p>{isLoadingAdminOrderCareCases ? '...' : Number(adminOrderCareSummary?.pickup_scheduled || 0)}</p>
            </article>
            <article className="admin-metric-card">
              <strong>Refunds Pending</strong>
              <p>{isLoadingAdminOrderCareCases ? '...' : Number(adminOrderCareSummary?.refunds_pending || 0)}</p>
            </article>
          </div>
          {isLoadingAdminOrderCareCases && <p className="quick-panel-meta">Loading order care queue...</p>}
          {!isLoadingAdminOrderCareCases && adminOrderCareTotal === 0 && (
            <p className="quick-panel-meta">No active cancellation, pickup, or refund cases right now.</p>
          )}
          {!isLoadingAdminOrderCareCases && adminOrderCareTotal > 0 && (
            <div className="admin-care-layout">
              <div className="admin-care-column">
                <div className="admin-care-heading">
                  <h3>Cancellations</h3>
                  <span>Pre-shipment buyer cancellations and refund review</span>
                </div>
                <div className="admin-request-list">
                  {adminCancellationQueue.length === 0 && <p className="quick-panel-meta">No buyer cancellations waiting here.</p>}
                  {adminCancellationQueue.map((item) => {
                    const refundActionKey = `${item.order_id}:complete_cancellation_refund`
                    const isUpdatingRefund = adminUpdatingOrderCareId === refundActionKey
                    return (
                      <article className="account-tile admin-care-ticket" key={`cancel-${item.order_id}`}>
                        <div className="admin-care-ticket-head">
                          <div>
                            <strong>{item?.product?.title || 'Cancelled order'}</strong>
                            <p>Order {item?.order_id || '-'}</p>
                          </div>
                          <span className={`status-chip is-${getStatusTone(item?.status)}`}>{formatStatusText(item?.status)}</span>
                        </div>
                        <p>Seller: {item?.seller_brand || '-'}</p>
                        <p>Buyer Area: {[item?.buyer_city, item?.buyer_pincode].filter(Boolean).join(' | ') || '-'}</p>
                        <p>Amount: {formatCurrency(item?.pricing?.subtotal || 0)} | Payment: {formatStatusText(item?.payment?.method)} / {formatStatusText(item?.payment?.status)}</p>
                        <p>Cancelled: {formatDateTime(item?.cancellation?.requested_at || item?.updated_at)}</p>
                        {item?.cancellation?.reason && <p>Reason: {formatStatusText(item.cancellation.reason)}</p>}
                        <div className="buyer-order-care">
                          {item?.payment?.status && (
                            <span className={`status-chip is-${getStatusTone(item.payment.status)}`}>
                              Payment {formatStatusText(item.payment.status)}
                            </span>
                          )}
                          {item?.cancellation?.refund_status && (
                            <span className={`status-chip is-${getStatusTone(item.cancellation.refund_status)}`}>
                              Refund {formatStatusText(item.cancellation.refund_status)}
                            </span>
                          )}
                        </div>
                        {item?.cancellation?.refund_note && <p>{item.cancellation.refund_note}</p>}
                        {item?.cancellation?.refunded_at && <p>Refunded: {formatDateTime(item.cancellation.refunded_at)}</p>}
                        {item?.actions?.can_complete_cancellation_refund && (
                          <div className="admin-request-actions">
                            <button
                              type="button"
                              className="account-inline-btn"
                              disabled={isUpdatingRefund}
                              onClick={() => runAdminOrderCareAction(item.order_id, 'complete_cancellation_refund')}
                            >
                              {isUpdatingRefund ? 'Updating...' : 'Mark Refund Complete'}
                            </button>
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              </div>

              <div className="admin-care-column">
                <div className="admin-care-heading">
                  <h3>Returns & Pickup</h3>
                  <span>Approve logistics steps before refund release</span>
                </div>
                <div className="admin-request-list">
                  {adminReturnQueue.length === 0 && <p className="quick-panel-meta">No return pickups need admin action.</p>}
                  {adminReturnQueue.map((item) => {
                    const scheduleActionKey = `${item.order_id}:schedule_pickup`
                    const pickupActionKey = `${item.order_id}:mark_picked_up`
                    const isSchedulingPickup = adminUpdatingOrderCareId === scheduleActionKey
                    const isMarkingPickup = adminUpdatingOrderCareId === pickupActionKey
                    return (
                      <article className="account-tile admin-care-ticket" key={`return-${item.order_id}`}>
                        <div className="admin-care-ticket-head">
                          <div>
                            <strong>{item?.product?.title || 'Return case'}</strong>
                            <p>Order {item?.order_id || '-'}</p>
                          </div>
                          <span className={`status-chip is-${getStatusTone(item?.return?.status || item?.status)}`}>
                            {formatStatusText(item?.return?.status || item?.status)}
                          </span>
                        </div>
                        <p>Seller: {item?.seller_brand || '-'}</p>
                        <p>Buyer Area: {[item?.buyer_city, item?.buyer_pincode].filter(Boolean).join(' | ') || '-'}</p>
                        <p>Amount: {formatCurrency(item?.pricing?.subtotal || 0)} | Payment: {formatStatusText(item?.payment?.method)} / {formatStatusText(item?.payment?.status)}</p>
                        {item?.return?.reason && <p>Reason: {formatStatusText(item.return.reason)}</p>}
                        <p>Requested: {formatDateTime(item?.return?.requested_at || item?.updated_at)}</p>
                        {item?.return?.seller_action_deadline && <p>Seller SLA: {formatDateTime(item.return.seller_action_deadline)}</p>}
                        {item?.return?.pickup_at && <p>Pickup Slot: {formatDateTime(item.return.pickup_at)}</p>}
                        {item?.return?.pickup_completed_at && <p>Picked Up: {formatDateTime(item.return.pickup_completed_at)}</p>}
                        <div className="buyer-order-care">
                          {item?.return?.status && (
                            <span className={`status-chip is-${getStatusTone(item.return.status)}`}>
                              Return {formatStatusText(item.return.status)}
                            </span>
                          )}
                          {item?.return?.pickup_status && (
                            <span className={`status-chip is-${getStatusTone(item.return.pickup_status)}`}>
                              Pickup {formatStatusText(item.return.pickup_status)}
                            </span>
                          )}
                        </div>
                        <div className="admin-request-actions">
                          {item?.actions?.can_schedule_pickup && (
                            <button
                              type="button"
                              className="account-inline-btn"
                              disabled={isSchedulingPickup}
                              onClick={() => runAdminOrderCareAction(item.order_id, 'schedule_pickup')}
                            >
                              {isSchedulingPickup ? 'Updating...' : 'Schedule Pickup'}
                            </button>
                          )}
                          {item?.actions?.can_mark_pickup_complete && (
                            <button
                              type="button"
                              className="account-inline-btn"
                              disabled={isMarkingPickup}
                              onClick={() => runAdminOrderCareAction(item.order_id, 'mark_picked_up')}
                            >
                              {isMarkingPickup ? 'Updating...' : 'Mark Picked Up'}
                            </button>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>

              <div className="admin-care-column">
                <div className="admin-care-heading">
                  <h3>Refund Release</h3>
                  <span>Cases ready for final money movement</span>
                </div>
                <div className="admin-request-list">
                  {adminRefundQueue.length === 0 && <p className="quick-panel-meta">No refunds are awaiting completion.</p>}
                  {adminRefundQueue.map((item) => {
                    const returnRefundActionKey = `${item.order_id}:complete_return_refund`
                    const cancellationRefundActionKey = `${item.order_id}:complete_cancellation_refund`
                    const isCompletingReturnRefund = adminUpdatingOrderCareId === returnRefundActionKey
                    const isCompletingCancellationRefund = adminUpdatingOrderCareId === cancellationRefundActionKey
                    return (
                      <article className="account-tile admin-care-ticket" key={`refund-${item.order_id}`}>
                        <div className="admin-care-ticket-head">
                          <div>
                            <strong>{item?.product?.title || 'Refund case'}</strong>
                            <p>Order {item?.order_id || '-'}</p>
                          </div>
                          <span className={`status-chip is-${getStatusTone(item?.return?.refund_status || item?.cancellation?.refund_status || item?.status)}`}>
                            {formatStatusText(item?.return?.refund_status || item?.cancellation?.refund_status || item?.status)}
                          </span>
                        </div>
                        <p>Seller: {item?.seller_brand || '-'}</p>
                        <p>Amount: {formatCurrency(item?.pricing?.subtotal || 0)} | Payment: {formatStatusText(item?.payment?.method)} / {formatStatusText(item?.payment?.status)}</p>
                        {item?.return?.pickup_completed_at && <p>Picked Up: {formatDateTime(item.return.pickup_completed_at)}</p>}
                        {item?.cancellation?.requested_at && <p>Cancelled: {formatDateTime(item.cancellation.requested_at)}</p>}
                        <div className="buyer-order-care">
                          {item?.return?.refund_status && (
                            <span className={`status-chip is-${getStatusTone(item.return.refund_status)}`}>
                              Return Refund {formatStatusText(item.return.refund_status)}
                            </span>
                          )}
                          {item?.cancellation?.refund_status && (
                            <span className={`status-chip is-${getStatusTone(item.cancellation.refund_status)}`}>
                              Cancellation Refund {formatStatusText(item.cancellation.refund_status)}
                            </span>
                          )}
                        </div>
                        <div className="admin-request-actions">
                          {item?.actions?.can_complete_return_refund && (
                            <button
                              type="button"
                              className="account-inline-btn"
                              disabled={isCompletingReturnRefund}
                              onClick={() => runAdminOrderCareAction(item.order_id, 'complete_return_refund')}
                            >
                              {isCompletingReturnRefund ? 'Updating...' : 'Complete Return Refund'}
                            </button>
                          )}
                          {item?.actions?.can_complete_cancellation_refund && (
                            <button
                              type="button"
                              className="account-inline-btn"
                              disabled={isCompletingCancellationRefund}
                              onClick={() => runAdminOrderCareAction(item.order_id, 'complete_cancellation_refund')}
                            >
                              {isCompletingCancellationRefund ? 'Updating...' : 'Complete Cancellation Refund'}
                            </button>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head">
            <h2>Promotions Radar</h2>
            <span>{isLoadingAdminOffersSummary ? 'Loading...' : `${Number(adminOffersSummary?.summary?.active_offers || 0)} live offers`}</span>
          </div>
          {isLoadingAdminOffersSummary && <p className="quick-panel-meta">Loading live promotions...</p>}
          {!isLoadingAdminOffersSummary
            && Number(adminOffersSummary?.summary?.active_offers || 0) === 0
            && Number(adminOffersSummary?.summary?.live_festivals || 0) === 0
            && Number(adminOffersSummary?.summary?.scheduled_offers || 0) === 0 && (
            <p className="quick-panel-meta">No live or scheduled promotions are running right now.</p>
          )}
          {!isLoadingAdminOffersSummary && (
            Number(adminOffersSummary?.summary?.active_offers || 0) > 0
            || Number(adminOffersSummary?.summary?.live_festivals || 0) > 0
            || Number(adminOffersSummary?.summary?.scheduled_offers || 0) > 0
          ) && (
            <div className="admin-offers-layout">
              <div className="admin-offers-column">
                <div className="admin-offers-heading">
                  <h3>Top Value</h3>
                  <span>Best savings right now</span>
                </div>
                <div className="admin-request-list">
                  {(Array.isArray(adminOffersSummary?.top_offers) ? adminOffersSummary.top_offers : []).map((offer) => (
                    <article className="account-tile admin-offer-tile" key={offer.offer_id}>
                      <strong>{offer.product_title || 'Offer product'}</strong>
                      <p>Seller: {offer.seller_brand || offer.seller_id || '-'}</p>
                      <p>Live Price: {formatInr(offer.offer_price) || '₹0'}{Number.isFinite(Number(offer.base_price)) ? ` from ${formatInr(offer.base_price) || '₹0'}` : ''}</p>
                      <p>Saved: {formatInr(offer.savings_amount) || '₹0'}{Number.isFinite(Number(offer.savings_percent)) ? ` (${Number(offer.savings_percent)}%)` : ''}</p>
                      <p>Used: {Number(offer.used_count || 0)} times</p>
                      <p>{offer.festival_name ? `Festival: ${offer.festival_name}` : 'Standalone offer'}</p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="admin-offers-column">
                <div className="admin-offers-heading">
                  <h3>Ending Soon</h3>
                  <span>Offers to review before they expire</span>
                </div>
                <div className="admin-request-list">
                  {(Array.isArray(adminOffersSummary?.expiring_offers) ? adminOffersSummary.expiring_offers : []).map((offer) => (
                    <article className="account-tile admin-offer-tile" key={`expiring-${offer.offer_id}`}>
                      <strong>{offer.product_title || 'Offer product'}</strong>
                      <p>Seller: {offer.seller_brand || offer.seller_id || '-'}</p>
                      <p>Ends: {formatDateTime(offer.end_at)}</p>
                      <p>Live Price: {formatInr(offer.offer_price) || '₹0'}</p>
                      <p>Status: {offer.seller_frozen ? 'Seller frozen' : (offer.seller_status || '-')}</p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="admin-offers-column">
                <div className="admin-offers-heading">
                  <h3>Live Festivals</h3>
                  <span>Campaigns sellers can attach right now</span>
                </div>
                <div className="admin-festival-list">
                  {(Array.isArray(adminOffersSummary?.live_festivals) ? adminOffersSummary.live_festivals : []).map((festival, index) => (
                    <article className="admin-festival-chip" key={`${festival.slug || festival.name || 'festival'}-${index}`}>
                      <strong>{festival.name || 'Untitled festival'}</strong>
                      <p>{festival.slug || '-'}</p>
                      <small>{festival.end_at ? `Ends ${formatDateTime(festival.end_at)}` : 'Live now'}</small>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head">
            <h2>High Risk Sellers</h2>
            <span>{Array.isArray(adminRiskDashboard?.risky_sellers) ? adminRiskDashboard.risky_sellers.length : 0} listed</span>
          </div>
          {isLoadingAdminRiskDashboard && <p className="quick-panel-meta">Loading risk seller list...</p>}
          {!isLoadingAdminRiskDashboard && (!Array.isArray(adminRiskDashboard?.risky_sellers) || adminRiskDashboard.risky_sellers.length === 0) && (
            <p className="quick-panel-meta">No high risk sellers found.</p>
          )}
          <div className="admin-request-list">
            {(Array.isArray(adminRiskDashboard?.risky_sellers) ? adminRiskDashboard.risky_sellers : []).map((seller) => (
              <article className="account-tile" key={seller?.seller_id || `risk-${Math.random()}`}>
                <strong>{seller?.email || seller?.seller_id || 'Unknown seller'}</strong>
                <p>Seller ID: {seller?.seller_id || '-'}</p>
                <p>Status: {seller?.status || '-'}</p>
                <p>Tier: {seller?.tier || '-'}</p>
                <p>Trust Score: {Number(seller?.trust_score || 0)}</p>
                <p>Probation: {seller?.probation ? 'Yes' : 'No'}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head">
            <h2>Seller Verification Queue</h2>
            <span>{adminSellerRequests.length} pending</span>
          </div>
          {isLoadingAdminSellerRequests && <p className="quick-panel-meta">Loading seller requests...</p>}
          {!isLoadingAdminSellerRequests && adminSellerRequests.length === 0 && <p className="quick-panel-meta">No pending seller requests.</p>}

          <div className="admin-request-list">
            {adminSellerRequests.map((item) => (
              <article className="account-tile" key={item.user_id}>
                <strong>{item.brand_name || 'Unknown brand'} ({item.category || '-'})</strong>
                <p>Legal name: {item.legal_name || '-'}</p>
                <p>Phone: {item.phone || '-'}</p>
                <p>Email: {item.email || '-'}</p>
                <p>PAN: {item.documents?.pan_card || '-'}</p>
                <p>GST: {item.documents?.gst_certificate || '-'}</p>
                <p>Address proof: {item.documents?.address_proof || '-'}</p>
                <p>Requested: {item.requested_at ? new Date(item.requested_at).toLocaleString() : '-'}</p>
                <textarea
                  rows={2}
                  placeholder="Reason required if rejecting"
                  value={adminRejectReasons[item.user_id] || ''}
                  onChange={(event) => setAdminRejectReasons((prev) => ({ ...prev, [item.user_id]: event.target.value }))}
                />
                <div className="admin-request-actions">
                  <button
                    type="button"
                    className="account-inline-btn"
                    disabled={adminUpdatingSellerId === item.user_id}
                    onClick={() => decideSellerRequest(item.user_id, 'approve')}
                  >
                    {adminUpdatingSellerId === item.user_id ? 'Updating...' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    className="account-inline-btn"
                    disabled={adminUpdatingSellerId === item.user_id}
                    onClick={() => decideSellerRequest(item.user_id, 'reject')}
                  >
                    {adminUpdatingSellerId === item.user_id ? 'Updating...' : 'Reject'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head">
            <h2>Active Sellers</h2>
            <span>{adminActiveSellers.length} listed</span>
          </div>
          {isLoadingAdminActiveSellers && <p className="quick-panel-meta">Loading active sellers...</p>}
          {!isLoadingAdminActiveSellers && adminActiveSellers.length === 0 && <p className="quick-panel-meta">No active sellers found.</p>}
          <div className="admin-request-list">
            {adminActiveSellers.map((seller) => {
              const sellerId = seller?._id || ''
              const snapshot = adminRiskSnapshots[sellerId]
              const isFrozen = seller?.seller_status === 'frozen'
              return (
                <article className="account-tile" key={sellerId || `seller-${seller?.phone || Math.random()}`}>
                  <strong>{seller?.seller_profile?.brand_name || seller?.seller_request?.brand_name || 'Unknown seller'}</strong>
                  <p>Seller ID: {sellerId || '-'}</p>
                  <p>Phone: {seller?.phone || '-'}</p>
                  <p>Status: {seller?.seller_status || '-'}</p>
                  <p>Trust Score: {Number(seller?.seller_profile?.trust?.score || 0)}</p>
                  {isFrozen && <p>Frozen reason: {seller?.seller_frozen_reason || '-'}</p>}
                  {!isFrozen && (
                    <textarea
                      rows={2}
                      placeholder="Freeze reason"
                      value={adminFreezeReasons[sellerId] || ''}
                      onChange={(event) => setAdminFreezeReasons((prev) => ({ ...prev, [sellerId]: event.target.value }))}
                    />
                  )}
                  <div className="admin-request-actions">
                    {!isFrozen && (
                      <button
                        type="button"
                        className="account-inline-btn"
                        disabled={adminUpdatingSellerActionId === sellerId}
                        onClick={() => updateSellerStatus(sellerId, 'freeze')}
                      >
                        {adminUpdatingSellerActionId === sellerId ? 'Updating...' : 'Freeze'}
                      </button>
                    )}
                    {isFrozen && (
                      <button
                        type="button"
                        className="account-inline-btn"
                        disabled={adminUpdatingSellerActionId === sellerId}
                        onClick={() => updateSellerStatus(sellerId, 'unfreeze')}
                      >
                        {adminUpdatingSellerActionId === sellerId ? 'Updating...' : 'Unfreeze'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="account-inline-btn"
                      disabled={adminLoadingRiskSellerId === sellerId}
                      onClick={() => loadSellerRiskSnapshot(sellerId)}
                    >
                      {adminLoadingRiskSellerId === sellerId ? 'Loading Risk...' : 'Risk Snapshot'}
                    </button>
                  </div>
                  {snapshot && (
                    <div className="admin-risk-inline">
                      <p>Tier: {snapshot?.tier || '-'}</p>
                      <p>Settlement Hours: {snapshot?.settlement_hours ?? '-'}</p>
                      <p>Commission %: {snapshot?.commission_percent ?? '-'}</p>
                      <p>Probation: {snapshot?.probation?.active ? 'Yes' : 'No'}</p>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head">
            <h2>Seller Ranking</h2>
            <span>{adminSellerRanking.length} ranked</span>
          </div>
          {isLoadingAdminSellerRanking && <p className="quick-panel-meta">Loading ranking...</p>}
          {!isLoadingAdminSellerRanking && adminSellerRanking.length === 0 && <p className="quick-panel-meta">No ranking data.</p>}
          {!isLoadingAdminSellerRanking && adminSellerRanking.length > 0 && (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Brand</th>
                    <th>Score</th>
                    <th>Badges</th>
                  </tr>
                </thead>
                <tbody>
                  {adminSellerRanking.map((seller, index) => (
                    <tr key={seller.seller_id}>
                      <td>{index + 1}</td>
                      <td>{seller.brand_name || '-'}</td>
                      <td>{Number(seller.score || 0)}</td>
                      <td>{Array.isArray(seller.badges) && seller.badges.length ? seller.badges.join(', ') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head">
            <h2>Payout Requests</h2>
            <span>{adminPayoutRequests.length} records</span>
          </div>
          <div className="admin-filter-row">
            {['', 'requested', 'processing', 'approved', 'failed', 'rejected'].map((status) => (
              <button
                key={status || 'all'}
                type="button"
                className={`account-inline-btn ${adminPayoutStatusFilter === status ? 'is-selected' : ''}`}
                onClick={() => setAdminPayoutStatusFilter(status)}
              >
                {status || 'all'}
              </button>
            ))}
          </div>
          {isLoadingAdminPayoutRequests && <p className="quick-panel-meta">Loading payout requests...</p>}
          {!isLoadingAdminPayoutRequests && adminPayoutRequests.length === 0 && <p className="quick-panel-meta">No payout requests found.</p>}
          <div className="admin-request-list">
            {adminPayoutRequests.map((request) => {
              const requestId = request?._id || ''
              const status = request?.status || '-'
              const sellerBrand = request?.seller?.brand_name || request?.seller?.legal_name || request?.seller_id || '-'
              const sellerPhone = request?.seller?.phone || ''
              const canApprove = status === 'requested'
              const canReject = status === 'requested' || status === 'failed'
              const canRetry = status === 'failed' && !request?.hold_released_at
              const canReconcile = Boolean(request?.provider_payout_id)
              const isUpdating = adminUpdatingPayoutId === requestId
              const bankSummary = [
                request?.bank_details?.bank_name,
                request?.bank_details?.bank_account_masked,
                request?.bank_details?.ifsc_code,
              ].filter(Boolean).join(' | ')
              return (
                <article className="account-tile" key={requestId || `payout-${Math.random()}`}>
                  <strong>Emergency Payout {requestId || '-'}</strong>
                  <p>Status: {status}</p>
                  <p>Seller: {sellerBrand}{sellerPhone ? ` (${sellerPhone})` : ''}</p>
                  <p>Amount: {formatInr(request?.amount) || '₹0'} | Fee: {formatInr(request?.settlement_fee) || '₹0'}</p>
                  <p>Requested: {formatDateTime(request?.requested_at)}</p>
                  <p>Total Debit: {formatInr(request?.total_debit) || '₹0'}</p>
                  <p>Bank: {bankSummary || '-'}</p>
                  {request?.provider && (
                    <p>
                      Provider: {request.provider}
                      {request?.provider_payout_status ? ` (${request.provider_payout_status})` : ''}
                    </p>
                  )}
                  {request?.transfer_reference && <p>Transfer Ref: {request.transfer_reference}</p>}
                  {request?.transfer_processed_at && <p>Transferred: {formatDateTime(request.transfer_processed_at)}</p>}
                  {request?.reviewed_at && <p>Reviewed: {formatDateTime(request.reviewed_at)}</p>}
                  {request?.reconciled_at && <p>Last Reconciled: {formatDateTime(request.reconciled_at)}</p>}
                  {request?.review_reason && <p>Admin Note: {request.review_reason}</p>}
                  {request?.failure_reason && <p>Failure: {request.failure_reason}</p>}
                  {request?.hold_released_at && (
                    <p>Hold Released: {formatDateTime(request.hold_released_at)}{request?.hold_release_reason_code ? ` (${request.hold_release_reason_code})` : ''}</p>
                  )}
                  {canReject && (
                    <textarea
                      rows={2}
                      placeholder={status === 'failed' ? 'Reason for hold release' : 'Reason (required for reject)'}
                      value={adminPayoutDecisionReasons[requestId] || ''}
                      onChange={(event) => setAdminPayoutDecisionReasons((prev) => ({ ...prev, [requestId]: event.target.value }))}
                    />
                  )}
                  <div className="admin-request-actions">
                    {canApprove && (
                      <>
                        <button
                          type="button"
                          className="account-inline-btn"
                          disabled={isUpdating}
                          onClick={() => decidePayoutRequest(requestId, 'approve', status)}
                        >
                          {isUpdating ? 'Updating...' : 'Approve'}
                        </button>
                      </>
                    )}
                    {canReject && (
                      <>
                        <button
                          type="button"
                          className="account-inline-btn"
                          disabled={isUpdating}
                          onClick={() => decidePayoutRequest(requestId, 'reject', status)}
                        >
                          {isUpdating ? 'Updating...' : status === 'failed' ? 'Release Hold' : 'Reject'}
                        </button>
                      </>
                    )}
                    {canRetry && (
                      <button
                        type="button"
                        className="account-inline-btn"
                        disabled={isUpdating}
                        onClick={() => retryPayoutRequest(requestId)}
                      >
                        {isUpdating ? 'Updating...' : 'Retry'}
                      </button>
                    )}
                    {canReconcile && (
                      <button
                        type="button"
                        className="account-inline-btn"
                        disabled={isUpdating}
                        onClick={() => reconcilePayoutRequest(requestId)}
                      >
                        {isUpdating ? 'Updating...' : 'Reconcile'}
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head">
            <h2>Platform Controls</h2>
            <span>Commission and festivals</span>
          </div>
          <div className="admin-controls-grid">
            <form
              className="account-form"
              onSubmit={(event) => {
                event.preventDefault()
                saveCommissionRate()
              }}
            >
              <label>Commission Rate (0 to 0.10)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                max="0.1"
                value={commissionInput}
                onChange={(event) => setCommissionInput(event.target.value)}
                placeholder="0.050"
              />
              <button type="submit" className="account-primary-btn" disabled={isUpdatingCommission}>
                {isUpdatingCommission ? 'Saving...' : 'Update Commission'}
              </button>
            </form>

            <form className="account-form" onSubmit={createFestivalOffer}>
              <label>Festival Slug</label>
              <input
                type="text"
                value={festivalForm.slug}
                onChange={(event) => setFestivalForm((prev) => ({ ...prev, slug: event.target.value }))}
                placeholder="diwali-2026"
              />
              <label>Festival Name</label>
              <input
                type="text"
                value={festivalForm.name}
                onChange={(event) => setFestivalForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Diwali Mega Sale"
              />
              <label>Start At (ISO/DateTime)</label>
              <input
                type="datetime-local"
                value={festivalForm.start_at}
                onChange={(event) => setFestivalForm((prev) => ({ ...prev, start_at: event.target.value }))}
              />
              <label>End At (ISO/DateTime)</label>
              <input
                type="datetime-local"
                value={festivalForm.end_at}
                onChange={(event) => setFestivalForm((prev) => ({ ...prev, end_at: event.target.value }))}
              />
              <label>Eligible Tiers (comma-separated)</label>
              <input
                type="text"
                value={festivalForm.eligible_tiers}
                onChange={(event) => setFestivalForm((prev) => ({ ...prev, eligible_tiers: event.target.value }))}
                placeholder="verified_fast, verified_plus"
              />
              <button type="submit" className="account-primary-btn" disabled={isCreatingFestival}>
                {isCreatingFestival ? 'Creating...' : 'Create Festival'}
              </button>
            </form>
          </div>
        </section>
      </main>
    )
  }

  if (isDeliveryPortal && hasDeliveryPortalAccess) {
    return (
      <main className="seller-shell">
        <header className="seller-header">
          <h1>Delivery Partner Dashboard</h1>
          <nav className="seller-nav">
            <button type="button" onClick={exitPortalMode}>Back to Storefront</button>
            <button type="button" onClick={() => loadDeliveryPartnerOrders(deliveryPartnerOrderStatusFilter)}>Refresh Orders</button>
            <button type="button" onClick={logout} className="logout-btn">Logout</button>
          </nav>
          <p className="seller-meta">Logged in as delivery partner {userPhone || '-'}</p>
        </header>
        <section className="seller-content">
          <div className="seller-section">
            <h2>Assigned Orders</h2>
            <div className="seller-toolbar">
              <div className="form-group">
                <label>Status Filter</label>
                <select
                  value={deliveryPartnerOrderStatusFilter}
                  onChange={(event) => setDeliveryPartnerOrderStatusFilter(event.target.value)}
                >
                  {['all', 'shipped', 'out_for_delivery', 'delivery_otp_pending', 'delivered', 'rto'].map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>
            {isLoadingDeliveryPartnerOrders && <p className="quick-panel-meta">Loading assigned orders...</p>}
            {!isLoadingDeliveryPartnerOrders && deliveryPartnerOrders.length === 0 && <p className="quick-panel-meta">No assigned orders found.</p>}
            {!isLoadingDeliveryPartnerOrders && deliveryPartnerOrders.length > 0 && (
              <div className="admin-request-list">
                {deliveryPartnerOrders.map((order) => {
                  const orderId = String(order?.id || '').trim()
                  const status = String(order?.status || '').toLowerCase()
                  const canMarkOut = ['shipped', 'delivery_otp_pending', 'out_for_delivery'].includes(status)
                  const canCompleteDelivery = ['out_for_delivery', 'delivery_otp_pending'].includes(status)
                  return (
                    <article className="account-tile" key={orderId || Math.random()}>
                      <strong>{order?.product?.title || 'Order'} ({orderId || '-'})</strong>
                      <p>Status: {order?.status || '-'}</p>
                      <p>Qty: {Number(order?.quantity || 0)}</p>
                      <p>Customer: {order?.delivery_address?.name || '-'} | {order?.delivery_address?.phone || '-'}</p>
                      <p>
                        Address: {order?.delivery_address?.city || '-'}, {order?.delivery_address?.state || '-'} {order?.delivery_address?.pincode || ''}
                      </p>
                      <p>Assigned At: {formatDateTime(order?.delivery_partner?.assigned_at)}</p>
                      {order?.delivery_partner?.out_for_delivery_at && (
                        <p>Out for Delivery Since: {formatDateTime(order?.delivery_partner?.out_for_delivery_at)}</p>
                      )}
                      {order?.delivery_otp_generated_at && (
                        <p>OTP Sent At: {formatDateTime(order?.delivery_otp_generated_at)}</p>
                      )}
                      <div className="product-actions">
                        <button
                          type="button"
                          className="action-btn edit"
                          disabled={!canMarkOut || deliveryPartnerMarkingOrderId === orderId}
                          onClick={() => markDeliveryPartnerOrderOutForDelivery(orderId)}
                        >
                          {deliveryPartnerMarkingOrderId === orderId ? 'Updating...' : 'Mark Out For Delivery + Generate OTP'}
                        </button>
                        {canCompleteDelivery && (
                          <>
                            <input
                              className="delivery-otp-input"
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              value={deliveryPartnerOtpInputs[orderId] || ''}
                              onChange={(event) => setDeliveryPartnerOtpInputs((prev) => ({
                                ...prev,
                                [orderId]: event.target.value.replace(/\D/g, '').slice(0, 6),
                              }))}
                              placeholder="Enter buyer OTP"
                            />
                            <button
                              type="button"
                              className="action-btn edit"
                              disabled={deliveryPartnerCompletingOrderId === orderId}
                              onClick={() => completeDeliveryPartnerOrder(orderId)}
                            >
                              {deliveryPartnerCompletingOrderId === orderId ? 'Completing...' : 'Verify OTP + Mark Delivered'}
                            </button>
                          </>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </main>
    )
  }

  if (!(isSellerPortal && hasSellerPortalAccess)) {
    return (
    <main className="page-shell">
      {!isPdp && !isCategoryView && !activeQuickPanel && (
        <header className="premium-header">
          <div className="header-main">
            <a className="brand" href="/">
              <span className="brand-pill">
                <span className="brand-pill-left">Brand</span>
                <span className="brand-pill-right">cart</span>
              </span>
            </a>

            <form className="search-bar" onSubmit={handleSearchSubmit}>
              <input
                type="text"
                placeholder="Search for products, brands and more"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 140)}
              />
              <button type="submit" aria-label="Search products" title="Search">Search</button>
              {showSuggestions && (searchSuggestions.length > 0 || isLoadingSuggestions || searchText.trim().length >= 2) && (
                <div className="search-suggestions" role="listbox">
                  {isLoadingSuggestions && <p className="suggestion-meta">Loading...</p>}
                  {!isLoadingSuggestions && searchSuggestions.length === 0 && (
                    <p className="suggestion-meta">No suggestions found</p>
                  )}
                  {!isLoadingSuggestions && searchSuggestions.map((item) => (
                    <button
                      key={item.id || item.title}
                      type="button"
                      className="suggestion-item"
                      onMouseDown={() => handleSuggestionSelect(item)}
                    >
                      <span>{item.title}</span>
                      {Number.isFinite(Number(item.selling_price)) && <em>{formatInr(item.selling_price)}</em>}
                    </button>
                  ))}
                </div>
              )}
            </form>
          </div>

          <nav className="header-nav" aria-label="Primary">
            {categoryIcons.map((category) => (
              <button
                key={category.label}
                type="button"
                className="category-icon-link"
                aria-label={category.label}
                title={category.label}
                onClick={() => handleCategorySelect(category.query)}
              >
                <span className="category-icon-wrap">
                  <CategoryIcon icon={category.icon} />
                </span>
                <span className="category-label">{category.label}</span>
              </button>
            ))}
          </nav>
        </header>
      )}

      {isPdp && !activeQuickPanel && (
        <header className={`pdp-search-header ${viewTransition === 'to-pdp' ? 'is-entering' : ''}`}>
          <form className="search-bar" onSubmit={handleSearchSubmit}>
            <input
              type="text"
              placeholder="Search for products, brands and more"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 140)}
            />
            <button type="submit" aria-label="Search products" title="Search">Search</button>
            {showSuggestions && (searchSuggestions.length > 0 || isLoadingSuggestions || searchText.trim().length >= 2) && (
              <div className="search-suggestions" role="listbox">
                {isLoadingSuggestions && <p className="suggestion-meta">Loading...</p>}
                {!isLoadingSuggestions && searchSuggestions.length === 0 && (
                  <p className="suggestion-meta">No suggestions found</p>
                )}
                {!isLoadingSuggestions && searchSuggestions.map((item) => (
                  <button
                    key={item.id || item.title}
                    type="button"
                    className="suggestion-item"
                    onMouseDown={() => handleSuggestionSelect(item)}
                  >
                    <span>{item.title}</span>
                    {Number.isFinite(Number(item.selling_price)) && <em>{formatInr(item.selling_price)}</em>}
                  </button>
                ))}
              </div>
            )}
          </form>
        </header>
      )}

      {cartNotice && <div className="cart-notice" role="status">{cartNotice}</div>}

      {!activeProductId && !isCategoryView && !activeQuickPanel && (
        <>
          {!searchText.trim() && (
            <section className={`offers-hero ${viewTransition === 'to-home' ? 'is-entering' : ''}`} aria-labelledby="offers-hero-title">
              <div className="offers-hero-head">
                <div>
                  <p className="offers-hero-kicker">Live Offers</p>
                  <h2 id="offers-hero-title">Live deals worth opening first</h2>
                </div>
                {homeOfferLead?.active_offer?.end_at && (
                  <span className="offers-hero-timer">Ends {formatDateTime(homeOfferLead.active_offer.end_at)}</span>
                )}
              </div>

              {isLoadingOfferHighlights && <p className="products-meta">Loading live offers...</p>}
              {!isLoadingOfferHighlights && offerHighlightsError && (
                <p className="products-meta products-error">Could not fetch live offers: {offerHighlightsError}</p>
              )}

              {!isLoadingOfferHighlights && !offerHighlightsError && homeOfferLead && (
                <div className="offers-hero-grid">
                  <article
                    className="offers-hero-lead"
                    onClick={() => openProduct(homeOfferLead)}
                    onKeyDown={(event) => event.key === 'Enter' && openProduct(homeOfferLead)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="offers-hero-copy">
                      <span className="offers-hero-chip">{homeOfferLead.offer_banner_label || 'Live Offer'}</span>
                      <h3>{homeOfferLead.title}</h3>
                      <p>
                        Save {formatInr(homeOfferLead?.active_offer?.savings_amount) || '₹0'}
                        {Number.isFinite(Number(homeOfferLead?.active_offer?.savings_percent))
                          ? ` (${Number(homeOfferLead.active_offer.savings_percent)}% off)`
                          : ''}
                      </p>
                      <div className="offers-hero-pricing">
                        <strong>{formatInr(homeOfferLeadPricing?.effectivePrice ?? homeOfferLead?.active_offer?.offer_price ?? homeOfferLead?.display_price ?? homeOfferLead?.selling_price) || '-'}</strong>
                        {homeOfferLeadPricing?.hasComparePrice && <span>{formatInr(homeOfferLeadPricing.comparePrice)}</span>}
                      </div>
                      <span className="account-primary-btn">Shop This Offer</span>
                    </div>
                    <div className="offers-hero-media">
                      {Array.isArray(homeOfferLead.images) && homeOfferLead.images[0]
                        ? <img src={homeOfferLead.images[0]} alt={homeOfferLead.title} loading="lazy" />
                        : <span>Live</span>}
                    </div>
                  </article>

                  <div className="offers-hero-list">
                    {homeOfferTiles.map((item) => {
                      const tilePricing = getProductPricingMeta(item)
                      return (
                      <article
                        className="offers-hero-card"
                        key={item.id}
                        onClick={() => openProduct(item)}
                        onKeyDown={(event) => event.key === 'Enter' && openProduct(item)}
                        role="button"
                        tabIndex={0}
                      >
                        <div>
                          <span className="offers-hero-chip is-soft">{item.offer_banner_label || item?.active_offer?.festival_name || 'Live Offer'}</span>
                          <h4>{item.title}</h4>
                          <div className="offers-hero-card-price">
                            <strong>{formatInr(tilePricing?.effectivePrice ?? item?.active_offer?.offer_price ?? item?.display_price ?? item?.selling_price) || '-'}</strong>
                            {tilePricing?.hasComparePrice && <span>{formatInr(tilePricing.comparePrice)}</span>}
                          </div>
                        </div>
                        <small>
                          Save {formatInr(item?.active_offer?.savings_amount) || '₹0'}
                          {Number.isFinite(Number(item?.active_offer?.savings_percent))
                            ? ` • ${Number(item.active_offer.savings_percent)}% off`
                            : ''}
                        </small>
                      </article>
                      )
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          <section className={`home-products ${viewTransition === 'to-home' ? 'is-entering' : ''}`} aria-labelledby="home-products-title">
            <div className="home-products-head">
              <h2 id="home-products-title">{searchText.trim() ? 'Search Results' : 'Products'}</h2>
            </div>

            {isLoadingProducts && <p className="products-meta">Loading products...</p>}

            {!isLoadingProducts && productsError && (
              <p className="products-meta products-error">Could not fetch products: {productsError}</p>
            )}

            {!isLoadingProducts && !productsError && products.length === 0 && (
              <p className="products-meta">No products found.</p>
            )}

            {!isLoadingProducts && !productsError && products.length > 0 && (
              <div className="product-grid">
                {products.map((product) => {
                  const image = Array.isArray(product.images) ? product.images[0] : null
                  const pricing = getProductPricingMeta(product)
                  const price = formatInr(pricing.effectivePrice)
                  const comparePrice = formatInr(pricing.comparePrice)
                  const hasReviews = Number(product.review_count) > 0 && Number.isFinite(Number(product.review_average))

                  return (
                    <article
                      className="product-card"
                      key={product.id}
                      onClick={() => openProduct(product)}
                      onKeyDown={(event) => event.key === 'Enter' && openProduct(product)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="product-media">
                        {pricing.discountBadgeLabel && (
                          <span className="product-offer-badge">
                            {pricing.discountBadgeLabel}
                          </span>
                        )}
                        {image ? <img src={image} alt={product.title} loading="lazy" /> : <span>No image</span>}
                      </div>
                      <div className="product-copy">
                        <h3>{product.title}</h3>
                        <p className="product-category">{product.category || 'Uncategorized'}</p>
                        <div className="product-rating">
                          {hasReviews ? (
                            <>
                              <span className="rating-chip">
                                {Number(product.review_average).toFixed(1)} <span aria-hidden="true">&#9733;</span>
                              </span>
                              <span className="rating-count">({product.review_count})</span>
                            </>
                          ) : (
                            <span className="rating-empty">No reviews yet</span>
                          )}
                        </div>
                        <div className="product-pricing">
                          <strong>{price || '-'}</strong>
                          {pricing.hasComparePrice && <span>{comparePrice}</span>}
                        </div>
                        {pricing.hasComparePrice && (
                          <p className="product-offer-note">
                            Save {formatInr(pricing.savingsAmount) || '₹0'}
                            {pricing.activeOffer?.festival_name ? ` | ${pricing.activeOffer.festival_name}` : ''}
                            {pricing.activeOffer?.end_at ? ` | Ends ${formatDateTime(pricing.activeOffer.end_at)}` : ''}
                          </p>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}

      {activeProductId && !activeQuickPanel && (
        <section className={`pdp-shell ${viewTransition === 'to-pdp' ? 'is-entering' : ''}`} aria-labelledby="pdp-title">
          {isLoadingDetail && <p className="products-meta">Loading product details...</p>}

          {!isLoadingDetail && detailError && (
            <p className="products-meta products-error">Could not fetch product detail: {detailError}</p>
          )}

          {!isLoadingDetail && !detailError && productDetail && (
            <>
              <div className="pdp-layout">
                <aside className="pdp-media">
                  <div className="pdp-thumb-list">
                    {detailImages.map((img) => (
                      <button
                        type="button"
                        key={img}
                        className={`pdp-thumb ${selectedImage === img ? 'is-active' : ''}`}
                        onClick={() => setSelectedImage(img)}
                      >
                        <img src={img} alt={productDetail.title} />
                      </button>
                    ))}
                  </div>

                  <div className="pdp-main-image">
                    {selectedImage ? (
                      <img src={selectedImage} alt={productDetail.title} />
                    ) : (
                      <span>No image</span>
                    )}
                  </div>

                  <div className="pdp-cta-row">
                    <button type="button" className="pdp-cart-btn" onClick={addToCart}>ADD TO CART</button>
                    <button type="button" className="pdp-buy-btn" onClick={buyNow}>BUY NOW</button>
                  </div>
                </aside>

                <article className="pdp-info">
                  <div className="pdp-title-row">
                    <h1 id="pdp-title">{productDetail.title}</h1>
                    <div className="pdp-title-actions">
                      <button
                        type="button"
                        className={`pdp-icon-btn ${isWishlisted ? 'is-active' : ''}`}
                        onClick={toggleWishlist}
                        aria-label="Add to wishlist"
                        title="Wishlist"
                      >
                        <svg {...iconProps}>
                          <path d="M12 20s-6.8-4.4-8.8-8.2C1.8 9.3 3 6.3 5.8 5.4c2-.6 3.8.1 5.1 1.6 1.3-1.5 3.1-2.2 5.1-1.6 2.8.9 4 3.9 2.6 6.4C18.8 15.6 12 20 12 20z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="pdp-icon-btn"
                        onClick={handleShareProduct}
                        aria-label="Share product"
                        title="Share"
                      >
                        <svg {...iconProps}>
                          <circle cx="6" cy="12" r="2.2" />
                          <circle cx="18" cy="6" r="2.2" />
                          <circle cx="18" cy="18" r="2.2" />
                          <path d="M7.9 11 16 7.1M7.9 13 16 16.9" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {!isLoadingReviews && (
                    <div className="pdp-rating-row">
                      {productReviews.average !== null ? (
                        <>
                          <span className="rating-chip">
                            {productReviews.average.toFixed(1)} <span aria-hidden="true">&#9733;</span>
                          </span>
                          <span className="rating-count">{productReviews.count} Ratings</span>
                        </>
                      ) : (
                        <span className="rating-empty">No reviews yet</span>
                      )}
                    </div>
                  )}

                  <div className="pdp-price-row">
                    <strong>{detailPrice || '-'}</strong>
                    {detailHasStrike && <span>{detailComparePrice}</span>}
                  </div>
                  {detailPricing.hasComparePrice && (
                    <div className="pdp-offer-banner">
                      <span>{detailOffer?.festival_name || detailPricing.discountBadgeLabel || 'Discount'}</span>
                      <strong>
                        Save {formatInr(detailPricing.savingsAmount) || '₹0'}
                        {Number.isFinite(Number(detailPricing.savingsPercent)) ? ` (${Number(detailPricing.savingsPercent)}% off)` : ''}
                      </strong>
                      <p>
                        {detailOffer?.end_at
                          ? `Offer ends ${formatDateTime(detailOffer.end_at)}`
                          : 'Offer live now'}
                      </p>
                    </div>
                  )}

                  <form className="pdp-delivery-check" onSubmit={checkDeliveryAvailability}>
                    <label htmlFor="pdp-pincode">Check delivery to your area</label>
                    <div className="pdp-delivery-row">
                      <input
                        id="pdp-pincode"
                        type="text"
                        inputMode="numeric"
                        placeholder="Enter pincode"
                        value={deliveryPincode}
                        onChange={(event) => setDeliveryPincode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      />
                      <button type="submit" disabled={isCheckingDelivery}>
                        {isCheckingDelivery ? 'Checking...' : 'Check'}
                      </button>
                    </div>
                    {deliveryCheck.checked && (
                      <p className={`pdp-delivery-note ${(deliveryCheck.deliverable || deliveryCheck.requiresAddressConfirmation) ? 'ok' : 'no'}`}>
                        {deliveryCheck.deliverable
                          ? `Delivery available${deliveryCheck.estimatedDays ? ` in ${deliveryCheck.estimatedDays} day(s)` : ''}. ${deliveryCheck.codAvailable ? 'COD available.' : 'COD not available.'}`
                          : (deliveryCheck.requiresAddressConfirmation
                            ? (deliveryCheck.reason || 'We will confirm delivery after you choose your checkout address.')
                            : `${deliveryCheck.reason || 'Delivery unavailable'} for this pincode.`)}
                      </p>
                    )}
                  </form>

                  <div className="pdp-seller">
                    <h2>Seller</h2>
                    <div className="pdp-seller-row">
                      {sellerProfile?.logo_url ? (
                        <img src={sellerProfile.logo_url} alt={sellerProfile.brand_name || 'Brand'} />
                      ) : (
                        <span className="seller-fallback">{getInitials(sellerProfile?.brand_name)}</span>
                      )}
                      <div>
                        <strong>{sellerProfile?.brand_name || 'Brand unavailable'}</strong>
                        {Number.isFinite(Number(sellerProfile?.trust_score)) && (
                          <p>Trust Score: {sellerProfile.trust_score}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pdp-section">
                    <p className="pdp-description">{productDetail.description || 'No description available.'}</p>
                  </div>

                  <div className="pdp-section">
                    <h2>Ratings & Reviews</h2>
                    {isLoadingReviews && <p className="quick-panel-meta">Refreshing reviews...</p>}
                    {!isLoadingReviews && productReviews.reviews.length === 0 && (
                      <p className="quick-panel-meta">No reviews yet.</p>
                    )}
                    {!isLoadingReviews && productReviews.reviews.length > 0 && (
                      <div className="pdp-review-list">
                        {productReviews.reviews.slice(0, 8).map((review, index) => (
                          <article className="pdp-review-card" key={`${review.created_at || 'review'}-${index}`}>
                            <p className="pdp-review-rating">{'★'.repeat(Number(review.rating || 0))}</p>
                            <p>{review.comment || 'No comment'}</p>
                            <small>{review.created_at ? new Date(review.created_at).toLocaleString() : ''}</small>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pdp-section">
                    <h2>Questions & Answers</h2>
                    <form className="pdp-qa-form" onSubmit={submitProductQuestion}>
                      <textarea
                        rows={2}
                        placeholder="Ask a question about this product"
                        value={questionInput}
                        onChange={(event) => setQuestionInput(event.target.value)}
                      />
                      <button type="submit" disabled={isSubmittingQuestion}>
                        {isSubmittingQuestion ? 'Submitting...' : 'Ask Question'}
                      </button>
                    </form>
                    {isLoadingQuestions && <p className="quick-panel-meta">Refreshing Q&A...</p>}
                    {!isLoadingQuestions && productQuestions.length === 0 && (
                      <p className="quick-panel-meta">No questions yet. Be the first to ask.</p>
                    )}
                    {!isLoadingQuestions && productQuestions.length > 0 && (
                      <div className="pdp-qa-list">
                        {productQuestions.slice(0, 8).map((item) => (
                          <article className="pdp-qa-card" key={item.id}>
                            <strong>Q: {item.question}</strong>
                            <p>A: {item.answer || 'Seller will answer soon.'}</p>
                            <small>{item.created_at ? new Date(item.created_at).toLocaleString() : ''}</small>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              </div>

              <section className="similar-section" aria-labelledby="similar-title">
                <h2 id="similar-title">Similar Products</h2>

                {isLoadingSimilar && <p className="products-meta">Loading similar products...</p>}

                {!isLoadingSimilar && similarProducts.length === 0 && (
                  <p className="products-meta">No similar products found.</p>
                )}

                {!isLoadingSimilar && similarProducts.length > 0 && (
                  <div className="similar-row">
                    {similarProducts.map((item) => {
                      const image = Array.isArray(item.images) ? item.images[0] : null
                      const pricing = getProductPricingMeta(item)
                      const price = formatInr(pricing.effectivePrice)
                      const comparePrice = formatInr(pricing.comparePrice)
                      const hasReviews = Number(item.review_count) > 0 && Number.isFinite(Number(item.review_average))

                      return (
                        <article
                          className="similar-card"
                          key={item.id}
                          onClick={() => openProduct(item)}
                          onKeyDown={(event) => event.key === 'Enter' && openProduct(item)}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="similar-media">
                            {pricing.discountBadgeLabel && <span className="product-offer-badge">{pricing.discountBadgeLabel}</span>}
                            {image ? <img src={image} alt={item.title} loading="lazy" /> : <span>No image</span>}
                          </div>
                          <h3>{item.title}</h3>
                          {hasReviews ? (
                            <p className="similar-reviews">{Number(item.review_average).toFixed(1)} &#9733; ({item.review_count})</p>
                          ) : (
                            <p className="similar-reviews">No reviews yet</p>
                          )}
                          <strong>{price || '-'}</strong>
                          {pricing.hasComparePrice && <span className="similar-price-compare">{comparePrice}</span>}
                          {pricing.hasComparePrice && (
                            <p className="similar-reviews">
                              Save {formatInr(pricing.savingsAmount) || '₹0'}
                              {pricing.activeOffer?.end_at ? ` | Ends ${formatDateTime(pricing.activeOffer.end_at)}` : ''}
                            </p>
                          )}
                        </article>
                      )
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </section>
      )}

      {!isPdp && isCategoryView && !activeQuickPanel && (
        <section className="categories-screen" aria-labelledby="categories-title">
          <header className="categories-topbar">
            <h2 id="categories-title">All Categories</h2>
            <div className="categories-topbar-actions">
              <button type="button" onClick={() => flashNotice('Search from top bar')}>
                <svg {...iconProps}>
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4.2 4.2" />
                </svg>
              </button>
              <button type="button" onClick={openCartPanel}>
                <FooterNavIcon icon="cart" />
              </button>
            </div>
          </header>

          <div className="categories-layout">
            <aside className="categories-rail" aria-label="Category list">
              {categoryIcons.map((item) => (
                <button
                  type="button"
                  key={item.query}
                  className={`categories-rail-item ${activeCategoryQuery === item.query ? 'is-active' : ''}`}
                  onClick={() => setActiveCategoryQuery(item.query)}
                >
                  <span className="categories-rail-icon">
                    <CategoryIcon icon={item.icon} />
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
            </aside>

            <div className="categories-content">
              {heroProduct && (
                <article className="categories-hero" onClick={() => openProduct(heroProduct)} role="button" tabIndex={0}>
                  <div>
                    <h3>{heroProduct.category || 'Featured'}</h3>
                    <p>{heroProduct.title}</p>
                  </div>
                  {Array.isArray(heroProduct.images) && heroProduct.images[0] ? (
                    <img src={heroProduct.images[0]} alt={heroProduct.title} />
                  ) : (
                    <span>New</span>
                  )}
                </article>
              )}

              <section className="categories-block" aria-labelledby="spotlight-title">
                <h3 id="spotlight-title">In The Spotlight</h3>
                <div className="categories-grid">
                  {spotlightProducts.map((item) => (
                    <article key={item.id} className="categories-card" onClick={() => openProduct(item)} role="button" tabIndex={0}>
                      <div className="categories-card-media">
                        {Array.isArray(item.images) && item.images[0] ? <img src={item.images[0]} alt={item.title} /> : <span>Item</span>}
                      </div>
                      <p>{item.title}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="categories-block" aria-labelledby="launch-title">
                <h3 id="launch-title">Latest Launches</h3>
                <div className="categories-grid">
                  {(launchProducts.length ? launchProducts : spotlightProducts).map((item) => (
                    <article key={`launch-${item.id}`} className="categories-card" onClick={() => openProduct(item)} role="button" tabIndex={0}>
                      <div className="categories-card-media">
                        {Array.isArray(item.images) && item.images[0] ? <img src={item.images[0]} alt={item.title} /> : <span>Item</span>}
                      </div>
                      <p>{item.title}</p>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </section>
      )}

      <footer className="bottom-nav" aria-label="Quick Actions">
        <button type="button" className={`bottom-nav-item ${!isCategoryView && !activeQuickPanel ? 'is-active' : ''}`} onClick={handleHomeShortcut}>
          <FooterNavIcon icon="home" />
          <span>Home</span>
        </button>

        <button
          type="button"
          className={`bottom-nav-item ${(activeQuickPanel === 'account' && accountView === 'orders') ? 'is-active' : ''}`}
          onClick={openOrdersPanel}
        >
          <FooterNavIcon icon="orders" />
          <span>My Orders</span>
        </button>

        <button type="button" className={`bottom-nav-item ${isCategoryView && !activeQuickPanel ? 'is-active' : ''}`} onClick={handleCategoriesShortcut}>
          <FooterNavIcon icon="categories" />
          <span>Categories</span>
        </button>

        <button type="button" className={`bottom-nav-item ${activeQuickPanel === 'cart' ? 'is-active' : ''}`} onClick={openCartPanel}>
          <FooterNavIcon icon="cart" />
          <span>Cart</span>
          {cartItemTotal > 0 && <span className="bottom-nav-badge">{cartItemTotal}</span>}
        </button>

        <button type="button" className={`bottom-nav-item ${activeQuickPanel === 'account' || activeQuickPanel === 'auth' ? 'is-active' : ''}`} onClick={openAccountPanel}>
          <FooterNavIcon icon="account" />
          <span>Account</span>
        </button>
      </footer>

      {activeQuickPanel && (
        <section className={`quick-panel ${activeQuickPanel ? 'is-open' : ''}`} aria-label="Quick panel">
        {activeQuickPanel === 'wishlist' && (
          <>
            <div className="quick-panel-head">
              <h3>Wishlist</h3>
              <button type="button" onClick={closeQuickPanel}>Back</button>
            </div>
            <div className="quick-panel-body">
              {isLoadingWishlistItems && <p className="quick-panel-meta">Loading wishlist...</p>}
              {!isLoadingWishlistItems && wishlistItems.length === 0 && <p className="quick-panel-meta">No items in wishlist.</p>}
              {!isLoadingWishlistItems && wishlistItems.map((item) => {
                const pricing = getProductPricingMeta(item)
                return (
                  <article className="quick-panel-item" key={item.id}>
                    <button type="button" className="quick-panel-thumb" onClick={() => { openProduct(item); closeQuickPanel() }}>
                      {Array.isArray(item.images) && item.images[0] ? <img src={item.images[0]} alt={item.title} /> : <span>No image</span>}
                    </button>
                    <div className="quick-panel-copy">
                      <strong>{item.title}</strong>
                      <p className="quick-panel-price">
                        <strong>{formatInr(pricing.effectivePrice) || '-'}</strong>
                        {pricing.hasComparePrice && <span>{formatInr(pricing.comparePrice)}</span>}
                      </p>
                      {pricing.hasComparePrice && (
                        <p className="quick-panel-discount">
                          {pricing.discountBadgeLabel}
                          {pricing.savingsAmount ? ` | Save ${formatInr(pricing.savingsAmount) || '₹0'}` : ''}
                        </p>
                      )}
                      <div className="quick-panel-row">
                        <button type="button" onClick={() => addProductToCart(item)}>Add to Cart</button>
                        <button type="button" onClick={() => removeFromWishlist(item.id)}>Remove</button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}

        {activeQuickPanel === 'cart' && (
          <>
            <div className="quick-panel-head">
              <h3>Cart</h3>
              <button type="button" onClick={closeQuickPanel}>Back</button>
            </div>
            <div className="quick-panel-body">
              {cartItems.length === 0 && <p className="quick-panel-meta">Your cart is empty.</p>}
              {cartItems.map((item) => (
                <article className="quick-panel-item" key={item.cart_key || item.id}>
                  <button type="button" className="quick-panel-thumb" onClick={() => { openProduct(item); closeQuickPanel() }}>
                    {item.image ? <img src={item.image} alt={item.title} /> : <span>No image</span>}
                  </button>
                  <div className="quick-panel-copy">
                    <strong>{item.title}</strong>
                    {item.variant_label && <p className="quick-panel-discount">{item.variant_label}</p>}
                    <p className="quick-panel-price">
                      <strong>{formatInr(item.price) || '-'}</strong>
                      {Number.isFinite(Number(item.base_price)) && Number(item.base_price) > Number(item.price || 0) && (
                        <span>{formatInr(item.base_price)}</span>
                      )}
                    </p>
                    <div className="quick-panel-row">
                      <button type="button" onClick={() => updateCartQty(item.cart_key || item.id, -1)}>-</button>
                      <span>{item.qty || 1}</span>
                      <button type="button" onClick={() => updateCartQty(item.cart_key || item.id, 1)}>+</button>
                      <button type="button" onClick={() => removeCartItem(item.cart_key || item.id)}>Remove</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="quick-panel-foot">
              <p>Subtotal: <strong>{formatInr(cartSubtotal) || '-'}</strong></p>
              <button type="button" onClick={checkoutCart}>Checkout</button>
            </div>
          </>
        )}

        {activeQuickPanel === 'auth' && (
          <>
            <div className="quick-panel-head">
              <h3>{checkoutPending ? 'Login for Checkout' : 'Signup / Login'}</h3>
              <button type="button" onClick={closeQuickPanel}>Back</button>
            </div>
            <div className="quick-panel-body">
              <p className="quick-panel-meta">Enter your phone number. New users are auto-registered after OTP verification.</p>
              <form className="auth-form" onSubmit={sendOtp}>
                <label htmlFor="auth-phone">Phone Number</label>
                <input
                  id="auth-phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="10-digit phone"
                  value={authPhoneInput}
                  onChange={(event) => setAuthPhoneInput(normalizePhoneInput(event.target.value))}
                />
                <button type="submit" disabled={isSendingOtp}>
                  {isSendingOtp ? 'Sending OTP...' : isOtpSent ? 'Resend OTP' : 'Send OTP'}
                </button>
              </form>

              {isOtpSent && (
                <form className="auth-form" onSubmit={verifyOtp}>
                  <label htmlFor="auth-otp">OTP</label>
                  <input
                    id="auth-otp"
                    type="text"
                    inputMode="numeric"
                    placeholder="Enter OTP"
                    value={authOtpInput}
                    onChange={(event) => setAuthOtpInput(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                  <button type="submit" disabled={isVerifyingOtp}>
                    {isVerifyingOtp ? 'Verifying...' : 'Verify & Continue'}
                  </button>
                </form>
              )}
            </div>
          </>
        )}

        {activeQuickPanel === 'address' && (
          <>
            <div className="quick-panel-head">
              <h3>{isCheckoutFlow ? 'Select Delivery Address' : 'Manage Addresses'}</h3>
              <button type="button" onClick={closeQuickPanel}>Back</button>
            </div>
            <div className="quick-panel-body">
              <p className="quick-panel-meta">
                {isCheckoutFlow
                  ? 'Choose where this order should be delivered or add a new address.'
                  : 'Review your saved addresses or add a new one.'}
              </p>

              {isLoadingAddresses && <p className="quick-panel-meta">Loading addresses...</p>}
              {!isLoadingAddresses && addresses.length === 0 && <p className="quick-panel-meta">No saved addresses yet.</p>}
              {!isLoadingAddresses && addresses.map((address) => (
                <article className="address-card" key={address._id}>
                  <div>
                    <strong>{address.name}</strong>
                    <p>{address.line1}, {address.city}, {address.state} - {address.pincode}</p>
                    <p>{address.phone}</p>
                  </div>
                  <button type="button" onClick={() => proceedToPayment(address)}>
                    {isCheckoutFlow ? 'Deliver Here' : (selectedCheckoutAddress?._id === address._id ? 'Selected' : 'Select')}
                  </button>
                </article>
              ))}

              <form className="address-form" onSubmit={addAddress}>
                <h4>Add New Address</h4>
                <input
                  type="text"
                  placeholder="Full name"
                  value={addressForm.name}
                  onChange={(event) => updateAddressField('name', event.target.value)}
                />
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="Phone number"
                  value={addressForm.phone}
                  onChange={(event) => updateAddressField('phone', normalizePhoneInput(event.target.value))}
                />
                <textarea
                  placeholder="House no, street, area"
                  value={addressForm.line1}
                  onChange={(event) => updateAddressField('line1', event.target.value)}
                  rows={2}
                />
                <div className="address-grid">
                  <input
                    type="text"
                    placeholder="City"
                    value={addressForm.city}
                    onChange={(event) => updateAddressField('city', event.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="State"
                    value={addressForm.state}
                    onChange={(event) => updateAddressField('state', event.target.value)}
                  />
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Pincode"
                  value={addressForm.pincode}
                  onChange={(event) => updateAddressField('pincode', event.target.value.replace(/\D/g, '').slice(0, 6))}
                />
                <label className="address-default">
                  <input
                    type="checkbox"
                    checked={addressForm.is_default}
                    onChange={(event) => updateAddressField('is_default', event.target.checked)}
                  />
                  <span>Set as default address</span>
                </label>
                <button type="submit" disabled={isSavingAddress}>
                  {isSavingAddress ? 'Saving...' : 'Add Address'}
                </button>
              </form>
            </div>
          </>
        )}

        {activeQuickPanel === 'payment' && (
          <>
            <div className="quick-panel-head">
              <h3>Payment Options</h3>
              <button type="button" onClick={() => setActiveQuickPanel('address')}>Back</button>
            </div>
            <div className="quick-panel-body">
              <p className="quick-panel-meta">
                Deliver to: <strong>{selectedCheckoutAddress ? `${selectedCheckoutAddress.name}, ${selectedCheckoutAddress.city}` : 'Select an address'}</strong>
              </p>
              <p className="quick-panel-meta">
                Checkout for: <strong>{checkoutItemTotal} item{checkoutItemTotal === 1 ? '' : 's'}</strong>
                {' '}| Total: <strong>{formatInr(checkoutSubtotal) || '-'}</strong>
              </p>
              <p className="quick-panel-meta">Cards are entered securely in Razorpay Checkout. Brandcart does not store full card details on this device.</p>
              <div className="payment-list">
                {paymentOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`payment-option ${selectedPaymentMethod === option.id ? 'is-selected' : ''}`}
                    onClick={() => {
                      setSelectedPaymentMethod(option.id)
                      setPaymentError('')
                    }}
                  >
                    <span className="payment-option-main">{option.title}</span>
                    <span className="payment-option-sub">{option.subtitle}</span>
                  </button>
                ))}
              </div>
              {paymentError && <p className="payment-error">{paymentError}</p>}
            </div>
            <div className="quick-panel-foot">
              <p>Method: <strong>{paymentOptions.find((item) => item.id === selectedPaymentMethod)?.title || '-'}</strong></p>
              <button type="button" onClick={completeCheckout} disabled={isPlacingOrder}>
                {isPlacingOrder ? 'Processing...' : 'Place Order'}
              </button>
            </div>
          </>
        )}

        {activeQuickPanel === 'account' && (
          <>
            <div className="quick-panel-head">
              <div className="account-head-copy">
                <h3>{accountViewTitle}</h3>
                <p>{userPhone || 'Buyer account'}</p>
              </div>
              <button type="button" onClick={() => (accountView === 'menu' ? closeQuickPanel() : setAccountView('menu'))}>
                {accountView === 'menu' ? 'Close' : 'Back'}
              </button>
            </div>
            <div className="quick-panel-body account-body">
              <div className="account-view-shell" key={accountView}>
              {accountView === 'menu' && (
                <>
                  <section className="account-hero">
                    <div className="account-hero-top">
                      <div>
                        <strong>{profileForm.fullName?.trim() || 'Brandcart User'}</strong>
                        <p>{userPhone || '-'}</p>
                      </div>
                      <span className="account-chip">{userRole === 'admin' ? 'Admin' : (userRole === 'delivery_partner' ? 'Delivery Partner' : 'Buyer')}</span>
                    </div>
                    <div className="account-hero-stats">
                      <article>
                        <strong>{addresses.length}</strong>
                        <span>Addresses</span>
                      </article>
                      <article>
                        <strong>Secure</strong>
                        <span>Payments</span>
                      </article>
                      <article>
                        <strong>{reviewDrafts.length + qaItems.length}</strong>
                        <span>Drafts</span>
                      </article>
                    </div>
                    <div className="account-hero-actions">
                      <button type="button" className="account-inline-btn" onClick={() => setAccountView('profile')}>Edit Profile</button>
                      <button type="button" className="account-inline-btn" onClick={openAddressPanel}>Manage Address</button>
                    </div>
                  </section>

                  <section className="account-section">
                    <div className="account-content">
                      <label className="account-search-label" htmlFor="account-menu-search">Find setting</label>
                      <input
                        id="account-menu-search"
                        type="text"
                        className="account-search"
                        placeholder="Search profile, cards, privacy..."
                        value={accountMenuQuery}
                        onChange={(event) => setAccountMenuQuery(event.target.value)}
                      />
                    </div>
                  </section>

                  <section className="account-section">
                    <div className="account-list">
                      {accountMenuMatches('Manage Checkout Addresses') && (
                      <button type="button" className="account-row" onClick={openAddressPanel}>
                        <span className="account-row-icon"><AccountMenuIcon type="address" /></span>
                        <span>Manage Checkout Addresses</span>
                        <em>&#8250;</em>
                      </button>
                      )}
                      {accountMenuMatches(`Logout ${userPhone || 'buyer'}`) && (
                      <button type="button" className="account-row" onClick={logout}>
                        <span className="account-row-icon"><AccountMenuIcon type="profile" /></span>
                        <span>Logout ({userPhone || 'buyer'})</span>
                        <em>&#8250;</em>
                      </button>
                      )}
                    </div>
                  </section>

                  <section className="account-section">
                    <div className="account-list">
                      {[
                        ['device', 'Manage Devices', 'manage_devices'],
                        ['profile', 'Edit Profile', 'edit_profile'],
                        ['cards', 'Payments & Security', 'saved_cards'],
                        ['address', 'Saved Addresses', 'saved_addresses'],
                        ['language', `Select Language (${accountLanguage})`, 'language'],
                        ['notification', `Notification Settings (${notificationsEnabled ? 'On' : 'Off'})`, 'notifications'],
                        ['privacy', 'Privacy Center', 'privacy'],
                      ].filter(([, label]) => accountMenuMatches(label)).map(([type, label, action]) => (
                        <button type="button" className="account-row" key={label} onClick={() => handleAccountAction(action)}>
                          <span className="account-row-icon"><AccountMenuIcon type={type} /></span>
                          <span>{label}</span>
                          <em>&#8250;</em>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="account-section">
                    <h4>My Activity</h4>
                    <div className="account-list">
                      {[
                        ['wishlist', 'My Wishlist', 'wishlist'],
                        ['docs', 'My Orders', 'my_orders'],
                        ['reviews', 'Reviews', 'reviews'],
                        ['qa', 'Questions & Answers', 'qa'],
                      ].filter(([, label]) => accountMenuMatches(label)).map(([type, label, action]) => (
                        <button type="button" className="account-row" key={label} onClick={() => handleAccountAction(action)}>
                          <span className="account-row-icon"><AccountMenuIcon type={type} /></span>
                          <span>{label}</span>
                          <em>&#8250;</em>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="account-section">
                    <h4>Earn with Brandcart</h4>
                    <div className="account-list">
                      {accountMenuMatches('Sell on Brandcart') && (
                      <button type="button" className="account-row" onClick={() => handleAccountAction('sell')}>
                        <span className="account-row-icon"><AccountMenuIcon type="seller" /></span>
                        <span>{(userRole === 'seller' || sellerOnboarding.status === 'verified') ? 'Open Seller Dashboard (New Tab)' : 'Sell on Brandcart'}</span>
                        <em>&#8250;</em>
                      </button>
                      )}
                      {userRole === 'admin' && (
                        accountMenuMatches('Open Admin Dashboard New Tab') && (
                        <button type="button" className="account-row" onClick={() => handleAccountAction('admin_portal')}>
                          <span className="account-row-icon"><AccountMenuIcon type="admin" /></span>
                          <span>Open Admin Dashboard (New Tab)</span>
                          <em>&#8250;</em>
                        </button>
                        )
                      )}
                    </div>
                  </section>

                  <section className="account-section">
                    <h4>Feedback & Information</h4>
                    <div className="account-list">
                      {[
                        ['docs', 'Terms, Policies and Licenses', 'terms'],
                        ['info', 'Browse FAQs', 'faqs'],
                      ].filter(([, label]) => accountMenuMatches(label)).map(([type, label, action]) => (
                        <button type="button" className="account-row" key={label} onClick={() => handleAccountAction(action)}>
                          <span className="account-row-icon"><AccountMenuIcon type={type} /></span>
                          <span>{label}</span>
                          <em>&#8250;</em>
                        </button>
                      ))}
                    </div>
                  </section>
                  {accountMenuNeedle && ![
                    'Manage Checkout Addresses',
                    `Logout ${userPhone || 'buyer'}`,
                    'Manage Devices',
                    'Edit Profile',
                    'Payments & Security',
                    'Saved Addresses',
                    `Select Language (${accountLanguage})`,
                    `Notification Settings (${notificationsEnabled ? 'On' : 'Off'})`,
                    'Privacy Center',
                    'My Wishlist',
                    'My Orders',
                    'Reviews',
                    'Questions & Answers',
                    'Sell on Brandcart',
                    'Open Admin Dashboard (New Tab)',
                    'Terms, Policies and Licenses',
                    'Browse FAQs',
                  ].some((label) => accountMenuMatches(label)) && (
                    <p className="quick-panel-meta">No matching settings found.</p>
                  )}
                </>
              )}

              {accountView === 'devices' && (
                <section className="account-section">
                  <div className="account-content">
                    <p className="quick-panel-meta">Signed in devices linked to your account.</p>
                    {(deviceSessions.length ? deviceSessions : [{
                      id: 'current',
                      label: `${navigator.platform || 'Device'} / ${navigator.userAgent?.includes('Mobile') ? 'Mobile' : 'Desktop'}`,
                      phone: userPhone || '-',
                      last_active_at: new Date().toISOString(),
                      current: true,
                    }]).map((item) => (
                      <article className="account-tile" key={item.id}>
                        <strong>{item.label}</strong>
                        <p>{item.phone || '-'}</p>
                        <p>Last active: {new Date(item.last_active_at).toLocaleString()}</p>
                        {item.current && <span className="account-chip">Current device</span>}
                      </article>
                    ))}
                    <button
                      type="button"
                      className="account-primary-btn"
                      onClick={() => {
                        setDeviceSessions((prev) => prev.filter((item) => item.current))
                        flashNotice('Signed out from other devices')
                      }}
                    >
                      Sign Out From Other Devices
                    </button>
                  </div>
                </section>
              )}

              {accountView === 'profile' && (
                <section className="account-section">
                  <form className="account-form" onSubmit={saveProfile}>
                    <label>Full Name</label>
                    <input
                      type="text"
                      value={profileForm.fullName}
                      onChange={(event) => setProfileForm((prev) => ({ ...prev, fullName: event.target.value }))}
                    />
                    <label>Email</label>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(event) => setProfileForm((prev) => ({ ...prev, email: event.target.value }))}
                    />
                    <label>Phone</label>
                    <input type="text" value={userPhone || '-'} disabled />
                    <label>Gender</label>
                    <select value={profileForm.gender} onChange={(event) => setProfileForm((prev) => ({ ...prev, gender: event.target.value }))}>
                      {['Prefer not to say', 'Male', 'Female', 'Other'].map((option) => <option key={option}>{option}</option>)}
                    </select>
                    <button type="submit" className="account-primary-btn">Save Profile</button>
                  </form>
                </section>
              )}

              {accountView === 'cards' && (
                <section className="account-section">
                  <div className="account-content">
                    <article className="account-tile">
                      <strong>Provider-managed card entry</strong>
                      <p>Brandcart uses Razorpay Checkout for card, UPI, wallet, and netbanking payments.</p>
                      <p className="quick-panel-meta">Full card numbers are not stored in this browser anymore.</p>
                    </article>
                    <article className="account-tile">
                      <strong>Next upgrade</strong>
                      <p>Saved instruments will appear here only after gateway tokenization is enabled server-side.</p>
                      <p className="quick-panel-meta">Until then, card entry happens securely inside the payment provider checkout during payment.</p>
                    </article>
                  </div>
                </section>
              )}

              {accountView === 'language' && (
                <section className="account-section">
                  <div className="account-content">
                    {['English', 'Hindi', 'Tamil', 'Telugu'].map((language) => (
                      <button type="button" key={language} className={`account-choice ${accountLanguage === language ? 'is-selected' : ''}`} onClick={() => saveLanguage(language)}>
                        {language}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {accountView === 'notifications' && (
                <section className="account-section">
                  <div className="account-content">
                    {[
                      ['orderUpdates', 'Order Updates'],
                      ['promotions', 'Promotions & Offers'],
                      ['priceAlerts', 'Price Drop Alerts'],
                    ].map(([key, label]) => (
                      <label className="account-switch-row" key={key}>
                        <span>{label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(notificationPrefs[key])}
                          onChange={() => toggleNotificationPref(key)}
                        />
                      </label>
                    ))}
                  </div>
                </section>
              )}

              {accountView === 'privacy' && (
                <section className="account-section">
                  <div className="account-content">
                    {[
                      ['personalizedAds', 'Personalized Ads'],
                      ['usageAnalytics', 'Usage Analytics'],
                      ['savedSearches', 'Save Search History'],
                    ].map(([key, label]) => (
                      <label className="account-switch-row" key={key}>
                        <span>{label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(privacyPrefs[key])}
                          onChange={() => togglePrivacyPref(key)}
                        />
                      </label>
                    ))}
                  </div>
                </section>
              )}

              {accountView === 'wishlist' && (
                <section className="account-section">
                  <div className="account-content">
                    {isLoadingWishlistItems && <p className="quick-panel-meta">Loading wishlist...</p>}
                    {!isLoadingWishlistItems && wishlistItems.length === 0 && <p className="quick-panel-meta">No items in wishlist.</p>}
                    {!isLoadingWishlistItems && wishlistItems.map((item) => {
                      const pricing = getProductPricingMeta(item)
                      return (
                        <article className="quick-panel-item" key={item.id}>
                          <button type="button" className="quick-panel-thumb" onClick={() => { openProduct(item); closeQuickPanel() }}>
                            {Array.isArray(item.images) && item.images[0] ? <img src={item.images[0]} alt={item.title} /> : <span>No image</span>}
                          </button>
                          <div className="quick-panel-copy">
                            <strong>{item.title}</strong>
                            <p className="quick-panel-price">
                              <strong>{formatInr(pricing.effectivePrice) || '-'}</strong>
                              {pricing.hasComparePrice && <span>{formatInr(pricing.comparePrice)}</span>}
                            </p>
                            {pricing.hasComparePrice && (
                              <p className="quick-panel-discount">
                                {pricing.discountBadgeLabel}
                                {pricing.savingsAmount ? ` | Save ${formatInr(pricing.savingsAmount) || '₹0'}` : ''}
                              </p>
                            )}
                            <div className="quick-panel-row">
                              <button type="button" onClick={() => addProductToCart(item)}>Add to Cart</button>
                              <button type="button" onClick={() => removeFromWishlist(item.id)}>Remove</button>
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </section>
              )}

              {accountView === 'orders' && (
                <section className="account-section">
                  <div className="account-content">
                    <div className="buyer-order-stats">
                      <article>
                        <strong>{buyerOrderStats.total}</strong>
                        <span>Total Orders</span>
                      </article>
                      <article>
                        <strong>{buyerOrderStats.active}</strong>
                        <span>Active Shipments</span>
                      </article>
                      <article>
                        <strong>{buyerOrderStats.returns}</strong>
                        <span>Return Cases</span>
                      </article>
                      <article>
                        <strong>{buyerOrderStats.refundsPending}</strong>
                        <span>Refund Reviews</span>
                      </article>
                    </div>
                    <div className="buyer-order-toolbar">
                      <div className="form-group">
                        <label>Order Status</label>
                        <select value={buyerOrderStatusFilter} onChange={(event) => setBuyerOrderStatusFilter(event.target.value)}>
                          {buyerOrderStatusOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <button type="button" className="account-inline-btn" disabled={isLoadingBuyerOrders} onClick={() => loadBuyerOrders()}>
                        {isLoadingBuyerOrders ? 'Loading...' : 'Refresh Orders'}
                      </button>
                    </div>
                    {isLoadingBuyerOrders && <p className="quick-panel-meta">Loading your orders...</p>}
                    {!isLoadingBuyerOrders && buyerOrders.length === 0 && <p className="quick-panel-meta">No orders found.</p>}
                    {!isLoadingBuyerOrders && buyerOrders.map((order) => {
                      const orderId = String(order?.id || '')
                      const isUpdatingCancel = buyerUpdatingOrderActionId === `${orderId}:cancel`
                      const isUpdatingReturn = buyerUpdatingOrderActionId === `${orderId}:return`
                      const productPreview = order?.product?.id
                        ? {
                          id: order.product.id,
                          title: order?.product?.title || 'Product',
                          images: order?.product?.image ? [order.product.image] : [],
                        }
                        : null
                      return (
                        <article className="buyer-order-card" key={orderId || Math.random()}>
                          <button
                            type="button"
                            className="buyer-order-media"
                            onClick={() => {
                              if (productPreview) {
                                openProduct(productPreview)
                                closeQuickPanel()
                              }
                            }}
                            disabled={!productPreview}
                          >
                            {order?.product?.image ? <img src={order.product.image} alt={order?.product?.title || 'Product'} /> : <span>{getInitials(order?.product?.title || 'Product')}</span>}
                          </button>
                          <div className="buyer-order-body">
                            <div className="buyer-order-head">
                              <div>
                                <strong>{order?.product?.title || 'Product'}</strong>
                                <p>Order {orderId || '-'}</p>
                              </div>
                              <span className={`status-chip is-${getStatusTone(order?.status)}`}>{formatStatusText(order?.status)}</span>
                            </div>
                            <div className="buyer-order-meta">
                              <p>Amount: {formatCurrency(order?.pricing?.subtotal || 0)} | Qty: {Number(order?.quantity || 0)}</p>
                              <p>Payment: {formatStatusText(order?.payment?.method)} / {formatStatusText(order?.payment?.status)}</p>
                              <p>Seller: {order?.seller_snapshot?.brand_name || '-'}</p>
                              <p>Shipping Partner: {order?.shipping?.partner_name || 'Seller will update shipment soon'}</p>
                              {order?.shipping?.tracking_number && <p>AWB / Tracking ID: {order.shipping.tracking_number}</p>}
                              {order?.delivery_otp && !order?.shipping?.partner_name && <p>Delivery OTP: <strong>{order.delivery_otp}</strong></p>}
                              {!order?.delivery_otp && order?.status === 'out_for_delivery' && !order?.shipping?.partner_name && <p>Delivery OTP: waiting for courier update</p>}
                              {order?.shipping?.last_status_sync_at && <p>Last Courier Sync: {formatDateTime(order.shipping.last_status_sync_at)}</p>}
                              <p>Placed: {formatDateTime(order?.created_at)}</p>
                              {order?.delivered_at && <p>Delivered: {formatDateTime(order.delivered_at)}</p>}
                              {order?.return_window_ends_at && <p>Return Window: {formatDateTime(order.return_window_ends_at)}</p>}
                              {order?.cancellation?.requested_at && <p>Cancellation Requested: {formatDateTime(order.cancellation.requested_at)}</p>}
                              {order?.return?.requested_at && <p>Return Requested: {formatDateTime(order.return.requested_at)}</p>}
                              {order?.return?.seller_action_deadline && <p>Seller Response Due: {formatDateTime(order.return.seller_action_deadline)}</p>}
                              {order?.return?.pickup_completed_at && <p>Pickup Completed: {formatDateTime(order.return.pickup_completed_at)}</p>}
                              {order?.return?.refunded_at && <p>Refunded: {formatDateTime(order.return.refunded_at)}</p>}
                              {order?.cancellation?.refunded_at && <p>Refunded: {formatDateTime(order.cancellation.refunded_at)}</p>}
                              {order?.shipping?.tracking_url && (
                                <p>
                                  Tracking Link:{' '}
                                  <a href={order.shipping.tracking_url} target="_blank" rel="noreferrer">Open courier tracking</a>
                                </p>
                              )}
                            </div>
                            <div className="buyer-order-care">
                              {order?.payment?.status && (
                                <span className={`status-chip is-${getStatusTone(order.payment.status)}`}>
                                  Payment {formatStatusText(order.payment.status)}
                                </span>
                              )}
                              {order?.return?.status && (
                                <span className={`status-chip is-${getStatusTone(order.return.status)}`}>
                                  Return {formatStatusText(order.return.status)}
                                </span>
                              )}
                              {order?.return?.pickup_status && (
                                <span className={`status-chip is-${getStatusTone(order.return.pickup_status)}`}>
                                  Pickup {formatStatusText(order.return.pickup_status)}
                                </span>
                              )}
                              {order?.return?.refund_status && (
                                <span className={`status-chip is-${getStatusTone(order.return.refund_status)}`}>
                                  Return Refund {formatStatusText(order.return.refund_status)}
                                </span>
                              )}
                              {order?.cancellation?.refund_status && (
                                <span className={`status-chip is-${getStatusTone(order.cancellation.refund_status)}`}>
                                  Cancellation Refund {formatStatusText(order.cancellation.refund_status)}
                                </span>
                              )}
                            </div>
                            {order?.cancellation?.refund_note && <p className="quick-panel-meta">{order.cancellation.refund_note}</p>}
                            {order?.return?.reason && <p className="quick-panel-meta">Return Reason: {formatStatusText(order.return.reason)}</p>}
                            <div className="buyer-order-actions">
                              <button
                                type="button"
                                className="account-inline-btn"
                                disabled={isLoadingBuyerTimeline}
                                onClick={() => loadBuyerOrderTimeline(orderId)}
                              >
                                {isLoadingBuyerTimeline && activeBuyerTimelineOrderId === orderId ? 'Loading...' : 'Track Order'}
                              </button>
                              {productPreview && (
                                <button
                                  type="button"
                                  className="account-inline-btn"
                                  onClick={() => {
                                    openProduct(productPreview)
                                    closeQuickPanel()
                                  }}
                                >
                                  View Product
                                </button>
                              )}
                            </div>
                            {order?.actions?.can_cancel && (
                              <div className="buyer-order-action-form">
                                <div className="form-group">
                                  <label>Cancel reason</label>
                                  <select
                                    value={buyerCancelReasonDrafts[orderId] || ''}
                                    onChange={(event) => setBuyerCancelReasonDrafts((prev) => ({ ...prev, [orderId]: event.target.value }))}
                                  >
                                    {buyerCancelReasonOptions.map((option) => (
                                      <option key={option.value || 'optional'} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <button
                                  type="button"
                                  className="account-inline-btn"
                                  disabled={isUpdatingCancel}
                                  onClick={() => cancelBuyerOrder(orderId)}
                                >
                                  {isUpdatingCancel ? 'Cancelling...' : 'Cancel Order'}
                                </button>
                              </div>
                            )}
                            {order?.actions?.can_return && (
                              <div className="buyer-order-action-form">
                                <div className="form-group">
                                  <label>Return reason</label>
                                  <select
                                    value={buyerReturnReasonDrafts[orderId] || ''}
                                    onChange={(event) => setBuyerReturnReasonDrafts((prev) => ({ ...prev, [orderId]: event.target.value }))}
                                  >
                                    {buyerReturnReasonOptions.map((option) => (
                                      <option key={option.value || 'required'} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <button
                                  type="button"
                                  className="account-inline-btn"
                                  disabled={isUpdatingReturn}
                                  onClick={() => requestBuyerReturn(orderId)}
                                >
                                  {isUpdatingReturn ? 'Submitting...' : 'Request Return'}
                                </button>
                              </div>
                            )}
                          </div>
                        </article>
                      )
                    })}
                    <p className="account-section-title">Tracking Timeline</p>
                    {buyerOrderTimeline.length === 0 ? (
                      <p className="quick-panel-meta">Select an order and tap "Track Order".</p>
                    ) : (
                      <div className="order-status-track">
                        {buyerOrderTimeline.map((event, idx) => (
                          <div key={`${event.event || 'evt'}-${idx}`} className={`order-status-step ${event?.done ? 'done' : ''}`}>
                            <span className="order-status-dot" />
                            <div className="order-status-content">
                              <strong>{event.label || event.event || 'EVENT'}</strong>
                              <p>{formatDateTime(event.created_at)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {accountView === 'reviews' && (
                <section className="account-section">
                  <div className="account-content">
                    <form className="account-form" onSubmit={addReviewDraft}>
                      <label>Write Review Draft</label>
                      <textarea rows={3} value={reviewInput} onChange={(event) => setReviewInput(event.target.value)} placeholder="Share your product experience" />
                      <button type="submit" className="account-primary-btn">Save Draft</button>
                    </form>
                    {reviewDrafts.length === 0 && <p className="quick-panel-meta">No review drafts yet.</p>}
                    {reviewDrafts.map((item) => (
                      <article className="account-tile" key={item.id}>
                        <p>{item.text}</p>
                        <p>{new Date(item.created_at).toLocaleString()}</p>
                      </article>
                    ))}
                    {reviewDrafts.length > 0 && (
                      <button type="button" className="account-inline-btn" onClick={() => setReviewDrafts([])}>Clear All Drafts</button>
                    )}
                  </div>
                </section>
              )}

              {accountView === 'qa' && (
                <section className="account-section">
                  <div className="account-content">
                    <form className="account-form" onSubmit={addQuestion}>
                      <label>Ask a Question</label>
                      <textarea rows={3} value={qaInput} onChange={(event) => setQaInput(event.target.value)} placeholder="Ask about orders, products or policy" />
                      <button type="submit" className="account-primary-btn">Submit Question</button>
                    </form>
                    {qaItems.length === 0 && <p className="quick-panel-meta">No questions asked yet.</p>}
                    {qaItems.map((item) => (
                      <article className="account-tile" key={item.id}>
                        <strong>Q: {item.question}</strong>
                        <p>A: {item.answer}</p>
                        <p>{new Date(item.created_at).toLocaleString()}</p>
                      </article>
                    ))}
                    {qaItems.length > 0 && (
                      <button type="button" className="account-inline-btn" onClick={() => setQaItems([])}>Clear Q&A History</button>
                    )}
                  </div>
                </section>
              )}

              {accountView === 'sell' && (
                <section className="account-section">
                  <div className="account-content">
                    {isLoadingSellerOnboarding && <p className="quick-panel-meta">Checking seller onboarding status...</p>}
                    {!isLoadingSellerOnboarding && sellerOnboarding.status === 'requested' && (
                      <article className="account-tile">
                        <strong>Seller request is under review</strong>
                        <p>Your documents are submitted and pending admin verification.</p>
                        <p>Requested at: {sellerOnboarding.requestedAt ? new Date(sellerOnboarding.requestedAt).toLocaleString() : '-'}</p>
                      </article>
                    )}
                    {!isLoadingSellerOnboarding && (userRole === 'seller' || sellerOnboarding.status === 'verified') && (
                      <article className="account-tile">
                        <strong>Your seller account is verified</strong>
                        <p>You can now access seller features.</p>
                      </article>
                    )}
                    {!isLoadingSellerOnboarding && sellerOnboarding.status === 'rejected' && (
                      <article className="account-tile">
                        <strong>Seller request was rejected</strong>
                        <p>Reason: {sellerOnboarding.rejectedReason || 'Not specified'}</p>
                        <p>Rejected at: {sellerOnboarding.rejectedAt ? new Date(sellerOnboarding.rejectedAt).toLocaleString() : '-'}</p>
                        <p>You can update details and submit again.</p>
                      </article>
                    )}
                    {!isLoadingSellerOnboarding && sellerOnboarding.status !== 'requested' && userRole !== 'seller' && sellerOnboarding.status !== 'verified' && (
                      <form className="account-form" onSubmit={submitSellerRequest}>
                        <label>Legal Name</label>
                        <input type="text" value={sellerRequestForm.legal_name} onChange={(event) => setSellerRequestForm((prev) => ({ ...prev, legal_name: event.target.value }))} />
                        <label>Brand Name</label>
                        <input type="text" value={sellerRequestForm.brand_name} onChange={(event) => setSellerRequestForm((prev) => ({ ...prev, brand_name: event.target.value }))} />
                        <label>Category</label>
                        <input type="text" value={sellerRequestForm.category} onChange={(event) => setSellerRequestForm((prev) => ({ ...prev, category: event.target.value }))} />
                        <label>Description</label>
                        <textarea rows={2} value={sellerRequestForm.description} onChange={(event) => setSellerRequestForm((prev) => ({ ...prev, description: event.target.value }))} />
                        <label>Email</label>
                        <input type="email" value={sellerRequestForm.email} onChange={(event) => setSellerRequestForm((prev) => ({ ...prev, email: event.target.value }))} />
                        <label>PAN Card</label>
                        <input type="text" value={sellerRequestForm.pan_card} onChange={(event) => setSellerRequestForm((prev) => ({ ...prev, pan_card: event.target.value.toUpperCase() }))} />
                        <label>GST Certificate</label>
                        <input type="text" value={sellerRequestForm.gst_certificate} onChange={(event) => setSellerRequestForm((prev) => ({ ...prev, gst_certificate: event.target.value.toUpperCase() }))} />
                        <label>Address Proof (URL/File Id)</label>
                        <input type="text" value={sellerRequestForm.address_proof} onChange={(event) => setSellerRequestForm((prev) => ({ ...prev, address_proof: event.target.value }))} />
                        <label>Logo URL (optional)</label>
                        <input type="text" value={sellerRequestForm.logo_url} onChange={(event) => setSellerRequestForm((prev) => ({ ...prev, logo_url: event.target.value }))} />
                        <button type="submit" className="account-primary-btn" disabled={isSubmittingSellerRequest}>
                          {isSubmittingSellerRequest ? 'Submitting...' : (sellerOnboarding.status === 'rejected' ? 'Resubmit Seller Request' : 'Submit Seller Request')}
                        </button>
                      </form>
                    )}
                  </div>
                </section>
              )}

              {accountView === 'terms' && (
                <section className="account-section">
                  <div className="account-content">
                    {[
                      'Payments are processed securely. Do not share OTPs.',
                      'Returns are subject to product and seller policy.',
                      'COD may be unavailable for some products and pincodes.',
                      'Accounts violating policy may be restricted.',
                    ].map((item) => <p key={item} className="quick-panel-meta">{item}</p>)}
                  </div>
                </section>
              )}

              {accountView === 'faqs' && (
                <section className="account-section">
                  <div className="account-content">
                    {[
                      ['How do I track order?', 'Open Orders section after placing your order.'],
                      ['Why COD unavailable?', 'COD depends on seller settings, pincode and order value.'],
                      ['How to become seller?', 'Use Sell on Brandcart and submit valid KYC details.'],
                      ['How to change address?', 'Open Saved Addresses from account menu.'],
                    ].map(([q, a]) => (
                      <article className="account-tile" key={q}>
                        <strong>{q}</strong>
                        <p>{a}</p>
                      </article>
                    ))}
                  </div>
                </section>
              )}
              </div>
            </div>
          </>
        )}
      </section>
      )}
    </main>
    )
  }

  // Sellers go directly to seller dashboard
  // treat a verified onboarding as a seller as well, in case the backend role field lags
  if (isSellerPortal && hasSellerPortalAccess) {
    return (
      <main className="seller-shell">
        <header className="seller-header">
          <h1>Seller Dashboard</h1>
          <nav className="seller-nav">
            <button type="button" onClick={exitPortalMode}>Back to Storefront</button>
            <button
              className={sellerActiveSection === 'overview' ? 'active' : ''}
              onClick={() => setSellerActiveSection('overview')}
            >
              Overview
            </button>
            <button
              className={sellerActiveSection === 'products' ? 'active' : ''}
              onClick={() => setSellerActiveSection('products')}
            >
              Products
            </button>
            <button
              className={sellerActiveSection === 'orders' ? 'active' : ''}
              onClick={() => setSellerActiveSection('orders')}
            >
              Orders
            </button>
            <button
              className={sellerActiveSection === 'offers' ? 'active' : ''}
              onClick={() => setSellerActiveSection('offers')}
            >
              Offers
            </button>
            <button
              className={sellerActiveSection === 'wallet' ? 'active' : ''}
              onClick={() => setSellerActiveSection('wallet')}
            >
              Wallet
            </button>
            <button
              className={sellerActiveSection === 'account' ? 'active' : ''}
              onClick={() => setSellerActiveSection('account')}
            >
              Account
            </button>
            <button type="button" onClick={refreshSellerDashboard}>Refresh</button>
            <button onClick={logout} className="logout-btn">Logout</button>
          </nav>
          <p className="seller-meta">Logged in as {userPhone || 'seller'}</p>
        </header>
        <section className="seller-content">
          {isLoadingSellerData ? (
            <div className="seller-section"><p>Loading seller data...</p></div>
          ) : sellerDataError ? (
            <div className="seller-section"><p style={{color: '#d32f2f'}}>{sellerDataError}</p></div>
          ) : (() => {
            switch (sellerActiveSection) {
              case 'overview':
                return (
                  <div className="seller-section">
                    <h2>Dashboard Overview</h2>
                    {sellerPerformance && (
                      <div className="metrics-grid">
                        <div className="metric-card">
                          <strong>Total Orders</strong>
                          <p className="metric-value">{sellerPerformance.orders?.total || 0}</p>
                        </div>
                        <div className="metric-card">
                          <strong>Delivered</strong>
                          <p className="metric-value">{sellerPerformance.orders?.delivered || 0}</p>
                        </div>
                        <div className="metric-card">
                          <strong>Cancelled</strong>
                          <p className="metric-value">{sellerPerformance.orders?.cancelled || 0}</p>
                        </div>
                        <div className="metric-card">
                          <strong>Net Revenue</strong>
                          <p className="metric-value">{formatCurrency(sellerPerformance.revenue?.net)}</p>
                        </div>
                      </div>
                    )}
                    {sellerDashboardProfile && (
                      <div className="seller-info-card">
                        <h3>Store Information</h3>
                        <div className="info-row">
                          <span className="label">Brand Name:</span>
                          <span className="value">{sellerDashboardProfile.brand?.brand_name || '-'}</span>
                        </div>
                        <div className="info-row">
                          <span className="label">Seller ID:</span>
                          <span className="value">{sellerDashboardProfile.seller_id || '-'}</span>
                        </div>
                        <div className="info-row">
                          <span className="label">Status:</span>
                          <span className="value">{sellerDashboardProfile.status?.seller_status || '-'}</span>
                        </div>
                        <div className="info-row">
                          <span className="label">Frozen:</span>
                          <span className="value">{sellerDashboardProfile.status?.is_frozen ? 'Yes' : 'No'}</span>
                        </div>
                        <div className="info-row">
                          <span className="label">COD Enabled:</span>
                          <span className="value">{sellerDashboardProfile.status?.cod_enabled ? 'Yes' : 'No'}</span>
                        </div>
                        <div className="info-row">
                          <span className="label">All India Delivery:</span>
                          <span className="value">{sellerAllIndia ? 'Enabled' : 'Disabled'}</span>
                        </div>
                      </div>
                    )}
                    <div className="seller-info-card">
                      <h3>Serviceable Areas</h3>
                      <p>{sellerAllIndia ? 'Delivering across India' : `${sellerServiceableRegions.length} state/city regions configured`}</p>
                      <button
                        type="button"
                        className="seller-button primary"
                        onClick={enableSellerCod}
                        disabled={isEnablingSellerCod}
                      >
                        {isEnablingSellerCod ? 'Enabling COD...' : 'Enable COD'}
                      </button>
                    </div>
                    <div className="seller-info-card">
                      <h3>Delivery Notifications</h3>
                      {sellerNotifications.length === 0 ? (
                        <p className="quick-panel-meta">No delivery notifications yet.</p>
                      ) : (
                        <div className="delivery-notification-list">
                          {sellerNotifications.slice(0, 6).map((item, idx) => (
                            <article key={`${item?.order_id || 'note'}-${idx}`} className="delivery-notification-item">
                              <strong>{item?.title || 'Update'}</strong>
                              <p>{item?.message || '-'}</p>
                              <span>{formatDateTime(item?.created_at)}</span>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              case 'products':
                return (
                  <div className="seller-section">
                    <h2>Create Product</h2>
                    <form className="account-form" onSubmit={createSellerProduct}>
                      <div className="form-group">
                        <label>Title</label>
                        <input
                          type="text"
                          value={sellerCreateProductForm.title}
                          onChange={(event) => setSellerCreateProductForm((prev) => ({ ...prev, title: event.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label>Description</label>
                        <textarea
                          rows={3}
                          value={sellerCreateProductForm.description}
                          onChange={(event) => setSellerCreateProductForm((prev) => ({ ...prev, description: event.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label>Category</label>
                        <input
                          type="text"
                          value={sellerCreateProductForm.category}
                          onChange={(event) => setSellerCreateProductForm((prev) => ({ ...prev, category: event.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label>Sub Category</label>
                        <input
                          type="text"
                          value={sellerCreateProductForm.sub_category}
                          onChange={(event) => setSellerCreateProductForm((prev) => ({ ...prev, sub_category: event.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label>Tags (comma separated)</label>
                        <input
                          type="text"
                          value={sellerCreateProductForm.tags}
                          onChange={(event) => setSellerCreateProductForm((prev) => ({ ...prev, tags: event.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label>MRP</label>
                        <input
                          type="number"
                          value={sellerCreateProductForm.mrp}
                          onChange={(event) => setSellerCreateProductForm((prev) => ({ ...prev, mrp: event.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label>Selling Price</label>
                        <input
                          type="number"
                          value={sellerCreateProductForm.selling_price}
                          onChange={(event) => setSellerCreateProductForm((prev) => ({ ...prev, selling_price: event.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label>Stock</label>
                        <input
                          type="number"
                          value={sellerCreateProductForm.stock}
                          onChange={(event) => setSellerCreateProductForm((prev) => ({ ...prev, stock: event.target.value }))}
                        />
                      </div>
                      <div className="seller-variant-editor">
                        <div className="seller-variant-head">
                          <div>
                            <strong>Variants</strong>
                            <p className="quick-panel-meta">Optional. Add size, color, storage, or pack options. If variants are added, price and stock are derived automatically from them.</p>
                          </div>
                          <button type="button" className="account-inline-btn" onClick={addSellerVariantDraft}>Add Variant</button>
                        </div>
                        {sellerProductVariants.length === 0 && <p className="quick-panel-meta">No variants added. This product will use the single price and stock above.</p>}
                        {sellerProductVariants.length > 0 && (
                          <div className="seller-variant-list">
                            {sellerProductVariants.map((variant, index) => (
                              <article className="seller-variant-card" key={variant.id}>
                                <div className="seller-variant-grid">
                                  <div className="form-group">
                                    <label>Label</label>
                                    <input
                                      type="text"
                                      value={variant.label}
                                      onChange={(event) => updateSellerVariantDraft(variant.id, 'label', event.target.value)}
                                      placeholder="Size / Color / Storage"
                                    />
                                  </div>
                                  <div className="form-group">
                                    <label>Option</label>
                                    <input
                                      type="text"
                                      value={variant.value}
                                      onChange={(event) => updateSellerVariantDraft(variant.id, 'value', event.target.value)}
                                      placeholder="128 GB / Black / XL"
                                    />
                                  </div>
                                  <div className="form-group">
                                    <label>MRP</label>
                                    <input
                                      type="number"
                                      value={variant.mrp}
                                      onChange={(event) => updateSellerVariantDraft(variant.id, 'mrp', event.target.value)}
                                    />
                                  </div>
                                  <div className="form-group">
                                    <label>Selling</label>
                                    <input
                                      type="number"
                                      value={variant.selling_price}
                                      onChange={(event) => updateSellerVariantDraft(variant.id, 'selling_price', event.target.value)}
                                    />
                                  </div>
                                  <div className="form-group">
                                    <label>Stock</label>
                                    <input
                                      type="number"
                                      value={variant.stock}
                                      onChange={(event) => updateSellerVariantDraft(variant.id, 'stock', event.target.value)}
                                    />
                                  </div>
                                  <div className="form-group">
                                    <label>SKU</label>
                                    <input
                                      type="text"
                                      value={variant.sku}
                                      onChange={(event) => updateSellerVariantDraft(variant.id, 'sku', event.target.value.toUpperCase())}
                                      placeholder={`VAR-${index + 1}`}
                                    />
                                  </div>
                                </div>
                                <div className="form-group">
                                  <label>Variant Image URL (optional)</label>
                                  <input
                                    type="text"
                                    value={variant.image}
                                    onChange={(event) => updateSellerVariantDraft(variant.id, 'image', event.target.value)}
                                    placeholder="https://..."
                                  />
                                </div>
                                <button type="button" className="account-inline-btn" onClick={() => removeSellerVariantDraft(variant.id)}>Remove Variant</button>
                              </article>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="form-group">
                        <label>Image URLs (comma or new-line separated)</label>
                        <textarea
                          rows={3}
                          value={sellerCreateProductForm.images}
                          onChange={(event) => setSellerCreateProductForm((prev) => ({ ...prev, images: event.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label>Upload Product Images From Device</label>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(event) => setSellerProductUploadFiles(Array.from(event.target.files || []))}
                        />
                        {sellerProductUploadFiles.length > 0 && (
                          <p className="quick-panel-meta">{sellerProductUploadFiles.length} file(s) selected</p>
                        )}
                        {sellerProductFilePreviews.length > 0 && (
                          <div className="seller-upload-preview-grid">
                            {sellerProductFilePreviews.map((item) => (
                              <article key={item.id} className="seller-upload-preview-card">
                                <img src={item.url} alt={item.name} />
                                <p title={item.name}>{item.name}</p>
                                <button type="button" className="account-inline-btn" onClick={() => removeSelectedSellerProductFile(item.id)}>
                                  Remove
                                </button>
                              </article>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          className="account-inline-btn"
                          onClick={uploadSellerProductImages}
                          disabled={isUploadingSellerProductImages}
                        >
                          {isUploadingSellerProductImages ? 'Uploading...' : 'Upload Selected Images'}
                        </button>
                      </div>
                      <button type="submit" className="seller-button primary" disabled={isCreatingSellerProduct}>
                        {isCreatingSellerProduct ? 'Creating...' : 'Create Product'}
                      </button>
                    </form>
                    <h2>My Products ({sellerProducts.length})</h2>
                    {sellerProducts.length === 0 ? (
                      <p>No products yet. Start adding products to your store.</p>
                    ) : (
                      <div className="products-list">
                        {sellerProducts.map((product) => (
                          <div key={product.id} className="product-row">
                            <div className="product-info">
                              <strong>{product.title}</strong>
                              <p className="product-category">Stock: {product.stock} | Reserved: {product.reserved_stock} | Available: {product.available_stock}</p>
                              {Number(product.variant_count || 0) > 0 && (
                                <p className="product-category">Variants: {Number(product.variant_count || 0)}</p>
                              )}
                              {Array.isArray(product.variants) && product.variants.length > 0 && (
                                <div className="seller-variant-summary">
                                  {product.variants.slice(0, 6).map((variant) => (
                                    <span key={variant.id || variant.name}>
                                      {getVariantDisplayLabel(variant)} | {formatCurrency(variant.selling_price)} | {Number(variant.available_stock || 0)} left
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="product-pricing">
                              <strong>{formatCurrency(product.selling_price)}</strong>
                              {product.mrp > product.selling_price && (
                                <span style={{textDecoration: 'line-through', color: '#999', marginLeft: '8px'}}>
                                  {formatCurrency(product.mrp)}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              case 'orders':
                return (
                  <div className="seller-section">
                    <h2>Orders</h2>
                    <div className="seller-info-card">
                      <h3>Shipping Partners</h3>
                      <p className="quick-panel-meta">
                        Sellers manage third-party couriers from here. Choose the courier, add the AWB or tracking number, and share a tracking link so buyers can follow the shipment.
                      </p>
                      {sellerShippingPartners.length === 0 ? (
                        <p className="quick-panel-meta">No shipping partners configured yet.</p>
                      ) : (
                        <div className="delivery-partner-list">
                          {sellerShippingPartners.map((partner) => (
                            <article key={partner?.id || Math.random()} className="delivery-partner-chip">
                              <strong>{partner?.name || '-'}</strong>
                              <span>{partner?.code ? partner.code.toUpperCase() : 'Courier partner'}</span>
                              <p className="delivery-partner-detail">Coverage: {partner?.coverage || 'Seller managed external network'}</p>
                              <small>Rating: {partner?.rating || '-'} | Third-party courier</small>
                              <em className="delivery-partner-status ready">Buyers will track this shipment through the courier link you save.</em>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="seller-toolbar">
                      <div className="form-group">
                        <label>Status Filter</label>
                        <select
                          value={sellerOrderStatusFilter}
                          onChange={(event) => setSellerOrderStatusFilter(event.target.value)}
                        >
                          {['all', 'created', 'shipped', 'out_for_delivery', 'delivery_otp_pending', 'delivered', 'return_requested', 'cancelled', 'rto'].map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </div>
                      <button type="button" className="account-inline-btn" disabled={isLoadingSellerOrders} onClick={() => loadSellerOrders()}>
                        {isLoadingSellerOrders ? 'Loading...' : 'Refresh Orders'}
                      </button>
                    </div>
                    {isLoadingSellerOrders && <p className="quick-panel-meta">Loading orders...</p>}
                    {!isLoadingSellerOrders && sellerOrders.length === 0 && <p className="quick-panel-meta">No orders found for selected filter.</p>}
                    {!isLoadingSellerOrders && sellerOrders.length > 0 && (
                      <div className="admin-request-list">
                        {sellerOrders.map((order) => {
                          const orderId = order?.id || ''
                          const status = String(order?.status || '-').toLowerCase()
                          const statusLabel = order?.status || '-'
                          const returnStatus = order?.return?.status || ''
                          const shipping = order?.shipping || {}
                          const selectedPartnerId = String(
                            sellerPartnerSelections[orderId]
                            || shipping?.partner_id
                            || '',
                          )
                          const shipmentDraft = sellerShipmentDrafts[orderId] || {
                            tracking_number: String(shipping?.tracking_number || '').trim(),
                            tracking_url: String(shipping?.tracking_url || '').trim(),
                          }
                          const assignedPartnerName = shipping?.partner_name || ''
                          const canShip = status === 'created'
                          const canReturnAction = returnStatus === 'requested'
                          const canSaveShipment = ['created', 'shipped', 'out_for_delivery'].includes(status)
                          const canMarkOutForDelivery = status === 'shipped'
                          const canMarkDelivered = ['shipped', 'out_for_delivery'].includes(status)
                          return (
                            <article className="account-tile" key={orderId || `seller-order-${Math.random()}`}>
                              <strong>{order?.product?.title || 'Order'} ({orderId || '-'})</strong>
                              <p>Status: {statusLabel}</p>
                              <p>Payment: {order?.payment?.method || '-'} ({order?.payment?.status || '-'})</p>
                              <p>Qty: {Number(order?.quantity || 0)} | Amount: {formatCurrency(order?.pricing?.subtotal || 0)}</p>
                              <p>Payout: {formatCurrency(order?.pricing?.seller_payout || 0)}</p>
                              <p>Shipping Partner: {assignedPartnerName || 'Shipment not booked yet'}</p>
                              {shipping?.tracking_number && (
                                <p>AWB / Tracking ID: {shipping.tracking_number}</p>
                              )}
                              {shipping?.tracking_url && (
                                <p>
                                  Tracking Link:{' '}
                                  <a href={shipping.tracking_url} target="_blank" rel="noreferrer">Open courier tracking</a>
                                </p>
                              )}
                              {shipping?.last_status_sync_at && (
                                <p>Last Courier Sync: {formatDateTime(shipping.last_status_sync_at)}</p>
                              )}
                              <p>
                                Deliver to: {order?.delivery_address?.name || '-'} | {order?.delivery_address?.city || '-'},
                                {' '}{order?.delivery_address?.state || '-'} {order?.delivery_address?.pincode || ''}
                              </p>
                              <p>Placed: {formatDateTime(order?.created_at)}</p>
                              <div className="form-group">
                                <label>Shipping Partner</label>
                                <select
                                  value={selectedPartnerId}
                                  onChange={(event) => setSellerPartnerSelections((prev) => ({
                                    ...prev,
                                    [orderId]: event.target.value,
                                  }))}
                                >
                                  <option value="">Select shipping partner</option>
                                  {sellerShippingPartners.map((partner) => (
                                    <option key={partner?.id || Math.random()} value={partner?.id || ''}>
                                      {partner?.name || '-'} ({partner?.code || '-'}) | {partner?.coverage || 'Coverage pending'}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="form-group">
                                <label>AWB / Tracking Number</label>
                                <input
                                  type="text"
                                  value={shipmentDraft.tracking_number || ''}
                                  onChange={(event) => updateSellerShipmentDraft(orderId, 'tracking_number', event.target.value)}
                                  placeholder="Enter courier tracking number"
                                />
                              </div>
                              <div className="form-group">
                                <label>Tracking Link</label>
                                <input
                                  type="url"
                                  value={shipmentDraft.tracking_url || ''}
                                  onChange={(event) => updateSellerShipmentDraft(orderId, 'tracking_url', event.target.value)}
                                  placeholder="https://courier.example/track/..."
                                />
                              </div>
                              <div className="product-actions">
                                {canSaveShipment && (
                                  <button
                                    type="button"
                                    className="action-btn edit"
                                    disabled={!selectedPartnerId || String(shipmentDraft.tracking_number || '').trim().length < 4 || sellerAssigningPartnerOrderId === orderId}
                                    onClick={() => saveSellerOrderShipment(orderId, selectedPartnerId)}
                                  >
                                    {sellerAssigningPartnerOrderId === orderId ? 'Saving...' : (canShip ? 'Save Shipment + Mark Shipped' : 'Update Shipment')}
                                  </button>
                                )}
                                {canMarkOutForDelivery && (
                                  <button
                                    type="button"
                                    className="action-btn edit"
                                    disabled={sellerUpdatingShipmentStatusOrderId === `${orderId}:out_for_delivery`}
                                    onClick={() => syncSellerShipmentStatus(orderId, 'out_for_delivery')}
                                  >
                                    {sellerUpdatingShipmentStatusOrderId === `${orderId}:out_for_delivery` ? 'Updating...' : 'Mark Out For Delivery'}
                                  </button>
                                )}
                                {canMarkDelivered && (
                                  <button
                                    type="button"
                                    className="action-btn edit"
                                    disabled={sellerUpdatingShipmentStatusOrderId === `${orderId}:delivered`}
                                    onClick={() => syncSellerShipmentStatus(orderId, 'delivered')}
                                  >
                                    {sellerUpdatingShipmentStatusOrderId === `${orderId}:delivered` ? 'Updating...' : 'Mark Delivered'}
                                  </button>
                                )}
                                <span className="quick-panel-meta">Use the courier app for actual delivery operations. Brandcart stores the courier and tracking details for buyers.</span>
                                {canReturnAction && (
                                  <>
                                    <button
                                      type="button"
                                      className="action-btn edit"
                                      disabled={isSubmittingSellerOrderAction}
                                      onClick={() => {
                                        setSellerOrderOps((prev) => ({ ...prev, order_id: orderId, return_action: 'accept' }))
                                        submitSellerReturnAction(orderId, 'accept')
                                      }}
                                    >
                                      Accept Return
                                    </button>
                                    <button
                                      type="button"
                                      className="action-btn delete"
                                      disabled={isSubmittingSellerOrderAction}
                                      onClick={() => {
                                        setSellerOrderOps((prev) => ({ ...prev, order_id: orderId, return_action: 'reject' }))
                                        submitSellerReturnAction(orderId, 'reject')
                                      }}
                                    >
                                      Reject Return
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  className="action-btn edit"
                                  disabled={isLoadingSellerTimeline}
                                  onClick={() => {
                                    setSellerOrderOps((prev) => ({ ...prev, order_id: orderId }))
                                    loadSellerOrderTimeline(orderId)
                                  }}
                                >
                                  {isLoadingSellerTimeline && sellerOrderOps.order_id === orderId ? 'Loading...' : 'Timeline'}
                                </button>
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    )}
                    <h3>Timeline</h3>
                    {sellerOrderTimeline.length === 0 ? <p className="quick-panel-meta">No events loaded.</p> : (
                      <div className="order-status-track">
                        {sellerOrderTimeline.map((event, idx) => (
                          <div key={`${event.event || 'evt'}-${idx}`} className={`order-status-step ${event?.done ? 'done' : ''}`}>
                            <span className="order-status-dot" />
                            <div className="order-status-content">
                              <strong>{event.label || event.event || 'EVENT'}</strong>
                              <p>{formatDateTime(event.created_at)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              case 'offers': {
                const selectedOfferProduct = sellerProducts.find((product) => String(product?.id || '') === String(sellerOfferForm.product_id || ''))
                const existingSelectedOffer = sellerOffers.find((offer) => (
                  String(offer?.product_id || '') === String(sellerOfferForm.product_id || '')
                  && String(offer?.status || '').toLowerCase() === 'active'
                  && (!offer?.end_at || Date.parse(offer.end_at) >= Date.now())
                ))
                return (
                  <div className="seller-section">
                    <h2>Offers</h2>
                    <form className="account-form" onSubmit={createSellerOffer}>
                      <div className="form-group">
                        <label>Product</label>
                        <select
                          value={sellerOfferForm.product_id}
                          onChange={(event) => setSellerOfferForm((prev) => ({ ...prev, product_id: event.target.value }))}
                        >
                          <option value="">Select Product</option>
                          {sellerProducts.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Offer Price</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={sellerOfferForm.offer_price}
                          onChange={(event) => setSellerOfferForm((prev) => ({ ...prev, offer_price: event.target.value }))}
                        />
                        {selectedOfferProduct && (
                          <p className="quick-panel-meta">Current product price: {formatCurrency(selectedOfferProduct.selling_price)}</p>
                        )}
                      </div>
                      <div className="form-group">
                        <label>Start</label>
                        <input
                          type="datetime-local"
                          value={sellerOfferForm.start_at}
                          onChange={(event) => setSellerOfferForm((prev) => ({ ...prev, start_at: event.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label>End</label>
                        <input
                          type="datetime-local"
                          value={sellerOfferForm.end_at}
                          onChange={(event) => setSellerOfferForm((prev) => ({ ...prev, end_at: event.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label>Festival Slug (optional)</label>
                        <input
                          type="text"
                          value={sellerOfferForm.festival_slug}
                          onChange={(event) => setSellerOfferForm((prev) => ({ ...prev, festival_slug: event.target.value }))}
                        />
                        <p className="quick-panel-meta">Leave this blank unless an admin gave you a live festival slug.</p>
                      </div>
                      {existingSelectedOffer && (
                        <p className="quick-panel-meta">A live offer already exists for this product. Saving here will update that offer instead of throwing a 400.</p>
                      )}
                      <button type="submit" className="seller-button primary" disabled={isCreatingSellerOffer}>
                        {isCreatingSellerOffer ? 'Saving...' : 'Create / Update Offer'}
                      </button>
                    </form>
                    <h3>Existing Offers</h3>
                    {isLoadingSellerOffers ? (
                      <p>Loading offers...</p>
                    ) : sellerOffers.length === 0 ? (
                      <p className="quick-panel-meta">No offers created yet.</p>
                    ) : (
                      <div className="products-list">
                        {sellerOffers.map((offer, index) => {
                          const offerId = String(offer?._id || offer?.id || '')
                          return (
                            <div key={offerId || `offer-${index}`} className="product-row">
                              <div className="product-info">
                                <strong>Product: {offer.product_title || String(offer.product_id || '-')}</strong>
                                <p className="product-category">Offer: {formatCurrency(offer.offer_price)} | Status: {offer.status || '-'}</p>
                                <p className="product-category">{formatDateTime(offer.start_at)} to {formatDateTime(offer.end_at)}</p>
                              </div>
                              <div className="product-actions">
                                <button
                                  type="button"
                                  className="action-btn edit"
                                  disabled={!offerId || sellerUpdatingOfferId === offerId}
                                  onClick={() => pauseSellerOffer(offerId)}
                                >
                                  Pause
                                </button>
                                <button
                                  type="button"
                                  className="action-btn delete"
                                  disabled={!offerId || sellerUpdatingOfferId === offerId}
                                  onClick={() => deleteSellerOffer(offerId)}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              }
              case 'wallet': {
                const payoutRequests = Array.isArray(sellerWallet?.payout_requests) ? sellerWallet.payout_requests : []
                const activeEmergencyPayout = sellerWallet?.emergency_payout?.active_request || payoutRequests.find((request) => ['requested', 'processing'].includes(String(request?.status || '').toLowerCase()))
                const canRequestEmergencyPayout = Boolean(sellerWallet?.emergency_payout?.can_request ?? !activeEmergencyPayout)
                return (
                  <div className="seller-section">
                    <h2>Wallet & Payouts</h2>
                    {!sellerWallet && <p className="quick-panel-meta">Wallet data is unavailable right now. Refresh the dashboard and try again.</p>}
                    {sellerWallet && (
                      <>
                        <div className="wallet-summary">
                          <div className="wallet-card primary">
                            <p className="wallet-label">Available Balance</p>
                            <p className="wallet-amount">{formatCurrency(sellerWallet.balances?.available)}</p>
                          </div>
                          <div className="wallet-card warning">
                            <p className="wallet-label">Reserved Amount</p>
                            <p className="wallet-amount">{formatCurrency(sellerWallet.balances?.reserved)}</p>
                          </div>
                        </div>
                        <div className="seller-info-card">
                          <h3>Totals</h3>
                          <div className="info-row">
                            <span className="label">Earned</span>
                            <span className="value">{formatCurrency(sellerWallet.totals?.earned)}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">Commission</span>
                            <span className="value">{formatCurrency(sellerWallet.totals?.commission)}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">Platform Fees</span>
                            <span className="value">{formatCurrency(sellerWallet.totals?.platform_fees)}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">Refunds</span>
                            <span className="value">{formatCurrency(sellerWallet.totals?.refunds)}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">Emergency Holds</span>
                            <span className="value">{formatCurrency(sellerWallet.totals?.emergency_holds)}</span>
                          </div>
                        </div>
                        {activeEmergencyPayout && (
                          <article className="account-tile">
                            <strong>Emergency payout in progress</strong>
                            <p>Status: {activeEmergencyPayout.status || '-'}</p>
                            <p>Requested: {formatDateTime(activeEmergencyPayout.requested_at)}</p>
                            <p>Amount: {formatCurrency(activeEmergencyPayout.amount)} | Fee: {formatCurrency(activeEmergencyPayout.settlement_fee)}</p>
                            <p>Total Debit: {formatCurrency(activeEmergencyPayout.total_debit)}</p>
                            {activeEmergencyPayout.failure_reason && <p>Failure: {activeEmergencyPayout.failure_reason}</p>}
                            {activeEmergencyPayout.review_reason && <p>Admin Note: {activeEmergencyPayout.review_reason}</p>}
                          </article>
                        )}
                        <form className="account-form" onSubmit={requestEmergencyPayout}>
                          <h3>Emergency Payout</h3>
                          <p className="quick-panel-meta">Use this only for urgent liquidity needs. One emergency payout can stay open at a time until admin approval, provider completion, or hold release.</p>
                          <div className="form-group">
                            <label>Amount</label>
                            <input type="number" value={sellerPayoutForm.amount} onChange={(event) => setSellerPayoutForm((prev) => ({ ...prev, amount: event.target.value }))} disabled={!canRequestEmergencyPayout} />
                          </div>
                          <div className="form-group">
                            <label className="address-default">
                              <input
                                type="checkbox"
                                checked={useSavedBankForPayout}
                                onChange={(event) => setUseSavedBankForPayout(event.target.checked)}
                                disabled={!sellerSavedBankAccount || !canRequestEmergencyPayout}
                              />
                              <span>Use saved bank account {sellerSavedBankAccount?.bank_account_masked ? `(${sellerSavedBankAccount.bank_account_masked})` : ''}</span>
                            </label>
                          </div>
                          <div className="form-group">
                            <label>Account Holder Name</label>
                            <input type="text" value={sellerPayoutForm.account_holder_name} onChange={(event) => setSellerPayoutForm((prev) => ({ ...prev, account_holder_name: event.target.value }))} disabled={useSavedBankForPayout || !canRequestEmergencyPayout} />
                          </div>
                          <div className="form-group">
                            <label>Bank Account Number</label>
                            <input type="text" value={sellerPayoutForm.bank_account_number} onChange={(event) => setSellerPayoutForm((prev) => ({ ...prev, bank_account_number: event.target.value }))} disabled={useSavedBankForPayout || !canRequestEmergencyPayout} />
                          </div>
                          <div className="form-group">
                            <label>IFSC Code</label>
                            <input type="text" value={sellerPayoutForm.ifsc_code} onChange={(event) => setSellerPayoutForm((prev) => ({ ...prev, ifsc_code: event.target.value.toUpperCase() }))} disabled={useSavedBankForPayout || !canRequestEmergencyPayout} />
                          </div>
                          <div className="form-group">
                            <label>Bank Name (optional)</label>
                            <input type="text" value={sellerPayoutForm.bank_name} onChange={(event) => setSellerPayoutForm((prev) => ({ ...prev, bank_name: event.target.value }))} disabled={useSavedBankForPayout || !canRequestEmergencyPayout} />
                          </div>
                          <button type="submit" className="seller-button primary" disabled={isRequestingEmergencyPayout || !canRequestEmergencyPayout}>
                            {isRequestingEmergencyPayout ? 'Requesting...' : canRequestEmergencyPayout ? 'Request Emergency Payout' : 'Payout Under Review'}
                          </button>
                        </form>
                        {payoutRequests.length > 0 && (
                          <div className="wallet-ledger">
                            <h3>Emergency Payout History</h3>
                            <div className="ledger-list">
                              {payoutRequests.map((request) => (
                                <article key={request.id || Math.random()} className="account-tile">
                                  <strong>{formatCurrency(request.amount)} requested</strong>
                                  <p>Status: {request.status || '-'}</p>
                                  <p>Fee: {formatCurrency(request.settlement_fee)} | Total Debit: {formatCurrency(request.total_debit)}</p>
                                  <p>Requested: {formatDateTime(request.requested_at)}</p>
                                  {request?.bank_details?.bank_account_masked && (
                                    <p>Bank: {request.bank_details.bank_name || 'Saved bank'} ({request.bank_details.bank_account_masked})</p>
                                  )}
                                  {request.review_reason && <p>Admin Note: {request.review_reason}</p>}
                                  {request.failure_reason && <p>Failure: {request.failure_reason}</p>}
                                  {request.provider_payout_status && <p>Provider Status: {request.provider_payout_status}</p>}
                                  {request.transfer_reference && <p>Transfer Ref: {request.transfer_reference}</p>}
                                  {request.transfer_processed_at && <p>Transferred: {formatDateTime(request.transfer_processed_at)}</p>}
                                  {request.hold_released_at && <p>Hold Released: {formatDateTime(request.hold_released_at)}</p>}
                                </article>
                              ))}
                            </div>
                          </div>
                        )}
                        {sellerWallet.ledger && (
                          <div className="wallet-ledger">
                            <h3>Recent Transactions</h3>
                            <div className="ledger-list">
                              {sellerWallet.ledger.slice(0, 10).map((txn, idx) => (
                                <div key={idx} className="ledger-row">
                                  <span className="txn-description">{txn.reason_code || txn.entry_type || '-'}</span>
                                  <span className={`txn-amount ${Number(txn.credit || 0) > 0 ? 'positive' : 'negative'}`}>
                                    {Number(txn.credit || 0) > 0 ? '+' : '-'} {formatCurrency(Math.abs(Number(txn.credit || 0) - Number(txn.debit || 0)))}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              }
              case 'account':
                return (
                  <div className="seller-section">
                    <h2>Account Settings</h2>
                    {sellerDashboardProfile && (
                      <>
                        <div className="seller-info-card">
                          <h3>Account Overview</h3>
                          <div className="info-row">
                            <span className="label">Seller ID</span>
                            <span className="value">{sellerDashboardProfile.seller_id || '-'}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">Legal Name</span>
                            <span className="value">{sellerDashboardProfile.brand?.legal_name || '-'}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">Brand Name</span>
                            <span className="value">{sellerDashboardProfile.brand?.brand_name || '-'}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">Store Slug</span>
                            <span className="value">{sellerDashboardProfile.public?.slug || '-'}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">Seller Status</span>
                            <span className="value">{sellerDashboardProfile.status?.seller_status || '-'}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">Is Frozen</span>
                            <span className="value">{sellerDashboardProfile.status?.is_frozen ? 'Yes' : 'No'}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">PAN Verified</span>
                            <span className="value">{sellerDashboardProfile.verification?.pan_verified ? 'Yes' : 'No'}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">GST Verified</span>
                            <span className="value">{sellerDashboardProfile.verification?.gst_verified ? 'Yes' : 'No'}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">Address Verified</span>
                            <span className="value">{sellerDashboardProfile.verification?.address_verified ? 'Yes' : 'No'}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">Products</span>
                            <span className="value">{sellerProducts.length}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">Offers</span>
                            <span className="value">{sellerOffers.length}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">Serviceable Regions (State/City)</span>
                            <span className="value">{sellerServiceableRegions.length}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">Wallet Available</span>
                            <span className="value">{formatCurrency(sellerWallet?.balances?.available)}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">Settlement Policy</span>
                            <span className="value">{sellerWallet?.settlement_promise?.release_type || '-'}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">Bank Account</span>
                            <span className="value">{sellerSavedBankAccount?.bank_account_masked || 'Not saved'}</span>
                          </div>
                        </div>
                        <form className="account-form" onSubmit={saveSellerProfile}>
                          <h3>Update Store Profile</h3>
                          <div className="form-group">
                            <label>Support Email</label>
                            <input
                              type="email"
                              value={sellerProfileForm.support_email}
                              onChange={(event) => setSellerProfileForm((prev) => ({ ...prev, support_email: event.target.value }))}
                            />
                          </div>
                          <div className="form-group">
                            <label>Tagline</label>
                            <input
                              type="text"
                              value={sellerProfileForm.short_tagline}
                              onChange={(event) => setSellerProfileForm((prev) => ({ ...prev, short_tagline: event.target.value }))}
                            />
                          </div>
                          <div className="form-group">
                            <label>Logo URL</label>
                            <input
                              type="text"
                              value={sellerProfileForm.logo_url}
                              onChange={(event) => setSellerProfileForm((prev) => ({ ...prev, logo_url: event.target.value }))}
                            />
                          </div>
                          <div className="form-group">
                            <label>Upload Brand Logo From Device</label>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(event) => setSellerLogoFile(event.target.files?.[0] || null)}
                            />
                            <button
                              type="button"
                              className="account-inline-btn"
                              onClick={uploadSellerLogo}
                              disabled={isUploadingSellerLogo}
                            >
                              {isUploadingSellerLogo ? 'Uploading...' : 'Upload Logo'}
                            </button>
                          </div>
                          <div className="form-group">
                            <label>Description</label>
                            <textarea
                              rows={3}
                              value={sellerProfileForm.description}
                              onChange={(event) => setSellerProfileForm((prev) => ({ ...prev, description: event.target.value }))}
                            />
                          </div>
                          <button type="submit" className="seller-button primary" disabled={isSavingSellerProfile}>
                            {isSavingSellerProfile ? 'Saving...' : 'Save Profile'}
                          </button>
                        </form>
                        <form className="account-form" onSubmit={saveSellerBankAccount}>
                          <h3>Bank Account Settings</h3>
                          {sellerSavedBankAccount && (
                            <p className="quick-panel-meta">
                              Saved: {sellerSavedBankAccount.account_holder_name || '-'} | {sellerSavedBankAccount.bank_account_masked || '-'} | {sellerSavedBankAccount.ifsc_code || '-'}
                            </p>
                          )}
                          <div className="form-group">
                            <label>Account Holder Name</label>
                            <input
                              type="text"
                              value={sellerBankAccountForm.account_holder_name}
                              onChange={(event) => setSellerBankAccountForm((prev) => ({ ...prev, account_holder_name: event.target.value }))}
                            />
                          </div>
                          <div className="form-group">
                            <label>Bank Account Number</label>
                            <input
                              type="text"
                              value={sellerBankAccountForm.bank_account_number}
                              onChange={(event) => setSellerBankAccountForm((prev) => ({ ...prev, bank_account_number: event.target.value }))}
                            />
                          </div>
                          <div className="form-group">
                            <label>IFSC Code</label>
                            <input
                              type="text"
                              value={sellerBankAccountForm.ifsc_code}
                              onChange={(event) => setSellerBankAccountForm((prev) => ({ ...prev, ifsc_code: event.target.value.toUpperCase() }))}
                            />
                          </div>
                          <div className="form-group">
                            <label>Bank Name (optional)</label>
                            <input
                              type="text"
                              value={sellerBankAccountForm.bank_name}
                              onChange={(event) => setSellerBankAccountForm((prev) => ({ ...prev, bank_name: event.target.value }))}
                            />
                          </div>
                          <button type="submit" className="seller-button primary" disabled={isSavingSellerBankAccount}>
                            {isSavingSellerBankAccount ? 'Saving...' : 'Save Bank Account'}
                          </button>
                        </form>
                        <section className="account-form">
                          <h3>Serviceable Areas</h3>
                          <div className="form-group">
                            <label className="address-default">
                              <input
                                type="checkbox"
                                checked={sellerAllIndia}
                                onChange={(event) => setSellerAllIndia(event.target.checked)}
                              />
                              <span>Deliverable Across All India</span>
                            </label>
                          </div>
                          <button
                            type="button"
                            className="seller-button primary"
                            onClick={enableSellerAllIndiaDelivery}
                            disabled={!sellerAllIndia || isSavingSellerAllIndia}
                          >
                            {isSavingSellerAllIndia ? 'Saving...' : 'Enable All India Delivery'}
                          </button>
                          <p className="quick-panel-meta">
                            Current: {sellerAllIndia ? 'All India' : 'Region-based serviceability'}
                          </p>
                        </section>
                        <section className="account-form">
                          <h3>Serviceable by State/City</h3>
                          <div className="form-group">
                            <label>State</label>
                            <select
                              value={sellerRegionForm.state}
                              onChange={(event) => setSellerRegionForm((prev) => ({ ...prev, state: event.target.value }))}
                              disabled={sellerAllIndia}
                            >
                              <option value="">Select State</option>
                              {indiaStates.map((state) => (
                                <option value={state} key={state}>{state}</option>
                              ))}
                            </select>
                          </div>
                          <div className="form-group">
                            <label>City (optional)</label>
                            <input
                              type="text"
                              value={sellerRegionForm.city}
                              onChange={(event) => setSellerRegionForm((prev) => ({ ...prev, city: event.target.value }))}
                              disabled={sellerAllIndia}
                            />
                          </div>
                          <div className="form-group">
                            <label className="address-default">
                              <input
                                type="checkbox"
                                checked={sellerRegionForm.cod_enabled}
                                onChange={(event) => setSellerRegionForm((prev) => ({ ...prev, cod_enabled: event.target.checked }))}
                                disabled={sellerAllIndia}
                              />
                              <span>COD allowed for this region</span>
                            </label>
                          </div>
                          <div className="product-actions">
                            <button type="button" className="action-btn edit" onClick={addSellerRegion} disabled={sellerAllIndia}>Add Region</button>
                            <button type="button" className="seller-button primary" onClick={saveSellerServiceableRegions} disabled={sellerAllIndia || isSavingSellerRegions}>
                              {isSavingSellerRegions ? 'Saving...' : 'Save Regions'}
                            </button>
                          </div>
                          {sellerServiceableRegions.length === 0 ? (
                            <p className="quick-panel-meta">No state/city rules configured.</p>
                          ) : (
                            <div className="products-list">
                              {sellerServiceableRegions.map((region, idx) => (
                                <div className="product-row" key={`${region.state}-${region.city || 'all'}-${idx}`}>
                                  <div className="product-info">
                                    <strong>{region.state}</strong>
                                    <p className="product-category">{region.city || 'All cities'} | COD: {region.cod_enabled ? 'Yes' : 'No'}</p>
                                  </div>
                                  <div className="product-actions">
                                    <button
                                      type="button"
                                      className="action-btn delete"
                                      onClick={() => removeSellerRegion(region.state, region.city)}
                                      disabled={sellerAllIndia}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </section>
                        <form className="account-form" onSubmit={submitSellerDocuments}>
                          <h3>Submit Verification Documents</h3>
                          <div className="form-group">
                            <label>PAN Card</label>
                            <input
                              type="text"
                              value={sellerDocumentsForm.pan_card}
                              onChange={(event) => setSellerDocumentsForm((prev) => ({ ...prev, pan_card: event.target.value.toUpperCase() }))}
                            />
                          </div>
                          <div className="form-group">
                            <label>GST Certificate</label>
                            <input
                              type="text"
                              value={sellerDocumentsForm.gst_certificate}
                              onChange={(event) => setSellerDocumentsForm((prev) => ({ ...prev, gst_certificate: event.target.value.toUpperCase() }))}
                            />
                          </div>
                          <div className="form-group">
                            <label>Address Proof</label>
                            <input
                              type="text"
                              value={sellerDocumentsForm.address_proof}
                              onChange={(event) => setSellerDocumentsForm((prev) => ({ ...prev, address_proof: event.target.value }))}
                            />
                          </div>
                          <button type="submit" className="seller-button primary" disabled={isSubmittingSellerDocuments}>
                            {isSubmittingSellerDocuments ? 'Submitting...' : 'Submit Documents'}
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                )
              default:
                return null
            }
          })()}
        </section>
      </main>
    );
  }

  return null
}

export default App
