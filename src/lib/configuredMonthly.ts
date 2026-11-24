import {isValidAsOfDate,toDateOnly} from "./instrument";
import type {AppSettings} from "./types";
/** Current configured plan phase, not an inferred broker order. Null is unknown; zero is a real setting. */
export function configuredMonthlyAt(settings:Pick<AppSettings,"startDate"|"contributionY1"|"contributionY2">|null,today:Date):number|null {
  if(!settings||!isValidAsOfDate(settings.startDate)||!Number.isFinite(today.getTime()))return null;
  const day=toDateOnly(today);
  if(day<settings.startDate)return null;
  const months=(today.getFullYear()-Number(settings.startDate.slice(0,4)))*12+today.getMonth()+1-Number(settings.startDate.slice(5,7));
  const amount=months<12?settings.contributionY1:settings.contributionY2;
  return Number.isFinite(amount)&&amount>=0&&amount<=1e9?Math.round(amount*100)/100:null;
}
