(function (global) {
  var PUBLIC_QUESTION_FIELDS = [
    'id',
    'title',
    'body',
    'related_ai',
    'status',
    'is_public',
    'created_at'
  ];
  var MEMBER_QUESTION_FIELDS = PUBLIC_QUESTION_FIELDS.concat(['author_id', 'updated_at']);
  var PUBLIC_ANSWER_FIELDS = ['id', 'question_id', 'body', 'created_at', 'updated_at'];
  var PERSONAL_KEYS = [
    'email',
    'full_name',
    'organization',
    'work_field',
    'privacy_agreed_at',
    'author_id',
    'admin_id'
  ];

  function questionSelect(role) {
    return (role === 'guest' ? PUBLIC_QUESTION_FIELDS : MEMBER_QUESTION_FIELDS).join(',');
  }

  function answerSelect(isAdmin) {
    return (isAdmin ? PUBLIC_ANSWER_FIELDS.concat(['admin_id']) : PUBLIC_ANSWER_FIELDS).join(',');
  }

  function statusLabel(status) {
    return status === 'answered' ? '답변 완료' : '답변 대기';
  }

  function publicLabel(isPublic) {
    return isPublic ? '공개' : '비공개';
  }

  function formatDate(iso) {
    if (!iso) return '';
    var date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function relatedAiOptions(tools) {
    var items = (tools || []).map(function (tool) {
      return { id: tool.id, name: tool.name || tool.id };
    });
    items.push({ id: 'homepage', name: '홈페이지' });
    items.push({ id: 'other', name: '기타' });
    return items;
  }

  function relatedAiLabel(id, tools) {
    var found = relatedAiOptions(tools).filter(function (item) {
      return item.id === id;
    })[0];
    return found ? found.name : id || '기타';
  }

  function visibleToViewer(question, viewer) {
    viewer = viewer || {};
    if (!question) return false;
    if (question.is_public === true) return true;
    if (!viewer.userId) return false;
    if (viewer.isAdmin === true) return true;
    return question.author_id === viewer.userId;
  }

  function publicSafeQuestion(question) {
    var src = question || {};
    return {
      id: src.id,
      title: src.title,
      body: src.body,
      related_ai: src.related_ai,
      status: src.status,
      is_public: src.is_public,
      created_at: src.created_at
    };
  }

  function publicSafeAnswer(answer) {
    var src = answer || {};
    return {
      id: src.id,
      question_id: src.question_id,
      body: src.body,
      created_at: src.created_at,
      updated_at: src.updated_at
    };
  }

  function containsPersonalData(obj) {
    if (!obj || typeof obj !== 'object') return false;
    return PERSONAL_KEYS.some(function (key) {
      return Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null && obj[key] !== '';
    });
  }

  function errorText(error) {
    if (!error) return '';
    return String(error.message || error.error_description || error.details || error.code || '');
  }

  function classifyQaError(error) {
    var raw = errorText(error);
    var text = raw.toLowerCase();
    var code = String((error && (error.code || error.status)) || '');

    if (
      text.indexOf('jwt') !== -1 ||
      text.indexOf('session') !== -1 ||
      text.indexOf('not authenticated') !== -1 ||
      text.indexOf('refresh token') !== -1 ||
      code === 'PGRST301' ||
      code === '401'
    ) {
      return {
        kind: 'session',
        message: '로그인이 만료되었습니다. 다시 로그인해 주세요.'
      };
    }

    if (
      text.indexOf('admin only') !== -1 ||
      text.indexOf('permission') !== -1 ||
      text.indexOf('not allowed') !== -1 ||
      text.indexOf('row-level security') !== -1 ||
      text.indexOf('42501') !== -1 ||
      code === '42501' ||
      code === '403'
    ) {
      return {
        kind: 'permission',
        message: '이 작업을 할 권한이 없습니다.'
      };
    }

    if (text.indexOf('failed to fetch') !== -1 || text.indexOf('network') !== -1) {
      return {
        kind: 'network',
        message: '서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.'
      };
    }

    return {
      kind: 'save',
      message: raw ? '저장하지 못했습니다. ' + raw : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'
    };
  }

  global.QaModel = {
    PUBLIC_QUESTION_FIELDS: PUBLIC_QUESTION_FIELDS,
    MEMBER_QUESTION_FIELDS: MEMBER_QUESTION_FIELDS,
    PUBLIC_ANSWER_FIELDS: PUBLIC_ANSWER_FIELDS,
    questionSelect: questionSelect,
    answerSelect: answerSelect,
    statusLabel: statusLabel,
    publicLabel: publicLabel,
    formatDate: formatDate,
    escapeHtml: escapeHtml,
    relatedAiOptions: relatedAiOptions,
    relatedAiLabel: relatedAiLabel,
    visibleToViewer: visibleToViewer,
    publicSafeQuestion: publicSafeQuestion,
    publicSafeAnswer: publicSafeAnswer,
    containsPersonalData: containsPersonalData,
    classifyQaError: classifyQaError
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = globalThis.QaModel;
}
