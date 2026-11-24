// Only recognized role-membership GRANT or role switching syntax is printable.
// Never print arbitrary SQL, role password hashes, SET parameter values or dump contents.
const ident='(?:[A-Za-z_][A-Za-z0-9_$]*|"[A-Za-z_][A-Za-z0-9_$.-]*")';
const roleList=ident+'(?:\\s*,\\s*'+ident+')*';
const grant=new RegExp('^\\s*GRANT\\s+'+roleList+'\\s+TO\\s+'+roleList+'(?:\\s+WITH\\s+(?:ADMIN|INHERIT|SET)\\s+(?:OPTION|TRUE|FALSE)(?:\\s*,\\s*(?:ADMIN|INHERIT|SET)\\s+(?:OPTION|TRUE|FALSE))*)?(?:\\s+GRANTED\\s+BY\\s+'+ident+')?\\s*;\\s*$','i');
const switching=new RegExp('^\\s*(?:SET\\s+(?:LOCAL\\s+|SESSION\\s+)?(?:ROLE|SESSION\\s+AUTHORIZATION)\\s+'+ident+'|RESET\\s+(?:ROLE|SESSION\\s+AUTHORIZATION))\\s*;\\s*$','i');
export function safeRoleSql(line){
 if(/password|secret|token|credential/i.test(line))return null;
 return grant.test(line)||switching.test(line)?line.trim():null;
}
export function lineKind(line){
 return line.match(/^\s*((?:CREATE|ALTER|DROP)\s+(?:ROLE|USER|TABLESPACE|DATABASE)|GRANT|REVOKE|SET|SELECT|\\(?:connect|restrict|unrestrict))\b/i)?.[1]??"OTHER";
}
// Match only the declaration of the initdb-created role, not its ALTER ROLE,
// grants or settings. Everything else stays byte-for-byte unchanged.
export function materializeBootstrap(dump,bootstrap){
 if(bootstrap!=="supabase_admin")throw Error("unexpected source bootstrap identity");
 const re=/^CREATE ROLE supabase_admin;[ \t]*$/gm;
 if([...dump.matchAll(re)].length!==1)throw Error("expected exactly one bootstrap CREATE ROLE");
 return dump.replace(re,"DO $h5_bootstrap$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE oid=10 AND rolname='supabase_admin' AND rolsuper AND rolcanlogin) THEN RAISE EXCEPTION 'H5 bootstrap identity mismatch'; END IF; END; $h5_bootstrap$;");
}
