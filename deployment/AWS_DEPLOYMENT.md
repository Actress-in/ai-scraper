# ☁️ AWS デプロイガイド

**AI Scraper BuilderをAWSにデプロイする方法**

---

## 🎯 AWSデプロイオプション

### オプション1: AWS Lambda + API Gateway (推奨・コスト最安)
**料金**: 月間100万リクエストまで無料
- サーバーレス
- 自動スケーリング
- メンテナンス不要

### オプション2: ECS Fargate (コンテナ)
**料金**: 約$15〜30/月
- Dockerコンテナで実行
- 安定した長時間処理
- 自動スケーリング

### オプション3: EC2 (従来型)
**料金**: t3.micro無料枠あり、その後約$8/月〜
- 完全なコントロール
- SSH接続可能
- カスタマイズ自由

---

## 🚀 オプション1: Lambda + API Gateway (推奨)

### メリット
- ✅ **コスト**: 実行時のみ課金（月100万リクエスト無料）
- ✅ **スケーリング**: 自動で負荷に応じて拡張
- ✅ **メンテナンス**: サーバー管理不要

### デメリット
- ⚠️ **タイムアウト**: 最大15分
- ⚠️ **コールドスタート**: 初回実行が遅い

---

## 📦 Lambda デプロイ手順

### ステップ1: Playwrightをビルド

Lambdaでは特別なChromiumビルドが必要です。

```bash
cd backend
npm install @sparticuz/chromium playwright-core
```

### ステップ2: Lambda用のコード作成

`backend/src/lambda.js`を作成:

```javascript
const serverless = require('serverless-http');
const app = require('./server');

// Lambdaハンドラー
module.exports.handler = serverless(app);
```

### ステップ3: PlaywrightをLambda対応に変更

`backend/src/services/PageAnalyzer.js`を編集:

```javascript
const chromium = require('@sparticuz/chromium');
const playwright = require('playwright-core');

async launchBrowser() {
  const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (isLambda) {
    // Lambda環境
    return await playwright.chromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });
  } else {
    // ローカル環境
    return await playwright.chromium.launch({
      headless: true
    });
  }
}
```

### ステップ4: Serverless Framework でデプロイ

#### インストール

```bash
npm install -g serverless
cd backend
npm install serverless-http @sparticuz/chromium playwright-core
```

#### serverless.ymlを作成

```yaml
service: ai-scraper-backend

provider:
  name: aws
  runtime: nodejs18.x
  stage: prod
  region: ap-northeast-1  # 東京リージョン
  timeout: 900  # 15分
  memorySize: 3008  # Chromium用に大きめのメモリ
  environment:
    GEMINI_API_KEY: ${env:GEMINI_API_KEY}
    DEFAULT_TIMEOUT: 180000
    NODE_ENV: production

functions:
  api:
    handler: src/lambda.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
          cors: true
      - http:
          path: /
          method: ANY
          cors: true

package:
  exclude:
    - node_modules/playwright/.local-browsers/**
    - .git/**
    - tests/**
```

#### デプロイ実行

```bash
# AWS認証情報を設定
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key

# デプロイ
serverless deploy
```

デプロイ後、URLが表示されます:
```
endpoints:
  ANY - https://xxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod/{proxy+}
```

---

## 🐳 オプション2: ECS Fargate (Docker)

### メリット
- ✅ **安定性**: 長時間処理に対応
- ✅ **柔軟性**: Dockerなので環境構築が簡単
- ✅ **タイムアウトなし**: 何時間でも実行可能

---

### ステップ1: Dockerfileを作成

`Dockerfile`を作成:

```dockerfile
FROM node:18-slim

# Playwrightの依存関係をインストール
RUN apt-get update && apt-get install -y \
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
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 依存関係をインストール
COPY backend/package*.json ./
RUN npm install

# Playwrightブラウザをインストール
RUN npx playwright install chromium

# アプリケーションコードをコピー
COPY backend/ ./

EXPOSE 3000

CMD ["npm", "start"]
```

### ステップ2: ECRにプッシュ

```bash
# ECRリポジトリ作成
aws ecr create-repository --repository-name ai-scraper-backend --region ap-northeast-1

# ログイン
aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.ap-northeast-1.amazonaws.com

# ビルド
docker build -t ai-scraper-backend .

# タグ付け
docker tag ai-scraper-backend:latest YOUR_ACCOUNT_ID.dkr.ecr.ap-northeast-1.amazonaws.com/ai-scraper-backend:latest

# プッシュ
docker push YOUR_ACCOUNT_ID.dkr.ecr.ap-northeast-1.amazonaws.com/ai-scraper-backend:latest
```

### ステップ3: ECS Fargateでサービス作成

#### AWS CLIで作成

```bash
# クラスター作成
aws ecs create-cluster --cluster-name ai-scraper-cluster --region ap-northeast-1

# タスク定義を登録（task-definition.json参照）
aws ecs register-task-definition --cli-input-json file://task-definition.json

# サービス作成
aws ecs create-service \
  --cluster ai-scraper-cluster \
  --service-name ai-scraper-service \
  --task-definition ai-scraper-task \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx],securityGroups=[sg-xxxxx],assignPublicIp=ENABLED}"
```

#### task-definition.json

