#!/usr/bin/env bash
# Cai dat bot-hub (bot FB + bot Zalo + web panel) tren VPS Ubuntu/Debian.
# Chay bang user thuong co quyen sudo:  bash scripts/install-vps.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "==> [1/6] Cai goi he thong"
sudo apt-get update
sudo apt-get install -y curl ca-certificates git build-essential \
  python3 python3-venv python3-pip python3-setuptools ffmpeg

echo "==> [2/6] Node.js (can ban 22 tro len)"
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  MAJOR=$(node -p 'process.versions.node.split(".")[0]')
  [ "$MAJOR" -ge 22 ] && NEED_NODE=0
fi
if [ "$NEED_NODE" = 1 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

echo "==> [3/6] Cai thu vien Node"
npm install --omit=dev --no-audit --no-fund

echo "==> [4/6] Tao moi truong Python cho bot Zalo"
python3 -m venv zalo/.venv
zalo/.venv/bin/pip install --upgrade pip
zalo/.venv/bin/pip install -r zalo/requirements.txt

echo "==> [5/6] File cau hinh .env"
if [ -f .env ]; then
  echo "Da co .env - giu nguyen (APP_SECRET cu van giai ma duoc cookie da luu)."
else
  cp .env.example .env
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  PASS=$(node -e "console.log(require('crypto').randomBytes(9).toString('base64url'))")
  sed -i "s/^APP_SECRET=.*/APP_SECRET=$SECRET/" .env
  sed -i "s/^ADMIN_PASS=.*/ADMIN_PASS=$PASS/" .env
  echo "Da tao .env moi. Dang nhap web bang: admin / $PASS"
fi

echo "==> [6/6] Chay nen bang systemd (tu bat lai khi VPS khoi dong)"
sudo tee /etc/systemd/system/bot-hub.service >/dev/null <<UNIT
[Unit]
Description=Bot hub (FB + Zalo + web panel)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
ExecStart=$(command -v node) index.js
Restart=always
RestartSec=5
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now bot-hub

PORT=$(grep -E '^PORT=' .env | cut -d= -f2 || true)
echo
echo "Xong. Web panel: http://$(curl -fsS https://api.ipify.org 2>/dev/null || echo IP-VPS):${PORT:-3000}"
echo "Xem log:   sudo journalctl -u bot-hub -f"
echo "Khoi dong lai: sudo systemctl restart bot-hub"
