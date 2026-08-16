# Smart Airport Assistance App

Welcome to the Smart Airport Assistance App repository. This is a full-stack application providing a comprehensive suite of digital passenger services including terminal navigation, real-time flight tracking, transit services mapping, meal delivery, language translation, and emergency contact features.

## Tech Stack

**Frontend (Client)**
* React 18 & TypeScript
* Vite
* Tailwind CSS
* MapLibre GL / Leaflet (Mapping)
* Socket.io-client
* @zxing/browser (QR scanning)

**Backend (Server)**
* Node.js & Express
* TypeScript
* Prisma ORM
* Socket.io
* OpenAI API
* Telegram API integration

## Project Structure
This is a monorepo containing two main directories:
* `client/` - The frontend React application
* `server/` - The Node.js/Express backend server

## Prerequisites
* Node.js (v18 or higher recommended)
* npm or yarn
* SQLite (for local development)

## Setup Instructions

### 1. Clone the repository
```bash
git clone https://github.com/saivenkat220504/Major-Duplicate.git
cd Major-Duplicate
```

### 2. Backend Setup
1. Navigate to the `server` directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Environment Configuration:
   * Create a `.env` file in the `server` directory.
   * Add necessary environment variables (e.g., `DATABASE_URL="file:./dev.db"`, `OPENAI_API_KEY`, etc. check if there's a `.env.example`).
4. Initialize the database:
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```
5. Seed the database (optional but recommended):
   ```bash
   npm run seed
   ```
6. Start the development server:
   ```bash
   npm run dev
   ```

### 3. Frontend Setup
1. Open a new terminal and navigate to the `client` directory:
   ```bash
   cd client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Environment Configuration:
   * Create a `.env` file in the `client` directory if needed (e.g., pointing to your backend URL).
4. Start the frontend development server:
   ```bash
   npm run dev
   ```

## Running the Application
Once both servers are running, the frontend will typically be accessible at `http://localhost:5173` (or as specified by Vite in the terminal output), and the backend at `http://localhost:4000`.

## Important Notes
* **`.env` files**: Sensitive information, API keys, and database URLs are stored in `.env` files. These are not tracked in version control for security purposes. You must create them locally.
* **Database**: This project uses Prisma with a local SQLite database for development. Ensure you run the Prisma migrations to set up your local database file before starting the server.
