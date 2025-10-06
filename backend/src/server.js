/**
 * AI Scraper Builder - Express Server
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');
const pageAnalyzer = require('./services/PageAnalyzer');
const codeGenerator = require('./services/CodeGenerator');
const scraperExecutor = require('./services/ScraperExecutor');
const antiBotService = require('./services/AntiBotService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// リクエストログ
app.use((req, res, next) => {
  antiBotService.logger.info(`${req.method} ${req.path}`);
  next();
});

// ===== API Endpoints =====

/**
 * ヘルスチェック
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'AI Scraper Builder',
    timestamp: new Date().toISOString()
  });
});

/**
 * ページ解析
 * POST /api/analyze
 * Body: { url: string }
 */
app.post('/api/analyze', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    antiBotService.logger.info(`Analyzing page: ${url}`);

    const result = await pageAnalyzer.analyzePage(url);

    res.json(result);

  } catch (error) {
    antiBotService.logger.error(`Analysis failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * セレクターテスト
 * POST /api/test-selector
 * Body: { url: string, selector: string }
 */
app.post('/api/test-selector', async (req, res) => {
  try {
    const { url, selector } = req.body;

    if (!url || !selector) {
      return res.status(400).json({
        success: false,
        error: 'URL and selector are required'
      });
    }

    const result = await pageAnalyzer.testSelector(url, selector);

    res.json(result);

  } catch (error) {
    antiBotService.logger.error(`Selector test failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * スクレイパーコード生成
 * POST /api/generate
 * Body: {
 *   url: string,
 *   targets: array,
 *   pagination: boolean,
 *   loginRequired: boolean,
 *   outputFormat: string
 * }
 */
app.post('/api/generate', async (req, res) => {
  try {
    const params = req.body;

    if (!params.url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    antiBotService.logger.info(`Generating scraper code for: ${params.url}`);

    const result = await codeGenerator.generateScraperCode(params);

    res.json(result);

  } catch (error) {
    antiBotService.logger.error(`Code generation failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ページネーション対応コード生成
 * POST /api/generate-pagination
 */
app.post('/api/generate-pagination', async (req, res) => {
  try {
    const params = req.body;

    const code = await codeGenerator.generatePaginationCode(params);

    res.json({
      success: true,
      code,
      language: 'javascript',
      framework: 'playwright'
    });

  } catch (error) {
    antiBotService.logger.error(`Pagination code generation failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ログイン対応コード生成
 * POST /api/generate-login
 */
app.post('/api/generate-login', async (req, res) => {
  try {
    const params = req.body;

    const code = await codeGenerator.generateLoginCode(params);

    res.json({
      success: true,
      code,
      language: 'javascript',
      framework: 'playwright'
    });

  } catch (error) {
    antiBotService.logger.error(`Login code generation failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * スクレイパー実行
 * POST /api/execute
 * Body: {
 *   code: string,
 *   url: string,
 *   targets: array,
 *   saveOutput: boolean,
 *   outputFormat: string
 * }
 */
app.post('/api/execute', async (req, res) => {
  try {
    const params = req.body;

    if (!params.url || !params.targets) {
      return res.status(400).json({
        success: false,
        error: 'URL and targets are required'
      });
    }

    antiBotService.logger.info(`Executing scraper for: ${params.url}`);

    const result = await scraperExecutor.executeScraper(params);

    res.json(result);

  } catch (error) {
    antiBotService.logger.error(`Scraper execution failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 実行結果取得
 * GET /api/result/:scraperId
 */
app.get('/api/result/:scraperId', (req, res) => {
  try {
    const { scraperId } = req.params;

    const result = scraperExecutor.getResult(scraperId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Result not found'
      });
    }

    res.json({
      success: true,
      result
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 統計情報取得
 * GET /api/stats
 */
app.get('/api/stats', (req, res) => {
  try {
    const stats = scraperExecutor.getStats();

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 実行中のスクレイパー一覧
 * GET /api/scrapers
 */
app.get('/api/scrapers', (req, res) => {
  try {
    const scrapers = scraperExecutor.getRunningScrapers();

    res.json({
      success: true,
      scrapers
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * アンチボット設定取得
 * GET /api/config
 */
app.get('/api/config', (req, res) => {
  const config = require('./config/antibot.config');

  res.json({
    success: true,
    config: {
      timing: config.timing,
      proxy: {
        enabled: config.proxy.enabled,
        count: config.proxy.list.length
      },
      browser: {
        headless: config.browser.headless
      },
      concurrency: config.concurrency
    }
  });
});

// エラーハンドリング
app.use((err, req, res, next) => {
  antiBotService.logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404ハンドリング
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   AI Scraper Builder - Server Running    ║
╠═══════════════════════════════════════════╣
║  Port: ${PORT}                              ║
║  Environment: ${process.env.NODE_ENV || 'development'}               ║
║  Anti-Bot: Enabled                        ║
╚═══════════════════════════════════════════╝
  `);

  antiBotService.logger.info(`Server started on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await pageAnalyzer.closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  await pageAnalyzer.closeBrowser();
  process.exit(0);
});

module.exports = app;
