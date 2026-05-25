# The Vault — Memorabilia Registry

A PWA (Progressive Web App) for tracking your sports memorabilia collection with AI-powered photo recognition.

---

## Setup Instructions

### 1. Supabase — Run the database schema

1. Go to [supabase.com](https://supabase.com) → open your project
2. Click **SQL Editor** in the left sidebar
3. Paste the entire contents of `supabase-setup.sql` and click **Run**
4. You should see "Success" — this creates your items table and image storage bucket

---

### 2. Vercel — Add environment variables

Go to your Vercel project → **Settings** → **Environment Variables** and add these:

| Name | Value |
|------|-------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key from console.anthropic.com |
| `VITE_SUPABASE_URL` | `https://uqvgknwhkliatfmqlrhr.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key |

> ⚠️ Never put your Anthropic API key in any file — only in Vercel's environment variables dashboard.

---

### 3. GitHub → Vercel — Deploy

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New Project**
3. Import your GitHub repo
4. Framework: **Vite**
5. Click **Deploy**

Vercel auto-deploys on every push to main.

---

### 4. Install on iPhone (PWA)

1. Open your Vercel URL in **Safari** on your iPhone
2. Tap the **Share** button (box with arrow)
3. Tap **Add to Home Screen**
4. Tap **Add**

The Vault now appears as an app icon on your home screen.

---

### 5. Local development

```bash
npm install
cp .env.example .env.local
# Edit .env.local and add your real keys
npm run dev
```

Note: Photo recognition won't work locally unless you also run the serverless function. Use `vercel dev` instead of `npm run dev` for full local testing.

---

## How photo recognition works

1. Tap **+ Add** in the app
2. Tap the photo drop zone — this opens your camera on iPhone
3. Take a photo of your item
4. The image is sent to `/api/analyze` (a Vercel serverless function)
5. The serverless function calls the Anthropic API securely using your server-side API key
6. Claude identifies the item and returns structured data
7. All fields auto-fill — review, adjust if needed, and save
