# SEO AI Agent — Phase 1

A working end-to-end loop: **browser → Cloudflare Pages Function → Cloudflare Workers AI (Head Agent) → back to browser.**
No specialist agents run yet — they're status placeholders. No Google Drive yet. No local installs required anywhere in this process.

---

## What's in this folder

```
SEO-AI-AGENT/
├── index.html              Dashboard UI
├── style.css                Styling
├── app.js                   Frontend logic (talks only to /api/task)
├── functions/
│   ├── api/
│   │   └── task.js          The live backend endpoint
│   └── lib/
│       └── callLLM.js       Provider-agnostic LLM abstraction
└── README.md                 This file
```

---

## Deploy — entirely in the browser, nothing installed on your laptop

### Step 1 — Put the code on GitHub (via the website, no git install needed)

1. Go to github.com and log in (create a free account if you don't have one).
2. Click **New repository** → name it `seo-ai-agent` → keep it Public or Private, your choice → **Create repository**.
3. On the new repo's page, click **Add file → Upload files**.
4. Drag in all the files and folders from this project (`index.html`, `style.css`, `app.js`, and the whole `functions/` folder with its contents). GitHub's uploader preserves folder structure when you drag a folder in.
5. Scroll down, click **Commit changes**.

### Step 2 — Connect Cloudflare Pages to that repo

1. Go to the Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Authorize Cloudflare to access your GitHub account, then select the `seo-ai-agent` repository.
3. Build settings: this is a static site with no build step, so:
   - **Framework preset:** None
   - **Build command:** (leave empty)
   - **Build output directory:** `/` (the repo root)
4. Click **Save and Deploy**. Cloudflare will build and give you a URL like `seo-ai-agent-xyz.pages.dev`.

### Step 3 — Add the Workers AI binding (this is what makes `/api/task` work)

The Head Agent calls Cloudflare Workers AI through a **binding**, not an API key, so there's no secret to create for Phase 1 — you just need to attach the binding:

1. In your Pages project, go to **Settings → Functions**.
2. Scroll to **AI bindings** → click **Add binding**.
3. Variable name: `AI` (must match exactly — this is what `env.AI` refers to in `callLLM.js`).
4. Save.
5. Go to **Deployments**, and re-deploy the latest deployment (or push any small change to GitHub) so the binding takes effect. Bindings only apply to deployments made after they're added.

### Step 4 — Test it

1. Open your `*.pages.dev` URL.
2. Type a task, e.g. *"Analyze my website and create a complete SEO content strategy for a small bakery in Austin, TX."*
3. Click **Start task**.
4. You should see: the Head Agent's status dot go amber then green, the workflow steps light up in order, and the **Final result** panel fill in with a plan (which specialist would own each subtask) and a short summary written by the Head Agent itself.

If something goes wrong, the button stops spinning and a red error message appears — it will tell you specifically what failed (bad request, model error, binding missing, etc.) rather than failing silently.

---

## Confirming "no API keys in frontend"

Open your browser's DevTools → **Sources** (or **View Page Source**) on the deployed site and check `index.html`, `style.css`, `app.js`. There is no key, token, or provider name anywhere in them — the frontend only ever calls its own `/api/task` path.

---

## What to try / what to expect right now

- The Head Agent is real and responds to whatever task you type.
- The other 8 agents only show as roster rows with a static "placeholder" dot — they don't run yet.
- Refreshing the page resets everything (nothing is saved yet — that's Phase 2+, once KV/R2 storage is added).
- If Workers AI's free-tier limit is hit on a given day, `/api/task` will return a clear error rather than hanging.

---

## Once you've tested this successfully

Let me know and we'll move to Phase 2: the Head Agent's plan actually driving 2–3 real specialist agents, with results assembled into one report.
