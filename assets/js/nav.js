const btn = document.querySelector("[data-menu]");
const nav = document.querySelector("nav");
if (btn && nav) {
  btn.addEventListener("click", () => nav.classList.toggle("open"));
}

const page = document.body.dataset.page;
document.querySelectorAll("nav a").forEach((link) => {
  if (link.dataset.page === page) link.classList.add("active");
});
