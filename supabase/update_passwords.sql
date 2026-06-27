-- This script updates the password for all users in the auth.users table to '113456'
-- Note: '113456' hashed with bcrypt (Supabase default)
-- However, we can't easily generate the hash here. 
-- Instead, I will use the supabase RPC or a simpler way if possible.
-- Since I don't have direct access to the auth schema via execute_sql in most cases,
-- I will try to use the admin API if available, or just use the users I know the password for.

-- If I can't update auth.users directly, I'll check if I can create a new user or if there's a way to reset.
-- Let's try to update auth.users directly first (if the service role has permissions)

UPDATE auth.users 
SET encrypted_password = crypt('113456', gen_salt('bf'))
WHERE email IN (
  'tiano.salam@gmail.com',
  'tarek.salam3@gmail.com',
  'm.elgarsha33@gmail.com',
  'smra7411@gmail.com',
  'mahmudahmed12129@gmail.com',
  'donianouraldeien@gmail.com',
  'magdymohammed4992@gmail.com',
  'm55103583@gmail.com',
  'dohamostafa657@gmail.com'
);
