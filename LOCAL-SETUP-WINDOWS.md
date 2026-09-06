# Local Development Setup — Windows + VS Code

Step-by-step guide to run the DEV-001 Thyroid Pre-Visit Platform on Windows.  
Estimated total time: **30–40 minutes** (mostly downloads).

---

## 1. What to download and install

Install these in order. Each item below links to the official download page.

### 1a. Git for Windows
**Why:** Provides the `sh` shell the project's package manager setup requires. Also gives you Git.

1. Go to **https://git-scm.com/downloads/win**
2. Download the 64-bit installer and run it
3. During setup accept all defaults — no changes needed
4. ✅ Verify: open **Start → Git Bash**, type `git --version` → should print a version number

---

### 1b. Node.js v22 or v24 (LTS)
**Why:** Runtime for the API server.

1. Go to **https://nodejs.org** → click **"LTS"** to download the Windows installer (`.msi`)
2. Run the installer, accept defaults
3. On the **"Tools for Native Modules"** screen — **check the box** "Automatically install the necessary tools"  
   (This installs Python 3 and the Visual Studio C++ build tools that `argon2` password hashing requires — it runs in a separate PowerShell window after Node.js installs, takes ~5 min)
4. ✅ Verify: open a **new PowerShell window**, type:
   ```
   node --version
   npm --version
   ```
   Both should print version numbers.

> **If you skipped the "Tools for Native Modules" step:** You can install them later by running this in an **Administrator PowerShell**:
> ```powershell
> npm install -g windows-build-tools
> ```

---

### 1c. pnpm
**Why:** The project uses pnpm workspaces; npm will not work.

In any terminal (PowerShell or Git Bash), run:
```powershell
npm install -g pnpm
```

✅ Verify:
```powershell
pnpm --version
```

---

### 1d. PostgreSQL 16 or 17
**Why:** The database.

1. Go to **https://www.enterprisedb.com/downloads/postgres-postgresql-downloads**
2. Download **Windows x86-64**, PostgreSQL 16 or 17
3. Run the installer:
   - Installation directory: leave as default
   - **Password for the `postgres` superuser:** choose something you will remember (e.g. `postgres123`) — you will need this in Step 4
   - Port: **5432** (default)
   - Locale: leave as default
   - Uncheck **Stack Builder** on the last screen (not needed)
4. ✅ Verify: open **Start → pgAdmin 4** — if it opens, PostgreSQL is running

---

