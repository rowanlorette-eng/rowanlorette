document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll(".buy-btn");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const product = button.dataset.product;
      alert(`You selected: ${product}\nPayment currency: USD ($)`);
    });
  });
});

const URL = "./my_model/";

let model, webcam, labelContainer, maxPredictions;
let running = false;

window.init = async function () {
  const modelURL = URL + "model.json";
  const metadataURL = URL + "metadata.json";

  model = await tmImage.load(modelURL, metadataURL);
  maxPredictions = model.getTotalClasses();

  const flip = true;

  webcam = new tmImage.Webcam(200, 200, flip);

  await webcam.setup();
  await webcam.play();

  running = true;

  window.requestAnimationFrame(loop);

  document.getElementById("webcam-container").innerHTML = "";
  document.getElementById("webcam-container").appendChild(webcam.canvas);

  labelContainer = document.getElementById("label-container");
  labelContainer.innerHTML = "";

  for (let i = 0; i < maxPredictions; i++) {
    labelContainer.appendChild(document.createElement("div"));
  }
};

async function loop() {
  if (!running) return;

  webcam.update();

  await predict();

  window.requestAnimationFrame(loop);
}

async function predict() {
  const prediction = await model.predict(webcam.canvas);

  for (let i = 0; i < maxPredictions; i++) {
    const classPrediction =
      prediction[i].className + ": " + prediction[i].probability.toFixed(2);

    labelContainer.childNodes[i].innerHTML = classPrediction;
  }
}

window.stopWebcam = function () {
  running = false;

  if (webcam) {
    webcam.stop();
  }

  // удаляем изображение вебки
  const webcamContainer = document.getElementById("webcam-container");
  webcamContainer.innerHTML =
    '<div class="webcam-placeholder">Camera stopped</div>';

  // очищаем предсказания
  const labelContainer = document.getElementById("label-container");
  labelContainer.innerHTML = "";
};
