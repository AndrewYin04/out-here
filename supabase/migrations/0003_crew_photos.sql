-- New crew photos go through a member-checked server endpoint.
-- Existing seed images and the old memories bucket are left intact.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crew-photos', 'crew-photos', false, 4194304, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
