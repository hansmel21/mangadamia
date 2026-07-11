ALTER TABLE "Page" DROP COLUMN IF EXISTS "headers";

-- Purge cached material from providers removed by the compliance release.
-- Related chapters and pages are removed through their foreign-key cascades.
DELETE FROM "Series" WHERE "source" IN ('asura', 'weebcentral');
