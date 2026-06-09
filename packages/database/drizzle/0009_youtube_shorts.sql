CREATE TABLE "affirmative_bot"."youtube_shorts" (
  "id" serial PRIMARY KEY NOT NULL,
  "url" text NOT NULL,
  "title" text,
  "status" text DEFAULT 'new' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "youtube_shorts_url_unique" UNIQUE("url"),
  CONSTRAINT "youtube_shorts_status_check" CHECK (status IN ('new', 'posted'))
);
