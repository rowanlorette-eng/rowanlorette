document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll(".buy-btn");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const product = button.dataset.product;
      alert(`You selected: ${product}\nPayment currency: USD ($)`);
    });
  });
});

//const params = new URLSearchParams(location.search);
//let id = params.get("v");
//const video = await fetch(`/api/video/${id}`).then((r) => r.json());
