# Aarogya Aggregator — Hyper-local Healthcare Aggregator MVP

> The "Oyo" for small clinics & pharmacies in India.

## Goal
Connect patients to nearby clinics & pharmacies with **trusted, inspector-verified** information — across 6 Indian languages.

## Roles
1. **Patient** — discover, verify, review, request medicine stock.
2. **Clinic / Pharmacy owner** — manage listing, toggle student-friendly, respond to stock requests.
3. **Admin / Inspector** — inspect facilities, set ratings (cleanliness / price transparency / equipment), grant the Verified badge.

## Core features delivered
- **Geolocation Hub** — auto-zooms to the patient's GPS; nearby search powered by inline geohashing + haversine distance (no external API key needed).
- **Verified Logic** — `verified` boolean is toggled only by `admin` role via `POST /api/admin/inspect` + an inspection report.
- **Inspector Ratings** — distinct schema from user reviews (`cleanliness`, `price_transparency`, `equipment`, overall computed).
- **Student Friendly & Stock Check** — `student_friendly` flag with `student_discount_pct`; patients send a stock request, owners respond Yes/No.
- **6 Indian languages** — English, Hindi, Tamil, Telugu, Bengali, Marathi (live switcher on login + profile).
- **Map-first patient home** — react-native-maps on native, stylised gradient fallback on web preview.

## Stack
- **Backend**: FastAPI (Motor + MongoDB), JWT (PyJWT), passlib/bcrypt. Inline geohash + haversine; `/api/seed/reset` auto-runs on empty DB.
- **Frontend**: Expo Router (SDK 54), TypeScript, react-native-maps, expo-location, expo-linear-gradient, expo-blur, @gorhom/bottom-sheet (installed for future use).
- **Auth**: JWT token in SecureStore (native) / AsyncStorage (web); role-based routing on app entry.

## Demo accounts (all password `Password@123`)
- patient@aarogya.in
- clinic@aarogya.in
- pharmacy@aarogya.in
- admin@aarogya.in

## API surface
| Method | Path | Role |
|---|---|---|
| GET | /api/ | – |
| POST | /api/seed/reset | – (dev) |
| POST | /api/auth/register | – |
| POST | /api/auth/login | – |
| GET | /api/auth/me | auth |
| PUT | /api/auth/me/medical | auth |
| GET | /api/facilities/nearby | – |
| GET | /api/facilities/{id} | – |
| POST | /api/facilities | clinic_owner+ |
| PUT | /api/facilities/{id} | clinic_owner (own) / admin |
| GET | /api/facilities/owner/mine | clinic_owner+ |
| GET | /api/admin/all | admin |
| GET | /api/admin/pending | admin |
| POST | /api/admin/inspect | admin |
| POST | /api/reviews | auth |
| GET | /api/reviews/{fid} | – |
| POST | /api/stock-requests | auth |
| GET | /api/stock-requests/facility/{fid} | clinic_owner+ |
| GET | /api/stock-requests/mine | auth |
| POST | /api/stock-requests/{rid}/respond | clinic_owner+ |

## What's NOT in this MVP
- Real Google Maps tiles on web (uses a stylised fallback). On native devices the real react-native-maps tile layer is used.
- Booking / payments / push notifications.
- Image upload of inspection report (currently optional base64 field, not wired to UI).
