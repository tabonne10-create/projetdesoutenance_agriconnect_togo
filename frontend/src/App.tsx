import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import champImage from '../../img/champ.webp'
import chevresImage from '../../img/chevres.webp'
import fumierImage from '../../img/fumier.webp'
import moutonImage from '../../img/mouton.webp'
import pouletsImage from '../../img/poulets.webp'
import vetOneImage from '../../img/veto1.webp'
import vetTwoImage from '../../img/veto2.webp'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'
const regions = ['Toutes les régions', 'Maritime', 'Plateaux', 'Centrale', 'Kara', 'Savanes']
const today = new Date().toISOString().slice(0, 10)

type Listing = {
  id: number
  title: string
  category: 'animals' | 'manure'
  description: string
  region: string
  price_fcfa: number
  stock: number
  seller_name: string
  status: string
}

type Veterinarian = { name: string; region: string; specialty: string }
type User = { id: number; full_name: string; email: string; role: string; is_active: boolean }
type AuthState = { access_token: string; user: User }
type AdminOrder = {
  id: number
  buyer_name: string
  total_fcfa: number
  commission_fcfa: number
  payment_status: string
  delivery_status: string
}
type Appointment = {
  id: number
  client_name: string
  veterinarian: string
  region: string
  subject: string
  preferred_date: string
  status: string
}
type AdminSummary = {
  users: number
  active_listings: number
  orders: number
  appointments: number
  commission_fcfa: number
}
type AdminData = {
  summary: AdminSummary
  listings: Listing[]
  orders: AdminOrder[]
  users: User[]
  appointments: Appointment[]
}
type AdminTab = 'overview' | 'listings' | 'orders' | 'users' | 'appointments'
type Page = 'market' | 'vets' | 'publish' | 'login' | 'admin'

const formatMoney = (amount: number) =>
  `${new Intl.NumberFormat('fr-FR').format(amount)} FCFA`

function getListingImage(listing: Listing): { src: string; alt: string } {
  const title = listing.title.toLocaleLowerCase('fr')
  if (listing.category === 'manure' || title.includes('fumier') || title.includes('compost')) {
    return { src: fumierImage, alt: 'Sacs de compost organique dans une ferme' }
  }
  if (title.includes('poulet') || title.includes('volaille')) {
    return { src: pouletsImage, alt: 'Poulets élevés dans une ferme togolaise' }
  }
  if (title.includes('mouton') || /\bovin\b/.test(title)) {
    return { src: moutonImage, alt: 'Mouton élevé dans une ferme togolaise' }
  }
  if (title.includes('bovin') || title.includes('vache')) {
    return { src: champImage, alt: 'Exploitation agricole locale' }
  }
  return { src: chevresImage, alt: 'Chèvres élevées dans une ferme togolaise' }
}

