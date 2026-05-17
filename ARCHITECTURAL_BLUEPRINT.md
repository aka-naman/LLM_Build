# 🏗️ Technical Architectural Blueprint: Multi-User Dynamic Form Builder

## 1. System Overview
A self-hosted, multi-tenant SaaS-style application for dynamic form generation and data collection. The system is designed for high-performance local inference (AI) and strict data isolation.

### Technical Stack
- **Frontend**: React 18 (Vite), Context API (State), Vanilla CSS (UI/UX).
- **Backend**: Node.js, Express.js (REST API).
- **Database**: PostgreSQL 15+ (Relational + JSONB).
- **AI/ML**: Qwen-2.5-Coder (3B/0.5B), GGUF Format, `node-llama-cpp`.
- **Process Management**: PM2 (Ecosystem).

---

## 2. Database Architecture & Data Modeling

### 2.1 Core Schema
The database uses a hybrid Relational-EAV (Entity-Attribute-Value) approach to handle dynamic form structures without frequent DDL changes.

- **`users`**: Identity management with `role` (admin/user).
- **`forms`**: Metadata (title, description, owner_id).
- **`fields`**: Form definitions (type, label, options, validation rules).
- **`submissions`**: Flat entry tracking (form_id, user_id, submitted_at).
- **`responses`**: The EAV layer or JSONB blob (depending on migration state) mapping `field_id` to `value`.

### 2.2 Advanced Data Types
- **Zoned Groups**: Hierarchical organizational data (Zone I-VIII -> State -> District -> Group).
- **Composite Fields**: 
    - **Address**: Structured JSON containing Pincode, State, District.
    - **CGPA**: Calculated via `(Obtained / Max) * 95` (Factor-based conversion).
- **Separators**: Internal storage uses ` ||| ` as a delimiter for multi-select/composite values, converted to `, ` during export.

### 2.3 Persistence Logic
- **Incremental Learning**: When a user selects "Other" in autocomplete fields, the backend triggers an `UPSERT` into reference tables (`states`, `districts`, `groups`), making the data immediately available for global recommendations.

---

## 3. AI Engine: Universal Data Explorer

### 3.1 Model Distillation Pipeline
The project utilizes a **Knowledge Distillation** workflow to achieve low-latency SQL generation on consumer hardware.

1.  **Teacher Model**: `Qwen-2.5-Coder-3B-Instruct`. High reasoning, slow inference (~40s).
2.  **Dataset Generation**: A script (`generate-bespoke-dataset.js`) uses the Teacher to generate 7,500+ pairs of Natural Language Questions -> Complex EAV SQL Joins.
3.  **Fine-Tuning**: Performed on Google Colab (T4) using **Unsloth (LoRA/QLoRA)**.
4.  **Student Model**: `Qwen-2.5-Coder-0.5B`. Distilled "EAV-Expert".
5.  **Inference**: GGUF quantization (Q4_K_M) via `node-llama-cpp`.
    - **Performance**: <200ms latency for SQL generation.

### 3.2 Text-to-SQL Logic
- **Context Injection**: The `textToSql.js` service injects the current form schema (field names and IDs) into the prompt.
- **EAV Mapping**: The model is trained to understand that `Field "Name"` corresponds to `responses.field_id = X`.
- **Security**: Generated SQL is restricted to `SELECT` operations and scoped to the user's accessible `form_id`s.

---

## 4. Multi-Tenancy & Security

### 4.1 Isolation Layers
- **Database Level**: Every query on `forms` and `submissions` includes a `WHERE owner_id = $1` or `WHERE user_id = $1` filter.
- **Middleware**: `auth.js` verifies JWTs and populates `req.user`.

### 4.2 Permission Workflow
- **State Machine**: Requests transition through `Pending` -> `Approved` | `Ignored`.
- **Shadow Ignoring**: "Ignored" requests remain "Pending" for the requester to prevent social friction, but are filtered out of the owner's active notification queue.

---

## 5. Audit & Versioning

### 5.1 Submission Auditing
- Every update to a submission creates a snapshot in the `submission_audit_log`.
- **Diffing**: The frontend `Audit History Viewer` compares chronological snapshots to visualize changes over time.

---

## 6. Execution Flow (Request/Response)

1.  **Form Submission**:
    - Frontend validates (Regex/Required).
    - POST `/api/forms/:id/submit`.
    - Backend parses composite fields (CGPA/Address).
    - Transactional Write: `INSERT submission` -> `BATCH INSERT responses`.
2.  **Data Export**:
    - GET `/api/export/:formId`.
    - SQL Join: `submissions` + `responses` + `fields`.
    - Post-processing: Replace ` ||| ` with `, `.
    - Stream Excel file to client.

---

## 7. Performance Optimizations
- **Server-Side Pagination**: Used in `SubmissionsPage.jsx` and `AdminDashboardPage.jsx` to handle 10k+ records.
- **Sticky Headers/Footers**: CSS-based UX optimization for long form-building sessions.
- **Debounced Autocomplete**: 300ms delay on university/group searches to minimize DB load.
