# Gesture Kombat — going live with accounts

About 20 minutes, all free. You'll set up three things:

1. **Supabase** for accounts and emails.
2. **Google** for the "Continue with Google" button.
3. **Netlify** to host the game. Once it's on Netlify, the camera works straight from the link.

---

## 1. Put the game online (Netlify)

1. Go to **app.netlify.com** and sign up.
2. Go to **Add new site → Deploy manually**.
3. Drag the whole `gesture-kombat-site` folder onto the page.
4. Netlify gives you a link like `https://something.netlify.app`. Copy it.
5. Optional: rename it in **Site configuration → Change site name**, for example `gesture-kombat.netlify.app`.

## 2. Create the accounts backend (Supabase)

1. Go to **supabase.com** and select **Start your project**, then **New project**.
   - Pick any name and a strong database password.
   - Choose the region closest to you.
2. Go to **SQL Editor → New query**.
   - Paste everything from `supabase/setup.sql` and select **Run**. It should say "Success".
3. Go to **Authentication → URL Configuration**.
   - Set **Site URL** to your Netlify link.
   - Add the same link under **Redirect URLs**.
4. Go to **Authentication → Sign In / Providers → Email**.
   - Make sure **Email** is enabled and **Confirm email** is ON.
   - Set **Minimum password length** to 8.
   - Set **Email OTP Length** to 6.
5. Go to **Authentication → Emails → Templates**.
   - Open **Confirm signup**:
     - Subject: `Welcome to Gesture Kombat, {{ .Data.username }}`
     - Body: paste `supabase/email-templates/confirm-signup.html`
   - Open **Reset Password**:
     - Subject: `Your Gesture Kombat reset code: {{ .Token }}`
     - Body: paste `supabase/email-templates/reset-password.html`
   - The reset email must show `{{ .Token }}`. That 6-digit code is what players type into the game.
6. Go to **Project Settings → API**. Copy the **Project URL** and the **anon public** key.
   - Paste them into `js/config.js` in the site folder.
   - Then drag the folder onto Netlify again: **Deploys → drag and drop**.

### Emails to real players (important)

Supabase's built-in email sender only delivers to your own team's addresses and only a few per hour. That's fine for testing, but real players won't get emails. Before launch, connect your own sender in **Authentication → Emails → SMTP Settings**.

Easiest option, using a Gmail account:

1. Turn on 2-Step Verification in that Google account.
2. Create an **App password** at myaccount.google.com/apppasswords.
3. In Supabase, enter:
   - Host: `smtp.gmail.com`
   - Port: `465`
   - Username: your Gmail address
   - Password: the app password
   - Sender email: the same Gmail address
   - Sender name: `Gesture Kombat`

Gmail allows about 500 emails a day. For more, use Resend, Brevo or SendGrid with your own domain.

## 3. "Continue with Google"

1. Go to **console.cloud.google.com** and create a project.
2. Set up the consent screen in **APIs & Services → OAuth consent screen**.
   - User type: External.
   - App name: Gesture Kombat.
   - Add your email.
   - Publish the app.
3. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**. Fill in:
   - **Application type:** Web application.
   - **Authorized JavaScript origins:** your Netlify link.
   - **Authorized redirect URIs:** `https://YOUR-PROJECT.supabase.co/auth/v1/callback`. Supabase shows this exact link in the next step.
4. Copy the **Client ID** and **Client secret**.
5. In Supabase, go to **Authentication → Sign In / Providers → Google**.
   - Enable it, paste both values, and **Save**.

## How it works in the game

- **Create account:** players pick a username (availability is checked live), enter an email, and type the password twice. They get the welcome email with a confirm button, then sign in.
- **Continue with Google:** one click. A username is created from their Google name, and they can change it in Account settings.
- **Forgot password:**
  1. The player enters their email and gets a 6-digit code.
  2. They enter the code.
  3. They type the new password twice and are signed in.
  - Codes can be re-sent every 60 seconds.
- **Play as guest:** always available. Guest stats stay in that browser.
- **Signed-in players:** stats are saved to their account and follow them to any device.
- **Downloaded single-file copy:** plays in guest mode. Accounts need the online version.
