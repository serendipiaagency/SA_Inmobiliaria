-- Migration number: 0012    Optional hover/showcase video per listing
-- Nullable: stays empty until a real walkthrough clip is attached. The card
-- only offers hover-video playback and the "Vídeo" badge when this is set.

ALTER TABLE developer_properties ADD COLUMN video_url TEXT;
