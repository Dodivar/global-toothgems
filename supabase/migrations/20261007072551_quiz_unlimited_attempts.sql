-- Knowledge checks are no longer limited in attempts: a learner who bought a
-- course can retake a check as often as needed until they pass it (and earn
-- the certificate), re-reading the lessons in between.
-- private.open_quiz_attempt(): no more 'no_attempts_left' refusal (a passed
-- check still refuses a new attempt). The columns and the two functions that
-- carried the settings are cleaned up in 20261007072552_quiz_unlimited_attempts_cleanup.

create or replace function private.open_quiz_attempt(p_module_id uuid, p_create boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_quiz    public.course_quizzes%rowtype;
  v_course  uuid;
  v_attempt uuid;
begin
  select q.* into v_quiz from public.course_quizzes q where q.module_id = p_module_id;
  select m.course_id into v_course from public.course_modules m where m.id = p_module_id;
  if v_quiz.id is null then
    raise exception 'learning: no_access' using errcode = '42501';
  end if;

  select a.id into v_attempt from public.quiz_attempts a
   where a.user_id = v_uid and a.module_id = p_module_id and a.status = 'open';
  if v_attempt is not null then
    return v_attempt;
  end if;
  if not p_create then
    return null;
  end if;

  if not private.learner_node_unlocked(v_uid, v_course, v_quiz.id) then
    raise exception 'learning: locked' using errcode = '22023';
  end if;
  if exists (select 1 from public.quiz_attempts a where a.user_id = v_uid and a.module_id = p_module_id and a.passed) then
    raise exception 'learning: already_passed' using errcode = '22023';
  end if;

  insert into public.quiz_attempts (user_id, course_id, module_id, quiz_id, passing_score)
  values (v_uid, v_course, p_module_id, v_quiz.id, v_quiz.passing_score)
  returning id into v_attempt;
  return v_attempt;
end;
$$;
