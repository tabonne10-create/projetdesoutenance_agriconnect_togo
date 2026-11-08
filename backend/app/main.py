import os
import secrets
import warnings
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine, select

from app.models import Appointment, Listing, Order, User
from app.schemas import (
    AppointmentCreate,
    AuthResponse,
    ListingCreate,
    ListingStatusUpdate,
    LoginRequest,
    OrderCreate,
    RegisterRequest,
    UserPublic,
    UserStatusUpdate,
)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./agriconnect.db")
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    SECRET_KEY = secrets.token_urlsafe(32)
    warnings.warn(
        "SECRET_KEY is not set; a temporary key is being used. "
        "Set SECRET_KEY in the environment outside local development.",
        stacklevel=1,
    )
TOKEN_TTL = timedelta(hours=8)
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
password_hash = PasswordHash.recommended()
bearer_scheme = HTTPBearer(auto_error=False)

DEMO_USERS = [
    {
        "full_name": "Administrateur AgriConnect",
        "email": "admin@agriconnect.tg",
        "password": "Admin123!",
        "role": "admin",
    },
    {
        "full_name": "Agriculteur de démonstration",
        "email": "agriculteur@agriconnect.tg",
        "password": "Demo123!",
        "role": "buyer",
    },
    {
        "full_name": "Éleveur de démonstration",
        "email": "eleveur@agriconnect.tg",
        "password": "Demo123!",
        "role": "seller",
    },
]

SEED_LISTINGS = [
    {
        "title": "Bovin Borgou en bonne santé",
        "category": "animals",
        "description": "Bovin vacciné, élevé à Sokodé. Informations vétérinaires disponibles.",
        "region": "Centrale",
        "price_fcfa": 185000,
        "stock": 3,
        "seller_name": "Ferme de Kossi",
    },
    {
        "title": "Fumier de volaille composté",
        "category": "manure",
        "description": "Compost organique prêt à enrichir vos sols. Sac de 50 kg.",
        "region": "Maritime",
        "price_fcfa": 5000,
        "stock": 40,
        "seller_name": "Coopérative Agou",
    },
    {
        "title": "Chèvres de la région des Plateaux",
        "category": "animals",
        "description": "Lot de chèvres locales, élevage familial.",
        "region": "Plateaux",
        "price_fcfa": 45000,
        "stock": 8,
        "seller_name": "Élevage Assima",
    },
    {
        "title": "Compost organique enrichi",
        "category": "manure",
        "description": "Compost mûr pour cultures maraîchères, retrait à Kara.",
        "region": "Kara",
        "price_fcfa": 7500,
        "stock": 25,
        "seller_name": "Ferme de Baga",
    },
    {
        "title": "Moutons locaux pour l'élevage",
        "category": "animals",
        "description": "Moutons élevés localement, disponibles pour les éleveurs de la région.",
        "region": "Savanes",
        "price_fcfa": 65000,
        "stock": 6,
        "seller_name": "Élevage de Dapaong",
    },
    {
        "title": "Poulets fermiers disponibles",
        "category": "animals",
        "description": "Poulets élevés en plein air, vente par sujet.",
        "region": "Maritime",
        "price_fcfa": 4500,
        "stock": 30,
        "seller_name": "Ferme Avicole du Sud",
    },
]


def get_session():
    with Session(engine) as session:
        yield session


def migrate_ownership_columns() -> None:
    migrations = {
        "listing": ("seller_id", "INTEGER REFERENCES user(id)"),
        '"order"': ("buyer_id", "INTEGER REFERENCES user(id)"),
        "appointment": ("client_id", "INTEGER REFERENCES user(id)"),
    }
    with engine.begin() as connection:
        for table, (column, column_type) in migrations.items():
            existing_columns = {
                item["name"] for item in inspect(connection).get_columns(table.strip('"'))
            }
            if column not in existing_columns:
                connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}"))


