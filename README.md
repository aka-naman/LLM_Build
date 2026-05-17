# 📋 Multi-User Dynamic Form Builder

A professional, self-hosted form builder application with user isolation, version control, Excel exports, and administrative management. Designed for local network (LAN) or production deployment.

---

## 🚀 Quick Start Guide (New Environment)

Follow these steps to get the application running on a new machine.

### 1. Prerequisites
- **Node.js** (v16+)
- **PostgreSQL** (v12+) installed and running
- **npm** (comes with Node.js)

### 2. Database Setup
Create a new database in PostgreSQL:
```sql
CREATE DATABASE formbuilder;
-- Note: Remember your DB username and password
```

### 3. Installation
Clone the repository and install dependencies for both parts:

**Server:**
```bash
cd server
npm install
```

**Client:**
```bash
cd client
npm install
```

### 4. Configuration
Create a `.env` file in the `server` directory based on `.env.example` (if provided) or use this template:
```env
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=formbuilder
DB_USER=your_username
DB_PASSWORD=your_password
JWT_SECRET=your_secure_random_string
```

### 5. Initialize Database
Run the following commands in the `server` directory to setup tables and multi-user support:
```bash
# Create tables
npm run migrate

# Add user isolation (Crucial for the login system)
node db/add-user-isolation.js

# Load sample data (Optional)
npm run seed
```

### 6. Run the Application

**Development Mode:**
- Server: `cd server && npm start`
- Client: `cd client && npm run dev`
- Access: `http://localhost:5173`

**Production Mode (Recommended):**
1. Build the frontend: `cd client && npm run build`
2. Run the unified server: `cd server && npm start`
3. Access: `http://localhost:5000`

---

## 👑 The Master (Admin) Account

The system is designed for complete isolation. 
- **The very first user to Register** automatically becomes the **Master Admin**.
- Subsequent users are regular users who can only see and manage their own forms.
- **Admin Powers:** Delete users, reset passwords, change roles, and view all forms/submissions globally.

---

## 🌐 LAN Hosting (Access via Wi-Fi)

To allow other devices on your local network to use the app:
1. Find your local IP (e.g., `192.168.1.15`).
2. Update `client/src/api/client.js` or `.env.local` to point to your IP.
3. Run the client with the host flag: `npm run dev -- --host`.
4. See **`HOST.md`** for a detailed walkthrough.

---

## 📁 Project Documentation
- **`Setup.md`**: Detailed step-by-step installation guide.
- **`MULTIUSER.md`**: Deep dive into the isolation and admin system.
- **`HOST.md`**: Detailed instructions for LAN and firewall configuration.
- **`FIELD_TYPES_GUIDE.md`**: How to extend the builder with new field types.

---

## 🛠️ Tech Stack
- **Frontend:** React, Vite, Axios, Context API.
- **Backend:** Node.js, Express, JWT, ExcelJS.
- **Database:** PostgreSQL with `pg` pool.
- **Styling:** Vanilla CSS (Modern glassmorphism UI).
"# LLM_Build" 
