-- AI reviews (Phase 3b, step 4): a review made by AutoQA is marked as AI and keeps its proof; a conversation can be held
-- for a person; the company's AI review rules (agents told, channels).
ALTER TABLE reviews ADD CONSTRAINT reviews_source CHECK (
  source IN ('human', 'ai') AND (ai IS NULL OR (jsonb_typeof(ai) = 'object' AND length(ai::text) <= 200000))
);
--> statement-breakpoint
ALTER TABLE conversations ADD CONSTRAINT conversations_ai_hold CHECK (ai_hold IN ('', 'injection'));
--> statement-breakpoint
ALTER TABLE ai_settings ADD CONSTRAINT ai_settings_reviews CHECK (
  jsonb_typeof(reviews) = 'object' AND length(reviews::text) <= 2000
);
--> statement-breakpoint
-- What the server may change: an AI review scored again (its proof), and a conversation's hold. Whether a review is a
-- person's or AutoQA's never changes after it is made.
GRANT UPDATE (ai) ON reviews TO qsmart_app;
--> statement-breakpoint
GRANT UPDATE (ai_hold) ON conversations TO qsmart_app;
