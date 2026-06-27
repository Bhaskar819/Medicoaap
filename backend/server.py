"""Aarogya Aggregator - Hyper-local Healthcare Aggregator MVP backend."""
from __future__ import annotations

import math
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Literal, Optional

import jwt
from bson import ObjectId  # noqa: F401  (imported for completeness)
from dotenv import load_dotenv
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


@api.get("/facilities/{fid}", response_model=FacilityOut)
async def get_facility(fid: str, lat: Optional[float] = None, lng: Optional[float] = None):
    f = await db.facilities.find_one({"id": fid}, {"_id": 0})
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
