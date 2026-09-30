// Popup — login do corretor no Comandra.
const $ = (id) => document.getElementById(id);
const send = (m) => new Promise((res) => chrome.runtime.sendMessage(m, res));

function show(logged, email) {
  $("formBox").hidden = logged;
  $("loggedBox").hidden = !logged;
  if (logged) $("whoEmail").textContent = email || "";
}

async function refresh() {
  const s = await send({ type: "session" });
  show(!!(s && s.ok), s && s.email);
}

$("entrar").addEventListener("click", async () => {
  const email = $("email").value.trim().toLowerCase();
  const password = $("password").value;
  if (!email || !password) { $("msg").className = "msg err"; $("msg").textContent = "Preencha usuário e senha."; return; }
  $("msg").className = "msg"; $("msg").textContent = "Entrando…";
  const r = await send({ type: "login", email, password });
  if (r && r.ok) {
    $("msg").className = "msg ok"; $("msg").textContent = "Pronto! Abra uma conversa.";
    show(true, r.email);
  } else {
    $("msg").className = "msg err"; $("msg").textContent = (r && r.error) || "Não consegui entrar.";
  }
});

$("password").addEventListener("keydown", (e) => { if (e.key === "Enter") $("entrar").click(); });

$("sair").addEventListener("click", async () => {
  await send({ type: "logout" });
  $("msg").className = "msg"; $("msg").textContent = "Saiu.";
  show(false);
});

refresh();
