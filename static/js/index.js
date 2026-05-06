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
const DEFAULT_COLLAPSED_SECTIONS = new Set(['sec-chart-orchestration', 'sec-news', 'sec-kol']);
let _sectionCollapseState = loadSectionCollapseState();

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
}

function expandAllSections() {
  setAllCollapsibleSections(false);
}

function collapseAllSections() {
  setAllCollapsibleSections(true);
}

const WEEKLY_TEMPLATE_SECTION_ORDER = {
  'Pre-open': ['hero', 'us_macro', 'sa_consensus', 'social_heatmap', 'tech_heatmap', 'taiex', 'market_snapshot', 'premarket', 'history', 'interpretation', 'chart_orchestration', 'news', 'kol', 'ai'],
  'Close Summary': ['hero', 'taiex', 'institutional', 'sector_flow', 'sa_consensus', 'social_heatmap', 'tech_heatmap', 'us_sector_history', 'history', 'interpretation', 'chart_orchestration', 'news', 'kol', 'ai'],
  'Midweek Risk': ['hero', 'interpretation', 'taiex', 'institutional', 'market_snapshot', 'sector_flow', 'sa_consensus', 'social_heatmap', 'tech_heatmap', 'us_sector_history', 'history', 'chart_orchestration', 'news', 'kol', 'ai'],
  'Weekend Macro': ['hero', 'us_macro', 'sa_consensus', 'social_heatmap', 'tech_heatmap', 'commodity_history', 'yield_oil_history', 'us_sector_history', 'market_snapshot', 'interpretation', 'chart_orchestration', 'news', 'kol', 'ai'],
  'Next Week Preview': ['hero', 'interpretation', 'chart_orchestration', 'sa_consensus', 'social_heatmap', 'tech_heatmap', 'news', 'us_macro', 'commodity_history', 'yield_oil_history', 'us_sector_history', 'taiex', 'market_snapshot', 'kol', 'ai'],
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

function familyClassName(family) {
  return String(family || 'Pre-open').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function buildReportSectionMap(d, family) {
  const sig   = d.headline?.signal || 'neutral';
  const emoji = sig==='bullish'?'📈':sig==='bearish'?'📉':'📊';
  const familyClass = familyClassName(family);
  const typeLabel = TYPE_LABELS[d.report_type] || d.report_type || '';
  const actionBadge = d.headline?.action ? `<span class="action-badge action-${sig}">${d.headline.action}</span>` : '';
  const taiex = d.sentiment && d.sentiment.tw_index && d.sentiment.tw_index.price ? (() => {
    const idx = d.sentiment.tw_index;
    const changeVal = Number(idx.change ?? 0);
    const changePctVal = idx.change_pct != null ? Number(idx.change_pct) : null;
    const isUp = changeVal >= 0;
    const arrow = isUp ? '▲' : '▼';
    const clsName = isUp ? 'up' : 'dn';
    const pointText = `${arrow} ${Math.abs(changeVal).toFixed(2)} 點`;
    const pctText = changePctVal != null ? ` (${changePctVal >= 0 ? '+' : '-'}${Math.abs(changePctVal).toFixed(2)}%)` : '';
    const chgStr = `${pointText}${pctText}`;
    const formatPrice = new Intl.NumberFormat('en-US').format(idx.price);
    return `
      <div class="taiex-banner ${clsName}">
        <div>
          <div class="taiex-label">加權指數 TAIEX</div>
          <div class="taiex-price">${formatPrice}</div>
        </div>
        <div class="taiex-chg ${clsName}">${chgStr}</div>
      </div>
    `;
  })() : '';

    const marketSnapshot = (d.sentiment || d.tw_premarket)
      ? `<div class="two-col">
           ${d.sentiment ? renderSentiment(d.sentiment) : ''}
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
  const interpretation = (d.market_news || d.sentiment || d.tw_premarket || d.social_pulse || d.us_macro || d.ai_analysis)
    ? renderMarketInterpretation(d)
    : '';
  const chartOrchestration = d.chart_orchestration ? renderChartOrchestration(d.chart_orchestration) : '';
  const news = d.market_news && (d.market_news.source_groups?.length || d.market_news.news_list?.length || d.market_news.themes?.length)
    ? renderMarketNews(d.market_news)
    : '';
  const kol = d.social_pulse ? renderKol(d.social_pulse) : '';
  const ai = d.ai_analysis ? renderAI(d.ai_analysis) : '';
  const usMacro = d.us_macro?.length ? renderUsMacro(d.us_macro) : '';
  const saConsensus = d.sa_consensus ? renderSeekingAlphaConsensus(d.sa_consensus) : '';
  const socialHeatmap = d.social_topic_heatmap ? renderSocialTopicHeatmap(d.social_topic_heatmap) : '';
  const techHeatmap = d.tech_topic_heatmap ? renderTechTopicHeatmap(d.tech_topic_heatmap) : '';

  return {
    hero: `
      <div id="sec-hero" class="section-card" style="padding:28px 32px;position:relative;overflow:hidden;margin-bottom:20px">
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--accent),var(--purple),var(--teal))"></div>
        <div style="display:flex;align-items:center;gap:20px">
          <div class="signal-orb signal-${sig}">${emoji}</div>
          <div style="flex:1">
            <div class="hero-meta">
              <span class="hero-date">${d.date||''}</span>
              <span class="type-badge type-${(d.report_type||'').replace('_','_')}">${typeLabel}</span>
              <span class="family-badge family-${familyClass}">${family}</span>
              <span class="signal-label label-${sig}">${sig==='bullish'?'偏多':sig==='bearish'?'偏空':'中性'}</span>
              ${actionBadge}
            </div>
            <div id="hero-teaser">${d.headline?.teaser||'—'}</div>
          </div>
        </div>
      </div>`,
    taiex,
    market_snapshot: marketSnapshot,
      premarket,
      history,
      commodity_history: commodityHistory,
      yield_oil_history: yieldOilHistory,
      us_sector_history: usSectorHistory,
      institutional,
      sector_flow: sectorFlow,
    interpretation,
    chart_orchestration: chartOrchestration,
    news,
    kol,
    ai,
    us_macro: usMacro,
    sa_consensus: saConsensus,
    social_heatmap: socialHeatmap,
    tech_heatmap: techHeatmap,
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
    if(index.length) loadReport(index[0].file);
  } catch(e) {
    document.getElementById('app').innerHTML =
      `<div class="loader" style="color:var(--red)">⚠️ 無法載入報告清單：${e.message}</div>`;
  }
}

// ── Load report JSON ─────────────────────────────────────────────────────────
async function loadReport(file) {
  document.getElementById('app').innerHTML = '<div class="loader">載入資料中<span class="spinner"></span></div>';
  destroyCharts();
  try {
    const res = await fetch(`${file}?_=${Date.now()}`);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    _currentData = await res.json();
    _currentReportFile = file;
    _currentReportIndex = _reportIndex.findIndex(item => item.file === file);
    const sel = document.getElementById('date-select');
    if(sel && sel.value !== file) sel.value = file;
    render(_currentData);
    updateReportNavButtons();
  } catch(e) {
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
  const sections = buildReportSectionMap(d, family);
  const order = WEEKLY_TEMPLATE_SECTION_ORDER[family] || WEEKLY_TEMPLATE_SECTION_ORDER['Pre-open'];
  const html = order.map(key => sections[key] || '').join('');

  document.getElementById('app').innerHTML = html;
  enhanceSectionShortcuts(order);

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
      if(d.social_topic_heatmap) buildSocialTopicHeatmapChart(d.social_topic_heatmap);
      if(d.tech_topic_heatmap) buildTechTopicHeatmapChart(d.tech_topic_heatmap);
      if(d.ai_analysis) renderMarkdown(d.ai_analysis);
      updateAnchors();
      updateReportNavButtons();
    });
  }

// ── US Macro ─────────────────────────────────────────────────────────────────
function renderUsMacro(rows) {
  const chips = rows.map(r => `
    <div class="macro-chip">
      <div class="chip-name">${r.name}</div>
      <div class="chip-value">${fmt(r.value, r.value>1000?0:2)}</div>
      <div class="chip-chg ${cls(r.change_pct)}">
        ${arr(r.change_pct)} ${fmtPct(r.change_pct)}
      </div>
    </div>`).join('');
  return card('sec-macro','🌐 美股宏觀指標', `<div class="macro-grid">${chips}</div>`);
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
          <strong style="color:var(--text);font-size:15px;">${escapeHtml(item.symbol)}</strong>
          <span class="news-theme-score">${escapeHtml(item.consensus_score != null ? item.consensus_score.toFixed(2) : '—')}</span>
        </div>
        <div style="font-size:12px;color:var(--muted);line-height:1.55;margin-bottom:8px;">
          ${ratingChips.map(([label, value]) => `<span style="display:inline-block;margin-right:8px;margin-bottom:6px;">${escapeHtml(label)}：${escapeHtml(value != null ? Number(value).toFixed(2) : '—')}</span>`).join('')}
        </div>
        <div style="font-size:12px;color:var(--muted);line-height:1.55;">
          <span style="display:inline-block;margin-right:8px;">V ${escapeHtml(factor.value || '—')}</span>
          <span style="display:inline-block;margin-right:8px;">G ${escapeHtml(factor.growth || '—')}</span>
          <span style="display:inline-block;margin-right:8px;">P ${escapeHtml(factor.profitability || '—')}</span>
          <span style="display:inline-block;margin-right:8px;">M ${escapeHtml(factor.momentum || '—')}</span>
          <span style="display:inline-block;margin-right:8px;">R ${escapeHtml(factor.revisions || '—')}</span>
        </div>
      </div>
    `;
  }).join('');

  return card('sec-sa-consensus', `📌 美股分析師共識圖${asOf ? ` <span style="font-size:11px;color:var(--muted);font-weight:400">(${escapeHtml(asOf)})</span>` : ''}`, `
    <div class="interpret-summary">${escapeHtml(summary)}</div>
    <div class="interpret-meta">
      ${overviewChips.map(chip => `<span class="interpret-chip">${escapeHtml(chip.label)}：${escapeHtml(chip.value)}</span>`).join('')}
    </div>
    <div class="news-theme-grid" style="margin-top:14px;">
      ${itemCards}
    </div>
    <div style="margin-top:14px;height:280px;"><canvas id="sa-consensus-chart"></canvas></div>
    <div style="margin-top:8px;font-size:11px;color:var(--muted);">圖上的評級數值越低，代表 Seeking Alpha 的共識越強。</div>
  `);
}

