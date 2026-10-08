-- The CHECK on contact_requests.attachment_paths runs with the privileges of whoever updates the
-- row (staff triage), so the helper must be executable by them.
grant execute on function private.valid_contact_attachment_paths(text[]) to authenticated, service_role;
