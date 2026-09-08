SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict MMdGhcFRHJcWz7iRJqAZ86BY3sbNsddRwVeUFkpqfldphuc9dEQIsA3Fwdry61R

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES
	('tournament-covers', 'tournament-covers', NULL, '2026-06-25 02:40:43.506787+00', '2026-06-25 02:40:43.506787+00', true, false, NULL, NULL, NULL, 'STANDARD'),
	('group-photos', 'group-photos', NULL, '2026-07-08 00:05:40.038842+00', '2026-07-08 00:05:40.038842+00', true, false, NULL, NULL, NULL, 'STANDARD'),
	('message-attachments', 'message-attachments', NULL, '2026-07-10 10:19:20.551138+00', '2026-07-10 10:19:20.551138+00', true, false, NULL, NULL, NULL, 'STANDARD'),
	('avatars', 'avatars', NULL, '2026-06-13 14:21:25.468313+00', '2026-06-13 14:21:25.468313+00', true, false, 2097152, '{image/jpeg}', NULL, 'STANDARD');


--
-- PostgreSQL database dump complete
--

-- \unrestrict MMdGhcFRHJcWz7iRJqAZ86BY3sbNsddRwVeUFkpqfldphuc9dEQIsA3Fwdry61R

RESET ALL;
