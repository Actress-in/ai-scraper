/**
 * AWS Lambda Handler
 * Serverless Framework用のエントリーポイント
 */

const serverless = require('serverless-http');
const app = require('./server');

// Lambda関数ハンドラー
module.exports.handler = serverless(app, {
  // リクエストとレスポンスのサイズ制限を拡大
  request: {
    basePath: '/prod'
  }
});
