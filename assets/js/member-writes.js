(function (global) {
  function omitUndefined(obj) {
    var out = {};
    Object.keys(obj).forEach(function (key) {
      if (obj[key] !== undefined) {
        out[key] = obj[key];
      }
    });
    return out;
  }

  function profileInsertPayload(profile) {
    return omitUndefined({
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      organization: profile.organization,
      work_field: profile.work_field,
      privacy_agreed_at: profile.privacy_agreed_at
    });
  }

  function questionInsertPayload(question) {
    return omitUndefined({
      title: question.title,
      body: question.body,
      related_ai: question.related_ai
    });
  }

  function assertNoPrivilegedProfileFields(payload) {
    if (Object.prototype.hasOwnProperty.call(payload, 'is_admin')) {
      throw new Error('is_admin must not be sent by the client');
    }
  }

  function assertNoPrivilegedQuestionFields(payload) {
    ['author_id', 'is_public', 'status'].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        throw new Error(key + ' must not be sent by the client');
      }
    });
  }

  function insertOwnProfile(supabase, profile) {
    var payload = profileInsertPayload(profile);
    assertNoPrivilegedProfileFields(payload);
    return supabase.from('profiles').insert(payload).select().single();
  }

  function insertOwnQuestion(supabase, question) {
    var payload = questionInsertPayload(question);
    assertNoPrivilegedQuestionFields(payload);
    return supabase.from('questions').insert(payload).select().single();
  }

  global.MemberWrites = {
    profileInsertPayload: profileInsertPayload,
    questionInsertPayload: questionInsertPayload,
    insertOwnProfile: insertOwnProfile,
    insertOwnQuestion: insertOwnQuestion
  };
})(window);
