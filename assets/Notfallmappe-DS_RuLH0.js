import{r as e}from"./rolldown-runtime-XKyaHtl9.js";import{f as t,l as n,p as r}from"./db.m02-CLreDsk6.js";import{n as i,t as a}from"./jsx-runtime-C3cWAN_r.js";import{It as o,Tt as s,at as c,et as l,h as u,j as d,ot as f,st as ee}from"./index-Bw4CDl0-.js";import{t as te}from"./todayCenterAdapter-CgeiWy0J.js";import{n as p,r as m,t as h}from"./localeFormatting-DruAYX9k.js";var g=e(i(),1),_=[`button`,`.nfm-actions`,`.nfm-status`,`.nfm-add`,`.nfm-del`,`.nfm-warn`,`.nfm-risk`,`.mwj-emergency-head`,`.nfm-print-note`,`.nfm-sec-state`,`.nfm-chev`],v=`input, textarea, select`,y=`
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

  h1 { margin: 0 0 12pt; font-size: 20pt; }
  .nfm-valuation-warning { margin: 6pt 0; font-weight: 650; }
  .nfm-holdings { width: 100%; margin: 8pt 0; border-collapse: collapse; }
  .nfm-holdings caption { text-align: left; font-weight: 650; }
  .nfm-holdings th, .nfm-holdings td { padding: 4pt; border-bottom: 1px solid #ddd; text-align: right; }
  .nfm-holdings th:first-child { text-align: left; }

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
`;function b(e){if(e instanceof HTMLInputElement){let t=e.type.toLowerCase();return t===`checkbox`||t===`radio`?e.checked?`x`:``:e.value}if(e instanceof HTMLTextAreaElement)return e.value;if(e instanceof HTMLSelectElement){let t=e.selectedOptions[0];return t?t.textContent??``:e.value}return``}function x(e,t){let n=Array.from(e.querySelectorAll(v)),r=Array.from(t.querySelectorAll(v)),i=Math.min(n.length,r.length);for(let e=0;e<i;e++){let t=b(n[e]);r[e].dataset.printValue=t}}function S(e){let t=Array.from(e.querySelectorAll(v));for(let n of t){let t=(n.dataset.printValue??``).trim(),r=!!n.closest(`.nfm-item-top`),i=e.ownerDocument.createElement(`div`);r?(i.className=`print-doc-title`,i.textContent=t||`\xA0`):(i.className=t?`print-value`:`print-value print-empty`,i.textContent=t||`\xA0`),n.replaceWith(i)}}function C(e){let t=Array.from(e.querySelectorAll(`details.nfm-sec`));for(let n of t){let t=e.ownerDocument.createElement(`div`);t.className=`nfm-sec`;let r=n.querySelector(`summary`);if(r){let n=e.ownerDocument.createElement(`div`);n.className=`print-head`;let i=r.querySelector(`.nfm-sec-num`),a=r.querySelector(`.nfm-sec-title`);i&&n.appendChild(i.cloneNode(!0)),a&&n.appendChild(a.cloneNode(!0)),t.appendChild(n)}let i=n.querySelector(`.nfm-box`);i&&t.appendChild(i),n.replaceWith(t)}e.querySelectorAll(`.nfm-sec-static > h2`).forEach(t=>{let n=e.ownerDocument.createElement(`div`);n.className=`print-head`;let r=t.querySelector(`.nfm-sec-num`),i=t.querySelector(`.nfm-sec-title`);r&&n.appendChild(r.cloneNode(!0)),i&&n.appendChild(i.cloneNode(!0)),t.replaceWith(n)})}function w(e){for(let t of _)e.querySelectorAll(t).forEach(e=>e.remove())}function T(e){let t=e.cloneNode(!0);x(e,t),w(t),C(t),S(t);let n=document.createElement(`iframe`);n.setAttribute(`aria-hidden`,`true`),n.style.position=`fixed`,n.style.right=`0`,n.style.bottom=`0`,n.style.width=`0`,n.style.height=`0`,n.style.border=`0`,n.style.opacity=`0`,n.style.pointerEvents=`none`,document.body.appendChild(n);let r=n.contentDocument,i=n.contentWindow;if(!r||!i){n.remove();return}let a=e.ownerDocument.documentElement.lang===`de`?`de`:`vi`,o=a===`de`?`Notfallmappe`:`Hồ sơ khẩn cấp`;r.open(),r.write(`<!DOCTYPE html><html lang="${a}"><head><meta charset="utf-8"/><title>${o}</title><style>${y}</style></head><body></body></html>`),r.close();let s=r.createElement(`h1`);s.textContent=o,r.body.append(s,r.importNode(t,!0));let c=()=>{i.removeEventListener(`afterprint`,l),n.parentNode&&n.remove()},l=()=>{c()};i.addEventListener(`afterprint`,l),window.setTimeout(c,6e4);let u=()=>{try{i.focus(),i.print()}catch{c()}};requestAnimationFrame(()=>{requestAnimationFrame(u)})}var E=a(),D=/(mật\s*khẩu|mat\s*khau|matkhau|password|passwort|kennwort|\bpin\b|\btan\b|\botp\b|seed\s*phrase|private\s*key|recovery\s*phrase)/i,O=/\b[A-Z]{2}\s?\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/;function k(){let{locale:e}=o(),i=(t,n)=>e===`de`?n:t,[a,_]=(0,g.useState)(null),[v,y]=(0,g.useState)(null),[b,x]=(0,g.useState)([]),[S,C]=(0,g.useState)([]),[w,k]=(0,g.useState)([]),[ne,A]=(0,g.useState)(!0),[re,j]=(0,g.useState)(!1),[ie,M]=(0,g.useState)(0),[N,P]=(0,g.useState)(`saved`),[F,I]=(0,g.useState)(null),{readOnly:L,showBlocked:R}=d(),z=(0,g.useRef)(null),B=(0,g.useRef)(null),V=(0,g.useRef)(Promise.resolve()),H=(0,g.useRef)(0),U=(0,g.useRef)(!0);(0,g.useEffect)(()=>{B.current=v},[v]),(0,g.useEffect)(()=>(U.current=!0,()=>{U.current=!1}),[]),(0,g.useEffect)(()=>{let t=!1;return A(!0),j(!1),(async()=>{try{let[r,i,a,o]=await Promise.all([c(),f(),ee(),s()]);if(t)return;let l=r.notfallmappe??n(e);B.current=l,_(r),y(l),x(i),C(a),k(o)}catch{if(t)return;j(!0)}finally{t||A(!1)}})(),()=>{t=!0}},[ie,e]);let W=(0,g.useMemo)(()=>{let e=te({transactions:S,quotes:w,legacyVwcePrice:a?.latestVwcePrice??0,legacyVwcePriceAsOf:a?.latestPriceDate??``});return{total:e.market.securities+Math.max(0,e.portfolio.cashBalance),qty:e.portfolio.positions.IE00BK5BQT80?.qty??0,price:e.vwcePrice>0?e.vwcePrice:null,valueComplete:e.valueComplete,otherHoldings:Object.entries(e.market.byIsin).filter(([e,t])=>e!==`IE00BK5BQT80`&&t.qty>0)}},[S,a,w]),G=(0,g.useMemo)(()=>v?[!!(v.purpose.trim()||v.custodyNote.trim()),!!(v.brokerName.trim()&&(v.cashBankName.trim()||v.cashAccountNote.trim())),v.contacts.some(e=>e.name.trim()&&e.phone.trim()),v.documents.some(e=>e.location.trim()),!!v.wishes.trim()]:[!1,!1,!1,!1,!1],[v]),K=G.filter(Boolean).length,q=(0,g.useMemo)(()=>{if(!v)return[];let t=[{label:i(`Mục 1`,`Abschnitt 1`),text:`${v.purpose} ${v.custodyNote}`},{label:i(`Mục 2`,`Abschnitt 2`),text:`${v.brokerName} ${v.brokerAccountType} ${v.cashBankName} ${v.cashAccountNote}`},{label:i(`Mục 3`,`Abschnitt 3`),text:v.contacts.map(e=>`${e.name} ${e.relation} ${e.email}`).join(` `)},{label:i(`Mục 4`,`Abschnitt 4`),text:v.documents.map(e=>`${e.label} ${e.location}`).join(` `)},{label:i(`Mục 5`,`Abschnitt 5`),text:v.wishes}],n=[];for(let r of t)D.test(r.text)&&n.push(e===`de`?`${r.label} enthält möglicherweise ein Passwort, eine PIN oder TAN. Bitte entfernen Sie diese Angabe.`:`${r.label} có vẻ chứa mật khẩu, PIN hoặc TAN. Hãy xóa khỏi đây.`),O.test(r.text)&&n.push(e===`de`?`${r.label} enthält möglicherweise eine vollständige IBAN. Notieren Sie nur die letzten vier Ziffern.`:`${r.label} có vẻ chứa số IBAN đầy đủ. Chỉ nên ghi 4 số cuối.`);return n},[v,e]);if(ne)return(0,E.jsx)(`div`,{className:`empty card`,role:`status`,"aria-live":`polite`,"aria-busy":`true`,children:(0,E.jsx)(`p`,{children:i(`Đang tải Hồ sơ khẩn cấp…`,`Notfallmappe wird geladen…`)})});if(re||!v)return(0,E.jsxs)(`section`,{className:`empty card`,role:`alert`,children:[(0,E.jsx)(`h1`,{className:`page-title`,children:i(`Không tải được Hồ sơ khẩn cấp`,`Notfallmappe konnte nicht geladen werden`)}),(0,E.jsx)(`p`,{children:i(`Hồ sơ trên thiết bị không bị thay đổi. Không có nội dung nhạy cảm nào được hiển thị.`,`Die Daten auf diesem Gerät wurden nicht verändert. Es werden keine sensiblen Inhalte angezeigt.`)}),(0,E.jsx)(`button`,{type:`button`,onClick:()=>M(e=>e+1),children:i(`Thử lại`,`Erneut versuchen`)})]});function J(e){let t=++H.current;U.current&&(P(`saving`),I(null));let n=async()=>{try{return await l({notfallmappe:e}),U.current&&t===H.current&&(P(`saved`),I(null)),!0}catch{return U.current&&t===H.current&&(P(`error`),I(i(`Không lưu được Hồ sơ khẩn cấp. Bản đang chỉnh vẫn còn trên màn hình.`,`Die Notfallmappe konnte nicht gespeichert werden. Ihre aktuelle Bearbeitung bleibt auf dem Bildschirm.`))),!1}},r=V.current.then(n,n);return V.current=r.then(()=>void 0,()=>void 0),r}function Y(e){y(e),B.current=e,J(e)}function X(e){if(L){R();return}let n=B.current;n&&Y({...n,...e,updatedAt:t()})}function Z(e,n){if(L){R();return}let r=B.current;r&&Y({...r,contacts:r.contacts.map(t=>t.id===e?{...t,...n}:t),updatedAt:t()})}function Q(e,n){if(L){R();return}let r=B.current;r&&Y({...r,documents:r.documents.map(t=>t.id===e?{...t,...n}:t),updatedAt:t()})}function ae(e){if(L){R();return}let n=B.current;n&&Y({...n,contacts:n.contacts.filter(t=>t.id!==e),updatedAt:t()})}function oe(){if(L){R();return}let e=B.current;e&&Y({...e,contacts:[...e.contacts,{id:r(`ct`),name:``,relation:``,phone:``,email:``}],updatedAt:t()})}function se(e){if(L){R();return}let n=B.current;n&&Y({...n,documents:n.documents.filter(t=>t.id!==e),updatedAt:t()})}function ce(){if(L){R();return}let e=B.current;e&&Y({...e,documents:[...e.documents,{id:r(`doc`),label:``,location:``}],updatedAt:t()})}async function le(e){if(L)return R(),!1;let n=B.current;if(!n)return!1;let r={...n,...e,updatedAt:t()};return y(r),B.current=r,J(r)}async function $(){if(L){R();return}if(!await le({lastPrintedAt:t()}))return;let e=z.current;e&&T(e)}function ue(){if(L){R();return}let e=B.current;e&&J(e)}let de=N===`saving`?i(`Đang lưu…`,`Wird gespeichert…`):N===`error`?i(`Chưa lưu được`,`Noch nicht gespeichert`):v.updatedAt?`${i(`Đã lưu · cập nhật`,`Gespeichert · aktualisiert`)} ${h(v.updatedAt.slice(0,10),e)}`:i(`Đã lưu`,`Gespeichert`),fe=N===`saving`?`nfm-status is-saving`:N===`error`?`nfm-status is-error`:`nfm-status`;return(0,E.jsxs)(`div`,{className:`nfm`,ref:z,children:[(0,E.jsxs)(`header`,{className:`mwj-page-head mwj-emergency-head`,children:[(0,E.jsxs)(`div`,{className:`mwj-dossier-hero`,children:[(0,E.jsx)(`span`,{className:`mwj-dossier-symbol`,"aria-hidden":`true`,children:(0,E.jsxs)(`svg`,{viewBox:`0 0 64 64`,width:`48`,height:`48`,fill:`none`,children:[(0,E.jsx)(`path`,{d:`M9 18a5 5 0 0 1 5-5h14l6 7h16a5 5 0 0 1 5 5v25a5 5 0 0 1-5 5H14a5 5 0 0 1-5-5V18Z`,fill:`#FFCC88`,stroke:`#E7A963`,strokeWidth:`2`}),(0,E.jsx)(`path`,{d:`M9 28h46v22a5 5 0 0 1-5 5H14a5 5 0 0 1-5-5V28Z`,fill:`#FFE6C0`,stroke:`#E7A963`,strokeWidth:`2`}),(0,E.jsx)(`path`,{d:`M32 34 40 37v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10v-6l8-3Z`,fill:`#24385D`}),(0,E.jsx)(`path`,{d:`m28 43 3 3 6-6`,stroke:`#FFF`,strokeWidth:`2.5`,strokeLinecap:`round`,strokeLinejoin:`round`})]})}),(0,E.jsxs)(`div`,{className:`mwj-dossier-hero-copy`,children:[(0,E.jsx)(`span`,{className:`mwj-dossier-eyebrow`,children:i(`Thông tin thiết yếu`,`Wichtige Informationen`)}),(0,E.jsx)(`h1`,{children:i(`Hồ sơ khẩn cấp`,`Notfallmappe`)}),(0,E.jsx)(`p`,{children:i(`Mọi thông tin quan trọng ở một nơi, sẵn sàng khi cần.`,`Alles Wichtige an einem Ort. Bereit, wenn es darauf ankommt.`)})]})]}),(0,E.jsxs)(`div`,{className:`mwj-emergency-readiness`,children:[(0,E.jsxs)(`div`,{className:`mwj-emergency-meter`,children:[(0,E.jsx)(`label`,{htmlFor:`nfm-readiness`,children:e===`de`?`${K}/5 Abschnitte ausgefüllt`:`${K}/5 mục đã điền`}),(0,E.jsx)(`progress`,{id:`nfm-readiness`,value:K,max:5})]}),(0,E.jsx)(`div`,{className:`nfm-actions`,children:(0,E.jsxs)(`button`,{type:`button`,className:`nfm-print-button`,onClick:$,children:[(0,E.jsx)(u,{}),i(`In / Lưu PDF`,`Drucken / PDF speichern`)]})})]})]}),(0,E.jsxs)(`p`,{className:`nfm-warn`,children:[(0,E.jsx)(`strong`,{children:i(`Lưu ý`,`Hinweis`)}),(0,E.jsx)(`span`,{children:i(`Không bao giờ ghi mật khẩu, mã PIN hay mã TAN vào đây. Chỉ ghi nơi cất giấy tờ gốc. Nội dung này được đồng bộ lên tài khoản của bạn.`,`Tragen Sie hier niemals Passwörter, PINs oder TANs ein. Notieren Sie nur den Aufbewahrungsort von Originaldokumenten. Diese Inhalte werden mit Ihrem Konto synchronisiert.`)})]}),q.length>0&&(0,E.jsx)(`ul`,{className:`nfm-risk`,children:q.map(e=>(0,E.jsx)(`li`,{children:e},e))}),(0,E.jsxs)(`details`,{className:`nfm-print-note mwj-print-guidance`,children:[(0,E.jsx)(`summary`,{children:i(`Bản in giấy mới là bản dùng được`,`Nur der Papierausdruck ist im Ernstfall nutzbar`)}),(0,E.jsx)(`p`,{children:i(`Trang này nằm sau màn hình đăng nhập của riêng bạn, nên nếu có chuyện xảy ra, người thân sẽ không mở được. Hãy in ra và cất cùng chỗ với giấy tờ gốc.`,`Diese Seite liegt hinter Ihrer persönlichen Anmeldung. Angehörige können sie im Notfall nicht öffnen. Drucken Sie sie aus und bewahren Sie sie bei den Originaldokumenten auf.`)}),(0,E.jsx)(`p`,{className:`nfm-print-when`,children:v.lastPrintedAt?`${i(`In gần nhất`,`Zuletzt gedruckt`)} ${h(v.lastPrintedAt.slice(0,10),e)}`:i(`Chưa in lần nào`,`Noch nie gedruckt`)})]}),(0,E.jsxs)(`details`,{className:`nfm-sec`,children:[(0,E.jsxs)(`summary`,{children:[(0,E.jsx)(`span`,{className:`nfm-sec-num`,children:`1`}),(0,E.jsx)(`span`,{className:`nfm-sec-title`,children:i(`Quỹ này là gì`,`Worum geht es bei diesem Fonds?`)}),(0,E.jsx)(`span`,{className:G[0]?`nfm-sec-state ok`:`nfm-sec-state`,children:G[0]?i(`Đã điền`,`Ausgefüllt`):i(`Chưa điền`,`Nicht ausgefüllt`)}),(0,E.jsx)(`span`,{className:`nfm-chev`,"aria-hidden":!0,children:`›`})]}),(0,E.jsxs)(`div`,{className:`nfm-box`,children:[(0,E.jsxs)(`label`,{className:`nfm-field`,children:[(0,E.jsx)(`span`,{children:i(`Số tiền này dành cho ai và để làm gì`,`Für wen ist dieses Geld bestimmt und wofür?`)}),(0,E.jsx)(`textarea`,{value:v.purpose,onChange:e=>X({purpose:e.target.value}),placeholder:i(`Ví dụ: đây là khoản đầu tư dài hạn. Ghi rõ mục đích và người có quyền sử dụng.`,`Beispiel: Dies ist eine langfristige Anlage. Notieren Sie Zweck und berechtigte Personen.`)})]}),(0,E.jsxs)(`label`,{className:`nfm-field`,children:[(0,E.jsx)(`span`,{children:i(`Tiền đứng tên ai, và thực sự thuộc về ai`,`Auf wessen Namen läuft das Geld und wem gehört es tatsächlich?`)}),(0,E.jsx)(`textarea`,{value:v.custodyNote,onChange:e=>X({custodyNote:e.target.value}),placeholder:i(`Ghi tên chủ tài khoản và người có quyền với tài sản.`,`Notieren Sie den Kontoinhaber und wer über das Vermögen verfügen darf.`)})]})]})]}),(0,E.jsxs)(`details`,{className:`nfm-sec`,children:[(0,E.jsxs)(`summary`,{children:[(0,E.jsx)(`span`,{className:`nfm-sec-num`,children:`2`}),(0,E.jsx)(`span`,{className:`nfm-sec-title`,children:i(`Tài sản đang ở đâu`,`Wo befinden sich die Vermögenswerte?`)}),(0,E.jsx)(`span`,{className:G[1]?`nfm-sec-state ok`:`nfm-sec-state`,children:G[1]?i(`Đã điền`,`Ausgefüllt`):i(`Chưa điền`,`Nicht ausgefüllt`)}),(0,E.jsx)(`span`,{className:`nfm-chev`,"aria-hidden":!0,children:`›`})]}),(0,E.jsxs)(`div`,{className:`nfm-box`,children:[(0,E.jsxs)(`div`,{className:`nfm-row-grid`,children:[(0,E.jsxs)(`label`,{className:`nfm-field`,children:[(0,E.jsx)(`span`,{children:`Broker`}),(0,E.jsx)(`input`,{value:v.brokerName,onChange:e=>X({brokerName:e.target.value}),placeholder:`Trade Republic`})]}),(0,E.jsxs)(`label`,{className:`nfm-field`,children:[(0,E.jsx)(`span`,{children:i(`Loại tài khoản`,`Kontotyp`)}),(0,E.jsx)(`input`,{value:v.brokerAccountType,onChange:e=>X({brokerAccountType:e.target.value}),placeholder:i(`Depot cá nhân`,`Persönliches Depot`)})]})]}),(0,E.jsxs)(`label`,{className:`nfm-field`,children:[(0,E.jsx)(`span`,{children:i(`ISIN của quỹ đang nắm`,`ISIN des gehaltenen Fonds`)}),(0,E.jsx)(`input`,{value:v.isin,onChange:e=>X({isin:e.target.value})})]}),(0,E.jsxs)(`div`,{className:`nfm-row-grid`,children:[(0,E.jsxs)(`label`,{className:`nfm-field`,children:[(0,E.jsx)(`span`,{children:i(`Ngân hàng giữ tiền mặt`,`Bank für das Guthaben`)}),(0,E.jsx)(`input`,{value:v.cashBankName,onChange:e=>X({cashBankName:e.target.value}),placeholder:i(`Tên ngân hàng`,`Name der Bank`)})]}),(0,E.jsxs)(`label`,{className:`nfm-field`,children:[(0,E.jsx)(`span`,{children:i(`Ghi chú nhận biết`,`Hinweis zur Zuordnung`)}),(0,E.jsx)(`input`,{value:v.cashAccountNote,onChange:e=>X({cashAccountNote:e.target.value}),placeholder:i(`4 số cuối, không ghi đầy đủ`,`Nur die letzten 4 Ziffern, nicht vollständig`)})]})]})]})]}),(0,E.jsxs)(`details`,{className:`nfm-sec`,children:[(0,E.jsxs)(`summary`,{children:[(0,E.jsx)(`span`,{className:`nfm-sec-num`,children:`3`}),(0,E.jsx)(`span`,{className:`nfm-sec-title`,children:i(`Người cần được báo tin`,`Zu informierende Personen`)}),(0,E.jsx)(`span`,{className:G[2]?`nfm-sec-state ok`:`nfm-sec-state`,children:G[2]?i(`Đã điền`,`Ausgefüllt`):i(`Chưa điền`,`Nicht ausgefüllt`)}),(0,E.jsx)(`span`,{className:`nfm-chev`,"aria-hidden":!0,children:`›`})]}),(0,E.jsxs)(`div`,{className:`nfm-box`,children:[v.contacts.map(t=>(0,E.jsxs)(`div`,{className:`nfm-item`,children:[(0,E.jsxs)(`div`,{className:`nfm-item-top`,children:[(0,E.jsx)(`input`,{value:t.name,onChange:e=>Z(t.id,{name:e.target.value}),placeholder:i(`Họ và tên`,`Vollständiger Name`)}),(0,E.jsx)(`button`,{type:`button`,className:`nfm-del`,"aria-label":e===`de`?`Kontakt ${t.name||`löschen`} entfernen`:`Xóa ${t.name||`liên hệ`}`,onClick:()=>ae(t.id),children:`✕`})]}),(0,E.jsx)(`input`,{value:t.relation,onChange:e=>Z(t.id,{relation:e.target.value}),placeholder:i(`Mối quan hệ, ví dụ: người được ủy quyền`,`Beziehung, z. B. bevollmächtigte Person`)}),(0,E.jsx)(`input`,{value:t.phone,onChange:e=>Z(t.id,{phone:e.target.value}),placeholder:i(`Điện thoại`,`Telefon`),inputMode:`tel`}),(0,E.jsx)(`input`,{value:t.email,onChange:e=>Z(t.id,{email:e.target.value}),placeholder:`Email`,inputMode:`email`})]},t.id)),(0,E.jsxs)(`button`,{type:`button`,className:`nfm-add`,onClick:oe,children:[`+ `,i(`Thêm người liên hệ`,`Kontakt hinzufügen`)]})]})]}),(0,E.jsxs)(`details`,{className:`nfm-sec`,children:[(0,E.jsxs)(`summary`,{children:[(0,E.jsx)(`span`,{className:`nfm-sec-num`,children:`4`}),(0,E.jsx)(`span`,{className:`nfm-sec-title`,children:i(`Giấy tờ gốc cất ở đâu`,`Wo werden Originaldokumente aufbewahrt?`)}),(0,E.jsx)(`span`,{className:G[3]?`nfm-sec-state ok`:`nfm-sec-state`,children:G[3]?i(`Đã điền`,`Ausgefüllt`):i(`Chưa điền`,`Nicht ausgefüllt`)}),(0,E.jsx)(`span`,{className:`nfm-chev`,"aria-hidden":!0,children:`›`})]}),(0,E.jsxs)(`div`,{className:`nfm-box`,children:[v.documents.map(t=>(0,E.jsxs)(`div`,{className:`nfm-item`,children:[(0,E.jsxs)(`div`,{className:`nfm-item-top`,children:[(0,E.jsx)(`input`,{value:t.label,onChange:e=>Q(t.id,{label:e.target.value}),placeholder:i(`Tên giấy tờ`,`Dokumentname`),"aria-label":i(`Tên giấy tờ`,`Dokumentname`)}),(0,E.jsx)(`button`,{type:`button`,className:`nfm-del`,"aria-label":e===`de`?`Dokument ${t.label||`löschen`} entfernen`:`Xóa ${t.label||`giấy tờ`}`,onClick:()=>se(t.id),children:`✕`})]}),(0,E.jsxs)(`div`,{className:`nfm-row-grid`,children:[(0,E.jsxs)(`label`,{className:`nfm-field`,children:[(0,E.jsx)(`span`,{children:i(`Bản gốc cất ở đâu`,`Aufbewahrungsort des Originals`)}),(0,E.jsx)(`input`,{value:t.location,onChange:e=>Q(t.id,{location:e.target.value}),placeholder:i(`Nơi cất bản gốc — không ghi mật khẩu`,`Aufbewahrungsort des Originals — keine Passwörter eintragen`)})]}),(0,E.jsxs)(`label`,{className:`nfm-field`,children:[(0,E.jsx)(`span`,{children:i(`Ghi chú`,`Notiz`)}),(0,E.jsx)(`input`,{defaultValue:``,readOnly:!0,tabIndex:-1,placeholder:i(`Viết tay trên bản in nếu cần`,`Bei Bedarf auf dem Ausdruck handschriftlich ergänzen`),"aria-label":i(`Ghi chú — dành để viết tay trên bản in`,`Notiz — für handschriftliche Ergänzungen auf dem Ausdruck`)})]})]})]},t.id)),(0,E.jsxs)(`button`,{type:`button`,className:`nfm-add`,onClick:ce,children:[`+ `,i(`Thêm giấy tờ`,`Dokument hinzufügen`)]})]})]}),(0,E.jsxs)(`details`,{className:`nfm-sec`,children:[(0,E.jsxs)(`summary`,{children:[(0,E.jsx)(`span`,{className:`nfm-sec-num`,children:`5`}),(0,E.jsx)(`span`,{className:`nfm-sec-title`,children:i(`Nguyện vọng của bạn`,`Ihre Wünsche`)}),(0,E.jsx)(`span`,{className:G[4]?`nfm-sec-state ok`:`nfm-sec-state`,children:G[4]?i(`Đã điền`,`Ausgefüllt`):i(`Chưa điền`,`Nicht ausgefüllt`)}),(0,E.jsx)(`span`,{className:`nfm-chev`,"aria-hidden":!0,children:`›`})]}),(0,E.jsx)(`div`,{className:`nfm-box`,children:(0,E.jsxs)(`label`,{className:`nfm-field`,children:[(0,E.jsx)(`span`,{children:i(`Nếu bạn không còn, số tiền này nên được dùng thế nào`,`Wie soll dieses Geld verwendet werden, wenn Sie nicht mehr da sind?`)}),(0,E.jsx)(`textarea`,{value:v.wishes,onChange:e=>X({wishes:e.target.value}),placeholder:i(`Đây không phải di chúc và không có giá trị pháp lý, nhưng giúp người ở lại hiểu ý bạn.`,`Dies ist kein Testament und hat keine rechtliche Wirkung, hilft Angehörigen aber, Ihre Wünsche zu verstehen.`)})]})})]}),(0,E.jsxs)(`section`,{className:`nfm-sec-static`,children:[(0,E.jsxs)(`h2`,{children:[(0,E.jsx)(`span`,{className:`nfm-sec-num`,children:`6`}),(0,E.jsx)(`span`,{className:`nfm-sec-title`,children:i(`Tình hình tại thời điểm in`,`Stand zum Zeitpunkt des Ausdrucks`)})]}),(0,E.jsxs)(`div`,{className:`nfm-box`,children:[(0,E.jsxs)(`div`,{className:`nfm-snap`,children:[(0,E.jsxs)(`div`,{className:`nfm-snap-cell`,children:[(0,E.jsx)(`span`,{className:`nfm-snap-k`,children:W.valueComplete?i(`Tổng tài sản`,`Gesamtvermögen`):i(`Tài sản đã định giá`,`Bewertetes Vermögen`)}),(0,E.jsx)(`span`,{className:`nfm-snap-v`,children:p(W.total,e)})]}),(0,E.jsxs)(`div`,{className:`nfm-snap-cell`,children:[(0,E.jsx)(`span`,{className:`nfm-snap-k`,children:i(`Số lượng VWCE`,`VWCE-Anteile`)}),(0,E.jsx)(`span`,{className:`nfm-snap-v`,children:m(W.qty,e,4)})]}),(0,E.jsxs)(`div`,{className:`nfm-snap-cell`,children:[(0,E.jsx)(`span`,{className:`nfm-snap-k`,children:i(`Giá VWCE dùng để tính`,`Verwendeter VWCE-Preis`)}),(0,E.jsx)(`span`,{className:`nfm-snap-v`,children:W.price===null?`—`:p(W.price,e)})]}),(0,E.jsxs)(`div`,{className:`nfm-snap-cell`,children:[(0,E.jsx)(`span`,{className:`nfm-snap-k`,children:i(`Số giao dịch đã ghi`,`Erfasste Transaktionen`)}),(0,E.jsx)(`span`,{className:`nfm-snap-v`,children:S.length})]})]}),W.valueComplete?null:(0,E.jsx)(`p`,{className:`nfm-valuation-warning`,role:`note`,children:i(`Giá trị chưa đầy đủ vì một số vị thế thiếu giá.`,`Der Wert ist unvollständig, weil für einige Positionen Kurse fehlen.`)}),W.otherHoldings.length>0?(0,E.jsxs)(`table`,{className:`nfm-holdings`,children:[(0,E.jsx)(`caption`,{children:i(`Chứng khoán khác`,`Weitere Wertpapiere`)}),(0,E.jsx)(`thead`,{children:(0,E.jsxs)(`tr`,{children:[(0,E.jsx)(`th`,{scope:`col`,children:i(`Mã`,`Kennung`)}),(0,E.jsx)(`th`,{scope:`col`,children:i(`Số lượng`,`Anteile`)}),(0,E.jsx)(`th`,{scope:`col`,children:i(`Giá mỗi đơn vị`,`Kurs je Anteil`)})]})}),(0,E.jsx)(`tbody`,{children:W.otherHoldings.map(([t,n])=>(0,E.jsxs)(`tr`,{children:[(0,E.jsx)(`th`,{scope:`row`,children:t===`IE000VAHT5T0`?`VALL`:t}),(0,E.jsx)(`td`,{children:m(n.qty,e,4)}),(0,E.jsx)(`td`,{children:n.price==null?`—`:p(n.price,e)})]},t))})]}):null,(0,E.jsxs)(`ul`,{className:`nfm-goals`,children:[b.map(t=>(0,E.jsxs)(`li`,{children:[t.name,(0,E.jsxs)(`span`,{children:[h(t.dueDate,e),` · `,p(t.amount,e)]})]},t.id)),b.length===0&&(0,E.jsxs)(`li`,{children:[i(`Chưa có mục tiêu nào`,`Noch keine Ziele`),(0,E.jsx)(`span`,{})]})]})]})]}),(0,E.jsx)(`p`,{className:fe,role:`status`,"aria-live":`polite`,children:de}),F?(0,E.jsxs)(`div`,{className:`nfm-save-error`,role:`alert`,children:[(0,E.jsx)(`span`,{children:F}),(0,E.jsx)(`button`,{type:`button`,className:`secondary`,onClick:ue,children:i(`Thử lưu lại`,`Speichern erneut versuchen`)})]}):null]})}export{k as default};