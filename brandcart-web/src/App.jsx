import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { apiGet } from './lib/api'

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

    const loadReviews = async () => {
      setIsLoadingReviews(true)
      try {
        const response = await apiGet(`/api/reviews/product/${activeProductId}`)
        setProductReviews(summarizeReviews(response))
      } catch {
        setProductReviews({ count: 0, average: null, reviews: [] })
      } finally {
        setIsLoadingReviews(false)
      }
    }

    loadReviews()
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
    setActiveQuickPanel((prev) => (prev === 'account' ? '' : 'account'))
  }

  const closeQuickPanel = () => {
    setActiveQuickPanel('')
  }

  const handleAccountAction = (action) => {
    if (action === 'manage_devices') {
      flashNotice('1 active device connected')
      return
    }
    if (action === 'edit_profile') {
      flashNotice('Profile editor opened')
      return
    }
    if (action === 'saved_cards') {
      flashNotice('2 saved cards available')
      return
    }
    if (action === 'saved_addresses') {
      flashNotice('Saved addresses loaded')
      return
    }
    if (action === 'language') {
      const languages = ['English', 'Hindi', 'Tamil']
      const currentIndex = languages.indexOf(accountLanguage)
      const next = languages[(currentIndex + 1) % languages.length]
      setAccountLanguage(next)
      flashNotice(`Language: ${next}`)
      return
    }
    if (action === 'notifications') {
      setNotificationsEnabled((prev) => {
        const next = !prev
        flashNotice(`Notifications ${next ? 'enabled' : 'disabled'}`)
        return next
      })
      return
    }
    if (action === 'privacy') {
      flashNotice('Privacy controls opened')
      return
    }
    if (action === 'reviews') {
      flashNotice('No new reviews yet')
      return
    }
    if (action === 'qa') {
      flashNotice('No pending questions')
      return
    }
    if (action === 'sell') {
      setActiveQuickPanel('')
      setIsCategoryView(false)
      if (activeProductId) {
        closeProduct()
      }
      setSearchText('deals')
      loadProducts('deals')
      flashNotice('Showing sell and deal options')
      return
    }
    if (action === 'terms') {
      flashNotice('Terms, policies and licenses opened')
      return
    }
    if (action === 'faqs') {
      setActiveQuickPanel('')
      setIsCategoryView(false)
      if (activeProductId) {
        closeProduct()
      }
      setSearchText('help')
      loadProducts('help')
      flashNotice('Showing help and FAQs')
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
    const itemCount = cartItems.reduce((sum, item) => sum + Number(item.qty || 1), 0)
    setCartItems([])
    closeQuickPanel()
    flashNotice(`Checkout complete for ${itemCount} item${itemCount > 1 ? 's' : ''}`)
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
                    <button type="button" className="pdp-buy-btn">BUY NOW</button>
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
                    <h2>Product details</h2>
                    <div className="pdp-specs">
                      <p><span>Category</span> {productDetail.category || 'NA'}</p>
                      <p><span>Sub Category</span> {productDetail.sub_category || 'NA'}</p>
                    </div>
                  </div>

                  {productDetail.description && (
                    <div className="pdp-section">
                      <h2>Description</h2>
                      <p className="pdp-description">{productDetail.description}</p>
                    </div>
                  )}
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

        <button type="button" className={`bottom-nav-item ${activeQuickPanel === 'account' ? 'is-active' : ''}`} onClick={openAccountPanel}>
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

        {activeQuickPanel === 'account' && (
          <>
            <div className="quick-panel-head">
              <h3>Account Settings</h3>
            </div>
            <div className="quick-panel-body account-body">
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
            </div>
          </>
        )}
      </section>
      )}
    </main>
  )
}

export default App
