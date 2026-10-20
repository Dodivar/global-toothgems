-- 3D Studio social export logos: the generic updated_at trigger. private.studio_touch_updated_at()
-- (used by 20261019142032) reads design columns studio_share_logos does not have.
drop trigger studio_share_logos_touch_updated_at on public.studio_share_logos;

create trigger studio_share_logos_touch_updated_at before update on public.studio_share_logos
  for each row execute function private.set_updated_at();
