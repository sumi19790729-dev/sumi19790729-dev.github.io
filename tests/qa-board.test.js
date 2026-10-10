var assert = require('assert');
var path = require('path');
var QaModel = require(path.join(__dirname, '..', 'assets', 'js', 'qa-model.js'));
var MemberWrites = require(path.join(__dirname, '..', 'assets', 'js', 'member-writes.js'));

var passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('PASS ' + name);
}

test('question insert payload has only title, body, related_ai', function () {
  var payload = MemberWrites.questionInsertPayload({
    title: '제목',
    body: '내용',
    related_ai: 'university-kpi-agentic-ai',
    author_id: 'should-omit',
    is_public: true,
    status: 'answered',
    email: 'user@example.com'
  });
  assert.deepStrictEqual(Object.keys(payload).sort(), ['body', 'related_ai', 'title']);
  assert.strictEqual(payload.title, '제목');
});

test('question insert rejects privileged fields', function () {
  var calls = [];
  var supabase = {
    from: function () {
      return {
        insert: function (payload) {
          calls.push(payload);
          return { select: function () { return { single: function () { return { data: payload, error: null }; } }; } };
        }
      };
    }
  };
  MemberWrites.insertOwnQuestion(supabase, {
    title: '제목',
    body: '내용',
    related_ai: 'homepage'
  });
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0], {
    title: '제목',
    body: '내용',
    related_ai: 'homepage'
  });
});

test('admin helpers only call existing RPCs', function () {
  var calls = [];
  var supabase = {
    rpc: function (name, args) {
      calls.push({ name: name, args: args });
      return { data: true, error: null };
    }
  };
  MemberWrites.fetchIsAdmin(supabase);
  MemberWrites.replyToQuestion(supabase, 'q1', '답변');
  MemberWrites.setQuestionPublic(supabase, 'q1', true);
  assert.deepStrictEqual(calls, [
    { name: 'is_admin', args: undefined },
    { name: 'admin_reply_to_question', args: { p_question_id: 'q1', p_body: '답변' } },
    { name: 'admin_set_question_public', args: { p_question_id: 'q1', p_is_public: true } }
  ]);
});

test('guest question select omits author_id', function () {
  assert.strictEqual(QaModel.questionSelect('guest').indexOf('author_id'), -1);
  assert.ok(QaModel.questionSelect('member').indexOf('author_id') !== -1);
  assert.strictEqual(QaModel.answerSelect(false).indexOf('admin_id'), -1);
});

test('visibility: guest sees only public posts', function () {
  var pub = { id: '1', is_public: true, author_id: 'a' };
  var priv = { id: '2', is_public: false, author_id: 'a' };
  assert.strictEqual(QaModel.visibleToViewer(pub, {}), true);
  assert.strictEqual(QaModel.visibleToViewer(priv, {}), false);
  assert.strictEqual(QaModel.visibleToViewer(priv, { userId: 'b' }), false);
  assert.strictEqual(QaModel.visibleToViewer(priv, { userId: 'a' }), true);
  assert.strictEqual(QaModel.visibleToViewer(priv, { userId: 'b', isAdmin: true }), true);
  assert.strictEqual(QaModel.visibleToViewer(priv, { userId: 'b', isAdmin: false }), false);
});

test('public cards strip personal fields', function () {
  var safeQ = QaModel.publicSafeQuestion({
    id: '1',
    title: '공개 질문',
    body: '내용',
    related_ai: 'homepage',
    status: 'answered',
    is_public: true,
    created_at: '2026-10-10T00:00:00.000Z',
    author_id: 'uuid-1',
    email: 'member@example.com',
    full_name: '홍길동'
  });
  var safeA = QaModel.publicSafeAnswer({
    id: 'a1',
    question_id: '1',
    body: '답변',
    created_at: '2026-10-10T01:00:00.000Z',
    updated_at: '2026-10-10T01:00:00.000Z',
    admin_id: 'uuid-admin',
    email: 'admin@example.com'
  });
  assert.strictEqual(QaModel.containsPersonalData(safeQ), false);
  assert.strictEqual(QaModel.containsPersonalData(safeA), false);
  assert.strictEqual(safeQ.email, undefined);
  assert.strictEqual(safeQ.author_id, undefined);
  assert.strictEqual(safeA.admin_id, undefined);
});

test('labels and dates', function () {
  assert.strictEqual(QaModel.statusLabel('pending'), '답변 대기');
  assert.strictEqual(QaModel.statusLabel('answered'), '답변 완료');
  assert.strictEqual(QaModel.publicLabel(false), '비공개');
  assert.strictEqual(QaModel.formatDate('2026-10-10T00:00:00.000Z'), '2026-10-10');
  assert.strictEqual(QaModel.escapeHtml('<script>'), '&lt;script&gt;');
});

test('error mapping', function () {
  assert.strictEqual(QaModel.classifyQaError({ message: 'JWT expired' }).kind, 'session');
  assert.strictEqual(QaModel.classifyQaError({ message: 'admin only', code: '42501' }).kind, 'permission');
  assert.strictEqual(QaModel.classifyQaError({ message: 'new row violates row-level security policy' }).kind, 'permission');
  assert.strictEqual(QaModel.classifyQaError({ message: 'Failed to fetch' }).kind, 'network');
  assert.strictEqual(QaModel.classifyQaError({ message: 'column denied' }).kind, 'save');
});

test('related AI options keep catalog structure', function () {
  var options = QaModel.relatedAiOptions([
    { id: 'university-kpi-agentic-ai', name: 'KPI 추천 AI' }
  ]);
  assert.strictEqual(options[0].id, 'university-kpi-agentic-ai');
  assert.ok(options.some(function (item) { return item.id === 'homepage'; }));
});

console.log('\n' + passed + ' tests passed');
