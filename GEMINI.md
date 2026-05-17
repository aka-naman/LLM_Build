# 📋 Gemini Project Context: Multi-User Dynamic Form Builder

This document provides a comprehensive overview of the Multi-User Dynamic Form Builder project, its architecture, file structure, and core functionalities for the Gemini CLI agent.

---

## 🚀 Project Overview
The **Multi-User Dynamic Form Builder** is a professional, self-hosted web application that allows users to create, manage, and share dynamic forms. It features robust user isolation, version control, Excel exports, and an administrative dashboard for system-wide management. It is designed for both local network (LAN) and production environments.

### Key Use Cases:
- **Dynamic Surveys**: Create forms with various field types (text, rating, linear scale, etc.).
- **Data Collection**: Collect and store submissions with version tracking.
- **Academic/Institutional Use**: Includes specialized features like "University Autocomplete" and "Branch/Stream" selections.
- **Isolated Workspaces**: Multiple users can coexist without seeing each other's data.

---

## 🏗️ System Architecture
The project follows a classic **MERN-like** architecture (PostgreSQL instead of MongoDB):
- **Frontend**: React (Vite) with Context API for state management and Vanilla CSS for styling (Glassmorphism UI).
- **Backend**: Node.js with Express.js, providing a RESTful API.
- **Database**: PostgreSQL for relational data storage, managed via `pg` pool.
- **Authentication**: JWT (JSON Web Tokens) with role-based access control (RBAC).

---

## 📂 Project Structure & File Map

### Root Directory
- `.env`: Environment variables (DB credentials, JWT secret, etc.).
- `docker-compose.yml`: For containerized deployment.
- `ecosystem.config.js`: PM2 configuration for process management.
- `README.md`, `Setup.md`, `MULTIUSER.md`, `HOST.md`, `FIELD_TYPES_GUIDE.md`, `SETUP_OFFLINE.md`, `ARCHITECTURAL_BLUEPRINT.md`: Comprehensive documentation.

### ⚛️ Client (`/client`)
The React frontend built with Vite.
- `src/api/client.js`: Axios instance configured for API communication.
- `src/contexts/`: Split Context pattern (`AuthContext.js` + `AuthProvider.jsx`) for Fast Refresh compatibility.
- `src/components/`:
  - `ProtectedRoute.jsx`: Restricted to logged-in users.
  - `AdminRoute.jsx`: Restricted to users with the `admin` role.
  - `AutocompleteInput.jsx`: Reusable component for university search (Acronym & Dot-agnostic).
  - `NotificationCenter.jsx`: Global alert system for access requests and approvals.
- `src/pages/`:
  - `LoginPage.jsx` / `RegisterPage.jsx`: Authentication views.
  - `DashboardPage.jsx`: Main workspace. Forms are grouped by owner.
  - `FormBuilderPage.jsx`: Core builder interface (Sticky header/footer).
  - `FormSubmitPage.jsx`: Public view with composite fields (CGPA, Address, Zone Group).
  - `SubmissionsPage.jsx`: Dashboard with Server-Side Pagination, Search, and **Audit History Modal**.
  - `AdminDashboardPage.jsx`: **Tabbed Interface** for Stats, User Management, and **Activity History Logs**.

### 🚀 Server (`/server`)
The Express backend.
- `index.js`: Entry point and route registration.
- `db/`:
  - `pool.js`: PostgreSQL connection pool.
  - `migrate.js`, `add-user-isolation.js`, `industry-upgrade.js`, `add-notifications.js`, `migrate-collateral.js`, `add-group-type.js`: Progressive schema migrations.
  - `seed.js`: Initial data (universities, initial group list).
- `middleware/auth.js`: JWT verification and access control logic.
- `routes/`:
  - `admin-users.js`: User management.
  - `auth.js`: User management.
  - `forms.js`: Form CRUD + Duplication.
  - `submissions.js`: Paginated submissions + **Audit History fetching**.
  - `export.js`: Excel generation with **separator cleanup** (`|||` -> `, `).
  - `autocomplete.js`: Dynamic searching for universities and **Zoned Organizational Groups**.
  - `permissions.js`: Access request workflow (Notify Owner + All Admins).
  - `notifications.js`: Alert management.
  - `explorer.js`: Natural language to SQL querying interface.
- `services/`:
  - `textToSql.js`: Local LLM service (Qwen-2.5-Coder-3B) for translating user prompts to PostgreSQL.

---

## 🔐 Security & Roles
- **First-User-Admin**: The system automatically assigns the `admin` role to the first user registered.
- **Role-Based Access Control (RBAC)**:
  - `👑 Admin`: Can view all forms, all users, and system-wide statistics. Can approve any request.
  - `👤 User`: Can manage own forms. Can request access to others.
- **Collaborative Access**: Owners and Admins can grant "Approved" status to other users. "Ignored" status is hidden from requesters (shown as Pending).

---

## 📅 Session Update Log

### 🛠️ Architecture & UI Refinement (April 5, 2026)
- **Organized Admin Dashboard**:
  - Implemented a **Tabbed Layout** to separate "User Activity" from "Approval History".
  - Added **Scrollable Table Wrappers** with sticky headers for large datasets.
  - Integrated a global **Activity History Log** for Admins to track all permission actions.
