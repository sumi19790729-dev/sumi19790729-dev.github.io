(function (global) {
  function errorText(error) {
    if (!error) return "";
    return String(error.message || error.error_description || error.msg || error.error || "");
  }

  function errorCode(error) {
    if (!error) return "";
    return String(error.code || error.error_code || "").toLowerCase();
  }

  function classifyAuthError(error) {
    var raw = errorText(error);
    var text = raw.toLowerCase();
    var code = errorCode(error);
    if (!raw && !code) {
      return { kind: "error", message: "처리 중 오류가 났습니다. 잠시 후 다시 시도해 주세요. 가입은 완료되지 않았습니다." };
    }
    if (text.indexOf("failed to fetch") !== -1 || text.indexOf("network") !== -1) {
      return { kind: "error", message: "서버에 연결하지 못했습니다. 가입 요청이 전송되지 않았습니다." };
    }
    if (code === "email_address_not_authorized" || text.indexOf("not authorized") !== -1) {
      return { kind: "error", message: "인증 메일을 보내지 못했습니다. 이 주소는 메일 발송이 허용되지 않습니다. 가입은 완료되지 않았습니다." };
    }
    if (code === "otp_expired" || text.indexOf("expired") !== -1) {
      return { kind: "error", message: "인증 링크가 만료되었거나 이미 사용되었습니다. 로그인되지 않았습니다. 회원가입을 다시 시도해 주세요." };
    }
    if (code === "email_address_invalid" || text.indexOf("invalid email") !== -1 || text.indexOf("email address") !== -1 && text.indexOf("invalid") !== -1) {
      return { kind: "error", message: "이메일 주소가 올바르지 않습니다. 가입은 완료되지 않았습니다." };
    }
    var wait = text.match(/after (\d+) seconds?/);
    if ((code === "over_email_send_rate_limit" || text.indexOf("for security purposes") !== -1) && wait) {
      return {
        kind: "pending",
        message: "이메일 인증 대기입니다. 같은 주소로 인증 메일을 바로 다시 보내지 못했습니다. 서버는 같은 주소의 재발송을 " + wait[1] + "초 동안 막습니다. " + wait[1] + "초 후에 이 화면에서 한 번만 다시 요청해 주세요. 이미 도착한 메일이 있으면 받은편지함과 스팸함의 링크를 누르면 됩니다. 링크를 누르기 전에는 로그인되지 않습니다."
      };
    }
    if (code === "over_email_send_rate_limit" || text.indexOf("email rate limit exceeded") !== -1) {
      return {
        kind: "error",
        message: "이번 인증 메일은 나가지 않았습니다. 프로젝트 전체 메일 발송 한도에 도달했습니다. 한도가 풀리기 전에 다시 눌러도 메일은 더 나가지 않습니다. 계정이 이미 만들어졌다면 인증 대기이며, 한도가 풀린 뒤 이 화면에서 한 번만 다시 요청해 주세요. 인증 메일의 링크를 누르기 전에는 로그인되지 않습니다."
      };
    }
    if (code === "over_request_rate_limit" || text.indexOf("request rate limit") !== -1) {
      return { kind: "error", message: "같은 접속에서 요청이 너무 많습니다. 이번 가입 요청은 처리되지 않았습니다. 잠시 후 한 번만 다시 시도해 주세요." };
    }
    if (text.indexOf("error sending") !== -1 || code === "unexpected_failure") {
      return { kind: "error", message: "가입 요청은 서버에 도착했지만 인증 메일 발송에 실패했습니다. 가입은 완료되지 않았습니다." };
    }
    if (text.indexOf("email not confirmed") !== -1) {
      return { kind: "error", message: "이메일 인증 대기입니다. 메일함의 링크를 누른 뒤에 로그인됩니다. 운영자 승인 절차는 없습니다." };
    }
    if (text.indexOf("invalid login credentials") !== -1) {
      return { kind: "error", message: "이메일 또는 비밀번호가 올바르지 않습니다. 로그인되지 않았습니다." };
    }
    if (text.indexOf("already registered") !== -1 || text.indexOf("already been registered") !== -1 || text.indexOf("user already exists") !== -1) {
      return { kind: "error", message: "이미 가입된 이메일입니다. 로그인해 주세요. 새 가입은 완료되지 않았습니다." };
    }
    if (text.indexOf("password") !== -1 && text.indexOf("least") !== -1) {
      return { kind: "error", message: "비밀번호는 6자 이상이어야 합니다. 가입은 완료되지 않았습니다." };
    }
    if (text.indexOf("signup is disabled") !== -1) {
      return { kind: "error", message: "현재 회원가입이 열려 있지 않습니다. 가입 요청이 거절되었습니다." };
    }
    return { kind: "error", message: raw };
  }

  function classifySignupResult(data) {
    var user = data && data.user;
    var identities = user && user.identities;
    if (data && data.session && user) {
      return { kind: "ok", message: "회원가입이 완료되어 로그인되었습니다." };
    }
    if (user && identities && identities.length > 0) {
      return {
        kind: "pending",
        message: "인증 대기입니다. 입력한 주소로 인증 메일을 보냈습니다. 메일의 링크를 누르기 전에는 로그인되지 않습니다. 운영자 승인 절차는 없고, 가입 신청 메일도 운영자에게 보내지 않습니다. 메일이 없으면 스팸함을 확인해 주세요."
      };
    }
    return {
      kind: "error",
      message: "가입이 완료되지 않았습니다. 인증 메일이 발송되지 않았습니다. 이미 가입한 주소이면 로그인해 주세요. 처음 가입이면 잠시 후 다시 시도해 주세요."
    };
  }

  function readAuthCallback(hash, search) {
    var fragment = new URLSearchParams(String(hash || "").replace(/^#/, ""));
    var query = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    function pick(name) {
      return fragment.get(name) || query.get(name) || "";
    }
    return {
      type: pick("type"),
      error: pick("error"),
      errorCode: pick("error_code"),
      errorDescription: pick("error_description")
    };
  }

  function callbackMessage(callback) {
    if (!callback) return null;
    if (callback.error || callback.errorCode || callback.errorDescription) {
      return classifyAuthError({
        message: callback.errorDescription || callback.error,
        code: callback.errorCode || callback.error
      });
    }
    if (callback.type === "signup") {
      return { kind: "ok", message: "이메일 인증이 완료되어 로그인되었습니다." };
    }
    return null;
  }

  global.AuthStatus = {
    classifyAuthError: classifyAuthError,
    classifySignupResult: classifySignupResult,
    readAuthCallback: readAuthCallback,
    callbackMessage: callbackMessage
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined" && module.exports) {
  module.exports = globalThis.AuthStatus;
}
