import { db, collection, getDocs, addDoc, serverTimestamp, query, orderBy } from "./firebase-service.js";

const CART_STORAGE_KEY = "biserryCart";
const WISHLIST_STORAGE_KEY = "biserryWishlist";

const fallbackProducts = [
  {id:"demo-1",name:"Premium Rice",category:"grains",price:75000,stock:20,imageUrl:"assets/rice.jpg",hasVariants:false,isFeatured:true,productNote:"Quality grains for family meals."},
  {id:"demo-2",name:"Vegetable Oil",category:"oil",price:48000,stock:10,imageUrl:"assets/vegetable-oil.jpg",hasVariants:false,isFeatured:true,productNote:"Cooking oil for everyday meals."},
  {id:"demo-3",name:"Toothpaste",category:"household",hasVariants:true,variantLabel:"Variety",imageUrl:"assets/household.jpg",isFeatured:true,variants:[{id:"v1",name:"Colgate",price:2500,stock:20,imageUrl:"assets/household.jpg"},{id:"v2",name:"Close-Up",price:2300,stock:15,imageUrl:"assets/household.jpg"}]}
];

let products=[], cart=loadCart(), wishlist=loadWishlist(), selectedQuantities={}, selectedVariants={}, currentCategory="all", activeModalProductId=null, activeModalImageIndex=0;

const productGrid=document.getElementById("productGrid"), featuredGrid=document.getElementById("featuredGrid"), searchInput=document.getElementById("searchInput");
const cartItems=document.getElementById("cartItems"), cartTotal=document.getElementById("cartTotal"), cartCount=document.getElementById("cartCount"), navCartCount=document.getElementById("navCartCount"), floatingCartCount=document.getElementById("floatingCartCount"), bottomCartCount=document.getElementById("bottomCartCount");
const floatingCartBtn=document.getElementById("floatingCartBtn"), bottomCartBtn=document.getElementById("bottomCartBtn"), miniCart=document.getElementById("miniCart"), miniCartOverlay=document.getElementById("miniCartOverlay"), closeMiniCartBtn=document.getElementById("closeMiniCartBtn"), miniCartItems=document.getElementById("miniCartItems"), miniCartTotal=document.getElementById("miniCartTotal");
const mobileMenuBtn=document.getElementById("mobileMenuBtn"), mainNav=document.getElementById("mainNav"), clearCartBtn=document.getElementById("clearCartBtn"), farmersMarketForm=document.getElementById("farmersMarketForm");

function loadCart(){try{return JSON.parse(localStorage.getItem(CART_STORAGE_KEY))||[]}catch{return[]}}
function saveCart(){localStorage.setItem(CART_STORAGE_KEY,JSON.stringify(cart))}
function loadWishlist(){try{return JSON.parse(localStorage.getItem(WISHLIST_STORAGE_KEY))||[]}catch{return[]}}
function saveWishlist(){localStorage.setItem(WISHLIST_STORAGE_KEY,JSON.stringify(wishlist))}
function formatNaira(amount){return new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(amount||0)}
function normalizeImageUrl(url){if(!url)return"assets/logo.png";const clean=String(url).trim();const file=clean.match(/drive\.google\.com\/file\/d\/([^/]+)/);if(file?.[1])return`https://drive.google.com/thumbnail?id=${file[1]}&sz=w1000`;const id=clean.match(/[?&]id=([^&]+)/);if(clean.includes("drive.google.com")&&id?.[1])return`https://drive.google.com/thumbnail?id=${id[1]}&sz=w1000`;return clean}
function toast(msg){const el=document.getElementById("cartToast");if(!el)return;el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),1600)}

