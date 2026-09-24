-- =============================================================================
-- Migration 007 — Content translations (iteration 2)
-- =============================================================================
-- Language, country, currency, tax and shipping are separate dimensions; this
-- migration only covers LANGUAGE of catalogue content.
--
-- Model:
--   * base columns on categories/products/variants/media hold the DEFAULT
--     language (languages.is_default, currently 'fr');
--   * *_translations tables hold every other language, one row per
--     (entity, locale), with a draft/published review status so translations
--     are explicit and reviewable before customers see them;
--   * a missing or draft translation means "fall back to the default
--     language" — the storefront decides whether to show the fallback or
--     mark the page as unavailable (hreflang).
-- UI strings stay in the frontend i18n files; this is content only.
-- =============================================================================

create table public.languages (
  code        text primary key check (code ~ '^[a-z]{2}$'),           -- ISO 639-1, used in URLs (/fr/, /en/)
  locale      text not null check (locale ~ '^[a-z]{2}-[A-Z]{2}$'),   -- BCP 47 formatting locale
  name        text not null,
  native_name text not null,
  is_default  boolean not null default false,
  is_enabled  boolean not null default false,
  position    integer not null default 0 check (position >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.languages is
  'Content languages. is_default = language of the base columns; is_enabled = offered on the storefront.';

-- Exactly one default language, and it must be enabled.
create unique index languages_one_default_idx on public.languages (is_default) where is_default;
alter table public.languages add constraint languages_default_enabled check (not is_default or is_enabled);

alter table public.languages enable row level security;

create trigger languages_set_updated_at
  before update on public.languages
  for each row execute function private.set_updated_at();

insert into public.languages (code, locale, name, native_name, is_default, is_enabled, position) values
  ('fr', 'fr-FR', 'French',     'Français',   true,  true,  1),
  ('en', 'en-GB', 'English',    'English',    false, true,  2),
  ('de', 'de-DE', 'German',     'Deutsch',    false, true,  3),
  ('it', 'it-IT', 'Italian',    'Italiano',   false, false, 4),
  ('es', 'es-ES', 'Spanish',    'Español',    false, false, 5),
  ('pt', 'pt-PT', 'Portuguese', 'Português',  false, false, 6),
  ('nl', 'nl-NL', 'Dutch',      'Nederlands', false, false, 7);

-- -----------------------------------------------------------------------------
-- Guard: translation rows must not target the default language (its content
-- lives in the base columns — two sources of truth would drift).
-- -----------------------------------------------------------------------------
create or replace function private.reject_default_locale_translation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.languages l where l.code = new.locale and l.is_default) then
    raise exception '%: locale % is the default language; edit the base columns instead',
      tg_table_name, new.locale using errcode = '23514';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Category translations
-- -----------------------------------------------------------------------------
create table public.category_translations (
  category_id uuid not null references public.categories (id) on delete cascade,
  locale      text not null references public.languages (code) on update cascade,
  name        text not null check (char_length(name) between 1 and 120),
  slug        text check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  status      text not null default 'draft' check (status in ('draft', 'published')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null,
  primary key (category_id, locale),
  constraint category_translations_slug_unique unique (locale, slug)
);

create index category_translations_locale_idx on public.category_translations (locale);

-- -----------------------------------------------------------------------------
-- Product translations (localized slug + SEO metadata for /<locale>/ URLs)
-- -----------------------------------------------------------------------------
create table public.product_translations (
  product_id        uuid not null references public.products (id) on delete cascade,
  locale            text not null references public.languages (code) on update cascade,
  name              text not null check (char_length(name) between 1 and 200),
  slug              text check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  short_description text check (char_length(short_description) <= 500),
  description       text,
  meta_title        text check (char_length(meta_title) <= 70),
  meta_description  text check (char_length(meta_description) <= 170),
  status            text not null default 'draft' check (status in ('draft', 'published')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles (id) on delete set null,
  primary key (product_id, locale),
  constraint product_translations_slug_unique unique (locale, slug)
);

create index product_translations_locale_idx on public.product_translations (locale);

-- Base products get SEO metadata in the default language too.
alter table public.products
  add column meta_title       text check (char_length(meta_title) <= 70),
  add column meta_description text check (char_length(meta_description) <= 170);

-- -----------------------------------------------------------------------------
-- Variant and media translations (short labels only)
-- -----------------------------------------------------------------------------
create table public.product_variant_translations (
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  locale     text not null references public.languages (code) on update cascade,
  name       text not null check (char_length(name) between 1 and 200),
  status     text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (variant_id, locale)
);

create table public.product_media_translations (
  media_id   uuid not null references public.product_media (id) on delete cascade,
  locale     text not null references public.languages (code) on update cascade,
  alt_text   text not null check (char_length(alt_text) between 1 and 300),
  status     text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (media_id, locale)
);

-- Shared triggers: default-locale guard + updated_at/updated_by.
create or replace function private.set_translation_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['category_translations', 'product_translations',
                           'product_variant_translations', 'product_media_translations']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function private.reject_default_locale_translation()',
      t || '_not_default_locale', t);
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function private.set_translation_audit()',
      t || '_audit', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges + RLS: public reads PUBLISHED translations of PUBLIC content,
-- admins manage everything.
-- -----------------------------------------------------------------------------
revoke truncate, references, trigger on public.languages, public.category_translations,
  public.product_translations, public.product_variant_translations,
  public.product_media_translations from anon, authenticated;
revoke insert, update, delete on public.languages, public.category_translations,
  public.product_translations, public.product_variant_translations,
  public.product_media_translations from anon;

create policy "languages: public reads enabled, admins read all"
  on public.languages for select to anon, authenticated
  using (is_enabled or (select private.is_admin()));
create policy "languages: admins insert"
  on public.languages for insert to authenticated with check ((select private.is_admin()));
create policy "languages: admins update"
  on public.languages for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "category_translations: public reads published, admins read all"
  on public.category_translations for select to anon, authenticated
  using (
    (status = 'published' and exists (
      select 1 from public.categories c
      where c.id = category_translations.category_id and c.is_active))
    or (select private.is_admin())
  );

create policy "product_translations: public reads published, admins read all"
  on public.product_translations for select to anon, authenticated
  using (
    (status = 'published' and exists (
      select 1 from public.products p
      where p.id = product_translations.product_id and p.status = 'active'))
    or (select private.is_admin())
  );

create policy "product_variant_translations: public reads published, admins read all"
  on public.product_variant_translations for select to anon, authenticated
  using (
    (status = 'published' and exists (
      select 1 from public.product_variants v
      join public.products p on p.id = v.product_id
      where v.id = product_variant_translations.variant_id
        and v.is_active and p.status = 'active'))
    or (select private.is_admin())
  );

create policy "product_media_translations: public reads published, admins read all"
  on public.product_media_translations for select to anon, authenticated
  using (
    (status = 'published' and exists (
      select 1 from public.product_media m
      join public.products p on p.id = m.product_id
      where m.id = product_media_translations.media_id and p.status = 'active'))
    or (select private.is_admin())
  );

do $$
declare
  t text;
begin
  foreach t in array array['category_translations', 'product_translations',
                           'product_variant_translations', 'product_media_translations']
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select private.is_admin()))',
      t || ': admins insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using ((select private.is_admin())) with check ((select private.is_admin()))',
      t || ': admins update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select private.is_admin()))',
      t || ': admins delete', t);
  end loop;
end;
$$;
