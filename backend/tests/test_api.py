import os
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

test_database = tempfile.TemporaryDirectory()
os.environ["DATABASE_URL"] = f"sqlite:///{Path(test_database.name) / 'test.db'}"

from fastapi.testclient import TestClient

from app.main import app, engine


class AgriConnectApiTests(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        test_database.cleanup()

    def test_market_order_and_appointment_flow(self):
        with TestClient(app) as client:
            buyer_login = client.post(
                "/api/auth/login",
                json={"email": "agriculteur@agriconnect.tg", "password": "Demo123!"},
            )
            self.assertEqual(buyer_login.status_code, 200)
            buyer_headers = {
                "Authorization": f"Bearer {buyer_login.json()['access_token']}"
            }
            seller_login = client.post(
                "/api/auth/login",
                json={"email": "eleveur@agriconnect.tg", "password": "Demo123!"},
            )
            seller_headers = {
                "Authorization": f"Bearer {seller_login.json()['access_token']}"
            }

            listings = client.get("/api/listings")
            self.assertEqual(listings.status_code, 200)
            self.assertGreaterEqual(len(listings.json()), 4)

            anonymous_listing = client.post(
                "/api/listings",
                json={
                    "title": "Lot de compost de test",
                    "category": "manure",
                    "description": "Compost organique",
                    "region": "Kara",
                    "price_fcfa": 10000,
                    "stock": 3,
                    "seller_name": "Ferme Test",
                },
            )
            self.assertEqual(anonymous_listing.status_code, 401)

            listing = client.post(
                "/api/listings",
                json={
                    "title": "Lot de compost de test",
                    "category": "manure",
                    "description": "Compost organique",
                    "region": "Kara",
                    "price_fcfa": 10000,
                    "stock": 3,
                    "seller_name": "Ferme Test",
                },
                headers=seller_headers,
            )
            self.assertEqual(listing.status_code, 201)
            listing_id = listing.json()["id"]

            order = client.post(
                "/api/orders",
                json={"listing_id": listing_id, "quantity": 2},
                headers=buyer_headers,
            )
            self.assertEqual(order.status_code, 201)
            self.assertEqual(order.json()["total_fcfa"], 20000)
            self.assertEqual(order.json()["commission_fcfa"], 1000)
            self.assertEqual(order.json()["seller_net_fcfa"], 19000)
            self.assertEqual(order.json()["payment_status"], "demo_pending")
            anonymous_order = client.post(
                "/api/orders", json={"listing_id": listing_id, "quantity": 1}
            )
            self.assertEqual(anonymous_order.status_code, 401)

            unavailable = client.post(
                "/api/orders",
                json={"listing_id": listing_id, "quantity": 2},
                headers=buyer_headers,
            )
            self.assertEqual(unavailable.status_code, 409)

            receipt = client.patch(
                f"/api/orders/{order.json()['id']}/receipt", headers=buyer_headers
            )
            self.assertEqual(receipt.status_code, 200)
            self.assertEqual(receipt.json()["delivery_status"], "completed")

            appointment = client.post(
                "/api/appointments",
                json={
                    "veterinarian": "Dr. Akouvi",
                    "region": "Plateaux",
                    "subject": "Suivi de mon troupeau",
                    "preferred_date": (date.today() + timedelta(days=1)).isoformat(),
                },
                headers=buyer_headers,
            )
            self.assertEqual(appointment.status_code, 201)
            self.assertEqual(appointment.json()["status"], "requested")

            forbidden_dashboard = client.get("/api/admin/summary", headers=buyer_headers)
            self.assertEqual(forbidden_dashboard.status_code, 403)

            admin_login = client.post(
                "/api/auth/login",
                json={"email": "admin@agriconnect.tg", "password": "Admin123!"},
            )
            self.assertEqual(admin_login.status_code, 200)
            admin_headers = {
                "Authorization": f"Bearer {admin_login.json()['access_token']}"
            }
            dashboard = client.get("/api/admin/summary", headers=admin_headers)
            self.assertEqual(dashboard.status_code, 200)
            self.assertEqual(dashboard.json()["orders"], 1)
            self.assertEqual(dashboard.json()["appointments"], 1)
            self.assertEqual(
                client.patch(
                    f"/api/admin/users/{admin_login.json()['user']['id']}/status",
                    json={"is_active": False},
                    headers=admin_headers,
                ).status_code,
                409,
            )

            listing_status = client.patch(
                f"/api/admin/listings/{listing_id}/status",
                json={"status": "suspended"},
                headers=admin_headers,
            )
            self.assertEqual(listing_status.status_code, 200)
            self.assertEqual(listing_status.json()["status"], "suspended")
            reactivated_listing = client.patch(
                f"/api/admin/listings/{listing_id}/status",
                json={"status": "active"},
                headers=admin_headers,
            )
            self.assertEqual(reactivated_listing.status_code, 200)

            registrations = client.post(
                "/api/auth/register",
                json={
                    "full_name": "Nouveau producteur",
                    "email": "nouveau@example.tg",
                    "password": "StrongPass123",
                    "role": "seller",
                },
            )
            self.assertEqual(registrations.status_code, 201)
            self.assertNotIn("password_hash", registrations.json()["user"])
            registered_user_id = registrations.json()["user"]["id"]
            user_status = client.patch(
                f"/api/admin/users/{registered_user_id}/status",
                json={"is_active": False},
                headers=admin_headers,
            )
            self.assertEqual(user_status.status_code, 200)
            disabled_session = client.get(
                "/api/auth/me",
                headers={
                    "Authorization": f"Bearer {registrations.json()['access_token']}"
                },
            )
            self.assertEqual(disabled_session.status_code, 401)
            rejected_admin_registration = client.post(
                "/api/auth/register",
                json={
                    "full_name": "Administrateur",
                    "email": "intrus@example.tg",
                    "password": "StrongPass123",
                    "role": "admin",
                },
            )
            self.assertEqual(rejected_admin_registration.status_code, 422)


if __name__ == "__main__":
    unittest.main()
