-- Cosmetic: the two Quick Game automations (20260928220000) took sort_order
-- 154 and 155, which new_match and liked_you already used, so the admin list
-- interleaved them with the matchmaking notifications. Move those two down a
-- step so the Quick Game rows sit directly after match_claimed (153).
-- Nothing about sending changes; sort_order only orders /admin/notifications.

update public.notification_automations set sort_order = 156 where key = 'new_match';
update public.notification_automations set sort_order = 157 where key = 'liked_you';
