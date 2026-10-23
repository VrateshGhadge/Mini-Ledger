# MiniLedger Backend

Backend API for **MiniLedger**, a mobile app for tracking money lent to friends.

The backend implements the required assignment scope:

- Mock phone-number login with a six-digit OTP printed to the server terminal
- JWT-protected loan creation, listing, and repayment
- PostgreSQL-backed summary of total lent, total repaid, and overdue amount
- Input validation, centralized JSON errors, and automated API tests

The React Native client and receipt uploads are not part of this repository.

## Tech stack

- Node.js, TypeScript, Express
- PostgreSQL with `pg`
- Zod for request validation
- JWT (`jsonwebtoken`) for authentication
- Jest and Supertest for tests
- `dotenv` for local environment variables

Verified with Node.js 24.18.0, npm 11.16.0, PostgreSQL 18.6, TypeScript 6.0.3, Express 5.3.0, and Jest 30.5.2.

## Project structure

```text
backend/
├── src/
│   ├── config/          # Environment validation and PostgreSQL pool
│   ├── controllers/     # HTTP request/response handling
│   ├── errors/          # Operational AppError class
│   ├── middleware/      # JWT auth, errors, 404, request logging
│   ├── routes/          # Route definitions
│   ├── services/        # Business rules and parameterized SQL
│   ├── types/           # Domain and Express request types
│   ├── validators/      # Zod request schemas
│   ├── app.ts           # Express app (no listen call)
│   └── server.ts        # Process entry, DB check, graceful shutdown
├── sql/schema.sql       # Tables, constraints, indexes
├── tests/               # Jest + Supertest suites and helpers
├── .env.example
├── jest.config.js
├── package.json
├── tsconfig.json
├── tsconfig.test.json
└── README.md
```

`app.ts` is exported separately from `server.ts` so Supertest can exercise the HTTP stack without binding a port.

## Prerequisites

- Node.js 22 or newer (tested on 24.18.0)
- npm
- PostgreSQL 14 or newer (tested on 18.6)
- `jq` is optional, only for the curl examples

On macOS with Homebrew:

```bash
brew install postgresql@18
brew services start postgresql@18
export PATH="$(brew --prefix postgresql@18)/bin:$PATH"
```

The search path is required because `postgresql@18` is keg-only. Add it to your shell profile if you want `psql` available in every terminal.

## Installation

```bash
cd backend
npm install
```

If your npm is configured with `omit=dev`, the test and build tooling will not be installed. Use:

```bash
npm install --include=dev
```

## Database setup

### 1. Create the dev and test databases

Connect as a PostgreSQL superuser:

```bash
psql postgres
```

Run:

```sql
CREATE ROLE miniledger LOGIN PASSWORD 'miniledger_dev';
```

Exit the shell, then create the databases:

```bash
createdb -O miniledger miniledger
createdb -O miniledger miniledger_test
```

If the role or databases already exist, skip those commands. Use any local development password you prefer, and keep it consistent with `DATABASE_URL` and `TEST_DATABASE_URL` in `.env`.

On a generic PostgreSQL installation where `postgres` is a separate operating-system user, run the equivalent commands through your usual administrative connection, for example:

```bash
sudo -u postgres createuser --login --pwprompt miniledger
sudo -u postgres createdb -O miniledger miniledger
sudo -u postgres createdb -O miniledger miniledger_test
```

> Homebrew's `initdb` commonly enables `trust` authentication for local connections, so the password may not be enforced on this machine. That is acceptable for local development only. A deployed database must use password/SCRAM authentication and TLS.

### 2. Apply the schema

```bash
psql "postgresql://miniledger:miniledger_dev@localhost:5432/miniledger" -f sql/schema.sql
psql "postgresql://miniledger:miniledger_dev@localhost:5432/miniledger_test" -f sql/schema.sql
```

`schema.sql` is safe to run repeatedly: it uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. It does not drop data. There is no migration system in this assignment; schema changes require a manual migration.