async function loadProducts(){try{const q=query(collection(db,"products"),orderBy("createdAt","desc"));const snap=await getDocs(q);products=snap.docs.map(d=>({id:d.id,...d.data()}));if(!products.length)products=fallbackProducts}catch(e){console.warn(e.message);products=fallbackProducts}renderProducts();renderFeatured();renderCart()}
function getSelectedQuantity(id){return selectedQuantities[id]||1}
function getSelectedVariant(product){if(!product?.hasVariants)return null;const vid=selectedVariants[product.id]||product.variants?.[0]?.id;return product.variants?.find(v=>String(v.id)===String(vid))||product.variants?.[0]}
window.selectVariant=(id,vid)=>{selectedVariants[id]=vid;renderProducts();renderFeatured();if(String(activeModalProductId)===String(id)){activeModalImageIndex=0;refreshProductModal()}};
window.increaseProductQty=id=>{const p=products.find(x=>String(x.id)===String(id));if(!p)return;const v=getSelectedVariant(p),stock=v?Number(v.stock||0):Number(p.stock||0),q=getSelectedQuantity(id);if(q>=stock){alert("Selected quantity cannot exceed available stock.");return}selectedQuantities[id]=q+1;renderProducts();renderFeatured();if(String(activeModalProductId)===String(id))refreshProductModal()};
window.decreaseProductQty=id=>{selectedQuantities[id]=Math.max(1,getSelectedQuantity(id)-1);renderProducts();renderFeatured();if(String(activeModalProductId)===String(id))refreshProductModal()};
window.toggleWishlist=id=>{wishlist=wishlist.includes(id)?wishlist.filter(x=>x!==id):[...wishlist,id];saveWishlist();renderProducts();renderFeatured();toast(wishlist.includes(id)?"Added to wishlist":"Removed from wishlist")};

function productCard(p){const v=getSelectedVariant(p),q=getSelectedQuantity(p.id),price=v?Number(v.price||0):Number(p.price||0),stock=v?Number(v.stock||0):Number(p.stock||0),img=normalizeImageUrl(v?.imageUrl||p.imageUrl||p.image),optionLabel=p.variantLabel||(p.optionType==="sizes"?"Size":"Variety"),tag=p.variantLabel?`${p.variantLabel}s`:p.hasVariants?"Options":p.category,wished=wishlist.includes(p.id),stockClass=stock<=Number(p.lowStockThreshold||5)?"stockText low":"stockText";
const variantHtml=p.hasVariants&&p.variants?.length?`<div class="variantBox"><select onchange="selectVariant('${p.id}',this.value)">${p.variants.map(x=>`<option value="${x.id}" ${v?.id===x.id?"selected":""}>${x.name} — ${formatNaira(Number(x.price||0))}</option>`).join("")}</select></div>`:"";
return `<div class="card"><button class="productImage productImageButton" type="button" onclick="openProductModal('${p.id}')"><img src="${img}" alt="${p.name}" onerror="this.src='assets/logo.png'"><span class="imageHint">View</span></button><div class="cardBody"><div class="productBadges">${(p.isFeatured||p.featured)?'<span class="productBadge">Featured</span>':''}${stock<=Number(p.lowStockThreshold||5)&&stock>0?'<span class="productBadge">Low</span>':''}</div><div class="productMeta"><h3>${p.name}</h3><span class="categoryTag">${tag}</span></div><div class="ratingLine">★★★★★</div>${variantHtml}<p class="price">${formatNaira(price)}</p><p class="${stockClass}">${stock>0?`Stock: ${stock}`:"Out of Stock"}</p><div class="quantityRow"><button class="qtyBtn" onclick="decreaseProductQty('${p.id}')" type="button">−</button><div class="qtyDisplay">${q}</div><button class="qtyBtn" onclick="increaseProductQty('${p.id}')" type="button">+</button></div><div class="productActionRow"><button class="wishlistBtn ${wished?'active':''}" onclick="toggleWishlist('${p.id}')" type="button">♥</button><button class="btn addBtn" onclick="addToCart('${p.id}')" type="button" ${stock<=0?"disabled":""}>🛒 Add</button></div></div></div>`}
function renderProducts(){if(!productGrid)return;const s=(searchInput?.value||"").toLowerCase();const filtered=products.filter(p=>{const vt=(p.variants||[]).map(v=>`${v.name} ${v.sku||""}`).join(" ");return(currentCategory==="all"||p.category===currentCategory)&&`${p.name} ${p.category} ${p.sku||""} ${vt}`.toLowerCase().includes(s)});productGrid.innerHTML=filtered.length?filtered.map(productCard).join(""):'<div class="emptyState">No product found.</div>'}
function renderFeatured(){if(!featuredGrid)return;const featured=products.filter(p=>p.isFeatured||p.featured).slice(0,6),display=featured.length?featured:products.slice(0,4);featuredGrid.innerHTML=display.length?display.map(productCard).join(""):'<div class="emptyState">No featured products yet.</div>'}

