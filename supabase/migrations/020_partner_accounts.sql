-- Accounts for the partners Carel, Jane and Kees (managers in the Team app).
-- One Gmail inbox for all three: Gmail delivers name+anything@gmail.com to the same inbox,
-- while each login still has its own address (a login needs a unique e-mail).
-- Runs once: an address that already has an account is skipped.
do $$
declare
  p record; uid uuid;
begin
  for p in select * from (values
      ('Carel', 'wintertuinrestaurant+carel@gmail.com'),
      ('Jane',  'wintertuinrestaurant+jane@gmail.com'),
      ('Kees',  'wintertuinrestaurant+kees@gmail.com')) as v(name, email)
  loop
    if exists (select 1 from auth.users where lower(email) = p.email) then continue; end if;
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', p.email,
      extensions.crypt('wintertuin', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p.name), now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', p.email, 'email_verified', true), 'email', now(), now(), now());
    -- the sign-up trigger makes the profile; make sure it is there and set it right
    if not exists (select 1 from public.profiles where id = uid) then
      insert into public.profiles (id, full_name) values (uid, p.name);
    end if;
    update public.profiles set full_name = p.name, role = 'manager', language = 'nl', active = true where id = uid;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'email') then
      execute 'update public.profiles set email = $1 where id = $2' using p.email, uid;
    end if;
  end loop;
end $$;
