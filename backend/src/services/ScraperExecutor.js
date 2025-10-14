/**
 * スクレイパー実行サービス
 * 生成されたコードを安全に実行し、結果を返す
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const antiBotService = require('./AntiBotService');
const config = require('../config/antibot.config');

class ScraperExecutor {
  constructor() {
    this.runningScrapers = new Map(); // 実行中のスクレイパー管理
    this.results = new Map(); // 実行結果キャッシュ
    this.codes = new Map(); // 生成されたコードのキャッシュ
  }

  /**
   * スクレイパーを実行
   * @param {object} params
   * @returns {object}
   */
  async executeScraper(params) {
    const {
      code,
      url,
      targets = [],
      saveOutput = true,
      outputFormat = 'json'
    } = params;

    const scraperId = this.generateScraperId(url);
    antiBotService.logger.info(`Starting scraper: ${scraperId}`);

    try {
      // コードをファイルに保存
      const codeFilePath = await this.saveCode(scraperId, code);

      // 実行
      const result = await this.runScraperDirect(url, targets, outputFormat);

      // 結果を保存
      if (saveOutput) {
        await this.saveResult(scraperId, result, outputFormat);
      }

      this.results.set(scraperId, result);

      return {
        success: true,
        scraperId,
        data: result,
        codeFile: codeFilePath,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      antiBotService.logger.error(`Scraper execution failed: ${error.message}`);

      // 検知アラート
      if (error.message.includes('blocked') || error.message.includes('403')) {
        antiBotService.sendDetectionAlert('Scraper blocked during execution', {
          scraperId,
          url,
          error: error.message
        });
      }

      throw error;
    }
  }

  /**
   * スクレイパーを直接実行（Playwright APIを使用）
   * @param {string} url
   * @param {array} targets
   * @param {string} outputFormat
   * @returns {object}
   */
  async runScraperDirect(url, targets, outputFormat) {
    let browser = null;

    try {
      // レート制限チェック
      const identifier = 'local'; // プロキシ使用時はプロキシアドレス
      if (!antiBotService.checkRateLimit(identifier)) {
        throw new Error('Rate limit exceeded. Please wait before retrying.');
      }

      // ブラウザ起動
      const launchOptions = {
        headless: config.browser.headless,
        ...config.browser.launchOptions
      };

      // システムChromiumを使用（Docker/ECS環境対応）
      const systemChromiumPath = '/usr/bin/chromium';
      const fs = require('fs');
      if (fs.existsSync(systemChromiumPath)) {
        launchOptions.executablePath = systemChromiumPath;
        antiBotService.logger.info(`Using system Chromium at ${systemChromiumPath}`);
      }

      browser = await chromium.launch(launchOptions);

      const context = await browser.newContext({
        ...config.browser.contextOptions,
        extraHTTPHeaders: antiBotService.generateHeaders()
      });

      const page = await context.newPage();

      // ステルススクリプト注入
      await antiBotService.injectStealthScripts(page);

      // 人間らしい待機
      const delay = antiBotService.getTimeAdjustedDelay();
      await antiBotService.sleep(delay);

      // ページアクセス（リトライロジック付き）
      const response = await this.navigateWithRetry(page, url);

      // ページ読み込み後の待機
      await antiBotService.sleep(
        antiBotService.getRandomDelay(
          config.timing.pageLoadDelay.min,
          config.timing.pageLoadDelay.max
        )
      );

      // 人間らしい動作
      await antiBotService.simulateHumanMouseMovement(page);
      await antiBotService.simulateHumanScroll(page);

      // データ抽出
      const data = await this.extractData(page, targets);

      antiBotService.logger.info(`Successfully extracted ${Object.keys(data).length} data fields`);

      await browser.close();

      return {
        url,
        statusCode: response.status(),
        data,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      if (browser) {
        await browser.close();
      }
      throw error;
    }
  }

  /**
   * リトライロジック付きでページに移動
   * @param {Page} page
   * @param {string} url
   * @returns {Response}
   */
  async navigateWithRetry(page, url, retryCount = 0) {
    const maxRetries = config.errorHandling.maxRetries;

    try {
      antiBotService.logger.info(`Navigating to ${url} (attempt ${retryCount + 1}/${maxRetries + 1})`);

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded', // networkidle より緩い条件に変更
        timeout: config.errorHandling.timeout
      });

      const statusCode = response.status();

      // ステータスコードチェック
      if (statusCode !== 200) {
        const handler = await antiBotService.handleStatusCode(statusCode, retryCount);

        if (handler.shouldRetry && retryCount < maxRetries) {
          antiBotService.logger.warn(`Retrying after status ${statusCode}...`);
          return await this.navigateWithRetry(page, url, retryCount + 1);
        }

        throw new Error(`Failed to load page: HTTP ${statusCode}`);
      }

      return response;

    } catch (error) {
      if (retryCount < maxRetries) {
        // Exponential backoff
        const backoffDelay = Math.min(
          config.timing.retryBackoff.initial * Math.pow(config.timing.retryBackoff.multiplier, retryCount),
          config.timing.retryBackoff.maxDelay
        );

        antiBotService.logger.warn(`Navigation failed, retrying in ${backoffDelay}ms...`);
        await antiBotService.sleep(backoffDelay);

        return await this.navigateWithRetry(page, url, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * ページからデータを抽出
   * @param {Page} page
   * @param {array} targets
   * @returns {object}
   */
  async extractData(page, targets) {
    const result = {};

    for (const target of targets) {
      try {
        const { label, selector, dataType } = target;
        const fieldName = label.replace(/\s+/g, '_').toLowerCase();

        antiBotService.logger.debug(`Extracting: ${label} (${selector})`);

        const elements = await page.$$(selector);

        if (elements.length === 0) {
          antiBotService.logger.warn(`No elements found for selector: ${selector}`);
          result[fieldName] = [];
          continue;
        }

        // データタイプに応じて抽出
        const data = await Promise.all(
          elements.map(async (el) => {
            switch (dataType) {
              case 'text':
                return await el.textContent();

              case 'url':
              case 'image':
                return await el.getAttribute('href') || await el.getAttribute('src');

              case 'number':
                const text = await el.textContent();
                return parseFloat(text.replace(/[^0-9.-]/g, ''));

              default:
                return await el.textContent();
            }
          })
        );

        result[fieldName] = data.map(d => d?.trim()).filter(Boolean);

        antiBotService.logger.debug(`Extracted ${result[fieldName].length} items for ${label}`);

      } catch (error) {
        antiBotService.logger.error(`Failed to extract ${target.label}: ${error.message}`);
        result[target.label] = [];
      }
    }

    return result;
  }

  /**
   * コードをファイルに保存
   * @param {string} scraperId
   * @param {string} code
   * @returns {string} ファイルパス
   */
  async saveCode(scraperId, code) {
    const fileName = `scraper_${scraperId}.js`;
    const outputDir = path.join(__dirname, '../../../data/outputs');
    const filePath = path.join(outputDir, fileName);

    // ディレクトリが存在しない場合は作成
    await fs.mkdir(outputDir, { recursive: true });

    await fs.writeFile(filePath, code, 'utf-8');

    // メモリにもコードを保存
    this.codes.set(scraperId, code);

    antiBotService.logger.info(`Code saved to ${filePath}`);

    return filePath;
  }

  /**
   * 実行結果を保存
   * @param {string} scraperId
   * @param {object} result
   * @param {string} format
   */
  async saveResult(scraperId, result, format = 'json') {
    const fileName = `result_${scraperId}.${format}`;
    const outputDir = path.join(__dirname, '../../../data/outputs');
    const filePath = path.join(outputDir, fileName);

    // ディレクトリが存在しない場合は作成
    await fs.mkdir(outputDir, { recursive: true });

    if (format === 'json') {
      await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
    } else if (format === 'csv') {
      const csv = this.convertToCSV(result.data);
      await fs.writeFile(filePath, csv, 'utf-8');
    }

    antiBotService.logger.info(`Result saved to ${filePath}`);
  }

  /**
   * データをCSV形式に変換
   * @param {object} data
   * @returns {string}
   */
  convertToCSV(data) {
    const keys = Object.keys(data);
    if (keys.length === 0) return '';

    // ヘッダー
    const header = keys.join(',');

    // 最大行数を取得
    const maxRows = Math.max(...keys.map(key => data[key].length));

    // 各行を生成
    const rows = [];
    for (let i = 0; i < maxRows; i++) {
      const row = keys.map(key => {
        const value = data[key][i] || '';
        return `"${value.toString().replace(/"/g, '""')}"`;
      });
      rows.push(row.join(','));
    }

    return [header, ...rows].join('\n');
  }

  /**
   * スクレイパーIDを生成
   * @param {string} url
   * @returns {string}
   */
  generateScraperId(url) {
    const timestamp = Date.now();
    const urlHash = Buffer.from(url).toString('base64').substring(0, 8);
    return `${urlHash}_${timestamp}`;
  }

  /**
   * 実行中のスクレイパーを取得
   * @returns {array}
   */
  getRunningScrapers() {
    return Array.from(this.runningScrapers.entries()).map(([id, info]) => ({
      id,
      ...info
    }));
  }

  /**
   * 実行結果を取得
   * @param {string} scraperId
   * @returns {object|null}
   */
  getResult(scraperId) {
    return this.results.get(scraperId) || null;
  }

  /**
   * 生成されたコードを取得
   * @param {string} scraperId
   * @returns {string|null}
   */
  getCode(scraperId) {
    return this.codes.get(scraperId) || null;
  }

  /**
   * 統計情報を取得
   * @returns {object}
   */
  getStats() {
    return {
      runningScrapers: this.runningScrapers.size,
      cachedResults: this.results.size,
      cachedCodes: this.codes.size,
      ...antiBotService.getStats()
    };
  }
}

module.exports = new ScraperExecutor();
