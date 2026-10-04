-- =============================================================================
-- Google sign-in validation — the profile built from Google's user metadata.
-- =============================================================================
-- Requires all migrations. ONE transaction, ALWAYS rolled back by raising
-- `ALL GOOGLE SIGN-IN TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  g1 uuid := '00000000-0000-4000-a000-000000200001';
  g2 uuid := '00000000-0000-4000-a000-000000200002';
  p  public.profiles;
begin
  -- G1: Google's claims fill the profile; the role stays the default ----------
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (g1, 'authenticated', 'authenticated', 'google1.test@example.invalid',
     '{"given_name":" Léa ","family_name":"Martin","full_name":"Léa Martin","iss":"https://accounts.google.com","role":"admin"}',
     now(), now());
  select * into p from public.profiles where id = g1;
  if p.first_name <> 'Léa' or p.last_name <> 'Martin' or p.display_name <> 'Léa Martin' then
    raise exception 'FAIL G1: Google identity not copied: %', row_to_json(p);
  end if;
  if p.role <> 'customer' then raise exception 'FAIL G1: role taken from metadata: %', p.role; end if;

  -- G2: the form keys win over Google's when both are present -----------------
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (g2, 'authenticated', 'authenticated', 'google2.test@example.invalid',
     '{"first_name":"Noa","given_name":"Other","name":"Other Name"}', now(), now());
  select * into p from public.profiles where id = g2;
  if p.first_name <> 'Noa' then raise exception 'FAIL G2: form key not preferred: %', row_to_json(p); end if;

  raise exception 'ALL GOOGLE SIGN-IN TESTS PASSED (G1-G2)';
end $$;