The test helper also applies the schema automatically, but the `miniledger_test` database must already exist.

### 3. Configure environment variables

```bash
cp .env.example .env
openssl rand -hex 32
```

Put the generated value into `JWT_SECRET` in `.env`. Never use the example placeholder.

| Variable | Required | Example | Notes |
|---|---|---|---|
| `PORT` | No | `4000` | HTTP port; defaults to 4000 |
| `DATABASE_URL` | Yes | `postgresql://miniledger:miniledger_dev@localhost:5432/miniledger` | Development database |
| `TEST_DATABASE_URL` | For tests | `postgresql://miniledger:miniledger_dev@localhost:5432/miniledger_test` | Must differ from `DATABASE_URL` and the database name must end in `_test` |
| `JWT_SECRET` | Yes | — | At least 32 characters; generate with `openssl rand -hex 32` |
| `JWT_EXPIRES_IN` | No | `7d` | Number plus unit: `ms`, `s`, `m`, `h`, `d`, `w`, or `y` |
| `CORS_ORIGIN` | No | `http://localhost:8081` | Comma-separated allowed origins; `*` allows all and should not be used in production |
| `NODE_ENV` | Set by scripts | `development` | `npm run dev` sets development, `npm test` sets test, `npm start` sets production |

Environment variables are validated at startup. The process fails immediately with the variable name if configuration is missing or invalid. `.env` is ignored by Git; `.env.example` contains placeholders only.

## Running the backend

Development server with file watching:

```bash
npm run dev
```

Expected output:

```text
Database connection verified.
MiniLedger API listening on http://localhost:4000 (development)
```

Health check:

```bash
curl http://localhost:4000/api/health
# {"status":"ok"}
```

Production build and start:

```bash
npm run build
npm start
```

`npm start` sets `NODE_ENV=production` and serves the compiled files from `dist/`.

### npm scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Run with `tsx watch` on port 4000 |
| `npm run build` | Compile `src/` to `dist/` |
| `npm start` | Run the compiled production build |
| `npm run typecheck` | Type-check source and tests |
| `npm test` | Run Jest once against the test database |
| `npm run test:watch` | Watch mode for tests |

The npm scripts use POSIX environment assignment (`NODE_ENV=...`). On Windows, set `NODE_ENV` manually or use a tool such as `cross-env`.

## Tests

```bash
npm run typecheck
npm test
```

Current result:

```text
Test Suites: 6 passed, 6 total
Tests:       50 passed, 50 total
```

Tests use a real PostgreSQL test database, because SQL behavior, constraints, dates, and NUMERIC aggregates are part of the contract. Safety rules:

- `NODE_ENV=test` is forced by the test script and setup file.
- Tests require `TEST_DATABASE_URL`.
- The test URL must differ from `DATABASE_URL`.
- The test database name must end in `_test`.
- The test helper also checks `current_database()` before truncating.
- Tests run with `--runInBand` to avoid concurrent truncation.
- Tables are truncated between tests; development data is never used or modified.

## Mock OTP authentication

### Flow

1. Call `POST /api/auth/request-otp` with a phone number.
2. Read the OTP from the backend terminal. It is never returned in the HTTP response.
3. Call `POST /api/auth/verify-otp` with the same phone number and OTP.
4. Store the returned JWT and send it as `Authorization: Bearer <token>` on protected requests.

Example terminal line:

```text
[auth] OTP for +919876543210 is 123456. Expires in 5 minutes.
```

OTP rules:

| Rule | Value |
|---|---|
| Length | 6 digits |
| Validity | 5 minutes |
| Resend cooldown | 30 seconds per phone |
| Request cap | 5 OTP requests per 15 minutes per phone |
| Failed verification attempts | 5 per OTP, then locked |
| Reuse | Not allowed; a successful verification consumes the OTP |
| Delivery | Server terminal only; no SMS provider |

OTP records are held in process memory. Restarting the server clears them, and a multi-instance deployment would need a shared store such as Redis with TTLs. A cleanup timer bounds the in-memory map, but this remains a mock development mechanism. It must not be used as a real authentication system.

