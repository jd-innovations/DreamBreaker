-- DreamBreaker PB baseline companion: realtime publication membership.
-- Captured from production publication supabase_realtime.

DO $$
DECLARE
  table_name text;
  tables text[] := ARRAY[
    'bracket_matches',
    'message_reactions',
    'messages',
    'notifications',
    'registrations'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH table_name IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.%I', table_name);
    END IF;
  END LOOP;
END $$;