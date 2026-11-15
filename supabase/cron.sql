-- Autonomous orchestrator heartbeat every 30 minutes (free: pg_cron + pg_net).
-- Replace <APP_URL> and <CRON_SECRET>.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('salonmind-agents-tick', '*/30 * * * *', $$
  select net.http_post(
    url := '<APP_URL>/api/agents/tick',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);
