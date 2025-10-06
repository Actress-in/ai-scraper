"""
AI Scraper Builder - Streamlit UI
アンチボット対策を組み込んだWebスクレイパービルダー
"""

import streamlit as st
import requests
import json
import os
from datetime import datetime

# ページ設定
st.set_page_config(
    page_title="AI Scraper Builder",
    page_icon="🤖",
    layout="wide"
)

# バックエンドURL（環境変数から取得、デフォルトはlocalhost）
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3001")

# セッション状態の初期化
if 'analysis_result' not in st.session_state:
    st.session_state.analysis_result = None
if 'generated_code' not in st.session_state:
    st.session_state.generated_code = None
if 'execution_result' not in st.session_state:
    st.session_state.execution_result = None

# タイトル
st.title("🤖 AI Scraper Builder")
st.markdown("**アンチボット対策完全装備のスクレイパー自動生成ツール**")

# サイドバー - 設定
st.sidebar.header("⚙️ 設定")

# アンチボット設定表示
with st.sidebar.expander("🛡️ アンチボット対策設定"):
    try:
        config_response = requests.get(f"{BACKEND_URL}/api/config", timeout=5)
        if config_response.status_code == 200:
            config = config_response.json()['config']
            st.json(config)
    except:
        st.warning("設定を取得できませんでした")

# 統計情報
with st.sidebar.expander("📊 統計情報"):
    if st.button("更新", key="refresh_stats"):
        try:
            stats_response = requests.get(f"{BACKEND_URL}/api/stats", timeout=5)
            if stats_response.status_code == 200:
                stats = stats_response.json()['stats']
                st.metric("訪問済みURL", stats.get('visitedUrls', 0))
                st.metric("アクティブプロキシ", f"{stats.get('activeProxies', 0)}/{stats.get('totalProxies', 0)}")
                st.metric("実行中", stats.get('runningScrapers', 0))
        except:
            st.error("統計を取得できませんでした")

# メインコンテンツ
tab1, tab2, tab3, tab4 = st.tabs([
    "1️⃣ ページ解析",
    "2️⃣ コード生成",
    "3️⃣ 実行",
    "4️⃣ 結果"
])

# ===== Tab 1: ページ解析 =====
with tab1:
    st.header("📊 ステップ1: ページ解析")
    st.markdown("対象URLを入力して、AIがページを解析します")

    url = st.text_input(
        "対象URL",
        placeholder="https://example.com/products",
        help="スクレイピングしたいWebページのURL"
    )

    col1, col2 = st.columns([1, 4])
    with col1:
        analyze_btn = st.button("🔍 解析開始", type="primary", use_container_width=True)

    if analyze_btn and url:
        with st.spinner("ページを解析中... (アンチボット対策により時間がかかります)"):
            try:
                response = requests.post(
                    f"{BACKEND_URL}/api/analyze",
                    json={"url": url},
                    timeout=60
                )

                if response.status_code == 200:
                    st.session_state.analysis_result = response.json()
                    st.success("✅ 解析完了！")
                else:
                    st.error(f"❌ エラー: {response.json().get('error', 'Unknown error')}")

            except requests.exceptions.Timeout:
                st.error("⏱️ タイムアウト: サイトの応答が遅すぎます")
            except Exception as e:
                st.error(f"❌ エラー: {str(e)}")

    # 解析結果の表示
    if st.session_state.analysis_result:
        result = st.session_state.analysis_result

        st.divider()
        st.subheader("📋 解析結果")

        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("ステータスコード", result.get('statusCode', 'N/A'))
        with col2:
            st.metric("検出要素数", len(result.get('suggestions', [])))
        with col3:
            timestamp = result.get('timestamp', '')
            st.metric("解析時刻", timestamp.split('T')[1][:8] if timestamp else 'N/A')

        # ページスクリーンショット表示
        if result.get('screenshot'):
            with st.expander("📸 ページスクリーンショット", expanded=False):
                import base64
                screenshot_data = result['screenshot']
                if screenshot_data:
                    st.image(f"data:image/png;base64,{screenshot_data}",
                            caption="解析したページのスクリーンショット",
                            use_container_width=True)

        # ページネーション情報表示
        pagination = result.get('pagination', {})
        if pagination.get('detected'):
            st.info(f"""
            🔄 **ページネーション検出**
            - タイプ: {pagination.get('type')}
            - 次ページセレクター: `{pagination.get('nextSelector', 'URLパターン')}`
            - 現在ページ: {pagination.get('currentPage', 'N/A')}
            {f"- 総ページ数: {pagination.get('totalPages')}" if pagination.get('totalPages') else ""}

            💡 コード生成時に自動的にページネーション対応コードが生成されます
            """)

        # AIの提案
        suggestions = result.get('suggestions', [])
        if suggestions:
            st.markdown("### 🎯 AI推奨データ要素")

            for i, suggestion in enumerate(suggestions):
                with st.expander(f"{i+1}. {suggestion['label']} - {suggestion['description']}"):
                    col1, col2 = st.columns(2)
                    with col1:
                        st.code(suggestion['selector'], language='css')
                        st.caption(f"タイプ: `{suggestion['dataType']}`")
                    with col2:
                        st.text_area(
                            "サンプル値",
                            suggestion['sampleValue'],
                            height=100,
                            disabled=True,
                            key=f"sample_{i}"
                        )

