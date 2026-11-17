-- A test run's tokens and unusable answers: never negative, and within sensible bounds (Phase 5, AI step 3).
ALTER TABLE ai_test_runs ADD CONSTRAINT ai_test_runs_usage CHECK (
  (input_tokens IS NULL OR input_tokens BETWEEN 0 AND 10000000)
  AND (output_tokens IS NULL OR output_tokens BETWEEN 0 AND 10000000)
  AND (unusable IS NULL OR unusable BETWEEN 0 AND 100)
);
