import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";

// A game campaign / session container
export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default("Nova Campanha"),
  masterProfile: text("master_profile").notNull().default("balanced"),
  // Full extracted rules text from all uploaded PDFs (concatenated).
  rulesText: text("rules_text").notNull().default(""),
  // Page-by-page text so the Master can search/consult the rulebook.
  pages: jsonb("pages")
    .$type<{ file: string; page: number; text: string }[]>()
    .default([]),
  // Game system identified by the AI from the PDF.
  systemName: text("system_name").notNull().default(""),
  systemSummary: text("system_summary").notNull().default(""),
  files: jsonb("files").$type<{ name: string; chars: number }[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Character sheet linked to a game
export const characters = pgTable("characters", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Aventureiro"),
  data: jsonb("data").$type<CharacterData>().notNull(),
  complete: boolean("complete").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Chat messages between the player and the AI game master
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  meta: jsonb("meta").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CharacterData = {
  concept?: string;
  race?: string;
  class?: string;
  level?: number;
  attributes?: Record<string, string | number>;
  resources?: string;
  skills?: string;
  equipment?: string;
  background?: string;
  notes?: string;
};

export type Game = typeof games.$inferSelect;
export type Character = typeof characters.$inferSelect;
export type Message = typeof messages.$inferSelect;
