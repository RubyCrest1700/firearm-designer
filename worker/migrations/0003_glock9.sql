-- The Glock 17, 19 and 26 builders became one Glock 17 / 19 / 26 builder. Builds shared under the old ids move to it.
-- (Price alert signups keep their stored JSON; the Worker reads old ids there as glock9.)
UPDATE builds SET platform = 'glock9' WHERE platform IN ('glock17', 'glock19', 'glock26');