function renderSocialTopicHeatmap(heatmap) {
  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const topics = Array.isArray(heatmap.topics) ? heatmap.topics : [];
  const summary = String(heatmap.summary || '社群熱度資料').trim();
  const benchmark = String(heatmap.benchmark || 'PTT Stock / Google Trends（商業與財經）').trim();
  const coverage = heatmap.coverage != null ? Number(heatmap.coverage) : topics.length;
  const asOf = String(heatmap.as_of || '').trim();
  const chips = [
    { label: '來源', value: String(heatmap.source || 'stock_social') },
    { label: '覆蓋', value: `${coverage} 檔` },
    { label: '樣本', value: benchmark },
  ];
  const rows = topics.slice(0, 5).map(item => `
    <div class="news-theme-card">
      <div class="news-theme-name">
        <strong style="color:var(--text);font-size:15px;">${escapeHtml(item.topic || '')}</strong>
        <span class="news-theme-score">${escapeHtml(item.is_rising ? 'Rising' : 'Stable')}</span>
      </div>
      <div style="font-size:12px;color:var(--muted);line-height:1.55;margin-bottom:8px;">
        <span style="display:inline-block;margin-right:8px;">Source：${escapeHtml(item.source || '—')}</span>
        <span style="display:inline-block;margin-right:8px;">Score：${escapeHtml(item.score != null ? Number(item.score).toFixed(1) : '—')}</span>
        <span style="display:inline-block;margin-right:8px;">Velocity：${escapeHtml(item.velocity != null ? Number(item.velocity).toFixed(1) : '—')}</span>
      </div>
    </div>
  `).join('');
  const body = topics.length ? `
    <div class="interpret-summary">${escapeHtml(summary)}</div>
    <div class="interpret-meta">
      ${chips.map(chip => `<span class="interpret-chip">${escapeHtml(chip.label)}：${escapeHtml(chip.value)}</span>`).join('')}
    </div>
    <div class="news-theme-grid" style="margin-top:14px;">
      ${rows}
    </div>
    <div style="margin-top:14px;height:260px;"><canvas id="social-heatmap-chart"></canvas></div>
  ` : `
    <div class="news-empty-state">
      暫無可顯示的熱門社群討論。
    </div>
  `;
  return card('sec-social-heatmap', `📌 社群熱度圖${asOf ? ` <span style="font-size:11px;color:var(--muted);font-weight:400">(${escapeHtml(asOf)})</span>` : ''}`, body);
}

