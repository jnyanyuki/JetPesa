# JetPesa ✈️

JetPesa is a modern Aviator-style betting platform built using Next.js 14, Neon PostgreSQL, Neon Managed Better Auth, and PrintPay M-Pesa Integration (C2B & B2C).

The platform features:

- Real-time Aviator gameplay & provably fair verification
- Auto Bet & Auto Cashout with dual betting decks
- M-Pesa deposits & instant automated payouts via PrintPay
- Neon Managed Better Auth (email and phone number sign-in with soft 4+ char PINs / passwords)
- Serverless PostgreSQL ACID wallet transactions with zero client tampering
- Live multiplayer lobby chat & live wager feed
- Mobile responsive cockpit UI
- Rain effects, synthesizer sound system, animations, and flight simulation

---

# Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Neon Serverless PostgreSQL (`@neondatabase/serverless`)
- **Authentication**: Neon Managed Better Auth (`@neon/auth` / `better-auth`)
- **Payment Processing**: PrintPay API (C2B STK push, offline Paybill matching, and B2C automated withdrawals)
- **Deployment**: Vercel
- **Animations & Effects**: HTML5 Canvas, canvas-confetti, Web Audio API

---

# Installation

Clone the repository:

```bash
git clone https://github.com/tookarius/jetpesa.git
cd jetpesa
```

Install dependencies:

```bash
npm install --legacy-peer-deps
```

Run locally:

```bash
npm run dev
```

---

# Environment Variables

Configure `.env.local`:

```env
# Database (Neon Serverless PostgreSQL)
DATABASE_URL="postgresql://neondb_owner:PASSWORD@ep-fancy-bread-bhqw5fab.c-10.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
DATABASE_URL_POOLED="postgresql://neondb_owner:PASSWORD@ep-fancy-bread-bhqw5fab-pooler.c-10.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Neon Managed Better Auth
NEON_AUTH_BASE_URL="https://ep-fancy-bread-bhqw5fab.neonauth.c-10.eu-central-1.aws.neon.tech/neondb/auth"
BETTER_AUTH_URL="http://localhost:3000"

# PrintPay M-Pesa Gateway
PRINTPAY_WALLET_ID=RK06FTNUZX5T
PRINTPAY_PAYBILL=1416998
PRINTPAY_API_KEY=your_printpay_api_key
PRINTPAY_SECURITY_CREDENTIAL=your_security_credential
PRINTPAY_WEBHOOK_SECRET=your_webhook_secret

# Game Seeds (Provably Fair)
GAME_SERVER_SEED=your_game_server_seed
GAME_CLIENT_SEED=jetpesa_client_seed_prod_anchor
```

---

# Neon Setup

1. **Initialize Neon project**:
   ```bash
   neon init -y --org-id <org-id> --project-id <project-id> --branch production --services "postgres,auth"
   ```
2. **Deploy & pull env vars**:
   ```bash
   neon deploy
   ```
3. **Database Schema**:
   The relational schema runs in PostgreSQL with strict check constraints:
   - `public.users`: Accounts, M-Pesa numbers, and `wallet_balance NUMERIC(14,2) CHECK (wallet_balance >= 0.00)`
   - `public.deposits`: C2B STK requests, receipt hashes, and idempotency status
   - `public.withdrawals`: B2C automated payouts, conversation IDs, and disbursement status
   - `public.bets`: Multiplier stakes, rounds, and yields
   - `public.unclaimed_deposits`: Offline Paybill ledger matching

---

# Payment System (PrintPay PSP)

JetPesa integrates **PrintPay** for both M-Pesa collections (C2B) and automated payouts (B2C):

1. **C2B (Deposits)**:
   - STK Push prompt to user's phone via `POST /api/printpay/c2b`
   - Manual Paybill support: **Paybill 1416998**, Account **RK06FTNUZX5T**
   - Live status verification via `GET /api/printpay/c2b-status`
   - Instant webhook confirmation via `POST /api/printpay/callback`
   - Balances credited inside ACID PostgreSQL transactions.

2. **B2C (Disbursements / Withdrawals)**:
   - Automated M-Pesa withdrawal payouts via `POST /api/printpay/b2c-withdraw`
   - Live payout status tracking via `POST /api/printpay/b2c-status`
   - Payout result webhook via `POST /api/printpay/b2c-callback`
   - Atomic balance debit and automatic refund in PostgreSQL if payout fails at telco.

---

# Production Notes

- Never credit wallets from frontend responses.
- All balance deductions and credits use PostgreSQL transactions with row-level locks.
- User authentication is powered by Neon Managed Better Auth sessions.
- All payment amounts and phone numbers are validated server-side.

---

# License

MIT License
