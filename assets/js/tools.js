const STATUS = {
  preparing: "준비 중",
  public: "공개",
  private: "비공개",
};

function isLoggedIn() {
  return Boolean(window.LabAuth && window.LabAuth.session && window.LabAuth.session.user);
}

function renderTool(tool) {
  const ready = Boolean(tool.url);
  const memberOnly = tool.member_only !== false;
  const loggedIn = isLoggedIn();
  const features = (tool.features || []).map((item) => `<li>${item}</li>`).join("");
  let action = `<span class="btn disabled" aria-disabled="true">실행 URL 준비 중</span>`;
  if (memberOnly && !loggedIn) {
    action =
      `<p class="field-hint">로그인 후 이용할 수 있습니다.</p>` +
      `<a class="btn" href="login.html?next=tools.html">로그인</a>`;
  } else if (ready && loggedIn) {
    action = `<a class="btn" href="${tool.url}" target="_blank" rel="noopener">실행하기</a>`;
  }
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

function bootTools() {
  loadTools();
  document.addEventListener("lab-auth-changed", loadTools);
}

if (window.LabAuth && window.LabAuth.ready) {
  window.LabAuth.ready.then(bootTools);
} else {
  bootTools();
}
