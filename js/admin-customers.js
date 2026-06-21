import { protectAdminPage } from "./admin-auth.js";
import {
  db,
  collection,
  getDocs,
  query,
  orderBy
} from "./firebase-service.js";

protectAdminPage();

const customersTable = document.getElementById("customersTable");

function formatNaira(amount) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(amount || 0);
}

async function loadCustomers() {
  const snap = await getDocs(collection(db, "customers"));
  customersTable.innerHTML = "";

  snap.forEach(docSnap => {
    const c = docSnap.data();

    customersTable.innerHTML += `
      <tr>
        <td>${c.name || ""}</td>
        <td>${c.phone || ""}</td>
        <td>${c.fulfillment || ""}</td>
        <td>${c.paymentMethod || ""}</td>
        <td>${formatNaira(c.lastOrderTotal || 0)}</td>
      </tr>
    `;
  });
}

loadCustomers().catch(error => alert(error.message));
