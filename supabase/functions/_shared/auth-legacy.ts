import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { errorResponse } from "./cors.ts";
export function createSupabaseClients(authHeader){
  const url=Deno.env.get('SUPABASE_URL'); 
  const anon=Deno.env.get('SUPABASE_ANON_KEY'); 
  const svc=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return {
    supabase: createClient(url, anon, {global:{headers:{Authorization:authHeader}}}),
    supabaseAdmin: createClient(url, svc)
  };
}
export async function authenticateRequest(req, options={}){
  const authHeader=req.headers.get('Authorization');
  if(!authHeader) return {user:null,supabase:null,supabaseAdmin:null,error:errorResponse(req,'Missing Authorization header',401)};
  const {supabase, supabaseAdmin}=createSupabaseClients(authHeader);
  const {data:{user}, error}=await supabase.auth.getUser();
  if(error||!user) return {user:null,supabase:null,supabaseAdmin:null,error:errorResponse(req,'Invalid or expired token',401)};
  return {user:{id:user.id, email:user.email, role:user.role}, supabase, supabaseAdmin, error:null};
}
