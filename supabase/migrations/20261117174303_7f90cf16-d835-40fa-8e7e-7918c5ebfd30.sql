-- ===== Access control =====
CREATE TYPE public.app_role AS ENUM ('admin', 'member');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_app_access(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

-- First account ever (while no admin exists) becomes admin.
CREATE OR REPLACE FUNCTION public.assign_first_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('assign_first_admin'));
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created_assign_admin
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.assign_first_admin();

-- ===== Shared helpers =====
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ===== Clients =====
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  recurring_amount numeric(10,2) NOT NULL CHECK (recurring_amount >= 0),
  due_day integer NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team reads clients" ON public.clients
  FOR SELECT TO authenticated USING (public.has_app_access(auth.uid()));
CREATE POLICY "Team creates clients" ON public.clients
  FOR INSERT TO authenticated WITH CHECK (public.has_app_access(auth.uid()));
CREATE POLICY "Team updates clients" ON public.clients
  FOR UPDATE TO authenticated USING (public.has_app_access(auth.uid()))
  WITH CHECK (public.has_app_access(auth.uid()));

CREATE OR REPLACE FUNCTION public.clients_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.name = btrim(NEW.name);
  IF TG_OP = 'INSERT' THEN
    IF NOT NEW.is_active AND NEW.deactivated_at IS NULL THEN NEW.deactivated_at = now(); END IF;
  ELSE
    NEW.updated_at = now();
    IF OLD.is_active AND NOT NEW.is_active THEN NEW.deactivated_at = now(); END IF;
    IF NOT OLD.is_active AND NEW.is_active THEN NEW.deactivated_at = NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER clients_before_write BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.clients_before_write();

-- ===== Monthly charges =====
CREATE TYPE public.charge_status AS ENUM ('pending', 'paid');

CREATE TABLE public.monthly_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  client_name_snapshot text NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  due_date date NOT NULL,
  reference_month date NOT NULL CHECK (extract(day FROM reference_month) = 1),
  status public.charge_status NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monthly_charges_client_month_unique UNIQUE (client_id, reference_month),
  CONSTRAINT monthly_charges_due_in_month CHECK (date_trunc('month', due_date::timestamp)::date = reference_month),
  CONSTRAINT monthly_charges_paid_at_only_when_paid CHECK (status = 'paid' OR paid_at IS NULL)
);
CREATE INDEX monthly_charges_reference_month_idx ON public.monthly_charges (reference_month);
GRANT SELECT, INSERT, UPDATE ON public.monthly_charges TO authenticated;
GRANT ALL ON public.monthly_charges TO service_role;
ALTER TABLE public.monthly_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team reads charges" ON public.monthly_charges
  FOR SELECT TO authenticated USING (public.has_app_access(auth.uid()));
CREATE POLICY "Team creates charges" ON public.monthly_charges
  FOR INSERT TO authenticated WITH CHECK (public.has_app_access(auth.uid()));
CREATE POLICY "Team updates charges" ON public.monthly_charges
  FOR UPDATE TO authenticated USING (public.has_app_access(auth.uid()))
  WITH CHECK (public.has_app_access(auth.uid()));

-- Generated charges keep their snapshot forever; only the payment status may change.
CREATE OR REPLACE FUNCTION public.monthly_charges_before_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.client_name_snapshot IS DISTINCT FROM OLD.client_name_snapshot
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.reference_month IS DISTINCT FROM OLD.reference_month THEN
    RAISE EXCEPTION 'Cobranças geradas não podem ter nome, valor ou vencimento alterados';
  END IF;
  IF NEW.status = 'paid' AND OLD.status = 'pending' THEN
    NEW.paid_at = COALESCE(NEW.paid_at, now());
  ELSIF NEW.status = 'pending' THEN
    NEW.paid_at = NULL;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER monthly_charges_before_update BEFORE UPDATE ON public.monthly_charges
  FOR EACH ROW EXECUTE FUNCTION public.monthly_charges_before_update();

-- Creates only the missing charges of a month for active clients (optionally a subset).
CREATE OR REPLACE FUNCTION public.generate_monthly_charges(p_month date, p_client_ids uuid[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_month date := date_trunc('month', p_month::timestamp)::date;
  v_last_day integer := extract(day FROM (date_trunc('month', p_month::timestamp) + interval '1 month - 1 day'))::integer;
  v_count integer;
BEGIN
  IF NOT public.has_app_access(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;
  INSERT INTO public.monthly_charges (client_id, client_name_snapshot, amount, due_date, reference_month)
  SELECT c.id, c.name, c.recurring_amount,
         make_date(extract(year FROM v_month)::int, extract(month FROM v_month)::int, least(c.due_day, v_last_day)),
         v_month
  FROM public.clients c
  WHERE c.is_active
    AND (p_client_ids IS NULL OR c.id = ANY (p_client_ids))
  ON CONFLICT (client_id, reference_month) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_monthly_charges(date, uuid[]) TO authenticated;

-- ===== Initial portfolio =====
INSERT INTO public.clients (name, recurring_amount, due_day) VALUES
  ('Guilherme Barion', 350.00, 5), ('Danilo', 250.00, 5), ('Lúcia', 300.00, 5),
  ('Márcio', 200.00, 5), ('Escola', 990.00, 5), ('Marcelo', 200.00, 5),
  ('Cláudio', 220.00, 5), ('Thiago', 220.00, 5), ('Condomínio', 600.00, 5),
  ('Arleide', 250.00, 5), ('Mayra', 220.00, 5), ('Wilson', 180.00, 5),
  ('Diego', 230.00, 10), ('MF Rural', 900.00, 10), ('Renata', 300.00, 10),
  ('Luís', 250.00, 10), ('Ana', 220.00, 10), ('Claudiney', 220.00, 10),
  ('Washington', 230.00, 10), ('Elias', 200.00, 10), ('Renato', 150.00, 10),
  ('Toninho', 180.00, 15), ('Daniel', 180.00, 15), ('Fabrício', 220.00, 15),
  ('Everton', 180.00, 15), ('Reginaldo', 200.00, 17),
  ('Jorge', 220.00, 20), ('Casquinha', 220.00, 20), ('Jeferson', 230.00, 20),
  ('Carol', 220.00, 20), ('Rosana', 500.00, 20),
  ('Vitória', 200.00, 25), ('Renata Cavalari', 230.00, 26), ('Paulo', 220.00, 30);

INSERT INTO public.clients (name, recurring_amount, due_day, is_active) VALUES ('Karime', 200.00, 10, false);

-- November 2026 charges with known statuses (payment dates unknown -> paid_at NULL).
INSERT INTO public.monthly_charges (client_id, client_name_snapshot, amount, due_date, reference_month, status)
SELECT c.id, c.name, c.recurring_amount, make_date(2026, 11, c.due_day), DATE '2026-11-01',
       CASE WHEN c.name IN (
         'Guilherme Barion','Lúcia','Márcio','Escola','Marcelo','Cláudio','Thiago','Condomínio','Arleide','Mayra','Wilson',
         'Diego','MF Rural','Renata','Luís','Ana','Claudiney','Washington','Elias','Renato',
         'Casquinha'
       ) THEN 'paid'::public.charge_status ELSE 'pending'::public.charge_status END
FROM public.clients c
WHERE c.is_active;