// Only print error code, line number, an allowlisted statement kind, and a
// redacted error message. The full dump/log remain temporary, never artifacts.
import fs from "node:fs";
const [logPath,dumpPath]=process.argv.slice(2);
if(process.env.GITHUB_ACTIONS!=="true"||!logPath?.startsWith(process.env.RUNNER_TEMP+"/h5-full.")||!dumpPath?.startsWith(process.env.RUNNER_TEMP+"/h5-full.")) throw Error("local runner diagnostics only");
const log=fs.readFileSync(logPath,"utf8");
const lines=fs.readFileSync(dumpPath,"utf8").split(/\r?\n/);
const failures=log.split(/\r?\n/).filter(l=>/\b(?:ERROR|FATAL|PANIC):/.test(l));
for(const l of failures){
 const match=l.match(/(?:psql:.*?):(\d+):\s*(?:ERROR|FATAL|PANIC):/);
 const n=match?Number(match[1]):null;
 const stmt=n?lines[n-1]??"":"";
 const kind=stmt.match(/^\s*((?:CREATE|ALTER|DROP)\s+(?:ROLE|USER|TABLESPACE|DATABASE)|GRANT|REVOKE|SET|SELECT|\\(?:connect|restrict|unrestrict))\b/i)?.[1]??"UNKNOWN";
 // Only standard PostgreSQL errors from synthetic dump; strip all quoted
 // literals except short SQL identifiers, and redact credential-like tokens.
 let msg=l.slice(l.search(/\b(?:ERROR|FATAL|PANIC):/))
  .replace(/'(?:''|[^'])*'/g,"'[redacted]'")
  .replace(/"([^"]*)"/g,(_,v)=>/^[a-z_][a-z0-9_.-]{0,62}$/i.test(v)?'"'+v+'"':'"[redacted]"')
  .replace(/(?:SCRAM-SHA-256\$|md5[a-f0-9]{32}|eyJ[A-Za-z0-9_-]+\.)\S*/gi,"[redacted]")
  .replace(/(?:password|secret|token)\s*(?:=|:)\s*\S+/gi,"[credential redacted]")
  .slice(0,500);
 if(/password|secret|token|credential/i.test(msg))msg=msg.match(/^(?:ERROR|FATAL|PANIC):\s*(?:[0-9A-Z]{5}:)?/)?.[0]+" [credential-related error text withheld]";
 console.log("H5 globals diagnostic: line="+(n??"unknown")+" statement="+kind+" "+msg);
}
if(!failures.length)console.log("H5 globals diagnostic: no PostgreSQL ERROR/FATAL line found; raw output withheld.");
