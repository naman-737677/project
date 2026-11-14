# Telegram Full-Stack Clone 🚀

A production-grade, real-time messaging application featuring a Node.js/TypeScript WebSocket clustering backend and a modern React (Vite + TypeScript) frontend modeled after Telegram Web, complete with credential authentication and Two-Step Verification (Google Authenticator TOTP).

---

## Architecture Overview

- **Backend (`/server`)**:
  - Real-time WebSocket engine with heartbeat watchdog and monotonic sequence ordering
  - Redis Pub/Sub integration for horizontal multi-node scaling
  - PostgreSQL & Prisma ORM for message persistence and chat participation
  - JWT Authentication via HTTP headers, query parameters, or WebSocket subprotocols
  - Timing-safe password hashing (`scrypt`) and RFC 6238 TOTP Two-Factor Authentication with QR Code generation
  - Automated integration test suite (`npm test`)

- **Frontend (`/client`)**:
  - React 18 + TypeScript + Vite
  - Telegram Web UI design (classic Telegram blue, message bubbles, presence dots, chat avatars)
  - Dedicated **Sign In** and **Create Account** pages with password visibility toggles
  - **Two-Step Verification (Google Authenticator)** with 6-digit auto-advancing input, QR code scanning, and manual key backup
  - Full WebSocket lifecycle support: automatic reconnection, heartbeat pings, optimistic updates
  - Message status tracking: `PENDING` (clock 🕒) → `PERSISTED` (checkmark ✓) → `READ` (double checkmark ✓✓)
  - Real-time typing indicators with debounce
  - Live WebSocket Frame Inspector (DevTools drawer to monitor incoming and outgoing raw envelopes)
  - Instant demo profile switcher (Alice, Bob, Charlie) for multi-tab testing

---

## Authentication & Accounts

### Default Demo Accounts
All pre-seeded with password: `password123`
- `@alice` (Alice Johnson)
- `@bob` (Bob Smith)
- `@charlie` (Charlie Brown)

You can also click **"Create Account"** on the login page to register any custom username and password!

---

## Quick Start

### 1. Start the Backend Server
```bash
cd server
npm install
npm run dev
```
The server will start listening at:
- HTTP API: `http://localhost:4000`
- WebSocket Gateway: `ws://localhost:4000/ws`

### 2. Start the React Frontend
In a new terminal:
```bash
cd client
npm install
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## How to Test Two-Step Verification (Google Authenticator) During Login

### Option A: Enable 2FA Directly During Login / Registration (New!)
1. Open `http://localhost:5173`.
2. Notice the checkbox **"Enable Two-Step Authentication (Google Authenticator)"** is enabled on the Sign In and Create Account screens.
3. Enter your credentials (e.g. `alice` / `password123`) or click **Alice** in Instant Demo Login.
4. Click **"Sign In with Two-Step Verification →"**:
   - The login screen immediately displays the **Google Authenticator QR Code** and manual secret key!
   - Scan the QR code with **Google Authenticator** on your phone (or click the convenient **⚡ Dev Helper: Autofill Current Code** button).
   - Enter the 6-digit code: your account is verified, Two-Step Authentication is permanently activated, and you are signed in!
5. Log out and sign in again:
   - The login screen now prompts directly for your Google Authenticator 6-digit TOTP code before granting access.

### Option B: Manage 2FA Inside the Application
1. Sign in to your account.
2. In the sidebar header, click the **Shield icon** (Two-Step Verification).
3. Enable or disable Two-Step Verification anytime with your password and current authenticator code.

---

## Storing Previous Chats When Logged Out 📦

All user conversations, messages, and chat lists are automatically persisted when a user logs out:
- **Local Storage Isolation**: Chats and message histories are saved per-user (`telegram_chats_{userId}` and `telegram_messages_{userId}`).
- **Logged Out Archive**: When a user logs out, their complete chat history is archived with a logout timestamp in `telegram_stored_sessions`.
- **Logged Out Viewer**: On the login screen, click **"View Stored Previous Chats"** to browse previous chats, view message histories, export JSON backups, or quick sign-in without losing any data.
- **Backend Disk Persistence**: The server persists chats and messages to `data/chats.json` and `data/messages.json`, restoring them across server restarts and providing REST endpoints (`GET /api/chats` and `GET /api/chats/:chatId/messages`).
- **Test Suite**: Run `npm run test:stored-chats` to run the integration test suite for stored chats.