function renderTechTopicHeatmap(heatmap) {
  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const topics = Array.isArray(heatmap.topics) ? heatmap.topics : [];
  if(!topics.length) return '';

  const summary = String(heatmap.summary || '科技主題資料').trim();
  const benchmark = String(heatmap.benchmark || '科技主題 / 新聞主線').trim();
  const coverage = heatmap.coverage != null ? Number(heatmap.coverage) : topics.length;
  const asOf = String(heatmap.as_of || '').trim();
  const chips = [
    { label: '來源', value: String(heatmap.source || 'market_news') },
    { label: '覆蓋', value: `${coverage} 檔` },
    { label: '樣本', value: benchmark },
  ];
  const rows = topics.slice(0, 5).map(item => `
    <div class="news-theme-card">
      <div class="news-theme-name">
        <strong style="color:var(--text);font-size:15px;">${escapeHtml(item.topic || '')}</strong>
        <span class="news-theme-score">${escapeHtml(item.score != null ? Number(item.score).toFixed(0) : '—')}</span>
      </div>
      <div style="font-size:12px;color:var(--muted);line-height:1.55;margin-bottom:8px;">
        ${escapeHtml(item.summary || '科技主題彙整')}
      </div>
      <div style="font-size:11px;color:var(--muted);line-height:1.55;">
        <span style="display:inline-block;margin-right:8px;">Sources：${escapeHtml((item.sources || []).slice(0, 3).join('、') || '—')}</span>
      </div>
    </div>
  `).join('');
  return card('sec-tech-heatmap', `📌 科技主題熱度圖${asOf ? ` <span style="font-size:11px;color:var(--muted);font-weight:400">(${escapeHtml(asOf)})</span>` : ''}`, `
    <div class="interpret-summary">${escapeHtml(summary)}</div>
    <div class="interpret-meta">
      ${chips.map(chip => `<span class="interpret-chip">${escapeHtml(chip.label)}：${escapeHtml(chip.value)}</span>`).join('')}
    </div>
    <div class="news-theme-grid" style="margin-top:14px;">
      ${rows}
    </div>
    <div style="margin-top:14px;height:260px;"><canvas id="tech-heatmap-chart"></canvas></div>
  `);
}

