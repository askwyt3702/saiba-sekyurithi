import {DYNAMIC_TEXT_REPLACEMENTS} from '../data/stageData';
export function dynamicDisplayText(text:string):string {
  for(const [old,replacement] of Object.entries(DYNAMIC_TEXT_REPLACEMENTS))text=text.split(old).join(replacement);
  return text;
}
