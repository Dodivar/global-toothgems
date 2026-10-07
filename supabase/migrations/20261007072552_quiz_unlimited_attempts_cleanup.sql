-- Follow-up of 20261007072551_quiz_unlimited_attempts: knowledge checks have no
-- attempt settings any more. admin_save_course() and private.learner_course_json()
-- are rewritten without allow_retry / max_attempts (patched from their current
-- definitions; a no-op once done), then the two columns are dropped.
do $fix$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.admin_save_course(jsonb)'::regprocedure) into v_def;
  v_new := replace(v_def, 'passing_score, allow_retry, max_attempts, shuffle_answers,', 'passing_score, shuffle_answers,');
  v_new := regexp_replace(v_new, 'coalesce\(\(v_quiz ->> ''allow_retry''\)::boolean, true\),\s*coalesce\(\(v_quiz ->> ''max_attempts''\)::smallint, 3\),\s*', '');
  v_new := regexp_replace(v_new, '\s*allow_retry\s+= excluded\.allow_retry,', '');
  v_new := regexp_replace(v_new, '\s*max_attempts\s+= excluded\.max_attempts,', '');
  if v_new like '%allow_retry%' or v_new like '%max_attempts%' then
    raise exception 'admin_save_course: rewrite failed';
  end if;
  if v_new <> v_def then execute v_new; end if;

  select pg_get_functiondef('private.learner_course_json(uuid)'::regprocedure) into v_def;
  v_new := regexp_replace(v_def, '\s*''allow_retry'', q\.allow_retry,', '');
  v_new := regexp_replace(v_new, '\s*''max_attempts'', q\.max_attempts,', '');
  if v_new like '%allow_retry%' or v_new like '%max_attempts%' then
    raise exception 'learner_course_json: rewrite failed';
  end if;
  if v_new <> v_def then execute v_new; end if;
end
$fix$;

alter table public.course_quizzes drop column if exists allow_retry, drop column if exists max_attempts;
