-- Comment only: thumbnails are stored at media/<id>/_thumb.<ext> (decision 104;
-- the leading underscore keeps them apart from any original's stored name).
comment on column public.training_media.thumb_path is
  'Small WebP preview for the library grids (media/<id>/_thumb.webp); null until drawn.';
