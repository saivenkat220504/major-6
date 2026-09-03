# 📘 Friend's Local Setup & Execution Guide

Hey there! 👋 Welcome to the **Smart Airport Assistance Project (SIPAS)**.
Follow this guide to get both the backend and frontend up and running smoothly on your local machine.

---

## 📋 Step 0: Prerequisites Check
Ensure you have the following installed on your PC:
1. **Node.js** (Version 18.x or 20.x recommended):
   - Check in terminal: `node -v`
   - If not installed, download from [nodejs.org](https://nodejs.org/).
2. **Git**:
   - Check in terminal: `git -v`
   - If not installed, download from [git-scm.com](https://git-scm.com/).
3. **A PostgreSQL Database**:
   - **Option A (Easiest - Free Cloud DB)**: Create a free PostgreSQL database on [Neon.tech](https://neon.tech) or [Supabase](https://supabase.com) in 2 minutes and copy the connection string.
   - **Option B (Local DB)**: Install PostgreSQL locally via [PostgreSQL Official](https://www.postgresql.org/download/) and use `postgresql://postgres:yourpassword@localhost:5432/smart_airport`.

---

## 📥 Step 1: Clone the Repo
Open your terminal (PowerShell, Command Prompt, or Git Bash) and run:
```bash
git clone https://github.com/saivenkat220504/major-7.git
cd major-7
```

---

## ⚙️ Step 2: Set Up & Run the Backend Server

1. Navigate into the `server` folder:
   ```bash
   cd server
   ```

2. Install all backend dependencies:
   ```bash
   npm install
   ```

3. Configure the environment variables:
   - Make a copy of `.env.example` named `.env`:
     ```bash
     # Windows (PowerShell):
     copy .env.example .env

     # macOS / Linux / Git Bash:
     cp .env.example .env
     ```
   - Open `.env` in VS Code or any text editor.
   - Update `DATABASE_URL` with your PostgreSQL database connection string.
   - *(Optional)* Add API keys if you want to test AI features or Telegram notifications.

4. Initialize the database schema with Prisma:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. *(Optional)* Seed initial flight & transit demo data:
   ```bash
   npm run seed
   ```

6. Start the backend development server:
   ```bash
   npm run dev
   ```
   ✅ *You should see: `Server listening on 4000`.*
   *(Keep this terminal window open and running!)*

---

## 💻 Step 3: Set Up & Run the Frontend Client

1. Open a **second terminal window** and navigate into the project's `client` folder:
   ```bash
   cd path/to/major-7/client
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Configure the client environment variables:
   - Make a copy of `.env.example` named `.env`:
     ```bash
     # Windows (PowerShell):
     copy .env.example .env

     # macOS / Linux / Git Bash:
     cp .env.example .env
     ```
   - Make sure `VITE_API_URL` is set to `http://localhost:4000`.

4. Start the frontend Vite development server:
   ```bash
   npm run dev
   ```
   ✅ *Vite will print a local URL like `http://localhost:3000` or `http://localhost:5173`.*

---

## 🌐 Step 4: Open and Test in Browser
1. Open your browser and go to `http://localhost:3000` (or the port Vite gave you).
2. Explore features:
   - 🗺️ **Indoor Terminal Map**: Heathrow map with turn-by-turn routing and POIs.
   - 🎫 **Boarding Pass Scanner**: Real-time camera barcode / PDF417 scanner with OCR.
   - ✈️ **Flight Tracking**: Real-time status and gate assignments.
   - 🧳 **Baggage Guidance**: Reclaim carousel tracking & guidance.
   - 🤖 **Aura AI Assistant**: Voice and text passenger assistance.
   - 🚨 **Emergency Guardian**: Emergency dispatch and SOS alerts.

---

## ❓ Common Troubleshooting & Tips

- **Prisma / Database Error:**
  - Double-check your `DATABASE_URL` format in `server/.env`.
  - Ensure your PostgreSQL server is accepting connections (or your cloud DB like Neon is active).
  - Run `npx prisma db push` inside the `server/` directory.

- **Port in Use:**
  - If port 4000 is occupied, change `PORT=5000` in `server/.env` and update `VITE_API_URL="http://localhost:5000"` in `client/.env`.

- **Need Android Studio APK build?**
  - Run `npm run build` in `client/`, then `npx cap sync android`, then `npx cap open android`.