window.addToCart=id=>{const p=products.find(x=>String(x.id)===String(id));if(!p)return;const v=getSelectedVariant(p),q=getSelectedQuantity(id),cartId=v?`${p.id}__${v.id}`:p.id,price=v?Number(v.price||0):Number(p.price||0),stock=v?Number(v.stock||0):Number(p.stock||0),name=v?`${p.name} - ${v.name}`:p.name,img=normalizeImageUrl(v?.imageUrl||p.imageUrl||p.image);const existing=cart.find(i=>String(i.cartId)===String(cartId));if(existing){if(existing.quantity+q>stock){alert("Cart quantity cannot exceed available stock.");return}existing.quantity+=q}else cart.push({cartId,productId:p.id,variantId:v?.id||null,name,price,stock,imageUrl:img,quantity:q});selectedQuantities[id]=1;saveCart();renderProducts();renderFeatured();renderCart();toast("Added to cart")};
window.increaseCartQty=cid=>{const i=cart.find(x=>String(x.cartId)===String(cid));if(!i)return;if(i.quantity>=Number(i.stock||0)){alert("Quantity cannot exceed available stock.");return}i.quantity++;saveCart();renderCart()};
window.decreaseCartQty=cid=>{const i=cart.find(x=>String(x.cartId)===String(cid));if(!i)return;i.quantity--;if(i.quantity<=0)cart=cart.filter(x=>String(x.cartId)!==String(cid));saveCart();renderCart()};
window.removeFromCart=cid=>{cart=cart.filter(x=>String(x.cartId)!==String(cid));saveCart();renderCart()};
function subtotal(){return cart.reduce((s,i)=>s+Number(i.price||0)*Number(i.quantity||1),0)}
function count(){return cart.reduce((s,i)=>s+Number(i.quantity||1),0)}
function renderMiniCart(){if(!miniCartItems||!miniCartTotal)return;if(!cart.length){miniCartItems.innerHTML='<div class="emptyState">Your cart is empty.</div>';miniCartTotal.textContent=formatNaira(0);return}miniCartItems.innerHTML=cart.map(i=>`<div class="miniCartItem"><img src="${normalizeImageUrl(i.imageUrl)}" onerror="this.src='assets/logo.png'"><div><strong>${i.name}</strong><span>${formatNaira(i.price)} x ${i.quantity}</span></div><button onclick="removeFromCart('${i.cartId}')" type="button">×</button></div>`).join("");miniCartTotal.textContent=formatNaira(subtotal())}
function renderCart(){const c=count();if(cartCount)cartCount.textContent=c;if(navCartCount)navCartCount.textContent=c;if(floatingCartCount)floatingCartCount.textContent=c;if(bottomCartCount)bottomCartCount.textContent=c;if(!cart.length){if(cartItems)cartItems.innerHTML='<div class="emptyState">Your cart is empty.</div>';if(cartTotal)cartTotal.textContent=formatNaira(0);renderMiniCart();return}if(cartItems)cartItems.innerHTML=cart.map(i=>`<div class="cartItem"><div><strong>${i.name}</strong><br><span>${formatNaira(i.price)} x ${i.quantity}</span><br><span>Subtotal: ${formatNaira(i.price*i.quantity)}</span></div><div class="cartControls"><button onclick="decreaseCartQty('${i.cartId}')" type="button">−</button><span>${i.quantity}</span><button onclick="increaseCartQty('${i.cartId}')" type="button">+</button><button class="removeBtn" onclick="removeFromCart('${i.cartId}')" type="button">×</button></div></div>`).join("");if(cartTotal)cartTotal.textContent=formatNaira(subtotal());renderMiniCart()}
function openMiniCart(){miniCart?.classList.add("open");miniCartOverlay?.classList.add("show")}function closeMiniCart(){miniCart?.classList.remove("open");miniCartOverlay?.classList.remove("show")}

