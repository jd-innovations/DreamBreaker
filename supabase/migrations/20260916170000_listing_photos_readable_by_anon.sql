-- Listing photos were never visible to a logged-out visitor.
--
-- Found by fetching the new public /marketplace/[id] page anonymously after
-- deploying it: the page rendered its "No photos" fallback for a listing with
-- three photos. Not a bug introduced by that page -- the page is simply the
-- first thing that ever read this table as `anon`.
--
-- THE CAUSE. The SELECT policy on marketplace_listing_photos was:
--
--   exists (select 1 from marketplace_listings l
--            where l.id = listing_id
--              and (l.status = 'active' or l.seller_id = auth.uid()))
--
-- RLS policy expressions are evaluated with the CALLER's column privileges,
-- and `anon` has no SELECT on marketplace_listings.seller_id -- deliberately,
-- it is the seller's identity. So the subquery raised
--
--   permission denied for table marketplace_listings
--
-- and the whole photo query failed. The policy looked permissive and was in
-- fact unusable by the role it was meant to serve.
--
-- Worth noting how it hid: the failure is a PostgREST error, and the page
-- destructures `{ data: photos }` without inspecting the error, so it read as
-- "no photos" rather than "photos are broken". The same shape would hide any
-- other policy fault on that table.
--
-- THE FIX. Route the owner half through is_listing_owner(), which already
-- exists for the DELETE policy and is SECURITY DEFINER -- so it reads
-- seller_id with the function owner's privileges rather than the caller's.
-- The public half then touches only `status`, which anon may read.
--
-- The privacy boundary is unchanged: seller_id stays ungranted to anon, and
-- this exposes no column that was not already exposed. It makes an
-- already-public row's photos actually fetchable.

drop policy if exists "marketplace_listing_photos: public read"
  on public.marketplace_listing_photos;

create policy "marketplace_listing_photos: public read"
  on public.marketplace_listing_photos
  for select
  using (
    exists (
      select 1 from public.marketplace_listings l
       where l.id = marketplace_listing_photos.listing_id
         and l.status = 'active'
    )
    -- SECURITY DEFINER, so an owner viewing their own non-active listing does
    -- not require the caller to be able to select seller_id.
    or public.is_listing_owner(marketplace_listing_photos.listing_id, auth.uid())
  );
