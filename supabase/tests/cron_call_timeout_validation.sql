-- =============================================================================
-- Validation: migration 20261112224251_cron_call_timeout
--   * private.call_email_function() waits 60 s (timeout_milliseconds 60000);
--   * it still refuses an unknown function and knows the four sweeps;
--   * nobody but the server can call it.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL CRON CALL TIMEOUT TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================
do $$
declare
  v_def   text := pg_get_functiondef('private.call_email_function(text)'::regprocedure);
  v_state text;
  v_name  text;
begin
  if v_def not like '%timeout_milliseconds := 60000%' then
    raise exception 'FAIL CT1: call_email_function does not wait 60 s';
  end if;

  foreach v_name in array array['deliver-gift-cards', 'send-pending-emails', 'sync-newsletter-contacts', 'purge-storage-objects'] loop
    if position(quote_literal(v_name) in v_def) = 0 then
      raise exception 'FAIL CT2: call_email_function forgot %', v_name;
    end if;
  end loop;

  begin
    perform private.call_email_function('not-a-function');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL CT3: unknown function accepted (%)', v_state; end if;

  if has_function_privilege('anon', 'private.call_email_function(text)', 'execute')
     or has_function_privilege('authenticated', 'private.call_email_function(text)', 'execute') then
    raise exception 'FAIL CT4: call_email_function callable from the API roles';
  end if;

  raise exception 'ALL CRON CALL TIMEOUT TESTS PASSED (4 groups, rolled back)';
end;
$$;
