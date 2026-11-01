-- One-time reset per owner decision 2026-11-01: afterwards a user's language is only changed by an explicit /lang choice.
UPDATE users SET language = 'en';
