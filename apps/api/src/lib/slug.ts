import { supabase } from './supabase'

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'

function randomSlug(len = 6): string {
  let s = ''
  for (let i = 0; i < len; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return s
}

export async function generateUniqueSlug(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = randomSlug()
    const { data } = await supabase.from('competitions').select('id').eq('slug', slug).maybeSingle()
    if (!data) return slug
  }
  throw new Error('Failed to generate unique slug after 5 attempts')
}
