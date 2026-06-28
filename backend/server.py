"""Aarogya Aggregator - Hyper-local Healthcare Aggregator MVP backend."""
from __future__ import annotations

import asyncio
import math
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Literal, Optional

import httpx
import jwt
from bson import ObjectId  # noqa: F401  (imported for completeness)
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
from fastapi import Depends, FastAPI, HTTPException, APIRouter, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "aarogya_db")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me-aarogya-2026")
JWT_ALG = "HS256"
JWT_TTL_MIN = 60 * 24 * 7  # 1 week

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

app = FastAPI(title="Aarogya Aggregator API")
api = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
Role = Literal["patient", "clinic_owner", "admin"]
FacilityType = Literal["clinic", "pharmacy"]


class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Role = "patient"
    phone: Optional[str] = None
    preferred_language: str = "en"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    name: str
    email: EmailStr
    role: Role
    phone: Optional[str] = None
    preferred_language: str = "en"
    medical_info: Optional[dict] = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class FacilityIn(BaseModel):
    name: str
    type: FacilityType
    address: str
    city: str
    state: str
    latitude: float
    longitude: float
    phone: Optional[str] = None
    image_url: Optional[str] = None
    student_friendly: bool = False
    student_discount_pct: int = 0
    open_hours: str = "9:00 AM - 9:00 PM"
    services: List[str] = []
    medicines: List[str] = []  # stocked medicine list (pharmacies)
    owner_user_id: Optional[str] = None


class FacilityOut(BaseModel):
    id: str
    name: str
    type: FacilityType
    address: str
    city: str
    state: str
    latitude: float
    longitude: float
    phone: Optional[str] = None
    image_url: Optional[str] = None
    student_friendly: bool = False
    student_discount_pct: int = 0
    verified: bool = False
    open_hours: str = "9:00 AM - 9:00 PM"
    services: List[str] = []
    medicines: List[str] = []
    avg_user_rating: float = 0.0
    user_review_count: int = 0
    inspector_ratings: Optional[dict] = None  # {cleanliness, price_transparency, equipment, overall, inspected_at, inspector_id}
    geohash: Optional[str] = None
    distance_m: Optional[float] = None
    owner_user_id: Optional[str] = None


class InspectionIn(BaseModel):
    facility_id: str
    cleanliness: int = Field(ge=1, le=5)
    price_transparency: int = Field(ge=1, le=5)
    equipment: int = Field(ge=1, le=5)
    notes: Optional[str] = None
    report_image_base64: Optional[str] = None  # uploaded inspection report (base64)
    grant_verified: bool = True


class ReviewIn(BaseModel):
    facility_id: str
    rating: int = Field(ge=1, le=5)
    text: Optional[str] = None


class StockRequestIn(BaseModel):
    facility_id: str
    medicine: str
    notes: Optional[str] = None


class StockRequestRespond(BaseModel):
    in_stock: bool
    price: Optional[float] = None
    note: Optional[str] = None


# ---------------------------------------------------------------------------
# Geohash + Haversine helpers (no external deps)
# ---------------------------------------------------------------------------
_GH = "0123456789bcdefghjkmnpqrstuvwxyz"


def geohash_encode(lat: float, lon: float, precision: int = 9) -> str:
    lat_lo, lat_hi = -90.0, 90.0
    lon_lo, lon_hi = -180.0, 180.0
    bit, ch, even = 0, 0, True
    out = []
    while len(out) < precision:
        if even:
            mid = (lon_lo + lon_hi) / 2
            if lon >= mid:
                ch |= 1 << (4 - bit)
                lon_lo = mid
            else:
                lon_hi = mid
        else:
            mid = (lat_lo + lat_hi) / 2
            if lat >= mid:
                ch |= 1 << (4 - bit)
                lat_lo = mid
            else:
                lat_hi = mid
        even = not even
        if bit < 4:
            bit += 1
        else:
            out.append(_GH[ch])
            bit, ch = 0, 0
    return "".join(out)


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def _hash(p: str) -> str:
    return pwd.hash(p)


def _verify(p: str, h: str) -> bool:
    try:
        return pwd.verify(p, h)
    except Exception:
        return False


def _make_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=JWT_TTL_MIN),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(token: Optional[str] = Depends(oauth2)) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        uid = payload.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_role(*roles: str):
    async def _dep(user=Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient role")
        return user
    return _dep


def _user_out(u: dict) -> dict:
    return {
        "id": u["id"],
        "name": u["name"],
        "email": u["email"],
        "role": u["role"],
        "phone": u.get("phone"),
        "preferred_language": u.get("preferred_language", "en"),
        "medical_info": u.get("medical_info"),
    }


# ---------------------------------------------------------------------------
# Routes - Auth
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"app": "Aarogya Aggregator", "status": "ok"}


