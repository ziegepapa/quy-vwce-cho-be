import{r as e}from"./rolldown-runtime-hePW80VL.js";import{i as t,n,r}from"./locale-CZeRZbDS.js";import{c as i,d as a,f as o}from"./db.m02-DzJzKKy5.js";import{W as s,X as c,Y as l,Z as u,tt as d,x as f}from"./index-BnXPuCdd.js";import{n as p,r as m,t as h}from"./localeFormatting-DruAYX9k.js";var g=e(t(),1),_=[`button`,`.nfm-actions`,`.nfm-status`,`.nfm-add`,`.nfm-del`,`.nfm-warn`,`.nfm-risk`,`.nfm-progress`,`.nfm-print-note`,`.nfm-sec-state`,`.nfm-chev`],v=`input, textarea, select`,y=`
  @page { size: A4 portrait; margin: 14mm; }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #1a1a1a;
    font-family: -apple-system, "SF Pro Text", system-ui, "Segoe UI", sans-serif;
    font-size: 11pt;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .nfm {
    display: block;
    width: 100%;
  }

  .nfm-sec,
  .nfm-sec-static {
    display: block;
    margin: 0 0 20pt;
    padding: 0;
    background: #ffffff;
    border: none;
    border-radius: 0;
    break-inside: auto;
    page-break-inside: auto;
  }

  .print-head,
  .sheet-sec-head,
  .nfm-sec-static > h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 6pt;
    padding: 0 0 6pt;
    border: none;
    border-bottom: 0.75pt solid #1a1a1a;
    font-size: 12pt;
    font-weight: 600;
    color: #1a1a1a;
    background: transparent;
    break-after: avoid;
    page-break-after: avoid;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .nfm-sec-num {
    display: inline;
    min-width: 0;
    height: auto;
    padding: 0;
    border: none;
    background: transparent;
    font-size: 11pt;
    font-weight: 600;
    color: #8a8a8a;
    font-variant-numeric: tabular-nums;
  }

  .nfm-sec-title {
    flex: 1;
    font-size: 12pt;
    font-weight: 600;
    color: #1a1a1a;
  }

  .nfm-box {
    display: block;
    border: none;
  }

  .nfm-field {
    display: block;
    padding: 8pt 0 15pt;
    border: none;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .nfm-field:last-child {
    border: none;
  }

  .nfm-field > span,
  .nfm-field > span:first-child,
  .pv-label,
  .nfm-snap-k {
    display: block;
    font-size: 8pt;
    font-weight: 600;
    letter-spacing: 0.1pt;
    text-transform: none;
    color: #6b6b6b;
    margin-bottom: 3pt;
  }

  /* Hai cột — phải còn sau khi làm phẳng, không chồng dọc */
  .nfm-row-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 18pt;
    border: none;
  }

  .nfm-row-grid .nfm-field,
  .nfm-row-grid .nfm-field:first-child {
    border: none;
  }

  .nfm-item {
    display: block;
    padding: 6pt 0 10pt;
    border: none;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .nfm-item:last-child {
    border: none;
  }

  /* Hàng tiêu đề giấy tờ: tên đậm, không kiểu nhãn */
  .nfm-item-top {
    display: block;
    margin: 0 0 4pt;
    padding: 0;
    border: none;
  }

  /* Tên giấy tờ in đậm — tiêu đề khối, không phải giá trị ô */
  .print-doc-title {
    display: block;
    font-size: 11pt;
    font-weight: 700;
    color: #1a1a1a;
    margin: 0 0 2pt;
    padding: 0;
    border: none;
  }

  .print-value,
  .pv,
  .pv-multi {
    display: block;
    white-space: pre-wrap;
    word-break: break-word;
    color: #1a1a1a;
    font-size: 11pt;
    min-height: 14pt;
    padding: 0 0 3pt;
    margin: 0 0 2pt;
    border: none;
    border-bottom: 0.5pt solid #dcdcdc;
    font-variant-numeric: tabular-nums;
  }

  .print-value.print-empty,
  .pv-empty {
    min-height: 16pt;
    color: transparent;
  }

  .nfm-snap {
    display: flex;
    flex-wrap: wrap;
    gap: 10pt 24pt;
    border: none;
    padding: 4pt 0 0;
  }

  .nfm-snap-cell {
    flex: 1 1 40%;
    min-width: 35%;
    padding: 4pt 0;
    border: none;
  }

  .nfm-snap-cell:nth-child(odd) {
    border: none;
  }

  .nfm-snap-v {
    display: block;
    font-size: 13pt;
    font-weight: 600;
    color: #1a1a1a;
    font-variant-numeric: tabular-nums;
  }

  .nfm-goals {
    list-style: none;
    margin: 8pt 0 0;
    padding: 0;
    border: none;
  }

  .nfm-goals li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 5pt 0;
    border: none;
    border-bottom: 0.5pt solid #dcdcdc;
    font-size: 10pt;
    color: #1a1a1a;
  }

  .nfm-goals li:last-child {
    border-bottom: none;
  }

  .nfm-goals span {
    color: #5a5a5a;
    font-variant-numeric: tabular-nums;
  }

  .sheet-head,
  .sheet-foot {
    border: none;
    color: #6b6b6b;
    font-size: 8pt;
  }
`;function b(e){if(e instanceof HTMLInputElement){let t=e.type.toLowerCase();return t===`checkbox`||t===`radio`?e.checked?`x`:``:e.value}if(e instanceof HTMLTextAreaElement)return e.value;if(e instanceof HTMLSelectElement){let t=e.selectedOptions[0];return t?t.textContent??``:e.value}return``}function x(e,t){let n=Array.from(e.querySelectorAll(v)),r=Array.from(t.querySelectorAll(v)),i=Math.min(n.length,r.length);for(let e=0;e<i;e++){let t=b(n[e]);r[e].dataset.printValue=t}}function S(e){let t=Array.from(e.querySelectorAll(v));for(let n of t){let t=(n.dataset.printValue??``).trim(),r=!!n.closest(`.nfm-item-top`),i=e.ownerDocument.createElement(`div`);r?(i.className=`print-doc-title`,i.textContent=t||`\xA0`):(i.className=t?`print-value`:`print-value print-empty`,i.textContent=t||`\xA0`),n.replaceWith(i)}}function C(e){let t=Array.from(e.querySelectorAll(`details.nfm-sec`));for(let n of t){let t=e.ownerDocument.createElement(`div`);t.className=`nfm-sec`;let r=n.querySelector(`summary`);if(r){let n=e.ownerDocument.createElement(`div`);n.className=`print-head`;let i=r.querySelector(`.nfm-sec-num`),a=r.querySelector(`.nfm-sec-title`);i&&n.appendChild(i.cloneNode(!0)),a&&n.appendChild(a.cloneNode(!0)),t.appendChild(n)}let i=n.querySelector(`.nfm-box`);i&&t.appendChild(i),n.replaceWith(t)}e.querySelectorAll(`.nfm-sec-static > h2`).forEach(t=>{let n=e.ownerDocument.createElement(`div`);n.className=`print-head`;let r=t.querySelector(`.nfm-sec-num`),i=t.querySelector(`.nfm-sec-title`);r&&n.appendChild(r.cloneNode(!0)),i&&n.appendChild(i.cloneNode(!0)),t.replaceWith(n)})}function w(e){for(let t of _)e.querySelectorAll(t).forEach(e=>e.remove())}function T(e){let t=e.cloneNode(!0);x(e,t),w(t),C(t),S(t);let n=document.createElement(`iframe`);n.setAttribute(`aria-hidden`,`true`),n.style.position=`fixed`,n.style.right=`0`,n.style.bottom=`0`,n.style.width=`0`,n.style.height=`0`,n.style.border=`0`,n.style.opacity=`0`,n.style.pointerEvents=`none`,document.body.appendChild(n);let r=n.contentDocument,i=n.contentWindow;if(!r||!i){n.remove();return}r.open(),r.write(`<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/><title>Hồ sơ khẩn cấp</title><style>${y}</style></head><body></body></html>`),r.close(),r.body.appendChild(r.importNode(t,!0));let a=()=>{i.removeEventListener(`afterprint`,o),n.parentNode&&n.remove()},o=()=>{a()};i.addEventListener(`afterprint`,o),window.setTimeout(a,6e4);let s=()=>{try{i.focus(),i.print()}catch{a()}};requestAnimationFrame(()=>{requestAnimationFrame(s)})}var E=r(),D=/(mật\s*khẩu|mat\s*khau|matkhau|password|passwort|kennwort|\bpin\b|\btan\b|\botp\b|seed\s*phrase|private\s*key|recovery\s*phrase)/i,O=/\b[A-Z]{2}\s?\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/;function k(){let{locale:e}=n(),t=(t,n)=>e===`de`?n:t,[r,_]=(0,g.useState)(null),[v,y]=(0,g.useState)(null),[b,x]=(0,g.useState)([]),[S,C]=(0,g.useState)([]),[w,k]=(0,g.useState)(!0),[ee,A]=(0,g.useState)(!1),[j,M]=(0,g.useState)(0),[N,P]=(0,g.useState)(`saved`),[F,I]=(0,g.useState)(null),{readOnly:L,showBlocked:R}=f(),z=(0,g.useRef)(null),B=(0,g.useRef)(null),V=(0,g.useRef)(Promise.resolve()),H=(0,g.useRef)(0),U=(0,g.useRef)(!0);(0,g.useEffect)(()=>{B.current=v},[v]),(0,g.useEffect)(()=>(U.current=!0,()=>{U.current=!1}),[]),(0,g.useEffect)(()=>{let e=!1;return k(!0),A(!1),(async()=>{try{let[t,n,r]=await Promise.all([l(),c(),u()]);if(e)return;let a=t.notfallmappe??i();B.current=a,_(t),y(a),x(n),C(r)}catch{if(e)return;A(!0)}finally{e||k(!1)}})(),()=>{e=!0}},[j]);let W=(0,g.useMemo)(()=>{let e=r?.latestVwcePrice??0,t=d(S,e),n=t.length?t[t.length-1].value:0,i=0;for(let e of S)e.type===`buy_vwce`?i+=e.quantity??0:e.type===`sell_vwce`&&(i-=e.quantity??0);return{total:n,qty:i,price:e}},[S,r]),G=(0,g.useMemo)(()=>v?[!!(v.purpose.trim()||v.custodyNote.trim()),!!(v.brokerName.trim()&&(v.cashBankName.trim()||v.cashAccountNote.trim())),v.contacts.some(e=>e.name.trim()&&e.phone.trim()),v.documents.some(e=>e.location.trim()),!!v.wishes.trim()]:[!1,!1,!1,!1,!1],[v]),K=G.filter(Boolean).length,q=(0,g.useMemo)(()=>{if(!v)return[];let n=[{label:t(`Mục 1`,`Abschnitt 1`),text:`${v.purpose} ${v.custodyNote}`},{label:t(`Mục 2`,`Abschnitt 2`),text:`${v.brokerName} ${v.brokerAccountType} ${v.cashBankName} ${v.cashAccountNote}`},{label:t(`Mục 3`,`Abschnitt 3`),text:v.contacts.map(e=>`${e.name} ${e.relation} ${e.email}`).join(` `)},{label:t(`Mục 4`,`Abschnitt 4`),text:v.documents.map(e=>`${e.label} ${e.location}`).join(` `)},{label:t(`Mục 5`,`Abschnitt 5`),text:v.wishes}],r=[];for(let t of n)D.test(t.text)&&r.push(e===`de`?`${t.label} enthält möglicherweise ein Passwort, eine PIN oder TAN. Bitte entfernen Sie diese Angabe.`:`${t.label} có vẻ chứa mật khẩu, PIN hoặc TAN. Hãy xóa khỏi đây.`),O.test(t.text)&&r.push(e===`de`?`${t.label} enthält möglicherweise eine vollständige IBAN. Notieren Sie nur die letzten vier Ziffern.`:`${t.label} có vẻ chứa số IBAN đầy đủ. Chỉ nên ghi 4 số cuối.`);return r},[v,e]);if(w)return(0,E.jsx)(`div`,{className:`empty card`,role:`status`,"aria-live":`polite`,"aria-busy":`true`,children:(0,E.jsx)(`p`,{children:t(`Đang tải Hồ sơ khẩn cấp…`,`Notfallmappe wird geladen…`)})});if(ee||!v)return(0,E.jsxs)(`section`,{className:`empty card`,role:`alert`,children:[(0,E.jsx)(`h1`,{className:`page-title`,children:t(`Không tải được Hồ sơ khẩn cấp`,`Notfallmappe konnte nicht geladen werden`)}),(0,E.jsx)(`p`,{children:t(`Hồ sơ trên thiết bị không bị thay đổi. Không có nội dung nhạy cảm nào được hiển thị.`,`Die Daten auf diesem Gerät wurden nicht verändert. Es werden keine sensiblen Inhalte angezeigt.`)}),(0,E.jsx)(`button`,{type:`button`,onClick:()=>M(e=>e+1),children:t(`Thử lại`,`Erneut versuchen`)})]});function J(e){let n=++H.current;U.current&&(P(`saving`),I(null));let r=async()=>{try{return await s({notfallmappe:e}),U.current&&n===H.current&&(P(`saved`),I(null)),!0}catch{return U.current&&n===H.current&&(P(`error`),I(t(`Không lưu được Hồ sơ khẩn cấp. Bản đang chỉnh vẫn còn trên màn hình.`,`Die Notfallmappe konnte nicht gespeichert werden. Ihre aktuelle Bearbeitung bleibt auf dem Bildschirm.`))),!1}},i=V.current.then(r,r);return V.current=i.then(()=>void 0,()=>void 0),i}function Y(e){y(e),B.current=e,J(e)}function X(e){if(L){R();return}let t=B.current;t&&Y({...t,...e,updatedAt:a()})}function Z(e,t){if(L){R();return}let n=B.current;n&&Y({...n,contacts:n.contacts.map(n=>n.id===e?{...n,...t}:n),updatedAt:a()})}function Q(e,t){if(L){R();return}let n=B.current;n&&Y({...n,documents:n.documents.map(n=>n.id===e?{...n,...t}:n),updatedAt:a()})}function te(e){if(L){R();return}let t=B.current;t&&Y({...t,contacts:t.contacts.filter(t=>t.id!==e),updatedAt:a()})}function ne(){if(L){R();return}let e=B.current;e&&Y({...e,contacts:[...e.contacts,{id:o(`ct`),name:``,relation:``,phone:``,email:``}],updatedAt:a()})}function re(e){if(L){R();return}let t=B.current;t&&Y({...t,documents:t.documents.filter(t=>t.id!==e),updatedAt:a()})}function ie(){if(L){R();return}let e=B.current;e&&Y({...e,documents:[...e.documents,{id:o(`doc`),label:``,location:``}],updatedAt:a()})}async function ae(e){if(L)return R(),!1;let t=B.current;if(!t)return!1;let n={...t,...e,updatedAt:a()};return y(n),B.current=n,J(n)}async function oe(){if(L){R();return}if(!await ae({lastPrintedAt:a()}))return;let e=z.current;e&&T(e)}function se(){if(L){R();return}let e=B.current;e&&J(e)}let $=r?.childName?.trim()||t(`bé`,`dem Kind`),ce=N===`saving`?t(`Đang lưu…`,`Wird gespeichert…`):N===`error`?t(`Chưa lưu được`,`Noch nicht gespeichert`):v.updatedAt?`${t(`Đã lưu · cập nhật`,`Gespeichert · aktualisiert`)} ${h(v.updatedAt.slice(0,10),e)}`:t(`Đã lưu`,`Gespeichert`),le=N===`saving`?`nfm-status is-saving`:N===`error`?`nfm-status is-error`:`nfm-status`;return(0,E.jsxs)(`div`,{className:`nfm`,ref:z,children:[(0,E.jsxs)(`p`,{className:`nfm-warn`,children:[(0,E.jsx)(`strong`,{children:t(`Lưu ý`,`Hinweis`)}),(0,E.jsx)(`span`,{children:t(`Không bao giờ ghi mật khẩu, mã PIN hay mã TAN vào đây. Chỉ ghi nơi cất giấy tờ gốc. Nội dung này được đồng bộ lên tài khoản của bạn.`,`Tragen Sie hier niemals Passwörter, PINs oder TANs ein. Notieren Sie nur den Aufbewahrungsort von Originaldokumenten. Diese Inhalte werden mit Ihrem Konto synchronisiert.`)})]}),q.length>0&&(0,E.jsx)(`ul`,{className:`nfm-risk`,children:q.map(e=>(0,E.jsx)(`li`,{children:e},e))}),(0,E.jsxs)(`div`,{className:`nfm-progress`,children:[(0,E.jsx)(`div`,{className:`nfm-progress-track`,children:(0,E.jsx)(`div`,{className:`nfm-progress-fill`,style:{width:`${K/5*100}%`}})}),(0,E.jsx)(`span`,{className:`nfm-progress-text`,children:e===`de`?`${K}/5 Abschnitte ausgefüllt`:`${K}/5 mục đã điền`})]}),(0,E.jsxs)(`div`,{className:`nfm-print-note`,children:[(0,E.jsxs)(`p`,{children:[(0,E.jsx)(`strong`,{children:t(`Bản in giấy mới là bản dùng được.`,`Nur ein Ausdruck auf Papier ist im Ernstfall nutzbar.`)}),` `,t(`Trang này nằm sau màn hình đăng nhập của riêng bạn, nên nếu có chuyện xảy ra, người thân sẽ không mở được. Hãy in ra và cất cùng chỗ với giấy tờ gốc.`,`Diese Seite liegt hinter Ihrer persönlichen Anmeldung. Angehörige können sie im Notfall nicht öffnen. Drucken Sie sie aus und bewahren Sie sie bei den Originaldokumenten auf.`)]}),(0,E.jsx)(`p`,{className:`nfm-print-when`,children:v.lastPrintedAt?`${t(`In gần nhất`,`Zuletzt gedruckt`)} ${h(v.lastPrintedAt.slice(0,10),e)}`:t(`Chưa in lần nào`,`Noch nie gedruckt`)})]}),(0,E.jsxs)(`details`,{className:`nfm-sec`,children:[(0,E.jsxs)(`summary`,{children:[(0,E.jsx)(`span`,{className:`nfm-sec-num`,children:`1`}),(0,E.jsx)(`span`,{className:`nfm-sec-title`,children:t(`Quỹ này là gì`,`Worum geht es bei diesem Fonds?`)}),(0,E.jsx)(`span`,{className:G[0]?`nfm-sec-state ok`:`nfm-sec-state`,children:G[0]?t(`Đã điền`,`Ausgefüllt`):t(`Chưa điền`,`Nicht ausgefüllt`)}),(0,E.jsx)(`span`,{className:`nfm-chev`,"aria-hidden":!0,children:`›`})]}),(0,E.jsxs)(`div`,{className:`nfm-box`,children:[(0,E.jsxs)(`label`,{className:`nfm-field`,children:[(0,E.jsx)(`span`,{children:t(`Số tiền này dành cho ai và để làm gì`,`Für wen ist dieses Geld bestimmt und wofür?`)}),(0,E.jsx)(`textarea`,{value:v.purpose,onChange:e=>X({purpose:e.target.value}),placeholder:e===`de`?`Schreiben Sie für jemanden ohne Kenntnisse über den Fonds. Beispiel: Dieses Geld ist für ${$} und soll ab 06/2038 verwendet werden.`:`Viết cho người không biết gì về quỹ. Ví dụ: đây là tiền dành cho ${$}, dự kiến dùng từ 06/2038.`})]}),(0,E.jsxs)(`label`,{className:`nfm-field`,children:[(0,E.jsx)(`span`,{children:t(`Tiền đứng tên ai, và thực sự thuộc về ai`,`Auf wessen Namen läuft das Geld und wem gehört es tatsächlich?`)}),(0,E.jsx)(`textarea`,{value:v.custodyNote,onChange:e=>X({custodyNote:e.target.value}),placeholder:t(`Ví dụ: tài khoản đứng tên cha/mẹ nhưng toàn bộ số tiền là của bé.`,`Beispiel: Das Konto läuft auf ein Elternteil, aber das gesamte Geld gehört dem Kind.`)})]})]})]}),(0,E.jsxs)(`details`,{className:`nfm-sec`,children:[(0,E.jsxs)(`summary`,{children:[(0,E.jsx)(`span`,{className:`nfm-sec-num`,children:`2`}),(0,E.jsx)(`span`,{className:`nfm-sec-title`,children:t(`Tài sản đang ở đâu`,`Wo befinden sich die Vermögenswerte?`)}),(0,E.jsx)(`span`,{className:G[1]?`nfm-sec-state ok`:`nfm-sec-state`,children:G[1]?t(`Đã điền`,`Ausgefüllt`):t(`Chưa điền`,`Nicht ausgefüllt`)}),(0,E.jsx)(`span`,{className:`nfm-chev`,"aria-hidden":!0,children:`›`})]}),(0,E.jsxs)(`div`,{className:`nfm-box`,children:[(0,E.jsxs)(`div`,{className:`nfm-row-grid`,children:[(0,E.jsxs)(`label`,{className:`nfm-field`,children:[(0,E.jsx)(`span`,{children:`Broker`}),(0,E.jsx)(`input`,{value:v.brokerName,onChange:e=>X({brokerName:e.target.value}),placeholder:`Trade Republic`})]}),(0,E.jsxs)(`label`,{className:`nfm-field`,children:[(0,E.jsx)(`span`,{children:t(`Loại tài khoản`,`Kontotyp`)}),(0,E.jsx)(`input`,{value:v.brokerAccountType,onChange:e=>X({brokerAccountType:e.target.value}),placeholder:t(`Depot cá nhân`,`Persönliches Depot`)})]})]}),(0,E.jsxs)(`label`,{className:`nfm-field`,children:[(0,E.jsx)(`span`,{children:t(`ISIN của quỹ đang nắm`,`ISIN des gehaltenen Fonds`)}),(0,E.jsx)(`input`,{value:v.isin,onChange:e=>X({isin:e.target.value})})]}),(0,E.jsxs)(`div`,{className:`nfm-row-grid`,children:[(0,E.jsxs)(`label`,{className:`nfm-field`,children:[(0,E.jsx)(`span`,{children:t(`Ngân hàng giữ tiền mặt`,`Bank für das Guthaben`)}),(0,E.jsx)(`input`,{value:v.cashBankName,onChange:e=>X({cashBankName:e.target.value}),placeholder:t(`Tên ngân hàng`,`Name der Bank`)})]}),(0,E.jsxs)(`label`,{className:`nfm-field`,children:[(0,E.jsx)(`span`,{children:t(`Ghi chú nhận biết`,`Hinweis zur Zuordnung`)}),(0,E.jsx)(`input`,{value:v.cashAccountNote,onChange:e=>X({cashAccountNote:e.target.value}),placeholder:t(`4 số cuối, không ghi đầy đủ`,`Nur die letzten 4 Ziffern, nicht vollständig`)})]})]})]})]}),(0,E.jsxs)(`details`,{className:`nfm-sec`,children:[(0,E.jsxs)(`summary`,{children:[(0,E.jsx)(`span`,{className:`nfm-sec-num`,children:`3`}),(0,E.jsx)(`span`,{className:`nfm-sec-title`,children:t(`Người cần được báo tin`,`Zu informierende Personen`)}),(0,E.jsx)(`span`,{className:G[2]?`nfm-sec-state ok`:`nfm-sec-state`,children:G[2]?t(`Đã điền`,`Ausgefüllt`):t(`Chưa điền`,`Nicht ausgefüllt`)}),(0,E.jsx)(`span`,{className:`nfm-chev`,"aria-hidden":!0,children:`›`})]}),(0,E.jsxs)(`div`,{className:`nfm-box`,children:[v.contacts.map(n=>(0,E.jsxs)(`div`,{className:`nfm-item`,children:[(0,E.jsxs)(`div`,{className:`nfm-item-top`,children:[(0,E.jsx)(`input`,{value:n.name,onChange:e=>Z(n.id,{name:e.target.value}),placeholder:t(`Họ và tên`,`Vollständiger Name`)}),(0,E.jsx)(`button`,{type:`button`,className:`nfm-del`,"aria-label":e===`de`?`Kontakt ${n.name||`löschen`} entfernen`:`Xóa ${n.name||`liên hệ`}`,onClick:()=>te(n.id),children:`✕`})]}),(0,E.jsx)(`input`,{value:n.relation,onChange:e=>Z(n.id,{relation:e.target.value}),placeholder:t(`Quan hệ — ví dụ: mẹ của bé, người giám hộ`,`Beziehung — z. B. Mutter des Kindes, Vormund`)}),(0,E.jsx)(`input`,{value:n.phone,onChange:e=>Z(n.id,{phone:e.target.value}),placeholder:t(`Điện thoại`,`Telefon`),inputMode:`tel`}),(0,E.jsx)(`input`,{value:n.email,onChange:e=>Z(n.id,{email:e.target.value}),placeholder:`Email`,inputMode:`email`})]},n.id)),(0,E.jsxs)(`button`,{type:`button`,className:`nfm-add`,onClick:ne,children:[`+ `,t(`Thêm người liên hệ`,`Kontakt hinzufügen`)]})]})]}),(0,E.jsxs)(`details`,{className:`nfm-sec`,children:[(0,E.jsxs)(`summary`,{children:[(0,E.jsx)(`span`,{className:`nfm-sec-num`,children:`4`}),(0,E.jsx)(`span`,{className:`nfm-sec-title`,children:t(`Giấy tờ gốc cất ở đâu`,`Wo werden Originaldokumente aufbewahrt?`)}),(0,E.jsx)(`span`,{className:G[3]?`nfm-sec-state ok`:`nfm-sec-state`,children:G[3]?t(`Đã điền`,`Ausgefüllt`):t(`Chưa điền`,`Nicht ausgefüllt`)}),(0,E.jsx)(`span`,{className:`nfm-chev`,"aria-hidden":!0,children:`›`})]}),(0,E.jsxs)(`div`,{className:`nfm-box`,children:[v.documents.map(n=>(0,E.jsxs)(`div`,{className:`nfm-item`,children:[(0,E.jsxs)(`div`,{className:`nfm-item-top`,children:[(0,E.jsx)(`input`,{value:n.label,onChange:e=>Q(n.id,{label:e.target.value}),placeholder:t(`Tên giấy tờ`,`Dokumentname`),"aria-label":t(`Tên giấy tờ`,`Dokumentname`)}),(0,E.jsx)(`button`,{type:`button`,className:`nfm-del`,"aria-label":e===`de`?`Dokument ${n.label||`löschen`} entfernen`:`Xóa ${n.label||`giấy tờ`}`,onClick:()=>re(n.id),children:`✕`})]}),(0,E.jsxs)(`div`,{className:`nfm-row-grid`,children:[(0,E.jsxs)(`label`,{className:`nfm-field`,children:[(0,E.jsx)(`span`,{children:t(`Bản gốc cất ở đâu`,`Aufbewahrungsort des Originals`)}),(0,E.jsx)(`input`,{value:n.location,onChange:e=>Q(n.id,{location:e.target.value}),placeholder:t(`Nơi cất bản gốc — không ghi mật khẩu`,`Aufbewahrungsort des Originals — keine Passwörter eintragen`)})]}),(0,E.jsxs)(`label`,{className:`nfm-field`,children:[(0,E.jsx)(`span`,{children:t(`Ghi chú`,`Notiz`)}),(0,E.jsx)(`input`,{defaultValue:``,readOnly:!0,tabIndex:-1,placeholder:t(`Viết tay trên bản in nếu cần`,`Bei Bedarf auf dem Ausdruck handschriftlich ergänzen`),"aria-label":t(`Ghi chú — dành để viết tay trên bản in`,`Notiz — für handschriftliche Ergänzungen auf dem Ausdruck`)})]})]})]},n.id)),(0,E.jsxs)(`button`,{type:`button`,className:`nfm-add`,onClick:ie,children:[`+ `,t(`Thêm giấy tờ`,`Dokument hinzufügen`)]})]})]}),(0,E.jsxs)(`details`,{className:`nfm-sec`,children:[(0,E.jsxs)(`summary`,{children:[(0,E.jsx)(`span`,{className:`nfm-sec-num`,children:`5`}),(0,E.jsx)(`span`,{className:`nfm-sec-title`,children:t(`Nguyện vọng của bạn`,`Ihre Wünsche`)}),(0,E.jsx)(`span`,{className:G[4]?`nfm-sec-state ok`:`nfm-sec-state`,children:G[4]?t(`Đã điền`,`Ausgefüllt`):t(`Chưa điền`,`Nicht ausgefüllt`)}),(0,E.jsx)(`span`,{className:`nfm-chev`,"aria-hidden":!0,children:`›`})]}),(0,E.jsx)(`div`,{className:`nfm-box`,children:(0,E.jsxs)(`label`,{className:`nfm-field`,children:[(0,E.jsx)(`span`,{children:t(`Nếu bạn không còn, số tiền này nên được dùng thế nào`,`Wie soll dieses Geld verwendet werden, wenn Sie nicht mehr da sind?`)}),(0,E.jsx)(`textarea`,{value:v.wishes,onChange:e=>X({wishes:e.target.value}),placeholder:t(`Đây không phải di chúc và không có giá trị pháp lý, nhưng giúp người ở lại hiểu ý bạn.`,`Dies ist kein Testament und hat keine rechtliche Wirkung, hilft Angehörigen aber, Ihre Wünsche zu verstehen.`)})]})})]}),(0,E.jsxs)(`section`,{className:`nfm-sec-static`,children:[(0,E.jsxs)(`h2`,{children:[(0,E.jsx)(`span`,{className:`nfm-sec-num`,children:`6`}),(0,E.jsx)(`span`,{className:`nfm-sec-title`,children:t(`Tình hình tại thời điểm in`,`Stand zum Zeitpunkt des Ausdrucks`)})]}),(0,E.jsxs)(`div`,{className:`nfm-box`,children:[(0,E.jsxs)(`div`,{className:`nfm-snap`,children:[(0,E.jsxs)(`div`,{className:`nfm-snap-cell`,children:[(0,E.jsx)(`span`,{className:`nfm-snap-k`,children:t(`Tổng tài sản`,`Gesamtvermögen`)}),(0,E.jsx)(`span`,{className:`nfm-snap-v`,children:p(W.total,e)})]}),(0,E.jsxs)(`div`,{className:`nfm-snap-cell`,children:[(0,E.jsx)(`span`,{className:`nfm-snap-k`,children:t(`Số lượng VWCE`,`VWCE-Anteile`)}),(0,E.jsx)(`span`,{className:`nfm-snap-v`,children:m(W.qty,e,4)})]}),(0,E.jsxs)(`div`,{className:`nfm-snap-cell`,children:[(0,E.jsx)(`span`,{className:`nfm-snap-k`,children:t(`Giá VWCE dùng để tính`,`Verwendeter VWCE-Preis`)}),(0,E.jsx)(`span`,{className:`nfm-snap-v`,children:p(W.price,e)})]}),(0,E.jsxs)(`div`,{className:`nfm-snap-cell`,children:[(0,E.jsx)(`span`,{className:`nfm-snap-k`,children:t(`Số giao dịch đã ghi`,`Erfasste Transaktionen`)}),(0,E.jsx)(`span`,{className:`nfm-snap-v`,children:S.length})]})]}),(0,E.jsxs)(`ul`,{className:`nfm-goals`,children:[b.map(t=>(0,E.jsxs)(`li`,{children:[t.name,(0,E.jsxs)(`span`,{children:[h(t.dueDate,e),` · `,p(t.amount,e)]})]},t.id)),b.length===0&&(0,E.jsxs)(`li`,{children:[t(`Chưa có mục tiêu nào`,`Noch keine Ziele`),(0,E.jsx)(`span`,{})]})]})]})]}),(0,E.jsx)(`p`,{className:le,role:`status`,"aria-live":`polite`,children:ce}),F?(0,E.jsxs)(`div`,{className:`nfm-save-error`,role:`alert`,children:[(0,E.jsx)(`span`,{children:F}),(0,E.jsx)(`button`,{type:`button`,className:`secondary`,onClick:se,children:t(`Thử lưu lại`,`Speichern erneut versuchen`)})]}):null,(0,E.jsx)(`div`,{className:`nfm-actions`,children:(0,E.jsx)(`button`,{type:`button`,className:`secondary`,onClick:oe,children:t(`In / Lưu PDF`,`Drucken / PDF speichern`)})})]})}export{k as default};