def seed_data() -> None:
    with Session(engine) as session:
        for account in DEMO_USERS:
            if not session.exec(select(User).where(User.email == account["email"])).first():
                session.add(
                    User(
                        full_name=account["full_name"],
                        email=account["email"],
                        password_hash=password_hash.hash(account["password"]),
                        role=account["role"],
                    )
                )
        existing_titles = set(session.exec(select(Listing.title)).all())
        for item in SEED_LISTINGS:
            if item["title"] not in existing_titles:
                session.add(Listing(**item))
        session.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    SQLModel.metadata.create_all(engine)
    migrate_ownership_columns()
    seed_data()
    yield


app = FastAPI(
    title="AgriConnect Togo API",
    description="API du marché agricole, des comptes et des rendez-vous vétérinaires.",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(","),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)


def create_access_token(user: User) -> str:
    expires_at = datetime.now(timezone.utc) + TOKEN_TTL
    return jwt.encode(
        {"sub": str(user.id), "exp": expires_at},
        SECRET_KEY,
        algorithm="HS256",
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Connexion requise.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        raise unauthorized from None
    user = session.get(User, user_id)
    if user is None or not user.is_active:
        raise unauthorized
    return user


def require_roles(*roles: str):
    def role_dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Accès réservé à un autre rôle.")
        return user

    return role_dependency


def user_public(user: User) -> UserPublic:
    return UserPublic(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
    )


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "AgriConnect Togo API"}