function galleryImages(p){const v=getSelectedVariant(p);return [...new Set([v?.imageUrl,p.imageUrl,p.image,...(p.galleryImages||[]),...(v?.galleryImages||[])].filter(Boolean).map(normalizeImageUrl))]}
function ensureModal(){if(document.getElementById("productModalOverlay"))return;const m=document.createElement("div");m.id="productModalOverlay";m.className="productModalOverlay";m.innerHTML=`<div class="productModal"><button class="productModalClose" onclick="closeProductModal()" type="button">×</button><div class="productModalGallery"><button class="galleryArrow left" onclick="changeProductModalImage(-1)" type="button">‹</button><img id="productModalImage" src="assets/logo.png" onerror="this.src='assets/logo.png'"><button class="galleryArrow right" onclick="changeProductModalImage(1)" type="button">›</button><div id="productModalDots" class="productModalDots"></div></div><div class="productModalInfo"><span id="productModalCategory" class="categoryTag"></span><h2 id="productModalName"></h2><p id="productModalDescription"></p><div id="productModalVariantBox"></div><p id="productModalPrice" class="price"></p><p id="productModalStock" class="stockText"></p><div class="quantityRow modalQtyRow"><button class="qtyBtn" onclick="decreaseProductQty(activeModalProductId)" type="button">−</button><div id="productModalQty" class="qtyDisplay">1</div><button class="qtyBtn" onclick="increaseProductQty(activeModalProductId)" type="button">+</button></div><button id="productModalAddBtn" class="btn addBtn" type="button">Add to Cart</button></div></div>`;document.body.appendChild(m);m.addEventListener("click",e=>{if(e.target.id==="productModalOverlay")closeProductModal()})}
function renderModalImage(p){const imgs=galleryImages(p),img=imgs[activeModalImageIndex]||imgs[0]||"assets/logo.png";document.getElementById("productModalImage").src=img;document.getElementById("productModalDots").innerHTML=imgs.map((_,i)=>`<button class="${i===activeModalImageIndex?'active':''}" onclick="setProductModalImage(${i})" type="button"></button>`).join("")}
window.openProductModal=id=>{ensureModal();activeModalProductId=id;activeModalImageIndex=0;refreshProductModal();document.getElementById("productModalOverlay").classList.add("show")};
window.closeProductModal=()=>document.getElementById("productModalOverlay")?.classList.remove("show");
window.changeProductModalImage=d=>{const p=products.find(x=>String(x.id)===String(activeModalProductId));if(!p)return;const imgs=galleryImages(p);activeModalImageIndex=(activeModalImageIndex+d+imgs.length)%imgs.length;renderModalImage(p)};
window.setProductModalImage=i=>{const p=products.find(x=>String(x.id)===String(activeModalProductId));if(!p)return;activeModalImageIndex=i;renderModalImage(p)};
window.refreshProductModal=()=>{const p=products.find(x=>String(x.id)===String(activeModalProductId));if(!p)return;const v=getSelectedVariant(p),q=getSelectedQuantity(p.id),price=v?Number(v.price||0):Number(p.price||0),stock=v?Number(v.stock||0):Number(p.stock||0),label=p.variantLabel||(p.optionType==="sizes"?"Size":"Variety");document.getElementById("productModalCategory").textContent=p.category||"Product";document.getElementById("productModalName").textContent=v?`${p.name} - ${v.name}`:p.name;document.getElementById("productModalDescription").textContent=p.productNote||p.description||"Fresh, affordable and reliable groceries from Biserry Groceries.";document.getElementById("productModalPrice").textContent=formatNaira(price);document.getElementById("productModalStock").textContent=stock>0?`Available Stock: ${stock}`:"Out of Stock";document.getElementById("productModalQty").textContent=q;document.getElementById("productModalVariantBox").innerHTML=p.hasVariants&&p.variants?.length?`<div class="variantBox"><label>Select ${label}</label><select onchange="selectVariant('${p.id}',this.value)">${p.variants.map(x=>`<option value="${x.id}" ${v?.id===x.id?"selected":""}>${x.name} — ${formatNaira(Number(x.price||0))}</option>`).join("")}</select></div>`:"";const btn=document.getElementById("productModalAddBtn");btn.disabled=stock<=0;btn.textContent=stock<=0?"Out of Stock":`Add ${q} to Cart`;btn.onclick=()=>{addToCart(p.id);refreshProductModal()};renderModalImage(p)};

