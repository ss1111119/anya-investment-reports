const state = { status: null };

    async function fetchJson(url, options) {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    }

    function fmtScore(scores) {
      if (!scores) return '-';
      return `H ${scores.hybrid.toFixed(2)} / S ${scores.semantic.toFixed(2)} / L ${scores.lexical.toFixed(2)}`;
    }

    function renderList(container, items, emptyText) {
      if (!items || !items.length) {
        container.innerHTML = `<div class="muted">${emptyText}</div>`;
        return;
      }
      container.innerHTML = items.map(item => `
        <div class="item">
          <div class="top">
            <strong>${item.title || item.item_type || 'Item'}</strong>
            <span class="pill">${item.source_kind || item.source || 'item'}</span>
          </div>
          <div class="muted">${item.symbol || ''} ${item.body || item.summary || ''}</div>
          <div class="muted" style="margin-top:8px;font-size:12px;">${fmtScore(item.scores)} ${item.created_at || ''}</div>
        </div>
      `).join('');
    }

    async function loadStatus() {
      try {
        const data = await fetchJson('/api/intelligence/status');
        state.status = data;
        document.getElementById('status-json').textContent = JSON.stringify(data, null, 2);
        document.getElementById('status-pill').textContent = data.ok ? 'Online' : 'Degraded';
        document.getElementById('metric-items').textContent = data.store?.item_count ?? 0;
        document.getElementById('metric-embedding').textContent = data.embedding?.available ? data.embedding.mode : 'fallback';
        document.getElementById('metric-decisions').textContent = data.decision_records?.sample_size ?? 0;
      } catch (err) {
        document.getElementById('status-pill').textContent = 'Error';
        document.getElementById('status-json').textContent = `Status load failed: ${err.message}`;
      }
    }

    async function runRecall() {
      const q = document.getElementById('query').value.trim();
      const mode = document.getElementById('mode').value;
      if (!q) return;
      try {
        const data = await fetchJson(`/api/intelligence/recall?q=${encodeURIComponent(q)}&mode=${encodeURIComponent(mode)}`);
        renderList(document.getElementById('recall-result'), data.results, 'No recall results yet.');
      } catch (err) {
        document.getElementById('recall-result').innerHTML = `<div class="muted">Recall load failed: ${err.message}</div>`;
      }
    }

    async function loadReflection() {
      try {
        const data = await fetchJson('/api/intelligence/reflection');
        document.getElementById('reflection-text').textContent = `${data.summary}\n\n${JSON.stringify(data.patterns, null, 2)}`;
      } catch (err) {
        document.getElementById('reflection-text').textContent = `Reflection load failed: ${err.message}`;
      }
    }

    async function loadRecent() {
      try {
        const data = await fetchJson('/api/intelligence/records');
        renderList(document.getElementById('recent-list'), data.records, 'No records yet.');
      } catch (err) {
        document.getElementById('recent-list').innerHTML = `<div class="muted">Recent records load failed: ${err.message}</div>`;
      }
    }

    loadStatus();
    loadReflection();
    loadRecent();