- **Context Refactoring**:
  - Refactored `AuthContext` and `ThemeContext` into a split pattern (Logic in `.js`, Provider in `.jsx`) to support **React Fast Refresh** and resolve ESLint errors.
- **Validation Fixes**:
  - Resolved a critical bug where **MCQ and Checkbox** fields failed "Required" validation even when filled.
  - Implemented **strict 6-digit Pincode** enforcement for address fields.

### ✨ New Features & Field Types (April 16, 2026)
- **🧮 Dynamic CGPA Converter**:
  - Replaced static presets with a formula-driven system (`Obtained * (95 / Max)`).
  - Added "Auto" and "Manual" factor modes to support varying institutional standards.
  - Integrated into `FormSubmitPage.jsx` with real-time percentage calculation.
- **🏢 Zoned Group Type**:
  - Added a new `zone_group` field type for organizational hierarchy (Zone I-VIII).
  - Features a two-step selection with automatic backend "learning" for new entries.
- **🕒 Audit History Viewer**:
  - Frontend modal in Submissions page allowing owners/admins to view chronological snapshots of every edit made to a submission.

### 🧠 Advanced Intelligence (April 21, 2026)
- **🔍 Universal Data Explorer**:
  - Implemented a natural language interface for querying form submissions.
  - **Model Distillation (Milestone)**: Successfully distilled the 3B Teacher model's logic into a lightweight **0.5B Student model**.
  - **Performance Leap**: Generation speed improved from **~40 seconds to <2 seconds** per query.
  - **Bespoke Dataset**: Generated a 241-entry EAV-specific training dataset to "teach" the Student model the complex SQL patterns.
  - **Local AI Engine**: Powered by `Qwen-2.5-Coder-0.5B` (GGUF via `node-llama-cpp`) with Few-Shot prompting.
  - **EAV-Aware SQL Generation**: The engine generates precise joins and subqueries even in the lightweight 0.5B version.
- **🧠 Intelligent Learning & Autocomplete**:
  - Backend now "learns" and saves new States, Districts, Zones, and Groups entered via the "Other" option.
  - These are automatically merged into the autocomplete/dropdown recommendations for all users.

### 📊 Data & Export
- **Clean Excel Exports**:
  - Updated `export.js` to aggressively replace the internal ` ||| ` separator with a professional `, ` for all composite fields.
  - Soft-deleted submissions are now correctly excluded from Excel exports.
- **Privacy Controls**:
  - "Ignore" actions on access requests no longer notify the requester and appear as "Pending" on their dashboard to prevent friction.

### 🧠 Model Distillation & Fine-Tuning (April 23-24, 2026)
- **High-Speed Knowledge Distillation**:
  - Scaled the EAV-SQL dataset generation to a target of **7,500 entries** using `Qwen-2.5-Coder-3B` as the Teacher model.
  - **Optimization**: Adjusted the local generator (`generate-bespoke-dataset.js`) for RTX 3050 (4GB VRAM) by using 2 workers and a 512 context size to prevent OOM errors.
  - **Quality Audit**: Implemented strict SQL-only extraction rules and subquery enforcement (`s.id IN (...)`) to eliminate conversational filler and logic errors from the Teacher's output.
- **Fine-Tuning Strategy (Local + Cloud Hybrid)**:
  - Established a $0-cost training pipeline using **Google Colab (T4 GPU)** and the **Unsloth** library.
  - Developed a specialized training script (`fine_tune_qwen.py`) to distill the Teacher's SQL reasoning into a ultra-lightweight **Qwen-2.5-Coder-0.5B** Student model.
  - **Deployment Path**: Configured a GGUF export workflow to integrate the 0.5B "EAV Expert" back into the Node.js `textToSql.js` service for sub-200ms query performance.

### 🚀 Scaling & Field Types Upgrade (May 12, 2026)
- **⚡ Scaling for 100k+ Entries**:
  - **GIN Indexing**: Implemented a GIN index on the `submissions.data_json` column to ensure lightning-fast AI Explorer queries even with hundreds of thousands of records.
  - **Streaming Excel Exports**: Refactored the export logic (Standard & AI Explorer) to use **Streaming WorkbookWriter**. This processes data in 2,000-row batches, maintaining low RAM usage and preventing OOM crashes during large exports.
- **📁 Advanced Field Types**:
  - **🏦 Bank Details**: Added a composite field featuring top Indian banks, 12-digit account validation, and IFSC input.
  - **📂 Document Upload**: Implemented a high-capacity file upload system supporting up to **1GB files** (PDF/Images) stored directly on the server's disk (`/server/uploads/`).
- **💾 Data Integrity & Persistence**:
  - **Form Drafts**: Integrated browser `localStorage` to automatically save form state on-the-fly. Data is restored instantly on refresh or re-entry and cleared only after successful submission.
  - **Absolute LAN Links**: Updated export logic to convert relative file paths into clickable **absolute URLs** using the server's local IP, ensuring uploaded documents are accessible from any PC on the LAN.
- **🔐 Security & Isolation**:
  - **Strict Multi-Form Scoping**: The AI Explorer now mathematically restricts its database queries to exactly the forms selected in the UI using `f.id IN (...)` injection.
  - **Privacy Patch**: Hardened the form listing logic to strictly enforce user isolation, closing a loophole where users could see all non-admin forms.
---

