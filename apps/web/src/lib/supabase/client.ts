"use client";
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let instance: SupabaseClient | null = null;
export function createBrowserSupabaseClient(): SupabaseClient {
  if (!instance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase public environment variables are missing');
    instance = createBrowserClient(url, key);
  }
  return instance;
}
// Backward compatible named client for existing client pages.
// Proxy defers initialization until invoked in a configured browser.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, key) {
    const client = createBrowserSupabaseClient();
    const value = (client as any)[key];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});
