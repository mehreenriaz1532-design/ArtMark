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
