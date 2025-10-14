/**
 * ==============================
 * AI Scraper Builder - Google Apps Script (非同期版)
 * ==============================
 */

const API_BASE_URL = 'https://ai-scraper-4ouy.onrender.com';

/**
 * 選択された行を実行
 */
function executeSelectedRow() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const row = sheet.getActiveRange().getRow();

  if (row === 1) {
    SpreadsheetApp.getUi().alert('ヘッダー行は実行できません');
    return;
  }

  executeRow(row);
}

/**
 * 指定された行のスクレイピングを実行（非同期版）
 */
function executeRow(row) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
  const targetUrl = sheet.getRange(row, 3).getValue(); // C列: ターゲットURL

  if (!targetUrl) {
    SpreadsheetApp.getUi().alert('ターゲットURLが入力されていません');
    return;
  }

  // ステータスを「処理中」に更新
  sheet.getRange(row, 5).setValue('処理中');
  sheet.getRange(row, 5).setBackground('#FFF3CD');

  try {
    // 自動スクレイピングを非同期で開始
    const response = UrlFetchApp.fetch(`${API_BASE_URL}/api/auto-scrape`, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        url: targetUrl,
        spreadsheetId: spreadsheetId,
        rowNumber: row
      }),
      muteHttpExceptions: true
    });

    const result = JSON.parse(response.getContentText());

    if (result.success) {
      const jobId = result.jobId;

      // 処理開始を確認（バックグラウンドで処理が続く）
      sheet.getRange(row, 8).setValue(jobId);

      SpreadsheetApp.getUi().alert(
        `スクレイピングを開始しました！\n\n` +
        `ジョブID: ${jobId}\n\n` +
        `処理が完了すると、自動的に結果がこの行に書き込まれます。\n` +
        `厳重なサイトの場合、数分かかることがあります。`
      );

    } else {
      throw new Error(result.error || 'スクレイピングの開始に失敗しました');
    }

  } catch (error) {
    sheet.getRange(row, 5).setValue('エラー');
    sheet.getRange(row, 5).setBackground('#F8D7DA');
    sheet.getRange(row, 8).setValue(`Error: ${error.message}`);

    SpreadsheetApp.getUi().alert(`エラーが発生しました:\n${error.message}`);
  }
}

/**
 * 結果シートを作成（手動で結果を取得する場合）
 */
function createResultSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const row = sheet.getActiveRange().getRow();

  if (row === 1) {
    SpreadsheetApp.getUi().alert('ヘッダー行は実行できません');
    return;
  }

  const scraperIdOrJobId = sheet.getRange(row, 8).getValue();

  if (!scraperIdOrJobId) {
    SpreadsheetApp.getUi().alert('スクレイパーIDまたはジョブIDが見つかりません');
    return;
  }

  // ジョブIDの場合はエラー
  if (scraperIdOrJobId.startsWith('job_')) {
    SpreadsheetApp.getUi().alert(
      'まだ処理中です。\n\n' +
      '処理が完了すると、自動的に結果が書き込まれます。\n' +
      'ログを確認したい場合は、Render.comのダッシュボードでジョブIDを検索してください。'
    );
    return;
  }

  // スクレイパーIDの場合は結果を取得
  const scraperId = scraperIdOrJobId;

  try {
    // 結果データを取得
    const resultData = getResultData(scraperId);
    const generatedCode = getGeneratedCode(scraperId);

    if (!resultData) {
      SpreadsheetApp.getUi().alert('結果データが見つかりません。処理が完了していない可能性があります。');
      return;
    }

    // 新しいシートに結果とコードを保存
    saveResultToNewSheet(scraperId, resultData, generatedCode);

    SpreadsheetApp.getUi().alert(`結果シート「結果_${scraperId}」を作成しました！`);

  } catch (error) {
    SpreadsheetApp.getUi().alert(`エラーが発生しました:\n${error.message}`);
  }
}

/**
 * Scraper IDから結果データを取得
 */