@api.post("/auth/register", response_model=TokenOut)
async def register(body: RegisterIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    # Admin role can only be assigned via seeding — not public signup
    role = body.role if body.role in ("patient", "clinic_owner") else "patient"
    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "name": body.name,
        "email": body.email.lower(),
        "password_hash": _hash(body.password),
        "role": role,
        "phone": body.phone,
        "preferred_language": body.preferred_language,
        "medical_info": {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    return {"access_token": _make_token(uid, role), "token_type": "bearer", "user": _user_out(doc)}


@api.post("/auth/login", response_model=TokenOut)
async def login(body: LoginIn):
    u = await db.users.find_one({"email": body.email.lower()})
    if not u or not _verify(body.password, u["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"access_token": _make_token(u["id"], u["role"]), "token_type": "bearer", "user": _user_out(u)}


@api.get("/auth/me", response_model=UserOut)
async def me(user=Depends(get_current_user)):
    return _user_out(user)


class MedicalInfo(BaseModel):
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    chronic_conditions: Optional[str] = None
    emergency_contact: Optional[str] = None


@api.put("/auth/me/medical", response_model=UserOut)
async def update_medical(body: MedicalInfo, user=Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"medical_info": body.model_dump()}})
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return _user_out(u)


# ---------------------------------------------------------------------------
# Routes - Facilities
# ---------------------------------------------------------------------------
async def _facility_doc_to_out(f: dict, user_lat: Optional[float] = None, user_lon: Optional[float] = None) -> dict:
    # Compute aggregated review info
    reviews_cursor = db.reviews.find({"facility_id": f["id"]}, {"_id": 0})
    reviews = await reviews_cursor.to_list(length=1000)
    if reviews:
        avg = sum(r["rating"] for r in reviews) / len(reviews)
    else:
        avg = 0.0
    inspector = await db.inspections.find_one(
        {"facility_id": f["id"]}, {"_id": 0}, sort=[("created_at", -1)]
    )
    ir = None
    if inspector:
        ir = {
            "cleanliness": inspector["cleanliness"],
            "price_transparency": inspector["price_transparency"],
            "equipment": inspector["equipment"],
            "overall": round(
                (inspector["cleanliness"] + inspector["price_transparency"] + inspector["equipment"]) / 3, 1
            ),
            "inspected_at": inspector.get("created_at"),
            "notes": inspector.get("notes"),
        }
    dist = None
    if user_lat is not None and user_lon is not None:
        dist = haversine_m(user_lat, user_lon, f["latitude"], f["longitude"])
    return {
        "id": f["id"],
        "name": f["name"],
        "type": f["type"],
        "address": f["address"],
        "city": f["city"],
        "state": f["state"],
        "latitude": f["latitude"],
        "longitude": f["longitude"],
        "phone": f.get("phone"),
        "image_url": f.get("image_url"),
        "student_friendly": f.get("student_friendly", False),
        "student_discount_pct": f.get("student_discount_pct", 0),
        "verified": f.get("verified", False),
        "open_hours": f.get("open_hours", "9:00 AM - 9:00 PM"),
        "services": f.get("services", []),
        "medicines": f.get("medicines", []),
        "avg_user_rating": round(avg, 1),
        "user_review_count": len(reviews),
        "inspector_ratings": ir,
        "geohash": f.get("geohash"),
        "distance_m": dist,
        "owner_user_id": f.get("owner_user_id"),
    }


@api.get("/facilities/nearby", response_model=List[FacilityOut])
async def nearby(
    lat: float = Query(...),
    lng: float = Query(...),
    radius_m: int = Query(2000, ge=100, le=20000),
    type: Optional[FacilityType] = None,
    student_only: bool = False,
    verified_only: bool = False,
):
    # Geohash prefix prefilter for speed (5 chars ≈ ±2.4km)
    user_gh = geohash_encode(lat, lng, 9)
    prefix_len = 5 if radius_m <= 5000 else 4
    prefix = user_gh[:prefix_len]
    q: dict = {}
    if type:
        q["type"] = type
    if student_only:
        q["student_friendly"] = True
    if verified_only:
        q["verified"] = True
    # Allow neighboring prefixes too — do a broader scan by removing one char
    q["geohash"] = {"$regex": f"^{user_gh[:max(1, prefix_len - 1)]}"}
    docs = await db.facilities.find(q, {"_id": 0}).to_list(length=500)
    results = []
    for f in docs:
        out = await _facility_doc_to_out(f, lat, lng)
        if out["distance_m"] is not None and out["distance_m"] <= radius_m:
            results.append(out)
    results.sort(key=lambda x: x["distance_m"] or 0)
    return results


OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
]

GOOGLE_PLACES_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "").strip()
GOOGLE_PLACES_URL = "https://places.googleapis.com/v1/places:searchNearby"
GOOGLE_TYPES_PHARMACY = ["pharmacy", "drugstore"]
GOOGLE_TYPES_CLINIC = ["doctor", "hospital", "medical_lab", "dental_clinic", "physiotherapist"]
GOOGLE_FIELD_MASK = (
    "places.id,places.displayName,places.location,places.formattedAddress,"
    "places.nationalPhoneNumber,places.regularOpeningHours.weekdayDescriptions,"
    "places.types,places.primaryType,places.businessStatus"
)


def _osm_tag_to_type(tags: dict) -> Optional[FacilityType]:
    amenity = (tags.get("amenity") or "").lower()
    healthcare = (tags.get("healthcare") or "").lower()
    shop = (tags.get("shop") or "").lower()
    if amenity == "pharmacy" or healthcare == "pharmacy" or shop == "chemist":
        return "pharmacy"
    if amenity in ("clinic", "doctors", "hospital") or healthcare in ("clinic", "doctor", "centre", "hospital"):
        return "clinic"
    return None


def _osm_address(tags: dict) -> str:
    parts = []
    for k in ("addr:housenumber", "addr:street", "addr:suburb", "addr:city"):
        v = tags.get(k)
        if v:
            parts.append(v)
    return ", ".join(parts) or tags.get("addr:full") or "Address not listed"


async def _overpass_query(lat: float, lng: float, radius_m: int) -> list[dict]:
    radius_m = min(max(radius_m, 100), 10000)
    q = (
        f"[out:json][timeout:20];"
        f"("
        f"  node['amenity'~'pharmacy|clinic|doctors|hospital'](around:{radius_m},{lat},{lng});"
        f"  node['healthcare'~'pharmacy|clinic|doctor|centre|hospital'](around:{radius_m},{lat},{lng});"
        f"  node['shop'='chemist'](around:{radius_m},{lat},{lng});"
        f"  way['amenity'~'pharmacy|clinic|doctors|hospital'](around:{radius_m},{lat},{lng});"
        f"  way['healthcare'~'pharmacy|clinic|doctor|centre|hospital'](around:{radius_m},{lat},{lng});"
        f");"
        f"out center tags;"
    )
    async with httpx.AsyncClient(timeout=25, headers={"User-Agent": "AarogyaAggregator/1.0"}) as cli:
        for url in OVERPASS_URLS:
            try:
                r = await cli.post(url, data={"data": q})
                if r.status_code == 200:
                    return r.json().get("elements", []) or []
            except Exception:
                continue
    return []


