export function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === `screen-${name}`));
  document.body.dataset.screen = name;
  const logout = document.getElementById("logoutBtn");
  if (logout) logout.hidden = name === "login" || name === "loading";
}
