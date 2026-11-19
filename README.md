# JetPesa ✈️

JetPesa is a modern Aviator-style betting platform built using Next.js, Firebase, and PrintPay M-Pesa Integration (C2B & B2C).

The platform features:

- Real-time Aviator gameplay
- Auto Bet & Auto Cashout
- M-Pesa deposits & payouts via PrintPay
- Firebase Authentication
- Firestore wallet management
- Live multiplayer lobby chat
- Mobile responsive cockpit UI
- Rain effects, sounds, animations, and flight simulation
- Provably fair styled gameplay system

---

# Tech Stack

- Next.js 14
- React
- Firebase Authentication
- Firebase Firestore
- Firebase Admin SDK
- PrintPay API (C2B & B2C)
- Vercel Deployment
- Canvas API
- canvas-confetti

---

# Installation

Clone the repository:

```bash
git clone https://github.com/tookarius/jetpesa.git
cd jetpesa
```

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

---

# Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

PRINTPAY_WALLET_ID=RK06FTNUZX5T
PRINTPAY_PAYBILL=1416998
PRINTPAY_API_KEY=
PRINTPAY_SECURITY_CREDENTIAL=
PRINTPAY_WEBHOOK_SECRET=

GAME_SERVER_SEED=
GAME_CLIENT_SEED=jetpesa_client_seed_prod_anchor
```

---

# Firebase Setup

## 1. Enable Authentication

Enable:
- Email/Password
- Phone Authentication (optional/lookup)

Inside Firebase Console.

---

## 2. Deploy Firestore Rules

Deploy the comprehensive security rules in [firestore.rules](file:///c:/FullStack/JetPesa/firestore.rules):

```bash
firebase deploy --only firestore:rules
```

These rules protect user wallets from client tampering, restrict deposits and withdrawals to server-side mutations, and enforce read-only game bets.

---

## 3. Firebase Admin SDK

Generate a service account:

Firebase Console → Project Settings → Service Accounts → Generate Private Key

Use the values in:

```env
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

---

# Payment System (PrintPay PSP)

JetPesa integrates **PrintPay** for both M-Pesa collections (C2B) and automated payouts (B2C):

1. **C2B (Deposits)**:
   - STK Push prompt to user's phone via `POST /api/printpay/c2b`
   - Manual Paybill support: **Paybill 1416998**, Account **RK06FTNUZX5T**
   - Live status verification via `GET /api/printpay/c2b-status`
   - Instant webhook confirmation via `POST /api/printpay/callback`
   - Wallet balances are credited ONLY after confirmed payment.

2. **B2C (Disbursements / Withdrawals)**:
   - Automated M-Pesa withdrawal payouts via `POST /api/printpay/b2c-withdraw`
   - Live payout status tracking via `POST /api/printpay/b2c-status`
   - Payout result webhook via `POST /api/printpay/b2c-callback`
   - Atomic balance debit and automatic refund if payout fails at telco.
   - Merchant float balance check via `GET /api/printpay/b2c-balance`

---

# Deployment

Recommended deployment:

- Vercel
- Koyeb
- Replit
- Render
- VPS

---

# Features

## Aviator Gameplay

- Real-time multiplier engine
- Crash simulation
- Auto flight rendering
- Animated SVG aircraft
- Rain mode
- Sound system

## Wallet

- Deposit via M-Pesa
- Withdrawal requests
- Real-time balance updates

## Betting

- Dual betting decks
- Auto bet
- Auto cashout
- Manual cashout

## Social

- Live chat room
- Multiplayer activity feed
- Live wager tape

---

# Production Notes

Important:

- Never credit wallets from frontend responses
- Always use payment callbacks
- Keep Firebase Admin keys private
- Use Firestore security rules
- Validate all payment amounts server-side

---

# License

MIT License

---

# Author

TK.
