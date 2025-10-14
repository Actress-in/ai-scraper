/**
 * Google Apps Script - AI Scraper自動実行
 *
 * セットアップ手順:
 * 1. Googleスプレッドシートを開く
 * 2. 拡張機能 > Apps Script
 * 3. このコードをコピペ
 * 4. BACKEND_URLを実際のデプロイURLに変更
 * 5. トリガーを設定（onFormSubmit関数を「フォーム送信時」に実行）
 */

// ===== 設定 =====
const CONFIG = {
  BACKEND_URL: 'https://your-backend-url.com', // デプロイ後のバックエンドURL
  SHEET_NAME: '管理台帳',

  // 列のマッピング（実際のスプレッドシートに合わせて調整）
  COLUMNS: {
    REQUEST_NO: 1,      // A列: 受付No
    TIMESTAMP: 2,       // B列: タイムスタンプ
    REQUESTER: 3,       // C列: 依頼者
    TARGET_URL: 4,      // D列: 対象URL
    PURPOSE: 5,         // E列: 目的
    STATUS: 6,          // F列: ステータス
    ASSIGNEE: 7,        // G列: 担当者
    DUE_DATE: 8,        // H列: 希望納期
    DATA_COUNT: 9,      // I列: 取得件数
    SCREENSHOT_URL: 10, // J列: スクショURL
    RESULT_URL: 11,     // K列: データURL
    COMPLETED_AT: 12    // L列: 完了日時
  }
};

/**
 * フォーム送信時に自動実行されるトリガー関数
 * トリガー設定: 拡張機能 > Apps Script > トリガー > トリガーを追加
 * - 実行する関数: onFormSubmit
 * - イベントのソースを選択: スプレッドシートから
 * - イベントの種類を選択: フォーム送信時
 */
function onFormSubmit(e) {
  try {
    Logger.log('フォーム送信を検知しました');

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
    const lastRow = sheet.getLastRow();

    // 最新行のデータを取得
    const requestNo = sheet.getRange(lastRow, CONFIG.COLUMNS.REQUEST_NO).getValue();
    const targetUrl = sheet.getRange(lastRow, CONFIG.COLUMNS.TARGET_URL).getValue();
    const purpose = sheet.getRange(lastRow, CONFIG.COLUMNS.PURPOSE).getValue();

    if (!targetUrl) {
      Logger.log('対象URLが空です。処理をスキップします。');
      return;
    }

    // ステータスを「処理中」に更新
    sheet.getRange(lastRow, CONFIG.COLUMNS.STATUS).setValue('処理中');

    // バックエンドにWebhookを送信
    sendWebhook(lastRow, targetUrl, purpose, requestNo);

  } catch (error) {
    Logger.log('エラー発生: ' + error.toString());
  }
}

/**
 * 手動実行ボタン用の関数
 * スプレッドシートに「実行」ボタンを作成し、この関数を割り当てる
 */
function manualExecute() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt(
    'スクレイピング実行',
    '実行する行番号を入力してください:',
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() === ui.Button.OK) {
    const rowNumber = parseInt(result.getResponseText());

    if (isNaN(rowNumber) || rowNumber < 2) {
      ui.alert('無効な行番号です');
      return;
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
    const targetUrl = sheet.getRange(rowNumber, CONFIG.COLUMNS.TARGET_URL).getValue();
    const purpose = sheet.getRange(rowNumber, CONFIG.COLUMNS.PURPOSE).getValue();
    const requestNo = sheet.getRange(rowNumber, CONFIG.COLUMNS.REQUEST_NO).getValue();

    if (!targetUrl) {
      ui.alert('対象URLが空です');
      return;
    }

    // ステータスを「処理中」に更新
    sheet.getRange(rowNumber, CONFIG.COLUMNS.STATUS).setValue('処理中');

    // バックエンドにリクエスト送信
    sendWebhook(rowNumber, targetUrl, purpose, requestNo);

    ui.alert('処理を開始しました。完了までしばらくお待ちください。');
  }
}

