const STATUS = {
  preparing: "준비 중",
  public: "공개",
  private: "비공개",
};

function renderTool(tool) {
  const ready = tool.status === "public" && tool.url;
  const features = (tool.features || []).map((item) => `<li>${item}</li>`).join("");
  const action = ready
    ? `<a class="btn" href="${tool.url}" target="_blank" rel="noopener">실행하기</a>`
    : `<span class="btn disabled" aria-disabled="true">실행 URL 준비 중</span>`;
  return `
    <article class="tool" id="${tool.id}">
      <div class="tool-head">
        <div>
          <h3>${tool.name}</h3>
          <div class="meta">버전 ${tool.version}</div>
        </div>
        <span class="badge ${tool.status}">${STATUS[tool.status] || tool.status}</span>
      </div>
      <p>${tool.summary || ""}</p>
      <ul class="features">${features}</ul>
      <div class="guide">${tool.guide || ""}</div>
      ${action}
    </article>
  `;
}

async function loadTools() {
  const root = document.querySelector("[data-tools]");
  if (!root) return;
  const res = await fetch("data/tools.json");
  const data = await res.json();
  root.innerHTML = (data.tools || []).map(renderTool).join("");
}

loadTools();