async function submitFarmersMarket(e){e.preventDefault();const data={customerName:document.getElementById("fmName").value.trim(),customerPhone:document.getElementById("fmPhone").value.trim(),deliveryAddress:document.getElementById("fmAddress").value.trim(),shoppingList:document.getElementById("fmList").value.trim(),budgetRange:document.getElementById("fmBudget").value.trim(),preferredDeliveryDate:document.getElementById("fmDate").value,notes:document.getElementById("fmNotes").value.trim(),status:"New",createdAt:serverTimestamp()};try{await addDoc(collection(db,"farmers_market_requests"),data);toast("Market list submitted");const msg=encodeURIComponent(`Farmers Market Request\nName: ${data.customerName}\nPhone: ${data.customerPhone}\nAddress: ${data.deliveryAddress}\nBudget: ${data.budgetRange}\nDate: ${data.preferredDeliveryDate}\nList: ${data.shoppingList}\nNotes: ${data.notes}`);window.open(`https://wa.me/2348100584211?text=${msg}`,"_blank");farmersMarketForm.reset()}catch(err){alert("Request failed: "+err.message)}}

document.querySelectorAll(".filter").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".filter").forEach(x=>x.classList.remove("active"));b.classList.add("active");currentCategory=b.dataset.category;renderProducts()}));
document.querySelectorAll("[data-category-jump]").forEach(b=>b.addEventListener("click",()=>{document.querySelector(`.filter[data-category="${b.dataset.categoryJump}"]`)?.click();document.getElementById("shop")?.scrollIntoView({behavior:"smooth"})}));
searchInput?.addEventListener("input",renderProducts);clearCartBtn?.addEventListener("click",()=>{cart=[];saveCart();renderCart()});floatingCartBtn?.addEventListener("click",openMiniCart);bottomCartBtn?.addEventListener("click",openMiniCart);closeMiniCartBtn?.addEventListener("click",closeMiniCart);miniCartOverlay?.addEventListener("click",closeMiniCart);mobileMenuBtn?.addEventListener("click",()=>mainNav?.classList.toggle("open"));mainNav?.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>mainNav?.classList.remove("open")));farmersMarketForm?.addEventListener("submit",submitFarmersMarket);


/* ===== Full-screen hero slider ===== */
function initHeroSlider(){
  const slides = [...document.querySelectorAll(".heroSlide")];
  const dotsWrap = document.getElementById("heroDots");
  const prevBtn = document.querySelector(".heroPrev");
  const nextBtn = document.querySelector(".heroNext");
  if (!slides.length || !dotsWrap) return;
  let current = 0;
  let timer = null;
  dotsWrap.innerHTML = slides.map((_, index) => `<button type="button" data-slide="${index}" aria-label="Go to slide ${index + 1}"></button>`).join("");
  const dots = [...dotsWrap.querySelectorAll("button")];
  function showSlide(index){
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => slide.classList.toggle("active", i === current));
    dots.forEach((dot, i) => dot.classList.toggle("active", i === current));
  }
  function restartTimer(){
    if (timer) clearInterval(timer);
    timer = setInterval(() => showSlide(current + 1), 5500);
  }
  prevBtn?.addEventListener("click", () => {showSlide(current - 1);restartTimer();});
  nextBtn?.addEventListener("click", () => {showSlide(current + 1);restartTimer();});
  dots.forEach(dot => dot.addEventListener("click", () => {showSlide(Number(dot.dataset.slide));restartTimer();}));
  showSlide(0);
  restartTimer();
}


export function getCartForCheckout(){return cart}
export function getCartSubtotalForCheckout(){return subtotal()}
export function getDeliveryFeeForCheckout(){return 0}
export function getDeliveryZoneForCheckout(){return ""}
export function getCartTotalForCheckout(){return subtotal()}
export function clearCartAfterOrder(){cart=[];saveCart();renderCart()}

initHeroSlider();
await loadProducts();
renderCart();
