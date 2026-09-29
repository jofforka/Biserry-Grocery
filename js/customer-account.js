import {
  auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut, onAuthStateChanged,
  collection, getDocs, query, where, limit, doc, getDoc, setDoc, serverTimestamp
} from "./firebase-service.js";

const authCard=document.getElementById("accountAuthCard"),profile=document.getElementById("accountProfile"),loginForm=document.getElementById("customerLoginForm"),registerForm=document.getElementById("customerRegisterForm"),ordersEl=document.getElementById("customerOrders"),listsEl=document.getElementById("customerShoppingLists");
let customerData={};
const money=v=>new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(v||0));
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

function showRegister(on){loginForm.classList.toggle("hidden",on);registerForm.classList.toggle("hidden",!on)}
function setFormBusy(form,busy,label){
  const btn=form?.querySelector('button[type="submit"]');
  if(!btn)return;
  if(!btn.dataset.label)btn.dataset.label=btn.textContent;
  btn.disabled=busy;
  btn.textContent=busy?label:btn.dataset.label;
}
function refreshEmailStatus(user){
  const status=document.getElementById("customerEmailStatus"),resend=document.getElementById("resendCustomerVerificationBtn");
  if(!status||!user)return;
  const verified=user.emailVerified===true;
  status.textContent=verified?"Email verified ✓":"Email not verified. Verify it to strengthen account recovery and ownership.";
  resend?.classList.toggle("hidden",verified);
}

document.getElementById("showAccountLogin")?.addEventListener("click",()=>showRegister(false));
document.getElementById("showAccountRegister")?.addEventListener("click",()=>showRegister(true));

loginForm?.addEventListener("submit",async e=>{
  e.preventDefault();
  setFormBusy(loginForm,true,"Signing In…");
  try{
    await signInWithEmailAndPassword(auth,document.getElementById("customerLoginEmail").value.trim().toLowerCase(),document.getElementById("customerLoginPassword").value);
  }catch(err){
    alert("Sign in failed: "+(err?.message||"Please check your email and password."));
  }finally{setFormBusy(loginForm,false,"")}
});

document.getElementById("customerPasswordResetBtn")?.addEventListener("click",async()=>{
  const email=document.getElementById("customerLoginEmail").value.trim().toLowerCase();
  if(!email)return alert("Enter your email address first, then tap Forgot Password.");
  const btn=document.getElementById("customerPasswordResetBtn");
  try{
    btn.disabled=true;btn.textContent="Sending…";
    await sendPasswordResetEmail(auth,email);
    alert("Password reset email sent. Check your inbox and spam folder.");
  }catch(err){
    alert("Password reset failed: "+(err?.message||"Please try again."));
  }finally{btn.disabled=false;btn.textContent="Forgot Password?"}
});

registerForm?.addEventListener("submit",async e=>{
  e.preventDefault();
  const name=document.getElementById("customerRegisterName").value.trim();
  const phone=document.getElementById("customerRegisterPhone").value.trim();
  const email=document.getElementById("customerRegisterEmail").value.trim().toLowerCase();
  const password=document.getElementById("customerRegisterPassword").value;
  if(name.length<2)return alert("Enter your full name.");
  if(phone.replace(/\D/g,"").length<7)return alert("Enter a valid phone / WhatsApp number.");
  setFormBusy(registerForm,true,"Creating Account…");
  try{
    const cred=await createUserWithEmailAndPassword(auth,email,password);
    await setDoc(doc(db,"customers",cred.user.uid),{
      name,phone,email:cred.user.email,defaultAddress:"",role:"customer",
      createdAt:serverTimestamp(),updatedAt:serverTimestamp()
    },{merge:true});
    try{await sendEmailVerification(cred.user);}catch(e){console.warn("Customer verification email not sent",e?.message||e)}
    alert("Account created. We also sent an email verification link if Firebase email delivery is available.");
  }catch(err){
    alert("Account creation failed: "+(err?.message||"Please try again."));
  }finally{setFormBusy(registerForm,false,"")}
});

document.getElementById("resendCustomerVerificationBtn")?.addEventListener("click",async()=>{
  const user=auth.currentUser;if(!user)return;
  const btn=document.getElementById("resendCustomerVerificationBtn");
  try{
    btn.disabled=true;btn.textContent="Sending…";
    await user.reload();
    if(user.emailVerified){refreshEmailStatus(user);return alert("Your email is already verified.");}
    await sendEmailVerification(user);
    alert("Verification email sent. Open the link in your inbox, then return to My Biserry.");
  }catch(err){alert("Could not send verification email: "+(err?.message||"Please try again."))}
  finally{btn.disabled=false;btn.textContent="Resend Verification Email"}
});

document.getElementById("customerSignOutBtn")?.addEventListener("click",()=>signOut(auth));

async function loadCustomer(user){
  try{await user.reload();}catch{}
  const current=auth.currentUser||user;
  const snap=await getDoc(doc(db,"customers",current.uid)),d=snap.exists()?snap.data():{};
  customerData=d;
  document.getElementById("customerProfileName").textContent=d.name||"My Biserry";
  document.getElementById("customerProfileEmail").textContent=current.email||"";
  document.getElementById("profileName").value=d.name||"";
  document.getElementById("profilePhone").value=d.phone||"";
  document.getElementById("profileAddress").value=d.defaultAddress||"";
  refreshEmailStatus(current);
  return d;
}