async def _google_places_nearby(lat: float, lng: float, radius_m: int, ftype: Optional[str]) -> list[dict]:
    """Query Google Places API (New) - searchNearby. Returns list of normalised facility dicts.
    Returns [] if key missing or call fails (so caller can fall back to OSM)."""
    if not GOOGLE_PLACES_KEY:
        return []
    if ftype == "pharmacy":
        included = GOOGLE_TYPES_PHARMACY
    elif ftype == "clinic":
        included = GOOGLE_TYPES_CLINIC
    else:
        included = GOOGLE_TYPES_PHARMACY + GOOGLE_TYPES_CLINIC
    body = {
        "includedTypes": included,
        "maxResultCount": 20,
        "locationRestriction": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": float(min(radius_m, 50000)),
            }
        },
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
        "X-Goog-FieldMask": GOOGLE_FIELD_MASK,
    }
    try:
        async with httpx.AsyncClient(timeout=15) as cli:
            r = await cli.post(GOOGLE_PLACES_URL, headers=headers, json=body)
            if r.status_code != 200:
                return []
            data = r.json() or {}
    except Exception:
        return []
    out: list[dict] = []
    for p in data.get("places", []) or []:
        ptypes = set(p.get("types") or [])
        primary = (p.get("primaryType") or "").lower()
        if primary in {"pharmacy", "drugstore"} or ptypes & {"pharmacy", "drugstore"}:
            mapped = "pharmacy"
        elif primary in {"doctor", "hospital", "medical_lab", "dental_clinic", "physiotherapist"} or ptypes & {
            "doctor", "hospital", "medical_lab", "dental_clinic", "physiotherapist",
        }:
            mapped = "clinic"
        else:
            continue
        if ftype and mapped != ftype:
            continue
        loc = p.get("location") or {}
        flat, flon = loc.get("latitude"), loc.get("longitude")
        if flat is None or flon is None:
            continue
        name = (p.get("displayName") or {}).get("text") or p.get("formattedAddress")
        if not name:
            continue
        pid = p.get("id") or ""
        out.append({
            "id": f"gp-{pid}",
            "name": name,
            "type": mapped,
            "address": p.get("formattedAddress") or "Address not listed",
            "city": "",
            "state": "",
            "latitude": flat,
            "longitude": flon,
            "phone": p.get("nationalPhoneNumber"),
            "image_url": None,
            "student_friendly": False,
            "student_discount_pct": 0,
            "verified": False,
            "open_hours": (
                ", ".join((p.get("regularOpeningHours") or {}).get("weekdayDescriptions") or [])[:120]
                or "Hours not listed"
            ),
            "services": [],
            "medicines": [],
            "geohash": geohash_encode(flat, flon, 9),
            "owner_user_id": None,
            "source": "google",
            "google_place_id": pid,
            "business_status": p.get("businessStatus"),
            "discovered_at": datetime.now(timezone.utc).isoformat(),
        })
    return out


@api.get("/facilities/discover", response_model=List[FacilityOut])
async def discover(
    lat: float = Query(...),
    lng: float = Query(...),
    radius_m: int = Query(2000, ge=100, le=10000),
    type: Optional[FacilityType] = None,
):
    """Discover real-world clinics/pharmacies near a location.
    Order of providers: Google Places (New) → OpenStreetMap Overpass fallback.
    Cached for 15 min by lat/lng bucket so repeated filter taps don't burn quota."""
    # 15-min cache by (lat bucket, lng bucket, type, radius bucket)
    bucket_size = 0.005  # ~500 m
    lat_b = round(lat / bucket_size) * bucket_size
    lng_b = round(lng / bucket_size) * bucket_size
    rad_b = round(radius_m / 1000)
    cache_key = f"{lat_b:.4f}_{lng_b:.4f}_{type or 'all'}_{rad_b}"
    cached = await db.discover_cache.find_one({"key": cache_key}, {"_id": 0})
    now = datetime.now(timezone.utc)
    if cached:
        ts = datetime.fromisoformat(cached["cached_at"])
        if (now - ts).total_seconds() < 900:  # 15 min
            facilities = cached.get("facilities") or []
            results = [await _facility_doc_to_out(f, lat, lng) for f in facilities]
            results = [r for r in results if r["distance_m"] is not None and r["distance_m"] <= radius_m]
            results.sort(key=lambda x: x["distance_m"] or 0)
            return results

    # Primary: Google Places
    docs = await _google_places_nearby(lat, lng, radius_m, type)
    used = "google"

    # Fallback: OSM Overpass (only if Google returns nothing)
    if not docs:
        used = "osm"
        elements = await _overpass_query(lat, lng, radius_m)
        for el in elements:
            tags = el.get("tags") or {}
            ftype = _osm_tag_to_type(tags)
            if not ftype:
                continue
            if type and ftype != type:
                continue
            name = tags.get("name") or tags.get("brand") or tags.get("operator")
            if not name:
                continue
            if "lat" in el and "lon" in el:
                flat, flon = el["lat"], el["lon"]
            elif "center" in el:
                flat, flon = el["center"]["lat"], el["center"]["lon"]
            else:
                continue
            osm_id = f"osm-{el.get('type', 'n')}-{el.get('id')}"
            docs.append({
                "id": osm_id,
                "name": name,
                "type": ftype,
                "address": _osm_address(tags),
                "city": tags.get("addr:city") or "",
                "state": tags.get("addr:state") or "",
                "latitude": flat,
                "longitude": flon,
                "phone": tags.get("phone") or tags.get("contact:phone"),
                "image_url": None,
                "student_friendly": False,
                "student_discount_pct": 0,
                "verified": False,
                "open_hours": tags.get("opening_hours") or "Hours not listed",
                "services": [],
                "medicines": [],
                "geohash": geohash_encode(flat, flon, 9),
                "owner_user_id": None,
                "source": "osm",
                "osm_tags": tags,
                "discovered_at": now.isoformat(),
            })

    # Cache facility docs by id (so detail page works) and also store cache key
    for d in docs:
        await db.osm_facilities.update_one({"id": d["id"]}, {"$set": d}, upsert=True)
    await db.discover_cache.update_one(
        {"key": cache_key},
        {"$set": {"key": cache_key, "facilities": docs, "provider": used, "cached_at": now.isoformat()}},
        upsert=True,
    )

    # De-dup with already-verified DB facilities by name + proximity
    results: list[dict] = []
    for d in docs:
        existing = await db.facilities.find_one(
            {"name": d["name"], "latitude": {"$gte": d["latitude"] - 0.0005, "$lte": d["latitude"] + 0.0005}},
            {"_id": 0, "id": 1},
        )
        if existing:
            continue
        results.append(await _facility_doc_to_out(d, lat, lng))
    results = [r for r in results if r["distance_m"] is not None and r["distance_m"] <= radius_m]
    results.sort(key=lambda x: x["distance_m"] or 0)
    return results


