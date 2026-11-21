import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// The one-time Resend delivery test passed on 2026-11-21.
// Retired deliberately: allowing every valid Supabase JWT to send arbitrary
// numbers of emails would create a spam/abuse path.
Deno.serve(() => Response.json({
  ok: false,
  status: "retired",
  message: "One-time Resend delivery test completed. This endpoint no longer sends mail.",
}, { status: 410, headers: { "Cache-Control": "no-store" } }));
