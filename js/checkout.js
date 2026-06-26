import { db, collection, addDoc, serverTimestamp } from "./firebase-service.js";
import { getCartForCheckout, getCartTotalForCheckout, clearCartAfterOrder } from "./store.js";

const form = document.getElementById("checkoutForm");

function formatNaira(amount){
  return new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(amount||0);
}

form?.addEventListener("submit", async event => {
  event.preventDefault();

  const cart = getCartForCheckout();
  if (!cart.length) {
    alert("Your cart is empty.");
    return;
  }

  const order = {
    customerName: document.getElementById("customerName").value.trim(),
    customerPhone: document.getElementById("customerPhone").value.trim(),
    fulfillment: document.getElementById("fulfillment").value,
    deliveryAddress: document.getElementById("deliveryAddress").value.trim(),
    paymentMethod: document.getElementById("paymentMethod").value,
    orderNote: document.getElementById("orderNote").value.trim(),
    items: cart,
    total: getCartTotalForCheckout(),
    orderStatus: "Pending",
    createdAt: serverTimestamp()
  };

  try {
    await addDoc(collection(db, "orders"), order);

    const itemLines = cart.map(item => `- ${item.name} x ${item.quantity} = ${formatNaira(item.price * item.quantity)}`).join("\\n");
    const message = encodeURIComponent(
      `New Biserry Order\\n\\nName: ${order.customerName}\\nPhone: ${order.customerPhone}\\nMethod: ${order.fulfillment}\\nAddress: ${order.deliveryAddress}\\nPayment: ${order.paymentMethod}\\n\\nItems:\\n${itemLines}\\n\\nTotal: ${formatNaira(order.total)}\\nNote: ${order.orderNote}`
    );

    clearCartAfterOrder();
    alert("Your order has been submitted. We will confirm availability and delivery.");
    window.open(`https://wa.me/2348100584211?text=${message}`, "_blank");
    window.location.href = "index.html";
  } catch (error) {
    alert("Order failed: " + error.message);
  }
});
