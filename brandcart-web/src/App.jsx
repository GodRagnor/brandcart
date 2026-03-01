import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { apiGet, apiPost } from './lib/api'
import { createRateLimiter, createTokenValidator, validateEmail, validatePhone } from './lib/security'
import { validateQuantity, validatePrice, sanitizeText } from './lib/validators'

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
const ACCOUNT_PROFILE_KEY = 'brandcartAccountProfile'
const ACCOUNT_CARDS_KEY = 'brandcartSavedCards'
const ACCOUNT_DEVICES_KEY = 'brandcartDeviceSessions'
const ACCOUNT_NOTIFICATIONS_KEY = 'brandcartNotificationPrefs'
const ACCOUNT_PRIVACY_KEY = 'brandcartPrivacyPrefs'
const ACCOUNT_QA_KEY = 'brandcartQaItems'
const ACCOUNT_REVIEWS_KEY = 'brandcartReviewDrafts'
const paymentOptions = [
  { id: 'RAZORPAY', title: 'UPI / Card / Wallet / NetBanking', subtitle: 'Secure online payment via Razorpay' },
  { id: 'COD', title: 'Cash on Delivery', subtitle: 'Pay when product is delivered' },
]

const readAuthToken = () => localStorage.getItem(AUTH_TOKEN_KEY) || ''
const readAuthPhone = () => localStorage.getItem(AUTH_PHONE_KEY) || ''
const readAuthRole = () => localStorage.getItem(AUTH_ROLE_KEY) || 'buyer'
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

  const [activeProductId, setActiveProductId] = useState('')
  const [activeProductSummary, setActiveProductSummary] = useState(null)
  const [productDetail, setProductDetail] = useState(null)
  const [selectedImage, setSelectedImage] = useState('')
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
  const [userPhone, setUserPhone] = useState(readAuthPhone)
  const [userRole, setUserRole] = useState(readAuthRole)
  const [authPhoneInput, setAuthPhoneInput] = useState('')
  const [authOtpInput, setAuthOtpInput] = useState('')
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [isOtpSent, setIsOtpSent] = useState(false)
  const [checkoutPending, setCheckoutPending] = useState(false)
  const [addresses, setAddresses] = useState([])
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false)
  const [isSavingAddress, setIsSavingAddress] = useState(false)
  const [selectedCheckoutAddress, setSelectedCheckoutAddress] = useState(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('RAZORPAY')
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [deliveryPincode, setDeliveryPincode] = useState('')
  const [isCheckingDelivery, setIsCheckingDelivery] = useState(false)
  const [deliveryCheck, setDeliveryCheck] = useState({
    checked: false,
    deliverable: null,
    codAvailable: null,
    reason: '',
    estimatedDays: null,
  })
  const [accountView, setAccountView] = useState('menu')
  const [profileForm, setProfileForm] = useState(() => readStoredJson(ACCOUNT_PROFILE_KEY, {
    fullName: '',
    email: '',
    gender: 'Prefer not to say',
  }))
  const [savedCards, setSavedCards] = useState([]) // Security: Cards should never be stored client-side
  const [cardForm, setCardForm] = useState({
    holder: '',
    number: '',
    expiry: '',
  })
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
  const [adminPayoutRequests, setAdminPayoutRequests] = useState([])
  const [adminPayoutStatusFilter, setAdminPayoutStatusFilter] = useState('')
  const [isLoadingAdminPayoutRequests, setIsLoadingAdminPayoutRequests] = useState(false)
  const [adminPayoutDecisionReasons, setAdminPayoutDecisionReasons] = useState({})
  const [adminUpdatingPayoutId, setAdminUpdatingPayoutId] = useState('')
  const [adminFreezeReasons, setAdminFreezeReasons] = useState({})
  const [adminUpdatingSellerActionId, setAdminUpdatingSellerActionId] = useState('')
  const [adminRiskSnapshots, setAdminRiskSnapshots] = useState({})
  const [adminLoadingRiskSellerId, setAdminLoadingRiskSellerId] = useState('')
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

    try {
      const path = search.trim()
        ? `/api/products?search=${encodeURIComponent(search.trim())}`
        : '/api/products/trending?limit=24'

      const data = await apiGet(path)
      const list = Array.isArray(data) ? data : []
      const withReviews = await attachReviewStats(list)
      setProducts(withReviews)
    } catch (error) {
      setProducts([])
      setProductsError(error instanceof Error ? error.message : 'Failed to load products')
    } finally {
      setIsLoadingProducts(false)
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  useEffect(() => {
    localStorage.setItem('brandcartCart', JSON.stringify(Array.isArray(cartItems) ? cartItems : []))
  }, [cartItems])

  useEffect(() => {
    localStorage.setItem('brandcartWishlist', JSON.stringify(Array.isArray(wishlistIds) ? wishlistIds : []))
  }, [wishlistIds])

  useEffect(() => {
    if (authToken) {
      localStorage.setItem(AUTH_TOKEN_KEY, authToken)
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY)
    }
  }, [authToken])

  useEffect(() => {
    if (userPhone) {
      localStorage.setItem(AUTH_PHONE_KEY, userPhone)
    } else {
      localStorage.removeItem(AUTH_PHONE_KEY)
    }
  }, [userPhone])

  useEffect(() => {
    if (userRole) {
      localStorage.setItem(AUTH_ROLE_KEY, userRole)
    } else {
      localStorage.removeItem(AUTH_ROLE_KEY)
    }
  }, [userRole])

  useEffect(() => {
    if (!authToken) {
      setUserPhone('')
      setUserRole('buyer')
      setAddresses([])
      setAdminSellerRequests([])
      setAdminActiveSellers([])
      setAdminSellerRanking([])
      setAdminRiskDashboard(null)
      setAdminFinanceSummary(null)
      setAdminOrderSummary(null)
      setAdminPayoutRequests([])
      setAdminRiskSnapshots({})
      setSellerOnboarding({
        status: 'none',
        requestedAt: '',
        rejectedAt: '',
        rejectedReason: '',
        request: null,
      })
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
          setAuthToken('')
          setUserPhone('')
          setUserRole('buyer')
          setAddresses([])
          setAdminSellerRequests([])
          setAdminActiveSellers([])
          setAdminSellerRanking([])
          setAdminRiskDashboard(null)
          setAdminFinanceSummary(null)
          setAdminOrderSummary(null)
          setAdminPayoutRequests([])
          setAdminRiskSnapshots({})
        }
      }
    }

    loadMe()
    return () => {
      cancelled = true
    }
  }, [authToken])

  useEffect(() => {
    if (!authToken || accountView !== 'sell') {
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
        setUserRole(response?.role || 'buyer')
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
  }, [authToken, accountView])

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
          setSearchSuggestions(remote.length > 0 ? remote : buildLocalSuggestions(trimmed))
        }
      } catch {
        if (!cancelled) {
          setSearchSuggestions(buildLocalSuggestions(trimmed))
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
      })
      return
    }

    const loadProductDetail = async () => {
      setIsLoadingDetail(true)
      setDetailError('')

      try {
        const detail = await apiGet(`/api/products/${activeProductId}`)
        setProductDetail(detail)
        if (Array.isArray(detail?.images) && detail.images.length > 0) {
          setSelectedImage(detail.images[0])
        } else {
          setSelectedImage('')
        }
      } catch (error) {
        setProductDetail(null)
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
  }, [activeProductId, activeProductSummary])

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
      setActiveQuickPanel('auth')
      flashNotice('Login required')
      return
    }
    setSelectedCheckoutAddress(null)
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
      const nextToken = response?.access_token || ''
      if (!nextToken) {
        throw new Error('Missing token')
      }
      setUserRole(response?.role || 'buyer')
      setAuthToken(nextToken)
      setUserPhone(phoneValidation)
      recordDeviceSession(phoneValidation)
      setIsOtpSent(false)
      setAuthOtpInput('')
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

  const logout = () => {
    setAuthToken('')
    setUserPhone('')
    setUserRole('buyer')
    setIsOtpSent(false)
    setAuthOtpInput('')
    setCheckoutPending(false)
    setAddresses([])
    setAdminSellerRequests([])
    setAdminActiveSellers([])
    setAdminSellerRanking([])
    setAdminRiskDashboard(null)
    setAdminFinanceSummary(null)
    setAdminOrderSummary(null)
    setAdminPayoutRequests([])
    setAdminRiskSnapshots({})
    setAdminRejectReasons({})
    flashNotice('Logged out')
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

  const loadRazorpayCheckout = () => new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => resolve(true)
    script.onerror = () => reject(new Error('Failed to load Razorpay SDK'))
    document.body.appendChild(script)
  })

  const buildCreateOrderPath = ({ productId, quantity, paymentMethod, addressId, idempotencyKey }) => {
    const params = new URLSearchParams({
      product_id: String(productId),
      quantity: String(quantity),
      payment_method: paymentMethod,
      idempotency_key: idempotencyKey,
    })
    if (addressId) {
      params.set('address_id', String(addressId))
    }
    return `/api/orders/create?${params.toString()}`
  }

  const placeCodOrders = async () => {
    const addressId = selectedCheckoutAddress?._id
    if (!addressId) {
      throw new Error('Address is missing')
    }

    const results = []
    for (const item of cartItems) {
      const response = await apiPost(
        buildCreateOrderPath({
          productId: item.id,
          quantity: Number(item.qty || 1),
          paymentMethod: 'COD',
          addressId,
          idempotencyKey: createIdempotencyKey('cod'),
        }),
        undefined,
        { token: authToken },
      )
      results.push(response)
    }
    return results
  }

  const placeRazorpayOrder = async () => {
    if (cartItems.length !== 1) {
      throw new Error('Online payment is supported for one item at a time. Use Buy Now for Razorpay or use COD for full cart.')
    }

    const item = cartItems[0]
    const addressId = selectedCheckoutAddress?._id
    if (!addressId) {
      throw new Error('Address is missing')
    }

    const created = await apiPost(
      buildCreateOrderPath({
        productId: item.id,
        quantity: Number(item.qty || 1),
        paymentMethod: 'RAZORPAY',
        addressId,
        idempotencyKey: createIdempotencyKey('rzp-create'),
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
    if (!cartItems.length) {
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

      const itemCount = cartItems.reduce((sum, item) => sum + Number(item.qty || 1), 0)
      const selected = paymentOptions.find((item) => item.id === selectedPaymentMethod)
      const methodLabel = selected?.title || selectedPaymentMethod
      const city = selectedCheckoutAddress?.city

      setCartItems([])
      setCheckoutPending(false)
      setSelectedCheckoutAddress(null)
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

    const fallbackImage = Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : null

    setCartItems((prev) => {
      const next = Array.isArray(prev) ? [...prev] : []
      const existing = next.find((item) => item.id === product.id)
      if (existing) {
        existing.qty = (existing.qty || 1) + 1
      } else {
        next.push({
          id: product.id,
          title: product.title,
          image: preferredImage || fallbackImage || null,
          price: product.selling_price,
          qty: 1,
        })
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
    if (deliveryCheck.checked && deliveryCheck.deliverable === false) {
      flashNotice('Not deliverable to this pincode')
      return
    }
    addProductToCart(productDetail, selectedImage || detailImages[0] || null)
  }

  const removeFromWishlist = (id) => {
    setWishlistIds((prev) => prev.filter((itemId) => itemId !== id))
    flashNotice('Removed from wishlist')
  }

  const openWishlistPanel = () => {
    setActiveQuickPanel((prev) => (prev === 'wishlist' ? '' : 'wishlist'))
  }

  const openCartPanel = () => {
    setActiveQuickPanel((prev) => (prev === 'cart' ? '' : 'cart'))
  }

  const openAccountPanel = () => {
    if (!isLoggedIn) {
      setCheckoutPending(false)
      setActiveQuickPanel((prev) => (prev === 'auth' ? '' : 'auth'))
      return
    }
    setAccountView('menu')
    setActiveQuickPanel((prev) => (prev === 'account' ? '' : 'account'))
  }

  const closeQuickPanel = () => {
    setAccountView('menu')
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

  const addSavedCard = (event) => {
    event.preventDefault()
    const digits = cardForm.number.replace(/\D/g, '')
    if (digits.length < 12 || !cardForm.holder.trim() || !cardForm.expiry.trim()) {
      flashNotice('Enter valid card details')
      return
    }
    setSavedCards((prev) => ([
      {
        id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `card-${Date.now()}`,
        holder: cardForm.holder.trim(),
        last4: digits.slice(-4),
        expiry: cardForm.expiry.trim(),
      },
      ...prev,
    ]))
    setCardForm({ holder: '', number: '', expiry: '' })
    flashNotice('Card saved')
  }

  const removeSavedCard = (id) => {
    setSavedCards((prev) => prev.filter((item) => item.id !== id))
    flashNotice('Card removed')
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
    const payload = {
      legal_name: sellerRequestForm.legal_name.trim(),
      brand_name: sellerRequestForm.brand_name.trim(),
      category: sellerRequestForm.category.trim(),
      description: sellerRequestForm.description.trim(),
      email: sellerRequestForm.email.trim() || undefined,
      logo_url: sellerRequestForm.logo_url.trim() || undefined,
      documents: {
        pan_card: sellerRequestForm.pan_card.trim().toUpperCase(),
        gst_certificate: sellerRequestForm.gst_certificate.trim().toUpperCase(),
        address_proof: sellerRequestForm.address_proof.trim(),
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
      loadAdminPayoutRequests(),
    ])
  }

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

  const decidePayoutRequest = async (requestId, action) => {
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
      await apiPost(`/api/admin/payout-requests/${requestId}/decision`, { action, reason: reason || undefined }, { token: authToken })
      setAdminPayoutDecisionReasons((prev) => ({ ...prev, [requestId]: '' }))
      flashNotice(action === 'approve' ? 'Payout approved' : 'Payout rejected')
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
      await apiPost(`/api/admin/payout-requests/${requestId}/retry`, {}, { token: authToken })
      flashNotice('Payout retried')
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
      await apiPost(`/api/admin/payout-requests/${requestId}/reconcile`, {}, { token: authToken })
      flashNotice('Payout reconciled')
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
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Could not create festival')
    } finally {
      setIsCreatingFestival(false)
    }
  }

  useEffect(() => {
    if (authToken && userRole === 'admin') {
      loadAdminSnapshot()
    }
  }, [authToken, userRole])

  useEffect(() => {
    if (authToken && userRole === 'admin') {
      loadAdminPayoutRequests(adminPayoutStatusFilter)
    }
  }, [adminPayoutStatusFilter])

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
    if (action === 'reviews') {
      setAccountView('reviews')
      return
    }
    if (action === 'qa') {
      setAccountView('qa')
      return
    }
    if (action === 'sell') {
      setAccountView('sell')
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
        .map((item) => (item.id === id ? { ...item, qty: Math.max(0, (item.qty || 1) + change) } : item))
        .filter((item) => (item.qty || 0) > 0)
      return next
    })
  }

  const removeCartItem = (id) => {
    setCartItems((prev) => prev.filter((item) => item.id !== id))
    flashNotice('Removed from cart')
  }

  const checkoutCart = () => {
    if (!cartItems.length) {
      flashNotice('Cart is empty')
      return
    }
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
    if (deliveryCheck.checked && deliveryCheck.deliverable === false) {
      flashNotice('Not deliverable to this pincode')
      return
    }

    const image = selectedImage || detailImages[0] || (Array.isArray(productDetail.images) ? productDetail.images[0] : null)
    setCartItems([{
      id: productDetail.id,
      title: productDetail.title,
      image: image || null,
      price: productDetail.selling_price,
      qty: 1,
    }])

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
      })
      if (!response?.deliverable) {
        flashNotice('Delivery unavailable for this pincode')
      }
    } catch (error) {
      setDeliveryCheck({
        checked: true,
        deliverable: false,
        codAvailable: false,
        reason: error instanceof Error ? error.message : 'Could not check delivery',
        estimatedDays: null,
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
  const detailPrice = formatInr(productDetail?.selling_price)
  const detailMrp = formatInr(productDetail?.mrp)
  const detailHasStrike = Number.isFinite(Number(productDetail?.mrp))
    && Number.isFinite(Number(productDetail?.selling_price))
    && Number(productDetail.mrp) > Number(productDetail.selling_price)
  const isPdp = Boolean(activeProductId)
  const isWishlisted = Boolean(activeProductId && wishlistIds.includes(activeProductId))
  const prevIsPdpRef = useRef(isPdp)
  const [viewTransition, setViewTransition] = useState('')
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
  const accountViewTitle = ({
    menu: 'Account Settings',
    devices: 'Manage Devices',
    profile: 'Edit Profile',
    cards: 'Saved Cards',
    language: 'Select Language',
    notifications: 'Notification Settings',
    privacy: 'Privacy Center',
    reviews: 'Reviews',
    qa: 'Questions & Answers',
    sell: 'Sell on Brandcart',
    terms: 'Terms & Policies',
    faqs: 'FAQs',
  })[accountView] || 'Account Settings'

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

  if (isLoggedIn && userRole === 'admin') {
    return (
      <main className="admin-shell">
        <header className="admin-header">
          <div>
            <p className="admin-kicker">Brandcart Operations</p>
            <h1>Admin Dashboard</h1>
            <p className="admin-meta">Logged in as {userPhone || 'admin'}</p>
          </div>
          <div className="admin-header-actions">
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
              <strong>Total Orders</strong>
              <p>{isLoadingAdminOrderSummary ? '...' : Number(adminOrderSummary?.total_orders || 0)}</p>
            </article>
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
              const canDecide = status === 'requested'
              const canRetry = status === 'failed'
              const canReconcile = Boolean(request?.provider_payout_id)
              return (
                <article className="account-tile" key={requestId || `payout-${Math.random()}`}>
                  <strong>Request {requestId || '-'}</strong>
                  <p>Status: {status}</p>
                  <p>Seller: {request?.seller_id || '-'}</p>
                  <p>Amount: {formatInr(request?.amount) || `₹${Number(request?.amount || 0)}`}</p>
                  <p>Requested: {request?.requested_at ? new Date(request.requested_at).toLocaleString() : '-'}</p>
                  <p>Bank: {request?.bank_details?.bank_name || '-'} ({request?.bank_details?.bank_account_masked || '-'})</p>
                  {status === 'failed' && <p>Failure: {request?.failure_reason || '-'}</p>}
                  {canDecide && (
                    <textarea
                      rows={2}
                      placeholder="Reason (required for reject)"
                      value={adminPayoutDecisionReasons[requestId] || ''}
                      onChange={(event) => setAdminPayoutDecisionReasons((prev) => ({ ...prev, [requestId]: event.target.value }))}
                    />
                  )}
                  <div className="admin-request-actions">
                    {canDecide && (
                      <>
                        <button
                          type="button"
                          className="account-inline-btn"
                          disabled={adminUpdatingPayoutId === requestId}
                          onClick={() => decidePayoutRequest(requestId, 'approve')}
                        >
                          {adminUpdatingPayoutId === requestId ? 'Updating...' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          className="account-inline-btn"
                          disabled={adminUpdatingPayoutId === requestId}
                          onClick={() => decidePayoutRequest(requestId, 'reject')}
                        >
                          {adminUpdatingPayoutId === requestId ? 'Updating...' : 'Reject'}
                        </button>
                      </>
                    )}
                    {canRetry && (
                      <button
                        type="button"
                        className="account-inline-btn"
                        disabled={adminUpdatingPayoutId === requestId}
                        onClick={() => retryPayoutRequest(requestId)}
                      >
                        {adminUpdatingPayoutId === requestId ? 'Updating...' : 'Retry'}
                      </button>
                    )}
                    {canReconcile && (
                      <button
                        type="button"
                        className="account-inline-btn"
                        disabled={adminUpdatingPayoutId === requestId}
                        onClick={() => reconcilePayoutRequest(requestId)}
                      >
                        {adminUpdatingPayoutId === requestId ? 'Updating...' : 'Reconcile'}
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
        <section className={`home-products ${viewTransition === 'to-home' ? 'is-entering' : ''}`} aria-labelledby="home-products-title">
          <div className="home-products-head">
            <h2 id="home-products-title">Products</h2>
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
                const price = formatInr(product.selling_price)
                const mrp = formatInr(product.mrp)
                const hasDiscount = Number.isFinite(Number(product.mrp))
                  && Number.isFinite(Number(product.selling_price))
                  && Number(product.mrp) > Number(product.selling_price)
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
                        {hasDiscount && <span>{mrp}</span>}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
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
                    {detailHasStrike && <span>{detailMrp}</span>}
                  </div>

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
                      <p className={`pdp-delivery-note ${deliveryCheck.deliverable ? 'ok' : 'no'}`}>
                        {deliveryCheck.deliverable
                          ? `Delivery available${deliveryCheck.estimatedDays ? ` in ${deliveryCheck.estimatedDays} day(s)` : ''}. ${deliveryCheck.codAvailable ? 'COD available.' : 'COD not available.'}`
                          : `${deliveryCheck.reason || 'Delivery unavailable'} for this pincode.`}
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
                      const price = formatInr(item.selling_price)
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
                            {image ? <img src={image} alt={item.title} loading="lazy" /> : <span>No image</span>}
                          </div>
                          <h3>{item.title}</h3>
                          {hasReviews ? (
                            <p className="similar-reviews">{Number(item.review_average).toFixed(1)} &#9733; ({item.review_count})</p>
                          ) : (
                            <p className="similar-reviews">No reviews yet</p>
                          )}
                          <strong>{price || '-'}</strong>
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

        <button type="button" className={`bottom-nav-item ${activeQuickPanel === 'wishlist' ? 'is-active' : ''}`} onClick={openWishlistPanel}>
          <FooterNavIcon icon="wishlist" />
          <span>Wishlist</span>
          {wishlistIds.length > 0 && <span className="bottom-nav-badge">{wishlistIds.length}</span>}
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
              {!isLoadingWishlistItems && wishlistItems.map((item) => (
                <article className="quick-panel-item" key={item.id}>
                  <button type="button" className="quick-panel-thumb" onClick={() => { openProduct(item); closeQuickPanel() }}>
                    {Array.isArray(item.images) && item.images[0] ? <img src={item.images[0]} alt={item.title} /> : <span>No image</span>}
                  </button>
                  <div className="quick-panel-copy">
                    <strong>{item.title}</strong>
                    <p>{formatInr(item.selling_price) || '-'}</p>
                    <div className="quick-panel-row">
                      <button type="button" onClick={() => addProductToCart(item)}>Add to Cart</button>
                      <button type="button" onClick={() => removeFromWishlist(item.id)}>Remove</button>
                    </div>
                  </div>
                </article>
              ))}
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
                <article className="quick-panel-item" key={item.id}>
                  <button type="button" className="quick-panel-thumb" onClick={() => { openProduct(item); closeQuickPanel() }}>
                    {item.image ? <img src={item.image} alt={item.title} /> : <span>No image</span>}
                  </button>
                  <div className="quick-panel-copy">
                    <strong>{item.title}</strong>
                    <p>{formatInr(item.price) || '-'}</p>
                    <div className="quick-panel-row">
                      <button type="button" onClick={() => updateCartQty(item.id, -1)}>-</button>
                      <span>{item.qty || 1}</span>
                      <button type="button" onClick={() => updateCartQty(item.id, 1)}>+</button>
                      <button type="button" onClick={() => removeCartItem(item.id)}>Remove</button>
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
              <h3>Add Address</h3>
              <button type="button" onClick={closeQuickPanel}>Back</button>
            </div>
            <div className="quick-panel-body">
              <p className="quick-panel-meta">Select a delivery address or add a new one.</p>

              {isLoadingAddresses && <p className="quick-panel-meta">Loading addresses...</p>}
              {!isLoadingAddresses && addresses.length === 0 && <p className="quick-panel-meta">No saved addresses yet.</p>}
              {!isLoadingAddresses && addresses.map((address) => (
                <article className="address-card" key={address._id}>
                  <div>
                    <strong>{address.name}</strong>
                    <p>{address.line1}, {address.city}, {address.state} - {address.pincode}</p>
                    <p>{address.phone}</p>
                  </div>
                  <button type="button" onClick={() => proceedToPayment(address)}>Deliver Here</button>
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
              <h3>{accountViewTitle}</h3>
              <button type="button" onClick={() => (accountView === 'menu' ? closeQuickPanel() : setAccountView('menu'))}>Back</button>
            </div>
            <div className="quick-panel-body account-body">
              {accountView === 'menu' && (
                <>
                  <section className="account-section">
                    <div className="account-list">
                      <button type="button" className="account-row" onClick={openAddressPanel}>
                        <span className="account-row-icon"><AccountMenuIcon type="address" /></span>
                        <span>Manage Checkout Addresses</span>
                        <em>&#8250;</em>
                      </button>
                      <button type="button" className="account-row" onClick={logout}>
                        <span className="account-row-icon"><AccountMenuIcon type="profile" /></span>
                        <span>Logout ({userPhone || 'buyer'})</span>
                        <em>&#8250;</em>
                      </button>
                    </div>
                  </section>

                  <section className="account-section">
                    <div className="account-list">
                      {[
                        ['device', 'Manage Devices', 'manage_devices'],
                        ['profile', 'Edit Profile', 'edit_profile'],
                        ['cards', 'Saved Credit / Debit & Gift Cards', 'saved_cards'],
                        ['address', 'Saved Addresses', 'saved_addresses'],
                        ['language', `Select Language (${accountLanguage})`, 'language'],
                        ['notification', `Notification Settings (${notificationsEnabled ? 'On' : 'Off'})`, 'notifications'],
                        ['privacy', 'Privacy Center', 'privacy'],
                      ].map(([type, label, action]) => (
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
                        ['reviews', 'Reviews', 'reviews'],
                        ['qa', 'Questions & Answers', 'qa'],
                      ].map(([type, label, action]) => (
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
                      <button type="button" className="account-row" onClick={() => handleAccountAction('sell')}>
                        <span className="account-row-icon"><AccountMenuIcon type="seller" /></span>
                        <span>Sell on Brandcart</span>
                        <em>&#8250;</em>
                      </button>
                    </div>
                  </section>

                  <section className="account-section">
                    <h4>Feedback & Information</h4>
                    <div className="account-list">
                      {[
                        ['docs', 'Terms, Policies and Licenses', 'terms'],
                        ['info', 'Browse FAQs', 'faqs'],
                      ].map(([type, label, action]) => (
                        <button type="button" className="account-row" key={label} onClick={() => handleAccountAction(action)}>
                          <span className="account-row-icon"><AccountMenuIcon type={type} /></span>
                          <span>{label}</span>
                          <em>&#8250;</em>
                        </button>
                      ))}
                    </div>
                  </section>
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
                    <form className="account-form" onSubmit={addSavedCard}>
                      <label>Card Holder Name</label>
                      <input type="text" value={cardForm.holder} onChange={(event) => setCardForm((prev) => ({ ...prev, holder: event.target.value }))} />
                      <label>Card Number</label>
                      <input type="text" inputMode="numeric" value={cardForm.number} onChange={(event) => setCardForm((prev) => ({ ...prev, number: event.target.value.replace(/\D/g, '').slice(0, 16) }))} />
                      <label>Expiry (MM/YY)</label>
                      <input type="text" value={cardForm.expiry} onChange={(event) => setCardForm((prev) => ({ ...prev, expiry: event.target.value.slice(0, 5) }))} />
                      <button type="submit" className="account-primary-btn">Save Card</button>
                    </form>
                    {savedCards.length === 0 && <p className="quick-panel-meta">No saved cards.</p>}
                    {savedCards.map((item) => (
                      <article className="account-tile" key={item.id}>
                        <strong>XXXX XXXX XXXX {item.last4}</strong>
                        <p>{item.holder} | Exp: {item.expiry}</p>
                        <button type="button" className="account-inline-btn" onClick={() => removeSavedCard(item.id)}>Remove</button>
                      </article>
                    ))}
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
          </>
        )}
      </section>
      )}
    </main>
  )
}

export default App
