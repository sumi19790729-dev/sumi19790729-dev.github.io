var assert = require('assert');
var path = require('path');
var VisitCounter = require(path.join(__dirname, '..', 'assets', 'js', 'visits.js'));

var passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('PASS ' + name);
}

function memoryStorage() {
  var data = {};
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    dump: function () { return data; }
  };
}

function fakeCrypto(seed) {
  var n = seed || 1;
  return {
    getRandomValues: function (bytes) {
      for (var i = 0; i < bytes.length; i += 1) bytes[i] = (n + i) % 256;
      return bytes;
    }
  };
}

test('payload contains only the browser key', function () {
  var payload = VisitCounter.visitPayload('ab'.repeat(16));
  assert.deepStrictEqual(payload, { p_visitor_key: 'ab'.repeat(16) });
});

test('payload rejects a count or date supplied by the browser', function () {
  assert.throws(function () {
    VisitCounter.visitPayload('short');
  });
});

test('same storage keeps one key', function () {
  var storage = memoryStorage();
  var crypto = fakeCrypto(4);
  var first = VisitCounter.visitorKey(storage, crypto);
  var second = VisitCounter.visitorKey(storage, fakeCrypto(9));
  assert.strictEqual(first, second);
  assert.ok(/^[0-9a-f]{32}$/.test(first));
});

test('failed save does not record the day', function () {
  var storage = memoryStorage();
  assert.strictEqual(VisitCounter.rememberCountedDay(storage, '2026-10-13', false), '');
  assert.strictEqual(storage.dump().arl_visit_day, undefined);
});

test('successful save records the server day', function () {
  var storage = memoryStorage();
  assert.strictEqual(VisitCounter.rememberCountedDay(storage, '2026-10-13', true), '2026-10-13');
  assert.strictEqual(storage.dump().arl_visit_day, '2026-10-13');
});

test('failure renders 집계 확인 중 instead of zero', function () {
  var view = VisitCounter.renderVisitState({ ok: false, todayVisits: 0, totalVisits: 0 });
  assert.strictEqual(view.today, '집계 확인 중');
  assert.strictEqual(view.total, '집계 확인 중');
  assert.ok(view.note.indexOf('실인원이 아닙니다') !== -1);
});

test('success shows server totals and the actual start date', function () {
  var view = VisitCounter.renderVisitState({
    ok: true,
    todayVisits: 2,
    totalVisits: 2,
    startedOn: '2026-10-13'
  });
  assert.strictEqual(view.today, '오늘 방문 수 2');
  assert.strictEqual(view.total, '누적 방문 수 2');
  assert.ok(view.note.indexOf('2026-10-13부터') !== -1);
  assert.ok(view.note.indexOf('하루 중복 방문 제외') !== -1);
});

test('second response with counted false does not invent a local total', function () {
  var row = VisitCounter.stateFromRow({
    today_visits: 1,
    total_visits: 1,
    started_on: '2026-10-13',
    visit_day: '2026-10-13',
    counted: false
  });
  var view = VisitCounter.renderVisitState(row);
  assert.strictEqual(row.counted, false);
  assert.strictEqual(view.total, '누적 방문 수 1');
});

console.log(passed + ' passed');
