/*
  نسخهٔ به‌روز:
  - منابع آنلاین: DuckDuckGo Instant Answer -> Wikipedia (fa)
  - پردازش فارسی: نرمال‌سازی، توکنایزر بهتر، لیست stopwords وسیعتر، و استمینگ ساده
  - اگر درخواست‌های آنلاین به دلیل CORS یا خطا رد شد، fallback محلی (قاعده‌ای + تولید ساده) فعال می‌شود.
*/

/* ---------- تنظیمات ---------- */
const STORAGE_CHAT = "simple_static_chat_v3";
const MESSAGES_EL = document.getElementById("messages");
const INPUT = document.getElementById("input");
const SEND = document.getElementById("sendBtn");
const STATUS = document.getElementById("statusText");
const SPINNER = document.getElementById("spinner");

/* ---------- UI helpers ---------- */
function appendMessage(text, who = "bot", source = "") {
    const w = document.createElement("div");
    w.className = "bubble " + (who === "user" ? "user" : "bot");
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = who === "user" ? "شما" : (source ? `ربات — منبع: ${source}` : "ربات");
    w.appendChild(meta);
    const c = document.createElement("div");
    c.textContent = text;
    w.appendChild(c);
    if (source) {
        const s = document.createElement("div");
        s.className = "source";
        s.textContent = `منبع: ${source}`;
        w.appendChild(s);
    }
    MESSAGES_EL.appendChild(w);
    MESSAGES_EL.scrollTop = MESSAGES_EL.scrollHeight;
}

/* ---------- ذخیره/بارگذاری چت ---------- */
function saveChats(chats) { localStorage.setItem(STORAGE_CHAT, JSON.stringify(chats)); }
function loadChats() { try { const r = localStorage.getItem(STORAGE_CHAT); return r ? JSON.parse(r) : [] } catch (e) { return [] } }
let chats = loadChats();
chats.forEach(m => appendMessage(m.text, m.who, m.source || ""));

/* ---------- بهبود پردازش فارسی ---------- */

/* لیست stopwords ترکیبی (نمونهٔ جمع‌شده از منابع عمومی) */
const PERSIAN_STOPWORDS = new Set([
    "و", "در", "به", "از", "که", "را", "این", "آن", "با", "برای", "است", "ای", "شد", "می", "تا", "هم", "یک", "های", "کنید", "کنم", "کنه",
    "چون", "ولی", "اگر", "یا", "همین", "مانند", "نیز", "هر", "بین", "بر", "بعد", "قبل", "همه", "بد", "خوب", "داشت", "داشتن", "بود",
    "بودن", "کرد", "کردن", "کن", "کنند", "باشد", "باشد", "باشد", "باشد", "تر", "ترین", "برخی", "چنین", "شدند", "شدن", "اگرچه", "چرا",
    "چطور", "کجا", "چه", "کی", "چه‌", "همش", "شد", "آنها", "آنها", "ما", "من", "تو", "او", "ایشان", "ایشون", "ولی", "باید", "شده", "باشد",
    "هرگز", "همیشه", "تقریباً", "درحالی‌که", "درصورتی‌که", "بعضی", "کلاً", "نه", "نه‌", "گونه", "طوری", "حتی", "درباره", "طبق", "ضمن",
    "ضمنِ", "پیش", "پس", "کنار", "زیر", "روی", "علاوه", "بدون", "دربارهٔ", "چند", "بیش", "کم", "تر", "ولی", "بیشتر", "کمتر",
    "همچنین", "آنچه", "آنچه‌", "آن‌", "بیش", "کم", "مان", "تان", "ها", "های", "ام", "ات", "اش", "ماند", "باشم", "باشی", "باشند", "شد",
    "اگر", "بنابراین", "پس", "آیا", "ولی", "حتی", "چرا", "کافی", "طی", "حتی‌", "ازجمله", "ازجمله‌", "ضمن", "بااین‌حال", "همون", "اون",
    "باشد", "نیست", "نیستند", "نیستم", "نیستی", "شدیم", "شدید", "شدن", "می‌شود", "می‌شود", "خواهیم", "خواهی", "خواهد",
    // (این لیست قابل گسترش است؛ به‌عنوان شروع پوشش خوبی دارد)
]);

