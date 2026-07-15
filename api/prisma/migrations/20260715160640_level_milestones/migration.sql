-- Seed the hunter level milestone track (titles + cosmetics; items join in
-- the items phase). Grants happen at runtime via progression.ts.
INSERT INTO "TitleDefinition" ("id", "name", "description", "rarity", "sourceType", "sortOrder") VALUES
  ('rising-hunter', 'Rising Hunter', 'Reached Hunter Level 3.', 'rare', 'level_milestone', 50),
  ('proven-hunter', 'Proven Hunter', 'Reached Hunter Level 5.', 'rare', 'level_milestone', 51),
  ('elite-hunter', 'Elite Hunter', 'Reached Hunter Level 20.', 'epic', 'level_milestone', 52),
  ('high-hunter', 'High Hunter', 'Reached Hunter Level 30.', 'legendary', 'level_milestone', 53)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "CosmeticDefinition" ("id", "name", "description", "kind", "rarity", "assetKey", "primaryColor", "secondaryColor", "sortOrder") VALUES
  ('frame-tempered', 'Tempered Halo', 'Forged at Hunter Level 10.', 'frame', 'epic', 'halo', '#6d8fc4', '#a8c4e0', 50),
  ('avatar-veteran', 'Veteran Sigil', 'Marked at Hunter Level 15.', 'avatar', 'epic', 'initial', '#56a87b', '#9ed4b5', 51),
  ('frame-transcendent', 'Transcendent Crown', 'Crowned at Hunter Level 50.', 'frame', 'legendary', 'crown', '#cda45e', '#6b5ecc', 52)
ON CONFLICT ("id") DO NOTHING;
