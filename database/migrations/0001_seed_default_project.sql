-- Seeds the default project used by single-tenant deployments.
-- The agent resolves the project by name from analytics.config.ts on boot;
-- multi-tenant deployments simply insert additional project rows.
INSERT INTO projects (name, environment)
SELECT 'default', 'production'
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE name = 'default');
