var assert = require('assert');
var fs = require('fs');
var path = require('path');
var GoogleAuth = require(path.join(__dirname, '..', 'assets', 'js', 'google-auth.js'));

var passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('PASS ' + name);
}

test('provider flag is required before a button can exist', function () {
  assert.strictEqual(GoogleAuth.providerEnabled({ external: { google: false, email: true } }), false);
  assert.strictEqual(GoogleAuth.providerEnabled({}), false);
  assert.strictEqual(GoogleAuth.providerEnabled({ external: { google: true } }), true);
});

test('oauth arguments contain only the public redirect and provider', function () {
  var args = GoogleAuth.oauthArgs();
  assert.deepStrictEqual(args, {
    provider: 'google',
    options: {
      redirectTo: 'https://sumi19790729-dev.github.io/account.html',
      queryParams: { prompt: 'select_account' }
    }
  });
  assert.strictEqual(JSON.stringify(args).indexOf('secret'), -1);
});

test('completion payload keeps the same user id and omits admin rights', function () {
  var payload = GoogleAuth.completionPayload(
    { id: 'user-1', email: 'person@example.com' },
    {
      full_name: '박수미',
      organization: '인제대학교',
      work_field: '대학 IR',
      privacy_agreed_at: '2026-10-13T00:00:00.000Z'
    }
  );
  assert.strictEqual(payload.id, 'user-1');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(payload, 'is_admin'), false);
});

test('incomplete consent is rejected', function () {
  assert.throws(function () {
    GoogleAuth.completionPayload(
      { id: 'user-1', email: 'person@example.com' },
      { full_name: '박수미', organization: '인제대학교', work_field: '대학 IR', privacy_agreed_at: '' }
    );
  });
});

test('disabled provider hides the continue action and does not grant admin', function () {
  var loggedOut = GoogleAuth.accountModel({ signedIn: false, googleEnabled: false, profileComplete: false });
  var operator = GoogleAuth.accountModel({
    signedIn: true,
    googleEnabled: true,
    profileComplete: true,
    userId: 'same-id',
    isAdmin: true
  });
  assert.strictEqual(loggedOut.showContinue, false);
  assert.strictEqual(operator.showProfileForm, false);
  assert.strictEqual(operator.keepExistingProfile, true);
  assert.strictEqual(operator.userId, 'same-id');
  assert.strictEqual(operator.isAdmin, true);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(operator, 'showLink'), false);
});

test('enabled provider shows continue for a new user and a profile form without a role grant', function () {
  var fresh = GoogleAuth.accountModel({ signedIn: false, googleEnabled: true });
  var member = GoogleAuth.accountModel({
    signedIn: true,
    googleEnabled: true,
    profileComplete: false,
    userId: 'new-id',
    isAdmin: false
  });
  assert.strictEqual(fresh.showContinue, true);
  assert.strictEqual(member.showProfileForm, true);
  assert.strictEqual(member.keepExistingProfile, false);
  assert.strictEqual(member.isAdmin, false);
});

test('public pages do not hard-code a Google button', function () {
  ['login.html', 'signup.html', 'account.html'].forEach(function (name) {
    var html = fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
    assert.strictEqual(html.indexOf('Google 계정으로 계속하기'), -1, name);
    assert.strictEqual(html.indexOf('data-google-continue'), -1, name);
    assert.strictEqual(html.indexOf('사용 중인 Google 계정 연결'), -1, name);
  });
});

test('account linking is not implemented', function () {
  var source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'google-auth.js'), 'utf8');
  assert.strictEqual(source.indexOf('linkIdentity'), -1);
  assert.strictEqual(source.indexOf('data-google-link'), -1);
  assert.strictEqual(source.indexOf('사용 중인 Google 계정 연결'), -1);
});

console.log(passed + ' passed');
