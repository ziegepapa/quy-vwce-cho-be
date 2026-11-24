import fs from "node:fs";
import {materializeBootstrap,safeRoleSql} from "./h5-full-globals-lib.mjs";
const [mode,input,output,bootstrap]=process.argv.slice(2);
const prefix=process.env.RUNNER_TEMP+"/h5-full.";
if(process.env.GITHUB_ACTIONS!=="true"||!input?.startsWith(prefix))throw Error("local runner only");
const dump=fs.readFileSync(input,"utf8");
if(mode==="inventory"){
 let n=0;
 for(const [i,line] of dump.split(/\r?\n/).entries()){
  const safe=safeRoleSql(line);
  if(safe){console.log("H5 globals role SQL line="+(i+1)+": "+safe);n++;}
 }
 console.log("H5 globals role SQL count="+n);
}else if(mode==="prepare"){
 if(!output?.startsWith(prefix)||input===output)throw Error("separate local restore file required");
 const corrected=materializeBootstrap(dump,bootstrap);
 fs.writeFileSync(output,corrected,{mode:0o600,flag:"wx"});
 console.log("H5 globals: initdb supplies original bootstrap role; one CREATE replaced by identity assertion; all ALTER/GRANT statements retained");
}else throw Error("unknown mode");
