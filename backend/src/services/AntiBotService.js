/**
 * アンチボット対策サービス
 * スクレイピング検知を回避するための各種機能を提供
 */

const config = require('../config/antibot.config');
const winston = require('winston');

class AntiBotService {
  constructor() {
    this.proxyFailures = new Map(); // プロキシの失敗回数記録
    this.currentProxyIndex = 0;
    this.requestTimestamps = new Map(); // IP別のリクエスト履歴
    this.visitedUrls = new Set(); // 訪問済みURL

    // ロガー設定
    this.logger = winston.createLogger({
      level: config.logging.level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: config.logging.errorLogFile, level: 'error' }),
        new winston.transports.File({ filename: config.logging.logFile }),
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });
  }

  /**
   * ランダムな待機時間を取得
   * @param {number} min - 最小時間（ミリ秒）
   * @param {number} max - 最大時間（ミリ秒）
   * @returns {number}
   */
  getRandomDelay(min = config.timing.minDelay, max = config.timing.maxDelay) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * 時間帯に応じた待機時間の調整
   * @returns {number}
   */
  getTimeAdjustedDelay() {
    let baseDelay = this.getRandomDelay();

    if (!config.timing.timeBasedBehavior.enabled) {
      return baseDelay;
    }

    const now = new Date();
    const hour = now.getHours();
    const isWeekend = [0, 6].includes(now.getDay());

    // 深夜の場合
    const { start, end, delayMultiplier } = config.timing.timeBasedBehavior.nightHours;
    if (hour >= start || hour < end) {
      baseDelay *= delayMultiplier;
    }

    // 週末の場合
    if (isWeekend) {
      baseDelay *= config.timing.timeBasedBehavior.weekendMultiplier;
    }

    return Math.floor(baseDelay);
  }

  /**
   * 待機処理
   * @param {number} ms - 待機時間（ミリ秒）
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * ランダムなUser-Agentを取得
   * @returns {string}
   */
  getRandomUserAgent() {
    const agents = config.headers.userAgents;
    return agents[Math.floor(Math.random() * agents.length)];
  }

  /**
   * リクエストヘッダーを生成
   * @param {string} referer - リファラURL
   * @returns {object}
   */
  generateHeaders(referer = null) {
    const headers = {
      ...config.headers.default,
      'User-Agent': this.getRandomUserAgent()
    };

    if (referer) {
      headers['Referer'] = referer;
    }

    return headers;
  }

  /**
   * 次のプロキシを取得（ローテーション）
   * @returns {string|null}
   */
  getNextProxy() {
    if (!config.proxy.enabled || config.proxy.list.length === 0) {
      return null;
    }

    const availableProxies = config.proxy.list.filter(proxy => {
      const failures = this.proxyFailures.get(proxy) || 0;
      return failures < config.proxy.maxFailures;
    });

    if (availableProxies.length === 0) {
      this.logger.warn('All proxies have failed. Resetting failure counts.');
      this.proxyFailures.clear();
      return config.proxy.list[0];
    }

    if (config.proxy.rotation) {
      this.currentProxyIndex = (this.currentProxyIndex + 1) % availableProxies.length;
      return availableProxies[this.currentProxyIndex];
    }

    return availableProxies[0];
  }

  /**
   * プロキシの失敗を記録
   * @param {string} proxy
   */
  recordProxyFailure(proxy) {
    const failures = (this.proxyFailures.get(proxy) || 0) + 1;
    this.proxyFailures.set(proxy, failures);

    if (failures >= config.proxy.maxFailures) {
      this.logger.warn(`Proxy ${proxy} exceeded max failures (${failures}). Temporarily disabled.`);

      // クールダウン後にリセット
      setTimeout(() => {
        this.proxyFailures.delete(proxy);
        this.logger.info(`Proxy ${proxy} re-enabled after cooldown.`);
      }, config.proxy.cooldownPeriod);
    }
  }

  /**
   * レート制限チェック
   * @param {string} identifier - IP or Proxy identifier
   * @returns {boolean}
   */
  checkRateLimit(identifier) {
    const now = Date.now();
    const timestamps = this.requestTimestamps.get(identifier) || [];

    // 古いタイムスタンプを削除（1時間以上前）
    const recentTimestamps = timestamps.filter(ts => now - ts < 3600000);

    // 1分間のリクエスト数チェック
    const lastMinute = recentTimestamps.filter(ts => now - ts < 60000);
    if (lastMinute.length >= config.proxy.rateLimit.requestsPerMinute) {
      this.logger.warn(`Rate limit exceeded for ${identifier} (per minute)`);
      return false;
    }

    // 1時間のリクエスト数チェック
    if (recentTimestamps.length >= config.proxy.rateLimit.requestsPerHour) {
      this.logger.warn(`Rate limit exceeded for ${identifier} (per hour)`);
      return false;
    }

    // タイムスタンプを記録
    recentTimestamps.push(now);
    this.requestTimestamps.set(identifier, recentTimestamps);

    return true;
  }

  /**
   * HTTPステータスコードに応じた処理
   * @param {number} statusCode
   * @param {number} retryCount
   * @returns {object} { shouldRetry, waitTime, action }
   */
  async handleStatusCode(statusCode, retryCount = 0) {
    const handler = config.errorHandling.statusHandlers[statusCode];

    if (!handler) {
      return { shouldRetry: false, waitTime: 0, action: 'none' };
    }

    let waitTime = handler.waitTime || 0;

    switch (handler.action) {
      case 'exponential_backoff':
        waitTime = Math.min(
          handler.initialDelay * Math.pow(2, retryCount),
          handler.maxDelay || config.timing.retryBackoff.maxDelay
        );
        break;

      case 'rotate_proxy_and_headers':
        // プロキシとヘッダーをローテーション
        break;

      case 'rotate_headers':
        // ヘッダーのみローテーション
        break;

      case 'retry':
        // 単純リトライ
        break;
    }

    this.logger.info(`Status ${statusCode}: ${handler.action}, waiting ${waitTime}ms`);

    if (waitTime > 0) {
      await this.sleep(waitTime);
    }

    return {
      shouldRetry: retryCount < config.errorHandling.maxRetries,
      waitTime,
      action: handler.action
    };
  }

  /**
   * Playwrightページにステルススクリプトを注入
   * @param {Page} page - Playwright Page object
   */
  async injectStealthScripts(page) {
    for (const script of config.browser.stealthScripts) {
      try {
        await page.addInitScript(script);
      } catch (error) {
        this.logger.error(`Failed to inject stealth script: ${error.message}`);
      }
    }

    this.logger.debug('Stealth scripts injected successfully');
  }

  /**
   * 人間らしいマウス移動を実行
   * @param {Page} page
   */
  async simulateHumanMouseMovement(page) {
    if (!config.browser.humanBehavior.mouseMovement) return;

    try {
      const viewport = page.viewportSize();
      const x = Math.random() * viewport.width;
      const y = Math.random() * viewport.height;

      await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 10) + 5 });
      this.logger.debug(`Mouse moved to (${Math.floor(x)}, ${Math.floor(y)})`);
    } catch (error) {
      this.logger.error(`Mouse movement failed: ${error.message}`);
    }
  }

  /**
   * 人間らしいスクロールを実行
   * @param {Page} page
   */
  async simulateHumanScroll(page) {
    if (!config.browser.humanBehavior.scrollBehavior) return;

    try {
      const scrollY = Math.random() * 1000 + 500;
      const speed = this.getRandomDelay(
        config.browser.humanBehavior.scrollSpeed.min,
        config.browser.humanBehavior.scrollSpeed.max
      );

      await page.evaluate(({ scrollY, speed }) => {
        return new Promise((resolve) => {
          let currentScroll = 0;
          const step = scrollY / 20;
          const interval = setInterval(() => {
            window.scrollBy(0, step);
            currentScroll += step;
            if (currentScroll >= scrollY) {
              clearInterval(interval);
              resolve();
            }
          }, speed / 20);
        });
      }, { scrollY, speed });

      this.logger.debug(`Scrolled ${Math.floor(scrollY)}px`);
    } catch (error) {
      this.logger.error(`Scroll simulation failed: ${error.message}`);
    }
  }

  /**
   * URLが訪問済みかチェック
   * @param {string} url
   * @returns {boolean}
   */
  isUrlVisited(url) {
    if (!config.misc.trackVisitedUrls) return false;
    return this.visitedUrls.has(url);
  }

  /**
   * URLを訪問済みとしてマーク
   * @param {string} url
   */
  markUrlVisited(url) {
    if (config.misc.trackVisitedUrls) {
      this.visitedUrls.add(url);
    }
  }

  /**
   * 検知アラートを送信
   * @param {string} message
   * @param {object} details
   */
  sendDetectionAlert(message, details = {}) {
    if (config.logging.detectionsAlert) {
      this.logger.error('⚠️  DETECTION ALERT: ' + message, details);
      // ここに通知システム（Slack, Email等）を統合可能
    }
  }

  /**
   * 統計情報を取得
   * @returns {object}
   */
  getStats() {
    return {
      visitedUrls: this.visitedUrls.size,
      activeProxies: config.proxy.list.length - this.proxyFailures.size,
      totalProxies: config.proxy.list.length,
      proxyFailures: Array.from(this.proxyFailures.entries())
    };
  }
}

module.exports = new AntiBotService();
