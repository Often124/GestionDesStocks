import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('VOTRE_PROJET')) {
    console.warn('Supabase URL ou Clé manquante. Veuillez configurer le fichier .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
