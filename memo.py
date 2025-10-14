import asyncio
import random
import csv
import logging
from typing import List, Dict, Any
from playwright.async_api import async_playwright, Browser, BrowserContext, Page, Playwright

# ロギング設定
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# 対象URL
TARGET_URL: str = "https://www.ee-ties.com/job/?search_element_2_1=131&search_element_0_95=1344&search_element_1_1=20&search_element_1_2=18&search_element_1_3=19&search_element_1_4=21&search_element_1_6=23&csp=search_add&feadvns_max_line_0=8&fe_form_no=0"
# 出力ファイル名
OUTPUT_FILENAME: str = "ee_ties_jobs.csv"
# リトライ最大回数
MAX_RETRIES: int = 3

async def random_delay(min_ms: int = 1000, max_ms: int = 5000) -> None:
    """
    指定されたミリ秒範囲でランダムな待機時間を生成し、非同期で待機します。
    リクエストの人間らしさを模倣するために使用されます。
    """
    delay = random.randint(min_ms, max_ms) / 1000.0
    logging.debug(f"Waiting for {delay:.2f} seconds...")
    await asyncio.sleep(delay)

async def setup_stealth_browser(playwright: Playwright) -> Browser:
    """
    Playwrightブラウザをステルス設定で起動します。
    アンチボット対策として、自動化検知されにくい設定を適用します。
    """
    logging.info("Setting up stealth browser...")
    # ブラウザの起動設定
    browser = await playwright.chromium.launch(
        headless=True,  # ヘッドレスモード (Trueに設定)
        args=[
            # WebDriver検知を回避するための引数
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-web-security",
            "--disable-features=IsolateOrigins,site-per-process",
            # その他の一般的なアンチボット対策、およびパフォーマンス向上
            "--start-maximized",  # ブラウザウィンドウを最大化
            "--disable-infobars",  # 「Chromeは自動テストソフトウェアによって制御されています」メッセージを非表示
            "--disable-extensions",  # 拡張機能を無効化
            "--disable-popup-blocking",  # ポップアップブロックを無効化
            "--ignore-certificate-errors",  # SSL証明書エラーを無視
        ]
    )
    return browser

async def new_stealth_context(browser: Browser) -> BrowserContext:
    """
    ステルス設定を適用した新しいブラウザコンテキストを作成します。
    Viewport, ロケール, タイムゾーン, User-Agentを設定し、より人間らしい環境を模倣します。
    """
    logging.info("Creating new stealth browser context...")
    # ブラウザコンテキストの設定
    context = await browser.new_context(
        viewport={'width': 1920, 'height': 1080},  # 標準的なデスクトップ画面サイズ
        locale='ja-JP',  # ロケールを日本語に設定
        timezone_id='Asia/Tokyo',  # タイムゾーンを東京に設定
        # 最新のChromeブラウザのUser-Agent文字列
        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    )
    return context

async def evade_webdriver_detection(page: Page) -> None:
    """
    ページにJavaScriptを注入し、Webdriverの検知を回避します。
    `navigator.webdriver` プロパティの偽装などを行います。
    """
    logging.debug("Injecting WebDriver evasion script...")
    await page.add_init_script("""
        // navigator.webdriverプロパティを未定義にする
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
        // window.chromeオブジェクトを偽装
        window.chrome = { runtime: {} };
        // navigator.pluginsプロパティを偽装
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5] // プラグインが存在するように見せかける
        });
        // navigator.languagesプロパティを偽装
        Object.defineProperty(navigator, 'languages', {
            get: () => ['ja-JP', 'ja'] // ブラウザの言語設定を偽装
        });
        // その他の一般的な偽装（例: WebGL情報）
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
            // UNMASKED_VENDOR_WEBGL
            if (parameter === 37445) {
                return 'Intel Open Source Technology Center';
            }
            // UNMASKED_RENDERER_WEBGL
            if (parameter === 37446) {
                return 'Mesa DRI Intel(R) Ivybridge Mobile ';
            }
            return getParameter(parameter);
        };
    """)

async def human_like_actions(page: Page) -> None:
    """
    ページ上で人間らしい動作を模倣します。
    マウスの移動やスクロールなどを行います。
    """
    logging.debug("Performing human-like actions...")
    try:
        # マウス移動: 画面上のランダムな座標へ移動
        await page.mouse.move(random.randint(0, 1000), random.randint(0, 800), steps=10)
        await random_delay(200, 500)  # 短い待機

        # スクロール: ランダムな量だけ下にスクロール
        await page.evaluate(f"window.scrollBy(0, {random.randint(300, 800)})")
        await random_delay(500, 1000)  # 短い待機
    except Exception as e:
        logging.warning(f"Error during human-like actions: {e}")

