// Cấu hình Firebase cho app.
// Chạy trên máy này (localhost) thì luôn nối vào emulator với dự án giả, nên không bao giờ chạm vào sổ thật.
(function () {
  var host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    window.SO_EMULATOR = true;
    window.SO_FIREBASE_CONFIG = { apiKey: "fake-api-key", authDomain: "demo-so-cong-dau.firebaseapp.com", projectId: "demo-so-cong-dau" };
  } else {
    // TODO (Task 6): điền giá trị thật của dự án Firebase vào đây
    window.SO_FIREBASE_CONFIG = { apiKey: "TODO-TASK-6", authDomain: "TODO-TASK-6", projectId: "TODO-TASK-6" };
  }
})();
