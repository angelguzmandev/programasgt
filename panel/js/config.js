// ============================================================
// PROGRAMASGT · Configuración del panel
// ------------------------------------------------------------
// Estas dos claves son PÚBLICAS por diseño: van en el navegador
// de cualquiera. Lo que protege los datos son las reglas RLS de
// la base (supabase/01_esquema.sql).
//
// NUNCA pongas aquí la "secret key" ni la "service_role": esas
// saltan todas las reglas y este repo es público.
// ============================================================

export const SUPABASE_URL = "https://ofsxybmioxyezjnzvvwj.supabase.co";
export const SUPABASE_CLAVE_PUBLICA = "sb_publishable_2nrl2cwnzr1JNRAXgZ0Uzg_EXFKtlff";

// Soporte de ProgramasGT (botones de "Ayuda por WhatsApp")
export const WHATSAPP_SOPORTE = "50242249306";

// Fotos: lado más largo y calidad al convertir a WebP antes de subir
export const FOTO_LADO_MAX = 1400;
export const FOTO_CALIDAD = 0.85;