@app.post("/api/auth/register", response_model=AuthResponse, status_code=201)
def register(payload: RegisterRequest, session: Session = Depends(get_session)):
    email = payload.email.strip().lower()
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=409, detail="Cette adresse e-mail est déjà utilisée.")
    user = User(
        full_name=payload.full_name.strip(),
        email=email,
        password_hash=password_hash.hash(payload.password),
        role=payload.role,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return AuthResponse(access_token=create_access_token(user), user=user_public(user))


@app.post("/api/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)):
    email = payload.email.strip().lower()
    user = session.exec(select(User).where(User.email == email)).first()
    if user is None or not password_hash.verify(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Adresse e-mail ou mot de passe incorrect.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Ce compte a été désactivé.")
    return AuthResponse(access_token=create_access_token(user), user=user_public(user))


@app.get("/api/auth/me", response_model=UserPublic)
def current_account(user: User = Depends(get_current_user)):
    return user_public(user)


@app.get("/api/listings", response_model=list[Listing])
def list_listings(
    q: str | None = Query(default=None, max_length=100),
    region: str | None = Query(default=None, max_length=60),
    category: str | None = Query(default=None, pattern="^(animals|manure)$"),
    session: Session = Depends(get_session),
):
    statement = select(Listing).where(Listing.status == "active")
    if region:
        statement = statement.where(Listing.region == region)
    if category:
        statement = statement.where(Listing.category == category)
    listings = session.exec(statement).all()
    if q:
        needle = q.casefold()
        listings = [
            item
            for item in listings
            if needle in item.title.casefold()
            or needle in item.description.casefold()
            or needle in item.seller_name.casefold()
        ]
    return listings


@app.post("/api/listings", response_model=Listing, status_code=201)
def create_listing(
    payload: ListingCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles("seller")),
):
    listing = Listing(**payload.model_dump(), seller_id=user.id)
    session.add(listing)
    session.commit()
    session.refresh(listing)
    return listing


@app.post("/api/orders", response_model=Order, status_code=201)
def create_order(
    payload: OrderCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles("buyer")),
):
    listing = session.get(Listing, payload.listing_id)
    if listing is None or listing.status != "active":
        raise HTTPException(status_code=404, detail="Annonce introuvable.")
    if payload.quantity > listing.stock:
        raise HTTPException(status_code=409, detail="Stock insuffisant.")

    total = listing.price_fcfa * payload.quantity
    commission = round(total * 0.05)
    order = Order(
        listing_id=listing.id,
        buyer_id=user.id,
        buyer_name=user.full_name,
        quantity=payload.quantity,
        total_fcfa=total,
        commission_fcfa=commission,
        seller_net_fcfa=total - commission,
    )
    listing.stock -= payload.quantity
    if listing.stock == 0:
        listing.status = "sold"
    session.add(order)
    session.add(listing)
    session.commit()
    session.refresh(order)
    return order


@app.patch("/api/orders/{order_id}/receipt", response_model=Order)
def confirm_receipt(
    order_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    order = session.get(Order, order_id)
    if order is None or (user.role != "admin" and order.buyer_id != user.id):
        raise HTTPException(status_code=404, detail="Commande introuvable.")
    if order.delivery_status == "completed":
        raise HTTPException(status_code=409, detail="La réception est déjà confirmée.")
    order.delivery_status = "completed"
    session.add(order)
    session.commit()
    session.refresh(order)
    return order


@app.get("/api/veterinarians")
def list_veterinarians():
    return [
        {
            "name": "Dr. Akouvi",
            "region": "Plateaux",
            "specialty": "Santé des petits ruminants",
        },
        {
            "name": "Dr. Koffi",
            "region": "Centrale",
            "specialty": "Santé bovine et prévention",
        },
        {
            "name": "Dr. Afi",
            "region": "Maritime",
            "specialty": "Volaille et élevage familial",
        },
    ]


@app.post("/api/appointments", response_model=Appointment, status_code=201)
def create_appointment(
    payload: AppointmentCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles("buyer", "seller", "vet")),
):
    appointment = Appointment(
        **payload.model_dump(mode="json"),
        client_id=user.id,
        client_name=user.full_name,
    )
    session.add(appointment)
    session.commit()
    session.refresh(appointment)
    return appointment


@app.get("/api/admin/summary")
def admin_summary(
    session: Session = Depends(get_session),
    _: User = Depends(require_roles("admin")),
):
    return {
        "users": len(session.exec(select(User)).all()),
        "active_listings": len(
            session.exec(select(Listing).where(Listing.status == "active")).all()
        ),
        "orders": len(session.exec(select(Order)).all()),
        "appointments": len(session.exec(select(Appointment)).all()),
        "commission_fcfa": sum(
            order.commission_fcfa for order in session.exec(select(Order)).all()
        ),
    }


@app.get("/api/admin/users", response_model=list[UserPublic])
def admin_users(
    session: Session = Depends(get_session),
    _: User = Depends(require_roles("admin")),
):
    return session.exec(select(User).order_by(User.id)).all()


@app.patch("/api/admin/users/{user_id}/status", response_model=UserPublic)
def update_user_status(
    user_id: int,
    payload: UserStatusUpdate,
    session: Session = Depends(get_session),
    admin: User = Depends(require_roles("admin")),
):
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    if user.id == admin.id and not payload.is_active:
        raise HTTPException(status_code=409, detail="Vous ne pouvez pas désactiver votre propre compte.")
    if user.role == "admin" and not payload.is_active:
        active_admins = session.exec(
            select(User).where(User.role == "admin", User.is_active.is_(True))
        ).all()
        if len(active_admins) <= 1:
            raise HTTPException(status_code=409, detail="Le dernier administrateur ne peut pas être désactivé.")
    user.is_active = payload.is_active
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@app.get("/api/admin/listings", response_model=list[Listing])
def admin_listings(
    session: Session = Depends(get_session),
    _: User = Depends(require_roles("admin")),
):
    return session.exec(select(Listing).order_by(Listing.id.desc())).all()


@app.patch("/api/admin/listings/{listing_id}/status", response_model=Listing)
def update_listing_status(
    listing_id: int,
    payload: ListingStatusUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_roles("admin")),
):
    listing = session.get(Listing, listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Annonce introuvable.")
    if listing.status == "sold":
        raise HTTPException(status_code=409, detail="Une annonce vendue ne peut pas être modifiée.")
    listing.status = payload.status
    session.add(listing)
    session.commit()
    session.refresh(listing)
    return listing


@app.get("/api/admin/orders", response_model=list[Order])
def admin_orders(
    session: Session = Depends(get_session),
    _: User = Depends(require_roles("admin")),
):
    return session.exec(select(Order).order_by(Order.id.desc())).all()


@app.get("/api/admin/appointments", response_model=list[Appointment])
def admin_appointments(
    session: Session = Depends(get_session),
    _: User = Depends(require_roles("admin")),
):
    return session.exec(select(Appointment).order_by(Appointment.id.desc())).all()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
