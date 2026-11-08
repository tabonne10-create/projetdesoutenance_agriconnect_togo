from datetime import date

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(pattern="^(buyer|seller|vet)$")


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class UserPublic(BaseModel):
    id: int
    full_name: str
    email: str
    role: str
    is_active: bool


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class UserStatusUpdate(BaseModel):
    is_active: bool


class ListingStatusUpdate(BaseModel):
    status: str = Field(pattern="^(active|suspended)$")


class ListingCreate(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    category: str = Field(pattern="^(animals|manure)$")
    description: str = Field(default="", max_length=1000)
    region: str = Field(min_length=2, max_length=60)
    price_fcfa: int = Field(gt=0)
    stock: int = Field(gt=0)
    seller_name: str = Field(min_length=2, max_length=100)


class OrderCreate(BaseModel):
    listing_id: int = Field(gt=0)
    quantity: int = Field(gt=0)


class AppointmentCreate(BaseModel):
    veterinarian: str = Field(min_length=2, max_length=100)
    region: str = Field(min_length=2, max_length=60)
    subject: str = Field(min_length=3, max_length=300)
    preferred_date: date
