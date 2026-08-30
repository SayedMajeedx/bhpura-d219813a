-- Shared carts table for short cart links and cross-device cart sharing
CREATE TABLE IF NOT EXISTS public.shared_carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    brand_id UUID REFERENCES public.brands(id) ON DELETE CASCADE,
    brand_slug TEXT NOT NULL,
    items JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days')
);

CREATE INDEX IF NOT EXISTS idx_shared_carts_code ON public.shared_carts (code);

ALTER TABLE public.shared_carts ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'shared_carts' AND policyname = 'Allow public read shared_carts'
    ) THEN
        CREATE POLICY "Allow public read shared_carts" ON public.shared_carts
            FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'shared_carts' AND policyname = 'Allow public insert shared_carts'
    ) THEN
        CREATE POLICY "Allow public insert shared_carts" ON public.shared_carts
            FOR INSERT WITH CHECK (true);
    END IF;
END $$;
