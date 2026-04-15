const overviewGrid = document.getElementById("overview-grid");
const sectionsEl = document.getElementById("sections");
const warningsEl = document.getElementById("warnings");
const notificationEl = document.getElementById("notification");
const overallStateEl = document.getElementById("overall-state");
const generatedAtEl = document.getElementById("generated-at");
const refreshBtn = document.getElementById("refresh-btn");
const boardModeEl = document.getElementById("board-mode");
const sectionTemplate = document.getElementById("section-template");

function labelForState(state) {
  const normalized = String(state || "UNKNOWN").toUpperCase();
  if (normalized === "OK") return "正常";
  if (normalized === "WARNING") return "警示";
  if (normalized === "CRITICAL") return "嚴重";
  return normalized;
}

function stateClass(state) {
  const normalized = String(state || "").toUpperCase();
  if (normalized === "OK") return "ok";
  if (normalized === "WARNING") return "warning";
  return "critical";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderOverview(data) {
  const overview = data.overview || {};
  const detail = overview.detail || {};
  const metrics = [
    { label: "正常", value: detail.healthy ?? 0, note: "目前狀態良好的區塊數。" },
    { label: "警示", value: detail.warning ?? 0, note: "需要留意但尚未到嚴重的區塊。" },
    { label: "嚴重", value: detail.critical ?? 0, note: "需要立即處理的區塊。" },
    { label: "最後更新", value: "即時", note: data.generated_at ? `快照時間：${data.generated_at}` : "尚無時間戳記。" },
  ];
  overviewGrid.innerHTML = metrics.map((metric) => `
    <article class="metric">
      <div class="metric-label">${escapeHtml(metric.label)}</div>
      <div class="metric-value">${escapeHtml(metric.value)}</div>
      <div class="metric-note">${escapeHtml(metric.note)}</div>
    </article>
  `).join("");

  overallStateEl.textContent = labelForState(overview.severity || overview.state);
  overallStateEl.className = `meta-pill state-${stateClass(overview.severity || overview.state)}`;
  generatedAtEl.textContent = data.generated_at ? `產生於 ${data.generated_at}` : "產生於 --";
  boardModeEl.textContent = data.last_notification ? "即時 + 通知" : "即時";
}

function renderMetaRow(section) {
  const tags = [];
  if (section.source) tags.push(`<span class="meta-tag">來源：${escapeHtml(section.source)}</span>`);
  if (section.updated_at) tags.push(`<span class="meta-tag">更新：${escapeHtml(section.updated_at)}</span>`);
  if (section.counts) {
    const c = section.counts;
    tags.push(`<span class="meta-tag">正常 ${c.OK ?? 0} · 警示 ${c.WARNING ?? 0} · 嚴重 ${c.CRITICAL ?? 0}</span>`);
  }
  return tags.join("");
}

function parseSystemStatus(detail) {
  const lines = String(detail || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const title = lines.find((line) => line.startsWith("🤖")) || "系統健康監控";
  const timestamp = lines.find((line) => line.startsWith("━━ 檢查時間:")) || "";
  const groups = [];
  let currentGroup = null;

  const ensureGroup = (label) => {
    if (!currentGroup || currentGroup.label !== label) {
      currentGroup = { label, items: [] };
      groups.push(currentGroup);
    }
  };

  for (const line of lines) {
    if (line === title || line === timestamp) continue;

    if (line.includes("服務連線狀態")) {
      ensureGroup("服務連線狀態");
      continue;
    }
    if (line.includes("數據更新狀態")) {
      ensureGroup("數據更新狀態");
      continue;
    }

    const normalized = line.replace(/\*\*/g, "");
    const match = normalized.match(/^([🟢🟡🔴])\s+(.+?):\s*(.+)$/);
    if (match) {
      const [, emoji, label, value] = match;
      const state = emoji === "🟢" ? "OK" : emoji === "🟡" ? "WARNING" : "CRITICAL";
      ensureGroup(currentGroup?.label || "狀態卡片");
      currentGroup.items.push({ label: label.trim(), value: value.trim(), state });
    }
  }

  return { title, timestamp, groups };
}

function renderStatusReport(section) {
  const structured = Array.isArray(section.status_groups)
    ? {
        title: section.status_title || "系統健康監控",
        timestamp: section.status_timestamp || "",
        groups: section.status_groups,
        highlights: Array.isArray(section.status_highlights) ? section.status_highlights : [],
      }
    : parseSystemStatus(section.detail);

  const highlightHtml = structured.highlights.length > 0
    ? `<div class="highlight-list">
        ${structured.highlights.map((item) => `
          <div class="highlight-item">
            <div class="highlight-label">${escapeHtml(item.label)}</div>
            <span class="state-chip ${stateClass(item.state)}">${labelForState(item.state)}</span>
            <div class="highlight-value">${escapeHtml(item.value)}</div>
          </div>
        `).join("")}
      </div>`
    : "";

  const groupsHtml = structured.groups.map((group) => `
    <div class="status-group">
      <div class="status-group-title">${escapeHtml(group.label)}</div>
      ${
        Array.isArray(group.items) && group.items.length > 0
          ? `<div class="status-grid">
              ${group.items.map((item) => `
                <div class="status-card state-${stateClass(item.state)}">
                  <div class="status-card-label">${escapeHtml(item.label)}</div>
                  <div class="status-card-value">${escapeHtml(item.value)}</div>
                </div>
              `).join("")}
            </div>`
          : `<div class="empty-state">這個群組目前沒有可顯示的項目。</div>`
      }
    </div>
  `).join("");

  return `
    <div class="status-report">
      <div class="status-report-head">
        <div class="status-report-title">${escapeHtml(structured.title)}</div>
        ${structured.timestamp ? `<div class="status-report-time">${escapeHtml(structured.timestamp)}</div>` : ""}
      </div>
      ${highlightHtml}
      ${groupsHtml}
    </div>
  `;
}

function renderSectionBody(section) {
  const detail = section.detail;
  if (typeof detail === "string") {
    if (String(section.label || "").includes("/status")) {
      return renderStatusReport(section);
    }
    return `
      <details class="expandable-text" open>
        <summary>
          <span class="expandable-title">展開內容</span>
          <span class="expandable-hint">點擊查看完整內容</span>
        </summary>
        <pre class="text-block">${escapeHtml(detail)}</pre>
      </details>
    `;
  }
  if (Array.isArray(detail)) {
    if (!detail.length) {
      return `<div class="empty-state">這個區塊暫時沒有明細。</div>`;
    }
    // Groups of macro items (資料健康 format: [{label, items:[{label,symbol,last_date,severity}]}])
    if (detail[0] && Array.isArray(detail[0].items)) {
      return detail.map((group) => `
        <div class="status-group">
          <div class="status-group-title">${escapeHtml(group.label)}</div>
          ${group.items.length > 0
            ? `<div class="status-grid">
                ${group.items.map((item) => `
                  <div class="status-card state-${stateClass(item.severity)}">
                    <div class="status-card-label">${escapeHtml(item.label)}</div>
                    <div class="status-card-value">${escapeHtml(item.last_date || "n/a")}</div>
                  </div>
                `).join("")}
              </div>`
            : `<div class="empty-state">All healthy.</div>`
          }
        </div>
      `).join("");
    }
    return `<div class="section-list">${detail.map((item) => `
      <div class="row">
        <div>
          <strong>${escapeHtml(item.label || item.task_key || "Item")}</strong>
          <span>${escapeHtml(item.value ?? item.status ?? item.state ?? "n/a")}</span>
        </div>
        <div class="state-${stateClass(item.severity || item.state)}">${escapeHtml(labelForState(item.severity || item.state))}</div>
      </div>
    `).join("")}</div>`;
  }

  if (detail && typeof detail === "object") {
    const rows = Object.entries(detail).map(([key, value]) => `
      <div class="row">
        <div>
          <strong>${escapeHtml(key)}</strong>
          <span>${escapeHtml(typeof value === "object" ? JSON.stringify(value) : value)}</span>
        </div>
      </div>
    `).join("");
    return rows || `<div class="empty-state">暫時沒有可顯示的摘要列。</div>`;
  }

  return `<div class="empty-state">${escapeHtml(section.summary || "暫時沒有區塊明細。")}</div>`;
}

function renderSections(data) {
  const sections = data.sections || [];
  sectionsEl.innerHTML = "";
  for (const section of sections) {
    const fragment = sectionTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".section-card");
    const title = fragment.querySelector(".section-title");
    const summary = fragment.querySelector(".section-summary");
    const chip = fragment.querySelector(".state-chip");
    const metaRow = fragment.querySelector(".section-meta-row");
    const body = fragment.querySelector(".section-body");

    card.dataset.state = section.severity || section.state || "OK";
    title.textContent = section.label || section.key || "Section";
    summary.textContent = section.summary || "";
    summary.hidden = !section.summary;
    chip.textContent = labelForState(section.severity || section.state);
    chip.className = `state-chip ${stateClass(section.severity || section.state)}`;
    metaRow.innerHTML = renderMetaRow(section);
    body.innerHTML = renderSectionBody(section);
    sectionsEl.appendChild(fragment);
  }
}

function renderWarnings(data) {
  const warnings = data.recent_warnings || [];
  if (!warnings.length) {
    warningsEl.innerHTML = `<div class="empty-state">目前沒有警示。</div>`;
    return;
  }

  warningsEl.innerHTML = warnings.map((warning) => `
    <article class="warning-item">
      <div class="warning-title state-${stateClass(warning.state)}">${escapeHtml(warning.label || "Warning")}</div>
      <div class="warning-meta">${escapeHtml(warning.summary || "No summary available.")}</div>
      <div class="warning-meta">來源：${escapeHtml(warning.source || "n/a")}</div>
    </article>
  `).join("");
}

function renderNotification(data) {
  const notification = data.last_notification;
  if (!notification) {
    notificationEl.innerHTML = `<div class="empty-state">目前尚未送出重要通知。</div>`;
    return;
  }

  notificationEl.innerHTML = `
    <pre>${escapeHtml(JSON.stringify(notification, null, 2))}</pre>
  `;
}

async function loadBoard() {
  refreshBtn.disabled = true;
  boardModeEl.textContent = "更新中";
  try {
    const response = await fetch("/api/ops-control-board", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    const data = await response.json();
    renderOverview(data);
    renderSections(data);
    renderWarnings(data);
    renderNotification(data);
  } catch (error) {
    overviewGrid.innerHTML = `
      <article class="metric" style="grid-column: 1 / -1;">
        <div class="metric-label">控制板錯誤</div>
        <div class="metric-value">無法讀取</div>
        <div class="metric-note">${escapeHtml(error.message || error)}</div>
      </article>
    `;
    sectionsEl.innerHTML = `<div class="empty-state">無法載入控制板快照。</div>`;
    warningsEl.innerHTML = `<div class="empty-state">因控制板快照載入失敗，暫時無法顯示警示。</div>`;
    notificationEl.innerHTML = `<div class="empty-state">暫時無法顯示通知上下文。</div>`;
    overallStateEl.textContent = "嚴重";
    overallStateEl.className = "meta-pill state-critical";
    boardModeEl.textContent = "離線";
  } finally {
    refreshBtn.disabled = false;
  }
}

refreshBtn.addEventListener("click", loadBoard);
loadBoard();
