UPDATE exhibitions
SET published_at = updated_at
WHERE status = 'PUBLISHED'
  AND published_at IS NULL;
