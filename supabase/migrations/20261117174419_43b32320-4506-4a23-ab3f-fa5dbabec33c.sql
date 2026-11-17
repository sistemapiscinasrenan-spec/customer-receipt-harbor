REVOKE EXECUTE ON FUNCTION public.assign_first_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_app_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_app_access(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_monthly_charges(date, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_monthly_charges(date, uuid[]) TO authenticated;