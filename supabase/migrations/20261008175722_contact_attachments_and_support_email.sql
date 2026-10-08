-- Contact form: up to 5 attachments (20 MB in all) and the e-mail to the support inbox.
--
--   * contact_requests.attachment_path (one file) becomes attachment_paths text[]: at most
--     5 paths, each of the shape the old column accepted.
--   * Bucket contact-attachments: 20 MB per object (was 10 MB). The 20 MB total of one
--     message is enforced by submit_contact_request() from the stored objects' sizes.
--   * submit_contact_request() takes p_attachment_paths text[] instead of p_attachment_path.
--     Same ownership rule per path: a member's own folder, `guest/` for the server route.
--   * Template contact_request_received: the internal e-mail sent to the support inbox with
--     the message and its attachments (French base, English published; staff read French).
--
-- Nothing reads the old column outside the guard trigger, rebuilt below.

update storage.buckets set file_size_limit = 20971520 where id = 'contact-attachments';   -- 20 MB

create or replace function private.valid_contact_attachment_paths(p_paths text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p_paths) <= 5
     and not exists (select 1 from unnest(p_paths) as p(path)
                      where p.path is null or p.path !~ '^[A-Za-z0-9][A-Za-z0-9/_.-]*$' or p.path ~ '\.\.');
$$;

revoke all on function private.valid_contact_attachment_paths(text[]) from public;

alter table public.contact_requests
  add column attachment_paths text[] not null default '{}'
  constraint contact_requests_attachment_paths_check check (private.valid_contact_attachment_paths(attachment_paths));

update public.contact_requests set attachment_paths = array[attachment_path] where attachment_path is not null;

alter table public.contact_requests drop column attachment_path;

comment on column public.contact_requests.attachment_paths is
  'Objects of the private bucket contact-attachments (<user_id>/… for members, guest/… for visitors): at most 5, 20 MB in all.';

-- The guard trigger froze the customer's words, attachment included.
create or replace function private.guard_contact_request_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if not private.is_trusted_backend() then
    if new.id is distinct from old.id or new.ticket_number is distinct from old.ticket_number
       or new.user_id is distinct from old.user_id or new.name is distinct from old.name
       or new.email is distinct from old.email or new.order_reference is distinct from old.order_reference
       or new.order_id is distinct from old.order_id or new.category is distinct from old.category
       or new.subject is distinct from old.subject or new.message is distinct from old.message
       or new.locale is distinct from old.locale or new.attachment_paths is distinct from old.attachment_paths
       or new.created_at is distinct from old.created_at
       or new.first_response_at is distinct from old.first_response_at
       or new.resolved_at is distinct from old.resolved_at then
      raise exception 'contact_requests: only status, priority and assignee can change' using errcode = '42501';
    end if;
    if new.assigned_to is not null and new.assigned_to is distinct from old.assigned_to
       and not exists (select 1 from public.profiles p join public.roles r on r.key = p.role
                        where p.id = new.assigned_to and r.is_staff and p.status = 'active') then
      raise exception 'contact_requests: assign to an active team member' using errcode = '23514';
    end if;
  end if;
  if old.status = 'new' and new.status <> 'new' and new.first_response_at is null then
    new.first_response_at := now();
  end if;
  if new.status in ('resolved', 'closed') and old.status not in ('resolved', 'closed') then
    new.resolved_at := now();
  elsif new.status not in ('resolved', 'closed') then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- submit_contact_request(): several attachments
-- -----------------------------------------------------------------------------
drop function public.submit_contact_request(text, text, text, text, text, text, text, text);

