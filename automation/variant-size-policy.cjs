function planVariantNames(product, reference) {
  if (!product || !reference || product.name !== reference.name || !product.hasVariants) return {reason:'Product identity differs'};
  const current=product.variants||[], expected=reference.variants||[];
  if (!current.length || current.length<expected.length) return {reason:'Variant count differs'};
  const bySku=new Map(expected.map((v,i)=>[String(v.sku||'').toLowerCase(),i]));
  const skuIndexes=current.map(v=>bySku.get(String(v.sku||'').toLowerCase()));
  let indexes;
  if(new Set(skuIndexes.filter(i=>i!==undefined)).size===expected.length&&skuIndexes.filter(i=>i!==undefined).length===expected.length) indexes=skuIndexes;
  else if(current.length===expected.length&&current.every((v,i)=>Number(v.price)===Number(expected[i].price))) indexes=current.map((_,i)=>i);
  else return {reason:'Variant SKU/order and price do not establish a safe mapping'};
  if(!current.every((v,i)=>indexes[i]===undefined||Number(v.price)===Number(expected[indexes[i]].price))) return {reason:'Variant prices differ from source list'};
  const changes=current.flatMap((v,i)=>indexes[i]===undefined?[]:[{index:i,oldName:v.name||'',newName:expected[indexes[i]].name,price:Number(v.price)}]).filter(x=>x.oldName!==x.newName);
  return {changes,reason:changes.length?'Matched product and every variant price':'Already correct'};
}
module.exports={planVariantNames};