/* نرمال‌سازی فارسی: ی عربی -> ی فارسی، ک عربی -> ک فارسی، حذف تَشکِیل و تبدیل نیم‌فاصله */
function normalizePersian(text) {
    if (!text) return "";
    // تبدیل انواع فاصله‌ها و نیم‌فاصله به space / zero-width non-joiner handling
    text = text.replace(/\u200c/g, " "); // zero-width non-joiner -> space
    text = text.replace(/\u200f/g, " "); // rtl mark
    // ی و ک عربی به فارسی
    text = text.replace(/ي/g, "ی").replace(/ك/g, "ک");
    // همسان‌سازی اً و أ و آ و ... به ساده‌ترین شکل
    text = text.replace(/[ًٌٍَُِْٰ]/g, ""); // حذف حرکات
    // تبدیل علامات فارسی/عربی به فاصله
    text = text.replace(/[\u0600-\u06FF\u0750-\u077F]/, (m) => m); // keep letters
    // حذف علامت‌های غیرحروف و ارقام (حفظ فارسی، لاتین و اعداد)
    text = text.replace(/[^\u0600-\u06FFa-zA-Z0-9\s؟\?،\-]/g, " ");
    // نرمال‌سازی چند فاصله
    text = text.replace(/\s+/g, " ").trim();
    return text;
}

/* توکنایزر بهتر: حذف stopwords، نگهداشتن کلمات معنی‌دار */
function tokenizePersian(text) {
    text = normalizePersian(text).toLowerCase();
    if (!text) return [];
    // جدا کردن با فاصله
    const toks = text.split(/\s+/).map(t => t.replace(/^[^\w\u0600-\u06FF]+|[^\w\u0600-\u06FF]+$/g, "")).filter(Boolean);
    // حذف stopwords و کلمات خیلی کوتاه
    return toks.filter(t => t.length > 1 && !PERSIAN_STOPWORDS.has(t));
}

/* ساده‌ترین استِمینگِ پسوندی (ها، تر، ترین، ام/ات/اش) */
function stemSimple(word) {
    // حذف پسوندهای عمومی
    return word.replace(/(ها|ترین|ترین|تر|ات|ام|اش|امان|‌ها)$/g, "");
}

/* ---------- منابع آنلاین ---------- */

/* 1) DuckDuckGo Instant Answer API
   endpoint مثال: https://api.duckduckgo.com/?q=SEARCH&format=json&no_html=1&skip_disambig=1
   توجه: ممکن است برخی درخواست‌ها در مرورگر به علت CORS بلاک شوند؛ در این صورت به fallback محلی خواهیم رفت.
   (مستندات عمومی و نمونه‌ها روی اینترنت موجود است.)
*/
async function fetchDuckDuckGo(query) {
    try {
        const q = encodeURIComponent(query);
        const url = `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`;
        const r = await fetch(url);
        if (!r.ok) throw new Error("ddg-not-ok:" + r.status);
        const data = await r.json();
        // بررسی فیلد abstract/AbstractText یا RelatedTopics
        if (data.AbstractText && data.AbstractText.trim()) {
            return { text: data.AbstractText.trim(), source: "DuckDuckGo (Instant Answer)" };
        }
        // بررسی RelatedTopics (متن‌ها)
        if (Array.isArray(data.RelatedTopics) && data.RelatedTopics.length > 0) {
            // بعضی عناصر ممکن است زیرعناصر داشته باشند
            const t = [];
            function collectTopics(arr) {
                arr.forEach(item => {
                    if (item.Text) t.push(item.Text);
                    if (item.Topics) collectTopics(item.Topics);
                });
            }
            collectTopics(data.RelatedTopics);
            if (t.length > 0) return { text: t.slice(0, 3).join("\n\n"), source: "DuckDuckGo (Related)" };
        }
        return null;
    } catch (e) {
        console.warn("DuckDuckGo fetch failed:", e);
        return null;
    }
}

