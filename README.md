# 🤖 AI Scraper Builder

AIを活用した、アンチボット対策完全装備のWebスクレイパー自動生成ツール

## ✨ 特徴

- 🧠 **AI自動解析**: Google Gemini 2.5 Flashを使用してページ構造を自動分析
- 🛡️ **完全なアンチボット対策**:
  - ランダムな遅延と人間らしい動作シミュレーション
  - User-Agentローテーションとヘッダー管理
  - WebDriver検出回避（ステルススクリプト）
  - マウス移動とスクロールのシミュレーション
  - 指数関数的バックオフによるリトライロジック
- 📸 **ビジュアルデバッグ**: スクリーンショット自動キャプチャ
- 🔄 **ページネーション自動検出**: URLパターン、ボタン、リンクを自動認識
- 💻 **実行可能コード生成**: すぐに使えるPlaywrightスクレイパーを生成
- 🎨 **直感的UI**: Streamlitによる4ステップワークフロー

## 🏗️ アーキテクチャ

```
┌─────────────────┐
│  Streamlit UI   │  (Python - フロントエンド)
│  Port: 8502     │
└────────┬────────┘
         │ HTTP
         ↓
┌─────────────────┐
│  Express API    │  (Node.js - バックエンド)
│  Port: 3001     │
└────────┬────────┘
         │
    ┌────┴────┐
    ↓         ↓
┌────────┐ ┌────────┐
│Gemini  │ │Playwright│
│2.5 Flash│ │Browser  │
└────────┘ └────────┘
```

## 📦 必要なもの

### Backend (Node.js)
- Node.js 16+
- npm

### Frontend (Python)
- Python 3.8+
- pip