# ===== Tab 2: コード生成 =====
with tab2:
    st.header("⚙️ ステップ2: スクレイパーコード生成")

    if not st.session_state.analysis_result:
        st.warning("⚠️ 先にページ解析を実行してください")
    else:
        suggestions = st.session_state.analysis_result.get('suggestions', [])

        st.markdown("### データ要素の選択")

        # チェックボックスで選択
        selected_targets = []
        for suggestion in suggestions:
            if st.checkbox(
                f"{suggestion['label']} - {suggestion['description']}",
                value=True,
                key=f"select_{suggestion['label']}"
            ):
                selected_targets.append(suggestion)

        st.divider()

        # 追加オプション
        col1, col2 = st.columns(2)
        with col1:
            pagination = st.checkbox("ページネーション対応", value=False)
            if pagination:
                next_btn_selector = st.text_input("次ページボタンのセレクター", ".next-page")
                max_pages = st.number_input("最大ページ数", min_value=1, max_value=100, value=10)

        with col2:
            login_required = st.checkbox("ログイン必要", value=False)
            if login_required:
                st.info("ログイン情報は環境変数 USERNAME, PASSWORD から取得されます")

        output_format = st.selectbox("出力形式", ["json", "csv"], index=0)

        # コード生成
        if st.button("🚀 コード生成", type="primary"):
            if not selected_targets:
                st.error("最低1つのデータ要素を選択してください")
            else:
                with st.spinner("コードを生成中... (AIが最適なコードを作成しています)"):
                    try:
                        payload = {
                            "url": st.session_state.analysis_result['url'],
                            "targets": selected_targets,
                            "pagination": pagination,
                            "loginRequired": login_required,
                            "outputFormat": output_format
                        }

                        response = requests.post(
                            f"{BACKEND_URL}/api/generate",
                            json=payload,
                            timeout=60
                        )

                        if response.status_code == 200:
                            st.session_state.generated_code = response.json()
                            st.success("✅ コード生成完了！")
                        else:
                            st.error(f"❌ エラー: {response.json().get('error', 'Unknown error')}")

                    except Exception as e:
                        st.error(f"❌ エラー: {str(e)}")

        # 生成されたコードの表示
        if st.session_state.generated_code:
            st.divider()
            st.subheader("📝 生成されたコード")

            code = st.session_state.generated_code['code']
            st.code(code, language='javascript', line_numbers=True)

            # ダウンロードボタン
            st.download_button(
                label="💾 コードをダウンロード",
                data=code,
                file_name=f"scraper_{datetime.now().strftime('%Y%m%d_%H%M%S')}.js",
                mime="text/javascript"
            )

