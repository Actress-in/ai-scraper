/**
 * ページ解析サービス
 * PlaywrightとAIを使ってWebページを解析し、取得可能なデータ要素を提案
 */

const { chromium } = require('playwright');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const antiBotService = require('./AntiBotService');
const config = require('../config/antibot.config');

class PageAnalyzer {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    this.browser = null;
    this.context = null;
  }

  /**
   * ブラウザを起動
   */
  async launchBrowser() {
    if (this.browser) return;

    antiBotService.logger.info('Launching browser...');

    this.browser = await chromium.launch({
      headless: config.browser.headless,
      ...config.browser.launchOptions
    });

    this.context = await this.browser.newContext({
      ...config.browser.contextOptions,
      extraHTTPHeaders: antiBotService.generateHeaders()
    });

    antiBotService.logger.info('Browser launched successfully');
  }

  /**
   * ブラウザを閉じる
   */
  async closeBrowser() {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      antiBotService.logger.info('Browser closed');
    }
  }

  /**
   * URLを解析してデータ要素を提案
   * @param {string} url - 解析対象のURL
   * @returns {object} 解析結果
   */
  async analyzePage(url) {
    try {
      // 訪問済みチェック
      if (antiBotService.isUrlVisited(url)) {
        antiBotService.logger.warn(`URL already visited: ${url}`);
      }

      await this.launchBrowser();

      const page = await this.context.newPage();

      // ステルススクリプト注入
      await antiBotService.injectStealthScripts(page);

      // 人間らしい待機時間
      const delay = antiBotService.getTimeAdjustedDelay();
      antiBotService.logger.info(`Waiting ${delay}ms before navigation...`);
      await antiBotService.sleep(delay);

      // ページにアクセス
      antiBotService.logger.info(`Navigating to ${url}`);
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded', // networkidle より緩い条件に変更
        timeout: config.errorHandling.timeout
      });

      // ステータスコードチェック
      const statusCode = response.status();
      if (statusCode !== 200) {
        antiBotService.logger.warn(`Non-200 status code: ${statusCode}`);
        const result = await antiBotService.handleStatusCode(statusCode, 0);
        if (!result.shouldRetry) {
          throw new Error(`Failed to load page: HTTP ${statusCode}`);
        }
      }

      // ページ読み込み後の待機
      const pageLoadDelay = antiBotService.getRandomDelay(
        config.timing.pageLoadDelay.min,
        config.timing.pageLoadDelay.max
      );
      await antiBotService.sleep(pageLoadDelay);

      // 人間らしい動作をシミュレート
      await antiBotService.simulateHumanMouseMovement(page);
      await antiBotService.simulateHumanScroll(page);

      // DOM構造を取得
      const domStructure = await this.extractDOMStructure(page);

      // ページのスクリーンショット（Base64エンコード）
      const screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false });
      const screenshotBase64 = screenshotBuffer.toString('base64');

      // ページネーション自動検出
      const pagination = await this.detectPagination(page, url);

      // AIによる解析（エラー時はDOM構造から基本的な提案を生成）
      let aiSuggestions = [];
      try {
        aiSuggestions = await this.analyzeWithAI(domStructure, url);
      } catch (error) {
        antiBotService.logger.warn('AI analysis failed, using fallback suggestions');
        aiSuggestions = this.generateFallbackSuggestions(domStructure);
      }

      // URLを訪問済みとしてマーク
      antiBotService.markUrlVisited(url);

      await page.close();

      return {
        success: true,
        url,
        statusCode,
        domStructure,
        suggestions: aiSuggestions,
        screenshot: screenshotBase64,
        pagination: pagination,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      antiBotService.logger.error(`Page analysis failed: ${error.message}`);

      // 検知の可能性をチェック
      if (error.message.includes('403') || error.message.includes('blocked')) {
        antiBotService.sendDetectionAlert('Possible bot detection', {
          url,
          error: error.message
        });
      }

      throw error;
    }
  }

  /**
   * DOM構造を抽出
   * @param {Page} page
   * @returns {object}
   */
  async extractDOMStructure(page) {
    return await page.evaluate(() => {
      const elements = [];
      const maxElements = 50; // 最大取得数

      // 主要な要素を抽出
      const selectors = [
        'h1', 'h2', 'h3', 'a', 'img', 'p',
        '[class*="title"]', '[class*="price"]', '[class*="name"]',
        '[class*="description"]', '[class*="product"]', '[class*="item"]',
        '[id*="content"]', '[id*="main"]'
      ];

      const seen = new Set();

      for (const selector of selectors) {
        const nodes = document.querySelectorAll(selector);

        for (let i = 0; i < Math.min(nodes.length, 10); i++) {
          const node = nodes[i];

          // 重複チェック
          const text = node.textContent?.trim().substring(0, 100);
          if (!text || seen.has(text)) continue;
          seen.add(text);

          // 要素情報を収集
          const info = {
            tag: node.tagName.toLowerCase(),
            text: text,
            html: node.outerHTML.substring(0, 200),
            classes: Array.from(node.classList),
            id: node.id,
            attributes: {}
          };

          // 主要な属性を取得
          ['href', 'src', 'alt', 'title'].forEach(attr => {
            if (node.hasAttribute(attr)) {
              info.attributes[attr] = node.getAttribute(attr);
            }
          });

          // セレクター候補を生成
          info.selectors = [];
          if (node.id) {
            info.selectors.push(`#${node.id}`);
          }
          if (node.classList.length > 0) {
            info.selectors.push(`.${Array.from(node.classList).join('.')}`);
          }
          info.selectors.push(node.tagName.toLowerCase());

          elements.push(info);

          if (elements.length >= maxElements) break;
        }

        if (elements.length >= maxElements) break;
      }

      return {
        title: document.title,
        url: window.location.href,
        elements,
        totalElements: document.querySelectorAll('*').length
      };
    });
  }

  /**
   * ページネーション自動検出
   * @param {Page} page
   * @param {string} url
   * @returns {object}
   */
  async detectPagination(page, url) {
    try {
      const paginationInfo = await page.evaluate((currentUrl) => {
        const result = {
          detected: false,
          type: null, // 'button', 'link', 'url_pattern'
          nextSelector: null,
          urlPattern: null,
          currentPage: 1,
          totalPages: null
        };

        // URL パターン検出（?page=1, /page/1 など）
        const urlPatterns = [
          { regex: /[?&]page=(\d+)/i, type: 'query' },
          { regex: /\/page\/(\d+)/i, type: 'path' },
          { regex: /[?&]p=(\d+)/i, type: 'query' },
          { regex: /\/p\/(\d+)/i, type: 'path' },
          { regex: /[?&]offset=(\d+)/i, type: 'offset' }
        ];

        for (const pattern of urlPatterns) {
          const match = currentUrl.match(pattern.regex);
          if (match) {
            result.detected = true;
            result.type = 'url_pattern';
            result.urlPattern = pattern.type;
            result.currentPage = parseInt(match[1]);
            return result;
          }
        }

        // 次へボタン/リンクを検出
        const nextButtonSelectors = [
          'a[rel="next"]',
          'a.next',
          'button.next',
          'a:has-text("次へ")',
          'a:has-text("Next")',
          'a:has-text(">")',
          'button:has-text("次へ")',
          'button:has-text("Next")',
          '.pagination a:last-child',
          '[aria-label*="next" i]',
          '[aria-label*="次" i]'
        ];

        for (const selector of nextButtonSelectors) {
          try {
            const elements = document.querySelectorAll(selector.replace(':has-text', ':contains'));
            if (elements.length > 0) {
              // テキストベースの検索
              for (const el of elements) {
                const text = el.textContent?.trim().toLowerCase();
                if (text && (text.includes('next') || text.includes('次') || text === '>' || text.includes('→'))) {
                  result.detected = true;
                  result.type = 'button';

                  // セレクターを生成
                  if (el.id) {
                    result.nextSelector = `#${el.id}`;
                  } else if (el.className) {
                    result.nextSelector = `.${Array.from(el.classList).join('.')}`;
                  } else {
                    result.nextSelector = el.tagName.toLowerCase();
                  }

                  return result;
                }
              }
            }
          } catch (e) {
            // セレクターエラーは無視
          }
        }

        // ページ番号リンクから推測
        const pageLinks = document.querySelectorAll('a[href*="page"], a[href*="p="]');
        if (pageLinks.length > 0) {
          result.detected = true;
          result.type = 'link';
          result.totalPages = pageLinks.length;
        }

        return result;
      }, url);

      if (paginationInfo.detected) {
        antiBotService.logger.info(`Pagination detected: ${paginationInfo.type}`);
      } else {
        antiBotService.logger.debug('No pagination detected');
      }

      return paginationInfo;

    } catch (error) {
      antiBotService.logger.error(`Pagination detection failed: ${error.message}`);
      return { detected: false };
    }
  }

  /**
   * フォールバック: DOM構造から基本的な提案を生成
   * @param {object} domStructure
   * @returns {array}
   */
  generateFallbackSuggestions(domStructure) {
    const suggestions = [];
    const elements = domStructure.elements || [];

    // よくあるパターンから提案を生成
    const patterns = [
      { keywords: ['title', 'heading', 'name', 'product'], label: 'タイトル/見出し', dataType: 'text' },
      { keywords: ['price', 'cost', 'amount'], label: '価格', dataType: 'text' },
      { keywords: ['description', 'detail', 'content', 'text'], label: '説明文', dataType: 'text' },
      { keywords: ['image', 'img', 'photo', 'picture'], label: '画像URL', dataType: 'image' },
      { keywords: ['link', 'url', 'href'], label: 'リンク', dataType: 'url' },
      { keywords: ['date', 'time', 'published'], label: '日付', dataType: 'text' },
      { keywords: ['author', 'user', 'name'], label: '著者/ユーザー名', dataType: 'text' },
      { keywords: ['category', 'tag', 'label'], label: 'カテゴリー', dataType: 'text' }
    ];

    const usedSelectors = new Set();

    elements.forEach(element => {
      // すでに使用されたセレクターはスキップ
      const selector = element.selectors?.[0];
      if (!selector || usedSelectors.has(selector)) return;

      // クラス名やIDからキーワードマッチング
      const elementText = [
        element.classes?.join(' '),
        element.id,
        element.tag
      ].filter(Boolean).join(' ').toLowerCase();

      for (const pattern of patterns) {
        const matched = pattern.keywords.some(keyword =>
          elementText.includes(keyword)
        );

        if (matched && suggestions.length < 10) {
          suggestions.push({
            label: pattern.label,
            description: `${pattern.label}の可能性があります`,
            selector: selector,
            sampleValue: element.text || '(サンプル値)',
            dataType: pattern.dataType
          });
          usedSelectors.add(selector);
          break;
        }
      }
    });

    // 提案が少ない場合は、最初の要素から追加
    if (suggestions.length < 5) {
      elements.slice(0, 10 - suggestions.length).forEach(element => {
        const selector = element.selectors?.[0];
        if (selector && !usedSelectors.has(selector)) {
          suggestions.push({
            label: `${element.tag}要素`,
            description: `${element.tag}タグの要素`,
            selector: selector,
            sampleValue: element.text || '(サンプル値)',
            dataType: 'text'
          });
          usedSelectors.add(selector);
        }
      });
    }

    antiBotService.logger.info(`Fallback generated ${suggestions.length} suggestions`);
    return suggestions;
  }

  /**
   * AIでページを解析
   * @param {object} domStructure
   * @param {string} url
   * @returns {array} データ要素の提案
   */
  async analyzeWithAI(domStructure, url) {
    const prompt = `
あなたはWebスクレイピングの専門家です。以下のWebページのDOM構造を分析し、取得可能なデータ要素を提案してください。

URL: ${url}
ページタイトル: ${domStructure.title}

主要な要素（最大50件）:
${JSON.stringify(domStructure.elements, null, 2)}

以下の形式でJSON配列として回答してください:
[
  {
    "label": "商品名",
    "description": "商品のタイトルや名称",
    "selector": "h2.product-title",
    "sampleValue": "サンプル商品A",
    "dataType": "text"
  },
  {
    "label": "価格",
    "description": "商品の価格情報",
    "selector": ".price",
    "sampleValue": "¥1,980",
    "dataType": "text"
  }
]

要件:
- 一般的に有用なデータ要素のみ提案
- セレクターは可能な限り具体的かつ安定したものを選択
- dataTypeは "text", "url", "image", "number" のいずれか
- 最大10件まで提案
- JSON形式のみを返し、説明文は不要
`;

    try {
      const result = await this.model.generateContent(prompt);
      const text = result.response.text();

      // JSONを抽出（マークダウンコードブロックを除去）
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        antiBotService.logger.warn('AI response does not contain valid JSON');
        return [];
      }

      const suggestions = JSON.parse(jsonMatch[0]);
      antiBotService.logger.info(`AI suggested ${suggestions.length} data elements`);

      return suggestions;

    } catch (error) {
      antiBotService.logger.error(`AI analysis failed: ${error.message}`);
      return [];
    }
  }

  /**
   * 特定の要素をテスト取得
   * @param {string} url
   * @param {string} selector
   * @returns {array} 取得されたデータ
   */
  async testSelector(url, selector) {
    try {
      await this.launchBrowser();
      const page = await this.context.newPage();

      await antiBotService.injectStealthScripts(page);
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: config.errorHandling.timeout
      });

      const data = await page.evaluate((sel) => {
        const elements = document.querySelectorAll(sel);
        return Array.from(elements).slice(0, 5).map(el => ({
          text: el.textContent?.trim(),
          html: el.outerHTML.substring(0, 200),
          attributes: {
            href: el.getAttribute('href'),
            src: el.getAttribute('src')
          }
        }));
      }, selector);

      await page.close();

      return {
        success: true,
        selector,
        count: data.length,
        samples: data
      };

    } catch (error) {
      antiBotService.logger.error(`Selector test failed: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new PageAnalyzer();
