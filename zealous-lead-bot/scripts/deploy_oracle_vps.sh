#!/bin/bash
# ==============================================================================
# BWB Media - Oracle Cloud Always Free VPS 1-Click Deployment Script
# OS: Ubuntu 22.04 LTS / Ubuntu 24.04 LTS (AMD64 or ARM64 Ampere)
# ==============================================================================

set -e

echo "========================================================"
echo "🚀 Starting BWB Media Lead Bot Setup on Oracle Cloud VPS"
echo "========================================================"

# 1. Update OS Packages
echo "🔄 [1/7] Updating system packages..."
sudo apt update -y && sudo apt upgrade -y
sudo apt install -y curl wget git unzip iptables iptables-persistent netfilter-persistent build-essential

# 2. Open Oracle Cloud Ubuntu iptables Firewall Ports (3000, 80, 443)
# Note: Oracle Cloud Ubuntu images enforce strict iptables blocking by default.
echo "🛡️ [2/7] Configuring internal iptables firewall rules for ports 3000, 80, 443..."
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT || sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT || sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT || sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
sudo netfilter-persistent reload

# 3. Install Node.js 20 LTS
echo "📦 [3/7] Installing Node.js 20 LTS..."
if ! command -v node &> /dev/null || [[ $(node -v | cut -d'.' -f1 | sed 's/v//') -lt 18 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi

echo "✅ Node.js Version: $(node -v)"
echo "✅ NPM Version:     $(npm -v)"

# 4. Install Global Production Tools (PM2)
echo "⚡ [4/7] Installing PM2 Process Manager globally..."
sudo npm install -g pm2

# 5. Project Dependencies Setup
echo "📂 [5/7] Installing application dependencies..."
cd "$(dirname "$0")/.."
mkdir -p data logs data/auth_info_baileys
npm install --omit=dev

# 6. PM2 Process Launch
echo "🚀 [6/7] Starting BWB Media Bot with PM2..."
pm2 delete bwb-media-bot 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

# 7. Configure PM2 System Auto-start on Server Boot
echo "🔄 [7/7] Enabling PM2 auto-start on server reboot..."
pm2 startup systemd -u $USER --hp $HOME | grep "sudo env" | bash 2>/dev/null || true
pm2 save

echo ""
echo "========================================================"
echo "🎉 DEPLOYMENT COMPLETE! 24/7 VPS SERVICE IS LIVE!"
echo "========================================================"
echo "📍 Access your Web Dashboard at:"
echo "   http://$(curl -s ifconfig.me):3000/login"
echo "   http://$(curl -s ifconfig.me):3000/qr"
echo ""
echo "🔑 Login Credentials:"
echo "   UID:      biswa342"
echo "   Password: Biswa4404@"
echo ""
echo "📊 PM2 Helpful Commands:"
echo "   pm2 status            (Check bot status)"
echo "   pm2 logs bwb-media-bot (View live logs)"
echo "   pm2 restart bwb-media-bot (Restart bot)"
echo "========================================================"
