-- SCRIPT DE CRIAÇÃO DAS TABELAS DO HYDRARANK NO SUPABASE
-- Copie e cole todo este código na seção "SQL Editor" do painel do seu Supabase.
-- Clique em "Run" (Executar) para criar todas as tabelas necessárias.

-- 1. Tabela de Perfis de Usuários
CREATE TABLE IF NOT EXISTS public.profiles (
  email text PRIMARY KEY,
  username text NOT NULL,
  avatar text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabela de Registros de Água
CREATE TABLE IF NOT EXISTS public.water_logs (
  id text PRIMARY KEY,
  email text NOT NULL REFERENCES public.profiles(email) ON DELETE CASCADE,
  date text NOT NULL, -- Formato: YYYY-MM-DD
  amount integer NOT NULL, -- Em mililitros (ml)
  timestamp timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabela de Códigos de Verificação (Auth)
CREATE TABLE IF NOT EXISTS public.verification_codes (
  email text PRIMARY KEY,
  code text NOT NULL,
  expires_at timestamp with time zone NOT NULL
);

-- 4. Tabela de Sessões Ativas (Auth)
CREATE TABLE IF NOT EXISTS public.sessions (
  token text PRIMARY KEY,
  email text NOT NULL REFERENCES public.profiles(email) ON DELETE CASCADE,
  expires_at timestamp with time zone NOT NULL
);

-- Configurações de Políticas de Segurança (Row Level Security - RLS)
-- Para que sua aplicação web (e seu backend) consiga ler/escrever livremente de forma simplificada:
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Apagar políticas antigas se existirem
DROP POLICY IF EXISTS "Permitir tudo para Perfis" ON public.profiles;
DROP POLICY IF EXISTS "Permitir tudo para Logs de Agua" ON public.water_logs;
DROP POLICY IF EXISTS "Permitir tudo para Codigos de Verificacao" ON public.verification_codes;
DROP POLICY IF EXISTS "Permitir tudo para Sessoes" ON public.sessions;

-- Criar políticas generosas (Permitem todo acesso pois o controle é feito no backend)
CREATE POLICY "Permitir tudo para Perfis" ON public.profiles USING (true) WITH CHECK (true);
CREATE POLICY "Permitir tudo para Logs de Agua" ON public.water_logs USING (true) WITH CHECK (true);
CREATE POLICY "Permitir tudo para Codigos de Verificacao" ON public.verification_codes USING (true) WITH CHECK (true);
CREATE POLICY "Permitir tudo para Sessoes" ON public.sessions USING (true) WITH CHECK (true);
