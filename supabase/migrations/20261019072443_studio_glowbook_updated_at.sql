-- 3D Studio Glowbook: the generic updated_at trigger. private.studio_touch_updated_at()
-- (used by 20261019072230) reads design columns the Glowbook tables do not have.
drop trigger studio_showcases_touch on public.studio_showcases;
drop trigger studio_showcase_items_touch on public.studio_showcase_items;

create trigger studio_showcases_touch before update on public.studio_showcases
  for each row execute function private.set_updated_at();
create trigger studio_showcase_items_touch before update on public.studio_showcase_items
  for each row execute function private.set_updated_at();
