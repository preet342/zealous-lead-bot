# 🌐 Purana Laptop / Local PC + Cloudflare Tunnel (100% Free Forever)
### Zero Credit Card Needed • Permanent WhatsApp Baileys 24/7 Host

Yeh tareeka sabse aasan aur 100% safe hai kyunki:
1. **Zero Credit Card:** Kisi bhi card verification ki zaroorat nahi hai.
2. **Global HTTPS URL:** Cloudflare aapko globally accessible secure link de deta hai jisse aap mobile phone ya bahar se bhi dashboard use kar sakte hain.
3. **WhatsApp Disconnection Zero:** WhatsApp session aapke laptop me store rehta hai, isliye session kabhi delete nahi hoga.

---

## 🚀 Step 1: 1-Click Launch (Start Karna)

Apne project folder me jakar bas **`start_live_cloudflare.bat`** file par double-click karein:

1. Yeh script automatically official `cloudflared` binary download kar lega (agar pehle se nahi hai).
2. Server port 3000 par start karega.
3. Cloudflare Tunnel activate karke terminal me aapko live global link dikhayega:
   ```text
   ================================================================
   🎉 BWB MEDIA IS NOW 100% LIVE ON THE INTERNET! (CLOUDFLARE)
   ================================================================
   🔗 Public Web Dashboard:  https://xxxx-xxxx.trycloudflare.com/login
   📱 WhatsApp QR Scanner:   https://xxxx-xxxx.trycloudflare.com/qr
   📨 Live Unified Inbox:    https://xxxx-xxxx.trycloudflare.com/inbox
   ⚡ Meta / FB Webhook URL: https://xxxx-xxxx.trycloudflare.com/webhook
   ----------------------------------------------------------------
   🔑 Login Credentials:
      UID:      biswa342
      Password: Biswa4404@
   ================================================================
   ```
4. Ab aap apne mobile phone ke Chrome/Safari browser me upar diya gaya `https://...trycloudflare.com/login` open karein aur login karein!

---

## 💻 Step 2: Laptop Ka Dhakkan (Lid) Band Rakh Kar 24/7 Kaise Chalayein?
> Agar aap chahte hain ki laptop ka screen/dhakkan band ho jaye par bot 24 ghante background me chalta rahe:

1. Keyboard par press karein: **`Win + R`**
2. Type karein: `control powercfg.cpl` aur Enter dabayein (Power Options khulega).
3. Left side me click karein: **"Choose what closing the lid does"** (Lid band karne par kya ho).
4. **"When I close the lid"** setting me:
   - **Plugged in:** Select karein **"Do nothing"** (Kuch na karein).
   - **On battery:** (Optional) Select karein **"Do nothing"**.
5. Click karein: **"Save changes"**.
6. **Result:** Ab aap laptop ko charger se connect karke dhakkan band karke side me rakh sakte hain — bot aur tunnel 24/7 bina ruke chalte rahenge!

---

## ⚡ Step 3: Laptop On Hote Hi Bot Automatically Start Ho Jaye (Auto-Startup)
Agar light chali jaye ya laptop restart ho, aur aap chahte hain ki bot bina click kiye apne aap start ho jaye:

1. Keyboard par press karein: **`Win + R`**
2. Type karein: **`shell:startup`** aur Enter dabayein (Windows Startup folder khulega).
3. Apne project folder se **`start_live_cloudflare.bat`** file par right-click karein -> **Create shortcut** (Shortcut banayein).
4. Us shortcut ko cut karke **Startup folder** me paste kar dein.
5. **Result:** Jab bhi laptop on hoga, aapka bot aur Cloudflare tunnel automatically background me live ho jayenge!

---

## 🔗 Step 4: Meta / WhatsApp / Instagram Webhook Set Karna
Meta Developer Portal (developers.facebook.com) me webhook URL daalna ho:
- **Callback URL:** `https://xxxx.trycloudflare.com/webhook`
- **Verify Token:** `my_secure_lead_bot_token_123`

---

## 🌐 Step 5: (Optional) Permanent Custom Domain (jaise `bot.bwbmedia.com`)
Agar aap random `trycloudflare.com` link ke badle apna khud ka custom domain use karna chahte hain:
1. Cloudflare.com par free account banayein aur apna domain add karein.
2. Cloudflare Zero Trust Dashboard me **Tunnels** -> **Create a Tunnel** karein.
3. Service: `HTTP` -> `localhost:3000` set karein.
4. Domain: `bot.yourdomain.com` map kar dein.
5. Lifetime permanent custom domain URL ready ho jayega ₹0 me!
