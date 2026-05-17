# 🌐 LAN Hosting Guide

Follow these steps to host this application on your local network (LAN) so others can access it using your computer's IP address.

## 1. Find Your Local IP Address

First, you need to know your computer's IP address on your local network.

1.  Open **Command Prompt** (cmd).
2.  Type `ipconfig` and press Enter.
3.  Look for **IPv4 Address** under your active network adapter (e.g., "Ethernet adapter" or "Wireless LAN adapter Wi-Fi").
    *   It usually looks like `192.168.x.x` (e.g., `192.168.1.15`).

## 2. Configure the Backend (Server)

The backend is already configured to listen on all network interfaces (`0.0.0.0`).

1.  Open `server/.env` (create it if it doesn't exist).
2.  Ensure the `PORT` is set (default is `5000`).
    ```env
    PORT=5000
    DATABASE_URL=your_database_url
    JWT_SECRET=your_secret_key
    ```

## 3. Configure the Frontend (Client)

The frontend needs to know where the backend is located on the network.

1.  Open `client/.env.local`.
2.  Update `VITE_API_URL` to use your computer's IP address instead of `localhost`.
    ```env
    # Replace 192.168.1.15 with YOUR actual IP address
    VITE_API_URL=http://192.168.1.15:5000/api
    ```

## 4. Run the Application

### Option A: Development Mode (with Live Reload)

To run both parts in development mode:

**In the `server` folder:**
```bash
npm start
```

**In the `client` folder:**
```bash
npm run dev -- --host
```
> **Note:** The `--host` flag is crucial! It tells Vite to listen on all network interfaces, making the frontend accessible via your IP.

### Option B: Production Mode (Recommended for Stability)

1.  **Build the Frontend:**
    In the `client` folder:
    ```bash
    npm run build
    ```
    This creates a `dist` folder. You can serve this using a static server or configure the backend to serve it.

2.  **Run with PM2 (if installed):**
    From the root directory:
    ```bash
    pm2 start ecosystem.config.js
    ```

## 5. Accessing from Other Devices

Once the servers are running, other devices on the same Wi-Fi/LAN can access the app:

*   **Frontend:** `http://192.168.1.15:5173` (if using `npm run dev -- --host`)
*   **Backend API:** `http://192.168.1.15:5000/api`

## 6. Troubleshooting

*   **Firewall:** If other devices cannot connect, check your Windows Firewall. You may need to "Allow an app through firewall" for Node.js or open ports `5000` and `5173`.
*   **Same Network:** Ensure both your computer and the other devices (phones, laptops) are connected to the same Wi-Fi router.
*   **IP Change:** Your local IP might change if you restart your router. Check `ipconfig` again if it stops working.
