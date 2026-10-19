# Anya 每日投資分析報告 📈

> 自動產生的台美股盤前／盤後報告：把前一晚美股、亞股、台股盤前與籌碼數據整理成一頁，附上 AI 撰寫的盤勢解讀。

🌐 **線上看報告：** https://ss1111119.github.io/anya-investment-reports/

---

## 🗓️ 什麼時候更新

| 報告 | 時間（台北） | 檔名 |
|------|------|------|
| 晨報 | 交易日約 08:45，開盤前 | `data/YYYY-MM-DD-morning.json` |
| 晚報 | 交易日約 17:30，收盤後 | `data/YYYY-MM-DD-evening.json` |
| 週末早報／晚報 | 週末與休市日 | `-weekend_morning.json` / `-weekend_evening.json` |

自 2026-03-27 起每日累積，頁面上方可切換日期與報告。

## 📖 怎麼讀這份報告

- **紅漲綠跌**：依台灣慣例，上漲為紅、下跌為綠。
- **每個數字都標資料日期**：美股、亞股、總經資料的發布時間不同；資料日不是報告日時，日期會標在數字旁。
- **分清楚誰寫的**：標示「AI 撰寫」的段落由語言模型產生；其餘的數字、條列與觀察重點由程式直接從資料產生。
- **暫缺就說暫缺**：資料尚未發布或來源失敗時顯示「—」或「資料待補」，不以 0 代替。

## ✨ 報告內容

- **頁首摘要**：當日訊號、關鍵數字（加權指數、台指期夜盤、費半）
- **下一交易日觀察重點**：基準情境與要留意的條件
- **0050 現況**
- **台股盤前**：台指期夜盤、富台指期（SGX 每日結算價）、融資維持率、Put/Call 比
- **美股宏觀指標**：S&P 500、Nasdaq、費半、道瓊、VIX、台積電 ADR、台灣 ETF、黃金、原油等
- **盤勢解讀**：規則產生的判讀，加上 AI 撰寫的深度分析
- **市場情緒**：台股籌碼情緒、CNN 恐懼貪婪、加密貨幣恐懼貪婪
- **台股內部結構**：成交值、櫃買指數、外資期貨未平倉、大盤估值
- **市場注意力雷達、新聞重點**
- **近期歷史走勢、預測驗證**

## 🛠️ 技術

- 純靜態網頁（`index.html` + `static/js/index.js` + `static/css/index.css`），部署在 GitHub Pages，沒有後端
- [Chart.js](https://www.chartjs.org/) 繪圖、[marked](https://marked.js.org/) 渲染 AI 分析的 Markdown
- `data/index.json` 是報告索引，每份報告一個 JSON

`static/` 裡其他的 JS／CSS（儀表板等）是隨發布一起同步的共用檔案，這個網站不會載入它們。

## 📁 專案結構

```
anya-investment-reports/
├── index.html              # 報告頁
├── us_digest.png           # 美股摘要圖
├── data/
│   ├── index.json          # 所有報告的索引
│   └── YYYY-MM-DD-*.json   # 每份報告的資料
└── static/
    ├── css/index.css       # 報告頁樣式
    └── js/index.js         # 報告頁程式
```

## 📌 資料格式範例

```jsonc
{
  "date": "2026-10-19",
  "report_type": "morning",          // morning / evening / weekend_morning / weekend_evening
  "generated_at": "2026-10-19T08:45:50",
  "us_macro": [
    { "symbol": "SP500", "name": "S&P 500", "value": 7659.44, "change_pct": -1.09, "date": "2026-10-16" }
    // date 是資料日；美股收盤在台北隔天早上才進晨報
  ],
  "tw_premarket": { "sgx_fut": { "...": "..." }, "rich_fut": { "...": "..." } },
  "observation": { "...": "..." },
  "ai_analysis": { "full_text": "...", "source": "...", "generated_at": "..." }
  // 另有 sentiment、tw_market_internals、etf_0050、asia_market、market_news、data_health 等
}
```

---

<sub>本報告由程式與 AI 自動產生，僅供研究與資訊參考，**不構成任何投資建議**。數據可能延遲或有誤，投資有風險，請自行評估。</sub>