document.getElementById("customerProfileForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  const user=auth.currentUser;if(!user)return;
  const name=document.getElementById("profileName").value.trim(),phone=document.getElementById("profilePhone").value.trim(),address=document.getElementById("profileAddress").value.trim();
  if(name.length<2)return alert("Enter your full name.");
  if(phone.replace(/\D/g,"").length<7)return alert("Enter a valid phone / WhatsApp number.");
  await setDoc(doc(db,"customers",user.uid),{name,phone,email:user.email,defaultAddress:address,role:"customer",updatedAt:serverTimestamp()},{merge:true});
  alert("Delivery details saved.");
  await loadCustomer(user);
});

function renderShoppingLists(){
  if(!listsEl)return;
  const lists=Array.isArray(customerData.savedLists)?customerData.savedLists:[];
  listsEl.innerHTML=lists.length?lists.map((l,i)=>`<article class="accountOrderCard"><div><span class="sectionLabel">Saved list</span><h4>${esc(l.name||`List ${i+1}`)}</h4><p>${(l.items||[]).slice(0,4).map(x=>esc(x.name)).join(" • ")}${(l.items||[]).length>4?" + more":""}</p></div><div class="accountOrderActions"><button class="btn small" type="button" onclick="loadSavedList(${i})">Add to Cart</button><button class="btn outline small" type="button" onclick="deleteSavedList(${i})">Delete</button></div></article>`).join(""):'<div class="emptyState">No saved shopping list yet.</div>';
}
async function persistLists(){
  const u=auth.currentUser;if(!u)return;
  await setDoc(doc(db,"customers",u.uid),{savedLists:customerData.savedLists||[],updatedAt:serverTimestamp()},{merge:true});
  renderShoppingLists();
}

async function rebuildCartFromItems(items=[]){
  const cache=new Map(),cart=[];let skipped=0,adjusted=0;
  for(const old of items){
    const productId=String(old.productId||"").trim();
    if(!productId){skipped++;continue;}
    if(!cache.has(productId))cache.set(productId,await getDoc(doc(db,"products",productId)));
    const snap=cache.get(productId);
    if(!snap.exists()){skipped++;continue;}
    const p=snap.data();
    if(p.isActive!==true){skipped++;continue;}

    const requested=Math.max(1,Number(old.quantity||1));
    if(old.variantId){
      const v=(p.variants||[]).find(x=>String(x.id)===String(old.variantId)&&x.isActive!==false);
      if(!v||Number(v.price||0)<=1||Number(v.stock||0)<=0){skipped++;continue;}
      const qty=Math.min(requested,Number(v.stock||0));if(qty<requested)adjusted++;
      cart.push({
        cartId:`${productId}__${v.id}`,productId,variantId:v.id,
        name:`${p.name||old.name||"Product"} - ${v.name||"Option"}`,
        price:Number(v.price),stock:Number(v.stock||0),imageUrl:v.imageUrl||p.imageUrl||"assets/logo.png",quantity:qty
      });
    }else{
      if(p.hasVariants||Number(p.price||0)<=1||Number(p.stock||0)<=0){skipped++;continue;}
      const qty=Math.min(requested,Number(p.stock||0));if(qty<requested)adjusted++;
      cart.push({
        cartId:productId,productId,variantId:null,name:p.name||old.name||"Product",
        price:Number(p.price),stock:Number(p.stock||0),imageUrl:p.imageUrl||"assets/logo.png",quantity:qty
      });
    }
  }
  localStorage.setItem("biserryCart",JSON.stringify(cart));
  return {cart,skipped,adjusted};
}
function cartRefreshMessage(result){
  const parts=[];
  if(result.skipped)parts.push(`${result.skipped} unavailable item${result.skipped===1?" was":"s were"} skipped`);
  if(result.adjusted)parts.push(`${result.adjusted} quantit${result.adjusted===1?"y was":"ies were"} reduced to current stock`);
  return parts.length?"Cart refreshed from the live catalogue: "+parts.join("; ")+".":"Cart refreshed with current Biserry prices and stock.";
}

window.loadSavedList=async i=>{
  const l=(customerData.savedLists||[])[i];if(!l)return;
  try{
    const result=await rebuildCartFromItems(l.items||[]);
    if(!result.cart.length)return alert("None of the products in this saved list are currently available.");
    alert(cartRefreshMessage(result));
    location.href="cart.html";
  }catch(e){alert("Could not refresh this saved list: "+(e?.message||"Please try again."))}
};
window.deleteSavedList=async i=>{
  if(!confirm("Delete this saved shopping list?"))return;
  customerData.savedLists=(customerData.savedLists||[]).filter((_,x)=>x!==i);
  await persistLists();
};