/* 2) Wikipedia فارسی (summary) - از endpoint summary استفاده می‌کنیم */
async function fetchWikipediaSummary(query) {
    try {
        const q = encodeURIComponent(query);
        const opensearch = `https://fa.wikipedia.org/w/api.php?action=opensearch&search=${q}&limit=1&namespace=0&format=json&origin=*`;
        const r1 = await fetch(opensearch);
        if (!r1.ok) throw new Error("wiki-open-not-ok");
        const data1 = await r1.json();
        const titles = data1[1];
        if (!titles || !titles[0]) return null;
        const title = titles[0];
        const summaryUrl = `https://fa.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        const r2 = await fetch(summaryUrl);
        if (!r2.ok) return null;
        const d2 = await r2.json();
        if (d2.extract) return { text: d2.extract, source: `Wikipedia — ${title}`, url: d2.content_urls?.desktop?.page || null };
        return null;
    } catch (e) {
        console.warn("Wikipedia fetch failed:", e);
        return null;
    }
}

/* ---------- منطق پاسخ‌دهی ترکیبی: DuckDuckGo -> Wikipedia -> محلی ---------- */
async function getReply(query) {
    STATUS.textContent = "جستجو در منابع آنلاین...";
    SPINNER.style.display = "inline-block";

    // 1) DuckDuckGo
    const ddg = await fetchDuckDuckGo(query);
    if (ddg && ddg.text && ddg.text.length > 20) {
        SPINNER.style.display = "none";
        STATUS.textContent = "پاسخ از DuckDuckGo";
        return ddg;
    }

    // 2) Wikipedia
    const wiki = await fetchWikipediaSummary(query);
    if (wiki && wiki.text && wiki.text.length > 30) {
        SPINNER.style.display = "none";
        STATUS.textContent = "پاسخ از Wikipedia";
        return wiki;
    }

    // 3) محلی: قواعد ساده و تولیدِ کوتاه
    SPINNER.style.display = "none";
    // قواعد کلیدواژه‌ای
    const r = localRuleReply(query);
    if (r) { STATUS.textContent = "پاسخ محلی (قاعده)"; return { text: r, source: "محلی" }; }
    // در غیر اینصورت تولید کوتاه
    STATUS.textContent = "تولید پاسخ محلی (fallback)";
    return { text: markovGenerateSimple(query), source: "محلی" };
}

/* ---------- پاسخ‌دهی محلی (قوانین + مارکف ساده) ---------- */
function localRuleReply(q) {
    const s = normalizePersian(q).toLowerCase();
    const greets = ["سلام", "درود", "salam", "hi", "hello", "sghl"];
    for (const g of greets) if (s.includes(g)) return " چطور می‌تونم کمک کنم؟";
    if (s.includes("خوبی") || s.includes("حالت")) return "ممنون، خوبم! شما چطورید؟";
    if (s.includes("اسم") && s.includes("تو")) return "من یک چت‌بات ساده هستم که بلد نیستم حتی سلام کنم ";
    return null;
}

/* مارکف خیلی ساده: ترکیب جمله‌های آماده و برش */
const seedTexts = [
    "مگه من بهت نگفتم یه ربات بدرد نخورم؟",
    "چرا من باید به تو رو بدم؟",
    "........",
    "حوصله ی جواب دادن بهت رو ندارم"
];
function markovGenerateSimple(q) {
    const a = seedTexts[Math.floor(Math.random() * seedTexts.length)];
    return (a).slice(0, 400);
}

/* ---------- ارسال پیام (UI flow) ---------- */
async function sendMessageRaw(text) {
    text = (text || "").trim();
    if (!text) return;
    appendMessage(text, "user", "");
    chats.push({ who: "user", text, time: Date.now() });
    saveChats(chats);

    STATUS.textContent = "در حال یافتن جواب...";
    appendMessage("در حال تایپ...", "bot", "");
    const botBubble = MESSAGES_EL.lastElementChild;
    try {
        const res = await getReply(text);
        botBubble.querySelector("div:last-child").textContent = res.text;
        const meta = botBubble.querySelector(".meta");
        if (meta) meta.textContent = `ربات — منبع: ${res.source || "محلی"}`;
        chats.push({ who: "bot", text: res.text, time: Date.now(), source: res.source });
        saveChats(chats);
        STATUS.textContent = `پاسخ از: ${res.source || "محلی"}`;
    } catch (e) {
        botBubble.querySelector("div:last-child").textContent = "خطا در پردازش.";
        STATUS.textContent = "خطا";
        console.error(e);
    }
}

/* ---------- رویدادها ---------- */
SEND.addEventListener("click", async () => {
    const v = INPUT.value;
    if (!v.trim()) return;
    SEND.disabled = true;
    await sendMessageRaw(v);
    INPUT.value = "";
    SEND.disabled = false;
});
INPUT.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        SEND.click();
    }
});


// پاک کردن چت‌ها
document.getElementById("trashCan").addEventListener("click", () => {
    if (confirm("آیا مطمئنی می‌خوای تمام چت‌ها پاک بشه؟")) {
        chats = [];
        saveChats(chats); // خالی کردن localStorage
        MESSAGES_EL.innerHTML = ""; // خالی کردن UI
    }
});


// بخش های دیگر                -------------------------



// Three.js setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Create stars
const starsGeometry = new THREE.BufferGeometry();
const starsMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.02,
    transparent: true,
    opacity: 0.8
});

const starsVertices = [];
for (let i = 0; i < 7000; i++) {
    const x = (Math.random() - 0.5) * 2000;
    const y = (Math.random() - 0.5) * 2000;
    const z = (Math.random() - 0.5) * 2000;
    starsVertices.push(x, y, z);
}

starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
const starField = new THREE.Points(starsGeometry, starsMaterial);
scene.add(starField);

// Create galaxies
const galaxyGeometry = new THREE.BufferGeometry();
const galaxyMaterial = new THREE.PointsMaterial({
    color: 0x7a5cff,
    size: 1,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending
});

const galaxyVertices = [];
for (let i = 0; i < 2000; i++) {
    const radius = 300 + Math.random() * 200;
    const spinAngle = Math.random() * Math.PI * 2;
    const branchAngle = (i % 3) * ((Math.PI * 2) / 3);

    const x = Math.cos(branchAngle + spinAngle) * radius;
    const y = (Math.random() - 0.5) * 100;
    const z = Math.sin(branchAngle + spinAngle) * radius;

    galaxyVertices.push(x, y, z);
}

galaxyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(galaxyVertices, 3));
const galaxy = new THREE.Points(galaxyGeometry, galaxyMaterial);
scene.add(galaxy);

camera.position.z = 5;

// Mouse interaction
let mouseX = 0;
let mouseY = 0;
let targetX = 0;
let targetY = 0;

document.addEventListener('mousemove', (event) => {
    mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(event.clientY / window.innerHeight) * 2 + 1;


});


// Create new galaxies
const galaxyGeometry2 = new THREE.BufferGeometry();
const galaxyMaterial2 = new THREE.PointsMaterial({
    color: 0xf1edff,
    size: 0.8,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending
});

const galaxyVertices2 = [];
for (let i = 0; i < 100; i++) {
    const radius = 300 + Math.random() * 200;
    const spinAngle = Math.random() * Math.PI * 2;
    const branchAngle = (i % 3) * ((Math.PI * 2) / 3);

    const x = Math.cos(branchAngle + spinAngle) * radius;
    const y = (Math.random() - 0.5) * 400;
    const z = Math.sin(branchAngle + spinAngle) * radius;

    galaxyVertices2.push(x, y, z);
}

galaxyGeometry2.setAttribute('position', new THREE.Float32BufferAttribute(galaxyVertices2, 3));
const galaxy2 = new THREE.Points(galaxyGeometry2, galaxyMaterial2);
scene.add(galaxy2);

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    // Smooth mouse following
    targetX += (mouseX - targetX) * 0.05;
    targetY += (mouseY - targetY) * 0.05;

    // Rotate starfield based on mouse position
    starField.rotation.x = targetY * 0.2;
    starField.rotation.y = targetX * 0.2;

    // Rotate galaxy
    galaxy.rotation.y += 0.001;
    galaxy2.rotation.y -= 0.002


    // Move camera slightly based on mouse
    camera.position.x += (targetX * 0.5 - camera.position.x) * 0.05;
    camera.position.y += (targetY * 0.5 - camera.position.y) * 0.05;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);
}

animate();

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});



// --- مدیریت نمایش بخش‌ها ---
const sections = document.querySelectorAll(".section");
const navLinks = document.querySelectorAll(".nav-links a");
const anotherLink = document.querySelector(".cta-button");
const STORAGE_SECTION = "last_section";

// تغییر بخش
function showSection(id) {
  sections.forEach(sec => sec.style.display = "none");
  const target = document.getElementById(id);
  if (target) {
    target.style.display = "block";
    localStorage.setItem(STORAGE_SECTION, id);
  }
}

// کلیک روی منو
navLinks.forEach(link => {
  link.addEventListener("click", e => {
    e.preventDefault();
    const target = link.getAttribute("data-target");
    showSection(target);
  });
});

anotherLink.addEventListener("click" , e =>{
    e.preventDefault();
    const target = anotherLink.getAttribute("data-target");
    showSection(target);
})

// بارگذاری اولیه
window.addEventListener("DOMContentLoaded", () => {
  const last = localStorage.getItem(STORAGE_SECTION);
  if (last) {
    showSection(last);
  } else {
    showSection("home"); // اولین بار خانه نمایش داده بشه
  }
});

// Smooth scrolling
document.querySelector('.vijegi').addEventListener('click', function (e) {
    e.preventDefault();
    document.querySelector('#features').scrollIntoView({
        behavior: 'smooth'
    });
});
