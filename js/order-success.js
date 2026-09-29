import { BUSINESS } from "./firebase-config.js";

const params=new URLSearchParams(location.search);
const orderId=params.get("order")||"";
const payLink=document.getElementById("payOrderLink");
const dispatchLink=document.getElementById("dispatchOrderLink");
const trackLink=document.getElementById("trackOrderLink");
const orderText=document.getElementById("orderNumberText");
const primaryLink=document.getElementById("primaryOrderWhatsApp");
const backupLink=document.getElementById("backupOrderWhatsApp");

function money(v){
  return new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(v||0));
}
function lastOrder(){
  try{return JSON.parse(localStorage.getItem("biserryLastOrder")||"null")}catch{return null}
}
function orderMessage(order){
  const items=(order?.items||[]).map((item,i)=>{
    const qty=Number(item.quantity||1),price=Number(item.price||0);
    return `${i+1}. ${item.name} x${qty} — ${money(price*qty)}`;
  }).join("\n");
  return [
    "NEW BISERRY ORDER",
    `Order ID: ${order?.orderId||orderId||"N/A"}`,
    `Customer: ${order?.customerName||"N/A"}`,
    `Phone: ${order?.customerPhone||"N/A"}`,
    `Fulfillment: ${order?.fulfillment||"N/A"}`,
    order?.deliveryZone?`Delivery Zone: ${order.deliveryZone}`:"",
    order?.deliveryAddress?`Address: ${order.deliveryAddress}`:"",
    "",
    "ITEMS",
    items||"Order items unavailable on this device.",
    "",
    `Products: ${money(order?.productTotal||0)}`,
    `Delivery: ${money(order?.deliveryFee||0)}`,
    `TOTAL: ${money(order?.total||0)}`,
    order?.orderNote?`Note: ${order.orderNote}`:"",
    "",
    "Please confirm receipt and begin order preparation."
  ].filter(Boolean).join("\n");
}

if(orderId){
  payLink.href="payment.html?order="+encodeURIComponent(orderId);
  trackLink.href="track-order.html?order="+encodeURIComponent(orderId);
  dispatchLink.href="dispatch.html?order="+encodeURIComponent(orderId);
  orderText.textContent="Order ID: "+orderId+" — save this ID.";
}

const order=lastOrder();
const message=encodeURIComponent(orderMessage(order));
primaryLink.href=`https://wa.me/${BUSINESS.orderWhatsapp}?text=${message}`;
backupLink.href=`https://wa.me/${BUSINESS.backupWhatsapp}?text=${message}`;
