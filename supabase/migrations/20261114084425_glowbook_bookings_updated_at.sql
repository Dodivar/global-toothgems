-- Glowbook bookings (decision 144): the updated_at triggers use the generic
-- private.set_updated_at(); private.studio_touch_updated_at() reads creation
-- columns (name, scene_data) these tables do not have.
drop trigger glowbook_booking_settings_touch on public.glowbook_booking_settings;
drop trigger glowbook_bookings_touch on public.glowbook_bookings;
create trigger glowbook_booking_settings_touch before update on public.glowbook_booking_settings
  for each row execute function private.set_updated_at();
create trigger glowbook_bookings_touch before update on public.glowbook_bookings
  for each row execute function private.set_updated_at();
