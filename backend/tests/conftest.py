import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://care-near-you-2.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api(base_url):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    s.base_url = base_url
    return s


@pytest.fixture(scope="session", autouse=True)
def seed(api, base_url):
    """Run seed once before all tests to guarantee deterministic data."""
    r = api.post(f"{base_url}/api/seed/reset", timeout=60)
    assert r.status_code == 200, f"seed failed: {r.status_code} {r.text}"
    return r.json()


def _login(api, base_url, email, password):
    r = api.post(f"{base_url}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed: {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def patient_auth(api, base_url):
    return _login(api, base_url, "patient@aarogya.in", "Password@123")


@pytest.fixture(scope="session")
def clinic_auth(api, base_url):
    return _login(api, base_url, "clinic@aarogya.in", "Password@123")


@pytest.fixture(scope="session")
def admin_auth(api, base_url):
    return _login(api, base_url, "admin@aarogya.in", "Password@123")


def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
