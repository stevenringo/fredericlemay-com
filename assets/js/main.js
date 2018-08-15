document.addEventListener('DOMContentLoaded', () => {
  const navbarBurger = document.getElementById("navbar-burger");
  const navbarLinksMenu = document.getElementById("navbar-links-menu");
  navbarBurger.addEventListener('click', () => {
    navbarLinksMenu.classList.toggle('hidden');
  });
});