-- Glowbook closures: the decision is number 147 (146 was taken the same day
-- by "the Glowbook has no outside link"); 20261115154130_glowbook_closures
-- named it 146 in its comments. Comment only, no behaviour change.
comment on table public.glowbook_closures is
  'Glowbook closures (decision 147): whole local days an artist''s calendar is closed, [starts_on, ends_on]. The note is private. Written by glowbook_add_closure() / glowbook_delete_closure() only.';
