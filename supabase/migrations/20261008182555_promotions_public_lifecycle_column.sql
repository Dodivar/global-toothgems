-- Visitors read the scope, translations and products of running promotions and campaigns; the policies of those
-- child tables look at `lifecycle` of the parent, and a policy subquery needs the column privilege. Visitors only
-- ever see live rows (the parents' own policies), so the column reveals nothing.
grant select (lifecycle) on public.promotions to anon;
grant select (lifecycle) on public.campaigns to anon;
