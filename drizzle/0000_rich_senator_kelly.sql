CREATE TABLE `arena_state` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`value` text NOT NULL
);
