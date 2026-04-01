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
  if (normalized === "OK") return "OK";
  if (normalized === "WARNING") return "Warning";
  if (normalized === "CRITICAL") return "Critical";
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
    { label: "Healthy", value: detail.healthy ?? 0, note: "Sections in a healthy state." },
    { label: "Warning", value: detail.warning ?? 0, note: "Sections needing attention soon." },
    { label: "Critical", value: detail.critical ?? 0, note: "Sections requiring immediate action." },
    { label: "Last Update", value: "Live", note: data.generated_at ? `Snapshot: ${data.generated_at}` : "No timestamp available." },
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
  generatedAtEl.textContent = data.generated_at ? `Generated at ${data.generated_at}` : "Generated at --";
  boardModeEl.textContent = data.last_notification ? "Live + Alerts" : "Live";
}

function renderMetaRow(section) {
  const tags = [];
  if (section.source) tags.push(`<span class="meta-tag">Source: ${escapeHtml(section.source)}</span>`);
  if (section.updated_at) tags.push(`<span class="meta-tag">Updated: ${escapeHtml(section.updated_at)}</span>`);
  if (section.counts) {
    const c = section.counts;
    tags.push(`<span class="meta-tag">OK ${c.OK ?? 0} · Warn ${c.WARNING ?? 0} · Crit ${c.CRITICAL ?? 0}</span>`);
  }
  return tags.join("");
}

function renderSectionBody(section) {
  const detail = section.detail;
  if (Array.isArray(detail)) {
    if (!detail.length) {
      return `<div class="empty-state">No detailed items are available for this section.</div>`;
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
    return rows || `<div class="empty-state">No summary rows available.</div>`;
  }

  return `<div class="empty-state">${escapeHtml(section.summary || "No section detail available.")}</div>`;
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
    summary.textContent = section.summary || "No summary available.";
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
    warningsEl.innerHTML = `<div class="empty-state">No warnings captured yet.</div>`;
    return;
  }

  warningsEl.innerHTML = warnings.map((warning) => `
    <article class="warning-item">
      <div class="warning-title state-${stateClass(warning.state)}">${escapeHtml(warning.label || "Warning")}</div>
      <div class="warning-meta">${escapeHtml(warning.summary || "No summary available.")}</div>
      <div class="warning-meta">Source: ${escapeHtml(warning.source || "n/a")}</div>
    </article>
  `).join("");
}

function renderNotification(data) {
  const notification = data.last_notification;
  if (!notification) {
    notificationEl.innerHTML = `<div class="empty-state">No critical notification has been sent yet.</div>`;
    return;
  }

  notificationEl.innerHTML = `
    <pre>${escapeHtml(JSON.stringify(notification, null, 2))}</pre>
  `;
}

async function loadBoard() {
  refreshBtn.disabled = true;
  boardModeEl.textContent = "Refreshing";
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
        <div class="metric-label">Board Error</div>
        <div class="metric-value">Unavailable</div>
        <div class="metric-note">${escapeHtml(error.message || error)}</div>
      </article>
    `;
    sectionsEl.innerHTML = `<div class="empty-state">Failed to load the control board snapshot.</div>`;
    warningsEl.innerHTML = `<div class="empty-state">Warnings unavailable because the board snapshot could not load.</div>`;
    notificationEl.innerHTML = `<div class="empty-state">Notification context unavailable.</div>`;
    overallStateEl.textContent = "Critical";
    overallStateEl.className = "meta-pill state-critical";
    boardModeEl.textContent = "Offline";
  } finally {
    refreshBtn.disabled = false;
  }
}

refreshBtn.addEventListener("click", loadBoard);
loadBoard();
setInterval(loadBoard, 60000);
