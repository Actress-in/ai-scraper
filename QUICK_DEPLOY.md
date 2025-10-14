# 🚀 クイックデプロイガイド

SSH鍵なしで5分でデプロイできる方法です。

## 🎯 Render.comでデプロイ (最も簡単)

### ステップ1: Render.comにサインアップ
https://render.com/ にアクセスしてGitHubアカウントでログイン

### ステップ2: New Web Serviceを作成
1. ダッシュボードで **「New +」** → **「Web Service」**
2. GitHubリポジトリ `Actress-in/ai-scraper` を選択
3. 以下のように設定:

```
Name: ai-scraper-backend
Region: Singapore (closest to Japan)
Branch: main
Root Directory: backend
Runtime: Node
Build Command: npm install && npx playwright install chromium
Start Command: npm start
Instance Type: Free (or Starter $7/month)
```

### ステップ3: 環境変数を設定
**Environment Variables** セクションで追加:

```
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
NODE_ENV=production
DEFAULT_TIMEOUT=180000
```

### ステップ4: Deploy!
**「Create Web Service」**をクリック

### ステップ5: URLをコピー
デプロイ完了後、表示されるURL（例: `https://ai-scraper-backend-xxxxx.onrender.com`）をコピー

---

## 📊 Google Apps Scriptの設定

1. スプレッドシートの **拡張機能 → Apps Script**
2. `google-apps-script/AutoScraper.gs` の内容をコピペ
3. `CONFIG.BACKEND_URL` をRenderのURLに変更:

```javascript
const CONFIG = {
  BACKEND_URL: 'https://ai-scraper-backend-xxxxx.onrender.com', // ← ここを変更
  SHEET_NAME: '管理台帳',
  // ...
};
```

4. **保存** → **トリガー**を設定

---

## ✅ 完了!

これで、Googleフォームから依頼が来たら自動でスクレイピング → 結果がスプレッドシートに書き込まれます!

---

## 🔄 代替案: EC2を使う場合

`crawling-key.pem`が見つかったら:

```bash
./deployment/ec2-setup.sh 54.199.217.237 /path/to/crawling-key.pem
```

EC2 IP: **54.199.217.237**

---

## ❓ トラブルシューティング

### Render.comのデプロイが失敗する
- Build Commandを確認: `npm install && npx playwright install chromium`
- メモリ不足の場合: Starter plan ($7/month) にアップグレード

### スプレッドシートに結果が書き込まれない
- Google Sheets APIの認証が必要
- 詳細は `google-apps-script/README.md` を参照

---

**どちらの方法でも、5-10分でデプロイ完了します!**
