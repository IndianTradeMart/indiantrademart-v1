-- Superadmin feature support: public notice banner + safer defaults

alter table public.system_config
  add column if not exists public_notice_enabled boolean not null default false,
  add column if not exists public_notice_message text,
  add column if not exists public_notice_variant text not null default 'info';

do $$
begin
  if not exists (
    select 1
    from public.system_config
    where config_key = 'maintenance_mode'
  ) then
    insert into public.system_config (
      config_key,
      maintenance_mode,
      maintenance_message,
      allow_vendor_registration,
      commission_rate,
      max_upload_size_mb,
      public_notice_enabled,
      public_notice_message,
      public_notice_variant,
      updated_at
    )
    values (
      'maintenance_mode',
      false,
      '',
      true,
      5,
      10,
      false,
      '',
      'info',
      now()
    );
  end if;
end $$;

