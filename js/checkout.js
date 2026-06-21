import {
  db,
  collection,
  addDoc,
  serverTimestamp
} from "./firebase-service.js";

import { BUSINESS } from "./firebase-config.js";
import { getCartForCheckout, getCartTotalForCheckout, clearCartAfterOrder } from "./store.js";

const checkoutForm = document.getElementById("checkoutForm");

function formatNaira(amount) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(amount || 0);
}

checkoutForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const cart = getCartForCheckout();

  if (!cart.length) {
    alert("Please add at least one item to cart.");
    document.getElementById("shop").scrollIntoView({ behavior: "smooth" });
    return;
  }

  const customer = {
    name: document.getElementById("customerName").value.trim(),
    phone: document.getElementById("customerPhone").value.trim(),
    address: document.getElementById("customerAddress").value.trim(),
    fulfillment: document.getElementById("fulfillment").value,
    paymentMethod: document.getElementById("paymentMethod").value
  };

  const order = {
    customer,
    items: cart,
    total: getCartTotalForCheckout(),
    paymentStatus: customer.paymentMethod === "Cash on Delivery" ? "Pending" : "Awaiting Confirmation",
    orderStatus: "New",
    deliveryStatus: customer.fulfillment === "Pickup" ? "Pickup Requested" : "Awaiting Dispatch",
    createdAt: serverTimestamp()
  };

  try {
    const orderRef = await addDoc(collection(db, "orders"), order);

    await addDoc(collection(db, "customers"), {
      ...customer,
      lastOrderId: orderRef.id,
      lastOrderTotal: order.total,
      createdAt: serverTimestamp()
    });

    const orderList = cart.map(item =>
      `- ${item.name} x ${item.quantity} = ${formatNaira(Number(item.price) * Number(item.quantity))}`
    ).join("%0A");

    const message =
      `Hello ${BUSINESS.name},%0A%0A` +
      `I want to place an order.%0A%0A` +
      `Order ID: ${orderRef.id}%0A` +
      `Name: ${customer.name}%0A` +
      `Phone: ${customer.phone}%0A` +
      `Order Type: ${customer.fulfillment}%0A` +
      `Payment Method: ${customer.paymentMethod}%0A` +
      `Address/Note: ${customer.address}%0A%0A` +
      `Items:%0A${orderList}%0A%0A` +
      `Total: ${formatNaira(order.total)}`;

    clearCartAfterOrder();

    window.open(`https://wa.me/${BUSINESS.whatsapp}?text=${message}`, "_blank");
    alert("Order submitted successfully.");
    checkoutForm.reset();
  } catch (error) {
    alert("Order could not be submitted: " + error.message);
  }
});