function App() {
  const [page, setPage] = useState<Page>('market')
  const [auth, setAuth] = useState<AuthState | null>(() => {
    try {
      const saved = localStorage.getItem('agriconnect-auth')
      return saved ? (JSON.parse(saved) as AuthState) : null
    } catch {
      localStorage.removeItem('agriconnect-auth')
      return null
    }
  })
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [adminTab, setAdminTab] = useState<AdminTab>('overview')
  const [adminData, setAdminData] = useState<AdminData | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [veterinarians, setVeterinarians] = useState<Veterinarian[]>([])
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState(regions[0])
  const [category, setCategory] = useState<'all' | 'animals' | 'manure'>('all')
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingReceiptId, setPendingReceiptId] = useState<number | null>(null)
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null)

  const accessToken = auth?.access_token
  const apiRequest = useCallback(async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    const response = await fetch(`${API_URL}${path}`, { ...init, headers })
    if (response.status === 401 && accessToken) {
      localStorage.removeItem('agriconnect-auth')
      setAuth(null)
      setAdminData(null)
      setPage('market')
      setNotice('Votre session a expiré. Veuillez vous reconnecter.')
    }
    return response
  }, [accessToken])

  function signOut() {
    localStorage.removeItem('agriconnect-auth')
    setAuth(null)
    setAdminData(null)
    setPage('market')
    setNotice('Vous êtes déconnecté(e).')
  }

  function openPrivatePage(target: 'publish' | 'admin' | 'appointment') {
    if (!auth) {
      setAuthMode('login')
      setPage('login')
      setNotice('Connectez-vous pour continuer.')
      return
    }
    if (target === 'admin' && auth.user.role !== 'admin') {
      setApiError('Cette page est réservée à l’administration.')
      return
    }
    if (target === 'publish' && auth.user.role !== 'seller') {
      setApiError('Connectez-vous avec un compte éleveur pour publier une annonce.')
      return
    }
    if (target === 'appointment' && auth.user.role === 'admin') {
      setApiError('Les rendez-vous sont réservés aux comptes producteurs et acheteurs.')
      return
    }
    setPage(target === 'appointment' ? 'vets' : target)
  }

  async function loadListings() {
    try {
      const response = await apiRequest('/api/listings')
      if (!response.ok) throw new Error(`L'API a répondu avec le code ${response.status}.`)
      setApiError('')
      setListings((await response.json()) as Listing[])
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Impossible de charger les annonces.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    async function loadInitialData() {
      try {
        const [listingResponse, veterinarianResponse] = await Promise.all([
          apiRequest('/api/listings', { signal: controller.signal }),
          fetch(`${API_URL}/api/veterinarians`, { signal: controller.signal }),
        ])
        if (!listingResponse.ok || !veterinarianResponse.ok) {
          throw new Error('Impossible de charger les données du marché.')
        }
        const [listingData, veterinarianData] = await Promise.all([
          listingResponse.json() as Promise<Listing[]>,
          veterinarianResponse.json() as Promise<Veterinarian[]>,
        ])
        setListings(listingData)
        setVeterinarians(veterinarianData)
      } catch (error) {
        if (!controller.signal.aborted) {
          setApiError(error instanceof Error ? error.message : 'Impossible de charger les données.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadInitialData()
    return () => controller.abort()
  }, [apiRequest])

  useEffect(() => {
    const token = auth?.access_token
    if (!token) return
    let active = true
    async function verifySession() {
      try {
        const response = await apiRequest('/api/auth/me')
        if (!active) return
        if (response.ok) {
          const user = (await response.json()) as User
          setAuth((current) =>
            current && current.access_token === token ? { ...current, user } : current,
          )
        } else {
          localStorage.removeItem('agriconnect-auth')
          setAuth(null)
        }
      } catch {
        if (active) setApiError('Impossible de vérifier la session. Vérifiez la connexion à l’API.')
      }
    }
    void verifySession()
    return () => { active = false }
  }, [apiRequest, auth?.access_token])

  const fetchAdminData = useCallback(async (): Promise<AdminData> => {
    const paths = [
      '/api/admin/summary',
      '/api/admin/listings',
      '/api/admin/orders',
      '/api/admin/users',
      '/api/admin/appointments',
    ]
    const responses = await Promise.all(paths.map((path) => apiRequest(path)))
    const failedResponse = responses.find((response) => !response.ok)
    if (failedResponse) {
      const body = (await failedResponse.json()) as { detail?: string }
      throw new Error(body.detail ?? 'Impossible de charger le tableau de bord.')
    }
    const [summary, listingsData, orders, users, appointments] = await Promise.all(
      responses.map((response) => response.json()),
    ) as [AdminSummary, Listing[], AdminOrder[], User[], Appointment[]]
    return { summary, listings: listingsData, orders, users, appointments }
  }, [apiRequest])

  useEffect(() => {
    if (page !== 'admin' || auth?.user.role !== 'admin') return
    let active = true
    async function loadAdmin() {
      try {
        const data = await fetchAdminData()
        if (active) {
          setAdminData(data)
          setApiError('')
        }
      } catch (error) {
        if (active) {
          setApiError(error instanceof Error ? error.message : 'Impossible de charger le tableau de bord.')
        }
      }
    }
    void loadAdmin()
    return () => { active = false }
  }, [page, auth?.user.role, fetchAdminData])

  const loadAdminData = useCallback(async () => {
    try {
      setAdminData(await fetchAdminData())
      setApiError('')
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Impossible de charger le tableau de bord.')
    }
  }, [fetchAdminData])

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload = {
      email: String(form.get('email')),
      password: String(form.get('password')),
      ...(authMode === 'register'
        ? {
            full_name: String(form.get('full_name')),
            role: String(form.get('role')),
          }
        : {}),
    }
    try {
      const response = await fetch(`${API_URL}/api/auth/${authMode === 'register' ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = (await response.json()) as AuthState & { detail?: string }
      if (!response.ok) throw new Error(body.detail ?? 'La connexion a échoué.')
      localStorage.setItem('agriconnect-auth', JSON.stringify(body))
      setAuth(body)
      setNotice(`Bienvenue, ${body.user.full_name}.`)
      setApiError('')
      setPage(body.user.role === 'admin' ? 'admin' : 'market')
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'La connexion a échoué.')
    }
  }

  const filteredListings = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('fr')
    return listings.filter((listing) => {
      const matchesTerm =
        !term ||
        `${listing.title} ${listing.description} ${listing.seller_name}`
          .toLocaleLowerCase('fr')
          .includes(term)
      const matchesRegion = region === regions[0] || listing.region === region
      const matchesCategory = category === 'all' || listing.category === category
      return matchesTerm && matchesRegion && matchesCategory
    })
  }, [category, listings, query, region])

  async function submitAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const payload = {
      veterinarian: String(form.get('veterinarian')),
      region: String(form.get('vet_region')),
      subject: String(form.get('subject')),
      preferred_date: String(form.get('preferred_date')),
    }
    try {
      const response = await apiRequest('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const body = (await response.json()) as { detail?: string }
        throw new Error(body.detail ?? 'La demande de rendez-vous a échoué.')
      }
      formElement.reset()
      setNotice('Votre demande de rendez-vous a bien été enregistrée.')
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'La demande de rendez-vous a échoué.')
    }
  }

  async function submitListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const payload = {
      title: String(form.get('title')),
      category: String(form.get('category')),
      description: String(form.get('description')),
      region: String(form.get('listing_region')),
      price_fcfa: Number(form.get('price_fcfa')),
      stock: Number(form.get('stock')),
      seller_name: String(form.get('seller_name')),
    }
    try {
      const response = await apiRequest('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const body = (await response.json()) as { detail?: string }
        throw new Error(body.detail ?? 'La publication de l’annonce a échoué.')
      }
      formElement.reset()
      setNotice('Votre annonce est publiée et visible sur le marché.')
      setPage('market')
      await loadListings()
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'La publication de l’annonce a échoué.')
    }
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedListing || !auth || auth.user.role !== 'buyer') return
    const form = new FormData(event.currentTarget)
    const quantity = Number(form.get('quantity'))
    try {
      const response = await apiRequest('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: selectedListing.id,
          quantity,
        }),
      })
      if (!response.ok) {
        const body = (await response.json()) as { detail?: string }
        throw new Error(body.detail ?? 'La commande n’a pas pu être enregistrée.')
      }
      const order = (await response.json()) as {
        id: number
        total_fcfa: number
        commission_fcfa: number
      }
      setSelectedListing(null)
      setPendingReceiptId(order.id)
      setNotice(
        `Commande de démonstration enregistrée : ${formatMoney(order.total_fcfa)}, dont ${formatMoney(order.commission_fcfa)} de commission indicative.`,
      )
      await loadListings()
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'La commande n’a pas pu être enregistrée.')
    }
  }

  async function confirmReceipt() {
    if (pendingReceiptId === null) return
    try {
      const response = await apiRequest(`/api/orders/${pendingReceiptId}/receipt`, {
        method: 'PATCH',
      })
      if (!response.ok) {
        const body = (await response.json()) as { detail?: string }
        throw new Error(body.detail ?? 'La confirmation de réception a échoué.')
      }
      setPendingReceiptId(null)
      setNotice('Réception confirmée. Cette action ne déclenche aucun paiement réel.')
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'La confirmation de réception a échoué.')
    }
  }

  async function updateListingStatus(listing: Listing) {
    try {
      const response = await apiRequest(`/api/admin/listings/${listing.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: listing.status === 'active' ? 'suspended' : 'active' }),
      })
      if (!response.ok) {
        const body = (await response.json()) as { detail?: string }
        throw new Error(body.detail ?? 'La mise à jour de l’annonce a échoué.')
      }
      await loadAdminData()
      setNotice('Le statut de l’annonce a été mis à jour.')
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'La mise à jour de l’annonce a échoué.')
    }
  }

  async function updateUserStatus(user: User) {
    try {
      const response = await apiRequest(`/api/admin/users/${user.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !user.is_active }),
      })
      if (!response.ok) {
        const body = (await response.json()) as { detail?: string }
        throw new Error(body.detail ?? 'La mise à jour du compte a échoué.')
      }
      await loadAdminData()
      setNotice('Le statut du compte a été mis à jour.')
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'La mise à jour du compte a échoué.')
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" onClick={() => setPage('market')} aria-label="AgriConnect, accueil">
          <span className="brand-mark">A</span>
          <span>AgriConnect<span className="brand-country"> Togo</span></span>
        </a>
        <nav className="desktop-nav" aria-label="Navigation principale">
          <button className={page === 'market' ? 'nav-link active' : 'nav-link'} onClick={() => setPage('market')}>Le marché</button>
          <button className={page === 'vets' ? 'nav-link active' : 'nav-link'} onClick={() => setPage('vets')}>Espace vétérinaire</button>
          {auth?.user.role === 'admin' && <button className={page === 'admin' ? 'nav-link active' : 'nav-link'} onClick={() => setPage('admin')}>Administration</button>}
        </nav>
        <div className="header-account">
          {auth ? (
            <>
              <span className="account-name">{auth.user.full_name}<small>{auth.user.role === 'admin' ? 'Administrateur' : auth.user.role === 'seller' ? 'Éleveur' : auth.user.role === 'vet' ? 'Vétérinaire' : 'Acheteur'}</small></span>
              <button className="button button-outline publish-top" onClick={signOut}>Déconnexion</button>
            </>
          ) : (
            <>
              <button className="button button-quiet publish-top" onClick={() => { setAuthMode('login'); setPage('login') }}>Connexion</button>
              <button className="button button-outline publish-top" onClick={() => openPrivatePage('publish')}>
                <span aria-hidden="true">＋</span> Publier
              </button>
            </>
          )}
        </div>
      </header>

      <main>
        {apiError && (
          <div className="alert alert-error" role="alert">
            <span>{apiError} Vérifiez que l’API Python est démarrée.</span>
            <button onClick={() => void loadListings()}>Réessayer</button>
          </div>
        )}
        {notice && (
          <div className="alert alert-success" role="status">
            <span>{notice}</span>
            {pendingReceiptId !== null && <button onClick={() => void confirmReceipt()}>Confirmer la réception</button>}
            <button aria-label="Fermer le message" onClick={() => setNotice('')}>×</button>
          </div>
        )}

        {page === 'login' && (
          <section className="auth-page">
            <div className="auth-illustration">
              <span className="eyebrow">ENSEMBLE, CULTIVONS L’AVENIR</span>
              <h1>Le bon lien<br /><span>commence ici.</span></h1>
              <p>Retrouvez votre espace AgriConnect et faites grandir votre activité agricole.</p>
              <div className="auth-field-art" aria-hidden="true">🌱　🌾　🐄</div>
            </div>
            <div className="auth-panel">
              <span className="eyebrow">{authMode === 'login' ? 'HEUREUX DE VOUS REVOIR' : 'REJOIGNEZ LE RÉSEAU'}</span>
              <h2>{authMode === 'login' ? 'Connexion' : 'Créer un compte'}</h2>
              <p>{authMode === 'login' ? 'Connectez-vous pour accéder à votre espace.' : 'Inscrivez-vous comme acheteur, éleveur ou vétérinaire.'}</p>
              <form className="auth-form" onSubmit={submitAuth}>
                {authMode === 'register' && (
                  <>
                    <label>Nom complet<input name="full_name" required minLength={2} placeholder="Ex. Kossi Amégan" /></label>
                    <label>Votre profil<select name="role" defaultValue="buyer"><option value="buyer">Agriculteur / Acheteur</option><option value="seller">Éleveur / Vendeur</option><option value="vet">Vétérinaire</option></select></label>
                  </>
                )}
                <label>Adresse e-mail<input name="email" type="email" required autoComplete="email" placeholder="vous@exemple.tg" /></label>
                <label>Mot de passe<input name="password" type="password" required minLength={authMode === 'register' ? 8 : 1} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} placeholder={authMode === 'register' ? '8 caractères minimum' : 'Votre mot de passe'} /></label>
                <button className="button button-primary auth-submit" type="submit">{authMode === 'login' ? 'Se connecter' : 'Créer mon compte'} <span aria-hidden="true">→</span></button>
              </form>
              <button className="auth-switch" onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setApiError('') }}>
                {authMode === 'login' ? 'Pas encore de compte ? Créer un compte' : 'Déjà inscrit(e) ? Se connecter'}
              </button>
              {authMode === 'login' && (
                <div className="demo-credentials">
                  <strong>Comptes de démonstration</strong>
                  <span>Admin : admin@agriconnect.tg / Admin123!</span>
                  <span>Acheteur : agriculteur@agriconnect.tg / Demo123!</span>
                  <span>Éleveur : eleveur@agriconnect.tg / Demo123!</span>
                </div>
              )}
            </div>
          </section>
        )}

        {page === 'admin' && auth?.user.role === 'admin' && (
          <section className="admin-page">
            <div className="admin-heading">
              <div><span className="eyebrow">ESPACE SÉCURISÉ</span><h1>Administration</h1><p>Gérez le marché et suivez l’activité de la plateforme.</p></div>
              <button className="button button-outline" onClick={() => void loadAdminData()}>↻ Actualiser</button>
            </div>
            <nav className="admin-tabs" aria-label="Sections d’administration">
              {([
                ['overview', 'Vue d’ensemble'],
                ['listings', 'Annonces'],
                ['orders', 'Commandes'],
                ['users', 'Utilisateurs'],
                ['appointments', 'Rendez-vous'],
              ] as const).map(([tab, label]) => (
                <button key={tab} className={adminTab === tab ? 'admin-tab active' : 'admin-tab'} onClick={() => setAdminTab(tab)}>{label}</button>
              ))}
            </nav>
            {!adminData ? <div className="empty-state">{apiError || 'Chargement des données d’administration…'}</div> : (
              <>
                {adminTab === 'overview' && (
                  <>
                    <div className="admin-metrics">
                      <article><span>Comptes inscrits</span><strong>{adminData.summary.users}</strong><small>tous profils confondus</small></article>
                      <article><span>Annonces actives</span><strong>{adminData.summary.active_listings}</strong><small>visibles sur le marché</small></article>
                      <article><span>Commandes</span><strong>{adminData.summary.orders}</strong><small>paiements de démonstration</small></article>
                      <article><span>Commissions indicatives</span><strong>{formatMoney(adminData.summary.commission_fcfa)}</strong><small>aucun fonds réellement encaissé</small></article>
                    </div>
                    <div className="admin-overview-grid">
                      <article className="admin-info-card"><span className="eyebrow">À SUIVRE</span><h3>Rendez-vous vétérinaires</h3><strong>{adminData.summary.appointments}</strong><p>demandes enregistrées</p><button className="admin-text-button" onClick={() => setAdminTab('appointments')}>Voir les demandes →</button></article>
                      <article className="admin-info-card"><span className="eyebrow">RAPPEL</span><h3>Paiements non connectés</h3><p>T-Money et Flooz ne sont pas activés. Les commandes et commissions affichées sont uniquement des données de démonstration.</p></article>
                    </div>
                  </>
                )}
                {adminTab === 'listings' && (
                  <div className="admin-table-card"><div className="admin-table-heading"><h2>Modération des annonces</h2><span>{adminData.listings.length} annonces</span></div>
                    <div className="table-scroll"><table><thead><tr><th>Annonce</th><th>Vendeur</th><th>Région</th><th>Prix</th><th>Statut</th><th>Action</th></tr></thead><tbody>
                      {adminData.listings.map((item) => <tr key={item.id}><td><strong>{item.title}</strong></td><td>{item.seller_name}</td><td>{item.region}</td><td>{formatMoney(item.price_fcfa)}</td><td><span className={`status-pill status-${item.status}`}>{item.status}</span></td><td>{item.status !== 'sold' && <button className="table-action" onClick={() => void updateListingStatus(item)}>{item.status === 'active' ? 'Suspendre' : 'Réactiver'}</button>}</td></tr>)}
                    </tbody></table></div>
                  </div>
                )}
                {adminTab === 'orders' && (
                  <div className="admin-table-card"><div className="admin-table-heading"><h2>Suivi des commandes</h2><span>{adminData.orders.length} commandes</span></div>
                    <div className="table-scroll"><table><thead><tr><th>N°</th><th>Acheteur</th><th>Total</th><th>Commission</th><th>Paiement</th><th>Livraison</th></tr></thead><tbody>
                      {adminData.orders.map((order) => <tr key={order.id}><td>#{order.id}</td><td>{order.buyer_name}</td><td>{formatMoney(order.total_fcfa)}</td><td>{formatMoney(order.commission_fcfa)}</td><td><span className="status-pill status-demo">{order.payment_status}</span></td><td>{order.delivery_status}</td></tr>)}
                      {adminData.orders.length === 0 && <tr><td colSpan={6}>Aucune commande enregistrée.</td></tr>}
                    </tbody></table></div>
                  </div>
                )}
                {adminTab === 'users' && (
                  <div className="admin-table-card"><div className="admin-table-heading"><h2>Gestion des comptes</h2><span>{adminData.users.length} comptes</span></div>
                    <div className="table-scroll"><table><thead><tr><th>Nom</th><th>E-mail</th><th>Profil</th><th>Statut</th><th>Action</th></tr></thead><tbody>
                      {adminData.users.map((item) => <tr key={item.id}><td><strong>{item.full_name}</strong></td><td>{item.email}</td><td>{item.role}</td><td><span className={`status-pill ${item.is_active ? 'status-active' : 'status-suspended'}`}>{item.is_active ? 'Actif' : 'Désactivé'}</span></td><td>{item.id !== auth.user.id && <button className="table-action" onClick={() => void updateUserStatus(item)}>{item.is_active ? 'Désactiver' : 'Réactiver'}</button>}</td></tr>)}
                    </tbody></table></div>
                  </div>
                )}
                {adminTab === 'appointments' && (
                  <div className="admin-table-card"><div className="admin-table-heading"><h2>Rendez-vous vétérinaires</h2><span>{adminData.appointments.length} demandes</span></div>
                    <div className="table-scroll"><table><thead><tr><th>Demandeur</th><th>Vétérinaire</th><th>Région</th><th>Sujet</th><th>Date souhaitée</th><th>Statut</th></tr></thead><tbody>
                      {adminData.appointments.map((item) => <tr key={item.id}><td>{item.client_name}</td><td>{item.veterinarian}</td><td>{item.region}</td><td>{item.subject}</td><td>{item.preferred_date}</td><td>{item.status}</td></tr>)}
                      {adminData.appointments.length === 0 && <tr><td colSpan={6}>Aucune demande de rendez-vous.</td></tr>}
                    </tbody></table></div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {page === 'market' && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow"><span className="live-dot" /> AU SERVICE DES AGRICULTEURS TOGOLAIS</span>
                <h1>La terre nourrit.<br /><span>Connectons ceux qui la cultivent.</span></h1>
                <p>Le marché agricole qui rapproche éleveurs, agriculteurs et acheteurs, partout au Togo.</p>
                <button className="button button-primary hero-button" onClick={() => document.getElementById('market')?.scrollIntoView({ behavior: 'smooth' })}>
                  Explorer le marché <span aria-hidden="true">↘</span>
                </button>
                <div className="hero-proof"><span className="proof-avatars">AK · KM · YA</span><span>Des producteurs de nos régions</span></div>
              </div>
              <div className="hero-art">
                <img className="hero-photo" src={champImage} alt="Productrice dans un champ au Togo" fetchPriority="high" />
                <div className="hero-photo-overlay" />
                <div className="hero-sticker"><span>🌱</span><div><strong>De la ferme</strong><small>à votre communauté</small></div></div>
              </div>
            </section>

            <section className="trust-strip" aria-label="Avantages">
              <div><span className="trust-icon">⌖</span><span><strong>Près de chez vous</strong><small>5 régions du Togo</small></span></div>
              <div><span className="trust-icon">₣</span><span><strong>Prix transparents</strong><small>Toujours en FCFA</small></span></div>
              <div><span className="trust-icon">↗</span><span><strong>Simple et direct</strong><small>Du producteur à l’acheteur</small></span></div>
              <div><span className="trust-icon">◌</span><span><strong>Fait pour le terrain</strong><small>Accessible sur mobile</small></span></div>
            </section>

            <section className="market-section" id="market">
              <div className="section-heading">
                <div><span className="eyebrow">LE MARCHÉ LOCAL</span><h2>De belles opportunités<br />près de chez vous.</h2></div>
                <span className="listing-count">{filteredListings.length} annonces disponibles</span>
              </div>
              <div className="filters">
                <label className="search-field"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Que recherchez-vous ?" aria-label="Rechercher une annonce" /></label>
                <label className="region-select"><span className="visually-hidden">Filtrer par région</span><select value={region} onChange={(event) => setRegion(event.target.value)}>{regions.map((item) => <option key={item}>{item}</option>)}</select></label>
              </div>
              <div className="category-tabs" role="group" aria-label="Filtrer par type d'annonce">
                <button className={category === 'all' ? 'category-tab selected' : 'category-tab'} onClick={() => setCategory('all')}>Tout voir</button>
                <button className={category === 'animals' ? 'category-tab selected' : 'category-tab'} onClick={() => setCategory('animals')}>🐄 Animaux</button>
                <button className={category === 'manure' ? 'category-tab selected' : 'category-tab'} onClick={() => setCategory('manure')}>🌱 Fumier & compost</button>
              </div>
              {loading ? <div className="empty-state">Chargement des annonces…</div> : filteredListings.length === 0 ? (
                <div className="empty-state">Aucune annonce ne correspond à cette recherche. Essayez une autre région ou un autre mot-clé.</div>
              ) : (
                <div className="listing-grid">
                  {filteredListings.map((listing, index) => {
                    const image = getListingImage(listing)
                    return (
                      <article className="listing-card" key={listing.id}>
                        <div className={`listing-visual visual-${index % 4}`}>
                          <span className="listing-type">{listing.category === 'animals' ? 'ÉLEVAGE' : 'AGRICULTURE'}</span>
                          <img className="listing-photo" src={image.src} alt={image.alt} loading="lazy" decoding="async" />
                          <button className="favorite-button" aria-label="Ajouter aux favoris">♡</button>
                        </div>
                        <div className="listing-info">
                          <div className="listing-location"><span>⌖</span> Région {listing.region}</div>
                          <h3>{listing.title}</h3>
                          <p className="seller-name">Proposé par {listing.seller_name}</p>
                          <div className="listing-bottom">
                            <div><strong>{formatMoney(listing.price_fcfa)}</strong><small>{listing.category === 'manure' ? 'par sac' : 'par tête'}</small></div>
                            <button className="button button-small" disabled={listing.stock < 1} onClick={() => {
                              if (!auth || auth.user.role !== 'buyer') {
                                setAuthMode('login')
                                setPage('login')
                                setNotice('Connectez-vous avec un compte acheteur pour commander.')
                                return
                              }
                              setSelectedListing(listing)
                            }}>{listing.stock < 1 ? 'Épuisé' : 'Voir l’offre'} <span aria-hidden="true">→</span></button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="callout">
              <div className="callout-icon">🤝</div>
              <div><span className="eyebrow">VOUS ÊTES PRODUCTEUR ?</span><h2>Vos produits méritent<br />d’être vus.</h2><p>Publiez gratuitement une annonce et développez votre activité avec AgriConnect.</p></div>
              <button className="button button-light" onClick={() => openPrivatePage('publish')}>Vendre sur AgriConnect <span aria-hidden="true">→</span></button>
            </section>
          </>
        )}

        {page === 'vets' && (
          <section className="page-section">
            <div className="section-heading">
              <div><span className="eyebrow">SANTÉ ANIMALE</span><h2>Des soins de confiance,<br />près de votre élevage.</h2></div>
            </div>
            <p className="page-intro">Trouvez un professionnel et demandez un rendez-vous. La date sera confirmée directement avec le vétérinaire.</p>
            <div className="vet-grid">
              {veterinarians.map((vet) => (
                <article className="vet-card" key={vet.name}>
                  <img className="vet-avatar-photo" src={vet.name === 'Dr. Akouvi' ? vetOneImage : vetTwoImage} alt={`Portrait de ${vet.name}`} loading="lazy" /><span className="verified">● Disponible</span>
                  <h3>{vet.name}</h3><p>{vet.specialty}</p><small>⌖ Région {vet.region}</small>
                  <button className="button button-outline" onClick={() => document.getElementById('appointment-form')?.scrollIntoView({ behavior: 'smooth' })}>Demander un rendez-vous</button>
                </article>
              ))}
            </div>
            <div className="advice-panel"><span className="advice-icon">✳</span><div><span className="eyebrow">CONSEIL PRATIQUE</span><h3>La prévention protège votre élevage.</h3><p>Respectez le calendrier vaccinal recommandé par un vétérinaire et isolez tout animal présentant des symptômes inhabituels.</p></div></div>
            {auth && auth.user.role !== 'admin' ? (
              <form className="form-card appointment-form" id="appointment-form" onSubmit={submitAppointment}>
                <span className="eyebrow">PRENDRE RENDEZ-VOUS</span><h2>Décrivez votre besoin.</h2>
                <p className="form-footnote">Demande envoyée au nom de {auth.user.full_name}.</p>
                <div className="form-grid">
                  <label>Vétérinaire<select name="veterinarian" required defaultValue=""><option value="" disabled>Choisir un vétérinaire</option>{veterinarians.map((vet) => <option key={vet.name}>{vet.name}</option>)}</select></label>
                  <label>Votre région<select name="vet_region" required defaultValue=""><option value="" disabled>Choisir une région</option>{regions.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label>Date souhaitée<input type="date" name="preferred_date" required min={today} /></label>
                  <label className="full-width">Sujet de la consultation<input name="subject" required minLength={3} placeholder="Ex. Suivi de santé de mon troupeau" /></label>
                </div>
                <button className="button button-primary" type="submit">Envoyer ma demande <span aria-hidden="true">→</span></button>
              </form>
            ) : (
              <div className="form-card appointment-form" id="appointment-form">
                <span className="eyebrow">PRENDRE RENDEZ-VOUS</span><h2>Connectez-vous pour demander une consultation.</h2>
                <button className="button button-primary" onClick={() => openPrivatePage('appointment')}>Se connecter <span aria-hidden="true">→</span></button>
              </div>
            )}
          </section>
        )}

        {page === 'publish' && auth?.user.role === 'seller' && (
          <section className="page-section publish-page">
            <span className="eyebrow">POUR LES PRODUCTEURS</span><h2>Faites connaître<br />vos produits.</h2>
            <p className="page-intro">Complétez les informations de votre annonce. Elle sera visible dans le marché après publication.</p>
            <form className="form-card" onSubmit={submitListing}>
              <div className="form-grid">
                <label className="full-width">Nom du vendeur<input name="seller_name" required minLength={2} placeholder="Votre nom ou celui de votre coopérative" /></label>
                <label>Titre de l'annonce<input name="title" required minLength={3} maxLength={120} placeholder="Ex. Fumier composté, sac de 50 kg" /></label>
                <label>Catégorie<select name="category" defaultValue="manure"><option value="manure">Fumier & compost</option><option value="animals">Animaux</option></select></label>
                <label>Région<select name="listing_region" required defaultValue=""><option value="" disabled>Choisir une région</option>{regions.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label>
                <label>Prix en FCFA<input name="price_fcfa" type="number" min="1" step="1" required placeholder="5000" /></label>
                <label>Quantité disponible<input name="stock" type="number" min="1" step="1" required placeholder="10" /></label>
                <label className="full-width">Description<textarea name="description" rows={4} maxLength={1000} placeholder="Décrivez le produit, sa qualité et les modalités de retrait." /></label>
              </div>
              <div className="form-footnote">La publication est gratuite dans ce prototype. Soyez précis sur la qualité et la disponibilité.</div>
              <button className="button button-primary" type="submit">Publier mon annonce <span aria-hidden="true">→</span></button>
            </form>
          </section>
        )}
      </main>

      <footer className="footer">
        <a className="brand footer-brand" href="#" onClick={() => setPage('market')}><span className="brand-mark">A</span><span>AgriConnect<span className="brand-country"> Togo</span></span></a>
        <p>Ensemble, cultivons l’avenir.</p>
        <span className="demo-label">Prototype de soutenance · Paiement non activé</span>
      </footer>

      {selectedListing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedListing(null) }}>
          <form className="order-modal" onSubmit={submitOrder}>
            <button className="modal-close" type="button" aria-label="Fermer" onClick={() => setSelectedListing(null)}>×</button>
            <span className="eyebrow">COMMANDE DE DÉMONSTRATION</span>
            <h2>{selectedListing.title}</h2>
            <p className="page-intro">Vendu par {selectedListing.seller_name} · Région {selectedListing.region}</p>
            <label>Quantité<input name="quantity" type="number" required min="1" max={selectedListing.stock} defaultValue="1" /></label>
            <div className="order-summary"><span>Prix unitaire</span><strong>{formatMoney(selectedListing.price_fcfa)}</strong><span>Commission indicative (5 %)</span><strong>{formatMoney(Math.round(selectedListing.price_fcfa * 0.05))}</strong></div>
            <div className="payment-warning">Aucun paiement réel n’est effectué. T-Money et Flooz ne sont pas connectés.</div>
            <button className="button button-primary" type="submit">Enregistrer la commande démo</button>
          </form>
        </div>
      )}
    </div>
  )
}

export default App
