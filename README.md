# 📘 Aurwell Clinic Booking System — Complete Backend & Integration Documentation

Welcome to the comprehensive technical documentation for the **Aurwell Multi-Tenant Clinic Booking Engine**. This document serves as the single source of truth for API endpoints, request/response contracts, multi-tenant database models, security/authentication flows, and integration guides for the **Public Subdomain Web Portal (`*.aurwell.app`)**, **Mobile App**, and **Admin Panel**.

---

## 📑 Table of Contents

1. [System Architecture & Roles](#1-system-architecture--roles)
2. [Authentication & Security Model](#2-authentication--security-model)
3. [Complete REST API Reference](#3-complete-rest-api-reference)
   - [`GET /health`](#31-get-health)
   - [`GET /api/subdomain/:subdomain`](#32-get-apisubdomainsubdomain)
   - [`GET /api/clinic/:clinicId/public`](#33-get-apiclinicclinicidpublic)
   - [`POST /api/booking/available-slots`](#34-post-apibookingavailable-slots)
   - [`POST /api/booking/reserve-hold`](#35-post-apibookingreserve-hold)
   - [`POST /api/booking/confirm`](#36-post-apibookingconfirm)
   - [`POST /api/booking/cancel`](#37-post-apibookingcancel)
   - [`POST /api/dev/seed`](#38-post-apidevseed-development-only)
4. [Firestore Database Contracts](#4-firestore-database-contracts)
5. [Public Subdomain Website Integration (`*.aurwell.app`)](#5-public-subdomain-website-integration-aurwellapp)
6. [Mobile App Integration Guide (Flutter / React Native)](#6-mobile-app-integration-guide)
7. [Admin Panel Integration Guide](#7-admin-panel-integration-guide)
8. [Email & Google Calendar Link Generation](#8-email--google-calendar-link-generation)
9. [Deployment & Environment Variables](#9-deployment--environment-variables)

---

## 1. System Architecture & Roles

```
                                      ┌─────────────────────────────┐
                                      │      *.aurwell.app          │
                                      │   (Cloudflare Wildcard)     │
                                      └──────────────┬──────────────┘
                                                     │
                                                     ▼
                                      ┌─────────────────────────────┐
                                      │   Public Booking Frontend   │
                                      │   (Next.js App / Mobile)    │
                                      │   clinicname.aurwell.app    │
                                      └──────┬───────────────┬──────┘
                                             │               │
                        Slot Query & Holds   │               │ Direct Public Reads
                        (Auth: Bearer JWT)   ▼               ▼
                            ┌─────────────────────────┐  ┌─────────────────────────┐
                            │ Aurwell Booking Backend │  │     Cloud Firestore     │
                            │ (Node.js / Express API) │  │    (Direct DB Access)   │
                            └──────┬───────────┬──────┘  └───────────▲─────────────┘
                                   │           │                     │
          Create / Verify Payment  │           │ Write Confirmed     │ Direct Admin CRUD
          (Forwards Bearer Token)  ▼           │ Appointments & Holds│ (Hours, Doctors,
              ┌───────────────────────────┐    │                     │  Manual Bookings)
              │  Existing Stripe Backend  │    │                     │
              │ api-guexeyftta-uc.a.run   │    │                     │
              └───────────────────────────┘    │                     │
                                               ▼                     │
                                  ┌─────────────────────────┐        │
                                  │ Resend Email & Calendar │        │
                                  │ (Google Calendar Link)  │        │
                                  └─────────────────────────┘        │
                                                                     │
                                                        ┌────────────┴────────────┐
                                                        │   Aurwell Admin Panel   │
                                                        │  (Direct Firestore SDK) │
                                                        └─────────────────────────┘
```

---

## 2. Authentication & Security Model

The Booking Engine implements the same **Firebase Authentication Bearer Token** standard used across Aurwell's Stripe Backend:

```http
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

```mermaid
sequenceDiagram
    autonumber
    actor Client as Mobile App / Web Client
    participant AuthMW as requireAuth Middleware
    participant FBAdmin as Firebase Admin SDK
    participant Ctrl as Booking Controller & Service
    participant StripeAPI as Existing Stripe Backend (FastAPI)
    participant DB as Cloud Firestore

    Client->>AuthMW: Request with Authorization: Bearer <ID_TOKEN>
    alt Header Present
        AuthMW->>FBAdmin: admin.auth().verifyIdToken(token)
        alt Token Expired or Invalid Signature
            FBAdmin-->>AuthMW: Error
            AuthMW-->>Client: 401 Unauthorized (Invalid or expired token)
        end
        FBAdmin-->>AuthMW: Decoded Token (uid, email, roles)
        AuthMW->>AuthMW: Set req.user & req.userUid
    else Header Missing & Endpoint is Optional
        AuthMW->>AuthMW: Allow request as Guest Patient
    end
    AuthMW->>Ctrl: Forward to Controller
    Ctrl->>Ctrl: Anti-Spoofing Check (Token UID == patient.patientId)
    alt UID Mismatch (Spoofing Attempt)
        Ctrl-->>Client: 403 Forbidden (Token UID does not match patient ID)
    end
    Ctrl->>StripeAPI: Forward Authorization Token (POST /payments/create-intent)
    Ctrl->>DB: Atomic Firestore Transaction
    DB-->>Client: 200/201 Success Response
```

### Security Highlights:
1. **Cryptographic JWT Verification**: Every token is validated against Google's public keys for signature, expiration (`exp`), issuer (`iss`), and audience (`aud`).
2. **Dual-Mode Support (Optional vs. Required)**:
   - **Mobile App & Logged-in Users**: Pass `Authorization: Bearer <TOKEN>` to automatically bind bookings to the patient's Aurwell account.
   - **Public Subdomain Web Visitors (`clinicname.aurwell.app`)**: Can book as guests without requiring prior registration.
3. **Anti-Spoofing Enforcement (HTTP 403 `FORBIDDEN`)**: If an authenticated token is provided, the backend verifies that `req.userUid` matches `patient.patientId`. A user cannot forge a booking under another user's ID.
4. **Token Forwarding to Stripe Backend**: When communicating with the existing Stripe backend (`https://api-guexeyftta-uc.a.run.app`), the Booking Engine forwards the client's `Authorization: Bearer <TOKEN>` header.

### Security Status Codes:
| Status Code | Error Code | Scenario |
| :--- | :--- | :--- |
| **`401 Unauthorized`** | `UNAUTHORIZED` | Token is expired, revoked, malformed, or missing on protected endpoints. |
| **`403 Forbidden`** | `FORBIDDEN` | Authenticated Token UID does not match target patient ID or appointment owner. |
| **`409 Conflict`** | `SLOT_TAKEN` | Slot was claimed by another patient during checkout (race-condition protection). |

---

## 3. Complete REST API Reference

**Base URL (Local)**: `http://localhost:8080`  
**Base URL (Production)**: `https://<YOUR_DEPLOYED_BACKEND_URL>`  
**Default Headers**: `Content-Type: application/json`

---

### 3.1. `GET /health`
Health check endpoint for container orchestrators and load balancers.

- **Auth Required**: ❌ No
- **Response `200 OK`**:
```json
{
  "status": "healthy",
  "service": "aurwell-booking-backend",
  "environment": "development",
  "timestamp": "2026-09-10T17:00:00.000Z"
}
```

---

### 3.2. `GET /api/subdomain/:subdomain`
Resolves a clinic subdomain (e.g. `harleystreet` from `harleystreet.aurwell.app`) into clinic metadata, branding colors, and booking configuration.

- **Auth Required**: ❌ No
- **Path Parameters**:
  - `subdomain` (string, required): e.g. `harleystreet`
- **Response `200 OK`**:
```json
{
  "clinicId": "clinic_harleystreet_test",
  "merchantName": "Harley Street Aesthetics",
  "brandColor": "#C9A96E",
  "logoUrl": "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=300",
  "appHeroImageUrl": "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1200",
  "description": "Premier aesthetic and wellness clinic in Marylebone, London.",
  "address": "10 Harley Street, Marylebone, London W1G 9PF",
  "phone": "+44 20 7946 0813",
  "currency": "GBP",
  "timezone": "Europe/London",
  "bookingConfig": {
    "systemType": "aurwell_custom",
    "subdomain": "harleystreet",
    "customDomain": null,
    "settings": {
      "requirePaymentUpfront": false,
      "depositType": "percentage",
      "depositAmount": 50,
      "slotIntervalMinutes": 30,
      "minNoticeHours": 0,
      "maxAdvanceDays": 60,
      "cancellationHours": 24,
      "holdDurationMinutes": 10
    }
  }
}
```
- **Error Response `404 Not Found`**:
```json
{
  "error": "Clinic not found for this subdomain"
}
```

---

### 3.3. `GET /api/clinic/:clinicId/public`
Fetches all active treatments and doctors qualified for the clinic's public booking portal.

- **Auth Required**: ❌ No
- **Path Parameters**:
  - `clinicId` (string, required): e.g. `clinic_harleystreet_test`
- **Response `200 OK`**:
```json
{
  "clinicId": "clinic_harleystreet_test",
  "treatments": [
    {
      "id": "treatment_botox_01",
      "title": "Botox Anti-Wrinkle Injections",
      "categories": ["Face", "Wrinkles"],
      "description": "FDA-approved wrinkle relaxing treatment.",
      "durationMinutes": 45,
      "bufferMinutes": 15,
      "types": [
        { "title": "1 Area", "nonMemberPrice": 195, "memberPrice": 160 },
        { "title": "Full Face (3 Areas)", "nonMemberPrice": 295, "memberPrice": 240 }
      ],
      "isActive": true
    },
    {
      "id": "treatment_hydrafacial_01",
      "title": "HydraFacial Deluxe",
      "categories": ["Face", "Hydration"],
      "durationMinutes": 30,
      "bufferMinutes": 15,
      "types": [
        { "title": "Standard", "nonMemberPrice": 150, "memberPrice": 120 }
      ],
      "isActive": true
    }
  ],
  "doctors": [
    {
      "id": "doc_jenkins_01",
      "doctorId": "doc_jenkins_01",
      "name": "Dr. Sarah Jenkins",
      "title": "Senior Aesthetic Practitioner",
      "email": "dr.jenkins@harleystreet.com",
      "avatarUrl": "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=300",
      "bio": "Specialist in non-surgical facial rejuvenation with 12+ years experience.",
      "assignedTreatments": ["treatment_botox_01", "treatment_hydrafacial_01"],
      "allTreatments": true,
      "isActive": true
    }
  ]
}
```

---

### 3.4. `POST /api/booking/available-slots`
Computes all available start times on a target date for a specific treatment by intersecting clinic operating hours, doctor shifts, date overrides, doctor leaves, and existing appointments/active holds.

- **Auth Required**: ❌ No (Public)
- **Headers**: `Content-Type: application/json`
- **Request Body**:
```json
{
  "clinicId": "clinic_harleystreet_test",
  "treatmentId": "treatment_botox_01",
  "doctorId": "doc_jenkins_01",       // Optional: omit to search across all qualified doctors
  "date": "2026-09-14"                // Format: YYYY-MM-DD
}
```
- **Response `200 OK`**:
```json
{
  "date": "2026-09-14",
  "clinicId": "clinic_harleystreet_test",
  "treatment": {
    "id": "treatment_botox_01",
    "title": "Botox Anti-Wrinkle Injections",
    "durationMinutes": 45,
    "bufferMinutes": 15
  },
  "slots": [
    {
      "time": "06:00",
      "startDateTime": "2026-09-14T06:00:00.000Z",
      "endDateTime": "2026-09-14T06:45:00.000Z",
      "doctorIds": ["doc_jenkins_01"]
    },
    {
      "time": "06:30",
      "startDateTime": "2026-09-14T06:30:00.000Z",
      "endDateTime": "2026-09-14T07:15:00.000Z",
      "doctorIds": ["doc_jenkins_01"]
    },
    {
      "time": "14:00",
      "startDateTime": "2026-09-14T14:00:00.000Z",
      "endDateTime": "2026-09-14T14:45:00.000Z",
      "doctorIds": ["doc_jenkins_01"]
    }
  ]
}
```

---

### 3.5. `POST /api/booking/reserve-hold`
Atomically checks slot availability in a Firestore transaction and places a **10-minute temporary lock** (`status: "held"`). If the clinic requires an upfront deposit, it calls the existing FastAPI Stripe backend to generate a `PaymentIntent`.

- **Auth Required**: 🔓 Optional (`Authorization: Bearer <FIREBASE_ID_TOKEN>`)
  - If token is passed, validates identity and links booking to authenticated user.
  - If token is omitted, proceeds as a guest booking.
- **Request Body**:
```json
{
  "clinicId": "clinic_harleystreet_test",
  "treatmentId": "treatment_botox_01",
  "variantTitle": "Full Face (3 Areas)",
  "doctorId": "doc_jenkins_01",
  "startDateTime": "2026-09-14T06:00:00.000Z",
  "patient": {
    "patientId": "CqJSmHls3qPFHx48ncEVo1Kc9GB3", // Optional UID if signed in, null for guest
    "name": "Arif Choudhary",
    "email": "choudharyarif756@gmail.com",
    "phone": "+44 7700 900123",
    "notes": "First time receiving anti-wrinkle treatment"
  },
  "bookingSource": "mobile_app" // "public_web" | "mobile_app" | "admin_staff"
}
```
- **Response `201 Created` (No Payment Required)**:
```json
{
  "appointmentId": "apt_1789059318133_f51c8",
  "id": "RFssa09mYoR0yR9nTJSH",
  "holdExpiresAt": "2026-09-10T17:15:18.133Z",
  "paymentRequired": false,
  "payment": null
}
```
- **Response `201 Created` (When Stripe Payment is Required)**:
```json
{
  "appointmentId": "apt_1789059318133_f51c8",
  "id": "RFssa09mYoR0yR9nTJSH",
  "holdExpiresAt": "2026-09-10T17:15:18.133Z",
  "paymentRequired": true,
  "payment": {
    "clientSecret": "pi_3Ty7..._secret_xyz123",
    "paymentIntentId": "pi_3Ty7...",
    "amount": 147.5,
    "currency": "GBP"
  }
}
```
- **Error Response `403 Forbidden` (Anti-Spoofing Mismatch)**:
```json
{
  "error": "Forbidden: Token UID does not match patient ID.",
  "code": "FORBIDDEN"
}
```
- **Error Response `409 Conflict` (Slot Already Taken)**:
```json
{
  "error": "This slot has just been selected by another patient. Please choose another time."
}
```

---

### 3.6. `POST /api/booking/confirm`
Finalizes the booking: updates status to `confirmed`, clears the temporary hold, and dispatches the confirmation email with the **Google Calendar 1-Click Link** and `.ics` attachment via Resend.

- **Auth Required**: 🔓 Optional (`Authorization: Bearer <FIREBASE_ID_TOKEN>`)
- **Request Body**:
```json
{
  "clinicId": "clinic_harleystreet_test",
  "appointmentId": "apt_1789059318133_f51c8",
  "paymentIntentId": "pi_3Ty7..." // Optional if payment was not required
}
```
- **Response `200 OK`**:
```json
{
  "success": true,
  "appointmentId": "apt_1789059318133_f51c8",
  "status": "confirmed"
}
```

---

### 3.7. `POST /api/booking/cancel`
Cancels an appointment, issues an automated refund via the FastAPI Stripe backend (if a deposit was paid), and sends a cancellation email.

- **Auth Required**: 🔓 Optional (`Authorization: Bearer <FIREBASE_ID_TOKEN>`)
- **Request Body**:
```json
{
  "clinicId": "clinic_harleystreet_test",
  "appointmentId": "apt_1789059318133_f51c8",
  "cancelledBy": "patient", // "patient" | "clinic_staff"
  "reason": "Rescheduled to next month"
}
```
- **Response `200 OK`**:
```json
{
  "success": true,
  "appointmentId": "apt_1789059318133_f51c8",
  "status": "cancelled"
}
```

---

### 3.8. `POST /api/dev/seed` (Development Only)
Seeds test clinic data into Firestore for rapid local verification.

- **Response `200 OK`**:
```json
{
  "message": "Seeding complete!",
  "data": {
    "success": true,
    "clinicId": "clinic_harleystreet_test",
    "subdomain": "harleystreet",
    "mondayHours": "06:00 - 09:00 and 14:00 - 20:00"
  }
}
```

---

## 4. Firestore Database Contracts

```
/clinics/{clinicId}
    ├── /treatments/{treatmentId}        (durationMinutes, bufferMinutes, pricing types)
    ├── /doctors/{doctorId}              (name, avatarUrl, assignedTreatments, isActive)
    ├── /schedules
    │     ├── operating_hours            (weekly opening slots & dateOverrides)
    │     └── doctor_{doctorId}          (doctor-specific weekly shifts)
    ├── /blocked_slots/{slotId}          (leave, vacation, breaks)
    └── /appointments/{appointmentId}    (status: held/confirmed/cancelled, patient, schedule)

/subdomains/{subdomain}                  (subdomain -> clinicId fast lookup)
```

---

## 5. Public Subdomain Website Integration (`*.aurwell.app`)

Each clinic receives its own public booking portal at `https://<subdomain>.aurwell.app`.

### Step 1: Wildcard DNS Setup
In Cloudflare / Route 53:
- Add a wildcard **CNAME** record for `*.aurwell.app` pointing to your Next.js host.

### Step 2: Next.js Edge Middleware (`middleware.ts`)
Intercepts incoming domain hostnames and extracts the subdomain prefix:

```typescript
// middleware.ts in your Next.js frontend project
import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images|api).*)"],
};

export default function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const hostname = req.headers.get("host") || "";
  const rootDomain = "aurwell.app";
  const reserved = ["www", "admin", "api", "app"];

  let host = hostname;
  if (process.env.NODE_ENV === "development") {
    host = hostname.replace(".localhost:3000", `.${rootDomain}`);
  }

  const subdomain = host.endsWith(`.${rootDomain}`)
    ? host.replace(`.${rootDomain}`, "")
    : null;

  if (!subdomain || reserved.includes(subdomain.toLowerCase())) {
    return NextResponse.next();
  }

  url.pathname = `/_sites/${subdomain.toLowerCase()}${url.pathname}`;
  return NextResponse.rewrite(url);
}
```

### Step 3: Next.js Dynamic Booking Page (`app/_sites/[subdomain]/page.tsx`)
Fetches clinic metadata from the Booking API and renders the appropriate mode:

```tsx
// app/_sites/[subdomain]/page.tsx
import { notFound } from "next/navigation";

interface Props {
  params: { subdomain: string };
}

async function getClinic(subdomain: string) {
  const res = await fetch(`http://localhost:8080/api/subdomain/${subdomain}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function ClinicBookingPage({ params }: Props) {
  const clinic = await getClinic(params.subdomain);
  if (!clinic) notFound();

  const { bookingConfig } = clinic;

  // Mode 1: External Booking Widget/Link (e.g. Fresha, Phorest)
  if (bookingConfig?.systemType === "external_sdk") {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold">{clinic.merchantName}</h1>
        <p className="mt-2">Redirecting to booking portal...</p>
        <a href={bookingConfig.externalBooking?.url} className="mt-4 inline-block bg-black text-white px-6 py-2 rounded">
          Book with {bookingConfig.externalBooking?.provider}
        </a>
      </div>
    );
  }

  // Mode 2: Online Booking Disabled
  if (bookingConfig?.systemType === "disabled") {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold">{clinic.merchantName}</h1>
        <p className="mt-2">Online booking is currently disabled. Call {clinic.phone}</p>
      </div>
    );
  }

  // Mode 3: Native Aurwell Booking Flow
  return (
    <div style={{ "--primary": clinic.brandColor } as React.CSSProperties}>
      <header className="p-4 border-b flex items-center justify-between">
        <img src={clinic.logoUrl} alt={clinic.merchantName} className="h-10" />
        <h2 className="font-semibold">{clinic.merchantName}</h2>
      </header>
      <main className="max-w-3xl mx-auto p-6">
        <BookingWizard clinicId={clinic.clinicId} />
      </main>
    </div>
  );
}
```

---

## 6. Mobile App Integration Guide

For the **Aurwell Patient Mobile App** (Flutter or React Native):

1. **Check Clinic Booking System**:
   Inspect `clinic.bookingConfig.systemType`:
   - If `"aurwell_custom"`: Open the in-app native booking wizard.
   - If `"external_sdk"`: Open `bookingConfig.externalBooking.url` via in-app browser (`WebView` / `url_launcher`).
   - If `"disabled"`: Show "Call Clinic to Book" with phone link.

2. **Fetching Slots in Mobile App**:
```dart
// Flutter Example: Fetch Available Slots
final response = await http.post(
  Uri.parse('$BACKEND_URL/api/booking/available-slots'),
  headers: {'Content-Type': 'application/json'},
  body: jsonEncode({
    'clinicId': clinicId,
    'treatmentId': treatmentId,
    'date': '2026-09-14',
  }),
);
final slots = jsonDecode(response.body)['slots'];
```

3. **Reserving & Confirming with Auth Token**:
```dart
// Flutter Example: Reserve Slot Hold with Firebase Token
final idToken = await FirebaseAuth.instance.currentUser?.getIdToken();

final holdResponse = await http.post(
  Uri.parse('$BACKEND_URL/api/booking/reserve-hold'),
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer $idToken',
  },
  body: jsonEncode({
    'clinicId': clinicId,
    'treatmentId': treatmentId,
    'doctorId': doctorId,
    'startDateTime': startDateTimeIso,
    'patient': {
      'patientId': FirebaseAuth.instance.currentUser?.uid,
      'name': 'Patient Name',
      'email': 'patient@example.com',
      'phone': '+447700900123',
    },
    'bookingSource': 'mobile_app',
  }),
);

final holdData = jsonDecode(holdResponse.body);

if (holdData['paymentRequired'] == true) {
  // Initialize Stripe PaymentSheet
  await Stripe.instance.initPaymentSheet(
    paymentSheetParameters: SetupPaymentSheetParameters(
      paymentIntentClientSecret: holdData['payment']['clientSecret'],
      merchantDisplayName: clinicName,
    ),
  );
  await Stripe.instance.presentPaymentSheet();
}

// Confirm Appointment
await http.post(
  Uri.parse('$BACKEND_URL/api/booking/confirm'),
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer $idToken',
  },
  body: jsonEncode({
    'clinicId': clinicId,
    'appointmentId': holdData['appointmentId'],
  }),
);
```

---

## 7. Admin Panel Integration Guide

The Admin Panel interacts **directly with Firestore** using the Firebase Client SDK:

### A. Saving Clinic Subdomain & Booking Mode:
```typescript
import { doc, writeBatch, serverTimestamp } from "firebase/firestore";

async function saveClinicBookingSettings(clinicId: string, subdomain: string, systemType: string) {
  const batch = writeBatch(db);

  // 1. Create/Update /subdomains lookup
  const subRef = doc(db, "subdomains", subdomain.toLowerCase());
  batch.set(subRef, {
    subdomain: subdomain.toLowerCase(),
    clinicId,
    isActive: true,
    createdAt: serverTimestamp(),
  });

  // 2. Update clinic bookingConfig
  const clinicRef = doc(db, "clinics", clinicId);
  batch.update(clinicRef, {
    "bookingConfig.subdomain": subdomain.toLowerCase(),
    "bookingConfig.systemType": systemType, // "aurwell_custom" | "external_sdk" | "disabled"
  });

  await batch.commit();
}
```

### B. Setting Clinic Opening Hours:
```typescript
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

async function updateClinicHours(clinicId: string, weeklyHours: any, dateOverrides: any[]) {
  const hoursRef = doc(db, "clinics", clinicId, "schedules", "operating_hours");
  await setDoc(hoursRef, {
    weeklyHours,
    dateOverrides,
    updatedAt: serverTimestamp(),
  });
}
```

---

## 8. Email & Google Calendar Link Generation

Every confirmed appointment automatically generates a dynamic 1-click **Add to Google Calendar** link and attaches a `.ics` calendar file.

### Google Calendar Link Syntax:
```
https://calendar.google.com/calendar/render?action=TEMPLATE&text={Title}&dates={StartUTC}/{EndUTC}&details={Details}&location={Location}
```

**Example Output:**
```
https://calendar.google.com/calendar/render?action=TEMPLATE&text=Botox+Anti-Wrinkle+Injections+at+Harley+Street+Aesthetics&dates=20260914T060000Z/20260914T064500Z&details=Booking+ID:+apt_1789059318133_f51c8%0APractitioner:+Dr.+Sarah+Jenkins&location=10+Harley+Street,+Marylebone,+London+W1G+9PF
```

---

## 9. Deployment & Environment Variables

### `.env` File Configuration:
```env
PORT=8080
NODE_ENV=production
FIREBASE_ADMIN_PROJECT_ID=aurwell-2e48c
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-fbsvc@aurwell-2e48c.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
STRIPE_BACKEND_URL=https://api-guexeyftta-uc.a.run.app
RESEND_API_KEY=dfsdfas
EMAIL_FROM="Aurwell Bookings <onboarding@resend.dev>"
```

### Deploying to Google Cloud Run:
```bash
# Build production bundle
npm run build

# Deploy via gcloud CLI
gcloud run deploy aurwell-booking-backend \
  --source . \
  --platform managed \
  --region europe-west2 \
  --allow-unauthenticated
```
