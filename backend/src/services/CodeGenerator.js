/**
 * コード生成サービス
 * AIを使ってPlaywrightスクレイパーコードを自動生成
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const antiBotService = require('./AntiBotService');
const config = require('../config/antibot.config');

class CodeGenerator {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  }

  /**
   * スクレイパーコードを生成
   * @param {object} params
   * @returns {object}
   */
  async generateScraperCode(params) {
    const {
      url,
      targets = [], // 取得したいデータ要素の配列
      pagination = false,
      loginRequired = false,
      outputFormat = 'json', // json, csv
      language = 'javascript' // javascript, python
    } = params;

    try {
      const prompt = language === 'python'
        ? this.buildPythonPrompt(url, targets, pagination, loginRequired, outputFormat)
        : this.buildPrompt(url, targets, pagination, loginRequired, outputFormat);

      // タイムアウト付きでGemini APIを呼び出し（180秒）
      const timeout = parseInt(process.env.GEMINI_TIMEOUT) || 180000;
      const result = await this.callGeminiWithTimeout(prompt, timeout);
      const generatedCode = this.extractCode(result.response.text(), language);

      return {
        success: true,
        code: generatedCode,
        language: language,
        framework: language === 'python' ? 'playwright-python' : 'playwright',
        targets,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      antiBotService.logger.error(`Code generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * タイムアウト付きでGemini APIを呼び出し
   * @param {string} prompt
   * @param {number} timeout
   * @returns {Promise}
   */
  async callGeminiWithTimeout(prompt, timeout) {
    return Promise.race([
      this.model.generateContent(prompt),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Gemini API timeout after ${timeout}ms`)), timeout)
      )
    ]);
  }

  /**
   * プロンプトを構築
   * @param {string} url
   * @param {array} targets
   * @param {boolean} pagination
   * @param {boolean} loginRequired
   * @param {string} outputFormat
   * @returns {string}
   */
  buildPrompt(url, targets, pagination, loginRequired, outputFormat) {
    const targetsDescription = targets.map(t =>
      `- ${t.label}: セレクター="${t.selector}", タイプ=${t.dataType}`
    ).join('\n');

    return `
あなたはPlaywrightを使ったWebスクレイピングの専門家です。
以下の要件に基づいて、アンチボット対策を完全に組み込んだスクレイパーコードを生成してください。

## 対象URL
${url}

## 取得するデータ要素
${targetsDescription}

## 追加要件
- ページネーション: ${pagination ? '有効' : '無効'}
- ログイン: ${loginRequired ? '必要' : '不要'}
- 出力形式: ${outputFormat}

## 必須実装事項（アンチボット対策）

### 1. リクエストの人間らしさ
\`\`\`javascript
// ランダムな待機時間
async function randomDelay(min = ${config.timing.minDelay}, max = ${config.timing.maxDelay}) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise(resolve => setTimeout(resolve, delay));
}
\`\`\`

### 2. ステルスブラウザ設定
\`\`\`javascript
const browser = await chromium.launch({
  headless: ${config.browser.headless},
  args: ${JSON.stringify(config.browser.launchOptions.args, null, 2)}
});

const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo',
  userAgent: '実在するUser-Agent'
});
\`\`\`

### 3. Webdriver検知回避
\`\`\`javascript
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  window.chrome = { runtime: {} };
});
\`\`\`

### 4. 人間らしい動作
\`\`\`javascript
// マウス移動
await page.mouse.move(Math.random() * 1000, Math.random() * 800, { steps: 10 });

// スクロール
await page.evaluate(() => {
  window.scrollBy(0, Math.random() * 500 + 300);
});
\`\`\`

### 5. エラーハンドリング
\`\`\`javascript
const maxRetries = ${config.errorHandling.maxRetries};
for (let i = 0; i < maxRetries; i++) {
  try {
    // スクレイピング処理
    break;
  } catch (error) {
    if (i === maxRetries - 1) throw error;
    await randomDelay(5000, 10000); // Exponential backoff
  }
}
\`\`\`

## 出力要件
- 完全に実行可能なコード
- require文を含める
- async/await構文を使用
- コメントで各ステップを説明
- エラーハンドリングを含める
- ${outputFormat}形式でデータを保存
- ログ出力を含める

## 出力形式
JavaScriptコードのみを返してください。説明文やマークダウンは不要です。
コードブロックで囲んでください。

\`\`\`javascript
// ここにコードを記述
\`\`\`
`;
  }

  /**
   * Python用プロンプトを構築
   * @param {string} url
   * @param {array} targets
   * @param {boolean} pagination
   * @param {boolean} loginRequired
   * @param {string} outputFormat
   * @returns {string}
   */
  buildPythonPrompt(url, targets, pagination, loginRequired, outputFormat) {
    const targetsDescription = targets.map(t =>
      `- ${t.label}: セレクター="${t.selector}", タイプ=${t.dataType}`
    ).join('\n');

    return `
あなたはPlaywright for Pythonを使ったWebスクレイピングの専門家です。
以下の要件に基づいて、アンチボット対策を完全に組み込んだスクレイパーコードを生成してください。

## 対象URL
${url}

## 取得するデータ要素
${targetsDescription}

## 追加要件
- ページネーション: ${pagination ? '有効' : '無効'}
- ログイン: ${loginRequired ? '必要' : '不要'}
- 出力形式: ${outputFormat}

## 必須実装事項（アンチボット対策）

### 1. リクエストの人間らしさ
\`\`\`python
import random
import asyncio

async def random_delay(min_ms=${config.timing.minDelay}, max_ms=${config.timing.maxDelay}):
    """ランダムな待機時間"""
    delay = random.randint(min_ms, max_ms) / 1000.0
    await asyncio.sleep(delay)
\`\`\`

### 2. ステルスブラウザ設定
\`\`\`python
from playwright.async_api import async_playwright

browser = await playwright.chromium.launch(
    headless=${config.browser.headless},
    args=${JSON.stringify(config.browser.launchOptions.args)}
)

context = await browser.new_context(
    viewport={'width': 1920, 'height': 1080},
    locale='ja-JP',
    timezone_id='Asia/Tokyo',
    user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
)
\`\`\`

### 3. Webdriver検知回避
\`\`\`python
await page.add_init_script("""
    Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
    });
    window.chrome = { runtime: {} };
""")
\`\`\`

### 4. 人間らしい動作
\`\`\`python
# マウス移動
await page.mouse.move(random.randint(0, 1000), random.randint(0, 800), steps=10)

# スクロール
await page.evaluate(f"window.scrollBy(0, {random.randint(300, 800)})")
\`\`\`

### 5. エラーハンドリング
\`\`\`python
max_retries = ${config.errorHandling.maxRetries}
for attempt in range(max_retries):
    try:
        # スクレイピング処理
        break
    except Exception as e:
        if attempt == max_retries - 1:
            raise
        await random_delay(5000, 10000)
\`\`\`

## 出力要件
- 完全に実行可能なPythonコード
- async/await構文を使用
- type hintsを含める
- コメントで各ステップを説明
- エラーハンドリングを含める
- ${outputFormat}形式でデータを保存
- ログ出力を含める（logging使用）

## 出力形式
Pythonコードのみを返してください。説明文やマークダウンは不要です。
コードブロックで囲んでください。

\`\`\`python
# ここにコードを記述
\`\`\`
`;
  }

  /**
   * AI応答からコードを抽出
   * @param {string} text
   * @param {string} language
   * @returns {string}
   */
  extractCode(text, language = 'javascript') {
    // マークダウンコードブロックを抽出
    const langPattern = language === 'python' ? 'python|py' : 'javascript|js';
    const codeBlockRegex = new RegExp(`\`\`\`(?:${langPattern})?\\n([\\s\\S]*?)\`\`\``, 'i');
    const match = text.match(codeBlockRegex);

    if (match && match[1]) {
      return match[1].trim();
    }

    // コードブロックがない場合は全体を返す
    return text.trim();
  }

  /**
   * テンプレートベースでコードを生成（フォールバック）
   * @param {object} params
   * @returns {string}
   */
  generateTemplateCode(params) {
    const { url, targets, pagination, outputFormat } = params;

    const selectorsCode = targets.map(t => {
      const varName = t.label.replace(/\s+/g, '_').toLowerCase();
      return `
    // ${t.label}を取得
    const ${varName}Elements = await page.$$('${t.selector}');
    const ${varName}Data = await Promise.all(
      ${varName}Elements.map(el => el.textContent())
    );
    result.${varName} = ${varName}Data;`;
    }).join('\n');

    return `
const { chromium } = require('playwright');
const fs = require('fs');

// アンチボット対策: ランダム待機
async function randomDelay(min = ${config.timing.minDelay}, max = ${config.timing.maxDelay}) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  console.log(\`Waiting \${delay}ms...\`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

// メイン処理
(async () => {
  console.log('Starting scraper...');

  // ブラウザ起動（アンチボット対策）
  const browser = await chromium.launch({
    headless: ${config.browser.headless},
    args: ${JSON.stringify(config.browser.launchOptions.args)}
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    userAgent: '${config.headers.userAgents[0]}'
  });

  const page = await context.newPage();

  // Webdriver検知回避
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  try {
    // 人間らしい待機
    await randomDelay();

    // ページアクセス
    console.log('Navigating to ${url}');
    await page.goto('${url}', { waitUntil: 'networkidle' });

    // ページ読み込み後の待機
    await randomDelay(500, 2000);

    // 人間らしいマウス移動
    await page.mouse.move(
      Math.random() * 1000,
      Math.random() * 800,
      { steps: 10 }
    );

    // データ取得
    const result = {};
${selectorsCode}

    console.log('Data extracted:', result);

    // データを保存
    const outputFile = './output.${outputFormat}';
    fs.writeFileSync(
      outputFile,
      JSON.stringify(result, null, 2)
    );
    console.log(\`Data saved to \${outputFile}\`);

  } catch (error) {
    console.error('Scraping failed:', error);
  } finally {
    await browser.close();
    console.log('Browser closed');
  }
})();
`;
  }

  /**
   * ページネーション対応コードを生成
   * @param {object} params
   * @returns {string}
   */
  async generatePaginationCode(params) {
    const { url, targets, nextButtonSelector, maxPages = 10 } = params;

    const prompt = `
Playwrightを使用して、ページネーション対応のスクレイパーを作成してください。

URL: ${url}
次ページボタンのセレクター: ${nextButtonSelector}
最大ページ数: ${maxPages}

取得データ:
${targets.map(t => `- ${t.label}: ${t.selector}`).join('\n')}

要件:
- アンチボット対策を含める
- 各ページ遷移で人間らしい待機時間
- 次ページが無い場合は自動停止
- 全ページのデータを配列として保存

JavaScriptコードのみを返してください。
`;

    try {
      const timeout = parseInt(process.env.GEMINI_TIMEOUT) || 180000;
      const result = await this.callGeminiWithTimeout(prompt, timeout);
      return this.extractCode(result.response.text());
    } catch (error) {
      antiBotService.logger.error(`Pagination code generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * ログインフロー対応コードを生成
   * @param {object} params
   * @returns {string}
   */
  async generateLoginCode(params) {
    const { loginUrl, usernameSelector, passwordSelector, submitSelector } = params;

    const prompt = `
Playwrightを使用して、ログインが必要なサイトのスクレイパーを作成してください。

ログインURL: ${loginUrl}
ユーザー名入力: ${usernameSelector}
パスワード入力: ${passwordSelector}
送信ボタン: ${submitSelector}

要件:
- 環境変数からログイン情報を取得（USERNAME, PASSWORD）
- アンチボット対策を含める
- 入力は人間らしく1文字ずつ
- ログイン成功の確認
- Cookie保存で次回以降のログインをスキップ

JavaScriptコードのみを返してください。
`;

    try {
      const timeout = parseInt(process.env.GEMINI_TIMEOUT) || 180000;
      const result = await this.callGeminiWithTimeout(prompt, timeout);
      return this.extractCode(result.response.text());
    } catch (error) {
      antiBotService.logger.error(`Login code generation failed: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new CodeGenerator();
