import { useCallback } from "react";
import MemberManagement, { type MemberRequest } from "./MemberManagement";
import type { AppLocale } from "../lib/locale";

export default function LocalMemberManagement({ locale, ownerId, token }: { locale: AppLocale; ownerId: string; token: string }) {
  const request = useCallback<MemberRequest>(async body => {
    const r = await fetch("http://127.0.0.1:8000/", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ ...body, ownerId }), cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    const data = await r.json();
    return { status: r.status, members: data.members };
  }, [ownerId, token]);
  return <MemberManagement key={ownerId} request={request} locale={locale}/>;
}
