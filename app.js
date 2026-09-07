function renderResult({
  plan,
  headSummary,
  specialistResults,
  finalReport,
}) {
  const planHtml = Array.isArray(plan) && plan.length
    ? `
      <h3>Head Agent's plan</h3>
      <ul class="plan-list">
        ${plan.map((step) => `
          <li class="plan-item">
            <span class="plan-agent">
              ${escapeHtml(step.agent || "Unassigned")}
            </span>
            <span>
              ${escapeHtml(step.task || "")}
            </span>
          </li>
        `).join("")}
      </ul>
    `
    : "";

  const summaryHtml = headSummary
    ? `
      <h3>Head Agent's summary</h3>
      <p>
        ${escapeHtml(headSummary).replace(/\n+/g, "</p><p>")}
      </p>
    `
    : "";

  const specialistHtml =
    Array.isArray(specialistResults) &&
    specialistResults.length
      ? `
        <h3>Specialist Agent Results</h3>

        <div class="specialist-results">
          ${specialistResults.map((item) => `
            <div class="specialist-result">
              <strong>${escapeHtml(item.agent)}</strong>
              <p>${escapeHtml(item.result || "")}</p>
            </div>
          `).join("")}
        </div>
      `
      : "";

  const finalHtml = finalReport
    ? `
      <h3>Final SEO Report</h3>
      <div class="final-report">
        ${escapeHtml(finalReport).replace(/\n+/g, "<br><br>")}
      </div>
    `
    : "";

  const output =
    planHtml +
    summaryHtml +
    specialistHtml +
    finalHtml;

  resultBody.innerHTML =
    output ||
    `<p class="result-empty">
      The SEO Agent returned no content.
    </p>`;
}
