import { test, expect } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react-swc";

const port = 5289;
const url = "http://127.0.0.1:" + port + "/tests/gemini-routing-fixture.html";
let vite: ViteDevServer | null = null;

// The fixture aliases only the Supabase import inside the Gemini component.
// It cannot contact real auth or Google and is never included in production.
const virtual = "\0gemini-routing-synthetic-supabase";
const mockSource = `
export const supabase = {
  auth: {
    getSession: async () => ({data:{session:{user:{id:"00000000-0000-4000-8000-000000000777"}}}}),
    onAuthStateChange: () => ({data:{subscription:{unsubscribe(){}}}}),
  },
  functions: {
    invoke: async (_name, options) => {
      if (options?.method === "GET") return {error:null,data:{
        ready:true,remaining:19,limitPerDay:20,
        modelChecks:[{status:200},{status:200}],
      }};
      const p=options?.body || {};
      const hard=p.topic==="goal" || p.topic==="simulation";
      const exhausted=new URLSearchParams(location.search).get("exhausted")==="1";
      const model=hard && !exhausted ? "gemini-3.8-flash" : "gemini-3.5-flash-lite";
      return {error:null,data:{model,remaining:19,cached:false,
        explanation: new URLSearchParams(location.search).get("locale")==="vi" ? "Chỉ là diễn giải giả định, không cam kết lợi nhuận." : "Eine hypothetische Erläuterung ohne Renditeversprechen."}};
    },
  },
};`;
test.beforeAll(async () => {
  vite = await createServer({
    configFile:false,root:process.cwd(),
    plugins:[{
      name:"gemini-synthetic-supabase",enforce:"pre",
      resolveId(id,importer){
        if(id==="../lib/supabase" && importer?.replaceAll("\\","/").endsWith("/src/components/GeminiVaultExplainer.tsx"))return virtual;
        return null;
      },
      load(id){return id===virtual?mockSource:null;},
    },react()],
    server:{host:"127.0.0.1",port,strictPort:true},
  });
  await vite.listen();
});
test.afterAll(async()=>{await vite?.close();vite=null;});

const labels = {
  de:{plan:"Mein Plan",year:"Dieses Jahr",goal:"Mein Ziel",simulation:"Simulation",value:"Depotwert",ask:"KI fragen"},
  vi:{plan:"Kế hoạch",year:"Năm nay",goal:"Mục tiêu",simulation:"Mô phỏng",value:"Giá trị quỹ",ask:"Hỏi Gemini"},
} as const;
const topics=["plan","year","goal","simulation","value"] as const;
for(const locale of ["de","vi"] as const){
  for(const theme of ["light","dark"] as const){
    test(`Gemini routing labels · ${locale} · ${theme} · 390x844`,async({page},testInfo)=>{
      test.setTimeout(90000);
      await page.setViewportSize({width:390,height:844});
      await page.goto(`${url}?locale=${locale}&theme=${theme}`);
      const card=page.getByTestId("gemini-vault-explainer");
      await expect(card).toBeVisible();
      await card.getByRole("checkbox").check();
      for(const topic of topics){
        await card.getByRole("button",{name:labels[locale][topic],exact:true}).click();
        if(topic==="year"){
          await expect(card.getByTestId("gemini-vault-model")).toHaveCount(0);
          await expect(card.getByText(locale==="vi"?/Vault tính trực tiếp/:/berechnet der Vault direkt/)).toBeVisible();
          await card.locator(".gemini-vault-local").scrollIntoViewIfNeeded();
          await page.screenshot({path:testInfo.outputPath(`gemini-${locale}-${theme}-year-VAULT.png`),animations:"disabled"});
          continue;
        }
        if(topic==="goal") await card.locator("#gemini-vault-goal").selectOption("fixture-goal");
        await card.getByRole("button",{name:labels[locale].ask}).click();
        const badge=card.getByTestId("gemini-vault-model");
        const target=topic==="goal" || topic==="simulation"?"Flash":"Flash-Lite";
        await expect(badge).toHaveText(`${locale==="vi"?"Mô hình":"Modell"}: ${target}`);
        await badge.scrollIntoViewIfNeeded();
        await page.screenshot({path:testInfo.outputPath(`gemini-${locale}-${theme}-${topic}-${target}.png`),animations:"disabled"});
      }
      // Model credit actually switches to Lite when Flash's global budget is exhausted.
      await page.goto(`${url}?locale=${locale}&theme=${theme}&exhausted=1`);
      const fallback=page.getByTestId("gemini-vault-explainer");
      await fallback.getByRole("checkbox").check();
      await fallback.getByRole("button",{name:labels[locale].goal}).click();
      await fallback.locator("#gemini-vault-goal").selectOption("fixture-goal");
      await fallback.getByRole("button",{name:labels[locale].ask}).click();
      await expect(fallback.getByTestId("gemini-vault-model")).toHaveText(`${locale==="vi"?"Mô hình":"Modell"}: Flash-Lite`);
      await fallback.getByTestId("gemini-vault-model").scrollIntoViewIfNeeded();
      await page.screenshot({path:testInfo.outputPath(`gemini-${locale}-${theme}-goal-Flash-exhausted.png`),animations:"disabled"});
    });
  }
}
