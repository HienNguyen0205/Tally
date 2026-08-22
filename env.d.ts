declare module '@env' {
  export const SUPABASE_URL: string;
  export const SUPABASE_ANON_KEY: string;
  /** Base URL of the embedding server, e.g. https://tally-be.onrender.com -
   *  no path, the client appends /embed. Empty or absent disables face
   *  recognition, which is a supported state. */
  export const ARCFACE_API_URL: string;
  export const ARCFACE_TOKEN: string;
}
