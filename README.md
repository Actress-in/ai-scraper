# 🤖 AI Scraper Builder

**アンチボット対策完全装備**のWebスクレイパー自動生成ツール

Google Gemini AIとPlaywrightを組み合わせ、自然言語で指定するだけで完全なスクレイパーコードを生成・実行できます。

## ✨ 主な機能

### 🎯 コア機能
- **AIページ解析**: URLを入力するだけで取得可能なデータ要素を自動提案
- **自動コード生成**: 選択した要素から完全なPlaywrightコードを生成
- **ワンクリック実行**: 生成したスクレイパーをその場で実行
- **結果の可視化**: 取得データをテーブル・JSON・CSVで表示

### 🛡️ アンチボット対策（完全実装済み）

#### 1. リクエストの人間らしさ
- ランダムな待機時間（設定可能）
- 時間帯による挙動調整（深夜・週末など）
- Exponential backoff リトライ

#### 2. ヘッダー管理
- User-Agentローテーション（実在するブラウザ）
- 適切なAccept/Language/Encoding設定
- 自然なReferer設定

#### 3. プロキシ対応
- プロキシローテーション
- 失敗したプロキシの自動除外
- レート制限の検知と対応

#### 4. エラーハンドリング
- HTTPステータスコード別の処理
  - 429: Exponential backoff
  - 403/401: プロキシ・ヘッダーローテーション
  - 5xx: リトライロジック

#### 5. ブラウザステルス機能
- `navigator.webdriver` 削除
- Canvas fingerprinting対策
- 人間らしいマウス移動・スクロール
- Chrome実行環境の偽装

#### 6. 並行制御
- 並行リクエスト数の制限
- 段階的スケールアップ
- 訪問済みURLの重複回避

## 🚀 セットアップ

### 1. 環境準備

```bash
cd ai-scraper-builder

# Node.js依存関係のインストール
cd backend
npm install
cd ..

# Python依存関係のインストール
pip install -r requirements.txt

# Playwright ブラウザのインストール
npx playwright install chromium
```

### 2. API設定

`.env`ファイルを作成:

```bash
cp .env.example .env
```

`.env`を編集してGemini APIキーを設定:

```env
GEMINI_API_KEY=your_api_key_here

# オプション: プロキシ設定
# PROXY_LIST=http://proxy1:8080,http://proxy2:8080
```

**APIキー取得**: https://aistudio.google.com/app/apikey

### 3. サーバー起動

```bash
# ターミナル1: バックエンド
cd backend
npm start

# ターミナル2: フロントエンド
streamlit run streamlit_ui.py
```

### 4. アクセス

- **Streamlit UI**: http://localhost:8501
- **バックエンドAPI**: http://localhost:3000

## 📖 使い方

### 基本的な流れ

1. **ページ解析**
   - 対象URLを入力
   - AIが自動でページを解析
   - 取得可能なデータ要素を提案

2. **コード生成**
   - 取得したいデータを選択
   - オプション設定（ページネーション、ログインなど）
   - AIが最適なスクレイパーコードを生成

3. **実行**
   - ワンクリックで実行
   - アンチボット対策が自動で適用される

4. **結果確認**
   - テーブル形式で結果表示
   - CSV/JSONでダウンロード可能

### 高度な使い方

#### プロキシ設定

`.env`ファイルでプロキシリストを設定:

```env
PROXY_LIST=http://proxy1:8080,http://proxy2:8080,http://proxy3:8080
```

#### 設定のカスタマイズ

`backend/src/config/antibot.config.js`で詳細設定:

```javascript
timing: {
  minDelay: 1000,  // 最小待機時間（ミリ秒）
  maxDelay: 5000   // 最大待機時間（ミリ秒）
}
```

## 🏗️ プロジェクト構成

```
ai-scraper-builder/
├── backend/
│   ├── src/
│   │   ├── server.js                    # Express サーバー
│   │   ├── config/
│   │   │   └── antibot.config.js       # アンチボット設定
│   │   └── services/
│   │       ├── AntiBotService.js       # アンチボット対策
│   │       ├── PageAnalyzer.js         # ページ解析
│   │       ├── CodeGenerator.js        # コード生成
│   │       └── ScraperExecutor.js      # 実行エンジン
│   └── package.json
│
├── data/
│   └── outputs/                        # 生成コード・結果
│
├── logs/                               # ログファイル
├── streamlit_ui.py                     # Streamlit UI
├── requirements.txt                    # Python依存関係
└── README.md
```

## 🔧 技術スタック

- **バックエンド**: Node.js + Express
- **スクレイピング**: Playwright (ヘッドレスChrome)
- **AI**: Google Gemini 2.0 Flash
- **フロントエンド**: Streamlit (Python)
- **ログ**: Winston

## 📚 API エンドポイント

| エンドポイント | メソッド | 説明 |
|-------------|---------|------|
| `/api/analyze` | POST | ページ解析 |
| `/api/test-selector` | POST | セレクターテスト |
| `/api/generate` | POST | スクレイパーコード生成 |
| `/api/execute` | POST | スクレイパー実行 |
| `/api/stats` | GET | 統計情報取得 |
| `/api/config` | GET | 設定情報取得 |
| `/api/health` | GET | ヘルスチェック |

## 🔍 使用例

### Example 1: ECサイトの商品情報

```
URL: https://example-shop.com/products
取得データ:
- 商品名
- 価格
- 画像URL
- 在庫状況
```

### Example 2: ニュースサイトの記事一覧

```
URL: https://news-site.com/articles
取得データ:
- 記事タイトル
- 公開日時
- 著者
- カテゴリー
オプション: ページネーション有効
```

## ⚠️ 注意事項

### 法的遵守
- 対象サイトの利用規約を必ず確認してください
- `robots.txt`を尊重してください
- 過度な負荷をかけないでください

### 防御的クローリング
このツールは**防御的なクローリング**のみを目的としています:
- 公開情報の収集
- 研究・開発目的
- 個人利用

以下の用途には使用しないでください:
- 不正アクセス
- DDoS攻撃
- 個人情報の不正取得

## 💰 料金

### Gemini 2.0 Flash
- **無料枠**: 1日1,500回まで無料
- **有料時**: 1回あたり約0.01円

無料枠内であれば完全無料で利用可能！

## 🤝 貢献

Issue・PRを歓迎します！

## 📄 ライセンス

ISC

## 🙏 クレジット

- **AI**: Google Gemini
- **ブラウザ自動化**: Playwright
- **UI**: Streamlit
