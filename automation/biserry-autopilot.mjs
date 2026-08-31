import admin from "firebase-admin";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  throw new Error("Missing FIREBASE_SERVICE_ACCOUNT GitHub secret.");
}
const serviceAccount = JSON.parse(raw);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

const DEFAULTS = {
  enabled: true,
  expressMultiplier: 1.30,
  scheduledMultiplier: 1.00,
  offerWindowMinutes: 15,
  maxAssignmentAttempts: 8,
  unpaidExpiryHours: 24
};

const activeStatuses = ["Assigned", "Accepted", "Picked Up", "On the Way", "Arrived"];

function n(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function serviceMultiplier(serviceType, cfg) {
  if (serviceType === "Express") return n(cfg.expressMultiplier, 1.30);
  if (serviceType === "Scheduled") return n(cfg.scheduledMultiplier, 1.00);
  return 1;
}

function zoneMatches(rider, booking) {
  const area = String(rider.serviceArea || "").toLowerCase().trim();
  const zone = String(booking.zoneName || "").toLowerCase().trim();
  if (!area || !zone) return false;
  return area.includes(zone) || zone.includes(area);
}

async function loadConfig() {
  const snap = await db.doc("app_config/dispatchAutomation").get();
  return { ...DEFAULTS, ...(snap.exists ? snap.data() : {}) };
}

async function mirrorTracking(id, patch) {
  await db.doc(`dispatchBookingTracking/${id}`).set({
    bookingId: id,
    ...patch,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

async function quoteNewBooking(docSnap, cfg) {
  const b = docSnap.data();
  if (!b.zoneId) {
    await docSnap.ref.set({
      automationState: "Needs Zone Review",
      automationNote: "No delivery zone was selected.",
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { action: "needs_review" };
  }

  const zoneSnap = await db.doc(`delivery_zones/${b.zoneId}`).get();
  if (!zoneSnap.exists || zoneSnap.data().isActive !== true) {
    await docSnap.ref.set({
      automationState: "Needs Zone Review",
      automationNote: "Delivery zone is missing or inactive.",
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { action: "needs_review" };
  }

  const z = zoneSnap.data();
  const baseFare = n(z.fee);
  if (baseFare <= 0) {
    await docSnap.ref.set({
      automationState: "Needs Fare Review",
      automationNote: "Delivery zone does not have a valid fare.",
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { action: "needs_review" };
  }

  const multiplier = serviceMultiplier(b.serviceType, cfg);
  const confirmedFare = Math.round(baseFare * multiplier);

  let riderEarning;
  if (n(z.riderEarning) > 0) {
    riderEarning = Math.round(n(z.riderEarning) * multiplier);
  } else if (n(z.commissionPercent) >= 0) {
    riderEarning = Math.round(confirmedFare * (1 - n(z.commissionPercent) / 100));
  } else {
    riderEarning = Math.round(confirmedFare * 0.80);
  }
  riderEarning = Math.max(0, Math.min(confirmedFare, riderEarning));

  const biserryCommission = confirmedFare - riderEarning;
  const commissionPercent = confirmedFare
    ? Number(((biserryCommission / confirmedFare) * 100).toFixed(2))
    : 0;

  await docSnap.ref.set({
    confirmedFare,
    riderEarning,
    biserryCommission,
    commissionPercent,
    status: "Awaiting Payment",
    paymentStatus: "Unpaid",
    automationState: "Quoted Automatically",
    automationNote: "",
    quotedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  await mirrorTracking(docSnap.id, {
    status: "Awaiting Payment",
    paymentStatus: "Unpaid",
    confirmedFare
  });

  return { action: "quoted" };
}

async function loadAvailableRiders() {
  const snap = await db.collection("dispatchers")
    .where("isApproved", "==", true)
    .where("isActive", "==", true)
    .where("isAvailable", "==", true)
    .get();

  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function loadRiderLoads() {
  const loads = new Map();
  const snap = await db.collection("dispatchBookings")
    .where("status", "in", activeStatuses)
    .get();

  for (const d of snap.docs) {
    const rider = d.data().assignedDispatcherId;
    if (rider) loads.set(rider, (loads.get(rider) || 0) + 1);
  }
  return loads;
}

function chooseRider(riders, booking, loads) {
  const skipped = new Set([
    ...(Array.isArray(booking.skippedDispatcherIds) ? booking.skippedDispatcherIds : []),
    ...(Array.isArray(booking.declinedDispatcherIds) ? booking.declinedDispatcherIds : [])
  ]);

  const candidates = riders.filter(r => !skipped.has(r.id));
  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const zoneScoreA = zoneMatches(a, booking) ? 0 : 1;
    const zoneScoreB = zoneMatches(b, booking) ? 0 : 1;
    if (zoneScoreA !== zoneScoreB) return zoneScoreA - zoneScoreB;

    const loadA = loads.get(a.id) || 0;
    const loadB = loads.get(b.id) || 0;
    if (loadA !== loadB) return loadA - loadB;

    const lastA = a.lastAssignedAt?.toMillis?.() || 0;
    const lastB = b.lastAssignedAt?.toMillis?.() || 0;
    return lastA - lastB;
  });

  return candidates[0];
}

async function assignBooking(docSnap, cfg, riders, loads, previousRiderId = null) {
  const b = docSnap.data();
  const attempts = n(b.assignmentAttempt, 0);

  if (attempts >= n(cfg.maxAssignmentAttempts, 8)) {
    await docSnap.ref.set({
      status: "Ready",
      assignedDispatcherId: null,
      assignedDispatcherName: "",
      automationState: "Needs Rider Review",
      automationNote: "Maximum automatic rider attempts reached.",
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await mirrorTracking(docSnap.id, {
      status: "Ready",
      assignedDispatcherName: ""
    });
    return { action: "needs_rider_review" };
  }

  const effective = {
    ...b,
    skippedDispatcherIds: [
      ...(Array.isArray(b.skippedDispatcherIds) ? b.skippedDispatcherIds : []),
      ...(previousRiderId ? [previousRiderId] : [])
    ]
  };

  const rider = chooseRider(riders, effective, loads);
  if (!rider) {
    await docSnap.ref.set({
      status: "Ready",
      assignedDispatcherId: null,
      assignedDispatcherName: "",
      skippedDispatcherIds: effective.skippedDispatcherIds,
      automationState: "Waiting for Available Rider",
      automationNote: "Autopilot will retry automatically.",
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await mirrorTracking(docSnap.id, {
      status: "Ready",
      assignedDispatcherName: ""
    });
    return { action: "waiting_rider" };
  }

  const minutes = Math.max(5, n(cfg.offerWindowMinutes, 15));
  const offerExpiresAt = Timestamp.fromMillis(Date.now() + minutes * 60_000);

  await docSnap.ref.set({
    status: "Assigned",
    assignedDispatcherId: rider.id,
    assignedDispatcherName: rider.name || "Dispatcher",
    assignmentAttempt: attempts + 1,
    skippedDispatcherIds: effective.skippedDispatcherIds,
    offerExpiresAt,
    assignedAt: FieldValue.serverTimestamp(),
    automationState: "Rider Assigned Automatically",
    automationNote: `Offer expires in ${minutes} minutes if not accepted.`,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  await db.doc(`dispatchers/${rider.id}`).set({
    lastAssignedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  loads.set(rider.id, (loads.get(rider.id) || 0) + 1);

  await mirrorTracking(docSnap.id, {
    status: "Assigned",
    assignedDispatcherName: rider.name || "Dispatcher"
  });

  return { action: "assigned", riderId: rider.id };
}

async function processBooking(docSnap, cfg, riders, loads) {
  let b = docSnap.data();

  if (b.status === "New") {
    const result = await quoteNewBooking(docSnap, cfg);
    return result;
  }

  if (b.status === "Awaiting Payment" && b.paymentStatus === "Unpaid") {
    const quotedMs = b.quotedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
    const expiryMs = Math.max(1, n(cfg.unpaidExpiryHours, 24)) * 60 * 60_000;
    if (quotedMs && Date.now() - quotedMs > expiryMs) {
      await docSnap.ref.set({
        status: "Expired",
        automationState: "Expired Automatically",
        automationNote: "Payment was not received within the booking window.",
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      await mirrorTracking(docSnap.id, { status: "Expired" });
      return { action: "expired" };
    }
  }

  // Human bank verification is intentionally the only routine payment gate.
  // Once an admin marks the payment Paid, Autopilot handles rider assignment.
  if (b.paymentStatus === "Paid" && ["Awaiting Payment", "Ready"].includes(b.status)) {
    if (b.status !== "Ready") {
      await docSnap.ref.set({
        status: "Ready",
        automationState: "Payment Verified — Matching Rider",
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      await mirrorTracking(docSnap.id, { status: "Ready", paymentStatus: "Paid" });
      const refreshed = await docSnap.ref.get();
      return assignBooking(refreshed, cfg, riders, loads);
    }
    return assignBooking(docSnap, cfg, riders, loads);
  }

  if (b.status === "Declined" && b.paymentStatus === "Paid") {
    const current = b.assignedDispatcherId || null;
    const declined = [
      ...(Array.isArray(b.declinedDispatcherIds) ? b.declinedDispatcherIds : []),
      ...(current ? [current] : [])
    ];
    await docSnap.ref.set({
      declinedDispatcherIds: [...new Set(declined)],
      automationState: "Rider Declined — Reassigning",
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    const refreshed = await docSnap.ref.get();
    return assignBooking(refreshed, cfg, riders, loads, current);
  }

  if (b.status === "Assigned" && b.paymentStatus === "Paid") {
    const expiry = b.offerExpiresAt?.toMillis?.() || 0;
    if (expiry > 0 && expiry <= Date.now()) {
      return assignBooking(docSnap, cfg, riders, loads, b.assignedDispatcherId || null);
    }
  }

  return { action: "none" };
}


async function syncPendingPaymentProofs() {
  const snap = await db.collection("dispatchPaymentProofs")
    .where("status", "==", "Awaiting Verification")
    .get();

  let synced = 0;
  for (const proof of snap.docs) {
    const bookingRef = db.doc(`dispatchBookings/${proof.id}`);
    const booking = await bookingRef.get();
    if (!booking.exists) continue;
    const b = booking.data();
    if (b.paymentStatus === "Paid") continue;

    await bookingRef.set({
      paymentStatus: "Awaiting Verification",
      automationState: "Payment Proof Awaiting Verification",
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await mirrorTracking(proof.id, {
      paymentStatus: "Awaiting Verification"
    });
    synced++;
  }
  return synced;
}

async function run() {
  const cfg = await loadConfig();
  const started = Date.now();
  const counts = {};

  if (cfg.enabled === false) {
    await db.doc("app_config/autopilotStatus").set({
      enabled: false,
      lastRunAt: FieldValue.serverTimestamp(),
      state: "Disabled"
    }, { merge: true });
    console.log("Biserry Autopilot is disabled.");
    return;
  }

  const paymentProofsSynced = await syncPendingPaymentProofs();

  const [riders, loads] = await Promise.all([
    loadAvailableRiders(),
    loadRiderLoads()
  ]);

  const snap = await db.collection("dispatchBookings")
    .where("status", "in", ["New", "Awaiting Payment", "Ready", "Assigned", "Declined"])
    .get();

  for (const docSnap of snap.docs) {
    try {
      const result = await processBooking(docSnap, cfg, riders, loads);
      counts[result.action] = (counts[result.action] || 0) + 1;
    } catch (e) {
      console.error(`Booking ${docSnap.id} failed:`, e);
      counts.error = (counts.error || 0) + 1;
      await docSnap.ref.set({
        automationState: "Automation Error",
        automationNote: String(e?.message || e).slice(0, 500),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
  }

  await db.doc("app_config/autopilotStatus").set({
    enabled: true,
    state: counts.error ? "Completed With Exceptions" : "Healthy",
    lastRunAt: FieldValue.serverTimestamp(),
    durationMs: Date.now() - started,
    availableRiders: riders.length,
    processedBookings: snap.size,
    paymentProofsSynced,
    counts
  }, { merge: true });

  console.log(JSON.stringify({ processed: snap.size, riders: riders.length, paymentProofsSynced, counts }, null, 2));
}

run().then(() => process.exit(0)).catch(async e => {
  console.error(e);
  try {
    await db.doc("app_config/autopilotStatus").set({
      state: "Failed",
      lastRunAt: FieldValue.serverTimestamp(),
      lastError: String(e?.message || e).slice(0, 1000)
    }, { merge: true });
  } catch {}
  process.exit(1);
});
