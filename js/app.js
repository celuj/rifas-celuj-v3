"use strict";

// ==========================================
// RIFAS CELUJ V6 - PÁGINA PÚBLICA
// ==========================================
let seleccionados = new Set();
let TIPO_TALONARIO = "normal";
let CONFIG = { nequi: "3003704654", whatsapp: "3003704654" };
let unsubscribeRifa = null;
let bloqueando = false;
const MAX_SELECCIONADOS = 20;
const $ = id => document.getElementById(id);
const grid = $("grid");

// Cada modalidad utiliza una colección independiente de Firestore.
function coleccionRifa() {
  if (TIPO_TALONARIO === "mini") return "rifa_mini";
  if (TIPO_TALONARIO === "combo") return "rifa_combo";
  return "rifa_normal";
}

function normalizarTelefono(n) {
  let x = String(n || "").replace(/\D/g, "");
  if (x.startsWith("57") && x.length > 10) x = x.slice(2);
  return x;
}
function toast(m, t = "ok") {
  const x = $("toast"); if (!x) return;
  x.textContent = m; x.className = "show " + t;
  clearTimeout(window.__toast); window.__toast = setTimeout(() => x.className = "", 3500);
}
function estado(m, t = "") {
  const x = $("estadoConexion"); if (!x) return;
  x.textContent = m; x.className = "estado-conexion " + t;
}
function contador() {
  const n = seleccionados.size;
  if ($("contadorSeleccion")) $("contadorSeleccion").textContent = `${n} seleccionado${n === 1 ? "" : "s"} / ${MAX_SELECCIONADOS} máximo`;
  if ($("resumenSeleccion")) $("resumenSeleccion").textContent = n ? `🎟️ Números seleccionados: ${[...seleccionados].sort().join(", ")}` : "";
  if ($("btnReservar")) $("btnReservar").disabled = !n;
}
function crearCasilla(txt) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "numero"; b.textContent = txt; b.dataset.numero = txt;
  b.setAttribute("aria-label", `Número ${txt}`);
  b.onclick = () => seleccionar(b, txt);
  grid.appendChild(b);
}

function generarCombosPredeterminados() {
  // 50 combos: primer número 00-50 y segundo 51-99.
  // Los pares se mezclan para que no queden siempre en el mismo orden.
  const altos = Array.from({ length: 49 }, (_, i) => i + 51).sort(() => Math.random() - 0.5);
  const bajos = Array.from({ length: 51 }, (_, i) => i).sort(() => Math.random() - 0.5);
  const lista = [];
  for (let i = 0; i < 50; i++) {
    const a = String(bajos[i]).padStart(2, "0");
    const b = String(altos[i % altos.length]).padStart(2, "0");
    lista.push(`${a} - ${b}`);
  }
  return lista;
}