// ── Sentiment ─────────────────────────────────────────────────────────────────
function renderSentiment(s) {
  const cnn    = s.cnn    || {};
  const crypto = s.crypto || {};
  const tw_g   = s.tw_greed || {};
  const tw     = s.tw_market || {};
  const tot    = tw.total || 0;
  const bullPct= tot ? Math.round((tw.gainers||0)/tot*100) : 50;
  return card('sec-sentiment','😨 市場情緒', `
    <div class="sentiment-grid">
      <div class="fg-card">
        <div class="fg-label">台灣市場情緒</div>
        <div class="fg-value ${fgClass(tw_g.label)}">${tw_g.value??'資料待補'}</div>
        <div class="fg-text ${fgClass(tw_g.label)}">${tw_g.label||'—'}</div>
        <div class="linear-gauge-wrap">
          <div class="linear-gauge-bg"></div>
          <div class="linear-gauge-marker" style="left:${tw_g.value!=null?tw_g.value:50}%"></div>
        </div>
        <div style="margin-top:8px;font-size:12px;color:var(--muted);text-align:center;">台灣籌碼情緒 / 貪婪恐懼</div>
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
        <div class="fg-label">台股市場廣度</div>
        <div style="font-size:32px; font-weight:800; margin:10px 0; line-height:1;">
          <span class="up">${tw.gainers??'—'}</span>
          <span style="color:var(--muted); font-size:18px; font-weight:400; margin:0 4px;">/</span>
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
    const emptyState = hasHistory ? '' : `<div style="height:180px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:13px;">目前沒有可繪製的歷史資料。</div>`;
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
    const chips = series.map(s => `
      <div class="macro-chip">
        <div class="chip-name">${s.name}</div>
        <div class="chip-value">${s.latest != null ? fmt(s.latest, s.symbol === 'DXY' ? 2 : 2) : '資料待補'}</div>
        <div class="chip-chg ${cls(s.change_pct)}">${arr(s.change_pct)} ${fmtPct(s.change_pct)}</div>
      </div>
    `).join('');
    return card('sec-commodity', title, `
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
        <div class="chip-name">${s.name}</div>
        <div class="chip-value">${s.latest != null ? fmt(s.latest, 2) : '資料待補'}</div>
        <div class="chip-chg ${cls(s.change_pct)}">${arr(s.change_pct)} ${fmtPct(s.change_pct)}</div>
      </div>
    `).join('');
    return card('sec-yield-oil', title, `
      <div class="macro-grid">${chips}</div>
      ${dateRange ? `<div style="margin-top:8px;font-size:11px;color:var(--muted);">${dateRange}</div>` : ''}
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
    const leader = latestRank[0];
    const laggard = latestRank[latestRank.length - 1];
    const defensiveSet = new Set(['必需消費', '公用事業', '醫療保健', '不動產']);
    const offensiveSet = new Set(['科技', '非必需消費', '金融', '工業', '能源', '原物料', '通訊服務']);
    const defensiveAvg = latestRank.filter(s => defensiveSet.has(s.name)).reduce((acc, s) => acc + Number(s.latestNorm || 0), 0) / Math.max(1, latestRank.filter(s => defensiveSet.has(s.name)).length);
    const offensiveAvg = latestRank.filter(s => offensiveSet.has(s.name)).reduce((acc, s) => acc + Number(s.latestNorm || 0), 0) / Math.max(1, latestRank.filter(s => offensiveSet.has(s.name)).length);
    const biasText = latestRank.length
      ? (defensiveAvg >= offensiveAvg
        ? '資金相對偏向防禦族群。'
        : '資金相對偏向進攻族群。')
      : '目前仍在觀察輪動方向。';
    const leaderText = leader ? `領漲：${leader.name}` : '領漲：—';
    const laggardText = laggard ? `弱勢：${laggard.name}` : '弱勢：—';
    const chips = series.map(s => `
      <div class="macro-chip">
        <div class="chip-name">${s.name}</div>
        <div class="chip-value">${s.latest != null ? fmt(s.latest, 2) : '資料待補'}</div>
        <div class="chip-chg ${cls(s.change_pct)}">${arr(s.change_pct)} ${fmtPct(s.change_pct)}</div>
      </div>
    `).join('');
    return card('sec-us-sector', title, `
      <div class="macro-grid">${chips}</div>
      ${dateRange ? `<div style="margin-top:8px;font-size:11px;color:var(--muted);">${dateRange}</div>` : ''}
      <div class="interpret-panel" style="margin-top:12px;padding:12px 14px;">
        <div class="interpret-summary">${escapeHtml(biasText)}</div>
        <div class="interpret-note" style="margin-top:6px">${escapeHtml(`${leaderText}｜${laggardText}`)}</div>
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
  const maintClass = maint!=null ? (maint<150?'dn':maint<160?'flat':'up') : 'flat';
  return card('sec-tw','🇹🇼 台股盤前', `
    <div class="premarket-grid">
      <div class="pm-chip">
        <div class="pm-label">富台 SGX 夜盤</div>
        <div class="pm-value ${cls(p.sgx_fut?.change_pct)}">${p.sgx_fut?.value!=null?fmtK(p.sgx_fut.value):'資料待補'}</div>
        <div class="chip-chg ${cls(p.sgx_fut?.change_pct)}">${arr(p.sgx_fut?.change_pct)} ${fmtPct(p.sgx_fut?.change_pct)}</div>
      </div>
      <div class="pm-chip">
        <div class="pm-label">台指期夜盤</div>
        <div class="pm-value ${cls(p.rich_fut?.change_pct)}">${p.rich_fut?.value!=null?fmtK(p.rich_fut.value):'資料待補'}</div>
        <div class="chip-chg ${cls(p.rich_fut?.change_pct)}">${arr(p.rich_fut?.change_pct)} ${fmtPct(p.rich_fut?.change_pct)}</div>
      </div>
      <div class="pm-chip">
        <div class="pm-label">市場趨勢</div>
        <div class="pm-value" style="font-size:14px;margin-top:4px">
          <span class="regime-pill rp-${regClass}">${regime}</span>
        </div>
      </div>
      <div class="pm-chip">
        <div class="pm-label">PC Ratio</div>
        <div class="pm-value">${p.pc_ratio!=null?fmt(p.pc_ratio):'資料待補'}</div>
      </div>
      <div class="pm-chip">
        <div class="pm-label">融資維持率</div>
        <div class="pm-value ${maintClass}">${maint!=null?fmt(maint)+'%':'資料待補'}</div>
      </div>
      ${p.vol_state ? `<div class="pm-chip"><div class="pm-label">波動狀態</div><div class="pm-value" style="font-size:13px;margin-top:4px">${p.vol_state}</div></div>` : ''}
    </div>`);
}

// ── TAIEX History Table ───────────────────────────────────────────────────────
function renderHistoryTable(rows) {
  const header = `<tr><th>日期</th><th>收盤點數</th><th>漲跌</th><th>漲跌幅</th><th>外資(億)</th><th>投信(億)</th><th>自營(億)</th></tr>`;
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

// ── Institutional ─────────────────────────────────────────────────────────────
function renderInstitutional(inst) {
  const items=[{n:'外資',v:inst.foreign_net},{n:'投信',v:inst.trust_net},{n:'自營商',v:inst.dealer_net}];
  const staleBadge = inst.stale ? `<span style="font-size:11px;color:var(--yellow);font-weight:700;border:1px solid rgba(240,195,74,.25);background:rgba(240,195,74,.08);padding:2px 8px;border-radius:999px;">資料偏舊${inst.age_days!=null?` ${inst.age_days} 天`:''}</span>` : '';
  const sourceBadge = inst.source ? `<span style="font-size:11px;color:var(--muted);font-weight:400;margin-left:6px;">來源：${inst.source}</span>` : '';
  return card('sec-inst',`🏛️ 三大法人 ${inst.date?`<span style="font-size:11px;color:var(--muted);font-weight:400">(${inst.date})</span>`:''} ${sourceBadge} ${staleBadge}`, `
    <div class="inst-row">
      ${items.map(i=>`
        <div class="inst-card">
          <div class="inst-name">${i.n}</div>
          <div class="inst-value ${cls(i.v)}">${i.v==null?'資料待補':(i.v>0?'+':'')+fmt(i.v)}</div>
          <div class="inst-unit">億元</div>
        </div>`).join('')}
    </div>
    ${inst.note ? `<div style="margin-top:6px;font-size:12px;color:var(--muted);">${inst.note}</div>` : ''}
    <div style="margin-top:4px"><canvas id="inst-chart" height="70"></canvas></div>`);
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
  return card('sec-sector','📊 板塊資金流向', `
    <div class="sector-cols">
      <div>
        <div class="sector-col-title" style="color:var(--green)">▲ 強勢板塊 Top 5</div>
        ${strList||'<span style="color:var(--muted)">無資料</span>'}
      </div>
      <div>
        <div class="sector-col-title" style="color:var(--red)">▼ 弱勢板塊 Top 5</div>
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

  if (!evidence.length) {
    return card('sec-interpret', '🧭 今日盤勢解讀', `
      <div class="interpret-panel">
        <div class="interpret-summary">目前可用資料不足，暫時無法生成今日盤勢解讀。</div>
      </div>`);
  }

  const themeNames = themes.slice(0, 3).map(t => t.name).filter(Boolean);

  const greed = sentiment.tw_greed?.value != null ? Number(sentiment.tw_greed.value) : null;
  const regime = (tw.regime || tw.trend_state || '').toString();

  let score = 0;
  if (regime.includes('BULL')) score += 2;
  if (regime.includes('BEAR')) score -= 2;
  if (bullPct != null && bearPct != null) score += bullPct >= bearPct ? 0.5 : -0.5;
  if (greed != null) score += greed >= 70 ? -1 : greed <= 35 ? 0.5 : 0;
  if (themeNames.some(t => /AI|半導體|成長|軟體/.test(t))) score += 0.5;
  if (themeNames.some(t => /地緣|通膨|風險|疲弱/.test(t))) score -= 0.5;

  const direction = score >= 2 ? '偏多' : score <= -2 ? '偏空' : '中性';
  const confidence = Math.min(3, Math.max(1, Math.round(Math.abs(score))));
  const confidenceText = confidence >= 3
    ? '訊號偏強'
    : confidence === 2
      ? '訊號中等'
      : '訊號偏弱';

  const summary = isWeekendMorning
    ? `週末資料顯示盤勢仍以整理為主，方向先看下週開盤與國際盤是否同向。`
    : direction === '偏多'
      ? `今日盤勢偏多，但屬於輪動式上漲，不是全面失速型大噴出。`
      : direction === '偏空'
        ? `今日盤勢偏空，賣壓與風險偏好下降已開始主導盤面。`
        : `今日盤勢偏震盪，雖然有方向，但還不到可以放心追價的程度。`;

  const actionText = isWeekendMorning
    ? `操作含意：先不要用週末消息硬猜方向，等週一開盤後再看資金是否延續。`
    : direction === '偏多'
      ? `操作含意：偏多看待，回檔找點比追高更重要；若量能擴大且法人續買，趨勢才算站穩。`
      : direction === '偏空'
        ? `操作含意：以防守為主，反彈先看壓力；若外部風險沒有降溫，不急著進場。`
        : `操作含意：區間思維，先看突破或跌破再站隊，不用把今天解讀成一定要立刻出手。`;

  return card('sec-interpret', isWeekendMorning ? '🧭 週末盤勢解讀' : '🧭 今日盤勢解讀', `
    <div class="interpret-panel">
      <div class="interpret-summary">${escapeHtml(summary)}</div>
      <div class="interpret-note">${escapeHtml(`判讀：${direction} / ${confidenceText}`)}</div>
      <div class="interpret-note">${escapeHtml(actionText)}</div>
    </div>`);
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
  const themes = Array.isArray(o.news_themes) ? o.news_themes : [];
  const gapSuggestions = Array.isArray(o.chart_gap_suggestions) ? o.chart_gap_suggestions : [];
  const budget = Number(o.chart_budget ?? selected.length ?? 0);
  const family = String(o.family || _currentTemplateFamily || 'Pre-open');
  const source = String(o.source || 'fallback');
  const summary = String(o.overall_summary || '圖表編排目前不可用，系統已回退到靜態報告區塊。');
  const selectedCount = selected.length;
  const chartCards = selected.map(chart => {
    const title = chart.title || chart.id || '未命名圖表';
    const desc = chart.description || '';
    const takeaway = chart.takeaway || desc || '';
    const action = chart.action || '';
    return `
      <div class="news-theme-card">
        <div class="news-theme-name">
          <strong style="color:var(--text);font-size:15px;">${escapeHtml(title)}</strong>
          <span class="news-theme-score">${escapeHtml(chart.priority || '—')}</span>
        </div>
        <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:6px;">${escapeHtml(chart.id || '')}</div>
        <div style="font-size:14px;color:var(--text);line-height:1.55;margin-bottom:8px;">${escapeHtml(takeaway)}</div>
        ${action ? `<div class="interpret-note" style="margin-top:0;">${escapeHtml(action)}</div>` : ''}
      </div>
    `;
  }).join('');
  const themeCards = themes.map(theme => {
    const label = theme.label || theme.name || '未命名主題';
    const summaryText = theme.summary || theme.insight || '';
    const evidence = Array.isArray(theme.evidence) ? theme.evidence : [];
    const sources = Array.isArray(theme.sources) ? theme.sources : [];
    return `
      <div class="interpret-box">
        <div class="interpret-title">${escapeHtml(label)}<span style="color:var(--muted);font-weight:400">${sources.length ? escapeHtml(sources.join('、')) : ''}</span></div>
        <div class="interpret-list">
          <div>${escapeHtml(summaryText || 'Gemini 整理後主題')}</div>
          ${evidence.length ? `<div><span>證據：</span>${escapeHtml(evidence.slice(0, 2).join('； '))}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
  const gapCards = gapSuggestions.map(item => {
    const title = item.chart_name || item.name || '未命名建議';
    const whyNeeded = item.why_needed || item.reason || '';
    const dataNeeded = Array.isArray(item.data_needed) ? item.data_needed : [];
    const reportTypes = Array.isArray(item.which_report_types) ? item.which_report_types : [];
    const evidence = item.evidence || '';
    const priority = String(item.priority || 'medium');
    return `
      <div class="news-theme-card">
        <div class="news-theme-name">
          <strong style="color:var(--text);font-size:15px;">${escapeHtml(title)}</strong>
          <span class="news-theme-score">${escapeHtml(priority)}</span>
        </div>
        ${whyNeeded ? `<div style="font-size:14px;color:var(--text);line-height:1.55;margin-bottom:8px;">${escapeHtml(whyNeeded)}</div>` : ''}
        ${dataNeeded.length ? `<div style="font-size:12px;color:var(--muted);line-height:1.55;margin-bottom:6px;"><strong style="color:var(--text);">需要資料：</strong>${escapeHtml(dataNeeded.join('、'))}</div>` : ''}
        ${reportTypes.length ? `<div style="font-size:12px;color:var(--muted);line-height:1.55;margin-bottom:6px;"><strong style="color:var(--text);">適用報表：</strong>${escapeHtml(reportTypes.join('、'))}</div>` : ''}
        ${evidence ? `<div style="font-size:12px;color:var(--muted);line-height:1.55;">${escapeHtml(evidence)}</div>` : ''}
      </div>
    `;
  }).join('');
  let html = '<div class="interpret-panel">';
  html += `
    <div class="interpret-summary">${escapeHtml(summary)}</div>
    <div class="interpret-meta">
      <span class="interpret-chip">Family: ${escapeHtml(family)}</span>
      <span class="interpret-chip">Selected: ${selectedCount} / Max: ${budget}</span>
      <span class="interpret-chip">Source: ${escapeHtml(source)}</span>
    </div>
  `;

  if(chartCards) {
    html += `
      <div class="news-theme-grid">
        ${chartCards}
      </div>
    `;
  }

  if(themes.length) {
    html += `
      <div class="interpret-box">
        <div class="interpret-title">Gemini 主題整合</div>
        <div class="theme-row" style="margin-bottom:0">
          ${themes.slice(0, 5).map(theme => `
            <div class="theme-pill">${escapeHtml(theme.label || theme.name || '')}</div>
          `).join('')}
        </div>
      </div>
      <div class="interpret-grid">
        ${themeCards}
      </div>
    `;
  }

  if(gapSuggestions.length) {
    html += `
      <div class="interpret-box">
        <div class="interpret-title">📌 圖表缺口建議</div>
        <div class="interpret-list">
          <div>Gemini 判斷目前報告仍可補強的圖表方向。你可以依照這裡的資料需求去補做新圖，之後加入圖庫就能重複使用。</div>
        </div>
      </div>
      <div class="interpret-grid">
        ${gapCards}
      </div>
    `;
  }

  html += '</div>';
  return card('sec-chart-orchestration', '🧠 Gemini 編排摘要', html, { collapsible: true });
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
        <span style="color:var(--muted);font-size:12px">${neutral}% 中性 / ${sp.total_kols||0} 位 KOL 統計</span>
      </div>
    </div>`, { collapsible: true });
}

// ── AI Analysis (persona tabs) ────────────────────────────────────────────────
function renderAI(ai) {
  const ts = ai.generated_at||'';
  // Detect if we have persona-based content or single full_text
  const hasPersonas = ai.macro || ai.fundamental || ai.technical || ai.flow;
  const personas = hasPersonas ? [
    {id:'macro',     label:'🌍 Atlas  宏觀',    content: ai.macro},
    {id:'fundamental',label:'📈 Sophia 基本面',  content: ai.fundamental},
    {id:'technical', label:'📐 Kenji  技術面',   content: ai.technical},
    {id:'flow',      label:'🌊 Crow   籌碼情緒', content: ai.flow},
    {id:'summary',   label:'🎯 綜合結論',        content: ai.summary || ai.full_text},
  ].filter(p=>p.content) : [
    {id:'full', label:'🤖 AI 深度分析', content: ai.full_text}
  ];

  const tabs = personas.map((p,i)=>
    `<div class="persona-tab${i===0?' active':''}" onclick="switchTab('${p.id}')" id="tab-${p.id}">${p.label}</div>`
  ).join('');
  const panels = personas.map((p,i)=>
    `<div id="panel-${p.id}" class="persona-panel${i===0?' active':''} md-content" data-raw="${encodeURIComponent(p.content||'')}"></div>`
  ).join('');

  return card('sec-ai',
    `🤖 AI 深度分析 <span style="font-size:11px;color:var(--muted);font-weight:400;margin-left:8px">${ts}</span>`,
    `<div class="persona-tabs">${tabs}</div>${panels}
     <div id="ai-full-text" style="display:none">${(ai.full_text||'').replace(/</g,'&lt;')}</div>`, { collapsible: true });
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
              <strong style="color:var(--text);font-size:15px;">${escapeHtml(t.name || '')}</strong>
              <span class="news-theme-score">熱度 ${escapeHtml(t.score ?? '—')}</span>
            </div>
            <div style="font-size:14px;color:var(--text);line-height:1.55;">${escapeHtml(t.insight || '')}</div>
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
  return card('sec-news', title, html, { collapsible: true });
}

// ── Chart helpers ─────────────────────────────────────────────────────────────
const dark = 'rgba(42,52,72,0.5)';
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
    const datasets = c.series.map((series, idx) => {
      const colors = ['#63b3ff', '#f0c34a', '#34d058', '#a37cff'];
      const color = colors[idx % colors.length];
      const values = (series.values || []).map(v => v?.normalized ?? null);
      return {
        label: series.name,
        data: values,
        borderColor: color,
        backgroundColor: color,
        fill: false,
        tension: 0.26,
        pointRadius: 1.5,
        pointHoverRadius: 4,
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
    const datasets = c.series.map((series, idx) => {
      const colors = ['#f0c34a', '#63b3ff'];
      const color = colors[idx % colors.length];
      const values = (series.values || []).map(v => v?.normalized ?? null);
      return {
        label: series.name,
        data: values,
        borderColor: color,
        backgroundColor: color,
        fill: false,
        tension: 0.24,
        pointRadius: 1.5,
        pointHoverRadius: 4,
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
    const colors = ['#63b3ff', '#f0c34a', '#34d058', '#a37cff', '#f25e5e', '#47c6b8', '#ff9f43', '#8ea6ff', '#ff6fb1', '#70d6ff', '#ffd166'];
    const datasets = c.series.map((series, idx) => {
      const color = colors[idx % colors.length];
      const values = (series.values || []).map(v => v?.normalized ?? null);
      return {
        label: series.name,
        data: values,
        borderColor: color,
        backgroundColor: color,
        fill: false,
        tension: 0.24,
        pointRadius: 1.5,
        pointHoverRadius: 4,
        borderWidth: 2,
      };
    });
    _charts.usSectorHistory = new Chart(el, {
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
  const cnnColor = (s.cnn?.value||50)<40?'#f25e5e':(s.cnn?.value||50)>60?'#34d058':'#f0c34a';
  const crColor  = (s.crypto?.value||50)<40?'#f25e5e':(s.crypto?.value||50)>60?'#34d058':'#f0c34a';
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
  const colors  = values.map(v=>v>=0?'rgba(52,208,88,0.7)':'rgba(242,94,94,0.7)');
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
          backgroundColor: 'rgba(99,179,255,0.7)',
          borderColor: '#63b3ff',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: 'Wall Street',
          data: wall,
          backgroundColor: 'rgba(52,208,88,0.7)',
          borderColor: '#34d058',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: 'Authors',
          data: authors,
          backgroundColor: 'rgba(163,124,255,0.7)',
          borderColor: '#a37cff',
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

function buildSocialTopicHeatmapChart(heatmap) {
  const el = document.getElementById('social-heatmap-chart');
  if(!el || !heatmap || !Array.isArray(heatmap.topics) || heatmap.topics.length < 1) return;
  if(_charts.socialHeatmap) {
    _charts.socialHeatmap.destroy();
    delete _charts.socialHeatmap;
  }
  const items = heatmap.topics
    .map(item => ({
      ...item,
      topic: String(item.topic || '').trim(),
    }))
    .filter(item => item.topic)
    .slice(0, 5);
  if(!items.length) return;

  const labels = items.map(item => item.topic);
  const velocity = items.map(item => item.velocity != null ? Number(item.velocity) : 0);

  _charts.socialHeatmap = new Chart(el, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Velocity',
          data: velocity,
          backgroundColor: 'rgba(56,217,192,0.7)',
          borderColor: '#38d9c0',
          borderWidth: 1,
          borderRadius: 4,
        },
      ]
    },
    options: {
      ...chartDefaults,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const raw = ctx.raw != null ? Number(ctx.raw).toFixed(1) : 'N/A';
              return `${ctx.dataset.label}: ${raw}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks:{color:'#7a8ba8',font:{size:10}},
          grid:{color:dark},
          title:{display:true,text:'熱度速度',color:'#7a8ba8',font:{size:10}},
        },
        y: { ticks: { color:'#e2e8f5', font:{ size:11 } }, grid:{ color:'transparent' } }
      },
      maintainAspectRatio: false,
    }
  });
}

