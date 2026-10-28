// ── Globals ─────────────────────────────────────────────────────────────────
let _charts = {};
let _ttsUtterance = null;
let _ttsPlaying = false;
let _currentData = null;
let _currentTemplateFamily = 'Pre-open';
let _reportIndex = [];
let _currentReportFile = '';
let _currentReportIndex = -1;
let _anchorsObserver = null;
let _backTopBound = false;
const SECTION_COLLAPSE_STORAGE_KEY = 'anya.report.section-collapse.v1';
const DEFAULT_COLLAPSED_SECTIONS = new Set(['sec-news', 'sec-kol', 'sec-social-heatmap']);
let _sectionCollapseState = loadSectionCollapseState();
// Set per render: the report's own date and its data_health, so every number
// can say when it is from and whether it is stale, next to the number itself.
let _reportDate = '';
let _dataHealth = {};
let _usLatestDate = '';

// Type labels
const TYPE_LABELS = {
  morning:'晨報 🌅', evening:'晚報 🌙',
  weekend_morning:'週末晨報 🌄', weekend_evening:'週末晚報 🌃',
  weekly_review:'週報 📋',
};
const REPORTER_EMOJIS = {
  morning:'🌅', evening:'🌙', weekend_morning:'🌄', weekend_evening:'🌃', weekly_review:'📋'
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt  = (n,d=2)  => n==null ? 'N/A' : (+n).toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtK = n => n==null ? 'N/A' : (+n).toLocaleString('zh-TW',{minimumFractionDigits:0,maximumFractionDigits:0});
const fmtPct = n => n==null ? 'N/A' : (n>0?'+':'')+fmt(n)+'%';
const cls  = n => n==null?'flat':n>0?'up':n<0?'dn':'flat';
const arr  = n => n==null?'—':n>0?'▲':n<0?'▼':'—';
const abs  = n => n==null ? null : Math.abs(n);
const fgClass = lbl => {
  if(!lbl) return 'fg-neutral';
  const l = lbl.toLowerCase();
  return l.includes('greed') ? 'fg-greed' : l.includes('fear') ? 'fg-fear' : 'fg-neutral';
};

const escHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const shortDate = s => {
  const ds = String(s || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ds) ? ds.slice(5) : ds;
};

// Data-date tag shown beside a number. Nothing when the data is from the
// report's own date and not stale; a muted date when it is from another day
// (e.g. US close in a Taipei morning report); a yellow flag when stale.
function dateTag(dataDate, { stale = false } = {}) {
  const ds = String(dataDate || '').slice(0, 10);
  if(!ds && !stale) return '';
  const differs = ds && _reportDate && ds !== _reportDate;
  if(!differs && !stale) return '';
  const text = ds ? `${stale ? '⏱ ' : ''}${shortDate(ds)}${stale ? ' 偏舊' : ''}` : '⏱ 偏舊';
  const title = ds ? `資料日期 ${ds}${stale ? '（偏舊）' : ''}` : '資料偏舊';
  return `<span class="data-tag${stale ? ' is-stale' : ''}" title="${escHtml(title)}">${escHtml(text)}</span>`;
}

// Period of a change / return figure: 單日, 夜盤, 近 1 年 ...
const periodTag = text => `<span class="period-tag">${escHtml(text)}</span>`;

const healthStale = key => _dataHealth?.[key]?.state === 'STALE';

// Last date that actually carries a value in a {dates, series[].values} block.
function seriesLastDate(series, dates) {
  const vals = Array.isArray(series?.values) ? series.values : [];
  for(let i = vals.length - 1; i >= 0; i--) {
    if(vals[i] && vals[i].raw != null && vals[i].date) return vals[i].date;
  }
  return Array.isArray(dates) && dates.length ? dates[dates.length - 1] : '';
}

// A US-market series is stale when it ends before the newest US session
// present elsewhere in the same report (us_macro).
const usSeriesStale = ds => Boolean(ds && _usLatestDate && String(ds).slice(0, 10) < _usLatestDate);

// Date of the TAIEX figure in sentiment.tw_index, which carries none itself:
// borrow it from a dated row that shows the same close.
function taiexDate(d) {
  const idx = d.sentiment?.tw_index;
  if(!idx || idx.price == null) return '';
  const t = d.tw_market_internals?.turnover;
  if(t && t.date && t.price != null && Math.abs(Number(t.price) - Number(idx.price)) < 0.01) return t.date;
  const hist = Array.isArray(d.taiex_history) ? d.taiex_history : [];
  const row = hist.slice().reverse().find(r => r && r.close != null && Math.abs(Number(r.close) - Number(idx.price)) < 0.01);
  return row?.date || '';
}

function loadSectionCollapseState() {
  try {
    const raw = localStorage.getItem(SECTION_COLLAPSE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
}

function saveSectionCollapseState() {
  try {
    localStorage.setItem(SECTION_COLLAPSE_STORAGE_KEY, JSON.stringify(_sectionCollapseState));
  } catch (err) {
    /* ignore storage errors */
  }
}

function isSectionCollapsed(id) {
  if(!id) return false;
  const stored = _sectionCollapseState[id];
  if(stored != null) return Boolean(stored);
  return DEFAULT_COLLAPSED_SECTIONS.has(id);
}

function setSectionCollapsed(id, collapsed) {
  if(!id) return;
  _sectionCollapseState = {
    ..._sectionCollapseState,
    [id]: Boolean(collapsed),
  };
  saveSectionCollapseState();
  const card = document.querySelector(`[data-section-card="${id}"]`);
  if(!card) return;
  card.classList.toggle('is-collapsed', Boolean(collapsed));
  const btn = card.querySelector('[data-section-toggle]');
  if(btn) {
    btn.textContent = collapsed ? '展開' : '收合';
    btn.setAttribute('aria-expanded', String(!collapsed));
  }
}

function toggleSectionCollapsed(id) {
  setSectionCollapsed(id, !isSectionCollapsed(id));
}

function setAllCollapsibleSections(collapsed) {
  document.querySelectorAll('.section-card.is-collapsible').forEach(card => {
    const id = card.getAttribute('data-section-card');
    if(id) {
      setSectionCollapsed(id, collapsed);
    }
  });
  document.querySelectorAll('details.sub-fold').forEach(el => { el.open = !collapsed; });
  closeAnchorNav();
}

function expandAllSections() {
  setAllCollapsibleSections(false);
}

function collapseAllSections() {
  setAllCollapsibleSections(true);
}

// The TAIEX banner now lives inside the hero's key numbers, and 圖表重點 /
// AI 深度分析 are folded into the 盤勢解讀 card ('interpretation'), so
// 'taiex', 'chart_orchestration' and 'ai' no longer appear as their own slots.
const WEEKLY_TEMPLATE_SECTION_ORDER = {
  'Pre-open': ['hero', 'observation', 'etf_0050', 'premarket', 'us_macro', 'interpretation', 'market_snapshot', 'tw_internals', 'history', 'sa_consensus', 'social_heatmap', 'news', 'kol', 'history_strip'],
  'Close Summary': ['hero', 'observation', 'etf_0050', 'interpretation', 'institutional', 'tw_internals', 'sector_flow', 'us_sector_history', 'history', 'sa_consensus', 'social_heatmap', 'news', 'kol', 'history_strip'],
  'Midweek Risk': ['hero', 'observation', 'etf_0050', 'interpretation', 'premarket', 'institutional', 'tw_internals', 'market_snapshot', 'sector_flow', 'us_macro', 'us_sector_history', 'history', 'sa_consensus', 'social_heatmap', 'news', 'kol', 'history_strip'],
  'Weekend Macro': ['hero', 'observation', 'etf_0050', 'interpretation', 'us_macro', 'commodity_history', 'yield_oil_history', 'us_sector_history', 'market_snapshot', 'institutional', 'tw_internals', 'sa_consensus', 'social_heatmap', 'news', 'kol', 'history_strip'],
  'Next Week Preview': ['hero', 'observation', 'etf_0050', 'interpretation', 'us_macro', 'commodity_history', 'yield_oil_history', 'us_sector_history', 'institutional', 'tw_internals', 'market_snapshot', 'sa_consensus', 'social_heatmap', 'news', 'kol', 'history_strip'],
};

// Maps an APPROVED_CHART_LIBRARY chart id to the on-page section anchor that renders it.
const CHART_ID_TO_SECTION = {
  us_macro_panel: 'sec-macro',
  futures_adr_panel: 'sec-tw',
  sa_analyst_consensus_panel: 'sec-sa-consensus',
  social_topic_heatmap_panel: 'sec-social-heatmap',
  commodity_risk_panel: 'sec-commodity',
  treasury_oil_panel: 'sec-yield-oil',
  us_sector_rotation_panel: 'sec-us-sector',
  sentiment_panel: 'sec-sentiment',
  taiwan_price_panel: 'sec-history',
  market_breadth_panel: 'sec-sentiment',
  institutional_flow_panel: 'sec-inst',
  sector_rotation_panel: 'sec-sector',
  news_theme_strip: 'sec-news',
};

function parseReportDate(dateValue) {
  if(!dateValue) return null;
  const parsed = new Date(`${String(dateValue).trim()}T00:00:00`);
  if(!Number.isNaN(parsed.getTime())) return parsed;
  const fallback = new Date(dateValue);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function getWeeklyTemplateFamily(d) {
  const reportType = String(d?.report_type || '').toLowerCase();
  const weekday = parseReportDate(d?.date)?.getDay();
  const pythonWeekday = weekday == null ? null : ((weekday + 6) % 7);

  if(reportType === 'weekly_review') {
    return pythonWeekday === 6 ? 'Weekend Macro' : 'Next Week Preview';
  }
  if(reportType === 'weekend_evening') {
    return pythonWeekday === 6 ? 'Next Week Preview' : 'Weekend Macro';
  }
  if(reportType === 'weekend_morning') {
    return (pythonWeekday === 5 || pythonWeekday === 6) ? 'Weekend Macro' : 'Pre-open';
  }
  if(reportType === 'evening') {
    if(pythonWeekday === 4) return 'Next Week Preview';
    if(pythonWeekday === 2 || pythonWeekday === 3) return 'Midweek Risk';
    return 'Close Summary';
  }

  if(pythonWeekday === 6) return 'Weekend Macro';
  if(pythonWeekday === 4) return 'Next Week Preview';
  if(pythonWeekday === 2 || pythonWeekday === 3) return 'Midweek Risk';
  return 'Pre-open';
}

// Reader-facing names for the layout keys above; the keys themselves stay as
// they are because they pick the layout and the CSS class.
const TEMPLATE_FAMILY_LABELS = {
  'Pre-open': '盤前',
  'Close Summary': '收盤總結',
  'Midweek Risk': '週中風險',
  'Weekend Macro': '週末總經',
  'Next Week Preview': '下週展望',
};

function familyBadgeLabel(family) {
  return TEMPLATE_FAMILY_LABELS[family] || String(family || '');
}

function familyClassName(family) {
  return String(family || 'Pre-open').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function buildReportSectionMap(d, family) {
  // The hero shows no direction (the-report-watches-and-does-not-advise).
  const sig   = 'neutral';
  const emoji = '📊';
  const familyClass = familyClassName(family);
  const typeLabel = TYPE_LABELS[d.report_type] || d.report_type || '';
  const actionBadge = d.headline?.action ? `<span class="action-badge action-${sig}">${escHtml(d.headline.action)}</span>` : '';

  // Quick-summary key numbers for the first screen. Each tile names its period
  // and carries its own data date.
  const keyTiles = [];
  const idx = d.sentiment?.tw_index;
  if(idx && idx.price) {
    const changeVal = idx.change != null ? Number(idx.change) : null;
    const changePctVal = idx.change_pct != null ? Number(idx.change_pct) : null;
    const pts = changeVal != null ? `${arr(changeVal)} ${fmt(Math.abs(changeVal))} 點` : '';
    const pct = changePctVal != null ? ` (${fmtPct(changePctVal)})` : '';
    keyTiles.push(`
      <div class="key-tile">
        <div class="key-label">加權指數 TAIEX ${dateTag(taiexDate(d))}</div>
        <div class="key-value">${new Intl.NumberFormat('en-US').format(idx.price)}</div>
        <div class="key-chg ${cls(changeVal)}">${pts}${pct} ${periodTag('單日')}</div>
      </div>`);
  }
  const rich = d.tw_premarket?.rich_fut;
  if(rich && rich.value != null) {
    keyTiles.push(`
      <div class="key-tile">
        <div class="key-label">台指期夜盤 ${dateTag(rich.latest_date, { stale: Boolean(rich.stale) })}</div>
        <div class="key-value ${cls(rich.change_pct)}">${fmtK(rich.value)}</div>
        <div class="key-chg ${cls(rich.change_pct)}">${rich.change_pct != null ? `${arr(rich.change_pct)} ${fmtPct(rich.change_pct)}` : escHtml(rich.change_note || '漲跌幅暫無')} ${periodTag('夜盤')}</div>
      </div>`);
  }
  const inst = d.institutional;
  if(inst && inst.foreign_net != null) {
    keyTiles.push(`
      <div class="key-tile">
        <div class="key-label">外資買賣超 ${dateTag(inst.date, { stale: Boolean(inst.stale) })}</div>
        <div class="key-value ${cls(inst.foreign_net)}">${inst.foreign_net > 0 ? '+' : ''}${fmt(inst.foreign_net, 1)}<span class="key-unit"> 億</span></div>
        <div class="key-chg flat">${periodTag('單日')}</div>
      </div>`);
  } else {
    const sox = (d.us_macro || []).find(r => r.symbol === 'SOX');
    if(sox && sox.value != null) {
      keyTiles.push(`
        <div class="key-tile">
          <div class="key-label">${escHtml(sox.name || '費半')} ${dateTag(sox.date, { stale: healthStale('us_macro') })}</div>
          <div class="key-value">${fmt(sox.value, 0)}</div>
          <div class="key-chg ${cls(sox.change_pct)}">${arr(sox.change_pct)} ${fmtPct(sox.change_pct)} ${periodTag('單日')}</div>
        </div>`);
    }
  }
  const keyNumbers = keyTiles.length ? `<div class="hero-keys">${keyTiles.join('')}</div>` : '';
  const cutoff = d.observation?.as_of || String(d.generated_at || '').replace('T', ' ').slice(0, 16);
  // Teaser is generated text; it sometimes keeps markdown bold markers.
  const teaser = String(d.headline?.teaser || '—').replace(/\*\*/g, '');

    const marketSnapshot = (d.sentiment || d.tw_premarket)
      ? `<div class="two-col">
           ${d.sentiment ? renderSentiment(d.sentiment, d) : ''}
           ${d.tw_premarket ? renderTwHistoryChart(d) : ''}
         </div>`
      : '';

    const premarket = d.tw_premarket ? renderTwPremarket(d.tw_premarket) : '';
    const history = d.taiex_history?.length ? renderHistoryTable(d.taiex_history) : '';
    const commodityHistory = d.commodity_history?.series?.length ? renderCommodityHistory(d.commodity_history) : '';
    const yieldOilHistory = d.yield_oil_history?.series?.length ? renderYieldOilHistory(d.yield_oil_history) : '';
  const usSectorHistory = d.us_sector_history?.series?.length ? renderUsSectorHistory(d.us_sector_history) : '';
  const institutional = d.institutional ? renderInstitutional(d.institutional) : '';
  const sectorFlow = d.sector_flow ? renderSectorFlow(d.sector_flow) : '';
  const twInternals = d.tw_market_internals ? renderTwMarketInternals(d.tw_market_internals) : '';
  const interpretation = (d.market_news || d.sentiment || d.tw_premarket || d.social_pulse || d.us_macro || d.ai_analysis || d.chart_orchestration)
    ? renderMarketInterpretation(d)
    : '';
  const news = d.market_news && (d.market_news.source_groups?.length || d.market_news.news_list?.length || d.market_news.themes?.length)
    ? renderMarketNews(d.market_news)
    : '';
  const kol = d.social_pulse ? renderKol(d.social_pulse) : '';
  const usMacro = d.us_macro?.length ? renderUsMacro(d.us_macro) : '';
  const saConsensus = d.sa_consensus ? renderSeekingAlphaConsensus(d.sa_consensus) : '';
  const socialHeatmap = d.social_topic_heatmap ? renderSocialTopicHeatmap(d.social_topic_heatmap) : '';
  const predictionReview = d.prediction_review?.available !== false ? renderPredictionReview(d.prediction_review) : '';
  const historyStrip = d.history_7d ? renderHistoryStrip(d.history_7d) : '';
  const freshnessNotice = renderDataFreshnessNotice(d.data_health);
  const observation = d.observation ? renderObservation(d.observation) : '';
  const etf0050 = d.etf_0050 ? renderEtf0050(d.etf_0050) : '';

  return {
    hero: `
      <div id="sec-hero" class="section-card hero-card">
        <div class="hero-stripe"></div>
        <div class="hero-top">
          <div class="signal-orb signal-${sig}">${emoji}</div>
          <div class="hero-main">
            <div class="hero-meta">
              <span class="hero-date-big">${escHtml(d.date||'')}</span>
              <span class="type-badge type-${escHtml(d.report_type||'')}">${typeLabel}</span>
              ${actionBadge}
            </div>
            <div class="hero-cutoff">
              ${cutoff ? `資料截止 ${escHtml(cutoff)}` : ''}
              <span class="convention-note">台灣慣例：<span class="up">紅漲</span><span class="dn">綠跌</span></span>
              <span class="family-badge family-${familyClass}">${escHtml(familyBadgeLabel(family))}</span>
            </div>
          </div>
        </div>
        <div id="hero-teaser" class="is-clamped">${escHtml(teaser)}</div>
        <button type="button" class="teaser-more" onclick="toggleTeaser(this)" aria-expanded="false">展開全文</button>
        ${keyNumbers}
        ${freshnessNotice}
      </div>`,
    observation,
    taiex: '',
    etf_0050: etf0050,
    market_snapshot: marketSnapshot,
      premarket,
      history,
      commodity_history: commodityHistory,
      yield_oil_history: yieldOilHistory,
      us_sector_history: usSectorHistory,
      institutional,
      sector_flow: sectorFlow,
    tw_internals: twInternals,
    interpretation,
    chart_orchestration: '',
    news,
    kol,
    prediction_review: predictionReview,
    history_strip: historyStrip,
    ai: '',
    us_macro: usMacro,
    sa_consensus: saConsensus,
    social_heatmap: socialHeatmap,
  };
}

// ── Market status ────────────────────────────────────────────────────────────
function updateMarketStatus() {
  const now = new Date();
  const tw_hour = now.toLocaleString('en-US',{hour:'numeric',hour12:false,timeZone:'Asia/Taipei'});
  const h = parseInt(tw_hour);
  const wd = new Date(now.toLocaleString('en-US',{timeZone:'Asia/Taipei'})).getDay();
  const isWeekday = wd >= 1 && wd <= 5;
  const isOpen = isWeekday && h >= 9 && h < 14;
  const dot = document.getElementById('market-dot');
  const lbl = document.getElementById('market-label');
  if(dot && lbl) {
    dot.className = 'status-dot' + (isOpen ? '' : ' closed');
    lbl.textContent = isOpen ? '台股交易中' : '台股收盤';
  }
}

// ── TTS ──────────────────────────────────────────────────────────────────────
function toggleTTS() {
  const btn = document.getElementById('tts-btn');
  if(_ttsPlaying) {
    speechSynthesis.cancel();
    _ttsPlaying = false;
    btn.textContent = '🔊 朗讀';
    return;
  }
  const el = document.getElementById('ai-full-text');
  if(!el) return;
  const text = el.textContent.replace(/\n+/g,' ').trim().slice(0,2000);
  _ttsUtterance = new SpeechSynthesisUtterance(text);
  _ttsUtterance.lang = 'zh-TW';
  _ttsUtterance.rate = 1.1;
  _ttsUtterance.onend = () => { _ttsPlaying = false; btn.textContent = '🔊 朗讀'; };
  speechSynthesis.speak(_ttsUtterance);
  _ttsPlaying = true;
  btn.textContent = '⏹ 停止';
}

// ── Destroy old charts ───────────────────────────────────────────────────────
function destroyCharts() {
  Object.values(_charts).forEach(c => c && c.destroy && c.destroy());
  _charts = {};
}

// ── Load index.json ──────────────────────────────────────────────────────────
async function loadIndex() {
  try {
    const res = await fetch(`data/index.json?_=${Date.now()}`);
    if(!res.ok) throw new Error('index.json not found');
    const index = (await res.json()).slice().sort((a, b) => {
      const rank = { evening: 3, morning: 2, weekend_evening: 1, weekend_morning: 0, weekly_review: -1 };
      const ad = (a.date || '').localeCompare(b.date || '');
      if (ad !== 0) return -ad;
      return (rank[b.type] ?? -2) - (rank[a.type] ?? -2);
    });
    _reportIndex = index;
    const sel = document.getElementById('date-select');
    sel.innerHTML = '';
    index.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.file;
      opt.textContent = `${e.date} ${TYPE_LABELS[e.type]||e.type}`;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => loadReport(sel.value));
    updateReportNavButtons();
    // The LINE push links to ?date=…&type=…; open that report, not
    // whichever is newest by the time the link is clicked.
    const { entry, notice } = findRequestedReport(index, new URLSearchParams(location.search));
    if(notice) _deepLinkNotice = notice;
    if(entry) loadReport(entry.file, { history: 'replace' });
  } catch(e) {
    document.getElementById('app').innerHTML =
      `<div class="loader" style="color:var(--red)">⚠️ 無法載入報告清單：${e.message}</div>`;
  }
}

// ── Deep links ───────────────────────────────────────────────────────────────
let _deepLinkNotice = null;

// Weekday and weekend editions of the same slot. weekly_review has no
// counterpart and never stands in for another type.
const REPORT_FAMILY = {
  morning: 'morning', weekend_morning: 'morning',
  evening: 'evening', weekend_evening: 'evening',
};

// Resolves ?date=&type= (type optional) to an index entry. `notice` says what
// was shown instead whenever it is not exactly what was asked for, naming the
// report actually loaded -- never a blanket "showing the latest".
function findRequestedReport(index, params) {
  const date = params.get('date');
  const type = params.get('type');
  const nameOf = e => `${e.date} ${TYPE_LABELS[e.type] || e.type}`;
  const asked = `${date} ${type ? (TYPE_LABELS[type] || type) : ''}`.trim();
  if(!date || !index.length) return { entry: index[0], notice: null };

  // index is sorted newest date first, and within a date by edition rank.
  const sameDay = index.filter(e => e.date === date);
  if(sameDay.length) {
    if(!type) return { entry: sameDay[0], notice: null };
    const exact = sameDay.find(e => e.type === type);
    if(exact) return { entry: exact, notice: null };
    const family = REPORT_FAMILY[type];
    const sibling = family && sameDay.find(e => REPORT_FAMILY[e.type] === family);
    const other = type !== 'weekly_review' && sameDay.find(e => e.type !== 'weekly_review');
    const pick = sibling || other;
    if(pick) {
      return { entry: pick,
               notice: `找不到 ${asked} 的報告，改顯示同日的${TYPE_LABELS[pick.type] || pick.type}。` };
    }
  }

  const latest = index[0];
  if(date > latest.date) {
    return { entry: latest, notice: `${date} 尚無報告，以下顯示最新一份（${nameOf(latest)}）。` };
  }
  const earlier = index.filter(e => e.date < date);
  const before = (type === 'weekly_review' && earlier.find(e => e.type === 'weekly_review')) || earlier[0];
  if(before) {
    return { entry: before, notice: `找不到 ${asked} 的報告，改顯示在它之前最近的一份（${nameOf(before)}）。` };
  }
  return { entry: latest, notice: `找不到 ${asked} 的報告，以下顯示最新一份（${nameOf(latest)}）。` };
}

function syncReportUrl(file, mode) {
  if(mode === 'none') return;
  const entry = _reportIndex.find(e => e.file === file);
  if(!entry) return;
  const params = new URLSearchParams(location.search);
  params.set('date', entry.date);
  params.set('type', entry.type);
  const url = `${location.pathname}?${params.toString()}${location.hash}`;
  if(mode === 'replace') history.replaceState({ file }, '', url);
  else history.pushState({ file }, '', url);
}

window.addEventListener('popstate', (event) => {
  if(!_reportIndex.length) return;
  // The file recorded with the history entry is exact; date/type is the
  // fallback for entries that came from a pasted link.
  const recorded = _reportIndex.find(e => e.file === event.state?.file);
  const { entry, notice } = recorded
    ? { entry: recorded, notice: null }
    : findRequestedReport(_reportIndex, new URLSearchParams(location.search));
  _deepLinkNotice = notice;
  if(entry && entry.file !== _currentReportFile) loadReport(entry.file, { history: 'none' });
});

// Only the most recent request may render: a slow response for a report the
// reader already moved past must not overwrite the one they asked for.
let _loadSeq = 0;

// ── Load report JSON ─────────────────────────────────────────────────────────
async function loadReport(file, { history: historyMode = 'push' } = {}) {
  document.getElementById('app').innerHTML = '<div class="loader">載入資料中<span class="spinner"></span></div>';
  destroyCharts();
  const seq = ++_loadSeq;
  try {
    const res = await fetch(`${file}?_=${Date.now()}`);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if(seq !== _loadSeq) return;
    _currentData = data;
    _currentReportFile = file;
    _currentReportIndex = _reportIndex.findIndex(item => item.file === file);
    const sel = document.getElementById('date-select');
    if(sel && sel.value !== file) sel.value = file;
    syncReportUrl(file, historyMode);
    render(_currentData);
    if(_deepLinkNotice) {
      const notice = document.createElement('div');
      notice.className = 'loader';
      notice.style.color = 'var(--red)';
      notice.textContent = `⚠️ ${_deepLinkNotice}`;
      document.getElementById('app').prepend(notice);
      _deepLinkNotice = null;
    }
    updateReportNavButtons();
  } catch(e) {
    if(seq !== _loadSeq) return;
    // The notice belonged to this load; it must not surface on a later one.
    _deepLinkNotice = null;
    document.getElementById('app').innerHTML =
      `<div class="loader" style="color:var(--red)">⚠️ 載入失敗：${e.message}</div>`;
  }
}

function updateReportNavButtons() {
  const prevBtn = document.getElementById('report-prev-btn');
  const latestBtn = document.getElementById('report-latest-btn');
  const nextBtn = document.getElementById('report-next-btn');
  const hasReports = _reportIndex.length > 0;
  if(prevBtn) prevBtn.disabled = !hasReports || _currentReportIndex <= 0;
  if(latestBtn) latestBtn.disabled = !hasReports || _currentReportIndex <= 0;
  if(nextBtn) nextBtn.disabled = !hasReports || _currentReportIndex < 0 || _currentReportIndex >= _reportIndex.length - 1;
}

function navigateReport(direction) {
  if(!_reportIndex.length) return;
  let targetIndex = _currentReportIndex;
  if(direction === 'latest') {
    targetIndex = 0;
  } else if(direction === 'prev') {
    targetIndex = Math.max(0, (_currentReportIndex < 0 ? 0 : _currentReportIndex - 1));
  } else if(direction === 'next') {
    targetIndex = Math.min(_reportIndex.length - 1, (_currentReportIndex < 0 ? 0 : _currentReportIndex + 1));
  }
  const entry = _reportIndex[targetIndex];
  if(entry && entry.file && entry.file !== _currentReportFile) {
    loadReport(entry.file);
  }
}

// ── Render ───────────────────────────────────────────────────────────────────
function render(d) {
  const family = getWeeklyTemplateFamily(d);
  _currentTemplateFamily = family;
  _reportDate = String(d.date || '').slice(0, 10);
  _dataHealth = (d.data_health && typeof d.data_health === 'object') ? d.data_health : {};
  _usLatestDate = (d.us_macro || []).map(r => String(r.date || '').slice(0, 10)).filter(Boolean).sort().pop() || '';
  const sections = buildReportSectionMap(d, family);
  const order = WEEKLY_TEMPLATE_SECTION_ORDER[family] || WEEKLY_TEMPLATE_SECTION_ORDER['Pre-open'];
  const html = order.map(key => sections[key] || '').join('');

  document.getElementById('app').innerHTML = html;
  enhanceSectionShortcuts(order);
  buildAnchorNav();
  const teaserEl = document.getElementById('hero-teaser');
  const moreBtn = document.querySelector('.teaser-more');
  if(teaserEl && moreBtn && teaserEl.scrollHeight <= teaserEl.clientHeight + 2) moreBtn.hidden = true;

  // post-render: charts & markdown
    requestAnimationFrame(() => {
      if(d.us_macro?.length) buildMacroMiniCharts(d.us_macro);
      if(d.sentiment) buildSentimentCharts(d.sentiment);
      if(d.taiex_history?.length) buildTwHistoryChart(d.taiex_history);
      if(d.commodity_history?.series?.length) buildCommodityHistoryChart(d.commodity_history);
      if(d.yield_oil_history?.series?.length) buildYieldOilHistoryChart(d.yield_oil_history);
      if(d.us_sector_history?.series?.length) buildUSSectorHistoryChart(d.us_sector_history);
      if(d.sector_flow) buildSectorChart(d.sector_flow);
      if(d.sa_consensus) buildSaConsensusChart(d.sa_consensus);
      if(d.ai_analysis) renderMarkdown(d.ai_analysis);
      updateAnchors();
      updateReportNavButtons();
    });
  }

function toggleTeaser(btn) {
  const el = document.getElementById('hero-teaser');
  if(!el) return;
  const clamped = el.classList.toggle('is-clamped');
  btn.textContent = clamped ? '展開全文' : '收合';
  btn.setAttribute('aria-expanded', String(!clamped));
}

// ── Section navigation (built from what was actually rendered) ──────────────
const SECTION_NAV_LABELS = {
  'sec-hero': '概覽', 'sec-observation': '觀察重點', 'sec-interpret': '盤勢解讀',
  'sec-tw': '台股盤前', 'sec-macro': '美股指標', 'sec-commodity': '商品走勢',
  'sec-yield-oil': '美債油價', 'sec-us-sector': '美股類股', 'sec-sentiment': '市場情緒',
  'sec-etf0050': '0050', 'sec-inst': '三大法人', 'sec-tw-internals': '內部結構',
  'sec-sector': '板塊流向', 'sec-history': '歷史走勢', 'sec-sa-consensus': '分析師共識',
  'sec-social-heatmap': '社群熱度', 'sec-news': '新聞', 'sec-kol': 'KOL 情緒',
  'sec-prediction-review': '預測驗證', 'sec-history-strip': '歷史對比', 'sec-ai': '深度分析',
};

function buildAnchorNav() {
  const host = document.getElementById('anchor-links');
  if(!host) return;
  const ids = Array.from(document.querySelectorAll('#app [id^="sec-"]'))
    .map(el => el.id)
    .filter((id, i, all) => SECTION_NAV_LABELS[id] && all.indexOf(id) === i);
  host.innerHTML = ids.map(id =>
    `<a href="#${id}" data-target="${id}">${escHtml(SECTION_NAV_LABELS[id])}</a>`).join('');
  host.querySelectorAll('a').forEach(a => a.addEventListener('click', ev => {
    ev.preventDefault();
    closeAnchorNav();
    jumpToSection(a.dataset.target);
  }));
  const count = document.getElementById('anchor-count');
  if(count) count.textContent = `${ids.length} 節`;
}

function toggleAnchorNav() {
  const nav = document.querySelector('.anchor-nav');
  if(!nav) return;
  const open = nav.classList.toggle('is-open');
  document.getElementById('anchor-toggle')?.setAttribute('aria-expanded', String(open));
}

function closeAnchorNav() {
  document.querySelector('.anchor-nav')?.classList.remove('is-open');
  document.getElementById('anchor-toggle')?.setAttribute('aria-expanded', 'false');
}

// ── US Macro ─────────────────────────────────────────────────────────────────
function renderUsMacro(rows) {
  const stale = healthStale('us_macro');
  const chips = rows.map(r => `
    <div class="macro-chip">
      <div class="chip-name">${escHtml(r.name)}</div>
      <div class="chip-value">${fmt(r.value, r.value>1000?0:2)}</div>
      <div class="chip-chg ${cls(r.change_pct)}">
        ${arr(r.change_pct)} ${fmtPct(r.change_pct)} ${periodTag('單日')} ${dateTag(r.date, { stale })}
      </div>
    </div>`).join('');
  return card('sec-macro','🌐 美股宏觀指標', `
    <div class="card-note">漲跌皆為該資料日的單日變動；資料日與報告日不同時，日期標在漲跌旁。</div>
    <div class="macro-grid">${chips}</div>`);
}

function renderSeekingAlphaConsensus(sa) {
  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const items = (sa.top_picks || [])
    .map(item => ({
      ...item,
      symbol: String(item.symbol || '').trim(),
    }))
    .filter(item => item.symbol);
  if(!items.length) return '';

  const summary = String(sa.summary || 'Seeking Alpha 共識資料').trim();
  const benchmark = String(sa.benchmark || 'Magnificent 7').trim();
  const coverage = sa.coverage != null ? Number(sa.coverage) : items.length;
  const asOf = String(sa.as_of || '').trim();
  const focusItems = items.slice(0, 5);
  const overviewChips = [
    { label: '來源', value: String(sa.source || 'seeking_alpha') },
    { label: '覆蓋', value: `${coverage} 檔` },
    { label: '樣本', value: benchmark },
  ];

  const itemCards = focusItems.map(item => {
    const factor = item.factor_grades || {};
    const ratingChips = [
      ['Quant', item.quant_rating],
      ['Author', item.authors_rating],
      ['Wall St.', item.wall_street_rating],
      ['Avg', item.consensus_score],
    ];
    return `
      <div class="news-theme-card">
        <div class="news-theme-name">
          <strong style="color:var(--text);font-size:var(--fs-title);">${escapeHtml(item.symbol)}</strong>
          <span class="news-theme-score">${escapeHtml(item.consensus_score != null ? item.consensus_score.toFixed(2) : '—')}</span>
        </div>
        <div style="font-size:var(--fs-caption);color:var(--muted);line-height:1.55;margin-bottom:8px;">
          ${ratingChips.map(([label, value]) => `<span style="display:inline-block;margin-right:8px;margin-bottom:6px;">${escapeHtml(label)}：${escapeHtml(value != null ? Number(value).toFixed(2) : '—')}</span>`).join('')}
        </div>
        <div style="font-size:var(--fs-caption);color:var(--muted);line-height:1.55;">
          <span style="display:inline-block;margin-right:8px;">V ${escapeHtml(factor.value || '—')}</span>
          <span style="display:inline-block;margin-right:8px;">G ${escapeHtml(factor.growth || '—')}</span>
          <span style="display:inline-block;margin-right:8px;">P ${escapeHtml(factor.profitability || '—')}</span>
          <span style="display:inline-block;margin-right:8px;">M ${escapeHtml(factor.momentum || '—')}</span>
          <span style="display:inline-block;margin-right:8px;">R ${escapeHtml(factor.revisions || '—')}</span>
        </div>
      </div>
    `;
  }).join('');

  return card('sec-sa-consensus', `📌 美股分析師共識圖${asOf ? ` <span style="font-size:var(--fs-micro);color:var(--muted);font-weight:400">(${escapeHtml(asOf)})</span>` : ''}`, `
    <div class="interpret-summary">${escapeHtml(summary)}</div>
    <div class="interpret-meta">
      ${overviewChips.map(chip => `<span class="interpret-chip">${escapeHtml(chip.label)}：${escapeHtml(chip.value)}</span>`).join('')}
    </div>
    <div class="news-theme-grid" style="margin-top:14px;">
      ${itemCards}
    </div>
    <div style="margin-top:14px;height:280px;"><canvas id="sa-consensus-chart"></canvas></div>
    <div style="margin-top:8px;font-size:var(--fs-micro);color:var(--muted);">圖上的評級數值越低，代表 Seeking Alpha 的共識越強。</div>
  `);
}

function renderSocialTopicHeatmap(heatmap) {
  // Attention, not signal. Google search interest (thousands) and PTT push
  // counts (up to ~100) are different units, so each source gets its own list
  // with its own unit; ranking them together once put "周子瑜" first.
  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const topics = Array.isArray(heatmap.topics) ? heatmap.topics : [];
  const bySource = heatmap.by_source && typeof heatmap.by_source === 'object'
    ? heatmap.by_source
    : topics.reduce((acc, t) => { (acc[t.source || 'unknown'] = acc[t.source || 'unknown'] || []).push(t); return acc; }, {});
  const SOURCE_META = {
    ptt_stock: { title: 'PTT 股版討論', unit: '推文' },
    google_trends_finance: { title: '大眾搜尋（Google）', unit: '搜尋熱度' },
  };
  const CATEGORY_LABEL = { market: '市場事件', retail: '散戶情緒', attention: '大眾話題' };
  const asOf = String(heatmap.as_of || '').trim();
  const columns = Object.entries(bySource)
    .filter(([, items]) => Array.isArray(items) && items.length)
    .map(([source, items]) => {
      const meta = SOURCE_META[source] || { title: source, unit: '分數' };
      const rows = items.map(item => {
        const score = item.score != null && !Number.isNaN(Number(item.score))
          ? `${meta.unit} ${Number(item.score).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
          : '';
        const label = CATEGORY_LABEL[item.category] || '';
        return `
          <div class="news-theme-card">
            <div class="news-theme-name">
              <strong style="color:var(--text);font-size:var(--fs-body);">${escapeHtml(item.topic || '')}</strong>
              ${label ? `<span class="news-theme-score">${escapeHtml(label)}</span>` : ''}
            </div>
            ${score ? `<div style="font-size:var(--fs-caption);color:var(--muted);">${escapeHtml(score)}</div>` : ''}
          </div>`;
      }).join('');
      return `
        <div>
          <div class="interpret-title" style="margin-bottom:8px;">${escapeHtml(meta.title)}</div>
          ${rows}
        </div>`;
    }).join('');
  const body = columns ? `
    <div class="interpret-note" style="margin-top:0;">大家在討論什麼——注意力不是交易訊號，兩個來源的分數單位不同、不互相比較。</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:12px;">
      ${columns}
    </div>
  ` : `
    <div class="news-empty-state">
      暫無可顯示的熱門社群討論。
    </div>
  `;
  const peekTopics = topics.slice(0, 3).map(t => t.topic).filter(Boolean);
  return card('sec-social-heatmap', `📡 市場注意力雷達${asOf ? ` <span style="font-size:var(--fs-micro);color:var(--muted);font-weight:400">(${escapeHtml(String(asOf).replace('T', ' ').slice(0, 16))})</span>` : ''}`, body, { collapsible: true, peek: peekTopics.length ? `熱門：${peekTopics.join('、')}` : '' });
}

// ── Sentiment ─────────────────────────────────────────────────────────────────
function renderSentiment(s, d = {}) {
  const t = d.tw_market_internals?.turnover;
  const breadthDate = (t && t.up_count != null && t.up_count === s.tw_market?.gainers) ? t.date : '';
  const cnn    = s.cnn    || {};
  const crypto = s.crypto || {};
  const tw_g   = s.tw_greed || {};
  const tw     = s.tw_market || {};
  const tot    = tw.total || 0;
  const bullPct= tot ? Math.round((tw.gainers||0)/tot*100) : 50;
  return card('sec-sentiment','😨 市場情緒', `
    <div class="fg-note">情緒指標量測市場參與者偏向<span class="fg-greed">貪婪</span>或<span class="fg-fear">恐懼</span>的程度，數值愈高愈貪婪、愈低愈恐懼；顏色代表情緒區間，與漲跌無關。</div>
    <div class="sentiment-grid">
      <div class="fg-card">
        <div class="fg-label">台灣市場情緒</div>
        <div class="fg-value ${fgClass(tw_g.label)}">${tw_g.value??'資料待補'}</div>
        <div class="fg-text ${fgClass(tw_g.label)}">${tw_g.label||'—'}</div>
        <div class="linear-gauge-wrap">
          <div class="linear-gauge-bg"></div>
          <div class="linear-gauge-marker" style="left:${tw_g.value!=null?tw_g.value:50}%"></div>
        </div>
        <div style="margin-top:8px;font-size:var(--fs-caption);color:var(--muted);text-align:center;">台灣籌碼情緒 / 貪婪恐懼</div>
      </div>
      <div class="fg-card">
        <div class="fg-label">CNN 恐懼貪婪</div>
        <div class="fg-value ${fgClass(cnn.label)}">${cnn.value??'資料待補'}</div>
        <div class="fg-text ${fgClass(cnn.label)}">${cnn.label||'—'}</div>
        <div class="linear-gauge-wrap">
          <div class="linear-gauge-bg"></div>
          <div class="linear-gauge-marker" style="left:${cnn.value!=null?cnn.value:50}%"></div>
        </div>
      </div>
      <div class="fg-card">
        <div class="fg-label">加密貨幣情緒</div>
        <div class="fg-value ${fgClass(crypto.label)}">${crypto.value??'資料待補'}</div>
        <div class="fg-text ${fgClass(crypto.label)}">${crypto.label||'—'}</div>
        <div class="linear-gauge-wrap">
          <div class="linear-gauge-bg"></div>
          <div class="linear-gauge-marker" style="left:${crypto.value!=null?crypto.value:50}%"></div>
        </div>
      </div>
      <div class="fg-card" style="justify-content:center">
        <div class="fg-label">台股市場廣度 ${dateTag(breadthDate)}</div>
        <div style="font-size:var(--fs-num-lg); font-weight:800; margin:10px 0; line-height:1;">
          <span class="up">${tw.gainers??'—'}</span>
          <span style="color:var(--muted); font-size:var(--fs-heading); font-weight:400; margin:0 4px;">/</span>
          <span class="dn">${tw.losers??'—'}</span>
        </div>
        <div class="breadth-bar-wrap" style="margin:12px 0 8px;">
          <div class="breadth-bar-bull" style="width:${bullPct}%"></div>
        </div>
        <div class="breadth-nums">
          <span class="up" style="font-weight:700;">漲 ${bullPct}%</span>
          <span class="dn" style="font-weight:700;">跌 ${100-bullPct}%</span>
        </div>
      </div>
    </div>`);
}

// ── TW History area chart ─────────────────────────────────────────────────────
  function renderTwHistoryChart(d) {
    const titleMap = {
      'Pre-open': '📈 盤前指數走勢',
      'Close Summary': '📈 收盤指數走勢',
      'Midweek Risk': '📈 週中風險走勢',
      'Weekend Macro': '📈 昨夜指數走勢',
      'Next Week Preview': '📈 下週觀察走勢',
    };
    const title = titleMap[_currentTemplateFamily || 'Pre-open'] || '📈 指數走勢';
    const hasHistory = Array.isArray(d.taiex_history) && d.taiex_history.length > 0;
    const emptyState = hasHistory ? '' : `<div style="height:180px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:var(--fs-ui);">目前沒有可繪製的歷史資料。</div>`;
    return card('',''+title, `
      <div class="chart-wrap" style="height:240px;">
        ${hasHistory ? '<canvas id="taiex-chart"></canvas>' : emptyState}
      </div>`);
  }

  function renderCommodityHistory(c) {
    const titleMap = {
      'Weekend Macro': '📦 關鍵商品價格走勢',
      'Next Week Preview': '📦 關鍵商品價格走勢',
      'Midweek Risk': '📦 關鍵商品價格走勢',
    };
    const title = titleMap[_currentTemplateFamily || 'Weekend Macro'] || '📦 關鍵商品價格走勢';
    const series = Array.isArray(c.series) ? c.series : [];
    const dates = Array.isArray(c.dates) ? c.dates : [];
    const chips = series.map(s => `
      <div class="macro-chip">
        <div class="chip-name">${escHtml(s.name)}</div>
        <div class="chip-value">${s.latest != null ? fmt(s.latest, 2) : '資料待補'}</div>
        <div class="chip-chg ${cls(s.change_pct)}">${arr(s.change_pct)} ${fmtPct(s.change_pct)} ${periodTag('單日')} ${(() => { const ds = seriesLastDate(s, c.dates); return dateTag(ds, { stale: usSeriesStale(ds) }); })()}</div>
      </div>
    `).join('');
    const lastC = dates.length ? dates[dates.length - 1] : '';
    return card('sec-commodity', title, `
      <div class="card-note">卡片數字為最新資料日的單日漲跌；下方走勢圖為${dates.length ? ` ${shortDate(dates[0])} ~ ${shortDate(lastC)} ` : '區間'}累積變化（起點=100）。</div>
      <div class="macro-grid">${chips}</div>
      <div style="margin-top:14px;height:260px;"><canvas id="commodity-chart"></canvas></div>
    `);
  }

  function renderYieldOilHistory(c) {
    const titleMap = {
      'Weekend Macro': '📈 美債殖利率與油價（歷史關聯）',
      'Next Week Preview': '📈 美債殖利率與油價（歷史關聯）',
      'Midweek Risk': '📈 美債殖利率與油價（歷史關聯）',
    };
    const title = titleMap[_currentTemplateFamily || 'Weekend Macro'] || '📈 美債殖利率與油價（歷史關聯）';
    const series = Array.isArray(c.series) ? c.series : [];
    const dates = Array.isArray(c.dates) ? c.dates : [];
    const dateRange = dates.length ? `資料區間：${dates[0]} ~ ${dates[dates.length - 1]}` : '';
    const chips = series.map(s => `
      <div class="macro-chip">
        <div class="chip-name">${escHtml(s.name)}</div>
        <div class="chip-value">${s.latest != null ? fmt(s.latest, 2) : '資料待補'}</div>
        <div class="chip-chg ${cls(s.change_pct)}">${arr(s.change_pct)} ${fmtPct(s.change_pct)} ${periodTag('單日')} ${(() => { const ds = seriesLastDate(s, c.dates); return dateTag(ds, { stale: usSeriesStale(ds) }); })()}</div>
      </div>
    `).join('');
    return card('sec-yield-oil', title, `
      <div class="card-note">卡片數字為最新資料日的單日變動；走勢圖為區間累積變化（起點=100）。${dateRange ? `${dateRange}。` : ''}</div>
      <div class="macro-grid">${chips}</div>
      <div style="margin-top:14px;height:260px;"><canvas id="yield-oil-chart"></canvas></div>
    `);
  }

  function renderUsSectorHistory(c) {
    const escapeHtml = (value = '') => String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const titleMap = {
      'Weekend Macro': '📊 美股產業類股輪動與避險流向',
      'Next Week Preview': '📊 美股產業類股輪動與避險流向',
      'Midweek Risk': '📊 美股產業類股輪動與避險流向',
      'Close Summary': '📊 美股產業類股輪動與避險流向',
    };
    const title = titleMap[_currentTemplateFamily || 'Weekend Macro'] || '📊 美股產業類股輪動與避險流向';
    const series = Array.isArray(c.series) ? c.series : [];
    const dates = Array.isArray(c.dates) ? c.dates : [];
    const dateRange = dates.length ? `資料區間：${dates[0]} ~ ${dates[dates.length - 1]}` : '';
    const latestRank = series
      .map(s => ({
        name: s.name,
        symbol: s.symbol,
        latestNorm: (s.values || []).slice().reverse().find(v => v?.normalized != null)?.normalized ?? null,
        latestRaw: s.latest,
      }))
      .filter(s => s.latestNorm != null)
      .sort((a, b) => Number(b.latestNorm) - Number(a.latestNorm));
    // Two different rankings live in this card and must not share a label.
    // `normalized` is 100 on the first date of the range, so it ranks the
    // cumulative move since then; the chips show the latest day's change.
    // Labelling the cumulative leader "領漲" next to chips made 2026-10-10 read
    // "領漲：科技" while the 科技 chip showed ▼1.79%, the weakest of the day.
    const leader = latestRank[0];
    const laggard = latestRank[latestRank.length - 1];
    const cumPct = s => Number(s.latestNorm) - 100;
    const defensiveSet = new Set(['必需消費', '公用事業', '醫療保健', '不動產']);
    const offensiveSet = new Set(['科技', '非必需消費', '金融', '工業', '能源', '原物料', '通訊服務']);
    const avgCum = set => {
      const members = latestRank.filter(s => set.has(s.name));
      return members.length ? members.reduce((acc, s) => acc + cumPct(s), 0) / members.length : null;
    };
    const defensiveAvg = avgCum(defensiveSet);
    const offensiveAvg = avgCum(offensiveSet);
    const sinceText = dates.length ? `${dates[0].slice(5)} 以來` : '區間內';
    const biasText = (defensiveAvg != null && offensiveAvg != null)
      ? `${sinceText}資金相對偏向${defensiveAvg >= offensiveAvg ? '防禦' : '進攻'}族群`
        + `（進攻平均 ${fmtPct(offensiveAvg)}、防禦平均 ${fmtPct(defensiveAvg)}）。`
      : '目前仍在觀察輪動方向。';
    const leaderText = leader
      ? `${sinceText}累積｜領先：${leader.name} ${fmtPct(cumPct(leader))}｜落後：${laggard.name} ${fmtPct(cumPct(laggard))}`
      : `${sinceText}累積｜—`;
    const daily = series
      .filter(s => s.change_pct != null && !Number.isNaN(Number(s.change_pct)))
      .sort((a, b) => Number(b.change_pct) - Number(a.change_pct));
    const lastDay = dates.length ? dates[dates.length - 1].slice(5) : '';
    const laggardText = daily.length
      ? `最新交易日${lastDay ? `（${lastDay}）` : ''}｜最強：${daily[0].name} ${fmtPct(daily[0].change_pct)}｜最弱：${daily[daily.length - 1].name} ${fmtPct(daily[daily.length - 1].change_pct)}`
      : '最新交易日｜—';
    const chips = series.map(s => `
      <div class="macro-chip">
        <div class="chip-name">${escHtml(s.name)}</div>
        <div class="chip-value">${s.latest != null ? fmt(s.latest, 2) : '資料待補'}</div>
        <div class="chip-chg ${cls(s.change_pct)}">${arr(s.change_pct)} ${fmtPct(s.change_pct)} ${periodTag('單日')} ${(() => { const ds = seriesLastDate(s, c.dates); return dateTag(ds, { stale: usSeriesStale(ds) }); })()}</div>
      </div>
    `).join('');
    return card('sec-us-sector', title, `
      <div class="card-note">類股卡片為最新交易日${lastDay ? `（${lastDay}）` : ''}的<strong>單日</strong>漲跌；下方「累積」一行與走勢圖是${dates.length ? ` ${shortDate(dates[0])} 以來的` : '區間'}<strong>累積</strong>表現，兩者不可混讀。</div>
      <div class="macro-grid">${chips}</div>
      <div class="interpret-panel" style="margin-top:12px;padding:12px 14px;">
        <div class="interpret-summary">${escapeHtml(biasText)}</div>
        <div class="interpret-note" style="margin-top:6px">${escapeHtml(leaderText)}</div>
        <div class="interpret-note" style="margin-top:4px">${escapeHtml(laggardText)}</div>
      </div>
      <div style="margin-top:14px;height:260px;"><canvas id="us-sector-chart"></canvas></div>
    `);
  }

// ── TW Premarket ─────────────────────────────────────────────────────────────
function renderTwPremarket(p) {
  const regime = p.regime || p.trend_state || '—';
  const regClass = regime.includes('bull')||regime.includes('上漲')?'bullish':
                   regime.includes('bear')||regime.includes('下跌')?'bearish':'neutral';
  const maint = p.maintenance_ratio;
  const maintClass = maint!=null ? (maint<150?'st-risk':maint<160?'flat':'st-safe') : 'flat';
  return card('sec-tw','🇹🇼 台股盤前', `
    <div class="premarket-grid">
      <div class="pm-chip">
        <div class="pm-label">富台指期 ${dateTag(p.sgx_fut?.latest_date, { stale: Boolean(p.sgx_fut?.stale) })}</div>
        <div class="pm-value ${cls(p.sgx_fut?.change_pct)}">${p.sgx_fut?.value!=null?fmtK(p.sgx_fut.value):'資料待補'}</div>
        <div class="chip-chg ${cls(p.sgx_fut?.change_pct)}">${p.sgx_fut?.change_pct != null ? `${arr(p.sgx_fut.change_pct)} ${fmtPct(p.sgx_fut.change_pct)} ${periodTag('結算')}` : `<span class="flat">${escHtml(p.sgx_fut?.change_note || '漲跌幅暫無')}</span>`}</div>
      </div>
      <div class="pm-chip">
        <div class="pm-label">台指期夜盤 ${dateTag(p.rich_fut?.latest_date, { stale: Boolean(p.rich_fut?.stale) })}</div>
        <div class="pm-value ${cls(p.rich_fut?.change_pct)}">${p.rich_fut?.value!=null?fmtK(p.rich_fut.value):'資料待補'}</div>
        <div class="chip-chg ${cls(p.rich_fut?.change_pct)}">${p.rich_fut?.change_pct != null ? `${arr(p.rich_fut.change_pct)} ${fmtPct(p.rich_fut.change_pct)} ${periodTag('夜盤')}` : `<span class="flat">${escHtml(p.rich_fut?.change_note || '漲跌幅暫無')}</span>`}</div>
      </div>
      <div class="pm-chip">
        <div class="pm-label">市場趨勢</div>
        <div class="pm-value" style="font-size:var(--fs-body);margin-top:4px">
          <span class="regime-pill rp-${regClass}">${regime}</span>
        </div>
      </div>
      <div class="pm-chip">
        <div class="pm-label">PC Ratio ${dateTag(p.pc_ratio_date)}</div>
        <div class="pm-value">${p.pc_ratio!=null?fmt(p.pc_ratio):'資料待補'}</div>
      </div>
      <div class="pm-chip">
        <div class="pm-label">融資維持率 ${dateTag(p.margin_date)}</div>
        <div class="pm-value ${maintClass}">${maint!=null?fmt(maint)+'%':'資料待補'}</div>
      </div>
      ${p.vol_state ? `<div class="pm-chip"><div class="pm-label">波動狀態</div><div class="pm-value" style="font-size:var(--fs-ui);margin-top:4px">${p.vol_state}</div></div>` : ''}
    </div>`);
}

// ── TAIEX History Table ───────────────────────────────────────────────────────
function renderHistoryTable(rows) {
  const header = `<tr><th>日期</th><th>收盤點數</th><th>單日漲跌</th><th>漲跌幅</th><th>外資(億)</th><th>投信(億)</th><th>自營(億)</th></tr>`;
  const body = rows.map(r => `
    <tr>
      <td>${r.date||'—'}</td>
      <td>${fmtK(r.close)}</td>
      <td class="${cls(r.change)}">${r.change!=null?(r.change>0?'+':'')+fmt(r.change,0):'—'}</td>
      <td class="${cls(r.change_pct)}">${fmtPct(r.change_pct)}</td>
      <td class="${cls(r.foreign_net)}">${r.foreign_net!=null?(r.foreign_net>0?'+':'')+fmt(r.foreign_net):'—'}</td>
      <td class="${cls(r.trust_net)}">${r.trust_net!=null?(r.trust_net>0?'+':'')+fmt(r.trust_net):'—'}</td>
      <td class="${cls(r.dealer_net)}">${r.dealer_net!=null?(r.dealer_net>0?'+':'')+fmt(r.dealer_net):'—'}</td>
    </tr>`).join('');
  return card('sec-history','📅 近期歷史走勢', `<table><thead>${header}</thead><tbody>${body}</tbody></table>`);
}

// ── 0050 status: describes, never advises ────────────────────────────────────
// Timing signals measured no edge (live AUC 0.4951), so this block states
// where 0050 stands and nothing about what to do. No historical percentiles:
// they read as entry signals.
function renderEtf0050(e) {
  const lag = e.lag_sessions || 0;
  const lagBadge = lag >= 1
    ? ` <span style="font-size:var(--fs-micro);color:var(--yellow);font-weight:700;border:1px solid rgba(240,195,74,.25);background:rgba(240,195,74,.08);padding:2px 8px;border-radius:999px;">資料延遲 ${lag} 個交易日</span>`
    : '';
  const change = (lag < 3 && e.change_pct != null)
    ? `<span class="${cls(e.change_pct)}" style="margin-left:8px;font-size:var(--fs-lead)">${fmtPct(e.change_pct)}</span> ${periodTag('單日')}`
    : '';
  const ret = k => e.returns && e.returns[k] != null ? fmtPct(e.returns[k]) : '—';
  const muted = 'font-size:var(--fs-caption);color:var(--muted)';
  const body = `
    <div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-end">
      <div>
        <div style="${muted}">成交價（資料截至 ${escHtml(e.price_date || '—')}）${lag >= 1 ? ' ' + dateTag(e.price_date, { stale: true }) : ''}</div>
        <div style="font-size:var(--fs-num);font-weight:700">${e.close != null ? fmt(e.close) : '—'}${change}</div>
      </div>
      <div>
        <div style="${muted}">距近 1 年高點（還原價）${periodTag('1Y')}</div>
        <div style="font-size:var(--fs-heading);font-weight:600">${e.drawdown_1y_pct != null ? fmtPct(e.drawdown_1y_pct) : '—'}</div>
        <div style="${muted}">高點 ${e.high_1y_date || '—'}</div>
      </div>
    </div>
    <table style="margin-top:12px">
      <thead><tr><th>累積含息報酬（還原價，非年化）</th><th>近 1 年 (1Y)</th><th>近 3 年 (3Y)</th><th>近 5 年 (5Y)</th></tr></thead>
      <tbody><tr><td style="${muted}">截至 ${escHtml(e.asof || '—')}</td><td>${ret('1y')}</td><td>${ret('3y')}</td><td>${ret('5y')}</td></tr></tbody>
    </table>
    <div style="margin-top:8px;${muted}">只描述現況，不構成投資建議；過去報酬不代表未來。</div>`;
  return card('sec-etf0050', `📌 0050 現況${lagBadge}`, body);
}

// ── Institutional ─────────────────────────────────────────────────────────────
function renderInstitutional(inst) {
  const items=[{n:'外資',v:inst.foreign_net},{n:'投信',v:inst.trust_net},{n:'自營商',v:inst.dealer_net}];
  const staleBadge = inst.stale ? `<span style="font-size:var(--fs-micro);color:var(--yellow);font-weight:700;border:1px solid rgba(240,195,74,.25);background:rgba(240,195,74,.08);padding:2px 8px;border-radius:999px;">資料偏舊${inst.age_days!=null?` ${inst.age_days} 天`:''}</span>` : '';
  const sourceBadge = inst.source ? `<span style="font-size:var(--fs-micro);color:var(--muted);font-weight:400;margin-left:6px;">來源：${inst.source}</span>` : '';
  return card('sec-inst',`🏛️ 三大法人 ${dateTag(inst.date)} ${sourceBadge} ${staleBadge}`, `
    <div class="inst-row">
      ${items.map(i=>`
        <div class="inst-card">
          <div class="inst-name">${i.n}</div>
          <div class="inst-value ${cls(i.v)}">${i.v==null?'資料待補':(i.v>0?'+':'')+fmt(i.v)}</div>
          <div class="inst-unit">億元 · 單日</div>
        </div>`).join('')}
    </div>
    ${inst.note ? `<div style="margin-top:6px;font-size:var(--fs-caption);color:var(--muted);">${inst.note}</div>` : ''}`);
}

// ── TW Market Internals (turnover / OTC index / foreign futures OI) ───────────
function renderTwMarketInternals(m) {
  const money = v => v==null ? '資料暫無'
    : (Math.abs(v) >= 1e12 ? (v/1e12).toFixed(2)+' 兆'
      : (v/1e8).toFixed(0)+' 億');
  const t = m.turnover, o = m.otc_index, f = m.foreign_futures_oi;
  // market_stats_tpex.trade_value is in thousands of NT$ (TPEx st41), unlike TWSE's
  // NT$; it showed 「量 2 億」 for NT$2,120 億 until 2026-10-20.

  const turnoverHtml = t ? `
    <div class="inst-card">
      <div class="inst-name">成交值 ${dateTag(t.date)}</div>
      <div class="inst-value">${money(t.trade_value)}</div>
      <div class="inst-unit">量 ${t.trade_volume!=null?(t.trade_volume/1e8).toFixed(1)+' 億股':'—'}</div>
    </div>
    <div class="inst-card">
      <div class="inst-name">漲跌停 ${dateTag(t.date)}</div>
      <div class="inst-value"><span class="up">▲${t.limit_up_count??'—'}</span> / <span class="dn">▼${t.limit_down_count??'—'}</span></div>
      <div class="inst-unit">漲 ${t.up_count??'—'} / 跌 ${t.down_count??'—'}</div>
    </div>` : `<div class="inst-card"><div class="inst-name">成交/廣度</div><div class="inst-value">資料暫無</div></div>`;

  const otcHtml = o ? `
    <div class="inst-card">
      <div class="inst-name">櫃買指數 ${dateTag(o.date)}</div>
      <div class="inst-value ${cls(o.change)}">${fmt(o.price)}</div>
      <div class="inst-unit">單日 ${o.change!=null?(o.change>0?'+':'')+fmt(o.change):'—'} 點 · 量 ${money(o.trade_value == null ? null : o.trade_value * 1000)}</div>
    </div>` : `<div class="inst-card"><div class="inst-name">櫃買指數</div><div class="inst-value">資料暫無</div></div>`;

  const futHtml = f ? `
    <div class="inst-card">
      <div class="inst-name">外資期貨淨未平倉 ${dateTag(f.date)}</div>
      <div class="inst-value ${cls(f.net_oi_vol)}">${f.net_oi_vol!=null?(f.net_oi_vol>0?'+':'')+fmtK(f.net_oi_vol):'—'}</div>
      <div class="inst-unit">口 · ${f.contract||'TX'}</div>
    </div>` : `<div class="inst-card"><div class="inst-name">外資期貨淨未平倉</div><div class="inst-value">資料暫無</div></div>`;

  const v = m.valuation;
  const valHtml = v ? `
    <div class="inst-card">
      <div class="inst-name">大盤估值 ${dateTag(v.date, { stale: Boolean(v.stale) })}</div>
      <div class="inst-value">PER ${fmt(v.market_per)} · PBR ${fmt(v.market_pbr)}</div>
      <div class="inst-unit">殖利率 ${fmt(v.market_yield)}%</div>
    </div>` : `<div class="inst-card"><div class="inst-name">大盤估值</div><div class="inst-value">資料暫無</div></div>`;

  return card('sec-tw-internals',
    `📊 台股內部結構`,
    `<div class="inst-row">${turnoverHtml}${otcHtml}${futHtml}${valHtml}</div>`);
}

// ── Sector Flow ───────────────────────────────────────────────────────────────
function renderSectorFlow(sf) {
  const maxS = Math.max(...(sf.top5_strong||[]).map(s=>abs(s.avg_change)||0),1);
  const maxW = Math.max(...(sf.top5_weak||[]).map(s=>abs(s.avg_change)||0),1);
  const strList = (sf.top5_strong||[]).map(s=>`
    <div class="sector-item">
      <div class="sector-name">${s.sector}</div>
      <div class="bar-wrap"><div class="bar bar-str" style="width:${Math.min(100,abs(s.avg_change)/maxS*100)}%"></div></div>
      <div class="sector-pct up">+${fmt(s.avg_change)}%</div>
    </div>`).join('');
  const wkList = (sf.top5_weak||[]).map(s=>`
    <div class="sector-item">
      <div class="sector-name">${s.sector}</div>
      <div class="bar-wrap"><div class="bar bar-wk" style="width:${Math.min(100,abs(s.avg_change)/maxW*100)}%"></div></div>
      <div class="sector-pct dn">${fmt(s.avg_change)}%</div>
    </div>`).join('');
  return card('sec-sector', `📊 板塊資金流向 ${dateTag(sf.date)}`, `
    <div class="card-note">板塊漲跌為${sf.date ? ` ${escHtml(shortDate(sf.date))} ` : ''}<strong>單日</strong>平均漲跌。</div>
    <div class="sector-cols">
      <div>
        <div class="sector-col-title" style="color:var(--market-rise)">▲ 強勢板塊 Top 5</div>
        ${strList||'<span style="color:var(--muted)">無資料</span>'}
      </div>
      <div>
        <div class="sector-col-title" style="color:var(--market-fall)">▼ 弱勢板塊 Top 5</div>
        ${wkList||'<span style="color:var(--muted)">無資料</span>'}
      </div>
    </div>
    <div style="margin-top:18px"><canvas id="sector-chart" height="160"></canvas></div>`);
}

// ── Daily Market Interpretation ───────────────────────────────────────────────
function renderMarketInterpretation(d) {
  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const fmtSigned = (value, digits = 1) => {
    if (value == null || Number.isNaN(value)) return '—';
    const num = Number(value);
    return `${num > 0 ? '+' : ''}${num.toFixed(digits)}%`;
  };
  const news = d.market_news || {};
  const sentiment = d.sentiment || {};
  const tw = d.tw_premarket || {};
  const social = d.social_pulse || {};
  const macroRows = d.us_macro || [];
  const macroMap = Object.fromEntries(macroRows.map(r => [r.symbol, r]));
  const themes = news.themes || [];
  const highlights = news.highlights || [];
  const summaries = news.source_summary || [];
  const bullPct = social.bullish_pct != null ? Number(social.bullish_pct) : null;
  const bearPct = social.bearish_pct != null ? Number(social.bearish_pct) : null;
  const isWeekendMorning = String(d.report_type || '').toLowerCase() === 'weekend_morning';

  const evidence = [];
  if (summaries.length) evidence.push('新聞已整合多來源');
  if (highlights.length) evidence.push('題材焦點明確');
  if (sentiment.tw_index?.change != null) evidence.push('台股指數有即時變動');
  if (tw.regime || tw.trend_state) evidence.push('盤前趨勢已確認');
  if (bullPct != null || bearPct != null) evidence.push('KOL 觀點可比對');
  if (macroRows.length) evidence.push('國際市場可交叉驗證');

  // 圖表重點 and AI 深度分析 used to be separate cards restating the same
  // read of the day; they are now folds inside this one card.
  const folds = renderInterpretFolds(d);
  const aiLead = renderAILead(d.ai_analysis);
  if (!evidence.length) {
    return card('sec-interpret', '🧭 盤勢解讀', `
      <div class="interpret-panel">
        <div class="interpret-summary">目前可用資料不足，暫時無法生成今日盤勢解讀。</div>${aiLead}
      </div>${folds}`);
  }

  // No direction call and no fixed advice sentences
  // (the-report-watches-and-does-not-advise): the panel states the rule
  // result and the factors behind it. The old 「訊號強度」 was a count of theme
  // names matching words like AI or 半導體, not a measured strength.
  const obs = d.observation || {};
  const stateText = obs.state || d.headline?.action || '資料不足';
  const summary = isWeekendMorning
    ? `週末版：依固定門檻規則，目前狀態為「${stateText}」，以下是最近一個交易日與國際盤的數字。`
    : `依固定門檻規則，目前狀態為「${stateText}」。`;
  const crossed = [
    ...(obs.bull || []).map(item => `偏多因素：${item}`),
    ...(obs.bear || []).map(item => `偏空因素：${item}`),
  ];
  const notes = crossed.length
    ? crossed
    : [obs.nearest ? `最接近門檻：${obs.nearest}` : ((obs.confirm || [])[0] || '')];
  const absorbedNotes = (obs.absorbed || []).map(item => `不計入：${item}`);
  const noteHtml = [...notes, ...absorbedNotes].filter(Boolean)
    .map(text => `<div class="interpret-note">${escapeHtml(text)}</div>`).join('');

  return card('sec-interpret', isWeekendMorning ? '🧭 週末盤勢解讀' : '🧭 今日盤勢解讀', `
    <div class="interpret-panel">
      <div class="interpret-summary">${escapeHtml(summary)}</div>${aiLead}
      ${noteHtml}
    </div>${folds}`);
}

// The AI analysis carries a conclusion section (【收盤結論】, 「今日結論：」,
// ### **今日結論**, 【下一交易日觀察】 …). That section stays on screen; the whole
// analysis is still in the AI 深度分析 fold below. Without a conclusion-like
// heading, the first section is shown under its own heading.
const AI_LEAD_TITLE = /結論|展望|判斷|觀察/;

function aiSections(text) {
  const heading = line => {
    const t = line.trim().replace(/^#{1,6}\s*/, '').replace(/^\*\*(.+?)\*\*/, '$1');
    const m = t.match(/^【([^】]{1,20})】\s*(.*)$/)
      || t.match(/^([\u4e00-\u9fffA-Za-z]{2,10})[：:]\s*(.*)$/)
      || (/^#{1,6}\s/.test(line.trim()) ? t.match(/^([^\s：:]{2,20})\s*$/) : null);
    return m ? { title: m[1], rest: (m[2] || '').trim() } : null;
  };
  const sections = [];
  let current = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^[-*_]{3,}$/.test(line) || /^(日期|報表類型)\s*[:：]/.test(line)) continue;
    const h = heading(line);
    if (h) {
      current = { title: h.title, lines: h.rest ? [h.rest] : [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      sections.push(current = { title: '', lines: [line] });
    }
  }
  return sections
    .map(s => ({ title: s.title, body: s.lines.join(' ').trim() }))
    .filter(s => s.body && !/關鍵數據/.test(s.title));
}

function aiLeadSection(text) {
  const sections = aiSections(text);
  const titled = sections.filter(s => s.title);
  return titled.find(s => AI_LEAD_TITLE.test(s.title)) || titled[0] || null;
}

// Who wrote the analysis (the-page-says-who-wrote-it). When the model's text
// fails the fact checks the backend publishes a fixed template instead; in
// October 2026, 10 of 26 reports did. `ai.source` says which. Payloads from
// before the field existed are labelled neutrally: a tenth of them are the
// template, so claiming AI would be wrong and claiming template would too.
const AI_MODEL_SOURCES = ['model', 'model_retry', 'model_unverified', 'cached_summary', 'post_text'];

function aiAuthorLabel(ai) {
  const source = ai && ai.source;
  if (source === 'template') {
    return { lead: '系統依資料整理', fold: '系統依資料整理', icon: '📋',
             note: '由系統依資料與固定句整理，非 AI 撰寫；與下方「判讀」（資料門檻規則）分開產生。' };
  }
  if (AI_MODEL_SOURCES.includes(source)) {
    return { lead: 'AI 模型觀點', fold: 'AI 深度分析', icon: '🤖',
             note: '由 AI 依當日資料撰寫，與下方「判讀」（資料門檻規則）分開產生，方向可能不同。' };
  }
  return { lead: '分析摘要', fold: '分析摘要', icon: '📝',
           note: '與下方「判讀」（資料門檻規則）分開產生，方向可能不同。' };
}

function renderAILead(ai) {
  const lead = ai ? aiLeadSection(ai.full_text) : null;
  if (!lead) return '';
  const who = aiAuthorLabel(ai);
  const ts = escHtml(String(ai.generated_at || '').replace('T', ' ').slice(11, 16));
  return `
      <div class="interpret-ai-lead">
        <div class="interpret-ai-lead-title">${who.icon} ${escHtml(lead.title)} <span class="sub-fold-meta">${who.lead}${ts ? ` · ${ts}` : ''}</span></div>
        <div class="interpret-ai-lead-body">${escHtml(lead.body)}</div>
        <div class="interpret-ai-lead-note">${who.note}</div>
      </div>`;
}

function renderInterpretFolds(d) {
  let html = '';
  const charts = d.chart_orchestration ? renderChartOrchestration(d.chart_orchestration) : '';
  if (charts) html += charts;
  if (d.ai_analysis) html += renderAI(d.ai_analysis);
  return html;
}

// ── Gemini chart orchestration ───────────────────────────────────────────────
function renderChartOrchestration(o) {
  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const selected = Array.isArray(o.selected_charts) ? o.selected_charts : [];
  // A fallback orchestration carries only a maintainer message ("圖表編排目前
  // 不可用…") -- nothing for a reader -- so the card is left out entirely.
  if (!selected.length) return '';
  const summary = String(o.overall_summary || '');
  const chartCards = selected.map(chart => {
    const title = chart.title || chart.id || '未命名圖表';
    const desc = chart.description || '';
    const takeaway = chart.takeaway || desc || '';
    const action = chart.action || '';
    const sectionId = CHART_ID_TO_SECTION[chart.id];
    const clickAttrs = sectionId
      ? ` role="link" tabindex="0" style="cursor:pointer;" onclick="jumpToSection('${sectionId}')" onkeydown="if(event.key==='Enter'){jumpToSection('${sectionId}')}"`
      : '';
    const jumpHint = sectionId
      ? `<span style="font-size:var(--fs-caption);color:var(--accent);font-weight:600;">看數據 →</span>`
      : '';
    return `
      <div class="news-theme-card"${clickAttrs}>
        <div class="news-theme-name">
          <strong style="color:var(--text);font-size:var(--fs-title);">${escapeHtml(title)}</strong>
        </div>
        <div style="font-size:var(--fs-body);color:var(--text);line-height:1.55;margin-bottom:8px;">${escapeHtml(takeaway)}</div>
        ${action ? `<div class="interpret-note" style="margin-top:0;">${escapeHtml(action)}</div>` : ''}
        ${jumpHint}
      </div>
    `;
  }).join('');
  let html = '<div class="interpret-panel">';
  html += `
    ${summary ? `<div class="interpret-summary">${escapeHtml(summary)}</div>` : ''}
  `;

  if(chartCards) {
    html += `
      <div class="news-theme-grid">
        ${chartCards}
      </div>
    `;
  }

  // News themes are shown once, in the multi-source news section; listing
  // them again here was the third copy on the page.

  // Chart-gap suggestions ("you can build these charts next") and the
  // family / budget / source chips are for whoever maintains the generator,
  // not for readers of a public report; they stay in the payload only.

  html += '</div>';
  return `<details class="sub-fold" id="sec-chart-orchestration">
    <summary>📊 圖表重點 <span class="sub-fold-meta">${selected.length} 張 · AI 挑選</span></summary>
    <div class="sub-fold-body">${html}</div>
  </details>`;
}

// ── Next-session observation ─────────────────────────────────────────────────
// Rule-based: the state, factors and conditions come from market numbers in the
// payload (ReportGenerator._observe), not from generated text. It is framed as
// what to watch, not what to do -- the system has no demonstrated edge.
function renderObservation(o) {
  if (!o || !o.state) return '';
  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
  let sessionText = '';
  if (o.next_session) {
    const weekday = new Date(`${o.next_session}T12:00:00Z`).getUTCDay();
    sessionText = `（${o.next_session.slice(5)} 週${WEEKDAY[weekday]}）`;
  }
  const list = (label, items) => (items && items.length)
    ? `<div class="interpret-note" style="margin-top:6px"><strong>${escapeHtml(label)}</strong>${items.map(escapeHtml).join('；')}</div>`
    : '';
  const body = `
    <div style="font-size:var(--fs-caption);color:var(--muted);margin-bottom:8px;">
      ${o.as_of ? `資料截止 ${escapeHtml(o.as_of)}｜` : ''}${escapeHtml(o.disclaimer || '依目前資料整理的情境，不構成投資建議')}
    </div>
    <div class="interpret-summary">門檻規則：<span style="font-weight:700">${escapeHtml(o.state)}</span></div>
    ${list('偏空因素：', o.bear)}
    ${list('偏多因素：', o.bull)}
    ${list('未達門檻：', o.below)}
    ${list('已反映於台股、不計入：', o.absorbed)}
    ${list(o.state === '條件達標' ? '若延續，會看到：' : '觀察：', o.confirm)}
    ${list('若不成立，會看到：', o.invalid)}
    ${list('⏱ 資料偏舊、未納入判斷：', o.stale)}
  `;
  return card('sec-observation', `🔭 交易日觀察重點${escapeHtml(sessionText)}`, body);
}

// ── Data freshness ───────────────────────────────────────────────────────────
// The generator records every section's freshness in data_health, but nothing
// showed it: a weekend report presented Thursday's market internals the same
// way as today's. Only sections that are not current are listed.
const DATA_HEALTH_LABELS = {
  us_macro: '美股宏觀', asia_market: '亞洲市場', sentiment: '市場情緒',
  market_news: '新聞', ai_analysis: '深度分析', tw_premarket: '台股盤前',
  tw_market_internals: '台股內部結構', institutional: '三大法人',
  sector_flow: '類股排行', social_pulse: 'KOL 情緒',
};

// A section can be missing for different reasons, and "暫無資料" read as
// "nothing recorded" even when generation failed: the 2026-10-16 evening
// prediction review was a model error, shown as "暫無資料". The generator
// already records why; say it.
const DATA_HEALTH_MISSING_REASONS = {
  gemini_error: '產生失敗',
  market_data_missing: '無當日收盤可比對',
};

function renderDataFreshnessNotice(health) {
  if (!health || typeof health !== 'object') return '';
  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const stale = [];
  const missing = [];
  const explained = [];
  Object.entries(health).forEach(([key, h]) => {
    if (!h || typeof h !== 'object' || h.state === 'OK') return;
    // Not shown on the page, so not reported missing either
    // (the-page-shows-no-grade-of-another-report).
    if (key === 'prediction_review') return;
    const label = DATA_HEALTH_LABELS[key] || key;
    if (h.state === 'MISSING' || !h.updated_at) {
      const why = DATA_HEALTH_MISSING_REASONS[h.reason];
      if (why) explained.push(`${label}${why}`);
      else missing.push(label);
    }
    else stale.push(`${label}截至 ${String(h.updated_at).slice(5, 10)}`);
  });
  if (!stale.length && !missing.length && !explained.length) return '';
  const parts = [];
  if (stale.length) parts.push(stale.join('、'));
  if (missing.length) parts.push(`${missing.join('、')}暫無資料`);
  if (explained.length) parts.push(explained.join('、'));
  return `<div class="interpret-note" style="margin-top:10px;font-size:var(--fs-caption);">⏱ 資料時間：${escapeHtml(parts.join('；'))}</div>`;
}

// ── KOL ──────────────────────────────────────────────────────────────────────
function renderKol(sp) {
  const bull = Number(sp.bullish_pct || 0);
  const bear = Number(sp.bearish_pct != null ? sp.bearish_pct : 100 - bull);
  const neutral = Math.max(0, 100 - bull - bear);
  const themes = (sp.top_themes || [])
    .map(t => ({ theme: String(t.theme || '').trim(), score: t.score }))
    .filter(t => t.theme)
    .filter((t, idx, arr) => idx === arr.findIndex(x => x.theme === t.theme));
  const keyTopics = themes.slice(0, 3).map(t => t.theme);
  const topicSummary = keyTopics.length
    ? `KOL 重點聚焦在 ${keyTopics.join('、')}。`
    : '目前可用 KOL 主題不足，暫時無法整理重點。';
  const narrative = sp.retail_narrative ? sp.retail_narrative.replace(/\n/g, '<br>') : '';
  return card('sec-kol','📰 KOL 市場情緒', `
    <div class="interpret-panel">
      <div class="interpret-summary">${topicSummary}</div>
      ${themes.length ? `
        <div class="theme-row">
          ${themes.slice(0, 5).map(t=>`
            <div class="theme-pill">${t.theme}<span class="theme-score">${t.score}</span></div>`).join('')}
        </div>
      ` : ''}
      ${narrative ? `
        <div class="observation-box">
          <div class="obs-title">KOL 觀點與觀察重點</div>
          <div class="obs-content">${narrative}</div>
        </div>
      ` : ''}
      <div class="kol-row">
        <span class="up" style="font-weight:600">${bull}% 多</span>
        <div class="kol-bar-bg">
          <div class="kol-bar-bull" style="width:${bull}%"></div>
          <div class="kol-bar-neutral" style="width:${neutral}%"></div>
          <div class="kol-bar-bear" style="width:${bear}%"></div>
        </div>
        <span class="dn" style="font-weight:600">${bear}% 空</span>
        <span style="color:var(--muted);font-size:var(--fs-caption)">${neutral}% 中性 / ${sp.total_kols||0} 位 KOL 統計${(sp.total_kols||0) < 10 ? '（樣本少，僅供參考）' : ''}</span>
      </div>
    </div>`, { collapsible: true, peek: `${sp.total_kols||0} 位 KOL：多 ${bull}%／空 ${bear}%${keyTopics.length ? `；${keyTopics[0]}` : ''}` });
}

// ── History strip (7-day signal / recurring topics) ─────────────────────────
function renderHistoryStrip(h) {
  if (!h || !Array.isArray(h.signals)) return '';
  if (!h.signals.some(s => s && s.signal != null)) return '';

  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Whether a threshold was crossed, not which side
  // (the-report-watches-and-does-not-advise).
  const signalLabel = (sig) => (sig === 'bullish' || sig === 'bearish') ? '達'
    : sig === 'neutral' ? '未' : '—';
  const signalClass = (sig) => (sig === 'bullish' || sig === 'bearish' || sig === 'neutral')
    ? 'hs-pill-neutral' : 'hs-pill-empty';

  // Signals before 2026-10-11 were partly driven by keywords in the generated
  // text; from then on they come from market numbers. Mark where that changes
  // so the two are not read as one comparable series.
  const RULE_BOUNDARY_NOTE = '10-11 起改以市場數字判斷';
  let sawLegacy = false;
  let boundaryShown = false;
  const signalCells = h.signals.map(s => {
    const dateShort = s.date ? s.date.slice(5) : '—';
    let divider = '';
    if (s.rule_version === 'legacy') sawLegacy = true;
    if (s.rule_version && s.rule_version !== 'legacy' && sawLegacy && !boundaryShown) {
      boundaryShown = true;
      divider = `<div title="${escapeHtml(RULE_BOUNDARY_NOTE)}" style="align-self:stretch;border-left:2px dashed var(--accent);margin:0 2px;"></div>`;
    }
    const source = s.source_report_type ? `（${TYPE_LABELS[s.source_report_type] || s.source_report_type}）` : '';
    return `${divider}<div class="hs-pill ${signalClass(s.signal)}" title="${escapeHtml(s.date || '')}${escapeHtml(source)}: ${signalLabel(s.signal)}">
      <div class="hs-pill-label">${signalLabel(s.signal)}</div>
      <div class="hs-pill-date">${escapeHtml(dateShort)}</div>
    </div>`;
  }).join('');
  const boundaryNote = boundaryShown
    ? `<div style="margin-top:6px;font-size:var(--fs-caption);color:var(--muted)">虛線左側為舊規則（會受 AI 文字用詞影響），${RULE_BOUNDARY_NOTE}，兩側不可直接比較。</div>`
    : '';

  // No prediction row: the verdicts grade morning_briefs/<date>_brief.txt, not
  // the morning report on this page (the-page-shows-no-grade-of-another-report).

  const topicsList = (h.recurring_topics || []).map(t =>
    `<div class="hs-topic-row">
      <span class="hs-topic-name">${escapeHtml(t.topic)}</span>
      <span class="hs-topic-source">${t.source === 'social' ? '社群' : '科技'}</span>
      <span class="hs-topic-days">連續 ${t.days} 天</span>
    </div>`
  ).join('');

  const topicsBlock = topicsList
    ? `<div style="margin-top:14px"><div class="hs-subtitle">持續發酵主題</div>${topicsList}</div>`
    : '';

  const body = `
    <div class="hs-subtitle">方向訊號歷史</div>
    <div class="hs-row">${signalCells}</div>
    ${boundaryNote}
    ${topicsBlock}
  `;

  return card('sec-history-strip', '📈 歷史對比', body, { collapsible: true });
}

// ── AI Analysis (persona tabs) ────────────────────────────────────────────────
function renderPredictionReview(pr) {
  if (!pr || pr.available === false) {
    return card('sec-prediction-review', '🎯 今日預測驗證',
      '<div style="color:var(--muted);padding:12px 0">今日資料尚未就緒</div>',
      { collapsible: true });
  }
  const verdictColor = { accurate: '#16A34A', partially_accurate: '#D97706', inaccurate: '#DC2626' };
  const verdictLabel = { accurate: '準確', partially_accurate: '部分準確', inaccurate: '不準確' };
  const color = verdictColor[pr.verdict] || '#6B7280';
  const label = verdictLabel[pr.verdict] || pr.verdict;
  const scorePct = pr.score != null ? Math.round(pr.score * 100) + '%' : '';
  const badge = `<span style="background:${color};color:#fff;padding:2px 10px;border-radius:12px;font-size:var(--fs-ui);font-weight:600">${label}</span>`;
  const scoreSpan = scorePct ? `<span style="margin-left:10px;color:var(--muted);font-size:var(--fs-ui)">評分 ${scorePct}</span>` : '';
  const summary = pr.summary ? `<div style="margin:10px 0 14px;color:var(--text)">${pr.summary}</div>` : '';
  const iconMap = { correct: '✅', incorrect: '❌', partial: '⚡' };
  const rows = (pr.predictions || []).map(p =>
    `<div style="padding:6px 0;border-bottom:1px solid var(--border)">
      ${iconMap[p.result] || '•'} <b>${p.claim}</b>
      <span style="color:var(--muted);margin-left:6px">→ ${p.actual}</span>
    </div>`
  ).join('');
  const body = `<div>${badge}${scoreSpan}${summary}${rows}</div>`;
  return card('sec-prediction-review', '🎯 今日預測驗證', body, { collapsible: true });
}

function renderAI(ai) {
  const ts = ai.generated_at||'';
  const who = aiAuthorLabel(ai);
  // Detect if we have persona-based content or single full_text
  const hasPersonas = ai.macro || ai.fundamental || ai.technical || ai.flow;
  const personas = hasPersonas ? [
    {id:'macro',     label:'🌍 Atlas  宏觀',    content: ai.macro},
    {id:'fundamental',label:'📈 Sophia 基本面',  content: ai.fundamental},
    {id:'technical', label:'📐 Kenji  技術面',   content: ai.technical},
    {id:'flow',      label:'🌊 Crow   籌碼情緒', content: ai.flow},
    {id:'summary',   label:'🎯 綜合結論',        content: ai.summary || ai.full_text},
  ].filter(p=>p.content) : [
    {id:'full', label:`${who.icon} ${who.fold}`, content: ai.full_text}
  ];

  const tabs = personas.map((p,i)=>
    `<div class="persona-tab${i===0?' active':''}" onclick="switchTab('${p.id}')" id="tab-${p.id}">${p.label}</div>`
  ).join('');
  const panels = personas.map((p,i)=>
    `<div id="panel-${p.id}" class="persona-panel${i===0?' active':''} md-content" data-raw="${encodeURIComponent(p.content||'')}"></div>`
  ).join('');

  return `<details class="sub-fold" id="sec-ai">
    <summary>${who.icon} ${who.fold} <span class="sub-fold-meta">${escHtml(String(ts).replace('T', ' ').slice(0, 16))} 生成</span></summary>
    <div class="sub-fold-body">
      <div class="persona-tabs">${tabs}</div>${panels}
      <div id="ai-full-text" style="display:none">${(ai.full_text||'').replace(/</g,'&lt;')}</div>
    </div>
  </details>`;
}

function switchTab(id) {
  document.querySelectorAll('.persona-tab').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.persona-panel').forEach(el=>el.classList.remove('active'));
  document.getElementById('tab-'+id)?.classList.add('active');
  document.getElementById('panel-'+id)?.classList.add('active');
}

// ── Markdown rendering ────────────────────────────────────────────────────────
function renderMarkdown(ai) {
  document.querySelectorAll('.persona-panel').forEach(el=>{
    const raw = decodeURIComponent(el.dataset.raw||'');
    if(raw) el.innerHTML = marked.parse(raw);
  });
}

// ── Market News & Themes ─────────────────────────────────────────────────────
function renderMarketNews(n) {
  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const themes = (n.themes || [])
    .map(t => ({
      ...t,
      name: String(t?.name || t?.label || '').trim(),
      insight: String(t?.insight || t?.summary || '').trim(),
    }))
    .filter(t => t.name);
  let html = '<div class="news-integrated">';

  if(themes.length) {
    html += `
      <div class="news-theme-grid">
        ${themes.map(t => `
          <div class="news-theme-card">
            <div class="news-theme-name">
              <strong style="color:var(--text);font-size:var(--fs-title);">${escapeHtml(t.name || '')}</strong>
              <span class="news-theme-score">熱度 ${escapeHtml(t.score ?? '—')}</span>
            </div>
            <div style="font-size:var(--fs-body);color:var(--text);line-height:1.55;">${escapeHtml(t.insight || '')}</div>
          </div>
        `).join('')}
      </div>`;
  } else {
    html += `
      <div class="news-empty-state">
        目前僅保留整理後主題，暫無可顯示內容。
      </div>`;
  }

  html += '</div>';
  const titleMap = {
    'Pre-open': '📰 多來源新聞整合',
    'Close Summary': '📰 收盤後多來源新聞整合',
    'Midweek Risk': '📰 風險主題整合',
    'Weekend Macro': '📰 週末多來源新聞整合',
    'Next Week Preview': '📰 下週題材整合',
  };
  const title = titleMap[_currentTemplateFamily || 'Pre-open'] || '📰 多來源新聞整合';
  const peek = themes.length ? `${themes.length} 個主題：${themes.slice(0, 3).map(t => t.name).join('、')}` : '';
  return card('sec-news', title, html, { collapsible: true, peek });
}

// ── Chart helpers ─────────────────────────────────────────────────────────────
const dark = 'rgba(42,52,72,0.5)';
// One colour per entity, the same in every chart, and never the rise/fall
// red or green (2026-10-17 review: gold meant 黃金 in one chart and the US
// 10-year in the next; green meant the dollar index and also "rise"). Steps
// from the dataviz reference palette, dark mode, validated on the card
// surface #141922 for the line charts' adjacent pairs.
const SERIES_COLORS = {
  'Brent 原油': '#3987e5',
  '黃金': '#c98500',
  '美元指數': '#199e70',
  '美國10年期公債殖利率': '#d95926',
};
const SERIES_UNKNOWN = '#7a8ba8';
const seriesColor = name => SERIES_COLORS[name] || SERIES_UNKNOWN;

const chartDefaults = {
  plugins:{ legend:{ display:false }, tooltip:{ bodyFont:{ size:11 } } },
  scales:{ x:{ ticks:{ color:'#7a8ba8', font:{size:11} }, grid:{color:dark} },
           y:{ ticks:{ color:'#7a8ba8', font:{size:11} }, grid:{color:dark} } },
  elements:{ point:{ radius:3 } },
  maintainAspectRatio: false,
};

  function buildMacroMiniCharts(rows) {
    // Show 5/10 year bond yield trend (if available) or skip
    // Mini trend lines are embedded in chips later if history exists
  }

  function buildTwHistoryChart(rows) {
    const el = document.getElementById('taiex-chart');
    if(!el || !Array.isArray(rows) || rows.length < 2) return;
    if(_charts.taiex) {
      _charts.taiex.destroy();
      delete _charts.taiex;
    }
    const data = rows.filter(r => r && r.close != null);
    if(data.length < 2) return;
    const labels = data.map(r => String(r.date || '').slice(5));
    const closes = data.map(r => Number(r.close));
    const gradientFill = (ctx) => {
      const chart = ctx.chart;
      const {chartArea} = chart;
      if (!chartArea) return 'rgba(99, 179, 255, 0.12)';
      const gradient = chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      gradient.addColorStop(0, 'rgba(99, 179, 255, 0.28)');
      gradient.addColorStop(1, 'rgba(99, 179, 255, 0.02)');
      return gradient;
    };
    _charts.taiex = new Chart(el, {
      type:'line',
      data:{
        labels,
        datasets:[{
          label:'TAIEX',
          data:closes,
          borderColor:'#63b3ff',
          backgroundColor: gradientFill,
          fill:true,
          tension:0.28,
          pointRadius:2,
          pointHoverRadius:4,
          borderWidth:2,
        }]
      },
      options:{
        ...chartDefaults,
        plugins:{
          legend:{display:false},
          tooltip:{
            callbacks:{
              title: items => items[0]?.label || '',
              label: ctx => {
                const idx = data[ctx.dataIndex] || {};
                const price = ctx.raw != null ? fmt(ctx.raw, 2) : 'N/A';
                const chg = idx.change != null ? `${idx.change > 0 ? '+' : ''}${fmt(idx.change, 2)} 點` : '—';
                const pct = idx.change_pct != null ? ` (${idx.change_pct > 0 ? '+' : ''}${fmt(idx.change_pct, 2)}%)` : '';
                return `收盤 ${price}｜漲跌 ${chg}${pct}`;
              }
            }
          }
        },
        scales:{
          x:{ ticks:{ color:'#7a8ba8', font:{size:10}, maxRotation:0, autoSkip:true }, grid:{ color:dark } },
          y:{ ticks:{ color:'#7a8ba8', font:{size:10} }, grid:{ color:dark } }
        },
        maintainAspectRatio:false,
      }
    });
  }

  function buildCommodityHistoryChart(c) {
    const el = document.getElementById('commodity-chart');
    if(!el || !c || !Array.isArray(c.series) || c.series.length < 2) return;
    if(_charts.commodity) {
      _charts.commodity.destroy();
      delete _charts.commodity;
    }
    const dates = Array.isArray(c.dates) ? c.dates : [];
    if(!dates.length) return;
    const datasets = c.series.map(series => {
      const color = seriesColor(series.name);
      const values = (series.values || []).map(v => v?.normalized ?? null);
      return {
        label: series.name,
        data: values,
        borderColor: color,
        backgroundColor: color,
        fill: false,
        tension: 0.26,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHitRadius: 8,
        borderWidth: 2,
      };
    });
    _charts.commodity = new Chart(el, {
      type: 'line',
      data: { labels: dates.map(d => String(d).slice(5)), datasets },
      options: {
        ...chartDefaults,
        plugins: {
          legend: { display: true, labels: { color: '#c7d4ea', font: { size: 11 }, usePointStyle: true, pointStyle: 'line' } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const series = c.series[ctx.datasetIndex] || {};
                const point = (series.values || [])[ctx.dataIndex] || {};
                const raw = point.raw != null ? fmt(point.raw, 2) : 'N/A';
                const norm = point.normalized != null ? fmt(point.normalized, 2) : 'N/A';
                return `${series.name}: ${raw} (基準 ${norm})`;
              }
            }
          }
        },
        scales: {
          x: { ticks: { color:'#7a8ba8', font:{size:10}, maxRotation:0 }, grid:{ color: dark } },
          y: { ticks: { color:'#7a8ba8', font:{size:10} }, grid:{ color: dark }, title:{ display:true, text:'基準值=100', color:'#7a8ba8', font:{ size:10 } } }
        },
        maintainAspectRatio: false,
      }
    });
  }

  function buildYieldOilHistoryChart(c) {
    const el = document.getElementById('yield-oil-chart');
    if(!el || !c || !Array.isArray(c.series) || c.series.length < 2) return;
    if(_charts.yieldOil) {
      _charts.yieldOil.destroy();
      delete _charts.yieldOil;
    }
    const dates = Array.isArray(c.dates) ? c.dates : [];
    if(!dates.length) return;
    const datasets = c.series.map(series => {
      const color = seriesColor(series.name);
      const values = (series.values || []).map(v => v?.normalized ?? null);
      return {
        label: series.name,
        data: values,
        borderColor: color,
        backgroundColor: color,
        fill: false,
        tension: 0.24,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHitRadius: 8,
        borderWidth: 2,
      };
    });
    _charts.yieldOil = new Chart(el, {
      type: 'line',
      data: { labels: dates.map(d => String(d).slice(5)), datasets },
      options: {
        ...chartDefaults,
        plugins: {
          legend: { display: true, labels: { color: '#c7d4ea', font: { size: 11 }, usePointStyle: true, pointStyle: 'line' } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const series = c.series[ctx.datasetIndex] || {};
                const point = (series.values || [])[ctx.dataIndex] || {};
                const raw = point.raw != null ? fmt(point.raw, 2) : 'N/A';
                const norm = point.normalized != null ? fmt(point.normalized, 2) : 'N/A';
                return `${series.name}: ${raw} (基準 ${norm})`;
              }
            }
          }
        },
        scales: {
          x: { ticks: { color:'#7a8ba8', font:{size:10}, maxRotation:0 }, grid:{ color: dark } },
          y: { ticks: { color:'#7a8ba8', font:{size:10} }, grid:{ color: dark }, title:{ display:true, text:'基準值=100', color:'#7a8ba8', font:{ size:10 } } }
        },
        maintainAspectRatio: false,
      }
    });
  }

  function buildUSSectorHistoryChart(c) {
    const el = document.getElementById('us-sector-chart');
    if(!el || !c || !Array.isArray(c.series) || c.series.length < 2) return;
    if(_charts.usSectorHistory) {
      _charts.usSectorHistory.destroy();
      delete _charts.usSectorHistory;
    }
    const dates = Array.isArray(c.dates) ? c.dates : [];
    if(!dates.length) return;
    // Eleven coloured lines in a 328px phone chart were unreadable, and past
    // eight hues the colours repeated. The card's question is who led and who
    // lagged since the base date: those two carry colour and a role in their
    // label; the other nine are thin gray context, still in the tooltip.
    const lastOf = s => {
      const vals = (s.values || []).map(v => v?.normalized).filter(v => v != null);
      return vals.length ? vals[vals.length - 1] : null;
    };
    const ranked = c.series.map((s, i) => ({ i, last: lastOf(s) })).filter(r => r.last != null)
      .sort((a, b) => b.last - a.last);
    const leader = ranked.length ? ranked[0].i : -1;
    const laggard = ranked.length > 1 ? ranked[ranked.length - 1].i : -1;
    const roleOf = idx => idx === leader ? 'leader' : idx === laggard ? 'laggard' : '';
    const ROLE = { leader: { color: '#3987e5', tag: '領先' }, laggard: { color: '#d95926', tag: '落後' } };
    const datasets = c.series.map((series, idx) => {
      const role = roleOf(idx);
      const color = role ? ROLE[role].color : 'rgba(122,139,168,0.45)';
      const values = (series.values || []).map(v => v?.normalized ?? null);
      return {
        label: role ? `${series.name}（${ROLE[role].tag}）` : series.name,
        data: values,
        borderColor: color,
        backgroundColor: color,
        fill: false,
        tension: 0.24,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHitRadius: 8,
        borderWidth: role ? 2.5 : 1,
        order: role ? 0 : 1,
        _role: role,
      };
    });
    _charts.usSectorHistory = new Chart(el, {
      type: 'line',
      data: { labels: dates.map(d => String(d).slice(5)), datasets },
      options: {
        ...chartDefaults,
        plugins: {
          legend: { display: true, labels: { color: '#c7d4ea', font: { size: 11 }, usePointStyle: true, pointStyle: 'line',
            filter: (item, data) => !!data.datasets[item.datasetIndex]?._role } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const series = c.series[ctx.datasetIndex] || {};
                const point = (series.values || [])[ctx.dataIndex] || {};
                const raw = point.raw != null ? fmt(point.raw, 2) : 'N/A';
                const norm = point.normalized != null ? fmt(point.normalized, 2) : 'N/A';
                return `${series.name}: ${raw} (基準 ${norm})`;
              }
            }
          }
        },
        scales: {
          x: { ticks: { color:'#7a8ba8', font:{size:10}, maxRotation:0 }, grid:{ color: dark } },
          y: { ticks: { color:'#7a8ba8', font:{size:10} }, grid:{ color: dark }, title:{ display:true, text:'基準值=100', color:'#7a8ba8', font:{ size:10 } } }
        },
        maintainAspectRatio: false,
      }
    });
  }

function buildSentimentCharts(s) {
  const drawGauge = (id, val, color) => {
    const el = document.getElementById(id);
    if(!el||val==null) return;
    const v = Math.min(100, Math.max(0, val));
    _charts[id] = new Chart(el, {
      type:'doughnut',
      data:{
        datasets:[{
          data:[v, 100-v],
          backgroundColor:[color,'rgba(42,52,72,0.4)'],
          borderWidth:0,
          circumference:180,
          rotation:270,
        }]
      },
      options:{
        ...chartDefaults,
        cutout:'70%',
        plugins:{ legend:{display:false}, tooltip:{enabled:false} },
        scales:{}, maintainAspectRatio:false,
      }
    });
  };
  // Sentiment hues (fear teal / greed orange), never the rise/fall colours.
  const sentimentColor = v => (v??50)<40?'#38d9c0':(v??50)>60?'#ff9f43':'#8da1bf';
  const cnnColor = sentimentColor(s.cnn?.value);
  const crColor  = sentimentColor(s.crypto?.value);
  drawGauge('cnn-gauge',    s.cnn?.value,    cnnColor);
  drawGauge('crypto-gauge', s.crypto?.value, crColor);
}

function buildSectorChart(sf) {
  const el = document.getElementById('sector-chart');
  if(!el) return;
  const strong = (sf.top5_strong||[]).slice(0,5);
  const weak   = (sf.top5_weak  ||[]).slice(0,5);
  const labels  = [...strong.map(s=>s.sector), ...weak.map(s=>s.sector)];
  const values  = [...strong.map(s=>s.avg_change||0), ...weak.map(s=>s.avg_change||0)];
  // Taiwan convention: red rises, green falls.
  const colors  = values.map(v=>v>=0?'rgba(242,94,94,0.7)':'rgba(52,208,88,0.7)');
  _charts['sector'] = new Chart(el, {
    type:'bar',
    data:{ labels, datasets:[{ data:values, backgroundColor:colors, borderRadius:4 }] },
    options:{
      ...chartDefaults,
      indexAxis:'y',
      plugins:{ legend:{display:false}, tooltip:{
        callbacks:{ label: ctx=>`${ctx.raw>0?'+':''}${ctx.raw.toFixed(2)}%` }
      }},
      scales:{
        x:{ ticks:{color:'#7a8ba8',font:{size:10},callback:v=>`${v>0?'+':''}${v}%`}, grid:{color:dark} },
        y:{ ticks:{color:'#e2e8f5',font:{size:11}}, grid:{color:'transparent'} }
      },
      maintainAspectRatio: false,
    }
  });
}

function buildSaConsensusChart(sa) {
  const el = document.getElementById('sa-consensus-chart');
  if(!el || !sa || !Array.isArray(sa.top_picks) || sa.top_picks.length < 1) return;
  if(_charts.saConsensus) {
    _charts.saConsensus.destroy();
    delete _charts.saConsensus;
  }
  const items = sa.top_picks
    .map(item => ({
      ...item,
      symbol: String(item.symbol || '').trim(),
    }))
    .filter(item => item.symbol);
  if(!items.length) return;

  const labels = items.map(item => item.symbol);
  const quant = items.map(item => item.quant_rating != null ? Number(item.quant_rating) : null);
  const wall = items.map(item => item.wall_street_rating != null ? Number(item.wall_street_rating) : null);
  const authors = items.map(item => item.authors_rating != null ? Number(item.authors_rating) : null);

  _charts.saConsensus = new Chart(el, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Quant',
          data: quant,
          backgroundColor: 'rgba(57,135,229,0.75)',
          borderColor: '#3987e5',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: 'Wall Street',
          data: wall,
          backgroundColor: 'rgba(217,89,38,0.75)',
          borderColor: '#d95926',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: 'Authors',
          data: authors,
          backgroundColor: 'rgba(25,158,112,0.75)',
          borderColor: '#199e70',
          borderWidth: 1,
          borderRadius: 4,
        },
      ]
    },
    options: {
      ...chartDefaults,
      indexAxis: 'y',
      plugins: {
        legend: {
          display: true,
          labels: { color: '#c7d4ea', font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const raw = ctx.raw != null ? Number(ctx.raw).toFixed(2) : 'N/A';
              return `${ctx.dataset.label}: ${raw}（越低越強）`;
            }
          }
        }
      },
      scales: {
        x: {
          min: 0,
          max: 5,
          ticks: {
            color:'#7a8ba8',
            font:{size:10},
            callback: value => Number(value).toFixed ? Number(value).toFixed(0) : value,
          },
          grid:{ color: dark },
          title: { display:true, text:'評級值（越低越強）', color:'#7a8ba8', font:{ size:10 } }
        },
        y: { ticks: { color:'#e2e8f5', font:{ size:11 } }, grid:{ color:'transparent' } }
      },
      maintainAspectRatio: false,
    }
  });
}

function buildInstChart(d) {
  // Inline inst chart if called later
}

// ── Anchor active on scroll ───────────────────────────────────────────────────
function updateAnchors() {
  const links = document.querySelectorAll('.anchor-nav a');
  if(_anchorsObserver) {
    _anchorsObserver.disconnect();
  }
  if('IntersectionObserver' in window) {
    _anchorsObserver = new IntersectionObserver(entries=>{
      const visible = entries
        .filter(e=>e.isIntersecting)
        .sort((a,b)=>a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if(!visible) return;
      links.forEach(l=>l.classList.remove('active'));
      const target = document.querySelector(`.anchor-nav a[href="#${visible.target.id}"]`);
      if(target) target.classList.add('active');
    }, {rootMargin:'-18% 0px -65% 0px', threshold:[0.08, 0.2]});
    document.querySelectorAll('[id^="sec-"]').forEach(el=>_anchorsObserver.observe(el));
  }

  if(!_backTopBound) {
    window.addEventListener('scroll',()=>{
      document.getElementById('back-top')?.classList.toggle('visible', window.scrollY>400);
    }, { passive: true });
    _backTopBound = true;
  }

  if(!document.querySelector('.anchor-nav a.active')) {
    document.querySelector('.anchor-nav a[href="#sec-hero"]')?.classList.add('active');
  }
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if(!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function jumpToSection(id) {
  const el = document.getElementById(id);
  if(!el) return;
  if(el.classList.contains('is-collapsible') && isSectionCollapsed(id)) {
    setSectionCollapsed(id, false);
  }
  if(el.tagName === 'DETAILS') el.open = true;
  scrollToSection(id);
}

function enhanceSectionShortcuts(order) {
  const ids = Array.isArray(order) ? order.filter(Boolean) : [];
  ids.forEach((id, idx) => {
    const card = document.querySelector(`[data-section-card="${id}"]`) || document.getElementById(id);
    if(!card || card.querySelector('.section-shortcuts')) return;
    const prevId = ids[idx - 1] || '';
    const nextId = ids[idx + 1] || '';
    const shortcuts = document.createElement('div');
    shortcuts.className = 'section-shortcuts';
    shortcuts.innerHTML = `
      ${prevId ? `<button type="button" class="section-link-btn" onclick="scrollToSection('${prevId}')">← 上一節</button>` : `<span class="section-link-spacer"></span>`}
      ${nextId ? `<button type="button" class="section-link-btn section-link-btn-primary" onclick="scrollToSection('${nextId}')">下一節 →</button>` : `<button type="button" class="section-link-btn section-link-btn-primary" onclick="scrollToSection('sec-hero')">回到頂部</button>`}
    `;
    const body = card.querySelector('.section-body');
    if(body) {
      body.appendChild(shortcuts);
    } else {
      card.appendChild(shortcuts);
    }
  });
}

// ── Card builder ──────────────────────────────────────────────────────────────
function card(id, title, body, options = {}) {
  const idAttr = id ? `id="${id}"` : '';
  const collapsible = Boolean(options.collapsible);
  const collapsed = collapsible && isSectionCollapsed(id);
  const expandedAttr = collapsible ? `aria-expanded="${!collapsed}"` : '';
  return `<div ${idAttr} class="section-card${collapsible ? ' is-collapsible' : ''}${collapsed ? ' is-collapsed' : ''}" data-section-card="${id || ''}">
    <div class="section-header">
      <div class="section-title">${title}</div>
      ${collapsible ? `<button type="button" class="section-toggle" data-section-toggle="${id || ''}" ${expandedAttr} onclick="toggleSectionCollapsed('${id || ''}')">${collapsed ? '展開' : '收合'}</button>` : ''}
    </div>
    <div class="section-body">${body}</div>
    ${collapsible ? `<button type="button" class="section-collapsed-hint" onclick="toggleSectionCollapsed('${id || ''}')">${options.peek ? `${escHtml(options.peek)} · ` : ''}<span class="hint-open">點此展開</span></button>` : ''}
  </div>`;
}

// ── Boot ──────────────────────────────────────────────────────────────────────
updateMarketStatus();
setInterval(updateMarketStatus, 60000);
loadIndex();
