-- Real, cumulative engagement counters per property (views + favorites),
-- so "indicadores en tiempo real" reflects genuine activity rather than a
-- fabricated live-viewer count. Both start at 0 and only grow from real
-- page loads / favorite actions.
ALTER TABLE developer_properties ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE developer_properties ADD COLUMN favorite_count INTEGER NOT NULL DEFAULT 0;
