const REV='osh-catalog-v1',MARKER='catalog:defaults:v1';
const groups=[
  ['groceries','סופרמרקט ומזון',['מזון','סופרמרקט','מצרכים'],[
    ['shufersal','שופרסל','Shufersal'],['rami-levy','רמי לוי'],['yochananof','יוחננוף'],['victory','ויקטורי'],['osher-ad','אושר עד'],['hazi-hinam','חצי חינם'],['tiv-taam','טיב טעם'],['carrefour','קרפור','Carrefour'],['ampm','AM:PM','אם פם'],['freshmarket','פרשמרקט'],['keshet','קשת טעמים']]],
  ['home','בית וציוד לבית',['בית','ציוד לבית'],[
    ['max-stock','מקס סטוק','מקססטוק','Max Stock'],['ikea','איקאה','IKEA'],['home-center','הום סנטר','Home Center'],['ace','ACE','אייס'],['fox-home','FOX HOME','פוקס הום'],['naaman','נעמן'],['vardinon','ורדינון'],['soltam','סולתם']]],
  ['electronics','מחשבים ואלקטרוניקה',['אלקטרוניקה','מחשבים'],[
    ['ksp','KSP','קיי אס פי'],['ivory','אייבורי','Ivory'],['bug','באג','BUG'],['mahsaney-hashmal','מחסני חשמל'],['shekem','שקם אלקטריק'],['alm','א.ל.מ','אלמ'],['idigital','iDigital','איידיגיטל'],['dynamica','דינמיקה']]],
  ['pharmacy','פארם וטיפוח',['פארם','טיפוח'],[
    ['super-pharm','סופר-פארם','סופר פארם','Super Pharm'],['be','Be','בי פארם'],['good-pharm','גוד פארם','Good Pharm'],['april','אפריל'],['lalin','ללין'],['sabon','SABON','סבון']]],
  ['dining','מסעדות ובתי קפה',['מסעדות','אוכל בחוץ','בתי קפה'],[
    ['aroma','ארומה'],['greg','קפה גרג'],['landwer','לנדוור'],['cafe-cafe','קפה קפה'],['roladin','רולדין'],['mcdonalds',"מקדונלד'ס",'מקדונלדס',"McDonald's"],['burgeranch',"בורגראנץ'",'בורגראנץ'],['dominos',"דומינו'ס פיצה",'דומינוס'],['pizza-hut','פיצה האט'],['wolt','Wolt','וולט'],['ten-bis','תן ביס','תןביס','10bis']]],
  ['clothing','ביגוד והנעלה',['ביגוד','בגדים','אופנה'],[
    ['fox','FOX','פוקס'],['castro','קסטרו'],['renuar','רנואר'],['golf','גולף'],['hm','H&M'],['zara','ZARA','זארה'],['terminal-x','TERMINAL X','טרמינל איקס'],['delta','דלתא'],['hoodies','הודיס'],['urbanica','אורבניקה'],['decathlon','דקטלון'],['nike','Nike','נייקי'],['adidas','Adidas','אדידס']]],
  ['transport','תחבורה ורכב',['תחבורה','רכב','דלק'],[
    ['paz','פז'],['delek','דלק'],['sonol','סונול'],['dor-alon','דור אלון'],['ten','טן'],['pango','פנגו','Pango'],['cellopark','סלופארק','Cello'],['rav-kav','רב קו','רב-קו'],['gett','Gett','גט'],['rail','רכבת ישראל'],['road6','כביש 6']]],
  ['leisure','בילוי ופנאי',['בילויים','פנאי'],[
    ['cinema-city','סינמה סיטי'],['yes-planet','יס פלאנט'],['rav-hen','רב חן'],['hot-cinema','הוט סינמה'],['steimatzky','סטימצקי'],['tzomet','צומת ספרים']]],
  ['health','בריאות',['רפואה'],[
    ['clalit','כללית'],['maccabi','מכבי'],['meuhedet','מאוחדת'],['leumit','לאומית']]],
  ['communications','תקשורת ומנויים',['תקשורת','מנויים'],[
    ['bezeq','בזק'],['partner','פרטנר'],['cellcom','סלקום'],['pelephone','פלאפון'],['hot','HOT','הוט'],['yes','yes','יס'],['netflix','Netflix','נטפליקס'],['spotify','Spotify','ספוטיפיי'],['youtube','YouTube Premium']]],
  ['online','קניות באינטרנט',['קניות אונליין'],[
    ['amazon','Amazon','אמזון'],['aliexpress','AliExpress','אלי אקספרס'],['ebay','eBay','איביי'],['iherb','iHerb','אייהרב']]],
  ['pets','חיות מחמד',[],[['anipet','אניפט'],['petbuy','פט ביי','פטביי']]],
  ['housing','דיור וחשבונות',['דיור','חשבונות'],[['electric','חברת החשמל']]],
  ['gifts','מתנות ותרומות',['מתנות','תרומות'],[]],
  ['other','שונות',['אחר'],[]]
];
export const normalizeName=name=>String(name||'').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const matches=(entity,name)=>[entity.name,...(entity.aliases||[])].some(value=>normalizeName(value)===normalizeName(name));
export function findPlace(places,name){return places.find(place=>matches(place,name))}
// Stable identities/revisions make installation on two devices converge. A
// single migration marker means edited or deleted defaults are never restored.
export function seedDefaults(db){
  if(db.entities[MARKER])return false;
  const insert=entity=>db.entities[entity.id]={...entity,updatedAt:'2026-11-25T00:00:00.000Z',rev:REV};
  for(const [slug,name,aliases,places] of groups){
    const id='default:category:'+slug;
    let category=db.entities[id]||Object.values(db.entities).find(e=>e.kind==='category'&&[name,...aliases].some(n=>matches(e,n)));
    if(!category)category=insert({id,kind:'category',name,aliases,budget:0});
    if(category.deleted)continue;
    for(const [slug,place,...aliases] of places){
      const id='default:place:'+slug;
      if(db.entities[id]||Object.values(db.entities).some(e=>e.kind==='place'&&[place,...aliases].some(n=>matches(e,n))))continue;
      insert({id,kind:'place',name:place,aliases,category:category.id});
    }
  }
  insert({id:MARKER,kind:'catalog-migration'});
  return true;
}
// Untouched starter data must not prevent a new device from opening its user's
// existing encrypted GitHub vault. User changes still block replacement.
export function hasUserContent(db){return Object.values(db.entities).some(e=>
  ['transaction','template','planned','category','place'].includes(e.kind)&&
    !(e.id.startsWith('default:')&&e.rev===REV)||
  e.kind==='expense-budget'||e.kind==='month'&&(e.expenseBudget>0||e.expenseBudgetOverride||(e.budgets||[]).some(b=>b.amount>0)))}

export const expenseGroupLabels={living:'מחיה',leisure:'מותרות'};
const livingCategories=new Set(['groceries','home','pharmacy','clothing','transport','health','communications','pets','housing']);
// Existing categories get a suggested group without rewriting their records.
// An explicit user choice always wins, including for starter categories.
export function categoryGroup(category={}){
  if(Object.hasOwn(expenseGroupLabels,category.spendingGroup))return category.spendingGroup;
  const name=normalizeName(category.name);
  if([normalizeName('מותרות'),normalizeName('פנאי וקניות')].includes(name))return 'leisure';
  const match=groups.find(([,label,aliases])=>[label,...aliases].some(n=>normalizeName(n)===name))||groups.find(([slug])=>category.id==='default:category:'+slug);
  return match&&!livingCategories.has(match[0])?'leisure':'living';
}
