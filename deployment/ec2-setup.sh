#!/bin/bash

# AI Scraper Backend - EC2 セットアップスクリプト
# 使い方: ./ec2-setup.sh <EC2-IP-ADDRESS> <PATH-TO-KEY.pem>

set -e

EC2_IP=$1
KEY_FILE=$2

if [ -z "$EC2_IP" ] || [ -z "$KEY_FILE" ]; then
  echo "Usage: ./ec2-setup.sh <EC2-IP-ADDRESS> <PATH-TO-KEY.pem>"
  echo "Example: ./ec2-setup.sh 54.199.217.237 ~/.ssh/crawling-key.pem"
  exit 1
fi

echo "🚀 AI Scraper Backend - EC2セットアップ開始"
echo "EC2 IP: $EC2_IP"
echo ""

# SSH接続テスト
echo "📡 SSH接続テスト..."
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no ubuntu@"$EC2_IP" "echo '接続成功!'"

echo ""
echo "📦 Node.js と依存パッケージをインストール中..."

ssh -i "$KEY_FILE" ubuntu@"$EC2_IP" << 'ENDSSH'
set -e

# システム更新
sudo apt-get update
sudo apt-get upgrade -y

# Node.js 18インストール
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Git インストール
sudo apt-get install -y git

# PM2 インストール (プロセス管理)
sudo npm install -g pm2

# Playwright依存関係インストール
sudo apt-get install -y \
  libnss3 \
  libnspr4 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libdbus-1-3 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2

echo "✅ パッケージインストール完了"
ENDSSH

echo ""
echo "📂 アプリケーションをデプロイ中..."

# ローカルのbackendディレクトリをEC2にコピー
echo "ファイル転送中..."
scp -i "$KEY_FILE" -r ../backend ubuntu@"$EC2_IP":~/

echo ""
echo "🔧 アプリケーションセットアップ..."

ssh -i "$KEY_FILE" ubuntu@"$EC2_IP" << 'ENDSSH'
set -e

cd ~/backend

# 依存パッケージインストール
npm install

# Playwrightブラウザインストール
npx playwright install chromium

# 環境変数設定
cat > .env << EOF
GEMINI_API_KEY=${GEMINI_API_KEY:-your_api_key_here}
PORT=3000
NODE_ENV=production
DEFAULT_TIMEOUT=180000
EOF

echo "✅ アプリケーションセットアップ完了"
ENDSSH

echo ""
echo "🚀 PM2でアプリケーション起動中..."

ssh -i "$KEY_FILE" ubuntu@"$EC2_IP" << 'ENDSSH'
set -e

cd ~/backend

# PM2でアプリケーション起動
pm2 start src/server.js --name ai-scraper-backend

# システム起動時に自動起動
pm2 startup systemd -u ubuntu --hp /home/ubuntu
pm2 save

# ステータス確認
pm2 status

echo "✅ アプリケーション起動完了"
ENDSSH

echo ""
echo "✅ デプロイ完了!"
echo ""
echo "🌐 アプリケーションURL:"
echo "   http://$EC2_IP:3000"
echo ""
echo "📊 確認コマンド:"
echo "   curl http://$EC2_IP:3000/api/health"
echo ""
echo "🔗 Google Apps Scriptで設定するURL:"
echo "   BACKEND_URL: 'http://$EC2_IP:3000'"
echo ""
echo "💡 ログ確認: ssh -i $KEY_FILE ubuntu@$EC2_IP 'pm2 logs ai-scraper-backend'"
echo ""