### API
- Google Gemini API Key ([取得方法](https://ai.google.dev/))

## 🚀 セットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/Actress-in/ai-scraper.git
cd ai-scraper
```

### 2. 環境変数の設定

`.env.example`をコピーして`.env`を作成:

```bash
cp .env.example .env
```

`.env`ファイルを編集してAPIキーを設定:

```env
GEMINI_API_KEY=your_gemini_api_key_here
DEFAULT_TIMEOUT=60000
PORT=3001
```

### 3. Backend (Node.js) のセットアップ

```bash
cd backend
npm install
npx playwright install chromium
```

### 4. Frontend (Python) のセットアップ

```bash
cd ..  # プロジェクトルートに戻る
pip install -r requirements.txt
```

## 💻 ローカルでの実行

### ターミナル1: Backendサーバー起動

```bash
cd backend
PORT=3001 npm start
```

### ターミナル2: Streamlit起動

```bash
streamlit run streamlit_ui.py --server.port 8502
```

### アクセス

- **Streamlit UI**: http://localhost:8502
- **Backend API**: http://localhost:3001

## ☁️ デプロイ

### クイックデプロイ (3つのオプション)

#### オプションA: AWS Lambda (推奨・コスト最安)
月間100万リクエスト無料、自動スケーリング
```bash
cd backend
npm install -g serverless
serverless deploy
```
**詳細**: [AWS_DEPLOYMENT.md](./deployment/AWS_DEPLOYMENT.md)

#### オプションB: Render.com (最も簡単)
無料枠あり、GitHubと連携
1. [Render.com](https://render.com/)でWeb Service作成
2. リポジトリ接続
3. Root Directory: `backend`
4. Build: `npm install && npx playwright install chromium`
5. Start: `npm start`

#### オプションC: AWS ECS Fargate (本番推奨)
安定性高い、長時間処理対応
```bash
docker build -t ai-scraper-backend .
# ECRにプッシュ → ECSでサービス作成
```
**詳細**: [AWS_DEPLOYMENT.md](./deployment/AWS_DEPLOYMENT.md)

### 🎯 どれを選ぶ?

| サービス | コスト | 特徴 | おすすめ用途 |
|---------|-------|------|-------------|
| **AWS Lambda** | 無料〜$5/月 | サーバーレス、自動スケール | 本番・コスト重視 |
| **Render** | 無料〜$7/月 | 最も簡単、すぐデプロイ | 検証・小規模 |
| **AWS ECS** | $15〜30/月 | 安定、長時間処理 | 本番・大規模 |
| **AWS EC2** | 無料〜$8/月 | SSH可、フル制御 | 開発・カスタマイズ |

---

### Backend デプロイ詳細

#### Render.com の場合

1. **Render.com** にサインアップ
2. 新しいWeb Serviceを作成
3. リポジトリ: `https://github.com/your-repo/ai-scraper-builder`
4. 設定:
   - Root Directory: `backend`
   - Build Command: `npm install && npx playwright install chromium`
   - Start Command: `npm start`
   - 環境変数:
     - `GEMINI_API_KEY`: あなたのAPIキー
     - `PORT`: 3000

5. デプロイ後のURL（例: `https://your-backend.onrender.com`）をメモ

#### Frontendのデプロイ (Streamlit Cloud)

1. **Streamlit Cloud**にアクセス: https://share.streamlit.io/
2. GitHubリポジトリを接続
3. Main file: `streamlit_ui.py`
4. **Advanced settings**で環境変数を設定:
   ```
   BACKEND_URL=https://your-backend.onrender.com
   ```
5. デプロイ

### オプション2: Docker Composeで一括デプロイ

```bash
docker-compose up -d
```

## 📖 使い方

### ステップ1: ページ解析
1. 対象URLを入力
2. 「🔍 解析開始」をクリック
3. AIがページを分析してデータ要素を提案

### ステップ2: コード生成
1. 取得したいデータ要素を選択
2. オプション設定（ページネーション、ログインなど）
3. 「🚀 コード生成」をクリック

### ステップ3: 実行
1. 出力形式を選択（JSON/CSV）
2. 「▶️ 実行開始」をクリック

### ステップ4: 結果確認
1. 取得データをテーブル表示
2. CSV/JSONでダウンロード可能

## 🛠️ API エンドポイント

### GET `/api/health`
ヘルスチェック

### POST `/api/analyze`
ページ解析

**Request:**
```json
{
  "url": "https://example.com"
}
```

### POST `/api/generate`
スクレイパーコード生成

**Request:**
```json
{
  "url": "https://example.com",
  "targets": [...],
  "pagination": false,
  "loginRequired": false,
  "outputFormat": "json"
}
```

### POST `/api/execute`
スクレイパー実行

**Request:**
```json
{
  "url": "https://example.com",
  "targets": [...],
  "saveOutput": true,
  "outputFormat": "json"
}
```

### GET `/api/config`
アンチボット設定取得

### GET `/api/stats`
統計情報取得

## 🔧 設定

### アンチボット設定 (`backend/src/config/antibot.config.js`)

```javascript
module.exports = {
  timing: {
    minDelay: 1000,        // 最小待機時間（ミリ秒）
    maxDelay: 5000,        // 最大待機時間（ミリ秒）
    pageLoadDelay: {
      min: 2000,
      max: 5000
    }
  },
  browser: {
    headless: true,        // ヘッドレスモード
    stealthScripts: [...]  // ステルススクリプト
  },
  // その他の設定...
}
```

## 📁 プロジェクト構造

```
ai-scraper/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── antibot.config.js    # アンチボット設定
│   │   ├── services/
│   │   │   ├── AntiBotService.js    # アンチボット機能
│   │   │   ├── PageAnalyzer.js      # ページ解析
│   │   │   ├── CodeGenerator.js     # コード生成
│   │   │   └── ScraperExecutor.js   # スクレイパー実行
│   │   └── server.js                # Express API
│   ├── package.json
│   └── package-lock.json
├── data/
│   └── outputs/                     # 生成されたスクレイパーと結果
├── streamlit_ui.py                  # Streamlit UI
├── requirements.txt                 # Python依存関係
├── .env.example                     # 環境変数テンプレート
└── README.md
```

## 🔒 セキュリティ

- `.env`ファイルは**絶対にコミットしないでください**
- APIキーは環境変数で管理
- プロダクション環境では適切なレート制限を設定

## 🐛 トラブルシューティング

### Chromiumが見つからない
```bash
cd backend
npx playwright install chromium
```

### ポート競合エラー
別のポートを指定:
```bash
PORT=3002 npm start
```

### タイムアウトエラー
`.env`でタイムアウトを増やす:
```env
DEFAULT_TIMEOUT=120000
```

## 📝 ライセンス

MIT License

## 🤝 コントリビューション

Pull Requestsを歓迎します！

## 🙏 謝辞

- [Playwright](https://playwright.dev/) - ブラウザ自動化
- [Google Gemini](https://ai.google.dev/) - AI分析
- [Streamlit](https://streamlit.io/) - UI フレームワーク
- [Express.js](https://expressjs.com/) - バックエンドAPI

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
