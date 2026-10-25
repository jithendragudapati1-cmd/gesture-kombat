import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const arenaState = sqliteTable('arena_state', {
 id: text('id').primaryKey(),
 version: integer('version').notNull().default(0),
 value: text('value').notNull(),
});