async function generarGrid() {
  if (unsubscribeRifa) { unsubscribeRifa(); unsubscribeRifa = null; }
  grid.innerHTML = ""; seleccionados.clear(); contador();
  if (TIPO_TALONARIO === "mini") {
    for (let i = 0; i < 10; i++) crearCasilla(String(i));
  } else if (TIPO_TALONARIO === "combo") {
    let lista = [];
    try {
      const d = await db.collection("config").doc("combos").get();
      lista = d.exists && Array.isArray(d.data().lista) && d.data().lista.length
        ? d.data().lista : generarCombosPredeterminados();
      // Si el formato anterior era incorrecto, lo sustituimos automáticamente.
      if (lista.some(x => {
        const m = String(x).match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
        return !m || +m[1] > 50 || +m[2] < 51;
      })) lista = generarCombosPredeterminados();
    } catch (e) {
      console.error(e); lista = generarCombosPredeterminados();
    }
    lista.forEach(x => crearCasilla(String(x)));
  } else {
    for (let i = 0; i < 100; i++) crearCasilla(String(i).padStart(2, "0"));
  }
  activarTiempoReal();
}
function brillo(el) {
  el.classList.remove("brillo"); void el.offsetWidth; el.classList.add("brillo");
  setTimeout(() => el.classList.remove("brillo"), 450);
}
function seleccionar(el, n) {
  if (bloqueando) return;
  if (el.classList.contains("ocupado")) { toast("❌ Ese número ya está ocupado.", "error"); brillo(el); return; }
  if (seleccionados.has(n)) { seleccionados.delete(n); el.classList.remove("seleccionado"); brillo(el); }
  else {
    if (seleccionados.size >= MAX_SELECCIONADOS) { toast(`⚠️ Puedes seleccionar máximo ${MAX_SELECCIONADOS} números.`, "error"); return; }
    seleccionados.add(n); el.classList.add("seleccionado"); brillo(el);
    // En cuanto se toca el primer número aparece el formulario.
    if (seleccionados.size === 1) mostrarFormulario();
  }
  contador();
}
function mostrarFormulario() {
  if (!seleccionados.size) { toast("Selecciona al menos un número.", "error"); return; }
  const f = $("formulario"); f.classList.remove("oculto"); f.classList.add("formulario-visible"); contador();
  requestAnimationFrame(() => { f.scrollIntoView({ behavior: "smooth", block: "start" }); setTimeout(() => $("nombre")?.focus({ preventScroll: true }), 150); });
}
function cerrarFormulario() { $("formulario").classList.add("oculto"); }
function validar() {
  const nombre = $("nombre").value.trim(), telefono = normalizarTelefono($("telefono").value);
  if (nombre.length < 2) { toast("Escribe tu nombre.", "error"); $("nombre").focus(); return null; }
  if (telefono.length < 7 || telefono.length > 10) { toast("Escribe un teléfono válido.", "error"); $("telefono").focus(); return null; }
  if (!seleccionados.size) { toast("No hay números seleccionados.", "error"); return null; }
  return { nombre, telefono };
}
function wa(nombre, numeros, tel) {
  const destino = normalizarTelefono(CONFIG.whatsapp);
  const msg = [`Hola, soy ${nombre}.`, `Reservé los números: ${numeros}.`, `Mi teléfono es: ${tel}.`, `Quedo atento para el pago.`].join("\n");
  return `https://wa.me/57${destino}?text=${encodeURIComponent(msg)}`;
}
async function confirmarReserva() {
  if (bloqueando) return;
  const datos = validar(); if (!datos) return;
  const btn = $("btnConfirmar"), original = btn.textContent; bloqueando = true; btn.disabled = true; btn.textContent = "⏳ Reservando...";
  const numeros = [...seleccionados];
  try {
    await db.runTransaction(async tx => {
      const refs = numeros.map(n => db.collection(coleccionRifa()).doc(n)), docs = [];
      for (const r of refs) docs.push(await tx.get(r));
      const ocupado = docs.find(d => d.exists);
      if (ocupado) throw new Error(`NUMERO_OCUPADO:${ocupado.id}`);
      const fecha = firebase.firestore.Timestamp.now();
      refs.forEach((r, i) => tx.set(r, { nombre: datos.nombre, telefono: datos.telefono, numero: numeros[i], fecha, pagado: false }));
    });
    const lista = [...numeros].sort().join(", "), url = wa(datos.nombre, lista, datos.telefono);
    seleccionados.clear(); document.querySelectorAll(".numero.seleccionado").forEach(e => e.classList.remove("seleccionado"));
    $("formulario").classList.add("oculto"); $("nombre").value = ""; $("telefono").value = "";
    $("resultadoTexto").textContent = `Reservaste: ${lista}. Tu reserva quedó registrada. Confirma por WhatsApp.`;
    $("btnWhatsAppReserva").href = url; $("resultadoReserva").classList.remove("oculto"); contador(); toast("✅ Reserva realizada correctamente.");
    // Navegación directa tras una acción del usuario. El botón visible queda como respaldo.
    setTimeout(() => window.location.assign(url), 180);
  } catch (e) {
    console.error("Error al reservar:", e);
    let m = "❌ No se pudo completar la reserva. Revisa tu conexión e inténtalo nuevamente.";
    if (e.message?.startsWith("NUMERO_OCUPADO:")) m = `❌ El número ${e.message.split(":")[1]} acaba de ser ocupado.`;
    else if (e.code === "permission-denied") m = "❌ Firebase rechazó la reserva por las reglas de Firestore. Revisa las reglas publicadas.";
    else if (e.code === "unavailable") m = "❌ Firebase no está disponible. Revisa tu conexión.";
    else if (e.code === "failed-precondition") m = "❌ Firestore no está listo o hay una configuración pendiente.";
    toast(m, "error");
  } finally { bloqueando = false; btn.disabled = false; btn.textContent = original; }
}
function actualizarBarra(v) { const total = document.querySelectorAll(".numero").length, p = total ? Math.min(100, Math.round(v / total * 100)) : 0; $("barra").style.width = p + "%"; $("texto-barra").textContent = `${p}% vendido (${v}/${total})`; }
function activarTiempoReal() {
  if (unsubscribeRifa) unsubscribeRifa();
  unsubscribeRifa = db.collection(coleccionRifa()).onSnapshot(s => {
    const map = new Map(); s.forEach(d => map.set(d.id, d.data()));
    document.querySelectorAll(".numero").forEach(el => {
      const d = map.get(el.dataset.numero); el.classList.remove("ocupado", "pagado");
      if (d) { el.classList.add("ocupado"); if (d.pagado === true) el.classList.add("pagado"); if (seleccionados.has(el.dataset.numero)) { seleccionados.delete(el.dataset.numero); el.classList.remove("seleccionado"); } }
    });
    contador(); actualizarBarra(s.size); estado("🟢 Conectado en tiempo real", "ok");
  }, e => { console.error(e); estado("🔴 Error de conexión", "error"); toast("No se pudo actualizar la rifa en tiempo real.", "error"); });
}
async function copiarTexto(t) {
  if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(t); return; }
  const a = document.createElement("textarea"); a.value = t; a.style.position = "fixed"; a.style.opacity = "0"; document.body.appendChild(a); a.focus(); a.select(); const ok = document.execCommand("copy"); a.remove(); if (!ok) throw new Error("No se pudo copiar");
}
async function copiarNequi() { try { await copiarTexto(CONFIG.nequi); toast(`📋 Nequi copiado: ${CONFIG.nequi}`); } catch (e) { toast(`Número Nequi: ${CONFIG.nequi}`, "error"); } }
function enviarComprobante() { const t = normalizarTelefono(CONFIG.whatsapp); if (t.length < 7) { toast("El WhatsApp no está configurado.", "error"); return; } window.location.assign(`https://wa.me/57${t}?text=${encodeURIComponent("Hola, envío comprobante de pago.")}`); }
async function cargar() {
  try {
    estado("🟡 Conectando...");
    const c = await db.collection("config").doc("datos").get(); if (c.exists) CONFIG = { ...CONFIG, ...c.data() };
    const t = await db.collection("config").doc("talonario").get(); if (t.exists) TIPO_TALONARIO = t.data().tipo || "normal";
    await generarGrid();
    const x = await db.collection("config").doc("texto").get(); if (x.exists && x.data().html) $("info-sorteo").innerHTML = x.data().html;
    estado("🟢 Conectado", "ok");
  } catch (e) { console.error(e); estado("🔴 No se pudo conectar con Firebase", "error"); toast("No se pudo cargar la rifa. Revisa tu conexión.", "error"); }
}
$("btnReservar")?.addEventListener("click", mostrarFormulario);
$("btnCancelar")?.addEventListener("click", cerrarFormulario);
$("btnConfirmar")?.addEventListener("click", confirmarReserva);
$("btnCopiarNequi")?.addEventListener("click", copiarNequi);
$("btnComprobante")?.addEventListener("click", enviarComprobante);
window.addEventListener("online", () => estado("🟢 Internet disponible", "ok"));
window.addEventListener("offline", () => { estado("🔴 Sin conexión", "error"); toast("Estás sin conexión a internet.", "error"); });
cargar();
