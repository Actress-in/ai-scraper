/**
 * Google Sheets Integration Service
 * スプレッドシートとの連携機能
 */

const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class SheetIntegration {
  constructor() {
    this.sheets = null;
    this.auth = null;
  }

  /**
   * Google Sheets APIの認証
   */
  async authenticate() {
    try {
      // Google認証が設定されていない場合はスキップ
      if (!process.env.GOOGLE_CREDENTIALS_PATH && !process.env.GOOGLE_API_KEY) {
        console.warn('Google Sheets credentials not configured. Skipping authentication.');
        return false;
      }

      // サービスアカウントキーまたはOAuth2認証
      const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH;

      if (credentialsPath) {
        const credentials = JSON.parse(await fs.readFile(credentialsPath, 'utf8'));
        this.auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
      } else {
        // APIキーのみの場合（読み取り専用）
        this.auth = process.env.GOOGLE_API_KEY;
      }

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      return true;
    } catch (error) {
      console.warn('Google Sheets authentication failed:', error.message);
      return false;
    }
  }

  /**
   * スプレッドシートから依頼情報を読み取る
   * @param {string} spreadsheetId
   * @param {string} range
   */
  async readRequest(spreadsheetId, range = '管理台帳!A2:Z') {
    if (!this.sheets) {
      await this.authenticate();
    }

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range
      });

      const rows = response.data.values || [];

      // 列のマッピング（実際のスプレッドシートの構造に合わせて調整）
      return rows.map(row => ({
        rowNumber: rows.indexOf(row) + 2, // A2から始まるので+2
        requestNo: row[0],        // A列: 受付No
        timestamp: row[1],        // B列: タイムスタンプ
        requester: row[2],        // C列: 依頼者
        targetUrl: row[3],        // D列: 対象URL
        purpose: row[4],          // E列: 目的
        status: row[5],           // F列: ステータス
        assignee: row[6],         // G列: 担当者
        dueDate: row[7],          // H列: 希望納期
        // 結果を書き込む列
        resultDataCount: row[8],  // I列: 取得件数
        screenshotUrl: row[9],    // J列: スクショURL
        resultUrl: row[10],       // K列: データURL
        completedAt: row[11]      // L列: 完了日時
      }));
    } catch (error) {
      throw new Error(`Failed to read sheet: ${error.message}`);
    }
  }

  /**
   * スプレッドシートに結果を書き込む
   * @param {string} spreadsheetId
   * @param {number} rowNumber
   * @param {object} result
   */
  async writeResult(spreadsheetId, rowNumber, result) {
    if (!this.sheets) {
      const authenticated = await this.authenticate();
      if (!authenticated) {
        console.warn('Skipping sheet write: Google Sheets not authenticated');
        return false;
      }
    }

    try {
      // 列番号の定義
      // H列（8）: ターゲットURL
      // R列（18）: ステータス
      // V列（22）: 結果
      // W列（23）: ID

      const updates = [
        {
          range: `管理台帳!R${rowNumber}`, // R列: ステータス
          values: [[result.status || '完了']]
        },
        {
          range: `管理台帳!V${rowNumber}`, // V列: 結果（データ件数など）
          values: [[
            `取得: ${result.dataCount || 0}件 | スクショ: ${result.screenshotUrl ? 'あり' : 'なし'} | データURL: ${result.dataUrl || 'なし'} | 完了: ${new Date().toLocaleString('ja-JP')}`
          ]]
        },
        {
          range: `管理台帳!W${rowNumber}`, // W列: ID (Scraper ID)
          values: [[result.scraperId || '']]
        }
      ];

      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        resource: {
          valueInputOption: 'USER_ENTERED',
          data: updates
        }
      });

      return true;
    } catch (error) {
      throw new Error(`Failed to write to sheet: ${error.message}`);
    }
  }

  /**
   * セルの背景色を変更（完了時に緑色にする）
   * @param {string} spreadsheetId
   * @param {number} rowNumber
   * @param {string} color
   */
  async updateRowColor(spreadsheetId, rowNumber, color = 'green') {
    if (!this.sheets) {
      const authenticated = await this.authenticate();
      if (!authenticated) {
        console.warn('Skipping row color update: Google Sheets not authenticated');
        return false;
      }
    }

    const colors = {
      green: { red: 0.7, green: 0.9, blue: 0.7 },
      yellow: { red: 1, green: 0.95, blue: 0.6 },
      red: { red: 0.95, green: 0.7, blue: 0.7 }
    };

    try {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{
            repeatCell: {
              range: {
                sheetId: 0, // シートIDを取得する必要がある場合は動的に取得
                startRowIndex: rowNumber - 1,
                endRowIndex: rowNumber
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: colors[color] || colors.green
                }
              },
              fields: 'userEnteredFormat.backgroundColor'
            }
          }]
        }
      });

      return true;
    } catch (error) {
      console.warn('Failed to update row color:', error.message);
      return false;
    }
  }

  /**
   * スクリーンショットをGoogle Driveにアップロード
   * @param {string} screenshotBuffer
   * @param {string} fileName
   */
  async uploadScreenshot(screenshotBuffer, fileName) {
    // Google Drive APIを使用してアップロード
    // 簡略化のため、ローカル保存のパスを返す
    const outputDir = path.join(__dirname, '../../../data/screenshots');
    await fs.mkdir(outputDir, { recursive: true });

    const filePath = path.join(outputDir, fileName);
    await fs.writeFile(filePath, screenshotBuffer);

    // 実際の運用では、Google DriveにアップロードしてURLを返す
    return `file://${filePath}`;
  }
}

module.exports = new SheetIntegration();