### 1e. Visual Studio Code
1. Go to **https://code.visualstudio.com**
2. Download and install the Windows version
3. Recommended extensions (install from VS Code's Extensions panel):
   - **ESLint** (`dbaeumer.vscode-eslint`)
   - **Prettier** (`esbenp.prettier-vscode`)
   - **REST Client** (`humao.rest-client`) — lets you call the API without Postman

---

## 2. Get the project

### If you received a ZIP file:
1. Right-click the ZIP → **Extract All** → choose a folder (e.g. `C:\Projects\thyroid-platform`)
2. Open VS Code → **File → Open Folder** → select that folder

### If you are cloning from Git:
Open Git Bash and run:
```bash
git clone <repository-url> C:/Projects/thyroid-platform
```
Then open VS Code → **File → Open Folder** → `C:\Projects\thyroid-platform`

---

## 3. Open the terminal in VS Code

**Terminal → New Terminal** (or `` Ctrl+` ``)

In the dropdown next to the `+` button, choose **Git Bash** (not PowerShell or cmd).  
All commands in this guide should be run in that Git Bash terminal.

> **Why Git Bash?** The project has a setup script that requires `sh`. PowerShell does not provide it; Git Bash does. Once setup is done, you can use any terminal.

---

## 4. Set up the database

### 4a. Create the database

In VS Code's Git Bash terminal, run:
```bash
psql -U postgres -c "CREATE DATABASE thyroid_dev;"
```

When prompted for a password, enter the one you chose during PostgreSQL installation.

✅ You should see: `CREATE DATABASE`

### 4b. (Optional) Create a dedicated user instead of using postgres

```bash
psql -U postgres -c "CREATE USER thyroid_user WITH PASSWORD 'thyroid_pass';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE thyroid_dev TO thyroid_user;"
```

---

## 5. Set environment variables (.env file)

In VS Code's Git Bash terminal, from the project root folder:

```bash
cp .env.example .env
```

Then open `.env` in VS Code and fill in the following values:

```
# Required — fill in your Postgres details:
DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/thyroid_dev

# Required — generate two random secrets (run the commands below):
JWT_SECRET=REPLACE_ME
MAGIC_LINK_SECRET=REPLACE_ME

# These are already set correctly for local development:
NODE_ENV=development
PORT=5000
SMS_PROVIDER=stub
STORAGE_PROVIDER=stub
EMAIL_PROVIDER=stub
APP_BASE_URL=http://localhost:5000
PORTAL_BASE_URL=http://localhost:5173
```

### Generating the two required secrets

Run these two commands in the Git Bash terminal — each prints a long random hex string. Copy each one into `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Run it once → copy the output → paste as `JWT_SECRET=<output>`  
Run it again → copy the output → paste as `MAGIC_LINK_SECRET=<output>`

Your final `.env` `JWT_SECRET` line should look like:
```
JWT_SECRET=a3f8c2...long hex string...
```

> **Never commit `.env` to Git.** It is already in `.gitignore`.

---

## 6. Install dependencies

In the Git Bash terminal, from the project root:

```bash
pnpm install
```

This downloads all packages and compiles the `argon2` native binary.  
First run takes **2–4 minutes**. You will see a progress bar.

✅ Expect to see something like:
```
Done in 45s using pnpm v10.x.x
```

If you see errors about `node-gyp` or `argon2 build failed`:
- Make sure you installed the Build Tools in Step 1b
- Run this in **Administrator PowerShell**, then retry `pnpm install`:
  ```powershell
  npm install -g node-gyp
  npm install -g windows-build-tools
  ```

---

## 7. Push the database schema

This creates all tables in your `thyroid_dev` database:

```bash
pnpm --filter @workspace/db run push
```

✅ Expect:
```
[✓] Pulling schema from database...
[✓] Changes applied
```

---

## 8. Seed test data

This creates two staff accounts, one test patient, one appointment, and one patient preparation link:

```bash
pnpm --filter @workspace/db run seed
```

✅ You will see a summary printed — **copy it or leave the terminal open**, you will need the credentials in Step 10.

Example output:
```
 ADMIN LOGIN
   Email:     admin@clinic.test
   Password:  Admin1234!admin

 DOCTOR LOGIN
   Email:     dr.jovic@clinic.test
   Password:  Doctor1234!doc

 PATIENT FLOW
   Magic link: http://localhost:5000/prepare/Qss7zA...
   DOB:        1985-03-15
   OTP:        printed in the SERVER CONSOLE when you submit DOB
```

Safe to run again — the script skips records that already exist.

---

## 9. Start the API server

```bash
pnpm --filter @workspace/api-server run dev
```

Wait for:
```
INFO: Server listening
    port: 5000
```

Leave this terminal open.

---

## 9b. Start the clinic portal (UI)

Open a **second** Git Bash terminal and run:

```bash
pnpm --filter @workspace/clinic-portal run dev
```

The UI runs at **http://localhost:5173** and proxies `/api` to the API on port 5000.

Magic links from seed / admin console point to the portal (`PORTAL_BASE_URL`), not the API.

---

## 10. Verify the app is working

### 10a. Health check
```bash
curl http://localhost:5000/api/healthz
```
✅ Expected: `{"status":"ok"}`

### 10b. Staff login (browser)
1. Open http://localhost:5173/login
2. Admin: `admin@clinic.test` / `Admin1234!admin`
3. Doctor: `dr.jovic@clinic.test` / `Doctor1234!doc`

### 10c. Patient flow (browser)
1. Copy the magic link printed by the seed script (or create a new invitation as admin)
2. Open it in the browser (DOB: `1985-03-15` for the seed patient)
3. Read the 6-digit OTP from the **API server terminal** (SMS stub)
4. Complete consent → questionnaire → lab status/documents → done

### 10d. API smoke (optional)
```bash
curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@clinic.test","password":"Admin1234!admin"}'
```

Patient DOB verification returns `{"otpSent":true,"phone":"..."}` (not a sessionId). OTP verify uses `{token, otp}`.

---

## Quick reference

| Task | Command |
|---|---|
| Install dependencies | `pnpm install` |
| Push schema | `pnpm --filter @workspace/db run push` |
| Seed test data | `pnpm --filter @workspace/db run seed` |
| Start API | `pnpm --filter @workspace/api-server run dev` |
| Start UI | `pnpm --filter @workspace/clinic-portal run dev` |
| Type-check | `pnpm run typecheck` |
| Health | http://localhost:5000/api/healthz |
| Portal | http://localhost:5173 |

In `.env` set:
- `APP_BASE_URL=http://localhost:5000`
- `PORTAL_BASE_URL=http://localhost:5173`
- `SMS_PROVIDER=stub`

---

## Troubleshooting

**`sh: command not found` or preinstall fails**  
→ Use Git Bash, not PowerShell/cmd.

**`argon2` build errors / node-gyp fails**  
→ Install Build Tools (Step 1b), then retry `pnpm install`.

**`Cannot connect to database` / `ECONNREFUSED`**  
→ Start PostgreSQL service; check `DATABASE_URL` password/db name.

**`Configuration error: JWT_SECRET: Required`**  
→ Ensure `.env` exists in the project root with secrets filled in.

**Portal loads but API calls fail**  
→ API must be running on 5000; Vite proxies `/api` automatically.

**OTP not in server terminal**  
→ Confirm `SMS_PROVIDER=stub`. Check DOB response for errors first.

**`pnpm` is not recognized**  
→ Reopen terminal; ensure `%APPDATA%\npm` is on PATH.
