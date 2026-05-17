# 👥 Multi-User Isolation & Admin Guide

This application supports multiple users with completely isolated workspaces. Each user can create and manage their own forms without seeing or interfering with others.

## 🚀 Getting Started

### 1. Enable User Isolation (Database Migration)
If you are upgrading from a single-user version, you must run the migration script to add user support to your database.

**In the `server` folder:**
```bash
node db/add-user-isolation.js
```
*This will add a `user_id` column to your forms and assign existing forms to the first admin user.*

### 2. Create the Master (Admin) Account
The system is designed so that **the very first user to register** automatically becomes the **Admin (Master)**.

1.  Run the application.
2.  Go to the **Register** page.
3.  Create an account. This account will have "👑 Admin" privileges.
4.  Subsequent users who register will be standard "👤 User" accounts.

## 🔒 User Isolation Features

*   **Private Dashboards:** Regular users only see forms they created.
*   **Ownership Protection:** Users cannot edit, delete, or view submissions for forms they don't own.
*   **Unique Submissions:** Each form has its own submission history tied to the owner's account.

## 👑 Master (Admin) Capabilities

The Admin account has special access to oversee the entire system:

1.  **Global Dashboard:** Access the "📊 Admin Dashboard" from the top header.
2.  **System Stats:** View total users, total forms, and total submissions across the whole platform.
3.  **User Management:** See a list of all registered users and their activity levels.
4.  **Full Access:** Admins can view all forms created by any user.
5.  **Form Oversight:** Admins can view submissions for any form in the system to ensure quality and compliance.

## 📝 Technical Details

*   **Role-Based Access Control (RBAC):** Roles are stored in the `users` table (`role` column: `'admin'` or `'user'`).
*   **Ownership Check:** The backend uses `checkFormOwnership` middleware to verify that `req.user.id` matches the form's `user_id` (or that the user is an admin).
*   **API Security:** All form-related endpoints are protected by JWT authentication.
