# Anya 每日投資分析報告 📈

> Anya AI 每日自動生成的台美股投資分析報告 — 宏觀指標、三大法人、板塊資金流向與 AI 深度分析。

🌐 **線上看報告：** https://ss1111119.github.io/anya-investment-reports/

每個交易日**早、晚各產生一份報告**，資料以 JSON 形式存放、由前端純靜態網頁渲染，部署在 GitHub Pages。

---

## ✨ 報告內容

每份報告（`data/YYYY-MM-DD-morning.json` / `-evening.json`）涵蓋：

- **美股宏觀指標** — S&P 500、Nasdaq、費半 (SOX)、道瓊、VIX、台積電 ADR、台灣 ETF (EWT)、黃金、原油等，含漲跌幅
- **台股三大法人** — 買賣超統計與資金動向
- **板塊資金流向** — 各類股 / 板塊的資金輪動
- **AI 深度分析** — 由 AI 彙整當日盤勢、解讀指標並給出觀點

## 🧩 互動儀表板

前端 (`static/js/`) 拆成多個獨立 dashboard 模組：

| 模組 | 內容 |
|------|------|
| `market_dashboard` | 大盤與宏觀指標總覽 |
| `intelligence_dashboard` | AI 分析與市場情報 |
| `news_dashboard` | 當日新聞彙整 |
| `kol_dashboard` | KOL / 社群觀點追蹤 |
| `portfolio` / `stock_control` | 投資組合與個股控管 |
| `paper_trading_dashboard` | 紙上交易（模擬下單）|
| `ops_control_board` / `workbench` | 操作面板與工作台 |

## 🛠️ 技術

- 純靜態前端（HTML + CSS + JavaScript），無後端
- [Chart.js](https://www.chartjs.org/) 圖表視覺化
- [marked](https://marked.js.org/) 渲染 AI 分析的 Markdown
- 資料層：`data/index.json` 為報告索引，逐日 JSON 為內容
- 部署：GitHub Pages

## 📁 專案結構

```
anya-investment-reports/
├── index.html              # 入口頁
├── data/
│   ├── index.json          # 所有報告的索引
│   └── YYYY-MM-DD-*.json    # 每日早 / 晚報告資料
└── static/
    ├── css/                # 樣式
    └── js/                  # 各 dashboard 模組
```

## 📌 資料格式範例

```jsonc
{
  "date": "2026-06-24",
  "report_type": "morning",
  "generated_at": "2026-06-24T08:46:37",
  "us_macro": [
    { "symbol": "SP500", "name": "S&P 500", "value": 7365.46, "change_pct": -1.44, "date": "2026-06-23" }
    // ...更多指標、三大法人、板塊、AI 分析
  ]
}
```

---

<sub>本報告為 AI 自動生成，僅供研究與資訊參考，**不構成任何投資建議**。投資有風險，請自行評估。</sub>
