from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    full_name: str = Field(max_length=100)
    email: str = Field(index=True, unique=True, max_length=254)
    password_hash: str = Field(max_length=255)
    role: str = Field(index=True, max_length=20)
    is_active: bool = Field(default=True)


class Listing(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(index=True, max_length=120)
    category: str = Field(index=True, max_length=30)
    description: str = Field(default="", max_length=1000)
    region: str = Field(index=True, max_length=60)
    price_fcfa: int = Field(gt=0)
    stock: int = Field(default=1, ge=0)
    seller_name: str = Field(max_length=100)
    seller_id: int | None = Field(default=None, foreign_key="user.id", index=True)
    status: str = Field(default="active", max_length=20)


class Order(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    listing_id: int = Field(foreign_key="listing.id", index=True)
    buyer_id: int | None = Field(default=None, foreign_key="user.id", index=True)
    buyer_name: str = Field(max_length=100)
    quantity: int = Field(gt=0)
    total_fcfa: int = Field(gt=0)
    commission_fcfa: int = Field(ge=0)
    seller_net_fcfa: int = Field(ge=0)
    payment_status: str = Field(default="demo_pending", max_length=30)
    delivery_status: str = Field(default="awaiting_confirmation", max_length=30)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Appointment(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    client_id: int | None = Field(default=None, foreign_key="user.id", index=True)
    client_name: str = Field(max_length=100)
    veterinarian: str = Field(max_length=100)
    region: str = Field(max_length=60)
    subject: str = Field(max_length=300)
    preferred_date: str = Field(max_length=10)
    status: str = Field(default="requested", max_length=20)
