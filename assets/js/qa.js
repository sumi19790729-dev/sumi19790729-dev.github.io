(function () {
  var TITLE_MAX = 120;
  var BODY_MAX = 4000;
  var state = {
    filter: 'public',
    related: '',
    isAdmin: false,
    userId: null,
    tools: [],
    questions: [],
    answersById: {},
    adminProfiles: {}
  };

  function model() {
    return window.QaModel;
  }

  function writes() {
    return window.MemberWrites;
  }

  function client() {
    return window.LabAuth && window.LabAuth.getClient ? window.LabAuth.getClient() : null;
  }

  function sessionUser() {
    return window.LabAuth && window.LabAuth.session && window.LabAuth.session.user
      ? window.LabAuth.session.user
      : null;
  }

  function el(selector) {
    return document.querySelector(selector);
  }

  function showStatus(message, kind) {
    var box = el('[data-qa-status]');
    if (!box) return;
    box.hidden = !message;
    box.textContent = message || '';
    box.className = 'form-status' + (kind ? ' ' + kind : '');
  }

  function viewer() {
    return {
      userId: state.userId,
      isAdmin: state.isAdmin === true
    };
  }

  function loginHref() {
    return 'login.html?next=qa.html';
  }

  async function resolveAdminRole() {
    state.isAdmin = false;
    var user = sessionUser();
    var sb = client();
    if (!user || !sb || !writes()) return false;
    var result = await writes().fetchIsAdmin(sb);
    if (result.error) {
      var classified = model().classifyQaError(result.error);
      if (classified.kind === 'session') {
        showStatus(classified.message, 'error');
      }
      return false;
    }
    state.isAdmin = result.data === true;
    return state.isAdmin;
  }

  function renderNotice() {
    var box = el('[data-qa-notice]');
    if (!box) return;
    if (!sessionUser()) {
      box.innerHTML =
        '공개 승인된 질문과 답변만 볼 수 있습니다. 질문을 작성하려면 로그인해 주세요. ' +
        '<a href="' + loginHref() + '">로그인</a>';
      return;
    }
    if (state.isAdmin) {
      box.textContent =
        '관리자 권한이 확인되었습니다. 모든 질문을 보고 답변을 작성·수정하거나 공개 여부를 승인할 수 있습니다.';
      return;
    }
    box.textContent =
      '질문을 등록할 수 있습니다. 관리자가 답변하고 공개를 승인하기 전에는 작성자와 관리자만 볼 수 있습니다.';
  }

  function renderCompose() {
    var box = el('[data-qa-compose]');
    var guest = el('[data-qa-guest]');
    var select = el('[data-qa-related]');
    if (box) box.hidden = !sessionUser();
    if (guest) guest.hidden = Boolean(sessionUser());
    if (!select) return;
    var options = model().relatedAiOptions(state.tools);
    select.innerHTML = options
      .map(function (item) {
        return '<option value="' + model().escapeHtml(item.id) + '">' + model().escapeHtml(item.name) + '</option>';
      })
      .join('');
    if (state.related && options.some(function (item) { return item.id === state.related; })) {
      select.value = state.related;
    }
  }

  function renderRelatedNote() {
    var note = el('[data-qa-related-note]');
    if (!note) return;
    if (!state.related) {
      note.hidden = true;
      note.textContent = '';
      return;
    }
    note.hidden = false;
    note.textContent = '카테고리: ' + model().relatedAiLabel(state.related, state.tools);
  }

  function renderFilters() {
    var mine = el('[data-qa-filter="mine"]');
    var admin = el('[data-qa-filter="admin"]');
    if (mine) mine.hidden = !sessionUser();
    if (admin) admin.hidden = !state.isAdmin;
    if (state.filter === 'mine' && !sessionUser()) state.filter = 'public';
    if (state.filter === 'admin' && !state.isAdmin) state.filter = 'public';
    document.querySelectorAll('[data-qa-filter]').forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-qa-filter') === state.filter);
    });
  }

  function matchesFilter(question) {
    if (!model().questionMatchesRelated(question, state.related)) return false;
    if (!model().visibleToViewer(question, viewer())) return false;
    if (state.filter === 'public') return question.is_public === true;
    if (state.filter === 'mine') return question.author_id === state.userId;
    if (state.filter === 'admin') return state.isAdmin === true;
    return false;
  }

  function renderList() {
    var list = el('[data-qa-list]');
    if (!list) return;
    var items = state.questions.filter(matchesFilter);
    if (!items.length) {
      var empty = '공개된 질문이 없습니다.';
      if (state.filter === 'mine') empty = '작성한 질문이 없습니다.';
      if (state.filter === 'admin') empty = '등록된 질문이 없습니다.';
      list.innerHTML = '<article class="qa-item"><strong>' + empty + '</strong></article>';
      return;
    }
    list.innerHTML = items.map(renderItem).join('');
  }

  function renderItem(question) {
    var safeQuestion = model().publicSafeQuestion(question);
    var answer = state.answersById[question.id];
    var safeAnswer = answer ? model().publicSafeAnswer(answer) : null;
    var own = state.userId && question.author_id === state.userId;
    var showAdmin = state.filter === 'admin' && state.isAdmin === true;
    var badges =
      '<span class="badge ' +
      (safeQuestion.status === 'answered' ? 'public' : 'preparing') +
      '">' +
      model().escapeHtml(model().statusLabel(safeQuestion.status)) +
      '</span>' +
      '<span class="badge ' +
      (safeQuestion.is_public ? 'public' : 'private') +
      '">' +
      model().escapeHtml(model().publicLabel(safeQuestion.is_public)) +
      '</span>';
    if (own) badges += '<span class="badge mine">내 질문</span>';

    var html =
      '<article class="qa-item">' +
      '<strong>' +
      model().escapeHtml(safeQuestion.title) +
      '</strong>' +
      '<div class="qa-meta">' +
      badges +
      '<span>' +
      model().escapeHtml(model().formatDate(safeQuestion.created_at)) +
      '</span>' +
      '<span>' +
      model().escapeHtml(model().relatedAiLabel(safeQuestion.related_ai, state.tools)) +
      '</span>' +
      '</div>' +
      '<div class="qa-body">' +
      model().escapeHtml(safeQuestion.body) +
      '</div>';

    if (safeAnswer && safeAnswer.body) {
      html +=
        '<div class="qa-answer"><strong>답변</strong>' +
        '<div class="qa-body">' +
        model().escapeHtml(safeAnswer.body) +
        '</div></div>';
    }

    if (showAdmin) {
      var profile = state.adminProfiles[question.author_id] || {};
      html +=
        '<div class="qa-admin">' +
        '<p class="field-hint">관리자 전용. 공개 목록에는 이 정보가 보이지 않습니다.</p>' +
        '<p class="qa-admin-author">작성자: ' +
        model().escapeHtml(profile.email || '이메일 없음') +
        '</p>' +
        '<label for="answer-' +
        model().escapeHtml(question.id) +
        '">답변</label>' +
        '<textarea id="answer-' +
        model().escapeHtml(question.id) +
        '" data-qa-answer-body="' +
        model().escapeHtml(question.id) +
        '" rows="5" maxlength="' +
        BODY_MAX +
        '">' +
        model().escapeHtml(safeAnswer && safeAnswer.body ? safeAnswer.body : '') +
        '</textarea>' +
        '<div class="qa-admin-actions">' +
        '<button class="btn" type="button" data-qa-reply="' +
        model().escapeHtml(question.id) +
        '">답변 저장</button>' +
        '<button class="btn btn-secondary" type="button" data-qa-publish="' +
        model().escapeHtml(question.id) +
        '" data-public="' +
        (safeQuestion.is_public ? 'false' : 'true') +
        '">' +
        (safeQuestion.is_public ? '비공개로 변경' : '공개 승인') +
        '</button>' +
        '</div></div>';
    }

    html += '</article>';
    return html;
  }

  function renderAll() {
    renderNotice();
    renderCompose();
    renderRelatedNote();
    renderFilters();
    renderList();
  }

  async function loadTools() {
    try {
      var res = await fetch('data/tools.json');
      var data = await res.json();
      state.tools = data.tools || [];
    } catch (err) {
      state.tools = [];
    }
  }

  async function loadBoard() {
    var sb = client();
    var user = sessionUser();
    state.userId = user ? user.id : null;
    if (!sb) {
      showStatus('게시판 설정을 확인하지 못했습니다.', 'error');
      renderAll();
      return;
    }

    await resolveAdminRole();

    var role = state.userId ? 'member' : 'guest';
    var questions = await sb
      .from('questions')
      .select(model().questionSelect(role))
      .order('created_at', { ascending: false });
    if (questions.error) {
      var qErr = model().classifyQaError(questions.error);
      showStatus(qErr.kind === 'save' ? '질문을 불러오지 못했습니다. ' + (questions.error.message || '') : qErr.message, 'error');
      state.questions = [];
      state.answersById = {};
      renderAll();
      return;
    }

    state.questions = (questions.data || []).filter(function (row) {
      return model().visibleToViewer(row, viewer());
    });

    var answers = await sb
      .from('answers')
      .select(model().answerSelect(state.isAdmin));
    if (answers.error) {
      var aErr = model().classifyQaError(answers.error);
      showStatus(aErr.kind === 'save' ? '답변을 불러오지 못했습니다. ' + (answers.error.message || '') : aErr.message, 'error');
      state.answersById = {};
    } else {
      state.answersById = {};
      (answers.data || []).forEach(function (row) {
        var parent = state.questions.filter(function (item) {
          return item.id === row.question_id;
        })[0];
        if (parent && model().visibleToViewer(parent, viewer())) {
          state.answersById[row.question_id] = row;
        }
      });
    }

    state.adminProfiles = {};
    if (state.isAdmin && state.questions.length) {
      var ids = state.questions.map(function (row) {
        return row.author_id;
      }).filter(Boolean);
      if (ids.length) {
        var profiles = await sb.from('profiles').select('id,email').in('id', ids);
        if (!profiles.error) {
          (profiles.data || []).forEach(function (row) {
            state.adminProfiles[row.id] = { email: row.email };
          });
        }
      }
    }

    showStatus('', '');
    renderAll();
  }

  async function handleAsk(event) {
    event.preventDefault();
    var form = event.target;
    var user = sessionUser();
    var sb = client();
    if (!user) {
      location.href = loginHref();
      return;
    }
    if (!sb || !writes()) {
      showStatus('질문을 저장할 준비를 확인하지 못했습니다.', 'error');
      return;
    }

    var title = (form.title.value || '').trim();
    var body = (form.body.value || '').trim();
    var related = form.related_ai.value || '';
    if (!title || !body || !related) {
      showStatus('제목, 내용, 관련 AI를 입력해 주세요.', 'error');
      return;
    }
    if (title.length > TITLE_MAX || body.length > BODY_MAX) {
      showStatus('제목 또는 내용이 너무 깁니다.', 'error');
      return;
    }

    var button = form.querySelector('[type=submit]');
    if (button) button.disabled = true;
    showStatus('질문을 저장하고 있습니다…', '');
    var result = await writes().insertOwnQuestion(sb, {
      title: title,
      body: body,
      related_ai: related
    });
    if (button) button.disabled = false;
    if (result.error) {
      var classified = model().classifyQaError(result.error);
      showStatus(classified.message, 'error');
      return;
    }
    form.reset();
    renderCompose();
    state.filter = 'mine';
    showStatus('질문을 등록했습니다. 공개 승인은 관리자가 합니다.', 'ok');
    await loadBoard();
  }

  async function handleReply(questionId, button) {
    var sb = client();
    if (!sessionUser()) {
      location.href = loginHref();
      return;
    }
    if (!state.isAdmin) {
      showStatus('이 작업을 할 권한이 없습니다.', 'error');
      return;
    }
    var area = el('[data-qa-answer-body="' + questionId + '"]');
    var body = area ? (area.value || '').trim() : '';
    if (!body) {
      showStatus('답변 내용을 입력해 주세요.', 'error');
      return;
    }
    button.disabled = true;
    showStatus('답변을 저장하고 있습니다…', '');
    var result = await writes().replyToQuestion(sb, questionId, body);
    button.disabled = false;
    if (result.error) {
      showStatus(model().classifyQaError(result.error).message, 'error');
      return;
    }
    showStatus('답변을 저장했습니다.', 'ok');
    await loadBoard();
  }

  async function handlePublish(questionId, makePublic, button) {
    var sb = client();
    if (!sessionUser()) {
      location.href = loginHref();
      return;
    }
    if (!state.isAdmin) {
      showStatus('이 작업을 할 권한이 없습니다.', 'error');
      return;
    }
    button.disabled = true;
    showStatus('공개 여부를 저장하고 있습니다…', '');
    var result = await writes().setQuestionPublic(sb, questionId, makePublic === 'true');
    button.disabled = false;
    if (result.error) {
      showStatus(model().classifyQaError(result.error).message, 'error');
      return;
    }
    showStatus(makePublic === 'true' ? '질문을 공개했습니다.' : '질문을 비공개로 변경했습니다.', 'ok');
    await loadBoard();
  }

  function bind() {
    var form = el('[data-qa-form]');
    if (form) form.addEventListener('submit', handleAsk);
    document.addEventListener('click', function (event) {
      var filter = event.target.closest('[data-qa-filter]');
      if (filter) {
        state.filter = filter.getAttribute('data-qa-filter');
        renderFilters();
        renderList();
        return;
      }
      var reply = event.target.closest('[data-qa-reply]');
      if (reply) {
        handleReply(reply.getAttribute('data-qa-reply'), reply);
        return;
      }
      var publish = event.target.closest('[data-qa-publish]');
      if (publish) {
        handlePublish(
          publish.getAttribute('data-qa-publish'),
          publish.getAttribute('data-public'),
          publish
        );
      }
    });
    document.addEventListener('lab-auth-changed', function () {
      loadBoard();
    });
  }

  async function start() {
    state.related = model().relatedFromLocation(window.location.search);
    bind();
    await loadTools();
    renderAll();
    if (window.LabAuth && window.LabAuth.ready) {
      await window.LabAuth.ready;
    }
    await loadBoard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