function getResultData(scraperId) {
  try {
    const response = UrlFetchApp.fetch(`${API_BASE_URL}/api/result/${scraperId}`, {
      method: 'get',
      muteHttpExceptions: true
    });

    const result = JSON.parse(response.getContentText());

    if (result.success && result.result) {
      return result.result;
    }

    return null;

  } catch (error) {
    Logger.log(`結果データ取得エラー: ${error.message}`);
    return null;
  }
}

/**
 * Scraper IDから生成されたコードを取得
 */
function getGeneratedCode(scraperId) {
  try {
    const response = UrlFetchApp.fetch(`${API_BASE_URL}/api/code/${scraperId}`, {
      method: 'get',
      muteHttpExceptions: true
    });

    const result = JSON.parse(response.getContentText());

    if (result.success && result.code) {
      return result.code;
    }

    return 'コードが取得できませんでした';

  } catch (error) {
    Logger.log(`コード取得エラー: ${error.message}`);
    return `コード取得エラー: ${error.message}`;
  }
}

/**
 * 新しいシートに結果とコードを保存
 */
function saveResultToNewSheet(scraperId, resultData, generatedCode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = `結果_${scraperId}`;

  // 既存のシートがあれば削除
  const existingSheet = ss.getSheetByName(sheetName);
  if (existingSheet) {
    ss.deleteSheet(existingSheet);
  }

  // 新しいシートを作成
  const newSheet = ss.insertSheet(sheetName);

  let currentRow = 1;

  // ========== セクション1: 取得データ ==========
  newSheet.getRange(currentRow, 1).setValue('📊 取得データ').setFontWeight('bold').setFontSize(14);
  newSheet.getRange(currentRow, 1).setBackground('#4285F4').setFontColor('#FFFFFF');
  currentRow += 2;

  if (resultData && resultData.data) {
    const data = resultData.data;
    const keys = Object.keys(data);

    if (keys.length > 0) {
      // ヘッダー行を作成
      keys.forEach((key, index) => {
        newSheet.getRange(currentRow, index + 1).setValue(key);
        newSheet.getRange(currentRow, index + 1).setFontWeight('bold');
        newSheet.getRange(currentRow, index + 1).setBackground('#E8F0FE');
      });
      currentRow++;

      // データ行を作成
      const maxRows = Math.max(...keys.map(key => data[key].length));

      for (let i = 0; i < maxRows; i++) {
        keys.forEach((key, colIndex) => {
          const value = data[key][i] || '';
          newSheet.getRange(currentRow, colIndex + 1).setValue(value);
        });
        currentRow++;
      }

      // 列幅を自動調整
      for (let col = 1; col <= keys.length; col++) {
        newSheet.autoResizeColumn(col);
      }

    } else {
      newSheet.getRange(currentRow, 1).setValue('データが見つかりませんでした');
      currentRow++;
    }

  } else {
    newSheet.getRange(currentRow, 1).setValue('結果データが取得できませんでした');
    currentRow++;
  }

  currentRow += 2;

  // ========== セクション2: 生成されたコード ==========
  newSheet.getRange(currentRow, 1).setValue('💻 生成されたクローリングコード').setFontWeight('bold').setFontSize(14);
  newSheet.getRange(currentRow, 1).setBackground('#34A853').setFontColor('#FFFFFF');
  currentRow += 2;

  // コードを表示
  if (generatedCode) {
    const codeLines = generatedCode.split('\n');
    codeLines.forEach((line, index) => {
      newSheet.getRange(currentRow + index, 1).setValue(line);
      newSheet.getRange(currentRow + index, 1).setFontFamily('Courier New');
      newSheet.getRange(currentRow + index, 1).setBackground('#F5F5F5');
    });
    currentRow += codeLines.length;

    // コード列の幅を広げる
    newSheet.setColumnWidth(1, 800);

  } else {
    newSheet.getRange(currentRow, 1).setValue('コードが取得できませんでした');
  }

  // シートを最前面に表示
  ss.setActiveSheet(newSheet);

  Logger.log(`結果シート作成完了: ${sheetName}`);
}

/**
 * カスタムメニューを追加
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🤖 AI Scraper')
    .addItem('選択行を実行', 'executeSelectedRow')
    .addItem('結果シートを作成', 'createResultSheet')
    .addToUi();
}
