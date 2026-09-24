const MIXED_SKUS=new Set(['RUONO-IJEBU-GARRI-2026','RUONO-IRISH-POTATO-2026','RUONO-GOAT-MEAT-2026']);
function planLegacyCleanup(product,source){
 if(!product||!source||!MIXED_SKUS.has(product.sku)||product.name!==source.name||!product.hasVariants)return {reason:'Product identity differs'};
 const current=product.variants||[],expected=source.variants||[];
 const sourceIndexes=expected.map(row=>current.findIndex(v=>v.sku===row.sku&&v.name===row.name&&Number(v.price)===Number(row.price)&&v.isActive!==false));
 if(sourceIndexes.some(i=>i<0)||new Set(sourceIndexes).size!==expected.length)return {reason:'Verified supplier options missing or changed'};
 const oldIndexes=current.map((v,i)=>i).filter(i=>!sourceIndexes.includes(i)&&current[i].isActive!==false);
 if(!oldIndexes.length)return {reason:'Already cleaned'};
 if(oldIndexes.length!==3||current.length!==expected.length+3)return {reason:'Unexpected legacy option count'};
 return {oldIndexes,sourceIndexes,reason:'Verified all supplier options and three older options'};
}
module.exports={planLegacyCleanup};
