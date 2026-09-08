-- Templates for the waitlist-sweeper edge function (fixed in the same pass
-- to route through send-transactional-email instead of its own broken,
-- mis-branded local sendEmail() helper — see supabase/functions/waitlist-sweeper).

INSERT INTO "public"."email_templates" ("key", "name", "subject", "html_body", "variables", "enabled") VALUES
('waitlist_spot_offered', 'Waitlist Spot Offered', 'Your waitlist spot is ready — {{tournament_name}}',
 '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">' ||
 '<h1 style="color:#0A1228;font-size:20px">A spot just opened up!</h1>' ||
 '<p style="color:#0A1228;font-size:15px;line-height:1.5">Hi {{full_name}}, a spot has opened in <strong>{{tournament_name}}</strong> and you''re next on the waitlist.</p>' ||
 '<p style="color:#0A1228;font-size:15px;line-height:1.5"><strong>You have 24 hours to complete your registration.</strong> After that, the spot moves to the next player.</p>' ||
 '<p><a href="{{link_url}}" style="background:#C9A84C;color:#0A1228;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block">Complete Registration</a></p>' ||
 '<p style="color:#8A9DC0;font-size:12px;margin-top:32px">DreamBreakerPB · You''re receiving this because you joined the waitlist.</p></div>',
 ARRAY['full_name', 'tournament_name', 'link_url'], true),

('hold_expired', 'Hold Expired', 'Your hold for {{tournament_name}} has expired',
 '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">' ||
 '<h1 style="color:#0A1228;font-size:20px">Your hold has expired</h1>' ||
 '<p style="color:#0A1228;font-size:15px;line-height:1.5">Hi {{full_name}}, your <strong>Hold My Spot</strong> reservation for <strong>{{tournament_name}}</strong> has expired because registration wasn''t completed before the cutoff date.</p>' ||
 '<p style="color:#0A1228;font-size:15px;line-height:1.5">Your hold fee has been forfeited per our policy. Your spot has been offered to the next player on the waitlist.</p>' ||
 '<p>If you''d still like to attend, you can <a href="{{link_url}}" style="color:#C9A84C">join the waitlist</a>.</p>' ||
 '<p style="color:#8A9DC0;font-size:12px;margin-top:32px">DreamBreakerPB</p></div>',
 ARRAY['full_name', 'tournament_name', 'link_url'], true),

('waitlist_offer_expired', 'Waitlist Offer Expired', 'Waitlist offer expired — {{tournament_name}}',
 '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">' ||
 '<h1 style="color:#0A1228;font-size:20px">Waitlist offer expired</h1>' ||
 '<p style="color:#0A1228;font-size:15px;line-height:1.5">Hi {{full_name}}, your 24-hour window to register for <strong>{{tournament_name}}</strong> has passed. Your spot has been offered to the next player on the waitlist.</p>' ||
 '<p style="color:#8A9DC0;font-size:12px;margin-top:32px">DreamBreakerPB</p></div>',
 ARRAY['full_name', 'tournament_name'], true)
ON CONFLICT ("key") DO NOTHING;
