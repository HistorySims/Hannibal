// Shared campaign progress. A battle counts as "done" once it has been
// fought to its end, win or lose: the point is to live through the history,
// not to beat it.
const SPW_KEY = "spw_campaign_progress_v1";

function spwLoad(){
  try { return JSON.parse(localStorage.getItem(SPW_KEY) || "{}"); }
  catch(e){ return {}; }
}

function spwMarkDone(id){
  const s = spwLoad();
  s[id] = true;
  try { localStorage.setItem(SPW_KEY, JSON.stringify(s)); } catch(e){}
}