document.getElementById("saveCurrentCartListBtn")?.addEventListener("click",async()=>{
  let cart=[];try{cart=JSON.parse(localStorage.getItem("biserryCart")||"[]")}catch{}
  if(!cart.length)return alert("Your cart is empty. Add products first, then save the cart as a list.");
  const name=prompt("Name this shopping list","Monthly Groceries");if(!name?.trim())return;
  customerData.savedLists=[...(customerData.savedLists||[]),{name:name.trim(),items:cart,createdAt:new Date().toISOString()}].slice(-20);
  await persistLists();
  alert("Shopping list saved.");
});

window.buyOrderAgain=async id=>{
  const order=window.__biserryOrders?.find(x=>x.id===id);if(!order)return;
  try{
    const result=await rebuildCartFromItems(order.items||[]);
    if(!result.cart.length)return alert("None of the products from this order are currently available.");
    alert(cartRefreshMessage(result));
    location.href="cart.html";
  }catch(e){alert("Could not rebuild this order: "+(e?.message||"Please try again."))}
};

async function loadOrders(user){
  ordersEl.innerHTML='<div class="emptyState">Loading your orders…</div>';
  const snap=await getDocs(query(collection(db,"orders"),where("customerUid","==",user.uid),limit(30)));
  const list=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  window.__biserryOrders=list;
  document.getElementById("accountOrderCount").textContent=`${list.length} order${list.length===1?"":"s"}`;
  ordersEl.innerHTML=list.length?list.map(o=>`<article class="accountOrderCard"><div><span class="sectionLabel">${esc(o.orderStatus||"Pending")}</span><h4>Order ${esc(o.id)}</h4><p>${(o.items||[]).slice(0,3).map(i=>esc(i.name)).join(" • ")}${(o.items||[]).length>3?" + more":""}</p></div><div class="accountOrderActions"><strong>${money(o.total)}</strong><button class="btn small" type="button" onclick="buyOrderAgain('${o.id}')">Buy Again</button><a class="btn outline small" href="track-order.html?order=${encodeURIComponent(o.id)}">Track</a></div></article>`).join(""):'<div class="emptyState">No account-linked orders yet. Your next signed-in checkout will appear here.</div>';
  return list;
}

onAuthStateChanged(auth,async user=>{
  if(!user){
    authCard.classList.remove("hidden");profile.classList.add("hidden");customerData={};return;
  }
  authCard.classList.add("hidden");profile.classList.remove("hidden");
  await loadCustomer(user);
  renderShoppingLists();
  const orders=await loadOrders(user);
  renderReorderSuggestions(orders);
});

document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible"&&auth.currentUser){
    auth.currentUser.reload().then(()=>refreshEmailStatus(auth.currentUser)).catch(()=>{});
  }
});

function localArray(key){try{return JSON.parse(localStorage.getItem(key)||"[]")||[]}catch{return[]}}
function renderLocalShoppingMemory(){
  const fav=document.getElementById("customerFavorites"),recent=document.getElementById("customerRecentlyViewed");
  const favoriteIds=localArray("biserryWishlist"),viewed=localArray("biserryRecentlyViewed");
  if(fav){
    const known=viewed.filter(x=>favoriteIds.map(String).includes(String(x.id)));
    fav.innerHTML=known.length?known.map(x=>`<article class="accountOrderCard"><div><h4>${esc(x.name||"Favorite product")}</h4><p>${money(x.price||0)} • ${esc(x.category||"Product")}</p></div><a class="btn small" href="shop.html">Shop</a></article>`).join(""):(favoriteIds.length?`<div class="emptyState">${favoriteIds.length} favorite product(s) saved. Open Shop to view them as the catalogue loads.</div>`:'<div class="emptyState">No favorites yet. Tap ♥ on products you buy often.</div>');
  }
  if(recent)recent.innerHTML=viewed.length?viewed.slice(0,8).map(x=>`<article class="accountOrderCard"><div><h4>${esc(x.name||"Product")}</h4><p>${money(x.price||0)} • ${esc(x.category||"")}</p></div><a class="btn outline small" href="shop.html">View</a></article>`).join(""):'<div class="emptyState">Products you open in the shop will appear here.</div>';
}

function renderReorderSuggestions(orders){
  const el=document.getElementById("customerReorderSuggestions");if(!el)return;
  const counts=new Map();
  (orders||[]).filter(o=>o.paymentStatus==="Paid"&&o.orderStatus!=="Cancelled").slice(0,8).forEach(o=>(o.items||[]).forEach(i=>{
    const k=String(i.productId||i.id||i.name),old=counts.get(k)||{...i,count:0};
    old.count++;counts.set(k,old);
  }));
  const top=[...counts.values()].sort((a,b)=>b.count-a.count).slice(0,5);
  el.innerHTML=top.length?top.map(i=>`<article class="accountOrderCard"><div><h4>${esc(i.name||"Product")}</h4><p>Bought in ${i.count} paid recent order${i.count===1?"":"s"}</p></div><a class="btn small" href="shop.html">Restock</a></article>`).join(""):'<div class="emptyState">Reorder suggestions appear after you have paid order history.</div>';
}
renderLocalShoppingMemory();
