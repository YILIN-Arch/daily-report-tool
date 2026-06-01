const app = document.querySelector("#app");

const state = {
  report: null,
  loading: true,
  error: "",
};

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function init() {
  try {
    const response = await fetch("/data/report.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load report (${response.status}).`);
    state.report = await response.json();
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    render();
  }
}

function renderLoading() {
  app.innerHTML = `
    <main class="boot-screen">
      <p class="eyebrow">Morning Meeting Report</p>
      <h1>Loading report</h1>
    </main>
  `;
}

function renderError() {
  app.innerHTML = `
    <main class="boot-screen">
      <section class="notice warning">
        <p class="eyebrow">Report unavailable</p>
        <h1>Unable to load report</h1>
        <p>${escapeHtml(state.error)}</p>
      </section>
    </main>
  `;
}

function renderMetricGrid(metrics) {
  return `
    <div class="metric-grid">
      ${metrics
        .map(
          (metric) => `
            <div class="metric-card">
              <span>${escapeHtml(metric.label)}</span>
              <strong>${escapeHtml(metric.value)}</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function progressValue(metrics) {
  const progress = metrics?.find((metric) => metric.label === "Progress")?.value || "";
  const match = progress.match(/[0-9.]+/);
  return match ? Math.min(100, Number(match[0])) : 0;
}

function renderProgressBar(metrics) {
  const value = progressValue(metrics);
  if (!value) return "";
  return `
    <div class="progress-track" aria-label="Progress ${value}%">
      <span style="width: ${value}%"></span>
    </div>
  `;
}

function renderChecklist(items) {
  return `
    <div class="checklist">
      ${items
        .map(
          (item) => `
            <div class="check-item ${item.checked ? "is-complete" : ""}">
              <span class="check-box">${item.checked ? "✓" : ""}</span>
              <div>
                <strong>${escapeHtml(item.label)}</strong>
                ${item.status ? `<span>${escapeHtml(item.status)}</span>` : ""}
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderTable(rows) {
  return `
    <div class="report-table" role="table">
      <div class="table-row table-head" role="row">
        <span role="columnheader">Works</span>
        <span role="columnheader">Status</span>
      </div>
      ${rows
        .map(
          (row) => `
            <div class="table-row" role="row">
              <span role="cell">${escapeHtml(row.works)}</span>
              <span role="cell">${row.status ? escapeHtml(row.status) : '<span class="muted">blank / no status</span>'}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderSectionContent(section) {
  if (section.metrics) {
    return `${renderMetricGrid(section.metrics)}${renderProgressBar(section.metrics)}`;
  }

  if (section.checklist) {
    return renderChecklist(section.checklist);
  }

  if (section.table) {
    return renderTable(section.table);
  }

  return "";
}

function renderReport() {
  const report = state.report;
  const header = report.report_header;

  app.innerHTML = `
    <header class="top-nav">
      <a class="brand" href="#" aria-label="Morning Meeting Report home">
        <span class="brand-mark"></span>
        <span>Morning Meeting Report</span>
      </a>
      <div class="nav-actions">
        <span class="public-pill">Public view</span>
      </div>
    </header>

    <main class="page-shell">
      <section class="report-hero">
        <p class="eyebrow">${escapeHtml(header.scope)}</p>
        <h1>${escapeHtml(header.title)}</h1>
        <p>${escapeHtml(header.subject)}</p>
        <div class="report-meta">
          <span>${escapeHtml(header.reporter)}</span>
          <span>${escapeHtml(header.date)}</span>
          <span>${escapeHtml(report.sourceFile)}</span>
        </div>
      </section>

      <section class="section-grid" aria-label="Morning meeting report sections">
        ${report.sections
          .map(
            (section) => `
              <article class="report-section" id="${escapeHtml(section.section_key)}">
                <div class="section-heading">
                  <div>
                    <p class="eyebrow">Slide ${escapeHtml(section.source_slide)}</p>
                    <h2>${escapeHtml(section.title)}</h2>
                    ${section.subtitle ? `<p>${escapeHtml(section.subtitle)}</p>` : ""}
                  </div>
                </div>
                ${renderSectionContent(section)}
              </article>
            `,
          )
          .join("")}
      </section>
    </main>
  `;
}

function render() {
  if (state.loading) {
    renderLoading();
    return;
  }

  if (state.error || !state.report) {
    renderError();
    return;
  }

  renderReport();
}

init();
