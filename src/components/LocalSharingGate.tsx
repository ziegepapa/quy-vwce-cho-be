import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { useLocale } from "../lib/locale";
import { resolveMemberScope, type MemberScope } from "../lib/mu4SharedReader";
import AuthPage from "../pages/Auth";
import SharedMemberVault from "./SharedMemberVault";
const OWNER_BINDING = "mu4-local-owner-binding";
type Resolved = { token:string; scope:MemberScope };
export default function LocalSharingGate({ownerApp}:{ownerApp:ReactNode}) {
  const auth=useAuth(), {locale}=useLocale();
  const session=auth.session;
  const [result,setResult]=useState<Resolved|null>(null);
  const [attempt,setAttempt]=useState(0);
  const [logoutPending,setLogoutPending]=useState(false);
  const de=locale==="de";
  useEffect(()=>{
    if(!session||!auth.vaultReady||!auth.ready){setResult(null);return;}
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),12000);
    setResult(null);
    void resolveMemberScope(session,controller.signal).then(scope=>{
      if(controller.signal.aborted)return;
      if(scope.kind==="owner"){
        // The existing writable Dexie store is not multi-owner. Bind this
        // disposable browser origin to one owner; never clear another cache.
        try{const previous=localStorage.getItem(OWNER_BINDING);
          if(previous&&previous!==session.user.id)scope={kind:"locked"};
          else localStorage.setItem(OWNER_BINDING,session.user.id);
        }catch{scope={kind:"locked"};}
      }
      setResult({token:session.access_token,scope});
    }).catch(()=>{if(!controller.signal.aborted)setResult({token:session.access_token,scope:{kind:"locked"}});}).finally(()=>clearTimeout(timeout));
    return()=>{controller.abort();clearTimeout(timeout);};
  },[session,auth.ready,auth.vaultReady,attempt]);
  async function logout(){
    setLogoutPending(true);
    try{await auth.signOut();}finally{setLogoutPending(false);setResult(null);setAttempt(n=>n+1);}
  }
  if(!auth.ready)return <main className="mu4-shell" role="status">{de?"Anmeldung wird geprüft…":"Đang kiểm tra đăng nhập…"}</main>;
  if(!session||!auth.vaultReady)return <AuthPage/>;
  const resolved=result?.token===session.access_token?result.scope:null;
  if(!logoutPending&&resolved?.kind==="owner")return <>{ownerApp}</>;
  if(!logoutPending&&resolved?.kind==="member")return <SharedMemberVault key={session.user.id+":"+session.access_token+":"+resolved.ownerId} session={session} ownerId={resolved.ownerId} locale={locale} onLogout={logout}/>;
  return <main className="mu4-shell"><section className="mu4-card" role="status"><h1>{de?"Vault-Zugriff":"Quyền truy cập quỹ"}</h1><p>{resolved?.kind==="locked"?(de?"Kein freigegebener Zugriff. Verwenden Sie ein separates Browserprofil für einen anderen Eigentümer.":"Không có quyền chia sẻ. Dùng hồ sơ trình duyệt riêng cho chủ quỹ khác."):(de?"Zugriff wird geprüft…":"Đang kiểm tra quyền…")}</p><button type="button" disabled={logoutPending} onClick={()=>setAttempt(n=>n+1)}>{de?"Erneut prüfen":"Kiểm tra lại"}</button><button type="button" disabled={logoutPending} onClick={()=>void logout()}>{de?"Abmelden":"Đăng xuất"}</button></section></main>;
}
