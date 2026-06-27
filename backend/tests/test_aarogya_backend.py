"""Comprehensive backend tests for Aarogya Aggregator."""
import pytest
import requests
from conftest import auth_headers


# ----- Health / Seed -----
class TestHealth:
    def test_root_ok(self, api, base_url):
        r = api.get(f"{base_url}/api/")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"

    def test_seed_counts(self, seed):
        assert seed["users"] == 4
        assert seed["facilities"] == 11
        assert seed["inspections"] == 5
        assert seed["reviews"] >= 1


# ----- Auth -----
class TestAuth:
    def test_login_patient(self, patient_auth):
        assert patient_auth["access_token"]
        assert patient_auth["user"]["role"] == "patient"
        assert patient_auth["user"]["email"] == "patient@aarogya.in"

    def test_login_clinic(self, clinic_auth):
        assert clinic_auth["user"]["role"] == "clinic_owner"

    def test_login_admin(self, admin_auth):
        assert admin_auth["user"]["role"] == "admin"

    def test_login_wrong_password(self, api, base_url):
        r = api.post(f"{base_url}/api/auth/login", json={"email": "patient@aarogya.in", "password": "wrong"})
        assert r.status_code == 401

    def test_register_new_patient(self, api, base_url):
        import uuid
        email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
        r = api.post(f"{base_url}/api/auth/register", json={
            "name": "TEST New Patient",
            "email": email,
            "password": "Pass@1234",
            "role": "patient",
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["access_token"]
        assert body["user"]["email"] == email.lower()
        assert body["user"]["role"] == "patient"

    def test_me_with_token(self, api, base_url, patient_auth):
        r = api.get(f"{base_url}/api/auth/me", headers=auth_headers(patient_auth["access_token"]))
        assert r.status_code == 200
        assert r.json()["email"] == "patient@aarogya.in"

    def test_me_without_token(self, base_url):
        r = requests.get(f"{base_url}/api/auth/me")
        assert r.status_code == 401


# ----- Facilities nearby -----
BLR_LAT, BLR_LNG = 12.9352, 77.6245


class TestNearby:
    def test_nearby_returns_sorted(self, api, base_url):
        r = api.get(f"{base_url}/api/facilities/nearby",
                    params={"lat": BLR_LAT, "lng": BLR_LNG, "radius_m": 5000})
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 5
        # All within 5km
        for f in data:
            assert f["distance_m"] is not None
            assert f["distance_m"] <= 5000
            assert f["city"] == "Bengaluru"
        # Sorted by distance ascending
        dists = [f["distance_m"] for f in data]
        assert dists == sorted(dists)
        # Fields present
        first = data[0]
        assert "verified" in first
        assert "inspector_ratings" in first
        assert "avg_user_rating" in first

    def test_filter_pharmacy(self, api, base_url):
        r = api.get(f"{base_url}/api/facilities/nearby",
                    params={"lat": BLR_LAT, "lng": BLR_LNG, "radius_m": 5000, "type": "pharmacy"})
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        assert all(f["type"] == "pharmacy" for f in data)

    def test_filter_clinic(self, api, base_url):
        r = api.get(f"{base_url}/api/facilities/nearby",
                    params={"lat": BLR_LAT, "lng": BLR_LNG, "radius_m": 5000, "type": "clinic"})
        assert r.status_code == 200
        assert all(f["type"] == "clinic" for f in r.json())

    def test_filter_student_only(self, api, base_url):
        r = api.get(f"{base_url}/api/facilities/nearby",
                    params={"lat": BLR_LAT, "lng": BLR_LNG, "radius_m": 5000, "student_only": "true"})
        assert r.status_code == 200
        assert all(f["student_friendly"] is True for f in r.json())

    def test_geohash_isolation_mumbai_not_returned(self, api, base_url):
        """Querying Bengaluru should NOT return Mumbai/Delhi facilities."""
        r = api.get(f"{base_url}/api/facilities/nearby",
                    params={"lat": BLR_LAT, "lng": BLR_LNG, "radius_m": 5000})
        cities = {f["city"] for f in r.json()}
        assert "Mumbai" not in cities
        assert "New Delhi" not in cities

    def test_facility_detail(self, api, base_url):
        r = api.get(f"{base_url}/api/facilities/nearby",
                    params={"lat": BLR_LAT, "lng": BLR_LNG, "radius_m": 5000})
        fid = r.json()[0]["id"]
        d = api.get(f"{base_url}/api/facilities/{fid}")
        assert d.status_code == 200
        body = d.json()
        assert body["id"] == fid
        assert "inspector_ratings" in body
        assert "avg_user_rating" in body


# ----- Reviews -----
class TestReviews:
    def test_create_review(self, api, base_url, patient_auth):
        nearby = api.get(f"{base_url}/api/facilities/nearby",
                         params={"lat": BLR_LAT, "lng": BLR_LNG, "radius_m": 5000}).json()
        fid = nearby[0]["id"]
        r = api.post(f"{base_url}/api/reviews",
                     headers=auth_headers(patient_auth["access_token"]),
                     json={"facility_id": fid, "rating": 5, "text": "TEST review"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["rating"] == 5
        assert body["facility_id"] == fid
        # Verify list
        lst = api.get(f"{base_url}/api/reviews/{fid}")
        assert lst.status_code == 200
        assert any(rev["text"] == "TEST review" for rev in lst.json())

    def test_review_requires_auth(self, base_url):
        r = requests.post(f"{base_url}/api/reviews", json={"facility_id": "x", "rating": 5})
        assert r.status_code == 401


# ----- Stock requests -----
class TestStockRequests:
    @pytest.fixture(scope="class")
    def pharmacy_fid(self, api, base_url):
        r = api.get(f"{base_url}/api/facilities/nearby",
                    params={"lat": BLR_LAT, "lng": BLR_LNG, "radius_m": 5000, "type": "pharmacy"})
        return r.json()[0]["id"]

    def test_full_stock_flow(self, api, base_url, patient_auth, clinic_auth, admin_auth, pharmacy_fid):
        # 1. Patient creates request
        cr = api.post(f"{base_url}/api/stock-requests",
                      headers=auth_headers(patient_auth["access_token"]),
                      json={"facility_id": pharmacy_fid, "medicine": "Paracetamol", "notes": "TEST"})
        assert cr.status_code == 200, cr.text
        req = cr.json()
        assert req["status"] == "pending"
        rid = req["id"]

        # 2. Patient cannot list facility requests (403)
        lp = api.get(f"{base_url}/api/stock-requests/facility/{pharmacy_fid}",
                     headers=auth_headers(patient_auth["access_token"]))
        assert lp.status_code == 403

        # 3. Admin can list
        la = api.get(f"{base_url}/api/stock-requests/facility/{pharmacy_fid}",
                     headers=auth_headers(admin_auth["access_token"]))
        assert la.status_code == 200
        assert any(x["id"] == rid for x in la.json())

        # 4. Clinic owner responds
        rp = api.post(f"{base_url}/api/stock-requests/{rid}/respond",
                      headers=auth_headers(clinic_auth["access_token"]),
                      json={"in_stock": True, "price": 25.0, "note": "Available"})
        assert rp.status_code == 200
        body = rp.json()
        assert body["status"] == "answered"
        assert body["in_stock"] is True
        assert body["price"] == 25.0


# ----- Admin -----
class TestAdmin:
    def test_admin_all(self, api, base_url, admin_auth):
        r = api.get(f"{base_url}/api/admin/all", headers=auth_headers(admin_auth["access_token"]))
        assert r.status_code == 200
        assert len(r.json()) == 11

    def test_admin_all_forbidden_for_patient(self, api, base_url, patient_auth):
        r = api.get(f"{base_url}/api/admin/all", headers=auth_headers(patient_auth["access_token"]))
        assert r.status_code == 403

    def test_admin_inspect_toggles_verified(self, api, base_url, admin_auth):
        # Find unverified facility
        all_resp = api.get(f"{base_url}/api/admin/all", headers=auth_headers(admin_auth["access_token"])).json()
        unverified = next((f for f in all_resp if not f["verified"]), None)
        assert unverified is not None
        r = api.post(f"{base_url}/api/admin/inspect",
                     headers=auth_headers(admin_auth["access_token"]),
                     json={"facility_id": unverified["id"], "cleanliness": 5,
                           "price_transparency": 4, "equipment": 5,
                           "notes": "TEST inspect", "grant_verified": True})
        assert r.status_code == 200, r.text
        assert r.json()["verified"] is True
        # Verify GET shows verified=True
        det = api.get(f"{base_url}/api/facilities/{unverified['id']}")
        assert det.json()["verified"] is True
        assert det.json()["inspector_ratings"] is not None


# ----- Facility update by clinic_owner -----
class TestFacilityUpdate:
    def test_clinic_owner_can_update_own(self, api, base_url, clinic_auth):
        # Get clinic owner's facilities
        mine = api.get(f"{base_url}/api/facilities/owner/mine",
                       headers=auth_headers(clinic_auth["access_token"]))
        assert mine.status_code == 200
        facilities = mine.json()
        assert len(facilities) >= 1
        f = facilities[0]
        # Update student_friendly toggle
        body = {
            "name": f["name"], "type": f["type"], "address": f["address"],
            "city": f["city"], "state": f["state"],
            "latitude": f["latitude"], "longitude": f["longitude"],
            "phone": f.get("phone"), "image_url": f.get("image_url"),
            "student_friendly": not f["student_friendly"],
            "student_discount_pct": f.get("student_discount_pct", 0),
            "open_hours": f.get("open_hours", "9:00 AM - 9:00 PM"),
            "services": f.get("services", []),
            "medicines": f.get("medicines", []),
            "owner_user_id": f.get("owner_user_id"),
        }
        r = api.put(f"{base_url}/api/facilities/{f['id']}",
                    headers=auth_headers(clinic_auth["access_token"]),
                    json=body)
        assert r.status_code == 200, r.text
        assert r.json()["student_friendly"] != f["student_friendly"]
