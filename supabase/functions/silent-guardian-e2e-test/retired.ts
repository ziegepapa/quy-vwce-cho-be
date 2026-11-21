import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// E2E completed successfully on 2026-11-21. Permanently retired;
// no test endpoint may send further emails.
Deno.serve(() => Response.json({ok:false,status:"retired",message:"E2E finished"},{
 status:410,headers:{"Cache-Control":"no-store"}
}));
