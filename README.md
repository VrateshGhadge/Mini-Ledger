# MiniLedger

MiniLedger is a full-stack mobile app for tracking money lent to friends. It keeps a private ledger of loans, due dates, repayments, and overdue amounts.

The project contains:

- `backend/` — Node.js, Express, TypeScript, PostgreSQL REST API
- `mobile/` — React Native mobile app built with Expo, Expo Router, and TypeScript

> This is a React Native mobile application, not a React/Next.js website. A browser preview exists only for development verification.

## Features

- Phone-number login with a mock OTP printed in the backend terminal
- JWT authentication stored with Expo SecureStore on iOS/Android
- Dashboard with total lent, total repaid, and overdue amount
- Loan list with backend-derived `PENDING`, `OVERDUE`, and `REPAID` statuses
- Create loans with a friend's name, INR amount, and calendar date picker
- Mark loans as repaid with a confirmation dialog
- Pull-to-refresh, loading skeleton, empty state, error retry, and session-expired handling
- Automated backend tests
- Typechecked Expo app with iOS and Android production JavaScript bundles

Receipt uploads are intentionally not implemented.

## Project structure

```text
mini-ledger/
├── backend/
│   ├── src/                 # Express app, routes, services, auth, validation
│   ├── tests/               # Jest + Supertest suites
│   ├── sql/schema.sql       # PostgreSQL schema
│   ├── .env.example
│   └── README.md            # Detailed backend docs
└── mobile/
    ├── src/app/             # Expo Router screens and route guards
    ├── src/components/      # Reusable UI components
    ├── src/features/        # Auth, dashboard, and loan flows
    ├── src/lib/api/         # Typed API client and endpoints
    ├── src/lib/auth/        # SecureStore session handling
    ├── src/theme/           # Design tokens
    ├── .env.example
    └── README.md            # Detailed mobile docs and demo plan
```

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express 5, TypeScript, PostgreSQL, `pg` |
| Auth | Mock OTP, JWT (`HS256`) |
| Validation | Zod |
| Backend tests | Jest, Supertest |
| Mobile | React Native 0.88, Expo SDK 58, Expo Router |
| Mobile UI | PanelUI 0.114, Uniwind/Tailwind theme tokens |
| Mobile storage | Expo SecureStore |
| Mobile checks | TypeScript, Expo bundler |

Tested with Node.js 24.18.0, npm 11.16.0, PostgreSQL 18.6, Expo SDK 58, and TypeScript 6.

## Prerequisites

- Node.js 22 or newer
- npm
- PostgreSQL 14 or newer
- Expo Go on a phone, or:
  - Xcode for the iOS simulator
  - Android Studio for the Android emulator
- A phone and computer on the same Wi-Fi network for physical-device testing

On macOS with Homebrew, PostgreSQL can be installed with:

```bash
brew install postgresql@18
brew services start postgresql@18
export PATH="$(brew --prefix postgresql@18)/bin:$PATH"
```

The PATH export is needed because the Homebrew formula is keg-only. Add it to your shell profile if you want `psql` available in every terminal.

## First-time setup

### 1. Create the PostgreSQL role and databases

Start PostgreSQL:

```bash
brew services start postgresql@18
```

Create a development role and two databases. Use a local development password of your choice; the examples use `miniledger_dev`.

```bash
psql postgres -c "CREATE ROLE miniledger LOGIN PASSWORD 'miniledger_dev';"
createdb -O miniledger miniledger
createdb -O miniledger miniledger_test
```

If the role or databases already exist, skip those commands.

Apply the schema:

```bash
cd backend
psql "postgresql://miniledger:miniledger_dev@localhost:5432/miniledger" -f sql/schema.sql
psql "postgresql://miniledger:miniledger_dev@localhost:5432/miniledger_test" -f sql/schema.sql
```

`schema.sql` is safe to rerun; it does not drop existing data.

### 2. Configure and install the backend

From the repository root:

