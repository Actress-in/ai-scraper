/**
 * アンチボット対策設定
 * Webスクレイピング検知システムを回避するための設定
 */

module.exports = {
  // 1. リクエストの人間らしさ (Human-like Behavior)
  timing: {
    // ランダムな待機時間 (ミリ秒)
    minDelay: parseInt(process.env.MIN_DELAY) || 1000,
    maxDelay: parseInt(process.env.MAX_DELAY) || 5000,

    // ページ読み込み後の追加待機時間
    pageLoadDelay: {
      min: 500,
      max: 2000
    },

    // リトライ時のExponential Backoff
    retryBackoff: {
      initial: 1000,
      multiplier: 2,
      maxDelay: 30000
    },

    // 時間帯による調整（オプション）
    timeBasedBehavior: {
      enabled: false,
      nightHours: { start: 23, end: 6, delayMultiplier: 1.5 },
      weekendMultiplier: 1.2
    }
  },

  // 2. ヘッダー管理
  headers: {
    // User-Agentのローテーション用リスト
    userAgents: [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ],

    // デフォルトヘッダー
    default: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0'
    }
  },

  // 3. IPアドレス・プロキシ管理
  proxy: {
    enabled: false,
    list: process.env.PROXY_LIST ? process.env.PROXY_LIST.split(',') : [],
    rotation: true,
    maxFailures: 3, // 失敗回数の閾値
    cooldownPeriod: 300000, // 除外後の待機時間 (5分)

    // 同一IPからのリクエスト頻度制御
    rateLimit: {
      requestsPerMinute: 10,
      requestsPerHour: 100
    }
  },

  // 4. エラーハンドリング
  errorHandling: {
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
    timeout: parseInt(process.env.DEFAULT_TIMEOUT) || 30000,

    // HTTPステータスコード別の処理
    statusHandlers: {
      429: { // Too Many Requests
        action: 'exponential_backoff',
        initialDelay: 5000,
        maxDelay: 60000
      },
      403: { // Forbidden
        action: 'rotate_proxy_and_headers',
        waitTime: 3000
      },
      401: { // Unauthorized
        action: 'rotate_headers',
        waitTime: 2000
      },
      500: { // Server Error
        action: 'retry',
        waitTime: 5000
      },
      503: { // Service Unavailable
        action: 'exponential_backoff',
        initialDelay: 10000
      }
    }
  },

  // 5. ブラウザ自動化（Playwright）設定
  browser: {
    // ヘッドレス検知回避
    headless: true,

    // ブラウザ起動オプション
    launchOptions: {
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    },

    // コンテキストオプション（fingerprint対策）
    contextOptions: {
      viewport: { width: 1920, height: 1080 },
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      permissions: ['geolocation'],
      geolocation: { longitude: 139.6917, latitude: 35.6895 }, // Tokyo
      colorScheme: 'light',
      deviceScaleFactor: 1
    },

    // 自然な操作の追加
    humanBehavior: {
      enabled: true,
      // マウス移動のランダム化
      mouseMovement: true,
      // スクロールのランダム化
      scrollBehavior: true,
      scrollSpeed: { min: 100, max: 500 }
    },

    // WebDriver検知回避スクリプト
    stealthScripts: [
      // navigator.webdriver を削除
      `Object.defineProperty(navigator, 'webdriver', { get: () => undefined })`,

      // Chrome実行環境の偽装
      `window.chrome = { runtime: {} }`,

      // Permissions API の偽装
      `const originalQuery = window.navigator.permissions.query;
       window.navigator.permissions.query = (parameters) => (
         parameters.name === 'notifications' ?
           Promise.resolve({ state: Notification.permission }) :
           originalQuery(parameters)
       )`,

      // Plugin配列の偽装
      `Object.defineProperty(navigator, 'plugins', {
         get: () => [1, 2, 3, 4, 5]
       })`,

      // Languages設定
      `Object.defineProperty(navigator, 'languages', {
         get: () => ['ja-JP', 'ja', 'en-US', 'en']
       })`
    ]
  },

  // 6. データ収集の最適化
  concurrency: {
    // 並行リクエスト数
    maxConcurrent: 3,

    // リクエストプールの設定
    poolSize: 5,

    // 段階的スケールアップ
    rampUp: {
      enabled: true,
      initialConcurrency: 1,
      incrementInterval: 60000, // 1分ごとに増加
      maxConcurrency: 5
    }
  },

  // ログ設定
  logging: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    detectionsAlert: true, // 検知された場合の通知
    logFile: './logs/scraper.log',
    errorLogFile: './logs/error.log'
  },

  // その他の設定
  misc: {
    // 収集済みURL記録（重複回避）
    trackVisitedUrls: true,

    // robots.txt の遵守
    respectRobotsTxt: true,

    // Cookieの永続化
    persistCookies: true,
    cookieStoragePath: './data/cookies.json'
  }
};
