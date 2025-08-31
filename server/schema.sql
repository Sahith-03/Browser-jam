-- Create users table
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
    session_id UUID PRIMARY KEY,
    url VARCHAR(1000),
    created_by INTEGER REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create session participants table
CREATE TABLE IF NOT EXISTS session_participants (
    user_id INTEGER REFERENCES users(user_id),
    session_id UUID REFERENCES sessions(session_id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, session_id)
);

-- Create highlights table
CREATE TABLE IF NOT EXISTS highlights (
    highlight_id VARCHAR(100) PRIMARY KEY,
    session_id UUID REFERENCES sessions(session_id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(user_id),
    highlight_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create comments table
CREATE TABLE IF NOT EXISTS comments (
    comment_id SERIAL PRIMARY KEY,
    highlight_id VARCHAR(100) REFERENCES highlights(highlight_id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(user_id),
    comment_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_highlights_session ON highlights(session_id);
CREATE INDEX IF NOT EXISTS idx_comments_highlight ON comments(highlight_id);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at column to highlights if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='highlights' AND column_name='updated_at') THEN
        ALTER TABLE highlights ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Create a trigger to update the updated_at column
DROP TRIGGER IF EXISTS update_highlights_timestamp ON highlights;
CREATE TRIGGER update_highlights_timestamp
BEFORE UPDATE ON highlights
FOR EACH ROW EXECUTE FUNCTION update_timestamp();
