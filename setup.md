# 🚀 Agra Sandhani: Complete Offline Setup Guide

This guide provides the exact sequence of commands to set up the **Agra Sandhani** system on a new PC without internet access (Air-Gapped).

## 📦 1. Pre-Migration Checklist
Since the target environment has **no internet**, you MUST ensure the following are copied from the source PC:
1.  **Entire Project Folder**: Including all code.
2.  **`node_modules`**: You must copy the `node_modules` folders in both `client/` and `server/` because `npm install` will not work offline.
    *   *Pro-Tip*: Zip the `node_modules` folder before copying to a USB drive to avoid slow file transfers.
3.  **AI Model**: Ensure `server/models/Qwen-2.5-Coder-3B-SQL-Writer.Q4_K_M.gguf` (or the distilled 0.5B version) is present.
4.  **Environment File**: Ensure the `.env` file exists in the root directory.
5.  **Data Files**: Ensure `server/data/universities.xlsx` and `server/data/india_states_districts.json` are present.

---

## 🗄️ 2. Database Initialization
1.  Open your PostgreSQL terminal (psql) or pgAdmin.
2.  Run the following command to create the database:
    ```sql
    CREATE DATABASE form2builder; 
    ```
3.  **CRITICAL (Offline Prep)**: Connect to the new database and enable the trigram extension manually to ensure autocomplete works:
    ```sql
    \c form2builder;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    ```

---

## ⚙️ 3. Environment Configuration
Check the `.env` file in the root directory and ensure the credentials match your local setup:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=form2builder
DB_USER=postgres
DB_PASSWORD=your_password_here
JWT_SECRET=agra-sandhani-jwt-secret-2026
PORT=5000
```

---

## 🛠️ 4. Migration Sequence
Run these commands in a terminal inside the **`server`** directory in this **exact order**. Each script builds on the previous one.

```bash
cd server

# 1. Core Schema (Users, Forms, Submissions)
node db/migrate.js

# 2. Security (User Isolation logic)
node db/add-user-isolation.js

# 3. Permissions (Access request system)
node db/migrate-collateral.js

# 4. Communications (Notification system)
node db/add-notifications.js

# 5. Advanced Features (Audit Trails, Soft Deletes)
node db/industry-upgrade.js

# 6. Organizational Hierarchy (Zoned Groups)
node db/add-group-type.js

# 7. Intelligence Layer (JSONB & AI Metadata)
node db/ai-upgrade.js

# 8. Team Collaboration (User Delegations)
node db/add-delegations.js

# 9. Extended Analytics (Permission Logs & Acronyms)
node db/upgrade-v2.js

# 10. Financial Data (Bank Details Table)
node db/add-banks.js

# 11. Scaling Optimizations (GIN & Composite Indexes)
node db/add-scaling-indexes.js

# 12. Final Seeding (Universities & Initial Lists)
node db/seed.js
```

### 📁 Mandatory: Uploads Folder
Run this in the `server` folder to ensure the file system is ready for 1GB uploads:
```bash
mkdir uploads
```

---

## 🏃 5. Launching the Application
For a production-ready offline experience (LAN-compatible):

### Step A: Build the Frontend (Do this on the source machine before moving)
```bash
cd ../client
npm run build
```

### Step B: Start the Server
```bash
cd ../server
npm start
```

## 💡 Air-Gapped Optimizations
*   **Fonts**: External Google Fonts have been disabled in `index.css` to prevent hanging on load. The system will use standard local fonts (Segoe UI, Roboto, etc.).
*   **IP Address**: To find your LAN IP for other users to connect, run `ipconfig` in the terminal.
*   **Firewall**: Ensure Port `5000` is allowed in your Windows Firewall.
*   **Persistence**: Once built, the `client/dist` folder can be served by the server, making the entire app a single deployment unit.

---

## 👑 6. First Admin Note
The **first user** to register an account on the new system will automatically be assigned the **Admin** role. All subsequent users will be standard users.
