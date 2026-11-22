// Test-only fixture. Synthetic data, local Vite server, no production requests.
import React from "react";
import { createRoot } from "react-dom/client";
import GeminiVaultExplainer from "../src/components/GeminiVaultExplainer";
import type { Goal } from "../src/lib/types";
import type { GeminiFacts } from "../src/lib/geminiVaultFacts";
const params = new URLSearchParams(location.search);
const locale = params.get("locale") === "de" ? "de" : "vi";
document.documentElement.dataset.theme = params.get("theme") === "dark" ? "dark" : "light";
document.documentElement.lang = locale;
const goal: Goal = { id:"fixture-goal",name:"Testziel",dueDate:"2038-06-30",
  amount:10000,mode:"nominal",baseYear:2026,inflationRate:0.02,bufferPct:0,
  urgency:"hard",protectedAmount:0,notes:"",createdAt:"2026-01-01",updatedAt:"2026-01-01" };
const facts: GeminiFacts = { portfolioValue:521.97,contributed:560,monthly:120,
  yearRecorded:560,yearPlanned:600,year:2026,goalAmount:null,goalYear:null,
  goalMode:null,simulationYear:2038,cautious:10000,base:20000,optimistic:30000 };
createRoot(document.getElementById("root")!).render(
  <GeminiVaultExplainer locale={locale} goals={[goal]} facts={facts}/>
);
