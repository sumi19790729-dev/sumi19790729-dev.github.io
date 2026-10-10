var fs = require('fs');
var path = require('path');
var assert = require('assert');

var configSrc = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'js', 'supabase-config.js'),
  'utf8'
);
var urlMatch = configSrc.match(/url:\s*"([^"]+)"/);
var keyMatch = configSrc.match(/anonKey:\s*"([^"]+)"/);
if (!urlMatch || !keyMatch) {
  throw new Error('supabase-config.js에서 공개 URL/key를 읽지 못했습니다.');
}

var url = urlMatch[1];
var key = keyMatch[1];
var passed = 0;

function headers(extra) {
  var out = {
    apikey: key,
    Authorization: 'Bearer ' + key
  };
  Object.assign(out, extra || {});
  return out;
}

async function api(pathname, options) {
  var res = await fetch(url + pathname, options);
  var text = await res.text();
  var body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (err) {
    body = text;
  }
  return { status: res.status, body: body };
}

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(function () {
      passed += 1;
      console.log('PASS ' + name);
    });
}

async function run() {
  await test('anon can read questions columns used by the public board', async function () {
    var result = await api(
      '/rest/v1/questions?select=id,title,body,related_ai,status,is_public,created_at&is_public=eq.true',
      { headers: headers() }
    );
    assert.ok(result.status === 200, 'status ' + result.status);
    assert.ok(Array.isArray(result.body));
    result.body.forEach(function (row) {
      assert.strictEqual(row.is_public, true);
      assert.strictEqual(row.email, undefined);
      assert.strictEqual(row.author_id, undefined);
    });
  });

  await test('anon unpublished questions return empty', async function () {
    var result = await api(
      '/rest/v1/questions?select=id,title,is_public&is_public=eq.false',
      { headers: headers() }
    );
    assert.ok(result.status === 200, 'status ' + result.status);
    assert.deepStrictEqual(result.body, []);
  });

  await test('anon cannot read profiles', async function () {
    var result = await api('/rest/v1/profiles?select=id,email', { headers: headers() });
    assert.ok(result.status === 401 || result.status === 403 || result.status === 404, 'status ' + result.status);
  });

  await test('anon cannot insert questions', async function () {
    var result = await api('/rest/v1/questions', {
      method: 'POST',
      headers: headers({
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      }),
      body: JSON.stringify({
        title: 'anon should fail',
        body: 'anon should fail',
        related_ai: 'homepage'
      })
    });
    assert.ok(result.status >= 400, 'status ' + result.status);
  });

  await test('anon cannot call admin RPCs', async function () {
    var reply = await api('/rest/v1/rpc/admin_reply_to_question', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        p_question_id: '00000000-0000-0000-0000-000000000000',
        p_body: 'should fail'
      })
    });
    var publish = await api('/rest/v1/rpc/admin_set_question_public', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        p_question_id: '00000000-0000-0000-0000-000000000000',
        p_is_public: true
      })
    });
    var admin = await api('/rest/v1/rpc/is_admin', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: '{}'
    });
    assert.ok(reply.status >= 400, 'reply status ' + reply.status);
    assert.ok(publish.status >= 400, 'publish status ' + publish.status);
    assert.ok(admin.status >= 400, 'is_admin status ' + admin.status);
  });

  await test('anon profile embed does not expose emails', async function () {
    var result = await api(
      '/rest/v1/questions?select=id,title,profiles(email)',
      { headers: headers() }
    );
    if (result.status === 200) {
      (result.body || []).forEach(function (row) {
        assert.ok(!row.profiles || !row.profiles.email);
      });
    } else {
      assert.ok(result.status >= 400, 'status ' + result.status);
    }
  });

  console.log('\n' + passed + ' smoke tests passed');
}

run().catch(function (err) {
  console.error('FAIL', err && err.stack ? err.stack : err);
  process.exit(1);
});