function buildTechTopicHeatmapChart(heatmap) {
  const el = document.getElementById('tech-heatmap-chart');
  if(!el || !heatmap || !Array.isArray(heatmap.topics) || heatmap.topics.length < 1) return;
  if(_charts.techHeatmap) {
    _charts.techHeatmap.destroy();
    delete _charts.techHeatmap;
  }
  const items = heatmap.topics
    .map(item => ({
      ...item,
      topic: String(item.topic || '').trim(),
    }))
    .filter(item => item.topic)
    .slice(0, 5);
  if(!items.length) return;

  const labels = items.map(item => item.topic);
  const scores = items.map(item => item.score != null ? Number(item.score) : 0);

  _charts.techHeatmap = new Chart(el, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Score',
          data: scores,
          backgroundColor: 'rgba(99,179,255,0.7)',
          borderColor: '#63b3ff',
          borderWidth: 1,
          borderRadius: 4,
        },
      ]
    },
    options: {
      ...chartDefaults,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const raw = ctx.raw != null ? Number(ctx.raw).toFixed(0) : 'N/A';
              return `${ctx.dataset.label}: ${raw}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks:{color:'#7a8ba8',font:{size:10}},
          grid:{color:dark},
          title:{display:true,text:'主題熱度',color:'#7a8ba8',font:{size:10}},
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
    ${collapsible ? `<div class="section-collapsed-hint">此區塊目前收合，點擊可查看完整內容。</div>` : ''}
  </div>`;
}

// ── Boot ──────────────────────────────────────────────────────────────────────
updateMarketStatus();
setInterval(updateMarketStatus, 60000);
loadIndex();
