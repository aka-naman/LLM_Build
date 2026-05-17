 client\src\pages\FormSubmitPage.jsx: const cgpa_converter  inside render field

  
   1. Check Browser Console (CRITICAL):
      On the computer where login is failing, press F12 and look at the Console tab.
       * If you see ERR_CONNECTION_REFUSED to http://localhost:5000/..., the build failed to update or you have a hidden .env file in the client/ folder override.
       * If you see 500 Internal Server Error, the issue is your Database connection on the server.

   2. Verify DB Configuration:
      Ensure your .env in the root folder uses DB_HOST=localhost (if Postgres is on the same machine) and the correct password. If the server cannot talk to the database, login will fail even with the right
  credentials.

If rebuilding the frontend doesn't work, we need to move from "restarting" to "Active Diagnostics." Here is the industry-level troubleshooting roadmap to find the exact bottleneck:

  1. The "Health Check" Test
  On the computer where login is failing, open a new tab and go to:
  http://<YOUR_HOST_IP>:5000/api/health

   * If it shows {"status":"ok"}: Your network and server are fine. The issue is definitely the Frontend-to-Backend URL mapping.
   * If it shows "Timed Out" or "Refused": Your computer's Firewall is blocking port 5000. You need to "Allow an app through Windows Firewall" for Node.js.

  2. The "Database Bridge" Issue
  Sometimes the server starts, but it cannot talk to PostgreSQL.
   * The Symptom: You hit "Login," the spinner spins forever, or returns a 500 Internal Server Error.
   * The Check: Look at the terminal where your server is running. If you see Connection Refused or Password authentication failed for user postgres, your backend is alive but "blind" to the data.
   * Fix: Ensure your .env has DB_HOST=127.0.0.1 (if DB is on the same machine) and that the Postgres service is actually running.

  3. The "CORS" Security Block
  Browsers have a security feature called CORS. If your frontend thinks it's at localhost:5173 but the backend is at 192.168.x.x:5000, the browser might block the login for safety.
   * Diagnostic: Open F12 Console. Look for a red error saying: "Blocked by CORS policy: No 'Access-Control-Allow-Origin' header."
   * Fix: I will double-check the server/index.js file to ensure cors() is configured to allow all LAN connections.

  4. Direct Database Check (The "Forgotten Admin" Case)
  Are you sure the user exists in the database?
   * Diagnostic: Run this command in your project root:

   1     node -e "const p=require('./server/db/pool'); p.query('SELECT username, role FROM users').then(r=>console.log(r.rows))"
      This will print every registered user. If the list is empty, you need to register a new account first.

  5. Final "Hardcoded" Killswitch
  If all else fails, we can force the API URL into the code without using environment variables. I can write a script to surgically replace every instance of import.meta.env.VITE_API_URL with the literal
  string of your IP.

  ---

  My recommendation:
  Try the Health Check (Step 1) right now.
  Does http://<YOUR_HOST_IP>:5000/api/health load a JSON response?



