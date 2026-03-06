import { useState } from 'react'

export default function AccountPanel({ userPhone, logout, onClose }) {
  const [currentView, setCurrentView] = useState('menu')
  const [profileForm, setProfileForm] = useState({
    fullName: localStorage.getItem('accountProfileName') || '',
    email: localStorage.getItem('accountProfileEmail') || '',
    gender: localStorage.getItem('accountProfileGender') || 'Prefer not to say',
  })
  
  const [addresses, setAddresses] = useState(() => {
    const stored = localStorage.getItem('savedAddresses')
    return stored ? JSON.parse(stored) : []
  })
  
  const [newAddress, setNewAddress] = useState({
    name: '',
    phone: '',
    line1: '',
    city: '',
    state: '',
    pincode: '',
    is_default: false,
  })

  const [savedCards, setSavedCards] = useState(() => {
    const stored = localStorage.getItem('savedCards')
    return stored ? JSON.parse(stored) : []
  })

  const [newCard, setNewCard] = useState({
    holder: '',
    number: '',
    expiry: '',
  })

  const goBack = () => {
    if (currentView === 'menu') {
      onClose()
    } else {
      setCurrentView('menu')
    }
  }

  const saveProfile = (e) => {
    e.preventDefault()
    localStorage.setItem('accountProfileName', profileForm.fullName)
    localStorage.setItem('accountProfileEmail', profileForm.email)
    localStorage.setItem('accountProfileGender', profileForm.gender)
    alert('Profile saved!')
    setCurrentView('menu')
  }

  const saveAddress = (e) => {
    e.preventDefault()
    const updated = [...addresses, { ...newAddress, id: Date.now() }]
    setAddresses(updated)
    localStorage.setItem('savedAddresses', JSON.stringify(updated))
    setNewAddress({ name: '', phone: '', line1: '', city: '', state: '', pincode: '', is_default: false })
    alert('Address added!')
    setCurrentView('menu')
  }

  const deleteAddress = (id) => {
    const updated = addresses.filter(a => a.id !== id)
    setAddresses(updated)
    localStorage.setItem('savedAddresses', JSON.stringify(updated))
  }

  const saveCard = (e) => {
    e.preventDefault()
    const last4 = newCard.number.slice(-4)
    const updated = [...savedCards, { ...newCard, id: Date.now(), last4 }]
    setSavedCards(updated)
    localStorage.setItem('savedCards', JSON.stringify(updated))
    setNewCard({ holder: '', number: '', expiry: '' })
    alert('Card saved!')
    setCurrentView('menu')
  }

  const deleteCard = (id) => {
    const updated = savedCards.filter(c => c.id !== id)
    setSavedCards(updated)
    localStorage.setItem('savedCards', JSON.stringify(updated))
  }

  return (
    <div className="account-panel-modal">
      <div className="account-panel-header">
        <h2>{
          currentView === 'menu' ? 'Account Settings' :
          currentView === 'profile' ? 'Edit Profile' :
          currentView === 'addresses' ? 'Manage Addresses' :
          currentView === 'cards' ? 'Saved Cards' :
          'Account'
        }</h2>
        <button className="account-panel-close" onClick={goBack}>← Back</button>
      </div>

      <div className="account-panel-content">
        {/* Main Menu */}
        {currentView === 'menu' && (
          <div className="account-menu">
            <div className="account-menu-section">
              <p className="account-section-title">Account</p>
              <button className="account-menu-item" onClick={() => setCurrentView('profile')}>
                <span>Edit Profile</span>
                <em>›</em>
              </button>
              <button className="account-menu-item" onClick={() => setCurrentView('addresses')}>
                <span>Manage Addresses</span>
                <em>›</em>
              </button>
              <button className="account-menu-item" onClick={() => setCurrentView('cards')}>
                <span>Saved Cards</span>
                <em>›</em>
              </button>
            </div>

            <div className="account-menu-section">
              <p className="account-section-title">Help & Support</p>
              <button className="account-menu-item" onClick={() => alert('FAQs coming soon')}>
                <span>FAQs</span>
                <em>›</em>
              </button>
              <button className="account-menu-item" onClick={() => alert('Contact us at support@brandcart.com')}>
                <span>Contact Us</span>
                <em>›</em>
              </button>
            </div>

            <div className="account-menu-section">
              <button className="account-menu-item logout-btn" onClick={logout}>
                <span>Logout ({userPhone})</span>
              </button>
            </div>
          </div>
        )}

        {/* Edit Profile */}
        {currentView === 'profile' && (
          <form className="account-form" onSubmit={saveProfile}>
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                value={profileForm.fullName}
                onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                placeholder="Enter your full name"
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                placeholder="Enter your email"
              />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input type="text" value={userPhone || '-'} disabled />
            </div>
            <div className="form-group">
              <label>Gender</label>
              <select value={profileForm.gender} onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value })}>
                <option>Prefer not to say</option>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </div>
            <button type="submit" className="account-button primary">Save Profile</button>
          </form>
        )}

        {/* Manage Addresses */}
        {currentView === 'addresses' && (
          <div className="account-addresses">
            <div className="addresses-list">
              <p className="section-subtitle">Saved Addresses</p>
              {addresses.length === 0 ? (
                <p className="no-data">No saved addresses</p>
              ) : (
                addresses.map((addr) => (
                  <div key={addr.id} className="address-card">
                    <div className="address-info">
                      <strong>{addr.name}</strong>
                      <p>{addr.line1}, {addr.city}, {addr.state} - {addr.pincode}</p>
                      <p>{addr.phone}</p>
                    </div>
                    <button
                      type="button"
                      className="delete-btn"
                      onClick={() => deleteAddress(addr.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="add-address-form">
              <p className="section-subtitle">Add New Address</p>
              <form onSubmit={saveAddress}>
                <div className="form-group">
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={newAddress.name}
                    onChange={(e) => setNewAddress({ ...newAddress, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <input
                    type="tel"
                    placeholder="Phone Number"
                    value={newAddress.phone}
                    onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <textarea
                    placeholder="House no, street, area"
                    value={newAddress.line1}
                    onChange={(e) => setNewAddress({ ...newAddress, line1: e.target.value })}
                    rows={3}
                    required
                  />
                </div>
                <div className="form-row">
                  <input
                    type="text"
                    placeholder="City"
                    value={newAddress.city}
                    onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                    required
                  />
                  <input
                    type="text"
                    placeholder="State"
                    value={newAddress.state}
                    onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <input
                    type="text"
                    placeholder="Pincode"
                    value={newAddress.pincode}
                    onChange={(e) => setNewAddress({ ...newAddress, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                    maxLength="6"
                    required
                  />
                </div>
                <button type="submit" className="account-button primary">Add Address</button>
              </form>
            </div>
          </div>
        )}

        {/* Saved Cards */}
        {currentView === 'cards' && (
          <div className="account-cards">
            <div className="cards-list">
              <p className="section-subtitle">Saved Cards</p>
              {savedCards.length === 0 ? (
                <p className="no-data">No saved cards</p>
              ) : (
                savedCards.map((card) => (
                  <div key={card.id} className="card-item">
                    <div className="card-info">
                      <strong>**** **** **** {card.last4}</strong>
                      <p>{card.holder}</p>
                      <p>Expires: {card.expiry}</p>
                    </div>
                    <button
                      type="button"
                      className="delete-btn"
                      onClick={() => deleteCard(card.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="add-card-form">
              <p className="section-subtitle">Add New Card</p>
              <form onSubmit={saveCard}>
                <div className="form-group">
                  <input
                    type="text"
                    placeholder="Card Holder Name"
                    value={newCard.holder}
                    onChange={(e) => setNewCard({ ...newCard, holder: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <input
                    type="text"
                    placeholder="Card Number"
                    value={newCard.number}
                    onChange={(e) => setNewCard({ ...newCard, number: e.target.value.replace(/\D/g, '').slice(0, 16) })}
                    maxLength="16"
                    required
                  />
                </div>
                <div className="form-group">
                  <input
                    type="text"
                    placeholder="MM/YY"
                    value={newCard.expiry}
                    onChange={(e) => setNewCard({ ...newCard, expiry: e.target.value.slice(0, 5) })}
                    required
                  />
                </div>
                <button type="submit" className="account-button primary">Save Card</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