```bash
cd backend
npm install
cp .env.example .env
openssl rand -hex 32
```

Edit `backend/.env`:

```bash
PORT=4000
DATABASE_URL=postgresql://miniledger:miniledger_dev@localhost:5432/miniledger
TEST_DATABASE_URL=postgresql://miniledger:miniledger_dev@localhost:5432/miniledger_test
JWT_SECRET=<paste the openssl output here>
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:8081
```

The placeholder `change_me` JWT value is intentionally invalid; the backend refuses to start until you replace it with a real secret of at least 32 characters.

If npm is configured with `omit=dev`, install development tooling explicitly:

```bash
npm install --include=dev
```

### 3. Configure and install the mobile app

Open a new terminal:

```bash
cd mobile
npm install
cp .env.example .env
```

The default mobile `.env` is correct for the iOS simulator and Expo web:

```bash
EXPO_PUBLIC_API_URL=http://localhost:4000/api
```

See [API URLs for other devices](#api-urls-for-other-devices) for Android emulator and physical-phone settings.

If npm is configured with `omit=dev`, run:

```bash
npm install --include=dev
```

## Running the project

### Daily startup

Use two terminals.

**Terminal 1 — backend**

```bash
cd backend
npm run dev
```

Expected output:

```text
Database connection verified.
MiniLedger API listening on http://localhost:4000 (development)
```

Check it:

```bash
curl http://localhost:4000/api/health
# {"status":"ok"}
```

**Terminal 2 — mobile**

```bash
cd mobile
npx expo start
```

Then choose a target:

- Press `i` for the iOS simulator
- Press `a` for the Android emulator
- Press `w` for the Expo web preview
- Scan the QR code with Expo Go for a physical phone

The installed Expo Go version must support SDK 58.

### Logging in with the mock OTP

1. Open the app and enter a phone number with its country code.
2. Tap **Send code**.
3. Look at the **backend terminal** for a line like:

   ```text
   [auth] OTP for +919876543210 is 123456. Expires in 5 minutes.
   ```

4. Enter the six-digit code in the app.

The OTP is never returned by the API and never displayed in the app. It is stored in memory and is lost if the backend restarts. Resend cooldown is 30 seconds, the code expires after five minutes, and five failed verification attempts lock that code.

## API URLs for other devices

`EXPO_PUBLIC_API_URL` must include `/api`.

| Target | URL |
|---|---|
| iOS simulator | `http://localhost:4000/api` |
| Android emulator | `http://10.0.2.2:4000/api` |
| Physical phone on same Wi-Fi | `http://<COMPUTER_LAN_IP>:4000/api` |
| Expo web preview | `http://localhost:4000/api` |

Find the computer's LAN address:

```bash
ipconfig getifaddr en0
```

After changing `mobile/.env`, restart Expo:

```bash
cd mobile
npx expo start --clear
```

For a physical phone:

- Put the phone and computer on the same Wi-Fi.
- Use the computer's LAN IP, not `localhost`.
- Allow Node to accept incoming connections if the macOS firewall prompts.
- Ensure the backend is running. It listens on all interfaces by default.
- `CORS_ORIGIN` is not relevant to native requests. It is used by the Expo web preview.

Local development uses HTTP. Production builds should use HTTPS.

## Tests and checks

### Backend

```bash
cd backend
npm run typecheck
npm test
npm run build
```

The backend test suite runs against `TEST_DATABASE_URL`, refuses to run against the development database, and requires the test database name to end in `_test`. The current suite has 50 passing tests.

### Mobile

```bash
cd mobile
npm run typecheck
npx expo install --check
npx expo export --platform ios
npx expo export --platform android
```

`expo export` produces production JavaScript bundles and does not require Xcode or Android Studio. It does not replace simulator/device testing.

Current verification:

- Backend: typecheck, production build, and 50 Jest/Supertest tests pass.
- Mobile: TypeScript passes; Expo dependencies are compatible; iOS and Android bundles compile.
- Expo web end-to-end flow was exercised against the real backend and PostgreSQL: real OTP login, wrong OTP error, empty dashboard, add-loan validation, pending loan creation, date-picker overdue loan creation, repayment, summary updates, logout, protected-route redirect, loading skeleton, refresh retry, and 401 session expiration.

Native device/simulator testing was not possible in the development environment because Xcode and the Android SDK are not installed. SecureStore persistence, native keyboard behavior, pull-to-refresh gestures, and native date-sheet behavior should be included in a final device walkthrough.

## API summary

Base URL: `http://localhost:4000/api`

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | No | Health check |
| `POST` | `/auth/request-otp` | No | Generate a mock OTP |
| `POST` | `/auth/verify-otp` | No | Verify OTP and return JWT |
| `POST` | `/loans` | Bearer JWT | Create a loan |
| `GET` | `/loans` | Bearer JWT | List the user's loans |
| `PATCH` | `/loans/:id/repay` | Bearer JWT | Mark a loan repaid |
| `GET` | `/summary` | Bearer JWT | Get total lent, repaid, overdue |

Full request/response formats, error codes, and curl examples are in [backend/README.md](./backend/README.md).

## Short demo flow

1. Start PostgreSQL, the backend, and Expo.
2. Log in with a phone number; show the OTP in the backend terminal and verify it.
3. Show the dashboard summary cards and empty state.
4. Add a pending loan for next week.
5. Add a second loan using a past due date; show the overdue badge and overdue total.
6. Mark the first loan repaid; confirm the dialog and show the updated summary.
7. Pull to refresh, then log out and return to the login screen.

A detailed 2–3 minute recording plan, manual checklist, and mobile troubleshooting guide are in [mobile/README.md](./mobile/README.md).

## Troubleshooting

### `psql: command not found`

```bash
export PATH="$(brew --prefix postgresql@18)/bin:$PATH"
```

### Backend cannot connect to PostgreSQL

```bash
brew services start postgresql@18
pg_isready
```

Verify the role, databases, and `DATABASE_URL` if the connection is still refused.

### Mobile cannot reach the backend

- Confirm `curl http://localhost:4000/api/health` works on the computer.
- Confirm `EXPO_PUBLIC_API_URL` includes `/api`.
- Android emulator: use `http://10.0.2.2:4000/api`.
- Physical phone: use the computer's LAN IP.
- Restart Expo after changing `.env`: `npx expo start --clear`.
- Check the macOS firewall and Wi-Fi network.

### OTP does not appear in the app

That is intentional. Read the backend terminal. Restarting the backend invalidates existing in-memory OTPs.

### 429 OTP responses

Wait for the resend cooldown, stay within five requests per 15 minutes, or use a different phone number. Five failed verification attempts invalidate the current OTP.

### Expo web CORS error

Set `CORS_ORIGIN` in `backend/.env` to the exact Expo web origin and restart the backend.

### Session expires on web reload

The web preview uses an in-memory auth fallback. Native iOS/Android use Expo SecureStore.

### `npm audit` warnings

`npm audit` reports upstream advisories in the Expo/Metro/Reanimated/Uniwind toolchain. The suggested fixes are breaking downgrades (for example Expo 44) and were intentionally not applied. Do not run `npm audit fix --force` without reviewing the Expo SDK compatibility impact.

## Security notes

- `backend/.env` and `mobile/.env` are local, gitignored files. Never commit real secrets.
- The JWT secret must be at least 32 characters and must not be committed.
- The mock OTP is for local demonstration only. Logs contain OTPs and must not be enabled for production users.
- OTP state is in memory and is not shared across backend instances.
- Use HTTPS, a shared OTP/rate-limit store, and a real SMS provider before production.

## More documentation

- [Backend setup, API reference, and curl workflow](./backend/README.md)
- [Mobile setup, networking, manual checklist, and demo plan](./mobile/README.md)