create or replace function public.submit_contact_request(
  p_name             text,
  p_email            text,
  p_category         text,
  p_subject          text,
  p_message          text,
  p_order_reference  text default null,
  p_locale           text default 'fr',
  p_attachment_paths text[] default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_role     text := private.caller_jwt_role();
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_ref      text := nullif(upper(btrim(coalesce(p_order_reference, ''))), '');
  v_paths    text[] := coalesce(p_attachment_paths, '{}');
  v_path     text;
  v_bytes    bigint;
  v_order_id uuid;
  v_ticket   text;
begin
  if v_user is null and v_role <> 'service_role' then
    raise exception 'submit_contact_request: sign in or use the contact form' using errcode = '42501';
  end if;
  if v_user is not null and not exists (select 1 from public.profiles where id = v_user and status = 'active') then
    raise exception 'submit_contact_request: account is not active' using errcode = '42501';
  end if;
  if not private.hit_rate_limit('contact', coalesce(v_user::text, v_email), 3, interval '10 minutes') then
    raise exception 'submit_contact_request: too many messages, please try again later' using errcode = 'PT429';
  end if;
  if char_length(btrim(coalesce(p_message, ''))) < 20 or nullif(btrim(p_name), '') is null
     or nullif(btrim(p_subject), '') is null then
    raise exception 'submit_contact_request: name, subject and a message of at least 20 characters are required'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.languages where code = p_locale and is_enabled) then
    p_locale := 'fr';
  end if;

  if cardinality(v_paths) > 0 then
    if not private.valid_contact_attachment_paths(v_paths) or (select count(distinct p) from unnest(v_paths) p) <> cardinality(v_paths) then
      raise exception 'submit_contact_request: at most 5 distinct attachments' using errcode = '22023';
    end if;
    foreach v_path in array v_paths loop
      if (v_user is not null and split_part(v_path, '/', 1) <> v_user::text)
         or (v_user is null and split_part(v_path, '/', 1) <> 'guest')
         or not exists (select 1 from storage.objects o
                         where o.bucket_id = 'contact-attachments' and o.name = v_path) then
        raise exception 'submit_contact_request: attachment not found' using errcode = '42501';
      end if;
    end loop;
    select coalesce(sum((o.metadata ->> 'size')::bigint), 0) into v_bytes
      from storage.objects o where o.bucket_id = 'contact-attachments' and o.name = any (v_paths);
    if v_bytes > 20971520 then   -- 20 MB in all
      raise exception 'submit_contact_request: attachments exceed 20 MB' using errcode = '22023';
    end if;
  end if;

  -- Link the order only when it is the requester's own; never say whether it matched.
  if v_ref is not null then
    select o.id into v_order_id from public.orders o
     where o.order_number = v_ref
       and ((v_user is not null and o.user_id = v_user) or (v_user is null and lower(o.customer_email) = v_email));
  end if;

  insert into public.contact_requests
    (user_id, name, email, order_reference, order_id, category, subject, message, locale, attachment_paths,
     priority)
  values
    (v_user, btrim(p_name), v_email, v_ref, v_order_id, p_category, btrim(p_subject), btrim(p_message), p_locale,
     v_paths, case when p_category = 'privacy' then 'high' else 'normal' end)
  returning ticket_number into v_ticket;
  return v_ticket;
exception
  when check_violation then
    raise exception 'submit_contact_request: invalid field (%)', sqlerrm using errcode = '22023';
end;
$$;

comment on function public.submit_contact_request(text, text, text, text, text, text, text, text[]) is
  'Contact form. Members: with their JWT (attachments in their folder). Guests: via the submit-contact-request Edge Function with the service role (attachments under guest/). At most 5 attachments, 20 MB in all. Throttled: 3 per 10 minutes per account or e-mail.';

revoke all on function public.submit_contact_request(text, text, text, text, text, text, text, text[]) from public, anon;
grant execute on function public.submit_contact_request(text, text, text, text, text, text, text, text[]) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Per-address throttle of the visitor route (service role only)
-- -----------------------------------------------------------------------------
-- The Edge Function calls it with a hash of the caller's IP before doing any work: 10 attempts
-- per 10 minutes. The database keeps its own limit per e-mail / account on top.
create or replace function public.contact_ip_allowed(p_ip_hash text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.hit_rate_limit('contact_ip', p_ip_hash, 10, interval '10 minutes');
$$;

revoke all on function public.contact_ip_allowed(text) from public, anon, authenticated;
grant execute on function public.contact_ip_allowed(text) to service_role;

-- -----------------------------------------------------------------------------
-- The e-mail to the support inbox
-- -----------------------------------------------------------------------------
insert into public.email_templates (key, name, description, subject, preheader, body, variables, translation_priority) values
  ('contact_request_received', 'New contact request (support)', 'Sent to the support inbox when the contact form is submitted',
   '[{{ticket_number}}] {{category}} — {{subject}}', 'De {{name}} <{{email}}>',
   E'Nouveau message du formulaire de contact.\n\nRéférence : {{ticket_number}}\nSujet : {{category}}\nDe : {{name}} <{{email}}>\nCommande : {{order_reference}}\nPièces jointes : {{attachments}}\n\n{{message}}\n\nRépondez à cet e-mail pour écrire au client.',
   array['ticket_number', 'category', 'subject', 'name', 'email', 'order_reference', 'attachments', 'message'], 'low');

insert into public.email_template_translations (template_id, locale, subject, preheader, body, status)
select t.id, 'en', v.subject, v.preheader, v.body, 'published'
  from (values
    ('contact_request_received', '[{{ticket_number}}] {{category}} — {{subject}}', 'From {{name}} <{{email}}>',
     E'New message from the contact form.\n\nReference: {{ticket_number}}\nTopic: {{category}}\nFrom: {{name}} <{{email}}>\nOrder: {{order_reference}}\nAttachments: {{attachments}}\n\n{{message}}\n\nReply to this e-mail to write to the customer.')
  ) as v(key, subject, preheader, body)
  join public.email_templates t on t.key = v.key;
