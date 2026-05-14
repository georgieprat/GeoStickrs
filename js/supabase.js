import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://bbornsnrwpqeugnmhmxb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_qPM6-sPV3CvI3dl34_161A_Jfny2BC7';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
