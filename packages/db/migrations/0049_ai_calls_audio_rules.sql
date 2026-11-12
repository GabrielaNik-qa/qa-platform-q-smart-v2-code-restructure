-- Speech-to-text: a recording's length in seconds (up to 24 hours). The recording itself is never kept.
ALTER TABLE ai_calls ADD CONSTRAINT ai_calls_audio CHECK (audio_seconds BETWEEN 0 AND 86400);
