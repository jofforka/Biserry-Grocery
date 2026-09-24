function stockFloor(product, minimum = 30) {
  if (product.isActive !== true) return null;
  const numeric = value => {
    const n=Number(value ?? 0);
    if (!Number.isFinite(n)) throw new Error('Invalid inventory value');
    return n;
  };
  const original = numeric(product.stock);
  const patch={};
  let changedVariants=0;
  if (Array.isArray(product.variants)) {
    const variants=product.variants.map(v=>{
      if(v.isActive===false || numeric(v.stock)>=minimum) return v;
      changedVariants++;
      return {...v,stock:minimum};
    });
    if(changedVariants) patch.variants=variants;
  }
  // Product and variant fields are independent floors. Never reduce a parent's
  // existing total, including when legacy variant totals are inconsistent.
  const stock=Math.max(original,minimum);
  if(stock!==original || product.stock == null) patch.stock=stock;
  return {patch,changedVariants};
}
module.exports={stockFloor};
