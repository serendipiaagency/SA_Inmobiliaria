-- Migration number: 0010    Street + postal code (autocomplete facets for the search)
-- Both nullable: UAE listings commonly have no formal postal/ZIP code, so this
-- column simply stays empty until a market that uses one is added.

ALTER TABLE developer_properties ADD COLUMN street TEXT;
ALTER TABLE developer_properties ADD COLUMN postal_code TEXT;
