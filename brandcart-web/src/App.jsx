import { useEffect, useState } from 'react'
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

const readCartCount = () => {
  const keys = ['brandcartCart', 'cartItems', 'cart']

  for (const key of keys) {
    const raw = localStorage.getItem(key)
    if (!raw) {
      continue
    }

    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.length
      }
      if (typeof parsed?.count === 'number') {
        return parsed.count
      }
      if (Array.isArray(parsed?.items)) {
        return parsed.items.length
      }
    } catch {
      continue
    }
  }

  return 0
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

  const [cartCount, setCartCount] = useState(readCartCount)
  const [cartNotice, setCartNotice] = useState('')

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
          setSearchSuggestions(Array.isArray(data) ? data : [])
        }
      } catch {
        if (!cancelled) {
          setSearchSuggestions([])
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
  }, [searchText])

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
    loadProducts(searchText)
    setShowSuggestions(false)
  }

  const handleSuggestionSelect = (title) => {
    setSearchText(title)
    setShowSuggestions(false)
    loadProducts(title)
  }

  const handleCategorySelect = (query) => {
    setSearchText(query)
    setShowSuggestions(false)
    loadProducts(query)
    if (activeProductId) {
      closeProduct()
    }
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

    const raw = localStorage.getItem('brandcartCart')
    const cart = (() => {
      try {
        const parsed = JSON.parse(raw || '[]')
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    })()

    const existing = cart.find((item) => item.id === productDetail.id)
    if (existing) {
      existing.qty = (existing.qty || 1) + 1
    } else {
      cart.push({
        id: productDetail.id,
        title: productDetail.title,
        image: selectedImage || detailImages[0] || null,
        price: productDetail.selling_price,
        qty: 1,
      })
    }

    localStorage.setItem('brandcartCart', JSON.stringify(cart))
    setCartCount(readCartCount())
    setCartNotice('Added to cart')
    setTimeout(() => setCartNotice(''), 1800)
  }

  const detailImages = Array.isArray(productDetail?.images) ? productDetail.images : []
  const detailPrice = formatInr(productDetail?.selling_price)
  const detailMrp = formatInr(productDetail?.mrp)
  const detailHasStrike = Number.isFinite(Number(productDetail?.mrp))
    && Number.isFinite(Number(productDetail?.selling_price))
    && Number(productDetail.mrp) > Number(productDetail.selling_price)
  const isPdp = Boolean(activeProductId)

  return (
    <main className="page-shell">
      {!isPdp && (
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
              <button type="submit">Search</button>
              {showSuggestions && (searchSuggestions.length > 0 || isLoadingSuggestions) && (
                <div className="search-suggestions" role="listbox">
                  {isLoadingSuggestions && <p className="suggestion-meta">Loading...</p>}
                  {!isLoadingSuggestions && searchSuggestions.map((item) => (
                    <button
                      key={item.id || item.title}
                      type="button"
                      className="suggestion-item"
                      onMouseDown={() => handleSuggestionSelect(item.title || '')}
                    >
                      <span>{item.title}</span>
                      {Number.isFinite(Number(item.selling_price)) && <em>{formatInr(item.selling_price)}</em>}
                    </button>
                  ))}
                </div>
              )}
            </form>

            <div className="header-actions">
              <button type="button" className="ghost-btn">Login</button>
              <button type="button" className="cart-btn">
                Cart
                {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
              </button>
            </div>
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

      {isPdp && (
        <header className="pdp-search-header">
          <form className="search-bar" onSubmit={handleSearchSubmit}>
            <input
              type="text"
              placeholder="Search for products, brands and more"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 140)}
            />
            <button type="submit">Search</button>
            {showSuggestions && (searchSuggestions.length > 0 || isLoadingSuggestions) && (
              <div className="search-suggestions" role="listbox">
                {isLoadingSuggestions && <p className="suggestion-meta">Loading...</p>}
                {!isLoadingSuggestions && searchSuggestions.map((item) => (
                  <button
                    key={item.id || item.title}
                    type="button"
                    className="suggestion-item"
                    onMouseDown={() => handleSuggestionSelect(item.title || '')}
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

      {!activeProductId && (
        <section className="home-products" aria-labelledby="home-products-title">
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

      {activeProductId && (
        <section className="pdp-shell" aria-labelledby="pdp-title">
          <button type="button" className="pdp-back" onClick={closeProduct}>Back to Products</button>

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
                  <h1 id="pdp-title">{productDetail.title}</h1>

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
    </main>
  )
}

export default App
