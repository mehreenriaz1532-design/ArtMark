# Artmark: put it online (GitHub + Vercel + Supabase + Pusher)

After these steps anyone you send the link to can **sign up with email + password, log in, and chat with other users**, and use the **AI art critic**.

**No API key is stored in any file or on GitHub.** All keys live only in Vercel's Environment Variables. The website asks the server for its *public* settings when it opens.

## Your keys: what is secret and what is not
| Value | Secret? | Where it goes |
|---|---|---|
| `ANTHROPIC_API_KEY` | **SECRET** | Vercel env var only |
| `PUSHER_SECRET` | **SECRET** | Vercel env var only |
| `PUSHER_APP_ID` | private (not needed by this site) | leave it out, or Vercel env var only |
| Supabase `service_role` key | **SECRET** | never use it here |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | public by design | Vercel env var |
| `PUSHER_KEY`, `PUSHER_CLUSTER` | public by design | Vercel env var |

"Public by design" means every website of this type shows them to the browser (you can see them in any site's network tab). They are safe because the database has login rules and Pusher channels are authorised by your server.

> **Important:** if you ever pasted a secret into a chat, an email or a file, treat it as leaked. In Pusher: *App Keys → regenerate the secret*. Then put the new one only in Vercel. Do the same for any Anthropic key.

## Step 1: Supabase (accounts + chat database)
1. supabase.com → **New project**. Wait until it is ready.
2. **SQL Editor → New query** → paste all of `supabase.sql` → **Run**.
3. **Authentication → Providers → Email**: keep Email on. For the first test turn **"Confirm email" OFF**. (Turn it on later and set up an email sender/SMTP.)
4. **Authentication → URL Configuration**: Site URL = your final website address (Step 3). Add it to Redirect URLs too (needed for the "forgot password" email link).
5. **Project Settings → API**: copy **Project URL** and the **anon public** key.

## Step 2: Pusher (online dots + typing)
1. In your Pusher Channels app open **App Settings** and turn **"Enable client events" ON**, then Save.
2. **App Keys**: note the key and cluster. Regenerate the secret if it was ever shared.

Pusher only adds "online" dots and "typing…". Messages themselves are stored in Supabase, so chat still works even if Pusher is off.

## Step 3: GitHub + Vercel
1. GitHub → New repository → upload everything in this folder (`index.html`, `api/`, `supabase.sql`, `README.md`, `.gitignore`). There are no keys in these files.
2. vercel.com → **Add New → Project** → import the repository → **Deploy**.
3. Vercel → project → **Settings → Environment Variables** → add:

| Name | Value |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | anon public key |
| `PUSHER_KEY` | your Pusher key |
| `PUSHER_CLUSTER` | `us2` |
| `PUSHER_SECRET` | your Pusher secret |
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `ANTHROPIC_MODEL` | optional; a current model name from the Anthropic docs (default `claude-sonnet-5-5`) |

4. **Deployments → Redeploy** so the variables are used.
5. Put your real Vercel address in Supabase **Site URL** (Step 1.4).

(GitHub Pages cannot run the `api/` folder, so keys cannot be hidden there. Use Vercel.)

## Step 4: check the setup
Open `https://YOUR-SITE/api/health`. You should see `true` for all three items (it shows only yes/no, never a key).

## Step 5: test with a friend before sharing widely
1. Open your link, **Sign up** as User A, open **Chat** once.
2. In a private window or on a friend's phone: **Sign up** as User B, open **Chat** once.
3. A: **Chat → New chat** → search B's name → send "hello". B sees it immediately. You should also see a green "online" dot and "typing…".
4. **New group** → copy the invite code → B taps **Join** and pastes it.
5. **AI Critic** → add a photo → Review.
6. **Forgot password** with a real email.

## What is protected
- Secrets (`ANTHROPIC_API_KEY`, `PUSHER_SECRET`) exist only on the server and are never sent to a browser.
- `/api/ai` and `/api/pusher-auth` only answer logged-in users. The AI is limited to 20 requests per user per hour. Pusher chat channels only admit members of that chat.
- `/api/config` refuses to start if the Supabase key looks like a `service_role`/secret key.
- Chat text is encrypted in the browser before it is stored.

## Things to know
- If someone clears their browser data they lose their chat key and cannot read old messages.
- Gallery, marketplace and orders are still stored in each person's own browser. Friends chat live but do not see each other's uploads yet. Moving them to Supabase is the next step.
- Payments in Orders are simulated. Use a real payment provider before handling money.
- Screenshot shield is best effort in a browser. It cannot stop phone screenshots or a camera.
- Every AI review uses your Anthropic credit. Set a spending limit in the Anthropic console.
- Before promoting widely, add moderation (report/block), terms and a privacy policy.

## If something does not work
- `/api/health` shows `false`: that variable is missing in Vercel, or you did not redeploy.
- Chat says "Log in to chat" after login: hard refresh; check Supabase values.
- Permission/"not_found" errors: re-run all of `supabase.sql`.
- No live updates: Supabase → Database → Replication → enable Realtime for the `docs` table.
- No online dots or typing: check "Enable client events" in Pusher and that `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER` are set.
- AI says "Server is not configured": add the variables and redeploy.

## Variable names that also work
The server files accept these alternative names, so you do not need to rename anything: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PUSHER_KEY`, `VITE_PUSHER_CLUSTER` (also `NEXT_PUBLIC_…` versions). For the AI critic you can set either `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` (Anthropic is used first if both exist; optional `GEMINI_MODEL`, default `gemini-2.5-flash`). The Pusher secret must be named `PUSHER_SECRET`.

## What's new: shared gallery, ratings, follow requests, orders, reports

This update moves artwork, ratings, follow requests, marketplace listings and commission orders into the shared database, so they are the same for every visitor and every device — not just saved in one browser. It needs the database update below.

### 1. Update the database
Open Supabase → SQL Editor → paste the **whole, updated** `supabase.sql` (it's safe to re-run the earlier parts too) → Run.

### 2. Make yourself an admin (optional, for the Reports page)
Reports people send about artwork, listings, other artists, or a chat message are private — only the person who sent the report and admins can see them. To see them:
1. In Supabase, go to Table Editor → `auth.users`, find your account, and copy its `id` (a long id like `3f29ab1c-...`).
2. SQL Editor → new query → run:
   ```sql
   insert into app_admins (user_id) values ('paste-your-id-here');
   ```
3. Log out and back in to Artmark (admin status, like any permission change, applies the next time you connect, not instantly). A "Reports" tab appears in your menu, visible only to you.

### 3. What changed for people using the site
- **Feed**: search, category filters, and sorting now work across everyone's real uploads, not just your own browser's.
- **Ratings**: one mark per artist per artwork — rating again changes your mark instead of adding a second one, on every device.
- **Profiles**: bio, followers/following counts, and small achievement badges (first upload, 10+ marks received, battle wins, rank tier).
- **Community page** (new, in the menu): every real signed-up artist, so your friends actually show up somewhere.
- **Follow requests**: like a private account — send a request, the other person accepts it, and only then can you message each other. Messaging a seller about a marketplace listing is NOT blocked by this (so buyers can always ask questions).
- **Marketplace & orders**: listings and commission orders are now visible to both sides from any device, including milestone approvals.
- **Reports**: a 🚩 button on artwork, listings, profiles and chat messages. Reports are private (see admin setup above). This is the safe alternative to a developer being able to read everyone's private chats — which this build deliberately does not do, because that would break the end-to-end encryption and create a serious privacy and legal risk for your users.

### Known limitations (so you're not surprised)
- Rank points for being rated/uploading are still only tracked on your own device, not shared yet.
- Payments are still simulated — see the payments section above for connecting a real processor.
- Posting an "update" photo to an existing artwork is saved on your own device only for now (ratings, comments, and the artwork itself ARE shared).
- If someone signed up before this update, their account still works, but a few profile-linking details only apply cleanly to accounts created from now on. If anything about a specific old test account looks odd, the simplest fix is to sign out and sign up again.
