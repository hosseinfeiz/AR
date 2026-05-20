-- Replace the anon-key Bearer on the webhook with a shared secret that the
-- Edge Function validates. The secret comes from a GUC the operator sets via
-- `alter database ... set app.notify_webhook_secret = '...'` or per-session
-- via the Supabase dashboard / `supabase secrets set NOTIFY_WEBHOOK_SECRET=...`.

create or replace function public.notify_on_new_request()
returns trigger
language plpgsql
security definer
as $$
declare
  v_url    text := current_setting('app.edge_functions_url', true) || '/notify-on-new-request';
  v_secret text := current_setting('app.notify_webhook_secret', true);
begin
  if v_secret is null or v_secret = '' then
    raise notice 'notify_on_new_request: app.notify_webhook_secret is unset; skipping webhook';
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-webhook-secret', v_secret
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new)
    )
  );
  return new;
end;
$$;
