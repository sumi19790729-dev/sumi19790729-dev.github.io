(function (global) {
  var PUBLIC_ACCOUNT = "https://sumi19790729-dev.github.io/account.html";

  function providerEnabled(settings) {
    return !!(settings && settings.external && settings.external.google === true);
  }

  async function fetchProviderEnabled(url, anonKey, fetchImpl) {
    if (!url || !anonKey) return false;
    var fetcher = fetchImpl || global.fetch;
    if (!fetcher) return false;
    var response = await fetcher(String(url).replace(/\/$/, "") + "/auth/v1/settings", {
      headers: {
        apikey: anonKey,
        Authorization: "Bearer " + anonKey
      }
    });
    if (!response.ok) return false;
    return providerEnabled(await response.json());
  }

  function oauthArgs() {
    return {
      provider: "google",
      options: {
        redirectTo: PUBLIC_ACCOUNT,
        queryParams: { prompt: "select_account" }
      }
    };
  }

  function profileComplete(row) {
    return !!(
      row &&
      String(row.full_name || "").trim() &&
      String(row.organization || "").trim() &&
      String(row.work_field || "").trim() &&
      row.privacy_agreed_at
    );
  }

  function completionPayload(user, fields) {
    var fullName = String(fields && fields.full_name || "").trim();
    var organization = String(fields && fields.organization || "").trim();
    var workField = String(fields && fields.work_field || "").trim();
    var agreedAt = fields && fields.privacy_agreed_at;
    if (!user || !user.id || !user.email || !fullName || !organization || !workField || !agreedAt) {
      throw new Error("profile fields are incomplete");
    }
    return {
      id: user.id,
      email: user.email,
      full_name: fullName,
      organization: organization,
      work_field: workField,
      privacy_agreed_at: agreedAt
    };
  }

  function accountModel(input) {
    var signedIn = !!(input && input.signedIn);
    var googleOn = !!(input && input.googleEnabled);
    var complete = !!(input && input.profileComplete);
    return {
      showContinue: !signedIn && googleOn,
      showProfileForm: signedIn && !complete,
      keepExistingProfile: signedIn && complete,
      userId: signedIn ? String(input.userId || "") : "",
      adminKnown: signedIn && (input.isAdmin === true || input.isAdmin === false),
      isAdmin: input && input.isAdmin === true
    };
  }

  function fillSlot(slot, enabled) {
    if (!slot) return;
    slot.innerHTML = "";
    if (!enabled) {
      slot.hidden = true;
      return;
    }
    slot.hidden = false;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-google";
    button.setAttribute("data-google-continue", "");
    button.textContent = "Google 계정으로 계속하기";
    var note = document.createElement("p");
    note.className = "field-hint";
    note.textContent = "새 Google 계정으로 가입합니다. 기존 이메일 계정에 연결하지 않으며, 운영자 권한은 이 화면에서 생기지 않습니다. 이어서 이름·소속기관·업무분야와 개인정보 동의를 마칩니다.";
    slot.appendChild(button);
    slot.appendChild(note);
  }

  function textLine(parent, className, text) {
    var p = document.createElement("p");
    if (className) p.className = className;
    p.textContent = text;
    parent.appendChild(p);
    return p;
  }

  function renderAccount(root, model, email) {
    root.innerHTML = "";
    if (!model.userId) {
      textLine(root, "", "Google로 가입하면 새 사용자가 만들어집니다. 기존 계정에 연결하지 않고, 기존 계정과 게시물은 이 화면에서 지우지 않습니다.");
      if (model.showContinue) {
        var slot = document.createElement("div");
        slot.className = "google-slot";
        fillSlot(slot, true);
        root.appendChild(slot);
      } else {
        textLine(root, "field-hint", "Google 제공자 설정이 끝나기 전에는 가입 버튼을 두지 않습니다. 이메일 로그인과 이메일 가입은 그대로입니다.");
      }
      var login = document.createElement("a");
      login.href = "login.html?next=account.html";
      login.className = "btn";
      login.textContent = "이메일로 로그인";
      root.appendChild(login);
      return;
    }

    textLine(root, "", "로그인한 계정의 사용자 ID는 " + model.userId + "입니다. 운영자 권한은 데이터베이스 관리자만 이 ID에 지정할 수 있습니다.");
    if (email) textLine(root, "field-hint", "로그인 이메일: " + email);
    if (model.adminKnown) {
      textLine(root, "", model.isAdmin ? "운영자 권한이 있는 계정입니다." : "일반 회원 계정입니다. 이 화면에는 운영자 권한 부여 버튼이 없습니다.");
    }
    if (model.keepExistingProfile) {
      textLine(root, "field-hint", "이미 저장된 이름, 소속, 업무분야, 개인정보 동의는 유지합니다.");
    }
    if (model.showProfileForm) {
      var form = document.createElement("form");
      form.className = "auth-form card";
      form.setAttribute("data-profile-form", "");
      form.noValidate = true;
      form.innerHTML =
        "<h2>회원정보</h2>" +
        "<label for=\"full_name\">이름</label><input id=\"full_name\" name=\"full_name\" type=\"text\" autocomplete=\"name\" required>" +
        "<label for=\"organization\">소속기관</label><input id=\"organization\" name=\"organization\" type=\"text\" autocomplete=\"organization\" required>" +
        "<label for=\"work_field\">업무분야</label><input id=\"work_field\" name=\"work_field\" type=\"text\" required>" +
        "<label class=\"consent\"><input id=\"privacy\" name=\"privacy\" type=\"checkbox\" required><span>이름, 이메일, 소속기관, 업무분야를 회원 관리와 안내용으로 수집·이용하는 데 동의합니다. 결제 정보는 받지 않습니다.</span></label>" +
        "<p class=\"form-status\" data-profile-status hidden></p>" +
        "<button class=\"btn\" type=\"submit\">동의하고 회원정보 저장</button>";
      root.appendChild(form);
    }
    if (model.userId && !model.showProfileForm) {
      textLine(root, "field-hint", "권한 변경은 Supabase SQL Editor의 postgres 역할로만 실행합니다. 기존 계정의 운영자 권한은 새 계정의 운영 기능을 확인한 뒤에 해제합니다.");
    }
    var status = document.createElement("p");
    status.className = "form-status";
    status.setAttribute("data-google-status", "");
    status.hidden = true;
    root.appendChild(status);
  }

  function showStatus(selector, message, kind) {
    var el = document.querySelector(selector);
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || "";
    el.className = "form-status" + (kind ? " " + kind : "");
  }

  async function mount(options) {
    var client = options && options.client;
    var session = options && options.session;
    var cfg = global.SUPABASE_CONFIG || {};
    var enabled = false;
    try {
      enabled = await fetchProviderEnabled(cfg.url, cfg.anonKey);
    } catch (err) {
      enabled = false;
    }
    document.querySelectorAll("[data-google-slot]").forEach(function (slot) {
      fillSlot(slot, enabled);
    });

    var root = document.querySelector("[data-account-root]");
    var user = session && session.user;
    var model = accountModel({
      signedIn: false,
      googleEnabled: enabled,
      profileComplete: false
    });
    if (root && client && user) {
      var refreshed = await client.auth.getUser();
      if (refreshed.data && refreshed.data.user) user = refreshed.data.user;
      var profile = null;
      var isAdmin = null;
      var existing = await client.from("profiles").select("id,full_name,organization,work_field,privacy_agreed_at").eq("id", user.id).maybeSingle();
      if (!existing.error) profile = existing.data;
      if (global.MemberWrites) {
        var admin = await global.MemberWrites.fetchIsAdmin(client);
        if (!admin.error && typeof admin.data === "boolean") isAdmin = admin.data;
      }
      model = accountModel({
        signedIn: true,
        googleEnabled: enabled,
        profileComplete: profileComplete(profile),
        userId: user.id,
        isAdmin: isAdmin
      });
      renderAccount(root, model, user.email);
    } else if (root) {
      renderAccount(root, model, "");
    }
    bind(client, model);
    return enabled;
  }

  var bound = false;
  function bind(client, model) {
    if (bound) return;
    bound = true;
    document.addEventListener("click", function (event) {
      var target = event.target && event.target.closest ? event.target : null;
      if (!target) return;
      if (target.closest("[data-google-continue]")) {
        event.preventDefault();
        startGoogle(client);
      }
    });
    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!form || !form.matches || !form.matches("[data-profile-form]")) return;
      event.preventDefault();
      saveProfile(client, form, model);
    });
  }

  async function startGoogle(client) {
    var statusApi = global.AuthStatus;
    if (!client) {
      showStatus("[data-google-status], [data-auth-status]", "인증 클라이언트를 만들지 못했습니다.", "error");
      return;
    }
    var result = await client.auth.signInWithOAuth(oauthArgs());
    if (result && result.error) {
      var message = statusApi ? statusApi.classifyAuthError(result.error).message : result.error.message;
      showStatus("[data-auth-status], [data-google-status]", message, "error");
    }
  }

  async function saveProfile(client, form, model) {
    var status = form.querySelector("[data-profile-status]");
    if (!client || !global.LabAuth || !global.LabAuth.session || !global.LabAuth.session.user) {
      if (status) {
        status.hidden = false;
        status.className = "form-status error";
        status.textContent = "로그인된 계정이 없습니다. 회원정보를 저장하지 않았습니다.";
      }
      return;
    }
    if (model && model.keepExistingProfile) {
      if (status) {
        status.hidden = false;
        status.className = "form-status error";
        status.textContent = "이미 있는 회원정보는 덮어쓰지 않습니다.";
      }
      return;
    }
    if (!form.privacy || !form.privacy.checked) {
      if (status) {
        status.hidden = false;
        status.className = "form-status error";
        status.textContent = "개인정보 수집·이용에 동의해 주세요.";
      }
      return;
    }
    var user = global.LabAuth.session.user;
    var payload;
    try {
      payload = completionPayload(user, {
        full_name: form.full_name.value,
        organization: form.organization.value,
        work_field: form.work_field.value,
        privacy_agreed_at: new Date().toISOString()
      });
    } catch (err) {
      if (status) {
        status.hidden = false;
        status.className = "form-status error";
        status.textContent = "이름, 소속기관, 업무분야를 입력해 주세요. 저장하지 않았습니다.";
      }
      return;
    }
    var inserted = await global.MemberWrites.insertOwnProfile(client, payload);
    if (inserted.error) {
      if (status) {
        status.hidden = false;
        status.className = "form-status error";
        status.textContent = "회원정보를 저장하지 못했습니다. " + (inserted.error.message || "");
      }
      return;
    }
    location.replace("account.html");
  }

  global.GoogleAuth = {
    providerEnabled: providerEnabled,
    fetchProviderEnabled: fetchProviderEnabled,
    oauthArgs: oauthArgs,
    profileComplete: profileComplete,
    completionPayload: completionPayload,
    accountModel: accountModel,
    fillSlot: fillSlot,
    renderAccount: renderAccount,
    mount: mount
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined" && module.exports) {
  module.exports = globalThis.GoogleAuth;
}
