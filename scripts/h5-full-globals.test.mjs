import test from "node:test";
import assert from "node:assert/strict";
import {safeRoleSql,materializeBootstrap} from "./h5-full-globals-lib.mjs";
test("diagnostics allow exact membership and role switch syntax, never credentials",()=>{
 for(const x of ['GRANT anon TO postgres WITH INHERIT TRUE, SET TRUE GRANTED BY supabase_admin;','GRANT anon TO postgres GRANTED BY supabase_admin;','SET SESSION AUTHORIZATION supabase_admin;','RESET ROLE;'])assert.equal(safeRoleSql(x),x);
 for(const x of ["ALTER ROLE supabase_admin PASSWORD 'fake-secret';","SET app.token = 'abc';","GRANT SELECT ON TABLE public.x TO anon;","GRANT anon TO postgres; SELECT 'secret';"])assert.equal(safeRoleSql(x),null);
});
test("bootstrap declaration alone becomes assertion, no grants or alterations removed",()=>{
 const grant="GRANT anon TO postgres WITH INHERIT TRUE GRANTED BY supabase_admin;";
 const rest="ALTER ROLE supabase_admin WITH SUPERUSER LOGIN;\n"+grant+"\n";
 const dump="CREATE ROLE supabase_admin;\n"+rest;
 const result=materializeBootstrap(dump,"supabase_admin");
 assert.ok(result.endsWith("\n"+rest));assert.match(result,/oid=10/);assert.throws(()=>materializeBootstrap(rest,"supabase_admin"));assert.throws(()=>materializeBootstrap(dump,"postgres"));assert.throws(()=>materializeBootstrap(dump+dump,"supabase_admin"));
});
