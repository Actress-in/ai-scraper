FROM node:18-slim

# Chromiumとその依存関係をaptからインストール
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
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
    libasound2 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 依存関係をインストール
COPY backend/package*.json ./
RUN npm install

# Chromiumのパスを確認
RUN which chromium && chromium --version

# アプリケーションコードをコピー
COPY backend/ ./

# ポート公開
EXPOSE 3000

# 環境変数
ENV NODE_ENV=production
ENV PORT=3000
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# アプリケーション起動
CMD ["npm", "start"]
