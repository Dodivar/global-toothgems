-- =============================================================================
-- Training media folders and thumbnails validation suite
-- (migration `…_training_media_folders`, decision 104).
-- =============================================================================
-- Requires all migrations. ONE transaction, ALWAYS rolled back by raising
-- `ALL TRAINING MEDIA FOLDER TESTS PASSED` (or `FAIL: ...`).
-- Covers: a manager creates, renames and fills a folder; duplicate names
-- refused whatever the case; thumbnail paths bound to their file; deleting a
-- folder unfiles its files and keeps them; read-only staff read but cannot
-- write; a member reads and writes nothing.
-- =============================================================================

do $$
declare
  mgr   uuid := '00000000-0000-4000-a000-000000270001';  -- manager: manage_training
  vwr   uuid := '00000000-0000-4000-a000-000000270002';  -- viewer: staff, read only
  cst   uuid := '00000000-0000-4000-a000-000000270003';  -- member
  m1    uuid := '00000000-0000-4000-a000-0000002700a1';
  m2    uuid := '00000000-0000-4000-a000-0000002700a2';
  f1    uuid;
  n     integer;
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (mgr, 'authenticated', 'authenticated', 'media27mgr.test@example.invalid', now(), now()),
    (vwr, 'authenticated', 'authenticated', 'media27vwr.test@example.invalid', now(), now()),
    (cst, 'authenticated', 'authenticated', 'media27cst.test@example.invalid', now(), now());
  update public.profiles set role = 'manager' where id = mgr;
  update public.profiles set role = 'viewer' where id = vwr;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);

  insert into public.training_media (id, kind, storage_path, mime_type, name, bytes) values
    (m1, 'image', 'media/' || m1 || '/schema.jpg', 'image/jpeg', 'Schéma', 1000),
    (m2, 'image', 'media/' || m2 || '/diagram.jpg', 'image/jpeg', 'Diagram', 1000);

  -- F1: a manager creates and renames a folder, and files media into it ---------------
  insert into public.training_media_folders (name) values ('Images anglaises') returning id into f1;
  update public.training_media_folders set name = 'Images EN' where id = f1;
  update public.training_media set folder_id = f1 where id in (m1, m2);
  select count(*) into n from public.training_media where folder_id = f1;
  if n <> 2 then
    raise exception 'FAIL F1: files not filed (%)', n;
  end if;
  passed := passed || 'F1'::text;

  -- F2: names are unique whatever the case, and never blank or padded ----------------
  begin
    insert into public.training_media_folders (name) values ('images en');
    raise exception 'FAIL F2: a duplicate folder name was accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.training_media_folders (name) values ('   ');
    raise exception 'FAIL F2: a blank folder name was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.training_media_folders (name) values (' Padded ');
    raise exception 'FAIL F2: an untrimmed folder name was accepted';
  exception when check_violation then null;
  end;
  passed := passed || 'F2'::text;

  -- F3: a thumbnail sits in its own file's folder, never on the original --------------
  update public.training_media set thumb_path = 'media/' || m1 || '/_thumb.webp' where id = m1;
  begin
    update public.training_media set thumb_path = 'media/' || m1 || '/_thumb.webp' where id = m2;
    raise exception 'FAIL F3: a thumbnail of another file was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.training_media set thumb_path = storage_path where id = m2;
    raise exception 'FAIL F3: the original accepted as its own thumbnail';
  exception when check_violation then null;
  end;
  passed := passed || 'F3'::text;

  -- F4: read-only staff read the folders but change nothing ---------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', vwr, 'role', 'authenticated')::text, true);
  select count(*) into n from public.training_media_folders where id = f1;
  if n <> 1 then
    raise exception 'FAIL F4: staff cannot read the folders';
  end if;
  begin
    insert into public.training_media_folders (name) values ('Viewer folder');
    raise exception 'FAIL F4: read-only staff created a folder';
  exception when insufficient_privilege then null;
  end;
  update public.training_media_folders set name = 'Renamed by viewer' where id = f1;
  delete from public.training_media_folders where id = f1;
  update public.training_media set folder_id = null where id = m1;
  perform set_config('role', 'postgres', true);
  if (select name from public.training_media_folders where id = f1) is distinct from 'Images EN' then
    raise exception 'FAIL F4: read-only staff renamed or deleted a folder';
  end if;
  if (select folder_id from public.training_media where id = m1) is distinct from f1 then
    raise exception 'FAIL F4: read-only staff moved a file';
  end if;
  perform set_config('role', 'authenticated', true);
  passed := passed || 'F4'::text;

  -- F5: a member sees no folder and writes none ---------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', cst, 'role', 'authenticated')::text, true);
  select count(*) into n from public.training_media_folders;
  if n <> 0 then
    raise exception 'FAIL F5: a member reads the folders';
  end if;
  begin
    insert into public.training_media_folders (name) values ('Member folder');
    raise exception 'FAIL F5: a member created a folder';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'F5'::text;

  -- F6: deleting a folder unfiles its files and keeps them ----------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  delete from public.training_media_folders where id = f1;
  select count(*) into n from public.training_media where id in (m1, m2) and folder_id is null;
  if n <> 2 then
    raise exception 'FAIL F6: files lost or still filed after their folder was deleted (%)', n;
  end if;
  passed := passed || 'F6'::text;

  reset role;
  raise exception 'ALL TRAINING MEDIA FOLDER TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
