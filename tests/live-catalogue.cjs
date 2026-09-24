const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{const browser=await chromium.launch({headless:true});const page=await browser.newPage({serviceWorkers:'block'});const report=[];fs.mkdirSync('live-check',{recursive:true});
 try{
  for(const file of ['shop.html','index.html']){
   await page.setViewportSize({width:1366,height:1000});
   await page.goto('https://biserrygrocery.com/'+file,{waitUntil:'domcontentloaded',timeout:60000});
   await page.waitForSelector('.productGrid .productImageButton',{timeout:60000});
   for(const [width,columns] of [[390,2],[1024,4],[1366,5],[1600,6]]){
    await page.setViewportSize({width,height:1000});
    const result=await page.locator('.productGrid').evaluate(grid=>({columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,cardCount:grid.querySelectorAll('.card').length,imageHeight:grid.querySelector('.productImageButton').getBoundingClientRect().height,cardHeight:grid.querySelector('.card').getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth}));
    assert.equal(result.columns,columns);assert.equal(result.imageHeight,width===390?104:170);assert.equal(result.overflow,false);assert.ok(result.cardCount>0);report.push({file,width,...result});
    if(width===1366){await page.locator('.productGrid').screenshot({path:`live-check/${file}.png`});}
   }
  }
  console.log(JSON.stringify(report,null,2));fs.writeFileSync('live-check/report.json',JSON.stringify(report,null,2));
 }catch(e){await page.screenshot({path:'live-check/failure.png'});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
