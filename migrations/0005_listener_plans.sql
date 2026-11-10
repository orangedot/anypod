-- 0005_listener_plans.sql
-- Add listener_plan and listener_plan_until to support Listener Pro tier without altering studio_plan

ALTER TABLE users ADD COLUMN listener_plan TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN listener_plan_until INTEGER;

-- Activate steffenklaue@gmail.com as Pro
UPDATE users 
SET listener_plan = 'pro' 
WHERE lower(replace(email, '.', '')) = 'steffenklaue@gmailcom' 
   OR lower(email) LIKE '%steffen%klaue%';
