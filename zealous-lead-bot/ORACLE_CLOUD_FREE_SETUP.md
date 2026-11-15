# 🌐 Oracle Cloud "Always Free" VPS Complete Setup Guide
### BWB Media AI Lead Bot & WhatsApp 24/7 Cloud Hosting

Oracle Cloud har user ko **Lifetime 100% Free Cloud VPS** deta hai jisme aapka bot 24 ghante, 365 din bina laptop on rakhe cloud me chalta rahega. WhatsApp session kabhi disconnect nahi hoga.

---

## 📌 Step 1: Oracle Cloud Free Tier Account Banayein
1. Browser me open karein: **[https://cloud.oracle.com/free](https://cloud.oracle.com/free)**
2. **"Start for free"** button par click karein.
3. Apna Name, Email, aur Country (India) enter karein.
4. Account Type: **Individual** chunein.
5. Home Region: Koi bhi paas ka region chunein (jaise **India South - Hyderabad** ya **India Central - Mumbai**).
6. Identity Verification ke liye International Debit/Credit Card lagega (verification ke liye ₹100-150 katenge jo 1-2 din me **refund** ho jate hain). **Zero charge** hota hai lifetime.

---

## 📌 Step 2: "Always Free" Ubuntu Compute VM Banayein
1. Oracle Cloud Dashboard me login hone ke baad:
   - Left menu (☰) -> **Compute** -> **Instances** par jayein.
   - Click karein: **"Create instance"**.
2. **Name:** `bwb-media-server` likhein.
3. **Placement & Availability Domain:** Default chhod dein.
4. **Image and Shape:**
   - **Image:** Click **Edit** -> Select **Canonical Ubuntu 22.04 LTS** ya **24.04 LTS**.
   - **Shape:** 
     - *Option A (AMD):* `VM.Standard.E2.1.Micro` (1 GB RAM, Always Free)
     - *Option B (Ampere ARM - Best):* `VM.Standard.A1.Flex` (Up to 4 OCPU, 24 GB RAM Always Free).
5. **Networking:**
   - "Assign a public IPv4 address" ko **Yes** rakhein.
6. **Add SSH Keys (Sabse Important):**
   - **"Generate SSH key pair"** par click karein.
   - **"Save private key"** button par click karke key file download kar lein (e.g. `ssh-key.key`). Ise sambhal kar rakhein!
7. **Boot Volume:** 50 GB (Default Always Free).
8. Click karein: **"Create"** (Instance 1-2 minute me `RUNNING` ho jayega).
9. Page par se apna **Public IP Address** copy kar lein (jaise `129.154.xx.xx`).

---

## 📌 Step 3: Oracle VCN Ingress Rules Me Port 3000 Open Karein (Most Important)
> **Note:** Log aksar yeh step bhool jate hain jisse dashboard open nahi hota. Yeh zaroor karein:

1. Instance page par niche scroll karein -> **Primary VNIC** ke andar **Subnet** link par click karein.
2. Subnet page par **Default Security List for...** par click karein.
3. Click karein: **"Add Ingress Rules"**:
   - **Source Type:** CIDR
   - **Source CIDR:** `0.0.0.0/0`
   - **IP Protocol:** TCP
   - **Destination Port Range:** `3000, 80, 443`
   - **Description:** `BWB Media Web Dashboard & Webhook`
4. Click karein: **"Add Ingress Rules"**.

---

## 📌 Step 4: Windows PowerShell Se VPS Me Connect Karein
Apne Windows PC me PowerShell open karein aur yeh command chalayein (apna private key path aur Public IP replace karein):

```powershell
ssh -i "C:\path\to\your\ssh-key.key" ubuntu@<YOUR_VPS_PUBLIC_IP>
```
*(First time `Are you sure you want to continue connecting (yes/no)?` aane par `yes` likhkar Enter karein).*

---

## 📌 Step 5: BWB Media Bot Code Upload & 1-Click Launch

### Tareeka A: Desktop ZIP File Se Upload Karna (Sabse Aasan)
Apne Windows PC se VPS par ZIP file upload karne ke liye PowerShell me:
```powershell
scp -i "C:\path\to\your\ssh-key.key" "C:\Users\dell\OneDrive\Desktop\zealous-lead-bot.zip" ubuntu@<YOUR_VPS_PUBLIC_IP>:~/zealous-lead-bot.zip
```

Phir VPS terminal me:
```bash
# ZIP extract karein
sudo apt install -y unzip
unzip zealous-lead-bot.zip -d bwb-bot
cd bwb-bot

# 1-Click Setup Script chalayein
chmod +x scripts/deploy_oracle_vps.sh
./scripts/deploy_oracle_vps.sh
```

### Tareeka B: GitHub Repository Se Clone Karna
```bash
git clone <YOUR_GIT_REPO_URL> bwb-bot
cd bwb-bot
chmod +x scripts/deploy_oracle_vps.sh
./scripts/deploy_oracle_vps.sh
```

---

## 📌 Step 6: Web Dashboard Open Karein & WhatsApp QR Scan Karein
Setup script complete hote hi aapka bot cloud me 24/7 background me start ho jayega.

1. Kisi bhi browser (mobile ya PC) me open karein:
   ```text
   http://<YOUR_VPS_PUBLIC_IP>:3000/login
   ```
2. **Login Credentials:**
   - **UID:** `biswa342`
   - **Password:** `Biswa4404@`
3. Sidebar me **"WhatsApp Web QR"** (`/qr`) par jayein.
4. Apne mobile WhatsApp se QR code scan karein:
   - WhatsApp -> Linked Devices -> Link a Device -> Scan QR.
5. **Congratulations!** WhatsApp ab 24/7 lifetime cloud VPS par connected rahega!

---

## 📌 Step 7: Useful PM2 Commands (Management)
VPS terminal me jab chahein ye commands chala sakte hain:

```bash
# Bot status dekhne ke liye
pm2 status

# Live messages aur logs dekhne ke liye
pm2 logs bwb-media-bot

# Bot restart karne ke liye
pm2 restart bwb-media-bot

# Bot stop karne ke liye
pm2 stop bwb-media-bot
```

---

## 📌 Step 8: Meta (Instagram & Facebook) Webhook URL
Meta Developer Portal me Webhook URL set karein:
- **Callback URL:** `http://<YOUR_VPS_PUBLIC_IP>:3000/webhook`
- **Verify Token:** `my_secure_lead_bot_token_123`

*(Agar Meta HTTPS maange to aap Cloudflare Free CDN use karke apna domain VPS IP se connect kar sakte hain ya Nginx Let's Encrypt SSL chala sakte hain: `sudo certbot --nginx -d yourdomain.com`).*
