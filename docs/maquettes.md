# Maquettes fonctionnelles

Les maquettes de cette première version sont implémentées dans l'interface
React. Le style utilise une palette vert agricole, crème et jaune récolte,
avec des cartes lisibles, des appels à l'action visibles et une mise en page
adaptée au mobile.

Les photos locales du dossier `img/` illustrent le champ d'accueil, les
annonces d'animaux et de compost, ainsi que les profils vétérinaires. Vite les
intègre au build sans dépendance à un hébergeur d'images externe.

## Écran 1 — Accueil et marché

```text
┌──────────────────────────────────────────┐
│ AgriConnect       Marché  Vétérinaires  ☰ │
├──────────────────────────────────────────┤
│ La terre nourrit, connectons ceux qui   │
│ la cultivent.              [Explorer]    │
│                                          │
│ [Rechercher un produit...] [Région ▼]    │
│ [Tout] [Animaux] [Fumier]                │
│                                          │
│ Marché près de chez vous                 │
│ [Photo] Bovin ...       [Photo] Fumier   │
│         prix FCFA               prix     │
└──────────────────────────────────────────┘
```

**Actions :** recherche par texte, filtres catégorie/région, ouverture d'une
annonce, commande avec quantité et demande de publication.

## Écran 2 — Détail et commande

```text
┌──────────────────────────────────────────┐
│ ← Retour             Annonce             │
│ Bovin Borgou                             │
│ Sokodé · Disponible                      │
│ 185 000 FCFA                             │
│ Quantité [−] 1 [+]                       │
│ Total estimé          185 000 FCFA       │
│ Commission indicative   9 250 FCFA      │
│ [Continuer (paiement simulé)]            │
└──────────────────────────────────────────┘
```

**Actions :** vérifier le stock, estimer la commission, créer une commande
démo et présenter clairement que le paiement est simulé.

## Écran 3 — Espace vétérinaire

```text
┌──────────────────────────────────────────┐
│ Conseils et soins                        │
│ [Conseils] [Prendre rendez-vous]         │
│ Prévention des parasites                 │
│ Dr. Akouvi · Kpalimé                     │
│                                          │
│ Demander un rendez-vous                  │
│ Connecté comme : Kossi Amégan            │
│ [Région ▼] [Sujet] [Date]               │
│ [Envoyer la demande]                     │
└──────────────────────────────────────────┘
```

**Actions :** consulter les conseils, choisir un praticien et envoyer une
demande de rendez-vous au nom de l'utilisateur connecté.

## Écran 4 — Publication d'annonce

```text
┌──────────────────────────────────────────┐
│ Vendre sur AgriConnect                   │
│ [Titre]                                  │
│ [Catégorie ▼] [Région ▼]                │
│ [Prix en FCFA] [Quantité]               │
│ [Description]                           │
│ [Publier l'annonce]                      │
└──────────────────────────────────────────┘
```

**Responsive :** sur téléphone, les filtres et formulaires passent en une
colonne, les actions principales restent visibles et les cartes s'empilent.

## Écran 5 — Connexion et inscription

```text
┌──────────────────────────────────────────┐
│ Le bon lien commence ici.                │
│         Connexion                        │
│ [Adresse e-mail]                         │
│ [Mot de passe]                           │
│ [Se connecter]                           │
│ Créer un compte                          │
│                                          │
│ Comptes de démonstration                 │
│ Administrateur · Acheteur · Éleveur      │
└──────────────────────────────────────────┘
```

Le formulaire d'inscription propose les profils acheteur, éleveur et
vétérinaire. Le rôle administrateur n'est pas proposé à l'inscription publique.

## Écran 6 — Tableau d'administration

```text
┌──────────────────────────────────────────┐
│ Administration         [Actualiser]      │
│ Vue d'ensemble Annonces Commandes Comptes │
│                                          │
│ Comptes   Annonces   Commandes   Commissions│
│                                          │
│ Modération des annonces                  │
│ Produit · Vendeur · Région · Statut      │
│ [Suspendre / Réactiver]                  │
│                                          │
│ Comptes · Commandes · Rendez-vous        │
└──────────────────────────────────────────┘
```

Les contrôles d'administration sont validés par le backend selon le rôle du
compte, et pas uniquement masqués dans l'interface.