async def scrape_ee_ties() -> List[Dict[str, str]]:
    """
    EE-TIESの求人情報をスクレイピングします。
    アンチボット対策を完全に組み込み、抽出したデータを返します。
    """
    scraped_data: List[Dict[str, str]] = []
    browser: Browser | None = None
    context: BrowserContext | None = None

    async with async_playwright() as playwright:
        try:
            # 1. ステルスブラウザの起動とコンテキストの作成
            browser = await setup_stealth_browser(playwright)
            context = await new_stealth_context(browser)
            page: Page = await context.new_page()

            # 3. Webdriver検知回避スクリプトの注入 (ページリクエスト前)
            await evade_webdriver_detection(page)

            # 5. エラーハンドリングとリトライ
            for attempt in range(MAX_RETRIES):
                try:
                    logging.info(f"Navigating to {TARGET_URL} (Attempt {attempt + 1}/{MAX_RETRIES})...")
                    # ページへのアクセスとロード状態の待機
                    await page.goto(TARGET_URL, wait_until='domcontentloaded', timeout=60000)
                    # ネットワークがアイドル状態になるまでさらに待機し、完全なロードを保証
                    await page.wait_for_load_state('networkidle', timeout=30000)
                    logging.info("Page loaded successfully.")

                    # 1. リクエストの人間らしさ (遅延)
                    await random_delay(3000, 7000) # ページロード後の長めの待機

                    # 4. 人間らしい動作 (マウス移動、スクロール)
                    await human_like_actions(page)

                    # 共通の検索条件要素の取得 (各求人データに含めるため、ここで一度取得)
                    # "現在の検索条件" は複数の要素がある可能性があるため、全て取得して結合
                    current_search_conditions_elements = await page.locator("p.c-jobserch__serching_option").all_text_contents()
                    current_search_conditions = ' '.join(c.strip() for c in current_search_conditions_elements if c.strip()) if current_search_conditions_elements else ''

                    occupation_output = (await page.locator("p.js-jobsearch-occupation-output").text_content() or '').strip()
                    area_output = (await page.locator("p.js-jobsearch-sub-area-output").text_content() or '').strip()
                    industry_output = (await page.locator("p.js-jobsearch-main-industry-output").text_content() or '').strip()
                    price_output = (await page.locator("p.js-jobsearch-price-output").text_content() or '').strip()

                    logging.info("Extracting job listings...")
                    # 各求人アイテムのセレクター
                    job_items = await page.locator("article.list_item").all()
                    if not job_items:
                        logging.warning("No job listings found on the page. This might indicate a problem or no results.")
                        # もし求人が見つからないことがエラーと判断されるなら、ここで例外を発生させリトライ
                        raise ValueError("No job listings found, retrying...")

                    # 各求人アイテムからデータを抽出
                    for i, job_item in enumerate(job_items):
                        logging.debug(f"Processing job item {i+1}/{len(job_items)}")
                        title = (await job_item.locator("h3.list_heading").text_content() or '').strip()
                        company_name = (await job_item.locator("p.list_maker_name").text_content() or '').strip()

                        # 仕事内容概要は親要素のテキスト全体を取得し、不要な改行や空白を除去して整形
                        description_raw = await job_item.locator("div.list_detail.description").text_content() or ''
                        job_description = ' '.join(description_raw.split()).strip() # 複数の空白や改行を単一スペースに変換

                        scraped_data.append({
                            "求人タイトル": title,
                            "企業名": company_name,
                            "仕事内容概要": job_description,
                            "現在の検索条件": current_search_conditions,
                            "絞り込み職種": occupation_output,
                            "絞り込みエリア": area_output,
                            "絞り込み業種": industry_output,
                            "絞り込み年収": price_output,
                        })

                    logging.info(f"Successfully extracted {len(scraped_data)} job listings.")
                    break  # 成功したらリトライループを抜ける

                except Exception as e:
                    logging.error(f"Error during scraping attempt {attempt + 1}: {e}")
                    if attempt < MAX_RETRIES - 1:
                        logging.info(f"Retrying in a moment... (Attempt {attempt + 1}/{MAX_RETRIES})")
                        await random_delay(5000, 10000)  # エラー発生時は長めの待機
                    else:
                        logging.error(f"Max retries ({MAX_RETRIES}) exceeded. Could not complete scraping.")
                        raise  # 最終試行で失敗したら例外を再スロー

        except Exception as e:
            logging.critical(f"A critical error occurred during the scraping process: {e}")
        finally:
            # リソースのクリーンアップ
            if context:
                logging.info("Closing browser context...")
                await context.close()
            if browser:
                logging.info("Closing browser...")
                await browser.close()
            logging.info("Browser resources released.")

    return scraped_data

async def save_to_csv(data: List[Dict[str, str]], filename: str) -> None:
    """
    スクレイピングしたデータをCSVファイルに保存します。
    """
    if not data:
        logging.warning("No data to save to CSV.")
        return

    logging.info(f"Saving data to {filename}...")
    # 辞書のキーをヘッダーとして使用
    keys = list(data[0].keys())
    try:
        with open(filename, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=keys)
            writer.writeheader()  # ヘッダーを書き込み
            writer.writerows(data)  # データを書き込み
        logging.info(f"Data successfully saved to {filename}.")
    except IOError as e:
        logging.error(f"Error saving to CSV file '{filename}': {e}")

async def main() -> None:
    """
    スクレイピング処理のメイン実行関数です。
    """
    logging.info("Starting EE-TIES scraping process...")
    try:
        scraped_data = await scrape_ee_ties()
        await save_to_csv(scraped_data, OUTPUT_FILENAME)
    except Exception as e:
        logging.critical(f"Scraping process failed: {e}")
    logging.info("Scraping process finished.")

if __name__ == "__main__":
    # スクリプトのエントリーポイント
    # asyncio.run() を使用して非同期関数を実行
    asyncio.run(main())