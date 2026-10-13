(function (global) {
  var PENDING_KEY = "arl_pending_profile";
  var client = null;

  function config() {
    return global.SUPABASE_CONFIG || {};
  }

  function hasConfig() {
    var cfg = config();
    return Boolean(cfg.url && cfg.anonKey);
  }

  function siteOrigin() {
    if (location.protocol === "file:") {
      return "https://sumi19790729-dev.github.io";
    }
    return location.origin;
  }

  function emailRedirectTo() {
    return siteOrigin() + "/";
  }

  function statusApi() {
    return global.AuthStatus || null;
  }

  function friendlyError(error) {
    var api = statusApi();
    if (api) return api.classifyAuthError(error).message;
    var raw = (error && (error.message || error.error_description || error.msg)) || "";
    return raw || "처리 중 오류가 났습니다. 잠시 후 다시 시도해 주세요.";
  }

  function showBanner(message, kind) {
    var main = document.querySelector("main");
    if (!main || !message) return;
    var el = document.querySelector("[data-auth-banner]");
    if (!el) {
      var section = document.createElement("section");
      var wrap = document.createElement("div");
      wrap.className = "wrap";
      el = document.createElement("p");
      el.setAttribute("data-auth-banner", "");
      wrap.appendChild(el);
      section.appendChild(wrap);
      main.insertBefore(section, main.firstChild);
    }
    el.hidden = false;
    el.className = "form-status " + (kind === "ok" || kind === "pending" ? kind : "error");
    el.textContent = message;
  }

  function showStatus(el, message, kind) {
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || "";
    el.className = "form-status" + (kind ? " " + kind : "");
  }

  function savePendingProfile(profile) {
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(profile));
    } catch (err) {
      /* ignore quota */
    }
  }

  function readPendingProfile() {
    try {
      var raw = sessionStorage.getItem(PENDING_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function clearPendingProfile() {
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch (err) {
      /* ignore */
    }
  }

  function getClient() {
    if (client) return client;
    if (!hasConfig()) return null;
    if (!global.supabase || !global.supabase.createClient) return null;
    var cfg = config();
    client = global.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage
      }
    });
    return client;
  }

  function profileFieldsFromUser(user) {
    var meta = (user && user.user_metadata) || {};
    var pending = readPendingProfile() || {};
    return {
      id: user.id,
      email: user.email,
      full_name: meta.full_name || pending.full_name || "",
      organization: meta.organization || pending.organization || "",
      work_field: meta.work_field || pending.work_field || "",
      privacy_agreed_at: meta.privacy_agreed_at || pending.privacy_agreed_at || ""
    };
  }

  async function ensureProfile(user) {
    var sb = getClient();
    if (!sb || !user || !global.MemberWrites) {
      return { error: { message: "회원 저장 준비를 확인하지 못했습니다." } };
    }

    var existing = await sb.from("profiles").select("id").eq("id", user.id).maybeSingle();
    if (existing.error && existing.error.code !== "PGRST116") {
      return existing;
    }
    if (existing.data) {
      clearPendingProfile();
      return { data: existing.data, error: null };
    }

    var fields = profileFieldsFromUser(user);
    if (!fields.full_name || !fields.organization || !fields.work_field || !fields.privacy_agreed_at) {
      return { error: { message: "이름, 소속기관, 업무분야, 개인정보 동의가 없습니다. 회원가입을 다시 진행해 주세요." } };
    }

    var inserted = await global.MemberWrites.insertOwnProfile(sb, fields);
    if (inserted.error && /duplicate|unique/i.test(inserted.error.message || "")) {
      clearPendingProfile();
      return { data: { id: user.id }, error: null };
    }
    if (!inserted.error) clearPendingProfile();
    return inserted;
  }

  function renderAuthSlot(session) {
    document.querySelectorAll("[data-auth-slot]").forEach(function (slot) {
      if (!hasConfig()) {
        slot.innerHTML = '<a href="signup.html">회원가입</a><a href="login.html">로그인</a>';
        return;
      }
      if (!session || !session.user) {
        slot.innerHTML = '<a href="signup.html">회원가입</a><a href="login.html">로그인</a>';
        return;
      }
      var label = session.user.email || "회원";
      slot.innerHTML =
        '<span class="auth-user" title="' + label.replace(/"/g, "") + '">' + label + "</span>" +
        '<button type="button" class="auth-logout" data-logout>로그아웃</button>';
    });
  }

  async function handleLogout(event) {
    var target = event.target;
    if (!target || !target.closest("[data-logout]")) return;
    event.preventDefault();
    var sb = getClient();
    if (sb) await sb.auth.signOut();
    renderAuthSlot(null);
    if (/login|signup|account/i.test(location.pathname)) {
      location.href = "index.html";
    }
  }

  function beginSubmit(form) {
    if (form.dataset.authBusy === "1") return null;
    form.dataset.authBusy = "1";
    var button = form.querySelector("[type=submit]");
    if (button) button.disabled = true;
    return button;
  }

  function endSubmit(form, button) {
    form.dataset.authBusy = "";
    if (button) button.disabled = false;
  }

  async function handleSignup(event) {
    event.preventDefault();
    var form = event.target;
    var button = beginSubmit(form);
    if (!button && form.dataset.authBusy === "1") return;
    var status = form.querySelector("[data-auth-status]");
    try {
      await submitSignup(form, status, button);
    } finally {
      endSubmit(form, button);
    }
  }

  async function submitSignup(form, status, button) {
    var email = (form.email.value || "").trim();
    var password = form.password.value || "";
    var passwordConfirm = form.password_confirm.value || "";
    var fullName = (form.full_name.value || "").trim();
    var organization = (form.organization.value || "").trim();
    var workField = (form.work_field.value || "").trim();
    var privacy = form.privacy && form.privacy.checked;

    if (!hasConfig()) {
      showStatus(status, "Supabase 설정이 없습니다. Project URL과 publishable key를 넣어 주세요.", "error");
      return;
    }
    if (!email || !password || !fullName || !organization || !workField) {
      showStatus(status, "필수 항목을 모두 입력해 주세요.", "error");
      return;
    }
    if (password.length < 6) {
      showStatus(status, "비밀번호는 6자 이상이어야 합니다.", "error");
      return;
    }
    if (password !== passwordConfirm) {
      showStatus(status, "비밀번호 확인이 일치하지 않습니다.", "error");
      return;
    }
    if (!privacy) {
      showStatus(status, "개인정보 수집·이용에 동의해 주세요.", "error");
      return;
    }

    var sb = getClient();
    if (!sb) {
      showStatus(status, "인증 클라이언트를 만들지 못했습니다.", "error");
      return;
    }

    var privacyAgreedAt = new Date().toISOString();
    var pending = {
      full_name: fullName,
      organization: organization,
      work_field: workField,
      privacy_agreed_at: privacyAgreedAt
    };
    savePendingProfile(pending);

    showStatus(status, "가입을 처리하고 있습니다…", "");
    var result = await sb.auth.signUp({
      email: email,
      password: password,
      options: {
        emailRedirectTo: emailRedirectTo(),
        data: pending
      }
    });

    if (result.error) {
      var classified = statusApi() ? statusApi().classifyAuthError(result.error) : { kind: "error", message: friendlyError(result.error) };
      showStatus(status, classified.message, classified.kind === "pending" ? "pending" : "error");
      return;
    }

    var outcome = statusApi()
      ? statusApi().classifySignupResult(result.data || {})
      : { kind: "error", message: "가입 결과를 확인하지 못했습니다. 가입이 완료되지 않았습니다." };

    if (outcome.kind === "ok" && result.data.session && result.data.user) {
      var profile = await ensureProfile(result.data.user);
      if (profile.error) {
        showStatus(status, "로그인은 되었지만 회원정보 저장에 실패했습니다. " + friendlyError(profile.error), "error");
        return;
      }
      showStatus(status, outcome.message, "ok");
      location.href = safeNext();
      return;
    }

    showStatus(status, outcome.message, outcome.kind === "ok" || outcome.kind === "pending" ? outcome.kind : "error");
    if (outcome.kind === "pending") form.reset();
  }

  async function handleLogin(event) {
    event.preventDefault();
    var form = event.target;
    var status = form.querySelector("[data-auth-status]");
    var button = form.querySelector("[type=submit]");
    var email = (form.email.value || "").trim();
    var password = form.password.value || "";

    if (!hasConfig()) {
      showStatus(status, "Supabase 설정이 없습니다. Project URL과 publishable key를 넣어 주세요.", "error");
      return;
    }
    if (!email || !password) {
      showStatus(status, "이메일과 비밀번호를 입력해 주세요.", "error");
      return;
    }

    var sb = getClient();
    if (!sb) {
      showStatus(status, "인증 클라이언트를 만들지 못했습니다.", "error");
      return;
    }

    button.disabled = true;
    showStatus(status, "로그인하고 있습니다…", "");
    var result = await sb.auth.signInWithPassword({ email: email, password: password });
    button.disabled = false;

    if (result.error) {
      showStatus(status, friendlyError(result.error), "error");
      return;
    }

    var profile = await ensureProfile(result.data.user);
    if (profile.error) {
      showStatus(status, "로그인은 되었지만 회원정보를 확인하지 못했습니다. " + friendlyError(profile.error), "error");
      return;
    }

    location.href = safeNext();
  }

  function safeNext() {
    var next = new URLSearchParams(location.search).get("next") || "";
    if (/^[a-z0-9._-]+\.html$/i.test(next)) return next;
    return "index.html";
  }

  async function openWorkshop(url) {
    if (!url) return;
    if (!global.LabAuth || !global.LabAuth.session || !global.LabAuth.session.user) {
      location.href = "login.html?next=tools.html";
      return;
    }
    window.open(url, "_blank", "noopener");
  }

  function bindForms() {
    var signup = document.querySelector("[data-auth-form=signup]");
    var login = document.querySelector("[data-auth-form=login]");
    if (signup) signup.addEventListener("submit", handleSignup);
    if (login) login.addEventListener("submit", handleLogin);
    document.addEventListener("click", handleLogout);
  }

  function showConfigNotice() {
    var el = document.querySelector("[data-config-notice]");
    if (!el) return;
    el.hidden = hasConfig();
  }

  function publishSession(session) {
    global.LabAuth.session = session || null;
    document.dispatchEvent(new CustomEvent("lab-auth-changed"));
  }

  async function start() {
    var callback = statusApi() ? statusApi().readAuthCallback(location.hash, location.search) : null;
    var callbackNote = statusApi() ? statusApi().callbackMessage(callback) : null;
    showConfigNotice();
    bindForms();
    renderAuthSlot(null);
    publishSession(null);

    var sb = getClient();
    if (!sb) {
      if (callbackNote) showBanner(callbackNote.message, callbackNote.kind);
      return;
    }

    var current = await sb.auth.getSession();
    if (current.data && current.data.session) {
      var ensured = await ensureProfile(current.data.session.user);
      renderAuthSlot(current.data.session);
      publishSession(current.data.session);
      if (callbackNote && callbackNote.kind === "ok") {
        if (ensured && ensured.error) {
          showBanner("로그인은 되었지만 회원정보 저장에 실패했습니다. " + friendlyError(ensured.error), "error");
        } else {
          showBanner(callbackNote.message, "ok");
        }
      }
    } else if (callback && callback.type === "signup" && !(callbackNote && callbackNote.kind === "error")) {
      showBanner("이메일 인증 링크를 처리하지 못했습니다. 로그인되지 않았습니다. 메일의 링크를 다시 눌러 주세요.", "error");
    }
    if (callbackNote && callbackNote.kind === "error") {
      showBanner(callbackNote.message, "error");
    }

    sb.auth.onAuthStateChange(function (event, session) {
      renderAuthSlot(session);
      publishSession(session);
      if (session && session.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "USER_UPDATED")) {
        ensureProfile(session.user);
      }
    });
  }

  var readyResolve;
  global.LabAuth = {
    session: null,
    getClient: getClient,
    openWorkshop: openWorkshop,
    ready: new Promise(function (resolve) {
      readyResolve = resolve;
    })
  };

  function finishStart() {
    return start().then(function () {
      readyResolve();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", finishStart);
  } else {
    finishStart();
  }
})(window);