/**
 * バックエンドにWebhookを送信
 */
function sendWebhook(rowNumber, targetUrl, purpose, requestNo) {
  const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();

  const payload = {
    spreadsheetId: spreadsheetId,
    rowNumber: rowNumber,
    targetUrl: targetUrl,
    purpose: purpose,
    requestNo: requestNo
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    Logger.log('Webhook送信中: ' + CONFIG.BACKEND_URL + '/api/webhook/sheet');

    const response = UrlFetchApp.fetch(CONFIG.BACKEND_URL + '/api/webhook/sheet', options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    Logger.log('レスポンスコード: ' + responseCode);
    Logger.log('レスポンス内容: ' + responseText);

    if (responseCode === 200) {
      Logger.log('Webhook送信成功');
    } else {
      Logger.log('Webhook送信失敗: ' + responseText);
    }

  } catch (error) {
    Logger.log('Webhook送信エラー: ' + error.toString());

    // エラーをスプレッドシートに記録
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
    sheet.getRange(rowNumber, CONFIG.COLUMNS.STATUS).setValue('エラー');
    sheet.getRange(rowNumber, CONFIG.COLUMNS.RESULT_URL).setValue('Error: ' + error.toString());
  }
}

/**
 * カスタムメニューを追加
 * スプレッドシートを開いたときに自動実行される
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🤖 AI Scraper')
    .addItem('選択行を実行', 'manualExecute')
    .addItem('設定を確認', 'showSettings')
    .addSeparator()
    .addItem('テスト実行', 'testConnection')
    .addToUi();
}

/**
 * 設定情報を表示
 */
function showSettings() {
  const ui = SpreadsheetApp.getUi();
  const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();

  const message =
    'スプレッドシートID: ' + spreadsheetId + '\n' +
    'バックエンドURL: ' + CONFIG.BACKEND_URL + '\n' +
    'シート名: ' + CONFIG.SHEET_NAME + '\n\n' +
    '※ バックエンドURLが正しく設定されているか確認してください';

  ui.alert('設定情報', message, ui.ButtonSet.OK);
}

/**
 * 接続テスト
 */
function testConnection() {
  const ui = SpreadsheetApp.getUi();

  try {
    const response = UrlFetchApp.fetch(CONFIG.BACKEND_URL + '/api/health', {
      method: 'get',
      muteHttpExceptions: true
    });

    const responseCode = response.getResponseCode();

    if (responseCode === 200) {
      ui.alert('接続成功', 'バックエンドに正常に接続できました!', ui.ButtonSet.OK);
    } else {
      ui.alert('接続失敗', 'バックエンドに接続できません。URLを確認してください。\nステータスコード: ' + responseCode, ui.ButtonSet.OK);
    }

  } catch (error) {
    ui.alert('接続エラー', 'バックエンドに接続できません:\n' + error.toString(), ui.ButtonSet.OK);
  }
}

/**
 * 定期実行用: 「新規受付」のものを自動処理
 * トリガー設定: 時間主導型 → 分ベースのタイマー → 5分おき
 */
function processNewRequests() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  // ヘッダー行を除く
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const status = row[CONFIG.COLUMNS.STATUS - 1];
    const targetUrl = row[CONFIG.COLUMNS.TARGET_URL - 1];

    // ステータスが「新規受付」かつURLが存在する場合
    if (status === '新規受付' && targetUrl) {
      const rowNumber = i + 1;
      const requestNo = row[CONFIG.COLUMNS.REQUEST_NO - 1];
      const purpose = row[CONFIG.COLUMNS.PURPOSE - 1];

      Logger.log('新規受付を検知: 行' + rowNumber);

      // ステータスを「処理中」に更新
      sheet.getRange(rowNumber, CONFIG.COLUMNS.STATUS).setValue('処理中');

      // Webhook送信
      sendWebhook(rowNumber, targetUrl, purpose, requestNo);

      // API制限を避けるため、1件ずつ処理
      Utilities.sleep(2000); // 2秒待機
    }
  }
}
