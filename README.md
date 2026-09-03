# ✈️ Smart Airport Passenger Assistance System (SIPAS)

An intelligent, full-stack digital assistant and indoor navigation ecosystem designed for airport passengers. The platform features indoor terminal wayfinding, live gate & flight tracking, boarding pass barcode decoding, baggage reclaim guidance, real-time bus/metro telemetry tracking, multilingual translation, meal ordering, and guardian emergency alert dispatching.

---

## 🏗️ Architecture & Project Structure

```text
├── client/                 # Frontend React Application (Vite + TS + Tailwind)
│   ├── android/            # Capacitor Android Native Wrapper
│   ├── src/
│   │   ├── features/       # Modular feature domains
│   │   │   ├── ai-assistant/       # Aura Voice & Text AI Chat
│   │   │   ├── baggage-guidance/   # Reclaim carousel guidance & tracking
│   │   │   ├── boarding-pass/      # QR / PDF417 Boarding pass camera scanner
│   │   │   ├── emergency-contact/  # SOS & Guardian alert dispatch
│   │   │   ├── flight-tracking/    # Live gate & terminal status
│   │   │   ├── food-ordering/      # Airport retail & restaurant delivery
│   │   │   ├── navigation/         # Heathrow indoor map & turn-by-turn routing
│   │   │   ├── transit-services/   # Lounge, shower, luggage storage finder
│   │   │   ├── translation/        # Multilingual voice & text translator
│   │   │   └── transport-tracking/ # Real-time Metro & Bus live telemetry
│   │   └── services/       # Leaflet / MapLibre mapping & API services
│   ├── .env.example        # Frontend environment template
│   └── package.json
│
├── server/                 # Backend Node.js / Express Server
│   ├── prisma/             # Prisma ORM Schema & Migrations (PostgreSQL)
│   │   ├── schema.prisma   # Database schema
│   │   └── seed.ts         # Sample data seeder
│   ├── src/
│   │   ├── controllers/    # Route controllers
│   │   ├── routes/         # Express API routes
│   │   ├── services/       # Telegram Bot, LLM, Barcode & Mail services
│   │   └── index.ts        # Server entry point & Socket.io server
│   ├── .env.example        # Backend environment template
│   └── package.json
│
├── map-data/               # GeoJSON floor plans & navigation graph datasets
└── scripts/                # Data processing & map tile generator scripts
```

---

## 🛠️ Technology Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide React, Framer Motion, Leaflet, MapLibre GL, `@zxing/library` & `zxing-wasm` (Barcode & PDF417 scanning), Socket.io Client.
- **Backend**: Node.js, Express, TypeScript, Prisma ORM, PostgreSQL, Socket.io, Telegram Bot API, Google Gemini / OpenRouter LLM, Nodemailer SMTP.
- **Mobile**: Capacitor Android wrapper (`client/android`).

---

## 🚀 Quickstart: Running Locally on Your PC

For detailed step-by-step setup instructions, see the [Local Setup Guide](./LOCAL_SETUP_GUIDE.md).

### 1. Prerequisites
- **Node.js** (v18.x or v20.x recommended) -> [Download Node.js](https://nodejs.org/)
- **Git** -> [Download Git](https://git-scm.com/)
- **PostgreSQL Database** (Local instance or free cloud database like [Neon](https://neon.tech), [Supabase](https://supabase.com), or [Render](https://render.com))

---

### 2. Clone the Repository
```bash
git clone https://github.com/saivenkat220504/major-7.git
cd major-7
```

---

### 3. Setup & Start Backend Server

1. Open a terminal and navigate to `server`:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your `.env` file from the example template:
   ```bash
   # On Windows PowerShell:
   copy .env.example .env

   # On Linux / macOS:
   cp .env.example .env
   ```
4. Open `.env` and set your `DATABASE_URL` (e.g. your PostgreSQL connection string).
5. Generate Prisma client & apply database migrations:
   ```bash
   npx prisma generate
   npx prisma db push
   ```
6. (Optional) Seed the database with sample flights and records:
   ```bash
   npm run seed
   ```
7. Start the backend development server:
   ```bash
   npm run dev
   ```
   *The backend runs at `http://localhost:4000` (or the port defined in your `.env`).*

---

### 4. Setup & Start Frontend Client

1. Open a **new terminal window** and navigate to `client`:
   ```bash
   cd client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your `.env` file from the example template:
   ```bash
   # On Windows PowerShell:
   copy .env.example .env

   # On Linux / macOS:
   cp .env.example .env
   ```
4. Open `.env` and configure `VITE_API_URL="http://localhost:4000"` (and optional Gemini / OpenRouteService API keys).
5. Start the frontend Vite dev server:
   ```bash
   npm run dev
   ```
6. Open your browser and visit:
   ```text
   http://localhost:3000   (or the URL shown in the Vite output)
   ```

---

## 🔒 Environment Variables Reference

### Backend (`server/.env`)
| Variable | Description |
|---|---|
| `PORT` | Port for Express backend server (default: `4000`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret key for JWT auth tokens |
| `TELEGRAM_BOT_TOKEN` | (Optional) Telegram bot token for real-time driver chat / alerts |
| `TELEGRAM_CHAT_ID` | (Optional) Telegram chat ID |
| `LLM_API` | (Optional) OpenRouter / OpenAI API key for Aura AI assistant |
| `SERPER_API_KEY` | (Optional) Serper API key for real-time web search |
| `GMAIL_USER` | (Optional) Sender Gmail for guardian OTP verification |
| `GMAIL_APP_PASSWORD` | (Optional) Google App Password for SMTP |

### Frontend (`client/.env`)
| Variable | Description |
|---|---|
| `VITE_API_URL` | Base URL of the backend API (`http://localhost:4000`) |
| `VITE_GEMINI_API_KEY` | (Optional) Google Gemini API Key for translations |
| `VITE_ORS_MAP_API` | (Optional) OpenRouteService API Key for navigation routing |

---

## 📱 Mobile App (Android)

The repository includes a ready-to-build Capacitor Android project located in `client/android/`.
To build and run in Android Studio:
```bash
cd client
npm run build
npx cap sync android
npx cap open android
```
