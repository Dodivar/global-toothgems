-- Temporary probe (dropped by 20261007191747_promotions_quote_actor): returns the request headers PostgREST
-- received, to verify which of them the platform sets itself (`sb-forwarded-for`, `cf-connecting-ip`) and which
-- the caller can write (the first `x-forwarded-for` entry).
create or replace function public._tmp_headers() returns text language sql security invoker set search_path = '' as $$ select current_setting('request.headers', true) $$;
grant execute on function public._tmp_headers() to anon;