# ===== Tab 3: 実行 =====
with tab3:
    st.header("▶️ ステップ3: スクレイパー実行")

    if not st.session_state.generated_code:
        st.warning("⚠️ 先にコードを生成してください")
    else:
        st.markdown("### 実行オプション")

        col1, col2 = st.columns(2)
        with col1:
            save_output = st.checkbox("結果をファイルに保存", value=True)
        with col2:
            output_format_exec = st.selectbox(
                "出力形式",
                ["json", "csv"],
                index=0,
                key="exec_format"
            )

        st.divider()

        if st.button("▶️ 実行開始", type="primary"):
            with st.spinner("スクレイパーを実行中... (アンチボット対策により時間がかかります)"):
                try:
                    payload = {
                        "code": st.session_state.generated_code['code'],
                        "url": st.session_state.analysis_result['url'],
                        "targets": st.session_state.generated_code['targets'],
                        "saveOutput": save_output,
                        "outputFormat": output_format_exec
                    }

                    response = requests.post(
                        f"{BACKEND_URL}/api/execute",
                        json=payload,
                        timeout=120
                    )

                    if response.status_code == 200:
                        st.session_state.execution_result = response.json()
                        st.success("✅ 実行完了！")
                    else:
                        error_msg = response.json().get('error', 'Unknown error')
                        st.error(f"❌ エラー: {error_msg}")

                        # ブロック検知の場合
                        if 'blocked' in error_msg.lower() or '403' in error_msg:
                            st.warning("""
                            🚨 **ボット検知の可能性**
                            - プロキシの設定を検討してください
                            - 待機時間を増やしてください
                            - ヘッドレスモードを無効にしてください
                            """)

                except requests.exceptions.Timeout:
                    st.error("⏱️ タイムアウト: 実行に時間がかかりすぎています")
                except Exception as e:
                    st.error(f"❌ エラー: {str(e)}")

# ===== Tab 4: 結果 =====
with tab4:
    st.header("📈 ステップ4: 実行結果")

    if not st.session_state.execution_result:
        st.info("ℹ️ まだ実行結果がありません")
    else:
        result = st.session_state.execution_result

        st.success(f"✅ スクレイパーID: `{result['scraperId']}`")

        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("ステータスコード", result['data'].get('statusCode', 'N/A'))
        with col2:
            data_fields = len(result['data'].get('data', {}))
            st.metric("取得データ項目数", data_fields)
        with col3:
            timestamp = result.get('timestamp', '')
            st.metric("実行時刻", timestamp.split('T')[1][:8] if timestamp else 'N/A')

        st.divider()

        # 取得データの表示
        st.subheader("📊 取得データ")

        data = result['data'].get('data', {})

        if data:
            # データをテーブル形式で表示
            import pandas as pd

            # 各キーの最大長を取得
            max_len = max([len(v) for v in data.values()]) if data.values() else 0

            # データフレーム作成
            df_data = {}
            for key, values in data.items():
                # 長さを揃える
                padded_values = values + [''] * (max_len - len(values))
                df_data[key] = padded_values

            if df_data:
                df = pd.DataFrame(df_data)
                st.dataframe(df, use_container_width=True)

                # CSVダウンロード
                csv = df.to_csv(index=False)
                st.download_button(
                    label="💾 CSVでダウンロード",
                    data=csv,
                    file_name=f"scraped_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
                    mime="text/csv"
                )

            # JSON表示
            with st.expander("📄 JSON形式で表示"):
                st.json(data)

        else:
            st.warning("データが取得できませんでした")

# フッター
st.divider()
st.markdown("""
<div style='text-align: center; color: gray;'>
    <p>🤖 AI Scraper Builder v1.0</p>
    <p>アンチボット対策完全装備 | Playwright + Gemini AI</p>
</div>
""", unsafe_allow_html=True)