### JWT

- Algorithm: `HS256`
- Subject: the user's UUID
- Issuer: `miniledger-api`
- Expiry: `JWT_EXPIRES_IN` (default `7d`)
- Verification pins both the algorithm and issuer
- There is no refresh-token or logout/revocation endpoint; tokens remain valid until they expire

## API reference

Base URL for local development:

```text
http://localhost:4000/api
```

All protected endpoints require:

```http
Authorization: Bearer <jwt>
Content-Type: application/json
```

### Response conventions

- Amounts are JSON numbers, never numeric strings.
- `dueDate` is a `YYYY-MM-DD` calendar date.
- `createdAt` and `updatedAt` are ISO 8601 UTC strings.
- Loan `status` is derived: `PENDING`, `OVERDUE`, or `REPAID`.
- `GET /api/loans` returns a bare array; an empty list is `[]`.
- `GET /api/summary` returns a flat object.
- Successful create/repay responses return the loan object directly.
- Errors always use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [
      { "field": "amount", "message": "Amount must be greater than zero" }
    ]
  }
}
```

`details` is optional and currently appears on validation and rate-limit errors.

### Endpoint summary

| Method | Path | Auth | Success |
|---|---|---|---|
| `GET` | `/api/health` | No | `200 {"status":"ok"}` |
| `POST` | `/api/auth/request-otp` | No | `200` message and OTP validity |
| `POST` | `/api/auth/verify-otp` | No | `200` JWT and user |
| `POST` | `/api/loans` | Yes | `201` created loan |
| `GET` | `/api/loans` | Yes | `200` array of loans |
| `PATCH` | `/api/loans/:id/repay` | Yes | `200` updated loan |
| `GET` | `/api/summary` | Yes | `200` totals |

### `GET /api/health`

Liveness check; it does not query PostgreSQL. Database connectivity is checked during server startup.

```json
{ "status": "ok" }
```

### `POST /api/auth/request-otp`

Request:

```json
{
  "phoneNumber": "+919876543210"
}
```

Phone numbers are normalized (spaces, parentheses, dots, and hyphens are removed; a leading `00` becomes `+`) and must be valid E.164.

Response `200`:

```json
{
  "message": "OTP generated. Check the server terminal.",
  "expiresInSeconds": 300
}
```

Possible errors: `400 VALIDATION_ERROR`, `413 PAYLOAD_TOO_LARGE`, `429 OTP_RATE_LIMITED`.

A rate-limit response includes a retry hint:

```json
{
  "error": {
    "code": "OTP_RATE_LIMITED",
    "message": "Please wait before requesting another OTP.",
    "details": { "retryAfterSeconds": 24 }
  }
}
```

### `POST /api/auth/verify-otp`

Request:

```json
{
  "phoneNumber": "+919876543210",
  "otp": "123456"
}
```

Response `200`:

```json
{
  "token": "<jwt>",
  "user": {
    "id": "c585c36a-1c93-4fd3-9d77-4151d2b6503c",
    "phoneNumber": "+919876543210",
    "createdAt": "2026-10-23T07:49:23.210Z"
  }
}
```

The user is created on first successful verification; later logins reuse the existing row.

Possible errors: `400 VALIDATION_ERROR`, `401 OTP_INVALID_OR_EXPIRED`, `429 OTP_ATTEMPTS_EXCEEDED`, `413 PAYLOAD_TOO_LARGE`.

### Loan object

All loan responses use this shape:

```json
{
  "id": "41430e8c-b305-43e1-b7e4-31ee2c5f6659",
  "friendName": "Rahul",
  "amount": 2000.5,
  "dueDate": "2026-10-30",
  "status": "PENDING",
  "isRepaid": false,
  "createdAt": "2026-10-23T12:20:21.711Z",
  "updatedAt": "2026-10-23T12:20:21.711Z"
}
```

- `status` is `REPAID` whenever `isRepaid` is true.
- Otherwise it is `OVERDUE` only when `dueDate < CURRENT_DATE`, where "today" is evaluated by PostgreSQL.
- A loan due today remains `PENDING`.
- `amount` is at most `9,999,999,999.99` and has at most two decimal places.
- `friendName` is trimmed and limited to 100 characters.

### `POST /api/loans`

Request:

```json
{
  "friendName": "Rahul",
  "amount": 2000,
  "dueDate": "2026-10-30"
}
```

Response `201`: the created loan object.

A past due date is accepted and the returned status is immediately `OVERDUE`.

Possible errors: `400 VALIDATION_ERROR`, `401 AUTH_REQUIRED` / `AUTH_INVALID_TOKEN`, `413 PAYLOAD_TOO_LARGE`.

### `GET /api/loans`

Returns only the authenticated user's loans:

```json
[
  {
    "id": "41430e8c-b305-43e1-b7e4-31ee2c5f6659",
    "friendName": "Rahul",
    "amount": 2000.5,
    "dueDate": "2026-10-22",
    "status": "OVERDUE",
    "isRepaid": false,
    "createdAt": "2026-10-23T12:20:21.711Z",
    "updatedAt": "2026-10-23T12:20:21.711Z"
  }
]
```

Ordering:

1. Unpaid before repaid
2. Overdue before pending
3. Earliest due date first
4. Newest created first for ties

Other users' loans are never included.

Possible errors: `401 AUTH_REQUIRED` / `AUTH_INVALID_TOKEN`.

### `PATCH /api/loans/:id/repay`

No request body. The loan ID must be a UUID.

Response `200`: the loan with `status: "REPAID"` and `isRepaid: true`.

The operation is idempotent. Calling it again for the same owned loan returns `200` with the same `updatedAt`; it does not fail. A nonexistent loan and another user's loan both return `404 LOAN_NOT_FOUND`, so the API does not reveal that someone else's loan exists.

Possible errors: `400 VALIDATION_ERROR` (invalid UUID), `401 AUTH_REQUIRED` / `AUTH_INVALID_TOKEN`, `404 LOAN_NOT_FOUND`.

### `GET /api/summary`

Response `200`:

```json
{
  "totalLent": 4251.05,
  "totalRepaid": 750.45,
  "overdueAmount": 2000.2
}
```

Rules:

- `totalLent`: sum of all the user's loans, including repaid loans
- `totalRepaid`: sum of loans marked repaid
- `overdueAmount`: sum of unpaid loans whose due date is strictly before today
- A loan due today is not overdue
- A repaid loan never contributes to `overdueAmount`
- No loans returns `{ "totalLent": 0, "totalRepaid": 0, "overdueAmount": 0 }`
- All calculations are performed by PostgreSQL, never by the client

Possible errors: `401 AUTH_REQUIRED` / `AUTH_INVALID_TOKEN`.

### Error codes

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod validation failed; `details` lists fields |
| 400 | `INVALID_JSON` | Malformed JSON request body |
| 401 | `AUTH_REQUIRED` | Missing Authorization header |
| 401 | `AUTH_INVALID_TOKEN` | Malformed, expired, or wrongly signed JWT |
| 401 | `OTP_INVALID_OR_EXPIRED` | Incorrect, expired, missing, or already-used OTP |
| 404 | `LOAN_NOT_FOUND` | Loan does not exist or belongs to another user |
| 404 | `NOT_FOUND` | Unknown route |
| 413 | `PAYLOAD_TOO_LARGE` | JSON body exceeds 100 KB |
| 429 | `OTP_RATE_LIMITED` | Resend cooldown or request-window cap |
| 429 | `OTP_ATTEMPTS_EXCEEDED` | Five failed verification attempts |
| 500 | `INTERNAL_ERROR` | Unexpected server error; details are logged server-side only |

## Complete curl workflow

Start the server:

```bash
npm run dev
```

Set your phone number:

```bash
PHONE="+919876543210"
```

### 1. Request an OTP

```bash
curl -sS -X POST http://localhost:4000/api/auth/request-otp \
  -H "Content-Type: application/json" \
  -d "{\"phoneNumber\":\"$PHONE\"}"
