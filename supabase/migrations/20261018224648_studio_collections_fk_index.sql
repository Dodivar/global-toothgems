-- 3D Studio collections: cover the composite foreign key (collection_id, user_id)
-- of the membership rows (performance advisor, unindexed_foreign_keys). The
-- primary key (collection_id, creation_id) does not cover it.
create index studio_collection_creations_collection_owner_idx
  on public.studio_collection_creations (collection_id, user_id);
