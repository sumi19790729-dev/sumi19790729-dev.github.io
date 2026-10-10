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
    return siteOrigin() + "/login.html";
  }

  function friendlyError(error) {
    var raw = (error && (error.message || error.error_description || error.msg)) || "";
    var text = String(raw).toLowerCase();
    if (!raw) return "처리 중 오류가 났습니다. 잠시 후 다시 시도해 주세요.";
    if (text.indexOf("failed to fetch") !== -1 || text.indexOf("network") !== -1) {
      return "서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.";
    }
    if (text.indexOf("invalid login credentials") !== -1) {
      return "이메일 또는 비밀번호가 올바르지 않습니다.";
    }
    if (text.indexOf("email not confirmed") !== -1) {
      return "이메일 인증을 완료한 뒤 로그인해 주세요. 받은편지함과 스팸함을 확인해 주세요.";
    }
    if (text.indexOf("already registered") !== -1 || text.indexOf("already been registered") !== -1) {
      return "이미 가입된 이메일입니다. 로그인해 주세요.";
    }
    if (text.indexOf("password") !== -1 && text.indexOf("least") !== -1) {
      return "비밀번호는 6자 이상이어야 합니다.";
    }
    if (text.indexOf("invalid email") !== -1) {
      return "이메일 형식이 올바르지 않습니다.";
    }
    if (text.indexOf("signup is disabled") !== -1) {
      return "현재 회원가입이 열려 있지 않습니다.";
    }
    if (text.indexOf("rate limit") !== -1 || text.indexOf("too many") !== -1) {
      return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
    }
    if (text.indexOf("user already exists") !== -1) {
      return "이미 가입된 이메일입니다. 로그인해 주세요.";
    }
    return raw;
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

  async function handleSignup(event) {
    event.preventDefault();
    var form = event.target;
    var status = form.querySelector("[data-auth-status]");
    var button = form.querySelector("[type=submit]");
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

    button.disabled = true;
    showStatus(status, "가입을 처리하고 있습니다…", "");
    var result = await sb.auth.signUp({
      email: email,
      password: password,
      options: {
        emailRedirectTo: emailRedirectTo(),
        data: pending
      }
    });
    button.disabled = false;

    if (result.error) {
      showStatus(status, friendlyError(result.error), "error");
      return;
    }

    if (result.data.session && result.data.user) {
      var profile = await ensureProfile(result.data.user);
      if (profile.error) {
        showStatus(status, "가입은 되었지만 회원정보 저장에 실패했습니다. " + friendlyError(profile.error), "error");
        return;
      }
      showStatus(status, "회원가입이 완료되었습니다.", "ok");
      location.href = safeNext();
      return;
    }

    showStatus(
      status,
      "인증 메일을 보냈습니다. 메일함의 링크를 누르면 가입이 완료됩니다. 스팸함도 확인해 주세요.",
      "ok"
    );
    form.reset();
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
    showConfigNotice();
    bindForms();
    renderAuthSlot(null);
    publishSession(null);

    var sb = getClient();
    if (!sb) return;

    var current = await sb.auth.getSession();
    if (current.data && current.data.session) {
      await ensureProfile(current.data.session.user);
      renderAuthSlot(current.data.session);
      publishSession(current.data.session);
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
