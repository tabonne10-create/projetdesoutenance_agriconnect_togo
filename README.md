# AgriConnect Togo

Plateforme web installable de mise en relation entre agriculteurs, éleveurs,
vétérinaires et acheteurs au Togo.

## Fonctionnalités du prototype

1. Catalogue d'animaux et de fumier, recherche textuelle et filtre par région.
2. Commande d'une annonce avec suivi de statut et calcul d'une commission.
3. Prise de rendez-vous vétérinaire.
4. Publication d'annonces et consultation de conseils vétérinaires.
5. Connexion et inscription avec rôles acheteur, éleveur, vétérinaire et administrateur.
6. Tableau d'administration : indicateurs, modération des annonces, comptes,
   commandes et rendez-vous.
7. Interface responsive et PWA avec mise en cache de la coquille de l'application.

Les paiements T-Money et Flooz ne sont pas activés : le prototype enregistre
uniquement une commande de démonstration. La commission (5 % par défaut) est
indicative. Ne saisissez pas de vraies données de paiement.

## Comptes de démonstration

| Profil | E-mail | Mot de passe |
|---|---|---|
| Administrateur | `admin@agriconnect.tg` | `Admin123!` |
| Acheteur | `agriculteur@agriconnect.tg` | `Demo123!` |
| Éleveur | `eleveur@agriconnect.tg` | `Demo123!` |

Ces comptes sont exclusivement destinés à la démonstration locale. Les mots de
passe sont hachés dans la base. Pour tout déploiement, retirez les comptes de
démonstration et définissez une variable d'environnement `SECRET_KEY` privée.
Sans cette variable, l'API crée une clé temporaire à chaque démarrage.

## Démarrage local

### API Python

```powershell
cd backend
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

API : <http://127.0.0.1:8000>  
Documentation interactive : <http://127.0.0.1:8000/docs>

La base SQLite `agriconnect.db` est créée automatiquement dans `backend/`.

### Frontend React

Dans un autre terminal :

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Frontend : <http://localhost:5173>. L'API est configurée par défaut sur
`http://127.0.0.1:8000`; changer `VITE_API_URL` dans `frontend/.env` si besoin.

### Tests de l'API

```powershell
cd backend
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
```

## Structure

- `backend/app/` : API FastAPI et persistance SQLite avec SQLModel.
- `frontend/src/` : application React + TypeScript.
- `docs/conception.md` : périmètre, architecture, règles métiers et diagrammes.
- `docs/maquettes.md` : parcours et maquettes fonctionnelles.

## Documents de soutenance

Consulter [la conception](docs/conception.md) et
[les maquettes](docs/maquettes.md).

## Limites avant mise en production

La connexion de démonstration utilise un jeton Bearer. Avant une mise en
production, remplacer les comptes de démonstration, définir une clé secrète
forte, ajouter la récupération de compte et la validation des vendeurs,
intégrer les API officielles de paiement après accord des opérateurs, et mettre
en place des sauvegardes et une politique de protection des données.
