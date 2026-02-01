// -------------------------------
// FIREBASE SETUP
// -------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyBcyFGbWN3WiZE3Vsh5utA8CLPLMyxoNFI",
  authDomain: "chameleon-color.firebaseapp.com",
  projectId: "chameleon-color",
  storageBucket: "chameleon-color.firebasestorage.app",
  messagingSenderId: "832279785608",
  appId: "1:832279785608:web:953dfc8ac3d89ec02daf3d"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// -------------------------------
// DOM ELEMENTS
// -------------------------------
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const bloomCanvas = document.createElement("canvas");
const bloomCtx = bloomCanvas.getContext("2d");

const colorPicker = document.getElementById("colorPicker");
const submitBtn = document.getElementById("submitColor");

// -------------------------------
// CANVAS & IMAGES
// -------------------------------
canvas.width = canvas.height = 800;
bloomCanvas.width = bloomCanvas.height = 800;

const img = new Image();
img.src = "/img/chameleon.png";

const mask = new Image();
mask.src = "/img/mask.png";

const maskCanvas = document.createElement("canvas");
const maskCtx = maskCanvas.getContext("2d");

let loadedAssets = 0;

img.onload = mask.onload = () => {
  loadedAssets++;
  if (loadedAssets === 2) {
    // Match canvas sizes
    canvas.width = bloomCanvas.width = maskCanvas.width = img.width;
    canvas.height = bloomCanvas.height = maskCanvas.height = img.height;

    // Draw base chameleon
    ctx.drawImage(img, 0, 0);
    console.log("Chameleon drawn");

    // Draw mask to offscreen canvas
    maskCtx.drawImage(mask, 0, 0);
    console.log("Mask ready");
  }
};

// -------------------------------
// HELPERS
// ------------------------------
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// -------------------------------
// CIRCLE LOGIC
// -------------------------------
function randomRadius() {
  return Math.random() * (30 - 19) + 19; // 1�3 cm
};

function isAllowed(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= maskCanvas.width || iy >= maskCanvas.height) return false;
  return maskCtx.getImageData(ix, iy, 1, 1).data[0] > 200;
}

function randomPosition(r) {
  let x, y;
  do {
    x = Math.random() * canvas.width;
    y = Math.random() * canvas.height;
  } while (!isAllowed(x, y, r));
  return { x, y };
}

// Draw a static translucent circle (used for Firebase-loaded history
function drawStaticCircle(data) {
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = data.color;
  ctx.beginPath();
  ctx.arc(data.x, data.y, data.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}


// Save circle to Firebase
async function saveCircleToFirebase(data) {
  await db.collection("circles").add({
    x: data.x,
    y: data.y,
    r: data.r,
    color: data.color,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// -------------------------------
// BLOOMING CIRCLE CREATION
// -------------------------------
let isBlooming = false;

function createCircle(colorHex) {
  if (isBlooming) return;   // 👈 ignore extra clicks
  isBlooming = true;        // 🔒 lock

  submitBtn.disabled = true;
// Inline styles used intentionally to avoid CSS specificity conflicts
  submitBtn.style.opacity = "0.35";
  submitBtn.style.cursor = "default";
  submitBtn.style.pointerEvents = "none";
	
  bloomCtx.clearRect(0, 0, bloomCanvas.width, bloomCanvas.height);
  const base = randomPosition();
  const maxR = randomRadius();
  const circleData = {
  	x: base.x,
  	y: base.y,
  	r: maxR,
  	color: colorHex
  };
  const startTime = performance.now();
  const duration = 1600; // 1.6 seconds

  function animate(now) {
	const TARGET_OPACITY = 0.25;
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    const eased = easeOutCubic(t);

    // redraw base image + existing circles stay (important later)
    // for now we draw directly on canvas

    const layers = 20;
    ctx.globalCompositeOperation = "multiply"; // color mixing

    for (let i = 0; i < layers; i++) {
      const spread = eased * maxR * 0.35 * (i / layers); // outward only
      const dx = gaussianRandom() * spread;
      const dy = gaussianRandom() * spread;
      const rawR = eased * maxR * (0.6 + i / layers);
      const r = clamp(rawR, 0.5, maxR * 2);

	  bloomCtx.globalAlpha = 0.06;
      bloomCtx.beginPath();
      bloomCtx.arc(base.x + dx, base.y + dy, r, 0, Math.PI * 2);
      bloomCtx.fillStyle = colorHex;
      bloomCtx.fill();
    }

    ctx.save();
    ctx.globalAlpha = 0.005; // final opacity (same as your old circles)
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(bloomCanvas, 0, 0);
    ctx.restore();

    if (t < 1) {
	  requestAnimationFrame(animate);
	} else {
  	isBlooming = false; // 🔓 unlock AFTER bloom finishes
	
	submitBtn.disabled = false;
	// Inline styles used intentionally to avoid CSS specificity conflicts
    submitBtn.style.opacity = "";
    submitBtn.style.cursor = "";
    submitBtn.style.pointerEvents = "";
	}
	if (t >= 1) {
    saveCircleToFirebase(circleData);
    unlockButton(); // whatever you named it
    }
  }
  requestAnimationFrame(animate);
}

// -------------------------------
// EVENT LISTENER
// -------------------------------
submitBtn.addEventListener("click", () => {
  const chosenColor = colorPicker.value;
  createCircle(chosenColor);
});

// -------------------------------
// FIREBASE HISTORY SYNC
// -------------------------------
db.collection("circles")
  .orderBy("createdAt")
  .onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === "added") {
        drawStaticCircle(change.doc.data());
      }
    });
  });

// -------------------------------
// EMERGENCY: CLEAR ALL CIRCLES
// -------------------------------
function clearAllCircles() {
  db.collection("circles")
    .get()
    .then(snapshot => {
      snapshot.forEach(doc => doc.ref.delete());
    });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0); // redraw base chameleon
}