```json
{
  "family": "ai-scraper-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "ai-scraper-backend",
      "image": "YOUR_ACCOUNT_ID.dkr.ecr.ap-northeast-1.amazonaws.com/ai-scraper-backend:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "GEMINI_API_KEY",
          "value": "your_api_key"
        },
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/ai-scraper",
          "awslogs-region": "ap-northeast-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### ステップ4: ALB (ロードバランサー) 設定

```bash
# Application Load Balancerを作成
aws elbv2 create-load-balancer \
  --name ai-scraper-alb \
  --subnets subnet-xxxxx subnet-yyyyy \
  --security-groups sg-xxxxx

# ターゲットグループ作成
aws elbv2 create-target-group \
  --name ai-scraper-targets \
  --protocol HTTP \
  --port 3000 \
  --vpc-id vpc-xxxxx \
  --target-type ip
```

---

## 🖥️ オプション3: EC2 (最もシンプル)

### ステップ1: EC2インスタンス起動

1. **AWSコンソール → EC2 → インスタンスを起動**

2. 設定:
   - **AMI**: Ubuntu Server 22.04 LTS
   - **インスタンスタイプ**: t3.small (無料枠ならt2.micro)
   - **セキュリティグループ**: ポート3000, 22を開放
   - **キーペア**: 作成してダウンロード

### ステップ2: SSH接続してセットアップ

```bash
# SSH接続
ssh -i your-key.pem ubuntu@ec2-xx-xx-xx-xx.ap-northeast-1.compute.amazonaws.com

# Node.jsインストール
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# アプリケーションをクローン
git clone https://github.com/your-repo/ai-scraper-builder.git
cd ai-scraper-builder/backend

# 依存関係インストール
npm install
npx playwright install chromium
npx playwright install-deps

# 環境変数設定
sudo nano /etc/environment
# GEMINI_API_KEY=your_key を追加

# PM2でプロセス管理
sudo npm install -g pm2
pm2 start src/server.js --name ai-scraper
pm2 startup
pm2 save
```

### ステップ3: Nginx リバースプロキシ設定

```bash
# Nginxインストール
sudo apt-get install -y nginx

# 設定ファイル作成
sudo nano /etc/nginx/sites-available/ai-scraper
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# 設定を有効化
sudo ln -s /etc/nginx/sites-available/ai-scraper /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### ステップ4: SSL証明書 (Let's Encrypt)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 💰 コスト比較

| サービス | 月額コスト | 特徴 |
|---------|-----------|------|
| **Lambda** | 無料〜$5 | 実行時のみ課金、100万リクエスト無料 |
| **ECS Fargate** | $15〜30 | 常時起動、安定性高い |
| **EC2 t3.micro** | 無料枠あり | 1年間無料、その後$8/月 |
| **EC2 t3.small** | $15/月 | Playwright推奨スペック |

---

## 🔧 環境変数の管理 (AWS Systems Manager)

APIキーを安全に管理:

```bash
# Parameter Storeに保存
aws ssm put-parameter \
  --name "/ai-scraper/gemini-api-key" \
  --value "your_api_key" \
  --type "SecureString"

# Lambda/ECSで読み込み
const AWS = require('aws-sdk');
const ssm = new AWS.SSM();

const getParameter = async (name) => {
  const result = await ssm.getParameter({
    Name: name,
    WithDecryption: true
  }).promise();
  return result.Parameter.Value;
};

const GEMINI_API_KEY = await getParameter('/ai-scraper/gemini-api-key');
```

---

## 📊 ログとモニタリング

### CloudWatch Logs

```bash
# ログ確認
aws logs tail /ecs/ai-scraper --follow
```

### CloudWatch Alarms

```bash
# エラー率が高い場合にアラート
aws cloudwatch put-metric-alarm \
  --alarm-name ai-scraper-errors \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold
```

---

## 🚀 おすすめデプロイ戦略

### 開発段階
**EC2 t3.micro** (無料枠)
- シンプル
- SSH接続でデバッグ可能
- コスト: 無料〜$8/月

### 本番運用 (小〜中規模)
**Lambda + API Gateway**
- コスト効率最高
- スケーラビリティ
- メンテナンス不要
- コスト: 無料〜$10/月

### 本番運用 (大規模・安定重視)
**ECS Fargate + ALB**
- 長時間処理対応
- 安定性
- 自動スケーリング
- コスト: $20〜50/月

---

## 🔐 セキュリティ設定

### IAMロール作成

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "ssm:GetParameter",
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "*"
    }
  ]
}
```

### VPC設定 (推奨)

```bash
# プライベートサブネットでLambda/ECSを実行
# パブリックサブネットにALBを配置
# NATゲートウェイで外部通信
```

---

## 📝 デプロイ後の確認

```bash
# ヘルスチェック
curl https://your-domain.com/api/health

# テスト実行
curl -X POST https://your-domain.com/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

---

## 💡 次のステップ

1. **デプロイ方法を選択**
   - Lambda (コスト重視)
   - ECS (安定性重視)
   - EC2 (シンプル重視)

2. **Google Apps ScriptのURLを更新**
   ```javascript
   BACKEND_URL: 'https://your-aws-url.com'
   ```

3. **動作確認**
   - メニューの「テスト実行」

---

どのデプロイ方法がいいですか?
- **Lambda**: コスト最安、自動スケーリング
- **ECS**: 安定性高い、長時間処理対応
- **EC2**: シンプル、デバッグしやすい
