-- Performance index for sticker queries
-- Speeds up the most common sticker queries:
-- 1. Ordered by use_count DESC (default grid view)
-- 2. Filtered by category
-- 3. Filtered by is_favorite
-- 4. Duplicate detection by image_url

-- Main query index (use_count ordering)
CREATE INDEX IF NOT EXISTS idx_stickers_use_count_desc
  ON stickers (use_count DESC NULLS LAST);

-- Category filter
CREATE INDEX IF NOT EXISTS idx_stickers_category
  ON stickers (category);

-- Favorites filter
CREATE INDEX IF NOT EXISTS idx_stickers_favorites
  ON stickers (is_favorite)
  WHERE is_favorite = true;

-- Duplicate detection (unique constraint on image_url)
CREATE UNIQUE INDEX IF NOT EXISTS idx_stickers_image_url_unique
  ON stickers (image_url);

-- Uploaded by (for user-specific queries)
CREATE INDEX IF NOT EXISTS idx_stickers_uploaded_by
  ON stickers (uploaded_by)
  WHERE uploaded_by IS NOT NULL;
