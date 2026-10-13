var assert = require('assert');
var path = require('path');
var AuthStatus = require(path.join(__dirname, '..', 'assets', 'js', 'auth-status.js'));

var passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('PASS ' + name);
}

test('signup with session is success', function () {
  var result = AuthStatus.classifySignupResult({ user: { id: '1', identities: [{}] }, session: {} });
  assert.strictEqual(result.kind, 'ok');
});

test('signup without session is email verification pending, not approval', function () {
  var result = AuthStatus.classifySignupResult({ user: { id: '1', identities: [{}] }, session: null });
  assert.strictEqual(result.kind, 'pending');
  assert.ok(result.message.indexOf('인증 대기') !== -1);
  assert.ok(result.message.indexOf('승인 절차는 없') !== -1);
});

test('empty identities are not reported as mail sent', function () {
  var result = AuthStatus.classifySignupResult({ user: { id: '1', identities: [] }, session: null });
  assert.strictEqual(result.kind, 'error');
  assert.ok(result.message.indexOf('발송되지 않았습니다') !== -1);
});

test('unauthorized address is a mail failure', function () {
  var result = AuthStatus.classifyAuthError({ code: 'email_address_not_authorized', message: 'Email address not authorized' });
  assert.strictEqual(result.kind, 'error');
  assert.ok(result.message.indexOf('보내지 못했습니다') !== -1);
});

test('same-address resend wait stays in email verification', function () {
  var result = AuthStatus.classifyAuthError({
    code: 'over_email_send_rate_limit',
    message: 'For security purposes, you can only request this after 48 seconds.'
  });
  assert.strictEqual(result.kind, 'pending');
  assert.ok(result.message.indexOf('인증 대기') !== -1);
  assert.ok(result.message.indexOf('48초') !== -1);
  assert.strictEqual(result.message.indexOf('가입은 완료되지 않았습니다'), -1);
});

test('project email cap is not the same-address wait', function () {
  var result = AuthStatus.classifyAuthError({
    code: 'over_email_send_rate_limit',
    message: 'Email rate limit exceeded'
  });
  assert.strictEqual(result.kind, 'error');
  assert.ok(result.message.indexOf('프로젝트 전체') !== -1);
  assert.ok(result.message.indexOf('인증 대기') !== -1);
});

test('unconfirmed login stays pending', function () {
  var result = AuthStatus.classifyAuthError({ message: 'Email not confirmed' });
  assert.ok(result.message.indexOf('인증 대기') !== -1);
});

test('signup callback without error is completion', function () {
  var callback = AuthStatus.readAuthCallback('#access_token=secret&type=signup', '');
  var result = AuthStatus.callbackMessage(callback);
  assert.strictEqual(callback.type, 'signup');
  assert.strictEqual(result.kind, 'ok');
  assert.ok(result.message.indexOf('인증이 완료') !== -1);
});

test('expired confirmation link is not an invalid-email error', function () {
  var result = AuthStatus.classifyAuthError({
    code: 'otp_expired',
    message: 'Email link is invalid or has expired'
  });
  assert.ok(result.message.indexOf('만료') !== -1);
  assert.ok(result.message.indexOf('로그인되지 않았습니다') !== -1);
});

test('callback error is not success', function () {
  var callback = AuthStatus.readAuthCallback('', '?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  var result = AuthStatus.callbackMessage(callback);
  assert.strictEqual(result.kind, 'error');
});

console.log(passed + ' passed');
