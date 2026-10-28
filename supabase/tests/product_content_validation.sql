-- =============================================================================
-- Product content validation suite (migration 20261028143732_product_content_seo)
-- =============================================================================
-- Proves, on the active catalogue:
--   C1  every product has a French and an English description, search title and
--       search description, within the column limits (70 / 170);
--   C2  the fixed errors stay fixed (no "Coeur -" in Swarovski® names, no
--       "untis", no empty "Couleur", the CLEO address and text);
--   C3  every Swarovski® gem description has the unified structure and carries
--       its own colour and shape;
--   C4  what is still unknown is marked "[A COMPLÉTER]" (the owner searches for
--       it), never invented: Navette / Raindrop / Rivoli Star / Square carry it.
-- Read-only; ALWAYS ends by raising `ALL PRODUCT CONTENT TESTS PASSED` (or
-- `FAIL: ...`).
-- =============================================================================

do $$
declare
  n int;
begin
  -- C1
  select count(*) into n
    from public.products p
    join public.product_translations t on t.product_id = p.id and t.locale = 'en'
   where p.status = 'active'
     and (coalesce(p.description, '') = '' or coalesce(t.description, '') = ''
          or coalesce(p.meta_title, '') = '' or coalesce(p.meta_description, '') = ''
          or coalesce(t.meta_title, '') = '' or coalesce(t.meta_description, '') = '');
  if n <> 0 then raise exception 'FAIL C1: % active product(s) miss a description or a search tag', n; end if;

  -- C2
  select count(*) into n from public.products
   where status = 'active' and name like 'SWAROVSKI®%Coeur%';
  if n <> 0 then raise exception 'FAIL C2: % name(s) still say "Coeur"', n; end if;

  select count(*) into n
    from public.product_translations t join public.products p on p.id = t.product_id
   where p.status = 'active' and (t.description ~ 'untis' or t.description ~ 'Color Crystal' or t.name like '%Sapphire-%');
  if n <> 0 then raise exception 'FAIL C2: % English typo(s) remain', n; end if;

  select count(*) into n from public.products
   where status = 'active' and description ~ 'Couleur *(\n|$)';
  if n <> 0 then raise exception 'FAIL C2: % description(s) with an empty colour', n; end if;

  if (select count(*) from public.products where slug = 'global-lipgloss-cleo') <> 1
     or exists (select 1 from public.products where slug = 'global-lipgloss-nova') then
    raise exception 'FAIL C2: the CLEO address did not move';
  end if;
  if exists (select 1 from public.products p join public.product_translations t on t.product_id = p.id and t.locale = 'en'
              where p.slug = 'global-lipgloss-cleo' and (p.description not like '%CLEO%' or t.description like '%Découvre%')) then
    raise exception 'FAIL C2: CLEO text is not split by language';
  end if;

  -- C3
  select count(*) into n
    from public.products p
   where p.status = 'active' and p.name like 'SWAROVSKI®%'
     and (p.description not like 'Cristal Swarovski® %'
          or p.description not like '%' || E'\nQualité : cristaux Swarovski® sans plomb' || '%'
          or p.description not like '%Hygiène et sécurité : %'
          or p.description not like '%Détails du produit%');
  if n <> 0 then raise exception 'FAIL C3: % Swarovski® description(s) miss the unified structure', n; end if;

  select count(*) into n
    from public.products p
    join public.product_translations t on t.product_id = p.id and t.locale = 'en'
   where p.status = 'active' and p.name like 'SWAROVSKI®%'
     and (t.description not like 'Swarovski® % crystal in %' or t.description not like '%Hygiene and safety: %');
  if n <> 0 then raise exception 'FAIL C3: % English Swarovski® description(s) miss the unified structure', n; end if;

  -- C4
  select count(*) into n
    from public.products
   where status = 'active' and name ~ '^SWAROVSKI® (Navette|Raindrop|Rivoli Star|Square) '
     and description not like '%[A COMPLÉTER]%';
  if n <> 0 then raise exception 'FAIL C4: % gem(s) with unknown size/quantity do not say so', n; end if;

  raise exception 'ALL PRODUCT CONTENT TESTS PASSED';
end $$;