@api.get("/facilities/{fid}", response_model=FacilityOut)
async def get_facility(fid: str, lat: Optional[float] = None, lng: Optional[float] = None):
    f = await db.facilities.find_one({"id": fid}, {"_id": 0})
    if not f:
        # Could be a discovered OSM facility (cached)
        f = await db.osm_facilities.find_one({"id": fid}, {"_id": 0})
        if not f:
            raise HTTPException(404, "Facility not found")
    return await _facility_doc_to_out(f, lat, lng)


@api.post("/facilities", response_model=FacilityOut)
async def create_facility(body: FacilityIn, user=Depends(require_role("clinic_owner", "admin"))):
    fid = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update(
        {
            "id": fid,
            "verified": False,
            "geohash": geohash_encode(body.latitude, body.longitude, 9),
            "owner_user_id": body.owner_user_id or user["id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    await db.facilities.insert_one(doc)
    doc.pop("_id", None)
    return await _facility_doc_to_out(doc)


@api.put("/facilities/{fid}", response_model=FacilityOut)
async def update_facility(fid: str, body: FacilityIn, user=Depends(require_role("clinic_owner", "admin"))):
    f = await db.facilities.find_one({"id": fid}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Facility not found")
    if user["role"] == "clinic_owner" and f.get("owner_user_id") != user["id"]:
        raise HTTPException(403, "Not your facility")
    update = body.model_dump()
    update["geohash"] = geohash_encode(body.latitude, body.longitude, 9)
    await db.facilities.update_one({"id": fid}, {"$set": update})
    f = await db.facilities.find_one({"id": fid}, {"_id": 0})
    return await _facility_doc_to_out(f)


@api.get("/facilities/owner/mine", response_model=List[FacilityOut])
async def my_facilities(user=Depends(require_role("clinic_owner", "admin"))):
    docs = await db.facilities.find({"owner_user_id": user["id"]}, {"_id": 0}).to_list(length=200)
    return [await _facility_doc_to_out(f) for f in docs]


# ---------------------------------------------------------------------------
# Routes - Inspections / Verification (Admin only)
# ---------------------------------------------------------------------------
@api.get("/admin/pending", response_model=List[FacilityOut])
async def pending(user=Depends(require_role("admin"))):
    docs = await db.facilities.find({"verified": False}, {"_id": 0}).to_list(length=500)
    return [await _facility_doc_to_out(f) for f in docs]


@api.get("/admin/all", response_model=List[FacilityOut])
async def all_facilities(user=Depends(require_role("admin"))):
    docs = await db.facilities.find({}, {"_id": 0}).to_list(length=1000)
    return [await _facility_doc_to_out(f) for f in docs]


@api.post("/admin/inspect")
async def inspect(body: InspectionIn, user=Depends(require_role("admin"))):
    f = await db.facilities.find_one({"id": body.facility_id})
    if not f:
        raise HTTPException(404, "Facility not found")
    doc = body.model_dump()
    doc.update(
        {
            "id": str(uuid.uuid4()),
            "inspector_id": user["id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    await db.inspections.insert_one(doc)
    if body.grant_verified:
        await db.facilities.update_one({"id": body.facility_id}, {"$set": {"verified": True}})
    else:
        await db.facilities.update_one({"id": body.facility_id}, {"$set": {"verified": False}})
    doc.pop("_id", None)
    return {"ok": True, "facility_id": body.facility_id, "verified": body.grant_verified}


# ---------------------------------------------------------------------------
# Routes - Reviews (patients)
# ---------------------------------------------------------------------------
@api.post("/reviews")
async def post_review(body: ReviewIn, user=Depends(get_current_user)):
    rid = str(uuid.uuid4())
    doc = {
        "id": rid,
        "facility_id": body.facility_id,
        "user_id": user["id"],
        "user_name": user["name"],
        "rating": body.rating,
        "text": body.text or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reviews.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/reviews/{fid}")
async def list_reviews(fid: str):
    docs = await db.reviews.find({"facility_id": fid}, {"_id": 0}).sort("created_at", -1).to_list(length=200)
    return docs


# ---------------------------------------------------------------------------
# Routes - Stock Check requests
# ---------------------------------------------------------------------------
@api.post("/stock-requests")
async def post_stock_request(body: StockRequestIn, user=Depends(get_current_user)):
    rid = str(uuid.uuid4())
    doc = {
        "id": rid,
        "facility_id": body.facility_id,
        "medicine": body.medicine,
        "notes": body.notes or "",
        "patient_id": user["id"],
        "patient_name": user["name"],
        "patient_phone": user.get("phone"),
        "status": "pending",  # pending | answered
        "in_stock": None,
        "price": None,
        "response_note": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "responded_at": None,
    }
    await db.stock_requests.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/stock-requests/facility/{fid}")
async def list_facility_requests(fid: str, user=Depends(require_role("clinic_owner", "admin"))):
    docs = await db.stock_requests.find({"facility_id": fid}, {"_id": 0}).sort("created_at", -1).to_list(length=200)
    return docs


@api.get("/stock-requests/mine")
async def list_my_requests(user=Depends(get_current_user)):
    docs = await db.stock_requests.find({"patient_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(
        length=200
    )
    return docs


@api.post("/stock-requests/{rid}/respond")
async def respond_stock_request(rid: str, body: StockRequestRespond, user=Depends(require_role("clinic_owner", "admin"))):
    r = await db.stock_requests.find_one({"id": rid})
    if not r:
        raise HTTPException(404, "Not found")
    update = {
        "status": "answered",
        "in_stock": body.in_stock,
        "price": body.price,
        "response_note": body.note,
        "responded_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.stock_requests.update_one({"id": rid}, {"$set": update})
    r.update(update)
    r.pop("_id", None)
    return r


# ---------------------------------------------------------------------------
# Chat triage (Claude Haiku 4.5)
# ---------------------------------------------------------------------------
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "").strip()
LLM_PROVIDER = "anthropic"
LLM_MODEL = "claude-haiku-4-5-20251001"

LANG_LABELS = {
    "en": "English", "hi": "Hindi (हिन्दी)", "ta": "Tamil (தமிழ்)",
    "te": "Telugu (తెలుగు)", "bn": "Bengali (বাংলা)", "mr": "Marathi (मराठी)",
    "gu": "Gujarati (ગુજરાતી)", "kn": "Kannada (ಕನ್ನಡ)", "ml": "Malayalam (മലയാളം)",
    "pa": "Punjabi (ਪੰਜਾਬੀ)", "ur": "Urdu (اردو)", "or": "Odia (ଓଡ଼ିଆ)",
    "as": "Assamese (অসমীয়া)",
}

# Red-flag keywords across major Indian languages
RED_FLAG_KEYWORDS = [
    # English
    "chest pain", "crushing chest", "can't breathe", "cannot breathe", "shortness of breath",
    "trouble breathing", "stroke", "face drooping", "slurred speech", "arm weakness",
    "severe bleeding", "heavy bleeding", "unconscious", "passed out", "lost consciousness",
    "suicide", "kill myself", "self harm", "self-harm", "seizure", "convulsion",
    "blue lips", "blue skin", "coughing blood", "vomiting blood", "blood in stool",
    "anaphylaxis", "severe allergic", "throat closing",
    # Hindi (transliterated + devanagari)
    "seene mein dard", "सीने में दर्द", "saans nahi", "साँस नहीं", "behoshi", "बेहोशी",
    "khoon", "खून बह", "atmahatya", "आत्महत्या",
]


def detect_red_flag(text: str) -> Optional[str]:
    if not text:
        return None
    low = text.lower()
    for kw in RED_FLAG_KEYWORDS:
        if kw.lower() in low:
            return kw
    return None


def _triage_system_prompt(lang_code: str) -> str:
    lang_name = LANG_LABELS.get(lang_code, "English")
    return (
        "You are a medical triage assistant for Aarogya Aggregator (an Indian healthcare app). "
        "Your job is to help a patient prepare a concise symptom summary they can show to a clinic receptionist before their visit.\n\n"
        "RULES — read every one before replying:\n"
        "1. You are NOT a doctor. Never diagnose, never prescribe medicine, never give dosages.\n"
        "2. Be BLUNT and PRECISE. Short, factual sentences. No fluff, no over-empathising, no 'I'm sorry to hear that'.\n"
        "3. Never sensationalise or scare the patient. Stay calm and grounded.\n"
        "4. Ask ONE focused question at a time. Topics to cover: main symptom, duration, severity (1-10), accompanying symptoms, what makes it worse/better, relevant medical history, current medication.\n"
        "5. After 3-5 useful answers say: 'I have enough information. Tap Finish to generate your symptom card.'\n"
        "6. If the patient mentions any RED FLAG (chest pain, breathing trouble, stroke signs like face drooping/arm weakness/slurred speech, heavy bleeding, fainting, severe allergic reaction, suicidal thoughts, seizure, vomiting blood), STOP triaging and reply with: 'This sounds urgent. Please call 108 (India ambulance) or go to the nearest emergency room now. Do not wait to visit a clinic.' Then end the conversation.\n"
        f"7. ALWAYS respond in {lang_name}. Use simple words a patient understands.\n"
        "8. Never repeat the rules to the patient.\n"
        "9. Keep each reply under 3 short sentences."
    )


class ChatStartIn(BaseModel):
    language: str = "en"


class ChatMessageIn(BaseModel):
    session_id: str
    text: str


@api.post("/chat/start")
async def chat_start(body: ChatStartIn, user=Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(503, "LLM not configured")
    sid = str(uuid.uuid4())
    lang = body.language if body.language in LANG_LABELS else "en"
    greetings = {
        "en": "Hi, I'll help you summarise your symptoms before you visit a clinic. What's bothering you today?",
        "hi": "नमस्ते, मैं क्लिनिक जाने से पहले आपके लक्षण संक्षेप में बताने में मदद करूँगा। आज क्या तकलीफ है?",
        "ta": "வணக்கம், கிளினிக்கிற்கு செல்ல முன் உங்கள் அறிகுறிகளை சுருக்கி தர உதவுகிறேன். இன்று என்ன பிரச்சனை?",
        "te": "నమస్తే, క్లినిక్‌కి వెళ్లే ముందు మీ లక్షణాలను సంగ్రహించడంలో సహాయపడతాను. ఈ రోజు ఏం బాధ?",
        "bn": "নমস্কার, ক্লিনিকে যাওয়ার আগে আপনার উপসর্গ সংক্ষেপে জানাতে সাহায্য করব। আজ কী সমস্যা?",
        "mr": "नमस्कार, क्लिनिकला जाण्यापूर्वी तुमची लक्षणे थोडक्यात नोंदवायला मदत करतो. आज काय त्रास आहे?",
        "gu": "નમસ્તે, ક્લિનિક જતા પહેલા તમારા લક્ષણો સંક્ષેપમાં લખવામાં મદદ કરીશ. આજે શું તકલીફ છે?",
        "kn": "ನಮಸ್ಕಾರ, ಕ್ಲಿನಿಕ್‌ಗೆ ಹೋಗುವ ಮೊದಲು ನಿಮ್ಮ ಲಕ್ಷಣಗಳನ್ನು ಸಂಕ್ಷೇಪಿಸಲು ಸಹಾಯ ಮಾಡುತ್ತೇನೆ. ಇಂದು ಏನು ತೊಂದರೆ?",
        "ml": "നമസ്കാരം, ക്ലിനിക്കിൽ പോകുന്നതിന് മുമ്പ് നിങ്ങളുടെ ലക്ഷണങ്ങൾ സംഗ്രഹിക്കാൻ സഹായിക്കാം. ഇന്ന് എന്താണ് പ്രശ്നം?",
        "pa": "ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਕਲੀਨਿਕ ਜਾਣ ਤੋਂ ਪਹਿਲਾਂ ਤੁਹਾਡੇ ਲੱਛਣਾਂ ਨੂੰ ਸੰਖੇਪ ਕਰਨ ਵਿੱਚ ਮਦਦ ਕਰਾਂਗਾ। ਅੱਜ ਕੀ ਪਰੇਸ਼ਾਨੀ ਹੈ?",
        "ur": "السلام علیکم، کلینک جانے سے پہلے آپ کی علامات کا خلاصہ بنانے میں مدد کروں گا۔ آج کیا تکلیف ہے؟",
        "or": "ନମସ୍କାର, କ୍ଲିନିକ୍ ଯିବା ପୂର୍ବରୁ ଆପଣଙ୍କ ଲକ୍ଷଣ ସଂକ୍ଷେପ କରିବାରେ ସାହାଯ୍ୟ କରିବି। ଆଜି କଣ ସମସ୍ୟା?",
        "as": "নমস্কাৰ, ক্লিনিকলৈ যোৱাৰ আগতে আপোনাৰ লক্ষণসমূহ সংক্ষেপ কৰাত সহায় কৰিম। আজি কি অসুবিধা?",
    }
    greet = greetings.get(lang, greetings["en"])
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": sid,
        "user_id": user["id"],
        "language": lang,
        "messages": [{"role": "assistant", "text": greet, "ts": now}],
        "red_flag": None,
        "finalized": False,
        "card_id": None,
        "created_at": now,
    }
    await db.chat_sessions.insert_one(doc)
    return {"session_id": sid, "language": lang, "greeting": greet}


def _build_chat(session_id: str, lang: str, history: list[dict]) -> LlmChat:
    """Create a fresh LlmChat with persona + replayed history."""
    initial_messages = [{"role": "system", "content": _triage_system_prompt(lang)}]
    for m in history:
        initial_messages.append(
            {"role": "user" if m["role"] == "user" else "assistant", "content": m["text"]}
        )
    return LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=_triage_system_prompt(lang),
        initial_messages=initial_messages,
    ).with_model(LLM_PROVIDER, LLM_MODEL)


@api.post("/chat/message")
async def chat_message(body: ChatMessageIn, user=Depends(get_current_user)):
    sess = await db.chat_sessions.find_one({"id": body.session_id, "user_id": user["id"]}, {"_id": 0})
    if not sess:
        raise HTTPException(404, "Chat session not found")
    if sess.get("finalized"):
        raise HTTPException(400, "Chat already finalized")

    # Red-flag detection on user input
    user_red = detect_red_flag(body.text)
    now = datetime.now(timezone.utc).isoformat()
    history = sess.get("messages") or []
    history.append({"role": "user", "text": body.text, "ts": now})

    # Get AI reply
    try:
        chat = _build_chat(body.session_id, sess.get("language", "en"), history[:-1])
        reply = await chat.send_message(UserMessage(text=body.text))
        reply_text = reply if isinstance(reply, str) else getattr(reply, "content", str(reply))
    except Exception as e:
        reply_text = "Sorry, I couldn't process that just now. Please try again."

    reply_red = detect_red_flag(reply_text)
    red_flag = user_red or reply_red

    history.append({"role": "assistant", "text": reply_text, "ts": datetime.now(timezone.utc).isoformat()})
    await db.chat_sessions.update_one(
        {"id": body.session_id},
        {"$set": {"messages": history, "red_flag": red_flag}},
    )
    return {"reply": reply_text, "red_flag": red_flag, "ready_to_finalize": len(history) >= 7}


@api.post("/chat/finalize")
async def chat_finalize(body: ChatStartIn, user=Depends(get_current_user)):
    # body holds session_id under language field by mistake — let's accept a dedicated payload
    raise HTTPException(400, "Use POST /api/chat/{session_id}/finalize")


class FinalizeIn(BaseModel):
    session_id: str


@api.post("/chat/finalize-card")
async def finalize_card(body: FinalizeIn, user=Depends(get_current_user)):
    sess = await db.chat_sessions.find_one({"id": body.session_id, "user_id": user["id"]}, {"_id": 0})
    if not sess:
        raise HTTPException(404, "Chat session not found")
    history = sess.get("messages") or []
    if len([m for m in history if m["role"] == "user"]) < 1:
        raise HTTPException(400, "Tell me something first before I can summarise.")

    lang = sess.get("language", "en")
    lang_name = LANG_LABELS.get(lang, "English")
    summarize_prompt = (
        "Based on the conversation so far, produce a SHORT factual symptom card "
        f"the patient can show to a clinic receptionist. The patient_note must be in {lang_name}. "
        "Output ONLY valid JSON (no markdown, no commentary) with EXACTLY these fields:\n"
        '{\n'
        '  "primary_symptom": "<one short phrase>",\n'
        '  "duration": "<e.g. 2 days, since this morning, 1 week>",\n'
        '  "severity_1_to_10": <integer 1-10>,\n'
        '  "related_symptoms": ["<short phrase>", "..."],\n'
        '  "urgency": "<low | medium | high>",\n'
        '  "suggested_specialty": "<e.g. General Physician, ENT, Dermatology>",\n'
        f'  "patient_note": "<2 short factual sentences in {lang_name}, suitable to show reception>",\n'
        '  "red_flag_warnings": ["<empty unless serious>"]\n'
        '}'
    )

    try:
        chat = _build_chat(body.session_id, lang, history)
        raw = await chat.send_message(UserMessage(text=summarize_prompt))
        raw_text = raw if isinstance(raw, str) else getattr(raw, "content", str(raw))
    except Exception as e:
        raise HTTPException(502, f"LLM call failed: {e}")

    # Extract JSON (strip code fences if present)
    import json, re
    cleaned = raw_text.strip()
    m = re.search(r"\{[\s\S]*\}", cleaned)
    if not m:
        raise HTTPException(502, "Could not parse summary")
    try:
        parsed = json.loads(m.group(0))
    except Exception:
        raise HTTPException(502, "Invalid summary JSON")

    cid = str(uuid.uuid4())
    card = {
        "id": cid,
        "user_id": user["id"],
        "patient_name": user["name"],
        "patient_phone": user.get("phone"),
        "session_id": body.session_id,
        "language": lang,
        "primary_symptom": str(parsed.get("primary_symptom") or "")[:120],
        "duration": str(parsed.get("duration") or "")[:60],
        "severity": int(parsed.get("severity_1_to_10") or 0),
        "related_symptoms": [str(x)[:80] for x in (parsed.get("related_symptoms") or [])][:8],
        "urgency": str(parsed.get("urgency") or "low").lower(),
        "suggested_specialty": str(parsed.get("suggested_specialty") or "General Physician")[:80],
        "patient_note": str(parsed.get("patient_note") or "")[:600],
        "red_flag_warnings": [str(x)[:120] for x in (parsed.get("red_flag_warnings") or [])][:6],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.symptom_cards.insert_one(card)
    await db.chat_sessions.update_one(
        {"id": body.session_id}, {"$set": {"finalized": True, "card_id": cid}}
    )
    card.pop("_id", None)
    return card


@api.get("/symptom-cards/mine")
async def my_symptom_cards(user=Depends(get_current_user)):
    docs = await db.symptom_cards.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(length=200)
    return docs


@api.get("/symptom-cards/{cid}")
async def get_symptom_card(cid: str, user=Depends(get_current_user)):
    doc = await db.symptom_cards.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Card not found")
    return doc


class ShareCardIn(BaseModel):
    card_id: str
    facility_id: str


@api.post("/symptom-cards/share")
async def share_card(body: ShareCardIn, user=Depends(get_current_user)):
    card = await db.symptom_cards.find_one({"id": body.card_id, "user_id": user["id"]}, {"_id": 0})
    if not card:
        raise HTTPException(404, "Card not found")
    # Facility can be in either collection
    f = await db.facilities.find_one({"id": body.facility_id}, {"_id": 0})
    if not f:
        f = await db.osm_facilities.find_one({"id": body.facility_id}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Facility not found")
    sid = str(uuid.uuid4())
    doc = {
        "id": sid,
        "card_id": body.card_id,
        "card": card,
        "facility_id": body.facility_id,
        "facility_name": f["name"],
        "patient_id": user["id"],
        "patient_name": user["name"],
        "patient_phone": user.get("phone"),
        "shared_at": datetime.now(timezone.utc).isoformat(),
        "status": "shared",
    }
    await db.shared_cards.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/symptom-cards/facility/{fid}")
async def facility_incoming_cards(fid: str, user=Depends(require_role("clinic_owner", "admin"))):
    docs = await db.shared_cards.find({"facility_id": fid}, {"_id": 0}).sort("shared_at", -1).to_list(length=200)
    return docs


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------
@api.post("/seed/reset")
async def seed_reset():
    """Idempotent seed of demo users + facilities + reviews + inspections."""
    await db.users.delete_many({})
    await db.facilities.delete_many({})
    await db.reviews.delete_many({})
    await db.inspections.delete_many({})
    await db.stock_requests.delete_many({})

    # ----- Users -----
    users = [
        {"id": "u-patient-1", "name": "Anjali Sharma", "email": "patient@aarogya.in", "role": "patient",
         "phone": "+919812345678", "preferred_language": "en"},
        {"id": "u-clinic-1", "name": "Dr Mehta", "email": "clinic@aarogya.in", "role": "clinic_owner",
         "phone": "+919811112222", "preferred_language": "en"},
        {"id": "u-clinic-2", "name": "Sunrise Pharmacy", "email": "pharmacy@aarogya.in", "role": "clinic_owner",
         "phone": "+919833334444", "preferred_language": "en"},
        {"id": "u-admin-1", "name": "Inspector Rao", "email": "admin@aarogya.in", "role": "admin",
         "phone": "+919855556666", "preferred_language": "en"},
    ]
    for u in users:
        u["password_hash"] = _hash("Password@123")
        u["medical_info"] = {}
        u["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.users.insert_many(users)

    # ----- Facilities (around Bengaluru + Mumbai + Delhi) -----
    # Around Koramangala, Bangalore: 12.9352, 77.6245
    base = [
        # name, type, lat, lng, city, state, owner, student, discount, img
        ("Apollo MediCare Clinic", "clinic", 12.9352, 77.6245, "Bengaluru", "Karnataka", "u-clinic-1", True, 15,
         "https://images.pexels.com/photos/6473188/pexels-photo-6473188.jpeg"),
        ("Sunrise 24x7 Pharmacy", "pharmacy", 12.9365, 77.6258, "Bengaluru", "Karnataka", "u-clinic-2", True, 10,
         "https://images.pexels.com/photos/35576362/pexels-photo-35576362.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"),
        ("Wellness Family Clinic", "clinic", 12.9420, 77.6280, "Bengaluru", "Karnataka", None, False, 0,
         "https://images.pexels.com/photos/7659869/pexels-photo-7659869.jpeg"),
        ("MedPlus Pharmacy", "pharmacy", 12.9310, 77.6200, "Bengaluru", "Karnataka", None, False, 0,
         "https://images.pexels.com/photos/35576362/pexels-photo-35576362.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"),
        ("KidsCare Pediatric", "clinic", 12.9290, 77.6300, "Bengaluru", "Karnataka", None, True, 20,
         "https://images.pexels.com/photos/6473188/pexels-photo-6473188.jpeg"),
        ("Janta Aushadhi Kendra", "pharmacy", 12.9400, 77.6210, "Bengaluru", "Karnataka", None, True, 25,
         "https://images.pexels.com/photos/35576362/pexels-photo-35576362.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"),
        ("DentaSmile Clinic", "clinic", 12.9270, 77.6280, "Bengaluru", "Karnataka", None, False, 0,
         "https://images.pexels.com/photos/6473188/pexels-photo-6473188.jpeg"),
        # Mumbai area: 19.0760, 72.8777
        ("Suburban Family Clinic", "clinic", 19.0760, 72.8777, "Mumbai", "Maharashtra", None, True, 12,
         "https://images.pexels.com/photos/6473188/pexels-photo-6473188.jpeg"),
        ("Health First Pharmacy", "pharmacy", 19.0780, 72.8800, "Mumbai", "Maharashtra", None, False, 0,
         "https://images.pexels.com/photos/35576362/pexels-photo-35576362.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"),
        # Delhi: 28.6139, 77.2090
        ("Connaught Clinic", "clinic", 28.6139, 77.2090, "New Delhi", "Delhi", None, True, 10,
         "https://images.pexels.com/photos/7659869/pexels-photo-7659869.jpeg"),
        ("Apollo Pharmacy CP", "pharmacy", 28.6155, 77.2100, "New Delhi", "Delhi", None, False, 0,
         "https://images.pexels.com/photos/35576362/pexels-photo-35576362.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"),
    ]
    medicines = ["Paracetamol", "Crocin", "Azithromycin", "Cetirizine", "Amoxicillin", "Pantoprazole",
                 "Insulin", "Metformin", "Cough Syrup", "ORS"]
    services_clinic = ["General Consult", "Vaccination", "Lab Tests", "Health Check-up"]
    docs = []
    for n, t, lat, lng, city, state, owner, sf, dpct, img in base:
        fid = str(uuid.uuid4())
        docs.append({
            "id": fid,
            "name": n,
            "type": t,
            "address": f"#{12 + len(docs)*3}, Main Road, {city}",
            "city": city,
            "state": state,
            "latitude": lat,
            "longitude": lng,
            "phone": f"+9198{len(docs):08d}",
            "image_url": img,
            "student_friendly": sf,
            "student_discount_pct": dpct,
            "verified": False,
            "open_hours": "8:00 AM - 10:00 PM",
            "services": services_clinic if t == "clinic" else [],
            "medicines": medicines if t == "pharmacy" else [],
            "geohash": geohash_encode(lat, lng, 9),
            "owner_user_id": owner,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    await db.facilities.insert_many(docs)

    # Inspect 5 facilities -> mark verified
    inspections = []
    for f in docs[:5]:
        inspections.append({
            "id": str(uuid.uuid4()),
            "facility_id": f["id"],
            "inspector_id": "u-admin-1",
            "cleanliness": 4 + (len(inspections) % 2),
            "price_transparency": 4,
            "equipment": 5 - (len(inspections) % 2),
            "notes": "Premises inspected, compliant with hygiene & equipment standards.",
            "report_image_base64": None,
            "grant_verified": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    await db.inspections.insert_many(inspections)
    await db.facilities.update_many(
        {"id": {"$in": [i["facility_id"] for i in inspections]}}, {"$set": {"verified": True}}
    )

    # Sample reviews
    reviews = []
    sample_texts = [
        ("Anjali Sharma", 5, "Very clean and quick service. Doctor was kind."),
        ("Ravi Kumar", 4, "Affordable and well-stocked. Recommended."),
        ("Priya Iyer", 5, "Loved the student discount, saved a lot!"),
        ("Aman Verma", 4, "Friendly staff, slight wait time."),
    ]
    for f in docs[:6]:
        for name, r, t in sample_texts[: 2 + (hash(f["id"]) % 3)]:
            reviews.append({
                "id": str(uuid.uuid4()),
                "facility_id": f["id"],
                "user_id": "u-patient-1",
                "user_name": name,
                "rating": r,
                "text": t,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
    if reviews:
        await db.reviews.insert_many(reviews)

    return {"ok": True, "users": len(users), "facilities": len(docs), "inspections": len(inspections),
            "reviews": len(reviews)}


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup():
    await db.users.create_index("email", unique=True)
    await db.facilities.create_index("geohash")
    await db.facilities.create_index([("latitude", 1), ("longitude", 1)])
    # Auto seed if empty
    if await db.facilities.count_documents({}) == 0:
        try:
            await seed_reset()  # type: ignore
        except Exception:
            pass


@app.on_event("shutdown")
async def _shutdown():
    client.close()
