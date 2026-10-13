(function (global) {
  var KEY_NAME = "arl_visit_key";
  var DAY_NAME = "arl_visit_day";

  function randomKey(cryptoObj) {
    var bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (value) {
      return ("0" + value.toString(16)).slice(-2);
    }).join("");
  }

  function validKey(value) {
    return /^[0-9a-f]{32}$/.test(String(value || ""));
  }

  function visitorKey(storage, cryptoObj) {
    var current = "";
    try {
      current = storage.getItem(KEY_NAME) || "";
    } catch (err) {
      current = "";
    }
    if (validKey(current)) return current;
    var created = randomKey(cryptoObj);
    try {
      storage.setItem(KEY_NAME, created);
    } catch (err) {
      /* 키를 저장하지 못하면 이번 요청만 사용한다. */
    }
    return created;
  }

  function visitPayload(visitorKeyValue) {
    if (!validKey(visitorKeyValue)) {
      throw new Error("invalid visitor key");
    }
    return { p_visitor_key: visitorKeyValue };
  }

  function rememberCountedDay(storage, day, ok) {
    if (!ok || !day) return "";
    try {
      storage.setItem(DAY_NAME, String(day));
    } catch (err) {
      return "";
    }
    return String(day);
  }

  function renderVisitState(state) {
    var waiting = {
      today: "집계 확인 중",
      total: "집계 확인 중",
      note: "동일 브라우저의 하루 중복 방문 제외 · 집계 시작일부터. 브라우저 기준 방문 수이며 실인원이 아닙니다."
    };
    if (!state || state.ok !== true || state.todayVisits == null || state.totalVisits == null || !state.startedOn) {
      return waiting;
    }
    return {
      today: "오늘 방문 수 " + state.todayVisits,
      total: "누적 방문 수 " + state.totalVisits,
      note: "동일 브라우저의 하루 중복 방문 제외 · " + state.startedOn + "부터. 브라우저 기준 방문 수이며 실인원이 아닙니다. 저장소를 지우거나 다른 기기를 쓰면 다시 집계될 수 있습니다."
    };
  }

  function applyVisitState(root, state) {
    if (!root) return;
    var view = renderVisitState(state);
    var today = root.querySelector("[data-visit-today]");
    var total = root.querySelector("[data-visit-total]");
    var note = root.querySelector("[data-visit-note]");
    if (today) today.textContent = view.today;
    if (total) total.textContent = view.total;
    if (note) note.textContent = view.note;
  }

  function stateFromRow(row) {
    if (!row) return { ok: false };
    return {
      ok: true,
      todayVisits: row.today_visits,
      totalVisits: row.total_visits,
      startedOn: row.started_on,
      visitDay: row.visit_day,
      counted: row.counted === true
    };
  }

  async function loadHomeVisits(client, storage, cryptoObj) {
    var root = document.querySelector("[data-visit-counter]");
    applyVisitState(root, { ok: false });
    if (!client || !storage || !cryptoObj) return { ok: false };
    var key = visitorKey(storage, cryptoObj);
    var payload = visitPayload(key);
    var result = await client.rpc("record_home_visit", payload);
    if (!result || result.error || !result.data) {
      applyVisitState(root, { ok: false });
      return { ok: false };
    }
    var row = Array.isArray(result.data) ? result.data[0] : result.data;
    var state = stateFromRow(row);
    if (state.ok) rememberCountedDay(storage, state.visitDay, true);
    applyVisitState(root, state);
    return state;
  }

  function start() {
    var root = document.querySelector("[data-visit-counter]");
    if (!root || !global.supabase || !global.SUPABASE_CONFIG) return;
    var cfg = global.SUPABASE_CONFIG;
    if (!cfg.url || !cfg.anonKey) return;
    var client = global.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    loadHomeVisits(client, global.localStorage, global.crypto);
  }

  global.VisitCounter = {
    visitorKey: visitorKey,
    visitPayload: visitPayload,
    rememberCountedDay: rememberCountedDay,
    renderVisitState: renderVisitState,
    applyVisitState: applyVisitState,
    stateFromRow: stateFromRow,
    loadHomeVisits: loadHomeVisits
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start);
    } else {
      start();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined" && module.exports) {
  module.exports = globalThis.VisitCounter;
}