```

Read the six-digit OTP from the server terminal:

```text
[auth] OTP for +919876543210 is 123456. Expires in 5 minutes.
```

### 2. Verify the OTP and store the JWT

```bash
OTP="123456"
TOKEN=$(curl -sS -X POST http://localhost:4000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d "{\"phoneNumber\":\"$PHONE\",\"otp\":\"$OTP\"}" \
  | jq -r '.token')

echo "Token length: ${#TOKEN}"
```

### 3. Create a loan

```bash
DUE_DATE=$(date -v+7d +%F 2>/dev/null || date -d '+7 days' +%F)

LOAN=$(curl -sS -X POST http://localhost:4000/api/loans \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"friendName\":\"Rahul\",\"amount\":2000,\"dueDate\":\"$DUE_DATE\"}")

echo "$LOAN" | jq
LOAN_ID=$(echo "$LOAN" | jq -r '.id')
```

### 4. List loans

```bash
curl -sS http://localhost:4000/api/loans \
  -H "Authorization: Bearer $TOKEN" | jq
```

### 5. Mark the loan repaid

```bash
curl -sS -X PATCH "http://localhost:4000/api/loans/$LOAN_ID/repay" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### 6. Get the summary

```bash
curl -sS http://localhost:4000/api/summary \
  -H "Authorization: Bearer $TOKEN" | jq
```

### 7. Test an error response

```bash
curl -sS -i http://localhost:4000/api/loans
```

This returns `401 AUTH_REQUIRED` as JSON.

## React Native app configuration

The backend is local; there is no deployed production URL yet.

| Client environment | API base URL |
|---|---|
| iOS simulator | `http://localhost:4000/api` |
| Android emulator | `http://10.0.2.2:4000/api` |
| Physical device on the same Wi-Fi | `http://<YOUR_COMPUTER_LAN_IP>:4000/api` |
| Expo web | `http://localhost:4000/api` |

For a physical device, find the Mac's LAN address with:

```bash
ipconfig getifaddr en0
```

The server listens on all interfaces because `app.listen(PORT)` is called without a host. If the device cannot connect, check the macOS firewall and ensure both devices are on the same network.

Recommended Expo environment configuration:

```bash
EXPO_PUBLIC_API_URL=http://localhost:4000/api
```

Use `http://10.0.2.2:4000/api` for an Android emulator, or the LAN URL for a physical device. These are development HTTP URLs; production must use HTTPS.

### CORS

React Native and Expo native builds do not enforce browser CORS. Expo web does.

- Default allowed origin: `http://localhost:8081`
- Set `CORS_ORIGIN` to the actual Expo web origin; multiple origins can be comma-separated
- Keep `CORS_ORIGIN` restrictive in production
- Restart the backend after changing `.env`

### Client conventions

- Send `Content-Type: application/json`.
- Send `amount` as a JSON number, not a string.
- Send `dueDate` as a `YYYY-MM-DD` string.
- Do not send `status` or `isRepaid` when creating a loan; both are server-derived.
- Send `Authorization: Bearer <token>` on every loans and summary request.
- Store the JWT in secure native storage (for example, Expo SecureStore), not plain AsyncStorage.
- Treat `401 AUTH_INVALID_TOKEN` as an expired session and return the user to login.
- `GET /api/loans` returns all loans; there is no pagination.
- Use the API's `status` field for overdue highlighting rather than comparing dates on the device.

Suggested app flow:

1. Request OTP, then prompt for the code from the backend terminal.
2. Verify OTP and persist the JWT and user.
3. Load `GET /api/summary` and `GET /api/loans` together for the home screen.
4. Create loans with `POST /api/loans`.
5. Mark loans repaid with `PATCH /api/loans/:id/repay`, then refresh the list and summary.

## Important business rules

- **User isolation:** every loan and summary query filters by the authenticated user ID from the JWT.
- **Derived status:** `status` is never stored; it is calculated from `is_repaid` and `CURRENT_DATE`, so list and summary cannot disagree.
- **Overdue definition:** unpaid and `dueDate < today`; a loan due today is pending.
- **Repayment:** full repayment only; repeated requests are idempotent.
- **Money:** PostgreSQL `NUMERIC(12,2)` keeps exact database values; services convert NUMERIC strings to JSON numbers at the boundary.
- **Dates:** due dates are handled as `DATE` and returned as strings. Timestamps are timezone-aware and returned as ISO UTC.
- **Atomicity:** create, list, repay, and summary each use a single SQL statement, so no explicit transaction is needed.
- **Timezone:** `CURRENT_DATE` is evaluated in the PostgreSQL session timezone. The local cluster used here is configured for `Asia/Kolkata`. In deployment, set the database timezone explicitly and keep it consistent with the product's definition of "today".

## Security notes and limitations

This is an assignment backend, not a production authentication service.

- Mock OTPs are printed to server logs. Never enable this behavior for real users; use an SMS provider and a shared OTP store with TTLs.
- OTP state is in process memory, so it is lost on restart and not shared across instances.
- OTP request limiting is per phone number, not per IP or globally.
- There is no refresh token, logout, token revocation, or password recovery.
- The JWT secret must be strong, private, and rotated if exposed. `.env` is gitignored; `.env.example` contains placeholders only.
- Homebrew PostgreSQL commonly uses `trust` authentication locally; use SCRAM/password authentication and TLS in a real deployment.
- Server logs may contain phone numbers, OTPs, and error details. Restrict log access.
- CORS is not authentication.
- The API accepts JSON bodies up to 100 KB.
- Health is a liveness check, not a database readiness probe.
- Receipt uploads, partial repayments, pagination, and user deletion are intentionally not implemented.

## Troubleshooting

**`psql: command not found`**

Homebrew's PostgreSQL formula is keg-only:

```bash
export PATH="$(brew --prefix postgresql@18)/bin:$PATH"
```

**`connection refused` or PostgreSQL is not running**

```bash
brew services start postgresql@18
pg_isready
```

**`role "miniledger" does not exist` / `database "miniledger" does not exist`**

Repeat the role and database creation commands in the database setup section.

**Startup reports an environment error**

Check `.env` against `.env.example`. Common causes are a missing `DATABASE_URL`, a JWT secret shorter than 32 characters, or an invalid `JWT_EXPIRES_IN` value. The placeholder `change_me` intentionally fails validation.

**`EADDRINUSE` on port 4000**

```bash
lsof -nP -iTCP:4000 -sTCP:LISTEN
```

Stop the other process or change `PORT` in `.env`.

**Tests refuse to run or report a database guard error**

`TEST_DATABASE_URL` must exist, must differ from `DATABASE_URL`, and its database name must end in `_test`. This prevents tests from truncating development data.

**OTP is not visible**

Check the terminal running `npm run dev`. The response deliberately does not contain the OTP. Restarting the server invalidates previously issued OTPs.

**429 responses from the auth endpoints**

OTP resend has a 30-second cooldown and five requests per 15-minute window. Verification has five attempts per OTP. Read `details.retryAfterSeconds` where provided.

**Android emulator cannot reach the backend**

`localhost` inside the emulator refers to the emulator. Use `http://10.0.2.2:4000/api`.

**Expo web requests are blocked by CORS**

Set `CORS_ORIGIN` to the exact Expo web origin and restart the backend.

**npm did not install Jest or TypeScript**

Your npm may be configured with `omit=dev`:

```bash
npm install --include=dev
```

## Verified results

Final verification run:

```text
npm run typecheck  → passed
npm test           → 6 suites, 50 tests passed
npm run build      → passed
npm audit          → 0 vulnerabilities
```

Manual HTTP verification covered OTP login, loan creation, derived overdue status, list ordering, idempotent repayment, and summary totals. The development database was left clean after manual verification.
