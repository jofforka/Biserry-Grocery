import { protectAdminPage } from "./admin-auth.js";
import { db, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp } from "./firebase-service.js";

protectAdminPage();

let dispatchers = [];
let editingId = null;
const form = document.getElementById("dispatcherForm");
const table = document.getElementById("dispatchersTable");
const search = document.getElementById("dispatcherSearch");
const summary = document.getElementById("dispatcherSummary");
const title = document.getElementById("dispatcherFormTitle");
const saveBtn = document.getElementById("saveDispatcherBtn");

function field(id){ return document.getElementById(id); }
function boolValue(id){ return field(id).value === "true"; }
function publicVisible(data){ return data.isApproved === true && data.isActive === true && data.isAvailable === true; }
function normalizePhone(phone=""){ return String(phone).replace(/[^0-9]/g,"").replace(/^0/,"234"); }

function resetForm(){
  editingId = null; form.reset();
  field("dispatcherApproved").value = "false";
  field("dispatcherActive").value = "true";
  field("dispatcherAvailable").value = "false";
  title.textContent = "Add Dispatcher";
  saveBtn.textContent = "Save Dispatcher";
}

function render(){
  const term = (search.value || "").toLowerCase().trim();
  const list = term ? dispatchers.filter(x => `${x.name} ${x.phone} ${x.email||""} ${x.serviceArea||""} ${x.vehicleType||""}`.toLowerCase().includes(term)) : dispatchers;
  const available = dispatchers.filter(x => x.isPublic === true).length;
  const pending = dispatchers.filter(x => x.isApproved !== true).length;
  summary.textContent = `${dispatchers.length} total • ${available} publicly available • ${pending} awaiting approval`;
  table.innerHTML = list.length ? list.map(d => `
    <tr>
      <td><strong>${d.name || "Unnamed"}</strong>${d.email ? `<br><small>${d.email}</small>` : ""}</td>
      <td>${d.phone || ""}<br><a href="https://wa.me/${normalizePhone(d.phone)}" target="_blank">WhatsApp</a></td>
      <td>${d.serviceArea || "—"}</td>
      <td>${d.vehicleType || "—"}</td>
      <td><span class="statusBadge" style="background:${d.isApproved===true?'#e6f5ea':'#fff1d6'};color:${d.isApproved===true?'#176b37':'#8a5a00'}">${d.isApproved===true?'Approved':'Pending'}</span>${d.isActive===true?'':'<br><small>Profile inactive</small>'}</td>
      <td><span class="statusBadge" style="background:${d.isPublic===true?'#e6f5ea':'#f4e7e7'};color:${d.isPublic===true?'#176b37':'#8b2d2d'}">${d.isPublic===true?'Available':'Unavailable'}</span></td>
      <td><div class="actionBtns">
        <button class="editBtn" onclick="editDispatcher('${d.id}')">Edit</button>
        <button class="duplicateBtn" onclick="toggleDispatcherApproval('${d.id}', ${d.isApproved===true?'false':'true'})">${d.isApproved===true?'Unapprove':'Approve'}</button>
        <button class="duplicateBtn" onclick="toggleDispatcherAvailability('${d.id}', ${d.isAvailable===true?'false':'true'})">${d.isAvailable===true?'Set Unavailable':'Set Available'}</button>
        <button class="deleteBtn" onclick="deleteDispatcher('${d.id}')">Delete</button>
      </div></td>
    </tr>`).join("") : `<tr><td colspan="7"><div class="emptyState">No dispatchers found.</div></td></tr>`;
}

async function load(){
  table.innerHTML = `<tr><td colspan="7"><div class="emptyState">Loading dispatchers…</div></td></tr>`;
  const snap = await getDocs(collection(db,"dispatchers"));
  dispatchers = snap.docs.map(d => ({id:d.id,...d.data()})).sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  render();
}

form.addEventListener("submit", async e => {
  e.preventDefault();
  const data = {
    name: field("dispatcherName").value.trim(), phone: field("dispatcherPhone").value.trim(),
    email: field("dispatcherEmail").value.trim().toLowerCase(), vehicleType: field("dispatcherVehicle").value.trim(),
    serviceArea: field("dispatcherArea").value.trim(), isApproved: boolValue("dispatcherApproved"),
    isActive: boolValue("dispatcherActive"), isAvailable: boolValue("dispatcherAvailable"), updatedAt: serverTimestamp()
  };
  data.isPublic = publicVisible(data);
  try {
    if(editingId) await updateDoc(doc(db,"dispatchers",editingId), data);
    else await addDoc(collection(db,"dispatchers"), {...data, createdAt:serverTimestamp(), authUid:""});
    resetForm(); await load();
  } catch(err){ alert("Dispatcher save failed: "+err.message); }
});

window.editDispatcher = id => {
  const d = dispatchers.find(x=>x.id===id); if(!d) return;
  editingId=id; field("dispatcherName").value=d.name||""; field("dispatcherPhone").value=d.phone||"";
  field("dispatcherEmail").value=d.email||""; field("dispatcherVehicle").value=d.vehicleType||""; field("dispatcherArea").value=d.serviceArea||"";
  field("dispatcherApproved").value=d.isApproved===true?"true":"false"; field("dispatcherActive").value=d.isActive===true?"true":"false"; field("dispatcherAvailable").value=d.isAvailable===true?"true":"false";
  title.textContent="Edit Dispatcher"; saveBtn.textContent="Update Dispatcher"; window.scrollTo({top:0,behavior:"smooth"});
};

window.toggleDispatcherApproval = async (id,value) => {
  const d=dispatchers.find(x=>x.id===id); if(!d) return;
  const patch={isApproved:value,isPublic:value && d.isActive===true && d.isAvailable===true,updatedAt:serverTimestamp()};
  await updateDoc(doc(db,"dispatchers",id),patch); await load();
};
window.toggleDispatcherAvailability = async (id,value) => {
  const d=dispatchers.find(x=>x.id===id); if(!d) return;
  const patch={isAvailable:value,isPublic:value && d.isApproved===true && d.isActive===true,lastAvailabilityAt:serverTimestamp(),updatedAt:serverTimestamp()};
  await updateDoc(doc(db,"dispatchers",id),patch); await load();
};
window.deleteDispatcher = async id => { if(!confirm("Delete this dispatcher profile?")) return; await deleteDoc(doc(db,"dispatchers",id)); await load(); };

search.addEventListener("input",render);
document.getElementById("cancelDispatcherEditBtn").addEventListener("click",resetForm);
resetForm(); load().catch(err=>alert(err.message));
